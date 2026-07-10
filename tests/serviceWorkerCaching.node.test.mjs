import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const serviceWorkerSource = await readFile(
  new URL('../public/sw.js', import.meta.url),
  'utf8'
)

const createHarness = ({ cachedResponse = null, cacheNames = [], fetchImpl }) => {
  const listeners = new Map()
  const putCalls = []
  const deleteCalls = []
  const deletedCacheNames = []
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
      keys: async () => cacheNames,
      delete: async (cacheName) => {
        deletedCacheNames.push(cacheName)
        return true
      },
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
    const listener = listeners.get('fetch')
    if (!listener) return null
    listener({
      request: new Request(url),
      respondWith: promise => {
        responsePromise = Promise.resolve(promise)
      },
    })
    return responsePromise ? responsePromise : null
  }

  const dispatchActivate = async () => {
    let activationPromise = null
    listeners.get('activate')({
      waitUntil: promise => {
        activationPromise = Promise.resolve(promise)
      },
    })
    await activationPromise
  }

  return { deletedCacheNames, deleteCalls, dispatchActivate, dispatchFetch, putCalls }
}

test('activation deletes previous static-asset caches without touching v5', async () => {
  const harness = createHarness({
    cacheNames: [
      'shadowchat-static-assets-v2',
      'shadowchat-static-assets-v3',
      'shadowchat-static-assets-v4',
      'shadowchat-static-assets-v5',
      'unrelated-cache',
    ],
    fetchImpl: async () => new Response('unused'),
  })

  await harness.dispatchActivate()

  assert.deepEqual(harness.deletedCacheNames, [
    'shadowchat-static-assets-v2',
    'shadowchat-static-assets-v3',
    'shadowchat-static-assets-v4',
  ])
})

test('leaves build and game assets to the browser HTTP cache', async () => {
  const fetchCalls = []
  const harness = createHarness({
    fetchImpl: async (request, init) => {
      fetchCalls.push({ request, init })
      return new Response('network asset')
    },
  })

  const buildResponse = await harness.dispatchFetch(
    'https://shadochat.online/assets/index-BeHIqrUR.js'
  )
  const gameResponse = await harness.dispatchFetch(
    'https://shadochat.online/games/shadow-runner/audio/castle-bard.mp3'
  )

  assert.equal(buildResponse, null)
  assert.equal(gameResponse, null)
  assert.equal(fetchCalls.length, 0)
  assert.equal(harness.putCalls.length, 0)
  assert.equal(harness.deleteCalls.length, 0)
})
