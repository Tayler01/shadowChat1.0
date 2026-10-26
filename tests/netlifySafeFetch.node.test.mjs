import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import {
  createPinnedLookup,
  isUnsafeIpAddress,
  normalizePublicHttpUrl,
  readLimitedArrayBuffer,
  safeFetch,
} from '../netlify/functions/_shared/safe-fetch.mjs'

const publicResolver = async () => ['93.184.216.34']

test('Netlify safeFetch normalizes public URLs and rejects credentials', () => {
  assert.equal(
    normalizePublicHttpUrl('www.example.com/image.jpg#frag').toString(),
    'https://www.example.com/image.jpg'
  )
  assert.throws(
    () => normalizePublicHttpUrl('https://user:pass@example.com/image.jpg'),
    /URL credentials are not allowed/
  )
})

test('Netlify safeFetch blocks redirect-to-private before fetching private target', async () => {
  const calls = []
  const fetchImpl = async input => {
    calls.push(String(input))
    return new Response('', {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' },
    })
  }

  await assert.rejects(
    () => safeFetch('https://example.com/image.jpg', {}, { fetchImpl, resolver: publicResolver }),
    /Private or local URLs cannot be fetched/
  )
  assert.deepEqual(calls, ['https://example.com/image.jpg'])
})

test('Netlify readLimitedArrayBuffer rejects oversized streamed bodies', async () => {
  await assert.rejects(
    () => readLimitedArrayBuffer(new Response(new Uint8Array([1, 2, 3, 4])), 3, 'Image is too large.'),
    /Image is too large/
  )
})

test('Netlify safeFetch blocks alternate loopback and address-translation forms', () => {
  for (const address of ['0:0:0:0:0:0:0:1', '0:0:0:0:0:ffff:7f00:1', '64:ff9b::a00:1', '2002:7f00:1::', '203.0.113.1']) {
    assert.equal(isUnsafeIpAddress(address), true, address)
  }
  assert.equal(isUnsafeIpAddress('2606:4700:4700::1111'), false)
})

test('pinned socket lookup returns only the vetted addresses, with no second DNS query', async () => {
  const lookup = createPinnedLookup('media.example', ['93.184.216.34', '2606:4700:4700::1111'])
  const all = await new Promise((resolve, reject) => lookup('media.example', { all: true }, (error, value) => error ? reject(error) : resolve(value)))
  assert.deepEqual(all, [{ address: '93.184.216.34', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }])
  await assert.rejects(() => new Promise((resolve, reject) => lookup('other.example', {}, (error, value) => error ? reject(error) : resolve(value))), /URL host changed/)
  assert.throws(() => createPinnedLookup('media.example', ['127.0.0.1']), /Private or local/)
})

test('the default HTTP transport pins its socket and decompresses inside the byte limit', async context => {
  let lookups = 0
  let socketOptions
  const originalBytes = Buffer.from('bounded public media')
  context.mock.method(http, 'request', (_url, options, onResponse) => {
    socketOptions = options
    const request = new EventEmitter()
    request.end = () => {
      const incoming = Readable.from([gzipSync(originalBytes)])
      incoming.statusCode = 200
      incoming.statusMessage = 'OK'
      incoming.headers = { 'content-encoding': 'gzip', 'content-type': 'image/png' }
      onResponse(incoming)
    }
    return request
  })
  const response = await safeFetch('http://media.example/file.png', {}, {
    resolver: async () => { lookups += 1; return lookups === 1 ? ['93.184.216.34'] : ['127.0.0.1'] },
  })
  assert.equal(lookups, 1)
  assert.equal(socketOptions.agent, false)
  const address = await new Promise((resolve, reject) => socketOptions.lookup('media.example', {}, (error, value) => error ? reject(error) : resolve(value)))
  assert.equal(address, '93.184.216.34')
  assert.equal(lookups, 1)
  assert.equal(response.url, 'http://media.example/file.png')
  assert.equal(Buffer.from(await readLimitedArrayBuffer(response, 1024, 'Too large.')).toString(), originalBytes.toString())
})

test('redirect responses are cancelled before the next hop', async () => {
  let cancelled = false
  const stream = new ReadableStream({ cancel() { cancelled = true } })
  const fetchImpl = async () => new Response(stream, { status: 302, headers: { location: 'http://127.0.0.1/private' } })
  await assert.rejects(() => safeFetch('https://example.com', {}, { fetchImpl, resolver: publicResolver }), /Private or local/)
  assert.equal(cancelled, true)
})
