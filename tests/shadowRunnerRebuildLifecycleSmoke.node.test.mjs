import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { allowRequest, assessPhantom, parseOptions, readDebugState, stableState, summarizeResources } from '../scripts/shadow-runner-rebuild-lifecycle-smoke.mjs'

test('requires explicit confirmed build and a loopback preview', () => {
  assert.throws(() => parseOptions([]), /confirms build/)
  assert.throws(() => parseOptions(['--build-ready=20662', '--base-url=https://shadochat.online']), /loopback/)
  assert.throws(() => parseOptions(['--build-ready=20662', '--run-name=../escape']), /directory/)
  assert.equal(parseOptions(['--build-ready=20662']).baseUrl, 'http://127.0.0.1:4176')
})

test('network policy denies every remote or mutating request', () => {
  const origin = 'http://127.0.0.1:4176'
  assert.equal(allowRequest(`${origin}/asset.png`, 'GET', origin), true)
  assert.equal(allowRequest(`${origin}/rpc`, 'POST', origin), false)
  assert.equal(allowRequest('https://example.supabase.co/rest/v1/users', 'GET', origin), false)
  assert.equal(allowRequest('http://127.0.0.1:4175/asset.png', 'GET', origin), false)
  assert.equal(allowRequest('wss://example.supabase.co/realtime', 'GET', origin), false)
})

test('frozen projection includes active clock, position, health and attack state', () => {
  const state = stableState({ levelId: 'tutorial', activeTimeMs: 12, attackId: 1, player: { x: 4, health: 90 }, deadlines: { attackUntil: 1 }, enemies: [] })
  assert.equal(state.activeTimeMs, 12)
  assert.equal(state.player.health, 90)
  assert.equal(state.attackId, 1)
  assert.equal(stableState(null), null)
})

test('phantom assessment detects paused attacks and jumps independently', () => {
  const before = { attackId: 2, player: { x: 80, y: 400 } }
  assert.deepEqual(assessPhantom(before, [{ attackId: 3, player: { x: 85, y: 350 } }]), { valid: true, attackDelta: 1, rise: 50, horizontalDrift: 5 })
  assert.deepEqual(assessPhantom(null, []), { valid: false })
})

test('teardown observation preserves stale getter evidence without stopping later cycles', () => {
  assert.deepEqual(readDebugState({}), { debugRegistered: false, debug: null, debugError: null })
  assert.deepEqual(readDebugState({ __shadowRunnerDebug: () => ({ player: { x: 1 } }) }), { debugRegistered: true, debug: { player: { x: 1 } }, debugError: null })
  const destroyed = readDebugState({ __shadowRunnerDebug: () => { throw new TypeError('Destroyed scene') } })
  assert.equal(destroyed.debugRegistered, true)
  assert.equal(destroyed.debug, null)
  assert.match(destroyed.debugError, /Destroyed scene/)
})

test('resource summary does not overwrite a real transfer size with a later aborted request', () => {
  const result = summarizeResources([{ path: '/sprite.png', bytes: 500 }, { path: '/sprite.png', bytes: 0 }, { path: '/failed.png', bytes: 0 }])
  assert.equal(result.entries, 3)
  assert.equal(result.uniquePaths, 2)
  assert.equal(result.uniqueEncodedBytes, 500)
  assert.equal(result.zeroBytePaths, 1)
})

test('script never invokes gameplay QA mutations or seeds progress', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-rebuild-lifecycle-smoke.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /__shadowRunnerQa|localStorage\.setItem|\.teleport\(|\.restore\(/)
  assert.match(source, /routeWebSocket/)
  assert.match(source, /serviceWorkers: 'block'/)
})
