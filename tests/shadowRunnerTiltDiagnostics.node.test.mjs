import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { assessContact, assessTrace, createSetupGate, installRafCap, parseOptions, sampleReadOnly, selectNearbyEnemies } from '../scripts/shadow-runner-tilt-diagnostics.mjs'

const ready = ['--browser-ready=true', '--runtime-hash=ahbG1Kyp', '--games-hash=DMsuHE_K']
const sample = (x, supported = true, bottom = 400, time = 0) => ({
  wallTime: time, activeTimeMs: time, player: { x, bodyBottom: bottom, velocityY: 0, health: 12, lives: 3 },
  tiltBridges: { activeBodyCount: 70,
    bridges: [{ id: 'bridge', left: { x: 260, y: 400 }, right: { x: 540, y: 400 }, maxSurfaceError: 0 }],
    playerSupport: supported ? { bridgeId: 'bridge', surfaceY: 400 } : null },
})

test('browser requires both explicit exclusive handoff and fresh bundle identities', () => {
  assert.throws(() => parseOptions([]), /handoff/)
  assert.throws(() => parseOptions(['--browser-ready=true']), /runtime-hash/)
  assert.throws(() => parseOptions([...ready, '--base-url=https://shadochat.online']), /loopback/)
  assert.throws(() => parseOptions([...ready, '--run-name=../overwrite']), /directory/)
  assert.throws(() => parseOptions([...ready, '--fps=15']), /FPS/)
  assert.throws(() => parseOptions([...ready, '--profiles=chromium,chromium']), /Duplicate/)
  assert.throws(() => parseOptions([...ready, '--mutation=true']), /Unknown/)
  assert.throws(() => parseOptions([...ready, '--actions=fly']), /Unknown/)
  assert.deepEqual(parseOptions([...ready, '--actions=jump']).actions, ['jump'])
  assert.deepEqual(parseOptions(ready).fps, [60, 30])
  assert.deepEqual(parseOptions(ready).profiles, ['chromium', 'webkit'])
  assert.equal(parseOptions(ready).npcIsolation, 'none')
  assert.equal(parseOptions([...ready, '--npc-isolation=nearby']).npcIsolation, 'nearby')
  assert.throws(() => parseOptions([...ready, '--npc-isolation=all']), /NPC isolation/)
})

test('contact allows only getter rounding, not a visible cap gap or phantom end support', () => {
  assert.equal(assessContact(sample(400, true, 400.5), 'bridge').contactMismatch, false)
  assert.equal(assessContact(sample(400, true, 403), 'bridge').contactMismatch, true)
  assert.equal(assessContact(sample(559), 'bridge').falseGround, true)
  assert.equal(assessContact(sample(555), 'bridge').falseGround, false)
  assert.equal(assessContact(null, 'bridge').valid, false)
})

test('walking requires literal footprint exit and rejects a former mid-deck cutoff', () => {
  const valid = [sample(400, true, 400, 0), sample(530, true, 400, 16), sample(559, false, 401, 33)]
  assert.equal(assessTrace(valid, 'bridge', 'walk-right').passed, true)
  const bad = [sample(400, true, 400, 0), sample(450, true, 400, 16), sample(460, false, 401, 33)]
  assert.equal(assessTrace(bad, 'bridge', 'walk-right').checks.noMidDeckDrop, false)
  assert.equal(assessTrace(bad, 'bridge', 'walk-right').passed, false)
  assert.equal(assessTrace(valid, 'bridge', 'walk-right').sampleCount, 3)
})

test('jump evidence requires an actual rising arc and a later confirmed re-landing', () => {
  const air = sample(400, false, 350, 16)
  air.player.velocityY = -500
  assert.equal(assessTrace([sample(400), air, sample(400, true, 400, 900)], 'bridge', 'jump').passed, true)
  assert.equal(assessTrace([sample(400), air, { ...air, wallTime: 33 }], 'bridge', 'jump').passed, false)
  assert.equal(assessTrace([sample(400), air, sample(400, true, 400, 900), sample(560, false, 401, 1200)], 'bridge', 'jump').passed, true)
  assert.equal(assessTrace([air, sample(400, true, 400, 900), sample(560, false, 401, 1200)], 'bridge', 'jump').passed, false)
})

test('damage and respawn interrupt contact evidence rather than imply a mid-deck physics defect', () => {
  const damaged = sample(460, false, 400, 33)
  damaged.player.health = 10
  const result = assessTrace([sample(400), sample(450, true, 400, 16), damaged], 'bridge', 'walk-right')
  assert.equal(result.interrupted, true)
  assert.equal(result.checks.noMidDeckDrop, null)
  assert.equal(result.passed, false)
  assert.equal(result.interruptionIndex, 2)
  const respawning = { ...sample(400, false, 400, 33), respawnPending: true }
  assert.equal(assessTrace([sample(400), sample(400), respawning], 'bridge', 'idle').interrupted, true)
})

test('body budget and missing contact evidence cannot be promoted to success', () => {
  const over = sample(400)
  over.tiltBridges.activeBodyCount = 513
  assert.equal(assessTrace([over, over, over], 'bridge', 'idle').checks.budget, false)
  assert.equal(assessTrace([], 'bridge', 'idle').passed, false)
})

test('30fps delivery cap preserves native time, sibling callbacks and cancellation', () => {
  let id = 0
  const queue = new Map()
  const window = {
    requestAnimationFrame: callback => { queue.set(++id, callback); return id },
    cancelAnimationFrame: handle => queue.delete(handle),
  }
  vm.runInNewContext(`(${installRafCap.toString()})(30)`, { window })
  const a = [], b = []
  const chain = target => timestamp => { target.push(timestamp); window.requestAnimationFrame(chain(target)) }
  window.requestAnimationFrame(chain(a))
  window.requestAnimationFrame(chain(b))
  let canceled = false
  const cancel = window.requestAnimationFrame(() => { canceled = true })
  window.cancelAnimationFrame(cancel)
  for (let frame = 0; frame < 60; frame += 1) {
    const callbacks = [...queue.values()]
    queue.clear()
    for (const callback of callbacks) callback(frame * 1000 / 60)
  }
  assert.equal(a.length, 30)
  assert.deepEqual(a, b)
  assert.equal(canceled, false)
  assert.equal(a[1], 1000 / 30)
  assert.equal(queue.size, 2)
})

test('harness never builds, changes runtime files, or invokes extra gameplay cheats', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-tilt-diagnostics.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /execFile|spawn\(|npm run build|__shadowRunnerQa\.(restore|damage|collect|move)|scene\.physics|timeScale\s*=/)
  assert.match(source, /__shadowRunnerQa\.teleport/)
  assert.match(source, /serviceWorkers: 'block'/)
  assert.match(source, /routeWebSocket/)
  assert.match(source, /flag: 'wx'/)
  assert.equal((source.match(/__shadowRunnerQa\.defeatEnemy/g) ?? []).length, 1)
  assert.equal((source.match(/__shadowRunnerQa\.teleport/g) ?? []).length, 1)
  assert.match(source, /activeDurationMs: 300/)
  assert.match(source, /settled-idle-300ms/)
})

test('NPC isolation selects live nearby positions or patrols, not all enemies', () => {
  const debug = { ...sample(400), enemies: [
    { id: 'near', alive: true, x: 600 },
    { id: 'patrol', alive: true, x: 2400, patrolLeft: 500, patrolRight: 2400 },
    { id: 'dead', alive: false, x: 400 },
    { id: 'far', alive: true, x: 4000, patrolLeft: 3900, patrolRight: 4100 },
  ] }
  assert.deepEqual(selectNearbyEnemies(debug, 'bridge').map(enemy => enemy.id), ['near', 'patrol'])
  assert.throws(() => selectNearbyEnemies(debug, 'missing'), /snapshot/)
})

test('setup gate logs before execution and rejects mutation during actions or after teleport', async () => {
  const events = []
  const gate = createSetupGate(async operation => { events.push({ executed: operation }); return 'ok' }, async event => events.push(event))
  await assert.rejects(gate.mutate('teleport', {}), /setup-only/)
  await gate.beginSetup('jump')
  await assert.rejects(gate.mutate('restore', {}), /Unauthorized/)
  await gate.mutate('defeatEnemy', { enemyId: 'archer' })
  assert.equal(events[1].event, 'mutation-request')
  assert.equal(events[2].executed, 'defeatEnemy')
  await gate.mutate('teleport', { x: 400, y: 380 })
  await assert.rejects(gate.mutate('teleport', {}), /initial teleport/)
  await assert.rejects(gate.mutate('defeatEnemy', {}), /initial teleport/)
  await gate.startAction()
  await assert.rejects(gate.mutate('defeatEnemy', {}), /setup-only/)
  await assert.rejects(gate.beginSetup('illegal'), /Finish/)
  await gate.finish()
  await gate.beginSetup('next')
  await gate.mutate('teleport', { x: 400, y: 380 })
})

test('failed audit logging prevents a QA mutation', async () => {
  let calls = 0
  const gate = createSetupGate(async () => { calls += 1 }, async event => {
    if (event.event === 'mutation-request') throw new Error('disk unavailable')
  })
  await gate.beginSetup('setup')
  await assert.rejects(gate.mutate('defeatEnemy', { enemyId: 'archer' }), /disk unavailable/)
  assert.equal(calls, 0)
})

async function fakeSampling({ gameStep = 1000 / 60, wallStep = 50, frozen = false, frames = 400, support = false, settings = {} } = {}) {
  let time = 0, gameTime = 0, sequence = 0
  const callbacks = new Map(), timers = new Map()
  const context = {
    performance: { now: () => time },
    requestAnimationFrame: callback => { callbacks.set(++sequence, callback); return sequence },
    cancelAnimationFrame: id => callbacks.delete(id),
    setTimeout: (callback, ms) => { timers.set(++sequence, { at: time + ms, callback }); return sequence },
    clearTimeout: id => timers.delete(id),
    read: () => ({ ...sample(400, support, 400, time), activeTimeMs: gameTime }),
    settings: { activeDurationMs: 1500, bridgeId: 'bridge', maxWallMs: 12000, ...settings },
  }
  const promise = vm.runInNewContext(`(${sampleReadOnly.toString()})(read, settings)`, context)
  for (let frame = 0; frame < frames && (callbacks.size || timers.size); frame += 1) {
    time += wallStep
    gameTime += gameStep
    for (const timer of [...timers.values()]) if (timer.at <= time) timer.callback()
    if (!frozen) {
      const current = [...callbacks.values()]
      callbacks.clear()
      for (const callback of current) callback(time)
    }
  }
  const result = await promise
  assert.equal(callbacks.size, 0)
  assert.equal(timers.size, 0)
  return result
}

test('jump sampling waits for 1500ms game time even with startup slow motion', async () => {
  const result = await fakeSampling()
  assert.equal(result.stopReason, 'active-duration')
  assert(result.activeElapsedMs >= 1500)
  assert(result.wallElapsedMs >= 4500)
  assert.equal(result.observedFps, 20)
})

test('wall watchdog ends a frozen RAF without fabricating completed observation', async () => {
  const result = await fakeSampling({ frozen: true })
  assert.equal(result.stopReason, 'wall-timeout')
  assert.equal(result.samples.length, 0)
  assert.equal(assessTrace([sample(400), sample(400), sample(400)], 'bridge', 'idle', result).passed, false)
})

test('placement sampling records confirmed support and keeps missing support failed', async () => {
  const settings = { activeDurationMs: 2000, stopOnSupport: true }
  assert.equal((await fakeSampling({ support: true, settings })).stopReason, 'confirmed-support')
  const missed = await fakeSampling({ settings })
  assert.equal(missed.stopReason, 'active-duration')
  assert(missed.samples.length > 100)
})
