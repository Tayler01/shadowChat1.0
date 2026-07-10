import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const serviceWorkerSource = await readFile(
  new URL('../public/sw.js', import.meta.url),
  'utf8'
)

const createHarness = ({ cachedResponse = null, fetchImpl }) => {
  const listeners = new Map()
  const putCalls = []
  const deleteCalls = []
  const cache = {
    match: async () => cachedResponse,
    put: async (request, response) => {
      putCalls.push({ request, response })
    },
    delete: async (request) => {
      deleteCalls.push(request)
      return true
    },
  }
  const context = {
    URL,
    Request,
    Response,
    Promise,
    setTimeout,
    clearTimeout,
    fetch: fetchImpl,
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
    },
    self: {
      location: { origin: 'https://shadochat.online' },
      navigator: {},
      clients: { claim: async () => undefined, matchAll: async () => [] },
      registration: { getNotifications: async () => [], showNotification: async () => undefined },
      skipWaiting: async () => undefined,
      addEventListener: (type, listener) => listeners.set(type, listener),
    },
  }

  vm.runInNewContext(serviceWorkerSource, context, { filename: 'public/sw.js' })

  const dispatchFetch = async (url) => {
    let responsePromise = null
    listeners.get('fetch')({
      request: new Request(url),
      respondWith: promise => {
        responsePromise = Promise.resolve(promise)
      },
    })
    return responsePromise ? responsePromise : null
  }

  return { deleteCalls, dispatchFetch, putCalls }
}

test('keeps content-hashed Vite assets cache-first', async () => {
  const cached = new Response('cached build')
  let fetchCalls = 0
  const harness = createHarness({
    cachedResponse: cached,
    fetchImpl: async () => {
      fetchCalls += 1
      return new Response('network build')
    },
  })

  const response = await harness.dispatchFetch(
    'https://shadochat.online/assets/index-BeHIqrUR.js'
  )

  assert.equal(await response.text(), 'cached build')
  assert.equal(fetchCalls, 0)
})

test('revalidates stable Shadow Runner assets before using cache', async () => {
  const fetchCalls = []
  const harness = createHarness({
    cachedResponse: new Response('stale game asset'),
    fetchImpl: async (request, init) => {
      fetchCalls.push({ request, init })
      return new Response('fresh game asset', { status: 200 })
    },
  })

  const response = await harness.dispatchFetch(
    'https://shadochat.online/games/shadow-runner/audio/castle-bard.mp3'
  )

  assert.equal(await response.text(), 'fresh game asset')
  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].init.cache, 'no-cache')
  assert.equal(harness.putCalls.length, 1)
})

test('uses the cached game asset only when revalidation cannot reach the network', async () => {
  const harness = createHarness({
    cachedResponse: new Response('offline game asset'),
    fetchImpl: async () => {
      throw new Error('offline')
    },
  })

  const response = await harness.dispatchFetch(
    'https://shadochat.online/games/shadow-runner/level-assets/level-1/background.webp'
  )

  assert.equal(await response.text(), 'offline game asset')
  assert.equal(harness.putCalls.length, 0)
})

test('evicts a stable cached asset when the origin confirms it no longer exists', async () => {
  const harness = createHarness({
    cachedResponse: new Response('removed game asset'),
    fetchImpl: async () => new Response('missing', { status: 404 }),
  })

  const response = await harness.dispatchFetch(
    'https://shadochat.online/games/shadow-runner/removed.png'
  )

  assert.equal(response.status, 404)
  assert.equal(harness.deleteCalls.length, 1)
})
