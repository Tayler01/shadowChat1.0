import assert from 'node:assert/strict'
import { fetchPinnedHttp } from '../supabase/functions/_shared/pinned-http.ts'
import { safeFetch } from '../supabase/functions/_shared/safe-fetch.ts'

const encode = value => new TextEncoder().encode(value)
const decode = value => new TextDecoder().decode(value)
const combine = chunks => {
  const joined = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length }
  return joined
}
const writeAll = async (socket, bytes) => {
  let offset = 0
  while (offset < bytes.length) offset += await socket.write(bytes.subarray(offset))
}
const readRequest = async socket => {
  const chunks = []
  while (true) {
    const bytes = new Uint8Array(8192)
    const count = await socket.read(bytes)
    if (count === null) return null
    chunks.push(bytes.subarray(0, count))
    const joined = combine(chunks)
    const text = decode(joined)
    const end = text.indexOf('\r\n\r\n')
    if (end < 0) continue
    const head = text.slice(0, end)
    const length = Number(/content-length:\s*(\d+)/i.exec(head)?.[1] || 0)
    if (joined.length < end + 4 + length) continue
    return { head, body: joined.subarray(end + 4, end + 4 + length) }
  }
}
const server = async (reply, tls = false) => {
  const listener = tls ? Deno.listenTls({ hostname: '127.0.0.1', port: 0,
    cert: await Deno.readTextFile(Deno.env.get('SAFE_FETCH_TEST_CERT')),
    key: await Deno.readTextFile(Deno.env.get('SAFE_FETCH_TEST_KEY')),
  }) : Deno.listen({ hostname: '127.0.0.1', port: 0 })
  const sockets = new Set()
  const jobs = new Set()
  const requests = []
  let closed = false
  let accepted = 0
  const loop = (async () => {
    try {
      for await (const socket of listener) {
        sockets.add(socket)
        accepted += 1
        const job = (async () => {
          try {
            const request = await readRequest(socket)
            if (request) { requests.push(request); await reply(socket, request) }
          } catch { /* client abort, malformed-response rejection, or TLS mismatch */ }
          finally { try { socket.close() } catch { /* already closed */ }; sockets.delete(socket) }
        })()
        jobs.add(job)
        void job.finally(() => jobs.delete(job))
      }
    } catch (error) { if (!closed) throw error }
  })()
  return {
    port: listener.addr.port, requests, get accepted() { return accepted },
    async close() {
      closed = true
      listener.close()
      for (const socket of sockets) { try { socket.close() } catch { /* already closed */ } }
      await loop
      await Promise.all([...jobs])
    },
  }
}
const transport = (fixture, init = {}, limit, host = 'fixture.example', tls = false) =>
  fetchPinnedHttp(new URL(`${tls ? 'https' : 'http'}://${host}:${fixture.port}/media?q=1`), init, ['127.0.0.1'], limit)

Deno.test('real TCP uses the supplied IP while preserving original Host, path, binary POST and response URL', async () => {
  const fixture = await server(socket => writeAll(socket, encode('HTTP/1.1 201 Created\r\nContent-Length: 4\r\n\r\ntest')))
  try {
    const response = await transport(fixture, { method: 'POST', body: new Uint8Array([0, 128, 255, 1]), headers: { authorization: 'Bearer test', host: 'wrong.invalid', 'content-length': '999' } })
    assert.equal(await response.text(), 'test')
    assert.equal(response.status, 201)
    assert.equal(response.url, `http://fixture.example:${fixture.port}/media?q=1`)
    assert.match(fixture.requests[0].head, /^POST \/media\?q=1 HTTP\/1.1/)
    assert.match(fixture.requests[0].head, new RegExp(`host: fixture.example:${fixture.port}(?:\\r\\n|$)`, 'i'))
    assert.match(fixture.requests[0].head, /content-length: 4/i)
    assert.deepEqual([...fixture.requests[0].body], [0, 128, 255, 1])
  } finally { await fixture.close() }
})

Deno.test('real TCP parses fragmented chunked framing, extensions and bounded trailers', async () => {
  const fixture = await server(async socket => {
    const response = encode('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2;part=one\r\nte\r\n2\r\nst\r\n0\r\nX-Result: complete\r\n\r\n')
    for (const byte of response) await writeAll(socket, new Uint8Array([byte]))
  })
  try { assert.equal(await (await transport(fixture)).text(), 'test') } finally { await fixture.close() }
})

for (const encoding of ['gzip', 'deflate']) {
  Deno.test(`real TCP decodes ${encoding} and applies the limit to decompressed bytes`, async () => {
    const compressed = new Uint8Array(await new Response(new Blob(['a'.repeat(128 * 1024)]).stream().pipeThrough(new CompressionStream(encoding))).arrayBuffer())
    const fixture = await server(async socket => {
      await writeAll(socket, encode(`HTTP/1.1 200 OK\r\nContent-Encoding: ${encoding}\r\nContent-Length: ${compressed.length}\r\n\r\n`))
      await writeAll(socket, compressed)
    })
    try {
      const allowed = await transport(fixture, {}, 256 * 1024)
      assert.equal(allowed.headers.get('content-length'), null)
      assert.equal((await allowed.text()).length, 128 * 1024)
      await assert.rejects(async () => (await transport(fixture, {}, 64 * 1024)).arrayBuffer(), /Decoded HTTP response exceeds/)
    } finally { await fixture.close() }
  })
}

const badResponses = [
  ['duplicate length', 'HTTP/1.1 200 OK\r\nContent-Length: 1\r\nContent-Length: 1\r\n\r\nx'],
  ['conflicting framing', 'HTTP/1.1 200 OK\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\nx'],
  ['invalid length', 'HTTP/1.1 200 OK\r\nContent-Length: +1\r\n\r\nx'],
  ['invalid transfer coding', 'HTTP/1.1 200 OK\r\nTransfer-Encoding: gzip, chunked\r\n\r\nx'],
  ['truncated body', 'HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nx'],
  ['malformed chunk', 'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n+1\r\nx\r\n0\r\n\r\n'],
  ['framing trailer', 'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0\r\nContent-Length: 1\r\n\r\n'],
  ['bare newline', 'HTTP/1.1 200 OK\nContent-Length: 1\n\nx'],
  ['oversized headers', `HTTP/1.1 200 OK\r\nX-Large: ${'x'.repeat(65536)}\r\n\r\n`],
]
for (const [name, reply] of badResponses) {
  Deno.test(`real TCP rejects ${name}`, async () => {
    const fixture = await server(socket => writeAll(socket, encode(reply)))
    try { await assert.rejects(async () => (await transport(fixture)).arrayBuffer()) } finally { await fixture.close() }
  })
}

Deno.test('real TCP enforces encoded byte caps and HEAD consumes no entity body', async () => {
  const fixture = await server(socket => writeAll(socket, encode('HTTP/1.1 200 OK\r\nContent-Length: 100000\r\n\r\n')))
  try {
    await assert.rejects(async () => (await transport(fixture, {}, 10)).text(), /byte limit/)
    const probe = await transport(fixture, {}, 10)
    assert.equal(probe.headers.get('content-length'), '100000')
    await probe.body.cancel()
    const response = await transport(fixture, { method: 'HEAD' }, 10)
    assert.equal(response.body, null)
    assert.equal(response.headers.get('content-length'), '100000')
  } finally { await fixture.close() }
})

Deno.test('unsupported compression is rejected instead of using an unbounded compatibility decoder', async () => {
  const fixture = await server(socket => writeAll(socket, encode('HTTP/1.1 200 OK\r\nContent-Encoding: br\r\nContent-Length: 4\r\n\r\ntest')))
  try { await assert.rejects(() => transport(fixture), /Unsupported HTTP content encoding/) } finally { await fixture.close() }
})

for (const phase of ['headers', 'body']) {
  Deno.test(`real TCP closes a stalled ${phase} connection on abort`, async () => {
    const fixture = await server(async socket => {
      if (phase === 'body') await writeAll(socket, encode('HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\na'))
      await socket.read(new Uint8Array(1))
    })
    try {
      await assert.rejects(async () => (await transport(fixture, { signal: AbortSignal.timeout(100) })).text(), error => ['AbortError', 'TimeoutError'].includes(error.name))
    } finally { await fixture.close() }
  })
}

Deno.test('real TLS validates the original hostname certificate on a connection pinned to another address', async () => {
  const fixture = await server(socket => writeAll(socket, encode('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok')), true)
  try {
    assert.equal(await (await transport(fixture, {}, undefined, 'fixture.example', true)).text(), 'ok')
    await assert.rejects(() => transport(fixture, {}, undefined, 'wrong.example', true), /certificate|cert|name|valid/i)
    assert.equal(fixture.requests.length, 1, 'No HTTP payload is sent after a TLS identity mismatch')
  } finally { await fixture.close() }
})

Deno.test('unsafe DNS answers are rejected before a real loopback trap receives any connection', async () => {
  const trap = await server(socket => writeAll(socket, encode('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n')))
  try {
    await assert.rejects(() => safeFetch(`http://unsafe.example:${trap.port}/`, {}, { resolver: async () => ['127.0.0.1'] }), /Private or local/)
    assert.equal(trap.accepted, 0)
  } finally { await trap.close() }
})

const publicTests = Deno.env.get('SAFE_FETCH_PUBLIC_TESTS') === 'true'
Deno.test({ name: 'public network: changing DNS answers cannot redirect the already validated socket', ignore: !publicTests, async fn() {
  const publicAddresses = await Deno.resolveDns('example.com', 'A')
  let lookups = 0
  const response = await safeFetch('http://only-the-validation-resolver-knows-this.invalid/', {}, {
    resolver: async () => ++lookups === 1 ? publicAddresses : ['127.0.0.1'],
  })
  try {
    assert.ok(response.status >= 200)
    assert.equal(lookups, 1, 'A rebinding answer must never be looked up for the socket')
    assert.match(response.url, /only-the-validation-resolver-knows-this\.invalid/)
  } finally { await response.body?.cancel() }
} })

Deno.test({ name: 'public network: real HTTPS works with normal trust and preserves original host identity', ignore: !publicTests, async fn() {
  const response = await safeFetch('https://example.com/')
  assert.equal(response.status, 200)
  assert.match(await response.text(), /Example Domain/)
} })

Deno.test({ name: 'public network: an external redirect cannot reach a real loopback trap', ignore: !publicTests, async fn() {
  const trap = await server(socket => writeAll(socket, encode('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n')))
  try {
    const destination = `https://127.0.0.1:${trap.port}/private`
    await assert.rejects(() => safeFetch(`https://httpbin.org/redirect-to?url=${encodeURIComponent(destination)}`), /Private or local/)
    assert.equal(trap.accepted, 0)
  } finally { await trap.close() }
} })
