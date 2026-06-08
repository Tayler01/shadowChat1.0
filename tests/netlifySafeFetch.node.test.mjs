import test from 'node:test'
import assert from 'node:assert/strict'
import {
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
