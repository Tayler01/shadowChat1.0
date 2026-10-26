import {
  assertPublicUrl,
  isUnsafeHostname,
  isUnsafeIpAddress,
  normalizePublicHttpUrl,
  readLimitedArrayBuffer,
  safeFetch,
} from '../supabase/functions/_shared/safe-fetch'

const publicResolver = jest.fn(async () => ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'])
const makeResponse = (
  body: string | Uint8Array = '',
  init: { status?: number; headers?: Record<string, string> } = {}
) => {
  const bytes = typeof body === 'string' ? Buffer.from(body) : Buffer.from(body)
  const headers = new Map(
    Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  )
  let consumed = false

  return {
    status: init.status ?? 200,
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    url: '',
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    body: {
      getReader: () => ({
        read: async () => {
          if (consumed) return { done: true, value: undefined }
          consumed = true
          return { done: false, value: new Uint8Array(bytes) }
        },
        cancel: async () => undefined,
      }),
    },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response
}

describe('safe fetch URL policy', () => {
  beforeEach(() => {
    publicResolver.mockClear()
  })

  it('normalizes public http URLs and rejects credentials', () => {
    expect(normalizePublicHttpUrl('www.example.com/a#section').toString()).toBe('https://www.example.com/a')
    expect(() => normalizePublicHttpUrl('https://user:pass@example.com/a')).toThrow('URL credentials are not allowed.')
    expect(() => normalizePublicHttpUrl('file:///etc/passwd')).toThrow('Only http and https URLs are supported.')
  })

  it('identifies local, private, metadata, mapped, and reserved addresses', () => {
    expect(isUnsafeHostname('localhost.')).toBe(true)
    expect(isUnsafeHostname('service.local')).toBe(true)
    expect(isUnsafeIpAddress('0.0.0.0')).toBe(true)
    expect(isUnsafeIpAddress('10.1.2.3')).toBe(true)
    expect(isUnsafeIpAddress('100.64.0.1')).toBe(true)
    expect(isUnsafeIpAddress('127.0.0.1')).toBe(true)
    expect(isUnsafeIpAddress('169.254.169.254')).toBe(true)
    expect(isUnsafeIpAddress('172.16.0.1')).toBe(true)
    expect(isUnsafeIpAddress('192.168.0.1')).toBe(true)
    expect(isUnsafeIpAddress('198.18.0.1')).toBe(true)
    expect(isUnsafeIpAddress('224.0.0.1')).toBe(true)
    expect(isUnsafeIpAddress('::1')).toBe(true)
    expect(isUnsafeIpAddress('fc00::1')).toBe(true)
    expect(isUnsafeIpAddress('fe80::1')).toBe(true)
    expect(isUnsafeIpAddress('ff02::1')).toBe(true)
    expect(isUnsafeIpAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isUnsafeIpAddress('0:0:0:0:0:0:0:1')).toBe(true)
    expect(isUnsafeIpAddress('0:0:0:0:0:ffff:7f00:1')).toBe(true)
    expect(isUnsafeIpAddress('64:ff9b::a00:1')).toBe(true)
    expect(isUnsafeIpAddress('2002:7f00:1::')).toBe(true)
    expect(isUnsafeIpAddress('203.0.113.1')).toBe(true)
    expect(isUnsafeIpAddress('2606:4700:4700::1111')).toBe(false)
    expect(isUnsafeIpAddress('93.184.216.34')).toBe(false)
  })

  it('blocks DNS answers with any unsafe address and fails closed on empty answers', async () => {
    await expect(assertPublicUrl(new URL('https://private.example'), {
      resolver: async () => ['93.184.216.34', '169.254.169.254'],
    })).rejects.toThrow('Private or local URLs cannot be fetched.')

    await expect(assertPublicUrl(new URL('https://empty.example'), {
      resolver: async () => [],
    })).rejects.toThrow('Private or local URLs cannot be fetched.')
  })

  it.each(['not-an-ip.example', '012.0.0.1', '999.1.2.3', '2606:not-ip'])('rejects non-canonical DNS addresses: %s', async address => {
    await expect(assertPublicUrl(new URL('https://example.com'), { resolver: async () => [address] })).rejects.toThrow()
  })

  it('follows redirects manually and validates each hop before fetching it', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(makeResponse('', {
        status: 302,
        headers: { location: '/next' },
      }))
      .mockResolvedValueOnce(makeResponse('ok', { status: 200 }))

    const response = await safeFetch('https://example.com/start', {}, {
      fetchImpl,
      resolver: publicResolver,
    })

    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://example.com/start')
    expect(String(fetchImpl.mock.calls[1][0])).toBe('https://example.com/next')
    expect(fetchImpl.mock.calls[0][1]).toEqual(expect.objectContaining({ redirect: 'manual' }))
  })

  it('blocks redirect targets before the unsafe destination is fetched', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(makeResponse('', {
      status: 302,
      headers: { location: 'https://127.0.0.1/admin' },
    }))

    await expect(safeFetch('https://example.com/start', {}, {
      fetchImpl,
      resolver: publicResolver,
    })).rejects.toThrow('Private or local URLs cannot be fetched.')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('enforces streamed byte limits', async () => {
    const response = makeResponse(new Uint8Array([1, 2, 3, 4]))

    await expect(readLimitedArrayBuffer(response, 3, 'Too large.')).rejects.toThrow('Too large.')
  })

  it('does not send credentials to a different redirect origin', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(makeResponse('', { status: 307, headers: { location: 'https://other.example/next' } }))
      .mockResolvedValueOnce(makeResponse('ok'))
    await safeFetch('https://example.com/', { method: 'POST', body: 'payload', headers: { authorization: 'Bearer secret', cookie: 'session=secret', 'content-type': 'text/plain' } }, { fetchImpl, resolver: publicResolver })
    const redirected = fetchImpl.mock.calls[1][1]
    expect(new Headers(redirected.headers).has('authorization')).toBe(false)
    expect(new Headers(redirected.headers).has('cookie')).toBe(false)
    expect(redirected.body).toBe('payload')
    expect(redirected.method).toBe('POST')
  })

  it('uses GET without the prior body when a POST receives a 303 redirect', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(makeResponse('', { status: 303, headers: { location: '/next' } }))
      .mockResolvedValueOnce(makeResponse('ok'))
    await safeFetch('https://example.com/', { method: 'POST', body: 'payload', headers: { 'content-type': 'text/plain' } }, { fetchImpl, resolver: publicResolver })
    expect(fetchImpl.mock.calls[1][1].method).toBe('GET')
    expect(fetchImpl.mock.calls[1][1].body).toBeUndefined()
    expect(new Headers(fetchImpl.mock.calls[1][1].headers).has('content-type')).toBe(false)
  })

  it('rejects HTTPS-to-HTTP redirects before connecting', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(makeResponse('', { status: 302, headers: { location: 'http://example.com/next' } }))
    await expect(safeFetch('https://example.com/', {}, { fetchImpl, resolver: publicResolver })).rejects.toThrow('cannot downgrade')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
