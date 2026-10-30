import assert from 'node:assert/strict'
import { buildKlipyGifUrl } from './klipy-gif-request.ts'

Deno.test('search uses v1 documented strict filter and encodes query without injecting options', () => {
  const query = 'cats & content_filter=off #? ♥'
  const url = buildKlipyGifUrl({ query, page: 2, limit: 24 }, 'synthetic/key?')
  assert.equal(url.origin, 'https://api.klipy.com')
  assert.equal(url.pathname, '/api/v1/synthetic%2Fkey%3F/gifs/search')
  assert.deepEqual([...url.searchParams], [
    ['q', query], ['per_page', '24'], ['page', '2'], ['content_filter', 'high'], ['locale', 'en-US'],
  ])
  assert.equal(url.hash, '')
})

Deno.test('trending uses the same strict filter without a search or identity parameter', () => {
  const url = buildKlipyGifUrl({ query: '', page: 1, limit: 6 }, 'synthetic-key')
  assert.equal(url.pathname, '/api/v1/synthetic-key/gifs/trending')
  assert.deepEqual([...url.searchParams], [
    ['per_page', '6'], ['page', '1'], ['content_filter', 'high'], ['locale', 'en-US'],
  ])
  for (const parameter of ['rating', 'contentfilter', 'customer_id', 'user_id', 'ip', 'device_id', 'advertising_id']) {
    assert.equal(url.searchParams.has(parameter), false)
  }
})

Deno.test('server-configured base and existing pagination are preserved', () => {
  const url = buildKlipyGifUrl({ query: 'hello', page: 25, limit: 36 }, 'synthetic-key', 'https://example.invalid///')
  assert.equal(url.origin, 'https://example.invalid')
  assert.equal(url.pathname, '/api/v1/synthetic-key/gifs/search')
  assert.equal(url.searchParams.get('page'), '25')
  assert.equal(url.searchParams.get('per_page'), '36')
  assert.equal(url.searchParams.get('content_filter'), 'high')
})
