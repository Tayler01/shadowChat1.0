type DnsResolver = (hostname: string) => Promise<string[]>
type FetchLike = (input: URL | string, init?: RequestInit) => Promise<Response>

type SafeUrlOptions = {
  credentialMessage?: string
  invalidSchemeMessage?: string
  maxLength?: number
  tooLongMessage?: string
  unsafeHostMessage?: string
  resolver?: DnsResolver
}

type SafeFetchOptions = SafeUrlOptions & {
  fetchImpl?: FetchLike
  maxRedirects?: number
}

const DEFAULT_UNSAFE_HOST_MESSAGE = 'Private or local URLs cannot be fetched.'
const DEFAULT_CREDENTIAL_MESSAGE = 'URL credentials are not allowed.'
const DEFAULT_INVALID_SCHEME_MESSAGE = 'Only http and https URLs are supported.'
const DEFAULT_TOO_LONG_MESSAGE = 'A valid URL is required.'
const DEFAULT_MAX_URL_LENGTH = 2048
const DEFAULT_MAX_REDIRECTS = 4

const normalizeHostname = (hostname: string) =>
  hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '')

const parseIpv4 = (value: string) => {
  const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return null

  const parts = match.slice(1).map(part => Number(part))
  if (parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null
  }

  return parts
}

const isUnsafeIpv4Parts = ([a, b]: number[]) => (
  a === 0 ||
  a === 10 ||
  a === 127 ||
  (a === 100 && b >= 64 && b <= 127) ||
  (a === 169 && b === 254) ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 0) ||
  (a === 192 && b === 168) ||
  (a === 198 && (b === 18 || b === 19)) ||
  a >= 224
)

const getIpv4MappedAddress = (host: string) => {
  const normalized = host.toLowerCase()
  const mappedPrefix = normalized.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(.+)$/)
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

export const isUnsafeIpAddress = (hostname: string) => {
  const host = normalizeHostname(hostname)
  const ipv4 = parseIpv4(host)
  if (ipv4) return isUnsafeIpv4Parts(ipv4)

  const mappedIpv4 = getIpv4MappedAddress(host)
  if (mappedIpv4) return isUnsafeIpv4Parts(mappedIpv4)

  if (!host.includes(':')) return false

  return (
    host === '::' ||
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    /^fe[89ab]/.test(host) ||
    host.startsWith('ff') ||
    host.startsWith('2001:db8')
  )
}

export const isUnsafeHostname = (hostname: string) => {
  const host = normalizeHostname(hostname)
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    isUnsafeIpAddress(host)
  )
}

const getDefaultResolver = (): DnsResolver => async hostname => {
  const deno = (globalThis as unknown as {
    Deno?: {
      resolveDns?: (name: string, recordType: 'A' | 'AAAA') => Promise<string[]>
    }
  }).Deno

  if (!deno?.resolveDns) return []

  const results = await Promise.allSettled([
    deno.resolveDns(hostname, 'A'),
    deno.resolveDns(hostname, 'AAAA'),
  ])
  const addresses = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  if (!addresses.length && results.some(result => result.status === 'rejected')) {
    throw new Error('Could not verify that URL host is public.')
  }
  return addresses
}

export const normalizePublicHttpUrl = (value: string | URL, options: SafeUrlOptions = {}) => {
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

export const assertPublicUrl = async (url: URL, options: SafeUrlOptions = {}) => {
  const unsafeHostMessage = options.unsafeHostMessage || DEFAULT_UNSAFE_HOST_MESSAGE
  const host = normalizeHostname(url.hostname)

  if (isUnsafeHostname(host)) {
    throw new Error(unsafeHostMessage)
  }

  if (parseIpv4(host) || host.includes(':')) {
    return
  }

  const resolver = options.resolver || getDefaultResolver()
  const addresses = await resolver(host)
  if (!addresses.length || addresses.some(address => isUnsafeIpAddress(address))) {
    throw new Error(unsafeHostMessage)
  }
}

export const safeFetch = async (
  input: URL | string,
  init: RequestInit = {},
  options: SafeFetchOptions = {}
) => {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const fetchImpl = options.fetchImpl || fetch
  let currentUrl = normalizePublicHttpUrl(input instanceof URL ? input : String(input), options)

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await assertPublicUrl(currentUrl, options)
    const response = await fetchImpl(currentUrl, {
      ...init,
      redirect: 'manual',
    })

    if (response.status < 300 || response.status >= 400) {
      const finalUrl = response.url ? normalizePublicHttpUrl(response.url, options) : currentUrl
      await assertPublicUrl(finalUrl, options)
      return response
    }

    const location = response.headers.get('location')
    if (!location) return response
    if (redirectCount >= maxRedirects) {
      throw new Error('Too many redirects while fetching URL.')
    }

    currentUrl = normalizePublicHttpUrl(new URL(location, currentUrl).toString(), options)
  }

  throw new Error('Too many redirects while fetching URL.')
}

export const readLimitedArrayBuffer = async (
  response: Response,
  maxBytes: number,
  tooLargeMessage: string
) => {
  const contentLength = Number(response.headers.get('content-length') ?? '0')
  if (contentLength > maxBytes) {
    throw new Error(tooLargeMessage)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > maxBytes) {
      throw new Error(tooLargeMessage)
    }
    return bytes
  }

  const chunks: Uint8Array[] = []
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
