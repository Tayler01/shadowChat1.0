// Supabase's Node HTTP compatibility layer does not implement custom DNS lookup.
// Connect to a checked IP directly, then use the original host for SNI/certificate
// verification. No HTTP proxy, secondary name lookup, or TLS bypass is involved.
type Socket = {
  read(buffer: Uint8Array): Promise<number | null>
  write(buffer: Uint8Array): Promise<number>
  close(): void
  handshake?: () => Promise<unknown>
}
type SocketRuntime = {
  connect(options: { hostname: string; port: number }): Promise<Socket>
  startTls(socket: Socket, options: { hostname: string }): Promise<Socket>
}

const MAX_HEADERS = 64 * 1024
const MAX_REQUEST_BYTES = 1024 * 1024
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const encoder = new TextEncoder()

export const isIpLiteral = (value: string) => {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return value.split('.').every(part => Number(part) <= 255 && (part === '0' || !part.startsWith('0')))
  if (!value.includes(':')) return false
  try { return new URL(`http://[${value}]`).hostname.startsWith('[') } catch { return false }
}

const abortReason = (signal?: AbortSignal | null) => signal?.reason || new DOMException('Request aborted.', 'AbortError')
const closeSocket = (socket?: Socket) => { try { socket?.close() } catch { /* already closed */ } }

export const withAbort = <T>(work: Promise<T>, signal?: AbortSignal | null, dispose?: (value: T) => void): Promise<T> => {
  if (!signal) return work
  return new Promise((resolve, reject) => {
    let finished = false
    const abort = () => {
      if (finished) return
      finished = true
      reject(abortReason(signal))
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    work.then(value => {
      signal.removeEventListener('abort', abort)
      if (finished) { dispose?.(value); return }
      finished = true
      resolve(value)
    }, error => {
      signal.removeEventListener('abort', abort)
      if (finished) return
      finished = true
      reject(error)
    })
  })
}

class SocketReader {
  private buffer = new Uint8Array(0)
  private offset = 0
  constructor(private socket: Socket) {}

  async bytes(maximum = 16 * 1024): Promise<Uint8Array | null> {
    if (this.offset === this.buffer.length) {
      const next = new Uint8Array(16 * 1024)
      const count = await this.socket.read(next)
      if (count === null) return null
      if (count === 0) throw new Error('Empty HTTP socket read.')
      this.buffer = next.subarray(0, count)
      this.offset = 0
    }
    const end = Math.min(this.buffer.length, this.offset + maximum)
    const result = this.buffer.subarray(this.offset, end)
    this.offset = end
    return result
  }

  async line(maximum: number): Promise<string> {
    const parts: Uint8Array[] = []
    let size = 0
    while (true) {
      const bytes = await this.bytes()
      if (!bytes) throw new Error('Truncated HTTP headers or framing.')
      const newline = bytes.indexOf(10)
      const part = newline < 0 ? bytes : bytes.subarray(0, newline + 1)
      if (newline >= 0) this.offset -= bytes.length - part.length
      size += part.length
      if (size > maximum) throw new Error('HTTP headers or framing exceed the limit.')
      parts.push(part)
      if (newline < 0) continue
      const joined = new Uint8Array(size)
      let offset = 0
      for (const chunk of parts) { joined.set(chunk, offset); offset += chunk.length }
      if (size < 2 || joined[size - 2] !== 13) throw new Error('HTTP requires CRLF framing.')
      // HTTP header octets are Latin-1, not UTF-8; preserve them without lossy decoding.
      let value = ''
      for (const byte of joined.subarray(0, -2)) value += String.fromCharCode(byte)
      return value
    }
  }
}

const checkHeaderLine = (line: string) => {
  const match = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*(.*)$/.exec(line)
  if (!match || [...match[2]].some(character => {
    const value = character.charCodeAt(0)
    return (value < 32 && value !== 9) || value === 127
  })) throw new Error('Invalid HTTP response header.')
  return [match[1].toLowerCase(), match[2].trim()] as const
}

const readResponseHeaders = async (reader: SocketReader) => {
  let used = 0
  for (let interim = 0; interim < 5; interim += 1) {
    const statusLine = await reader.line(MAX_HEADERS - used)
    used += statusLine.length + 2
    const match = /^HTTP\/1\.[01] ([1-5][0-9]{2})(?: ([\x20-\x7e]*))?$/.exec(statusLine)
    if (!match) throw new Error('Unsupported or invalid HTTP response status.')
    const status = Number(match[1])
    const fields: [string, string][] = []
    while (true) {
      const line = await reader.line(MAX_HEADERS - used)
      used += line.length + 2
      if (!line) break
      const [name, value] = checkHeaderLine(line)
      fields.push([name, value])
    }
    if (status === 101) throw new Error('HTTP protocol upgrades are not supported.')
    if (status < 200) continue
    return { status, statusText: match[2] || '', fields }
  }
  throw new Error('Too many interim HTTP responses.')
}

const serializeBody = async (body: RequestInit['body'], headers: Headers) => {
  if (body == null) return null
  let bytes: Uint8Array
  if (typeof body === 'string') {
    bytes = encoder.encode(body)
    if (!headers.has('content-type')) headers.set('content-type', 'text/plain;charset=UTF-8')
  }
  else if (body instanceof URLSearchParams) {
    bytes = encoder.encode(body.toString())
    if (!headers.has('content-type')) headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8')
  } else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body)
  else if (ArrayBuffer.isView(body)) bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  else if (body instanceof Blob) {
    if (body.size > MAX_REQUEST_BYTES) throw new Error('HTTP request body exceeds the limit.')
    bytes = new Uint8Array(await body.arrayBuffer())
    if (body.type && !headers.has('content-type')) headers.set('content-type', body.type)
  } else throw new Error('Safe HTTP fetch requires a replayable byte, text, or Blob body.')
  if (bytes.byteLength > MAX_REQUEST_BYTES) throw new Error('HTTP request body exceeds the limit.')
  return bytes
}

/** Internal transport. Callers must validate EVERY address before passing this list. */
export const fetchPinnedHttp = async (
  url: URL,
  init: RequestInit,
  addresses: readonly string[],
  maxResponseBytes = MAX_RESPONSE_BYTES,
): Promise<Response> => {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported HTTP protocol.')
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > MAX_RESPONSE_BYTES) {
    throw new Error('Invalid HTTP response size limit.')
  }
  const runtime = (globalThis as unknown as { Deno?: SocketRuntime }).Deno
  if (!runtime?.connect || !runtime.startTls) throw new Error('Pinned TCP/TLS transport is unavailable in this runtime.')
  if (!addresses.length) throw new Error('No validated HTTP destination.')
  const method = String(init.method || 'GET').toUpperCase()
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)) throw new Error('Unsupported HTTP method.')
  const headers = new Headers(init.headers)
  const body = await withAbort(serializeBody(init.body, headers), init.signal)
  if ((method === 'GET' || method === 'HEAD') && body) throw new Error('GET and HEAD requests cannot have a body.')
  for (const name of ['host', 'connection', 'content-length', 'transfer-encoding', 'proxy-authorization', 'proxy-connection', 'upgrade', 'expect']) headers.delete(name)
  headers.set('host', url.host)
  headers.set('connection', 'close')
  headers.set('accept-encoding', 'identity')
  if (body) headers.set('content-length', String(body.length))
  const requestHead = encoder.encode(`${method} ${url.pathname || '/'}${url.search} HTTP/1.1\r\n${[...headers].map(([name, value]) => `${name}: ${value}\r\n`).join('')}\r\n`)
  if (requestHead.length > MAX_HEADERS) throw new Error('HTTP request headers exceed the limit.')

  let socket: Socket | undefined
  let closed = false
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const close = () => {
    closed = true
    init.signal?.removeEventListener('abort', abort)
    // TLS may replace the TCP handle between an abort and the outer catch.
    // Always close the current handle, including that newly upgraded resource.
    closeSocket(socket)
  }
  const abort = () => {
    close()
    try { controller?.error(abortReason(init.signal)) } catch { /* stream already closed */ }
  }
  try {
    let lastError: unknown
    for (const address of addresses) {
      if (init.signal?.aborted) throw abortReason(init.signal)
      // A literal address is mandatory: never allow a failed IP attempt to trigger DNS.
      if (!isIpLiteral(address)) throw new Error('HTTP destination must be a validated IP.')
      try {
        socket = await withAbort(runtime.connect({ hostname: address, port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80) }), init.signal, closeSocket)
        break
      } catch (error) {
        if (init.signal?.aborted) throw error
        lastError = error
      }
    }
    if (!socket) throw lastError || new Error('Could not connect to the validated HTTP destination.')
    init.signal?.addEventListener('abort', abort, { once: true })
    if (init.signal?.aborted) { abort(); throw abortReason(init.signal) }
    if (url.protocol === 'https:') {
      socket = await withAbort(runtime.startTls(socket, { hostname: url.hostname.replace(/^\[|\]$/g, '') }), init.signal, closeSocket)
      if (socket.handshake) await withAbort(socket.handshake(), init.signal)
    }
    const write = async (bytes: Uint8Array) => {
      let offset = 0
      while (offset < bytes.length) {
        if (init.signal?.aborted) throw abortReason(init.signal)
        const count = await withAbort(socket!.write(bytes.subarray(offset)), init.signal)
        if (count < 1) throw new Error('HTTP socket stopped accepting the request.')
        offset += count
      }
    }
    await write(requestHead)
    if (body) await write(body)
    const reader = new SocketReader(socket)
    const { status, statusText, fields } = await withAbort(readResponseHeaders(reader), init.signal)
    const responseHeaders = new Headers(fields)
    const lengths = fields.filter(([name]) => name === 'content-length')
    const transfers = fields.filter(([name]) => name === 'transfer-encoding')
    if (lengths.length > 1 || transfers.length > 1 || (lengths.length && transfers.length)) throw new Error('Ambiguous HTTP response framing.')
    const chunked = transfers.length === 1
    if (chunked && transfers[0][1].toLowerCase() !== 'chunked') throw new Error('Unsupported HTTP transfer encoding.')
    const length = lengths[0]?.[1]
    if (length !== undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) throw new Error('Invalid HTTP content length.')
    const noBody = method === 'HEAD' || [204, 205, 304].includes(status) || length === '0'
    if (noBody) {
      close()
      const response = new Response(null, { status, statusText, headers: responseHeaders })
      Object.defineProperty(response, 'url', { value: url.toString() })
      return response
    }
    let remaining = length === undefined ? null : Number(length)
    let chunkRemaining = 0
    let chunkDelimiter = false
    let framingBytes = 0
    let received = 0
    const stream = new ReadableStream<Uint8Array>({
      start(value) { controller = value },
      async pull(value) {
        try {
          if (init.signal?.aborted) throw abortReason(init.signal)
          if (closed) { value.close(); return }
          // Metadata probes may inspect headers and cancel a large video response.
          // Reject before consuming bytes if that caller actually reads its body.
          if (length !== undefined && Number(length) > maxResponseBytes) throw new Error('HTTP response exceeds the byte limit.')
          if (chunked && chunkRemaining === 0) {
            if (chunkDelimiter && await reader.line(2) !== '') throw new Error('Invalid HTTP chunk delimiter.')
            const chunkLine = await reader.line(MAX_HEADERS - framingBytes)
            framingBytes += chunkLine.length + 2
            if (!/^[0-9a-fA-F]{1,16}(?:;[\x20-\x7e]*)?$/.test(chunkLine)) throw new Error('Invalid HTTP chunk size.')
            chunkRemaining = Number.parseInt(chunkLine.split(';')[0], 16)
            if (!Number.isSafeInteger(chunkRemaining) || chunkRemaining > maxResponseBytes - received) throw new Error('HTTP response exceeds the byte limit.')
            if (!chunkRemaining) {
              while (true) {
                const trailer = await reader.line(MAX_HEADERS - framingBytes)
                framingBytes += trailer.length + 2
                if (!trailer) break
                const [name] = checkHeaderLine(trailer)
                if (['content-length', 'transfer-encoding', 'host'].includes(name)) throw new Error('Invalid HTTP framing trailer.')
              }
              close(); value.close(); return
            }
            chunkDelimiter = true
          }
          if (remaining === 0) { close(); value.close(); return }
          const bytes = await reader.bytes(chunked ? chunkRemaining : remaining ?? 16 * 1024)
          if (!bytes) {
            if (chunked || remaining !== null) throw new Error('Truncated HTTP response body.')
            close(); value.close(); return
          }
          received += bytes.length
          if (received > maxResponseBytes) throw new Error('HTTP response exceeds the byte limit.')
          if (chunked) chunkRemaining -= bytes.length
          if (remaining !== null) remaining -= bytes.length
          value.enqueue(bytes)
        } catch (error) { close(); value.error(error) }
      },
      cancel() { close() },
    }, { highWaterMark: 0 })
    let responseBody: ReadableStream<Uint8Array> = stream
    const encoding = responseHeaders.get('content-encoding')?.toLowerCase().trim()
    if (encoding && encoding !== 'identity') {
      if (encoding !== 'gzip' && encoding !== 'deflate') throw new Error('Unsupported HTTP content encoding.')
      let decodedBytes = 0
      // SocketReader only yields slices of locally allocated ArrayBuffers.
      const byteStream = stream as ReadableStream<Uint8Array<ArrayBuffer>>
      responseBody = byteStream.pipeThrough(new DecompressionStream(encoding)).pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(bytes, output) {
          if (init.signal?.aborted) throw abortReason(init.signal)
          decodedBytes += bytes.length
          if (decodedBytes > maxResponseBytes) throw new Error('Decoded HTTP response exceeds the byte limit.')
          output.enqueue(bytes)
        },
      }))
      responseHeaders.delete('content-encoding')
      responseHeaders.delete('content-length')
    }
    responseHeaders.delete('transfer-encoding')
    const response = new Response(responseBody, { status, statusText, headers: responseHeaders })
    Object.defineProperty(response, 'url', { value: url.toString() })
    return response
  } catch (error) { close(); throw error }
}
