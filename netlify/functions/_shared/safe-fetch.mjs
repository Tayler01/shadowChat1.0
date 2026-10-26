import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'
import { createBrotliDecompress, createUnzip } from 'node:zlib'

const DEFAULT_UNSAFE_HOST_MESSAGE = 'Private or local URLs cannot be fetched.'
const DEFAULT_CREDENTIAL_MESSAGE = 'URL credentials are not allowed.'
const DEFAULT_INVALID_SCHEME_MESSAGE = 'Only http and https URLs are supported.'
const DEFAULT_TOO_LONG_MESSAGE = 'A valid URL is required.'
const DEFAULT_MAX_URL_LENGTH = 2048
const DEFAULT_MAX_REDIRECTS = 4
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

const normalizeHostname = hostname =>
  String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '')

const parseIpv4 = value => {
  const match = String(value || '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return null

  const parts = match.slice(1).map(part => Number(part))
  return parts.some(part => !Number.isInteger(part) || part < 0 || part > 255) ? null : parts
}

const isUnsafeIpv4Parts = ([a, b, c]) => (
  a === 0 ||
  a === 10 ||
  a === 127 ||
  (a === 100 && b >= 64 && b <= 127) ||
  (a === 169 && b === 254) ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 0) ||
  (a === 192 && b === 168) ||
  (a === 198 && (b === 18 || b === 19)) ||
  (a === 198 && b === 51 && c === 100) ||
  (a === 203 && b === 0 && c === 113) ||
  a >= 224
)

const getIpv4MappedAddress = host => {
  const mappedPrefix = host.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(.+)$/)
  if (!mappedPrefix) return null

  const tail = mappedPrefix[1]
  const dotted = parseIpv4(tail)
  if (dotted) return dotted

  const hexMatch = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (!hexMatch) return null

  const high = Number.parseInt(hexMatch[1], 16)
  const low = Number.parseInt(hexMatch[2], 16)
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null

  return [
    (high >> 8) & 255,
    high & 255,
    (low >> 8) & 255,
    low & 255,
  ]
}

export const isUnsafeIpAddress = hostname => {
  let host = normalizeHostname(hostname)
  if (host.includes(':')) {
    try { host = normalizeHostname(new URL(`http://[${host}]`).hostname) } catch { return true }
  }
  const ipv4 = parseIpv4(host)
  if (ipv4) return isUnsafeIpv4Parts(ipv4)

  const mappedIpv4 = getIpv4MappedAddress(host)
  if (mappedIpv4) return isUnsafeIpv4Parts(mappedIpv4)

  if (!host.includes(':')) return false

  return (
    !/^[23][0-9a-f]{3}:/.test(host) ||
    host.startsWith('2001:db8:') ||
    host.startsWith('2001:0:') ||
    host.startsWith('2001::') ||
    host.startsWith('2002:')
  )
}

export const isUnsafeHostname = hostname => {
  const host = normalizeHostname(hostname)
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    isUnsafeIpAddress(host)
  )
}

const defaultResolver = async hostname => {
  const records = await dns.lookup(hostname, { all: true, verbatim: false })
  return records.map(record => record.address)
}

export const normalizePublicHttpUrl = (value, options = {}) => {
  const raw = value instanceof URL ? value.toString() : String(value || '').trim()
  const maxLength = options.maxLength ?? DEFAULT_MAX_URL_LENGTH
  if (!raw || raw.length > maxLength) {
    throw new Error(options.tooLongMessage || DEFAULT_TOO_LONG_MESSAGE)
  }

  const withScheme = /^www\./i.test(raw) ? `https://${raw}` : raw
  const parsed = new URL(withScheme)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(options.invalidSchemeMessage || DEFAULT_INVALID_SCHEME_MESSAGE)
  }
  if (parsed.username || parsed.password) {
    throw new Error(options.credentialMessage || DEFAULT_CREDENTIAL_MESSAGE)
  }

  parsed.hash = ''
  return parsed
}

export const assertPublicUrl = async (url, options = {}) => {
  const unsafeHostMessage = options.unsafeHostMessage || DEFAULT_UNSAFE_HOST_MESSAGE
  const host = normalizeHostname(url.hostname)

  if (isUnsafeHostname(host)) {
    throw new Error(unsafeHostMessage)
  }

  if (parseIpv4(host) || host.includes(':')) {
    return [host]
  }

  const resolver = options.resolver || defaultResolver
  const addresses = await resolver(host)
  if (!addresses.length || addresses.some(address => !isIP(address) || isUnsafeIpAddress(address))) {
    throw new Error(unsafeHostMessage)
  }
  return addresses
}

export const createPinnedLookup = (hostname, addresses) => {
  const records = addresses.map(address => ({ address, family: isIP(address) }))
  if (!records.length || records.some(record => !record.family || isUnsafeIpAddress(record.address))) {
    throw new Error(DEFAULT_UNSAFE_HOST_MESSAGE)
  }
  return (requestedHostname, options, callback) => {
    if (normalizeHostname(requestedHostname) !== normalizeHostname(hostname)) {
      callback(new Error('URL host changed while connecting.'))
      return
    }
    const family = typeof options === 'number' ? options : options?.family
    const selected = records.filter(record => !family || record.family === family)
    if (!selected.length) {
      callback(new Error('URL has no approved address for this connection.'))
    } else if (options?.all) {
      callback(null, selected)
    } else {
      callback(null, selected[0].address, selected[0].family)
    }
  }
}

// The socket uses only the addresses just validated above. A second, unrelated
// DNS lookup by global fetch would reintroduce the DNS-rebinding race.
const fetchPinned = async (url, init, addresses) => {
  const method = String(init.method || 'GET').toUpperCase()
  if (!['GET', 'HEAD'].includes(method) || init.body) throw new Error('Safe media fetch supports GET and HEAD only.')
  const headers = new Headers(init.headers)
  headers.set('accept-encoding', 'identity')
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.request(url, {
      method,
      headers: Object.fromEntries(headers),
      signal: init.signal,
      agent: false,
      lookup: createPinnedLookup(url.hostname, addresses),
    }, incoming => {
      try {
        const responseHeaders = new Headers()
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value)
        }
        let stream = incoming
        const encoding = responseHeaders.get('content-encoding')?.toLowerCase()
        if (encoding && encoding !== 'identity') {
          const decoder = encoding === 'br' ? createBrotliDecompress()
            : ['gzip', 'deflate'].includes(encoding) ? createUnzip() : null
          if (!decoder) throw new Error('Unsupported media content encoding.')
          incoming.on('error', error => decoder.destroy(error))
          decoder.on('close', () => incoming.destroy())
          stream = incoming.pipe(decoder)
          responseHeaders.delete('content-encoding')
          responseHeaders.delete('content-length')
        }
        const emptyBody = method === 'HEAD' || [204, 205, 304].includes(incoming.statusCode)
        const response = new Response(emptyBody ? null : Readable.toWeb(stream), {
          status: incoming.statusCode,
          statusText: incoming.statusMessage,
          headers: responseHeaders,
        })
        if (emptyBody) incoming.resume()
        Object.defineProperty(response, 'url', { value: url.toString() })
        resolve(response)
      } catch (error) {
        incoming.destroy()
        reject(error)
      }
    })
    request.on('error', reject)
    request.end()
  })
}

export const safeFetch = async (input, init = {}, options = {}) => {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  let currentUrl = normalizePublicHttpUrl(input, options)
  const timeoutSignal = AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS)
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const addresses = await assertPublicUrl(currentUrl, options)
    const requestInit = {
      ...init,
      signal,
      redirect: 'manual',
    }
    const response = options.fetchImpl
      ? await options.fetchImpl(currentUrl, requestInit)
      : await fetchPinned(currentUrl, requestInit, addresses)

    if (response.status < 300 || response.status >= 400) {
      const finalUrl = response.url ? normalizePublicHttpUrl(response.url, options) : currentUrl
      if (finalUrl.toString() !== currentUrl.toString()) await assertPublicUrl(finalUrl, options)
      return response
    }

    const location = response.headers.get('location')
    if (!location) return response
    await response.body?.cancel().catch(() => undefined)
    if (redirectCount >= maxRedirects) {
      throw new Error('Too many redirects while fetching URL.')
    }

    currentUrl = normalizePublicHttpUrl(new URL(location, currentUrl).toString(), options)
  }

  throw new Error('Too many redirects while fetching URL.')
}

export const readLimitedArrayBuffer = async (response, maxBytes, tooLargeMessage) => {
  const contentLength = Number(response.headers.get('content-length') || '0')
  if (contentLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(tooLargeMessage)
  }

  const reader = response.body?.getReader?.()
  if (!reader) {
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > maxBytes) {
      throw new Error(tooLargeMessage)
    }
    return bytes
  }

  const chunks = []
  let received = 0

  while (true) {
    const { value, done } = await reader.read()
    if (done || !value) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error(tooLargeMessage)
    }
    chunks.push(value)
  }

  const merged = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength)
}

export const readLimitedText = async (response, maxBytes, tooLargeMessage) => {
  const buffer = await readLimitedArrayBuffer(response, maxBytes, tooLargeMessage)
  return new TextDecoder().decode(buffer)
}
