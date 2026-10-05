import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../public/games/shadow-checkers/unity/frame.js', import.meta.url), 'utf8')
const flush = () => new Promise(resolve => setImmediate(resolve))

test('camera gestures reject malformed and paused input and bound valid deltas', async () => {
  const p=await player()
  p.host('cameraGesture',{turn:.04,tilt:.02,zoomRatio:.98})
  assert.deepEqual(JSON.parse(p.calls.at(-1)[2]),{turn:.04,tilt:.02,zoomRatio:.98})
  assert.equal(p.calls.at(-1)[1],'MoveCamera')
  const count=p.calls.length
  p.host('cameraGesture',{turn:NaN});p.host('cameraGesture',{tilt:'bad'})
  assert.equal(p.calls.length,count)
  p.host('cameraGesture',{turn:100,tilt:-100,zoomRatio:0})
  assert.deepEqual(JSON.parse(p.calls.at(-1)[2]),{turn:.25,tilt:-.3,zoomRatio:.75})
  p.host('paused',true)
  const paused=p.calls.length
  p.host('cameraGesture',{turn:.04});p.host('camera','reset')
  assert.equal(p.calls.length,paused)
})

test('a refreshed host recovers ready state without replaying an old snapshot', async () => {
  const p = await player()
  p.host('snapshot', { revision: 'previous', soundEnabled: true })
  p.calls.length = 0; p.sent.length = 0
  p.host('requestReady', null)
  assert.equal(p.sent.at(-1).type, 'ready')
  assert.equal(p.calls.length, 0, 'The refreshed host must provide the current snapshot')
  p.host('snapshot', { revision: 'current', soundEnabled: false })
  assert.equal(JSON.parse(p.calls.at(-1)[2]).revision, 'current')
  p.window.emit('pagehide', { persisted: false })
  const sent = p.sent.length
  p.host('requestReady', null)
  assert.equal(p.sent.length, sent, 'A disposed player must not claim readiness')
})

test('frame forwards piece and ambience settings independently', async () => {
  const p = await player()
  p.host('snapshot', { revision: 'quiet-pieces', soundEnabled: false, ambienceEnabled: true })
  assert.deepEqual(p.audio.at(-1), [false, true, false])
  p.host('snapshot', { revision: 'master-muted', soundEnabled: false, ambienceEnabled: false })
  assert.deepEqual(p.audio.at(-1), [false, false, false])
})

test('a ready request during initialization waits for the real player', async () => {
  const p = await player({ pending: true })
  p.host('requestReady', null)
  assert.equal(p.sent.filter(event => event.type === 'ready').length, 0)
  await p.finish()
  assert.equal(p.sent.filter(event => event.type === 'ready').length, 1)
})

function target() {
  const listeners = new Map()
  return {
    addEventListener(type, callback) {
      const callbacks = listeners.get(type) || []
      callbacks.push(callback); listeners.set(type, callbacks)
    },
    emit(type, data = {}) { for (const callback of listeners.get(type) || []) callback(data) },
  }
}

async function player({ pending = false } = {}) {
  const window = target(), canvas = target(), document = target()
  const calls = [], sent = [], audio = [], gestures = []
  let quits = 0, disposals = 0, resolvePlayer
  const unity = { SendMessage: (...args) => calls.push(args), Quit: async () => { quits++ } }
  const parent = { postMessage: message => sent.push(message), Event, dispatchEvent: event => gestures.push(event.type) }
  const origin = 'https://shadow.test'
  Object.assign(canvas, { setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }) })
  Object.assign(document, {
    hidden: false, getElementById: () => canvas, createElement: () => ({}),
    body: { append: script => queueMicrotask(() => script.onload()) },
  })
  Object.assign(window, {
    createUnityInstance: () => pending ? new Promise(resolve => { resolvePlayer = resolve }) : Promise.resolve(unity),
    ShadowStudyAudio: { configure: (...args) => audio.push(args), unlock: async () => {}, play() {}, dispose: () => { disposals++ } },
  })
  runInNewContext(source, { window, document, parent, location: { origin }, fetch: async () => ({ ok: true, json: async () => ({ loaderUrl: 'build.js' }) }) })
  await flush()
  const emitReady = () => window.emit('shadow-unity-event', { detail: { type: 'ready' } })
  if (!pending) emitReady()
  return {
    window, canvas, document, calls, sent, audio, gestures,
    stats: () => ({ quits, disposals }),
    host: (type, value) => window.emit('message', { source: parent, origin, data: { version: 1, type, value } }),
    finish: async () => { emitReady(); resolvePlayer(unity); await flush() },
    pointer: type => canvas.emit(type, { pointerId: 1, isPrimary: true, button: 0, clientX: 120, clientY: 100 }),
  }
}

test('board touches synchronously unlock the host soundtrack and respect pause', async () => {
  const p = await player()
  p.pointer('pointerdown')
  assert.deepEqual(p.gestures, ['shadow-checkers-audio-gesture'])
  p.pointer('pointerup')
  assert.equal(p.gestures.length, 2)
  p.host('paused', true)
  p.pointer('pointerdown'); p.pointer('pointerup'); p.canvas.emit('keydown')
  assert.equal(p.gestures.length, 2)
})

test('a cached page suspends and resumes the same player, then requests fresh host state', async () => {
  const p = await player()
  p.host('snapshot', { revision: 'old', soundEnabled: true })
  p.pointer('pointerdown')
  p.window.emit('pagehide', { persisted: true })
  assert.deepEqual(p.stats(), { quits: 0, disposals: 0 })
  assert.deepEqual(p.calls.at(-1), ['ShadowBoard', 'SetPaused', 'true'])
  assert.deepEqual(p.audio.at(-1), [true, false, true])
  // A host visibility notification must not unpause a cached document.
  p.host('paused', false)
  assert.equal(p.calls.at(-1)[2], 'true')
  p.calls.length = 0; p.sent.length = 0
  p.window.emit('pageshow', { persisted: true })
  assert.deepEqual(p.calls, [['ShadowBoard', 'SetPaused', 'false']])
  assert.deepEqual(p.audio.at(-1), [true, false, false])
  assert.equal(p.sent.at(-1).type, 'ready')
  // A press begun before suspension must not submit a move after returning.
  p.pointer('pointerup')
  assert.equal(p.calls.filter(call => call[1] === 'ReceivePointer').length, 0)
  p.host('snapshot', { revision: 'latest', soundEnabled: true })
  assert.equal(JSON.parse(p.calls.at(-1)[2]).revision, 'latest')
  p.pointer('pointerdown'); p.pointer('pointerup')
  assert.equal(p.calls.at(-1)[1], 'ReceivePointer')
})

test('restoration retains portrait and document visibility pause gates', async () => {
  const p = await player()
  p.host('paused', true)
  p.window.emit('pagehide', { persisted: true })
  p.window.emit('pageshow', { persisted: true })
  assert.equal(p.calls.at(-1)[2], 'true')
  p.document.hidden = true; p.host('paused', false)
  assert.equal(p.calls.at(-1)[2], 'true')
  p.document.hidden = false; p.document.emit('visibilitychange')
  assert.equal(p.calls.at(-1)[2], 'false')
})

test('permanent unload releases resources once and ignores subsequent events', async () => {
  const p = await player()
  p.window.emit('pagehide', { persisted: false })
  p.window.emit('pagehide', { persisted: false })
  assert.deepEqual(p.stats(), { quits: 1, disposals: 1 })
  const count = p.calls.length, sent = p.sent.length
  p.window.emit('pageshow', { persisted: true })
  p.host('snapshot', { revision: 'late' })
  p.document.emit('visibilitychange')
  p.pointer('pointerdown'); p.pointer('pointerup')
  assert.equal(p.calls.length, count)
  assert.equal(p.sent.length, sent)
})

test('a player that finishes loading after permanent unload is released', async () => {
  const p = await player({ pending: true })
  p.window.emit('pagehide', { persisted: false })
  await p.finish()
  assert.deepEqual(p.stats(), { quits: 1, disposals: 1 })
  assert.equal(p.sent.some(event => event.type === 'ready'), false)
})

test('loading can finish while cached without enabling playback', async () => {
  const p = await player({ pending: true })
  p.window.emit('pagehide', { persisted: true })
  await p.finish()
  assert.equal(p.calls.at(-1)[2], 'true')
  assert.deepEqual(p.stats(), { quits: 0, disposals: 0 })
  p.window.emit('pageshow', { persisted: true })
  assert.equal(p.calls.at(-1)[2], 'false')
})

test('graphics failure releases audio and Unity and cannot submit stale input', async () => {
  const p = await player()
  p.pointer('pointerdown')
  p.canvas.emit('webglcontextlost')
  p.canvas.emit('webglcontextlost')
  assert.deepEqual(p.stats(), { quits: 1, disposals: 1 })
  assert.equal(p.sent.filter(event => event.type === 'error').length, 1)
  const count = p.calls.length
  p.pointer('pointerup')
  p.host('camera', 'reset')
  p.window.emit('pageshow', { persisted: true })
  assert.equal(p.calls.length, count)
})

test('graphics failure during startup releases the late instance without becoming ready', async () => {
  const p = await player({ pending: true })
  p.canvas.emit('webglcontextlost')
  await p.finish()
  assert.deepEqual(p.stats(), { quits: 1, disposals: 1 })
  assert.equal(p.sent.filter(event => event.type === 'error').length, 1)
  assert.equal(p.sent.some(event => event.type === 'ready'), false)
})
