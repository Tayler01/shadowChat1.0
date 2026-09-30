import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { decideStep, validatePolicy } from '../scripts/shadow-runner-route-proof.mjs'
import { RELAY_ROUTE_POLICIES } from '../scripts/shadow-runner-relay-route-policies.mjs'

const policy = RELAY_ROUTE_POLICIES[0]
const step = policy.steps.find(step => step.id === 'foundry-phase-cycle')
const observation = (state, extra = {}) => ({
  player: { x: step.x, y: step.y, bodyBottom: step.y, velocityY: 0 },
  phasePlatforms: [{ id: step.platformId, state }],
  windZones: [{ id: step.windZoneId, active: false, telling: false }], ...extra,
})

test('phase boarding waits for a witnessed new solid window, not stale solidity', () => {
  const memory = {}
  for (const [time, state, done] of [[0, 'solid', false], [100, 'warning', false],
    [200, 'intangible', false], [300, 'solid', true], [400, 'solid', false]]) {
    const debug = observation(state)
    const original = structuredClone(debug)
    assert.equal(decideStep(step, debug, memory, time).done, done)
    assert.deepEqual(debug, original)
  }
})

test('active wind rejects the boarding window and requires a new cycle', () => {
  const memory = {}
  decideStep(step, observation('intangible'), memory, 0)
  assert.equal(decideStep(step, observation('solid', { windZones: [{ id: step.windZoneId, active: true, telling: false }] }), memory, 100).done, false)
  assert.equal(decideStep(step, observation('solid'), memory, 200).done, false)
  decideStep(step, observation('warning'), memory, 300)
  assert.equal(decideStep(step, observation('solid'), memory, 400).done, true)
})

test('wind warning rejects a fresh phase platform instead of launching into the approaching gust', () => {
  const memory = {}
  decideStep(step, observation('intangible'), memory, 0)
  assert.equal(decideStep(step, observation('solid', {
    windZones: [{ id: step.windZoneId, active: false, telling: true }],
  }), memory, 100).done, false)
  assert.equal(decideStep(step, observation('solid'), memory, 200).done, false)
  decideStep(step, observation('intangible'), memory, 300)
  assert.equal(decideStep(step, observation('solid'), memory, 400).done, true)
  assert.throws(() => decideStep(step, observation('solid', {
    windZones: [{ id: step.windZoneId, active: false }],
  }), {}, 0), /wind readback/)
})

test('phase wait countersteers without jumping or modifying player state', () => {
  const debug = observation('solid', { player: { x: step.x + 20, bodyBottom: 616, velocityY: 0 } })
  const action = decideStep(step, debug, { previousPhase: 'intangible' }, 0)
  assert.deepEqual(action, { direction: -1, crouch: true, jump: false, attack: false, done: false })
  assert.equal(decideStep(step, observation('solid', { player: { x: step.x, bodyBottom: 600, velocityY: 0 } }),
    { previousPhase: 'intangible' }, 0).done, false)
})

test('missing observations and invalid hold targets fail closed', () => {
  for (const extra of [{ phasePlatforms: [] }, { phasePlatforms: [{ id: step.platformId, state: 'unknown' }] },
    { windZones: [] }]) assert.throws(() => decideStep(step, observation('solid', extra), {}, 0), /readback/)
  assert.equal(validatePolicy(policy), policy)
  for (const patch of [{ x: NaN }, { y: undefined }, { platformId: '' }, { windZoneId: '' }, { health: 12 }]) {
    assert.throws(() => validatePolicy({ ...policy, steps: policy.steps.map(item => item === step ? { ...step, ...patch } : item) }))
  }
})

test('Foundry road pickup confirmations stay braced during wind after natural falling collection', () => {
  for (const id of ['power-relay-chrono-foundry', 'power-relay-aether-foundry']) {
    const target = policy.steps.find(item => item.id === id)
    const flag = target.power === 'chrono' ? 'chronoActive' : 'aetherStepActive'
    assert.equal(target.crouch, true)
    for (const active of [false, true]) {
      const action = decideStep(target, { player: { x: target.x, bodyBottom: target.y, velocityY: 0, [flag]: active },
        windZones: [{ id: target.braceWindZoneId, active: true, telling: false }] }, {}, 0)
      assert.equal(action.crouch, true)
      assert.equal(action.jump, false)
      assert.equal(action.done, active)
    }
  }
  const jump = policy.steps.find(item => item.id === 'gap-07-landing')
  assert.equal(jump.airJumpDelayMs, 150, 'An early air jump adds reach without the late350ms apex')
  assert.equal(jump.crouchOnLanding, true)
  const memory = {}
  decideStep(jump, { player: { x: 6656, bodyBottom: 466, velocityY: 0 } }, memory, 0)
  assert.equal(decideStep(jump, { player: { x: 6690, bodyBottom: 400, velocityY: -300 } }, memory, 149).jump, false)
  assert.equal(decideStep(jump, { player: { x: 6695, bodyBottom: 398, velocityY: -280 } }, memory, 150).jump, true)
  assert.equal(decideStep(jump, { player: { x: 6700, bodyBottom: 370, velocityY: -400 } }, memory, 180).jump, false)
})

test('Foundry stair takeoff cannot silently drift69px during a wind wait', () => {
  const step = policy.steps.find(item => item.id === 'foundry-stair-wind-cycle')
  assert.deepEqual([step.x, step.y, step.crouch], [6504, 616, true])
  const memory = { previousWindBusy: true }
  const debug = x => ({ player: { x, bodyBottom: 616, velocityY: 0 },
    windZones: [{ id: step.zoneId, active: false, telling: false }] })
  const drift = decideStep(step, debug(6435), memory, 0)
  assert.equal(drift.done, false)
  assert.equal(drift.direction, 1)
  assert.equal(decideStep(step, debug(6504), memory, 100).done, false)
  decideStep(step, { ...debug(6504), windZones: [{ id: step.zoneId, active: true, telling: false }] }, memory, 200)
  assert.equal(decideStep(step, debug(6504), memory, 300).done, true)
})

test('the diving drone is cleared on the road before establishing stair support', async () => {
  const step = policy.steps.find(item => item.id === 'fight-relay-drone-01')
  const index = policy.steps.indexOf(step)
  assert.equal(policy.steps.filter(item => item.enemyId === step.enemyId).length, 1)
  assert.equal(policy.steps[index - 1].id, 'crawl-03-exit')
  assert.deepEqual(policy.steps.slice(index + 1, index + 7).map(item => item.id), [
    'gap-07-takeoff', 'foundry-stair-wind-cycle', 'gap-07-step', 'gap-07-step-edge',
    'foundry-exit-wind-cycle', 'gap-07-landing',
  ])
  assert.deepEqual([step.minX, step.maxX], [6410, 6504])
  assert.equal(step.crouch, true)
  assert.equal(step.jumpStrikeY, 616)
  assert.equal(step.braceWindZoneId, 'relay-wind-foundry')
  assert.equal(step.timeoutMs, 30000)
  const source = await readFile(new URL('../src/features/games/shadow-runner/game/levelTen.ts', import.meta.url), 'utf8')
  const exports = {}
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: name => {
      assert.equal(name, '../assets/manifest')
      return { SHADOW_RUNNER_ASSETS: { levels: {}, rebuild: {} } }
    } }, { timeout: 1000 })
  const level = exports.SHADOW_RUNNER_LEVEL_TEN
  const floor = level.platforms.find(item => item.id === 'relay-floor-07')
  const stair = level.platforms.find(item => item.id === 'relay-crouch-step-03')
  const roof = level.crouchGates.find(item => item.id === 'relay-crouch-foundry')
  const left = step.minX - 12 - 16.38, right = step.maxX + 12 + 16.38
  assert.equal(floor.y, 616)
  assert.ok(left > floor.x && right < floor.x + floor.width)
  assert.ok(left > roof.x + roof.width && right < stair.x, 'Whole combat band stays outside roof and stair')
  assert.ok(floor.x + floor.width - right > 140, 'Road extends beyond the fight before the lethal gap')
  const debug = { player: { x: 6499, bodyBottom: 616, velocityY: 0, y: 616 },
    enemies: [{ id: step.enemyId, alive: true, x: 6493, y: 597 }],
    windZones: [{ id: step.braceWindZoneId, active: true, telling: false }] }
  const original = structuredClone(debug)
  const action = decideStep(step, debug, { facing: -1 }, 0)
  assert.deepEqual(action, { crouch: true, direction: 0, jump: false, attack: true, done: false })
  assert.deepEqual(debug, original)
  assert.equal(decideStep(step, { ...debug, enemies: [{ ...debug.enemies[0], alive: false }] }, {}, 0).done, true)
  assert.throws(() => validatePolicy({ ...policy, steps: policy.steps.map(item => item === step
    ? { ...item, braceWindZoneId: undefined } : item) }), /cannot also request/)
})

test('drone fight countersteers on the road without chasing dives onto the stair', () => {
  const step = policy.steps.find(item => item.id === 'fight-relay-drone-01')
  for (const [x, enemyX, facing, direction] of [
    [6370, 6313, -1, 1], [6474, 6550, 1, 0], [6504, 6688, 1, 0], [6616, 6688, 1, -1],
  ]) {
    const action = decideStep(step, { player: { x, y: 616, bodyBottom: 616, velocityY: 0 },
      enemies: [{ id: step.enemyId, alive: true, x: enemyX, y: 551 }],
      windZones: [{ id: step.braceWindZoneId, active: true, telling: false }] }, { facing }, 0)
    assert.equal(action.direction, direction)
    assert.equal(action.crouch, true)
    assert.equal(action.jump, false)
    assert.equal(action.done, false)
  }
})

test('post-drone road readback is reanchored before climbing, never mistaken for stair support', () => {
  const fightIndex = policy.steps.findIndex(item => item.id === 'fight-relay-drone-01')
  const takeoff = policy.steps[fightIndex + 1]
  const wind = policy.steps[fightIndex + 2]
  const climb = policy.steps[fightIndex + 3]
  const edge = policy.steps.find(item => item.id === 'gap-07-step-edge')
  const debug = (x, y = 616, velocityY = 0) => ({ player: { x, y, bodyBottom: y, velocityY },
    windZones: [{ id: wind.zoneId, active: false, telling: false }] })
  // The failed run killed the drone at (6616, 616), then stalled at (6644, 616).
  for (const x of [6616, 6644]) {
    assert.deepEqual(decideStep(edge, debug(x), {}, 0),
      { direction: 1, crouch: true, jump: false, attack: false, done: false })
    assert.deepEqual(decideStep(takeoff, debug(x), {}, 0),
      { direction: -1, crouch: true, jump: false, attack: false, done: false })
  }
  assert.equal(decideStep(takeoff, debug(6504, 551, 611), {}, 0).done, false)
  assert.equal(decideStep(takeoff, debug(6504), {}, 0).done, true)
  const memory = {}
  assert.equal(decideStep(wind, debug(6504), memory, 0).done, false)
  decideStep(wind, { ...debug(6504), windZones: [{ id: wind.zoneId, active: true, telling: false }] }, memory, 100)
  assert.equal(decideStep(wind, debug(6616), memory, 200).done, false)
  assert.equal(decideStep(wind, debug(6504), memory, 300).done, false)
  decideStep(wind, { ...debug(6504), windZones: [{ id: wind.zoneId, active: true, telling: false }] }, memory, 320)
  assert.equal(decideStep(wind, debug(6504), memory, 350).done, true)
  const jumpMemory = {}
  assert.deepEqual(decideStep(climb, debug(6504), jumpMemory, 400),
    { direction: 0, crouch: false, jump: true, attack: false, done: false })
  assert.equal(decideStep(climb, debug(6504, 520, -300), jumpMemory, 600).direction, 0)
  assert.equal(decideStep(climb, debug(6504, 506, -280), jumpMemory, 650).direction, 1)
  assert.equal(decideStep(climb, debug(6604, 466), jumpMemory, 1500).done, true)
})

test('Foundry floor combat never releases bracing during a leftward gust', () => {
  for (const id of ['fight-relay-grenadier-01', 'fight-relay-lancer-03']) {
    const step = policy.steps.find(item => item.id === id)
    assert.equal(step.crouch, true)
    assert.equal(step.jumpStrikeY, 616)
    assert.equal(step.freshCalmJump, true)
    const debug = { player: { x: 6944, y: 616, bodyBottom: 616, velocityY: 0 },
      enemies: [{ id: step.enemyId, alive: true, x: 7120, y: 616 }],
      windZones: [{ id: step.braceWindZoneId, active: true, telling: false, direction: -1 }] }
    const action = decideStep(step, debug, {}, 0)
    assert.equal(action.direction, 1)
    assert.equal(action.crouch, true)
    assert.equal(action.jump, false)
  }
  for (const [id, x, y] of [['foundry-east-stair-wind-cycle', 7516, 616],
    ['foundry-east-exit-wind-cycle', 7660, 480]]) {
    const step = policy.steps.find(item => item.id === id)
    assert.deepEqual([step.x, step.y, step.crouch], [x, y, true])
  }
})
