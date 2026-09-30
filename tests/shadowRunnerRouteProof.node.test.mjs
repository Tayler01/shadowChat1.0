import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import {
  BUILTIN_POLICIES, RealInputDriver, assertRealInputKey, decideStep, hasCompletionEvidence,
  main, makeGuestSeed, mayRequest, observationEvents, parseArgs, readObservationInPage,
  validateBaseUrl, validatePolicy, selectPolicies, hasMasteryEvidence, assertRouteRequirements, crossingWindowReady, nextStepMemory,
} from '../scripts/shadow-runner-route-proof.mjs'
import { EXTENDED_ROUTE_POLICIES } from '../scripts/shadow-runner-route-policies.mjs'
import { OPENING_ROUTE_POLICIES } from '../scripts/shadow-runner-opening-route-policies.mjs'
import { CAUSEWAY_ROUTE_POLICIES } from '../scripts/shadow-runner-causeway-route-policies.mjs'

const player = (x, bodyBottom, velocityY = 0) => ({ x, y: bodyBottom, bodyBottom, velocityY, lives: 3, health: 12, coins: 0, score: 0 })

const arrowStep = { id: 'arrow-walk', kind: 'move', x: 800, y: 616,
  arrowDodge: { minX: 100, maxX: 900, groundY: 616 } }
const arrowDebug = (foot = 616, velocityY = 0, arrows = []) => ({
  player: { ...player(300, foot, velocityY), bodyTop: foot - 54.6, bodyLeft: 283.62, bodyRight: 316.38 },
  visibleArrows: arrows,
})
const headArrow = { left: 510, right: 532, top: 541.6, bottom: 546.93, velocityX: -640, velocityY: 0 }

test('arrow defense reacts to a visible high volley before a low arrow has arrived', () => {
  const memory = {}
  const debug = arrowDebug(616, 0, [headArrow])
  const before = structuredClone(debug)
  assert.equal(decideStep(arrowStep, debug, memory, 0).jump, true)
  assert.equal(decideStep(arrowStep, debug, memory, 20).jump, false)
  assert.equal(decideStep(arrowStep, arrowDebug(510, -300), memory, 200).direction, 0)
  const landed = decideStep(arrowStep, arrowDebug(), memory, 900)
  assert.equal(landed.jump, false)
  assert.equal(landed.direction, 1)
  assert.equal(memory.arrowHop, undefined)
  assert.deepEqual(debug, before)
})

test('arrow defense permits only one ordinary second jump against a newly visible descent threat', () => {
  const memory = { arrowHop: { airborne: true } }
  const low = { ...headArrow, left: 355, right: 377, top: 583.6, bottom: 588.93 }
  const debug = arrowDebug(560, 300, [low])
  assert.equal(decideStep(arrowStep, debug, memory, 0).jump, true)
  assert.equal(memory.arrowHop.second, true)
  assert.equal(decideStep(arrowStep, debug, memory, 100).jump, false)
})

test('arrow defense restores pickup attempt bookkeeping when it overrides an acquisition jump', () => {
  const step = { ...arrowStep, kind: 'power', x: 300, power: 'chrono', pickupId: 'chrono' }
  const debug = arrowDebug(616, 0, [headArrow])
  debug.player.chronoActive = false
  const memory = { jumpAt: -1000, collectJumps: 1 }
  assert.equal(decideStep(step, debug, memory, 0).jump, true)
  assert.equal(memory.jumpAt, -1000)
  assert.equal(memory.collectJumps, 1)
  assert.equal(decideStep(step, debug, memory, 100).done, false)
})

test('arrow defense waits for standing geometry and fails closed on missing observations', () => {
  const debug = arrowDebug()
  debug.player.crouching = true
  assert.deepEqual(decideStep(arrowStep, debug, {}, 0),
    { direction: 0, crouch: false, jump: false, attack: false, done: false })
  for (const patch of [{ visibleArrows: undefined }, { visibleArrows: [{ ...headArrow, left: NaN }] },
    { player: { ...debug.player, bodyLeft: undefined } }]) {
    assert.throws(() => decideStep(arrowStep, { ...debug, ...patch }, {}, 0), /readback|geometry|actual player body/)
  }
})

test('arrow corridor policies reject competing controls and unbounded geometry', () => {
  const base = BUILTIN_POLICIES[0]
  const policy = step => ({ ...base, steps: [step, base.steps.at(-1)] })
  assert.doesNotThrow(() => validatePolicy(policy(arrowStep)))
  for (const patch of [{ crouch: true }, { beamDodge: {} }, { braceWindZoneId: 'wind' },
    { floorHazardBounds: {} }, { y: 500 }, { arrowDodge: { ...arrowStep.arrowDodge, minX: -1 } },
    { arrowDodge: { ...arrowStep.arrowDodge, maxX: 3000 } },
    { arrowDodge: { ...arrowStep.arrowDodge, hiddenSchedule: 1 } }]) {
    assert.throws(() => validatePolicy(policy({ ...arrowStep, ...patch })), /Arrow dodge/)
  }
})

const crossing = { x: 11670, liftId: 'relay-lift-choir', topY: 310, maxRisingY: 330,
  pauseMs: 820, minPauseMs: 650 }
const crossingDebug = (activeTimeMs, y, direction, paused, pauseRemainingMs = paused ? 650 : 0) => ({ activeTimeMs,
  player: player(11670, 616), movingPlatforms: [{ id: crossing.liftId, y, direction, paused, pauseRemainingMs }] })

const beamDodge = { highId: 'high', lowId: 'low', minX: 16800, maxX: 18700, maxJumpX: 18560, groundY: 616 }
const beamStep = { id: 'beam-wait', kind: 'beam-cycle', x: 18040, y: 616, beamDodge, timeoutMs: 6000 }
const beamDebug = (activeTimeMs, high, low, foot = 616, vy = 0) => ({ activeTimeMs,
  player: player(18040, foot, vy), relayBeamZones: [{ id: 'high', state: high }, { id: 'low', state: low }] })

test('beam waiting observes fresh high-lane clearance and a supported anchor', () => {
  const memory = {}
  assert.equal(decideStep(beamStep, beamDebug(100, 'idle', 'telling'), memory, 0).done, false)
  assert.equal(decideStep(beamStep, beamDebug(200, 'active', 'idle'), memory, 100).done, false)
  assert.equal(decideStep(beamStep, beamDebug(300, 'idle', 'telling'), memory, 200).done, true)
  assert.equal(decideStep(beamStep, beamDebug(400, 'idle', 'telling'), memory, 300).done, false)
  assert.equal(memory.startedAt, 0)
  const airborne = { launchBeamState: 'active' }
  assert.equal(decideStep(beamStep, beamDebug(300, 'idle', 'telling', 560, -100), airborne, 0).done, false)
})

test('beam defense uses a delayed double jump, rejects high-lane jumps and does not complete airborne', () => {
  const memory = {}
  decideStep(beamStep, beamDebug(1000, 'active', 'idle'), memory, 0)
  decideStep(beamStep, beamDebug(1500, 'idle', 'telling'), memory, 500)
  assert.equal(decideStep(beamStep, beamDebug(1550, 'idle', 'telling'), memory, 550).jump, false)
  assert.equal(decideStep(beamStep, beamDebug(1650, 'idle', 'telling'), memory, 650).jump, true)
  assert.equal(decideStep(beamStep, beamDebug(2000, 'idle', 'telling', 500, -100), memory, 1000).jump, false)
  const second = decideStep(beamStep, beamDebug(2100, 'idle', 'active', 500, 100), memory, 1100)
  assert.equal(second.jump, true)
  assert.equal(second.done, false)
  assert.equal(decideStep(beamStep, beamDebug(2400, 'idle', 'active', 440, -200), memory, 1400).jump, false)
  decideStep(beamStep, beamDebug(3100, 'telling', 'idle'), memory, 2100)
  assert.equal(memory.dodge, undefined)
  assert.equal(decideStep(beamStep, beamDebug(3600, 'active', 'idle'), memory, 2600).jump, false)
  assert.throws(() => decideStep(beamStep, beamDebug(3500, 'active', 'idle'), memory, 2700), /monotonic/)
  assert.throws(() => decideStep(beamStep, { ...beamDebug(3700, 'idle', 'idle'), relayBeamZones: [] }, {}, 0), /live/)
})

test('guarded pickups finish only after observed acquisition at a bounded grounded arrival', () => {
  const step = { id: 'flame', kind: 'relic', x: 18680, y: 616, counter: 'objectiveItems', minCount: 4, beamDodge }
  const scene = beamDebug(1000, 'active', 'idle')
  Object.assign(scene.player, { x: 18653, objectiveItems: 3, totalObjectiveItems: 5 })
  const approach = decideStep(step, scene, {}, 0)
  assert.equal(approach.done, false)
  assert.equal(approach.crouch, false)
  scene.player.objectiveItems = 4
  assert.equal(decideStep(step, scene, {}, 0).done, true)
  assert.equal(decideStep({ ...step, beamDodge: undefined }, scene, {}, 0).done, false)
  scene.player.x = 18647
  assert.equal(decideStep(step, scene, {}, 0).done, false)
  scene.player.x = 18653
  scene.player.velocityY = 100
  assert.equal(decideStep(step, scene, {}, 0).done, false)
  scene.player.velocityY = 0
  scene.player.bodyBottom = 468
  assert.equal(decideStep(step, scene, {}, 0).done, false)
})

test('beam and earned-detour controls reject ambiguous or unbounded policy configuration', () => {
  const finish = BUILTIN_POLICIES[0].steps.at(-1)
  const base = { ...BUILTIN_POLICIES[0], steps: [beamStep, finish] }
  assert.equal(validatePolicy(base), base)
  for (const patch of [{ beamDodge: undefined }, { beamDodge: { ...beamDodge, minX: -1 } },
    { beamDodge: { ...beamDodge, highId: 'low' } }, { beamDodge: { ...beamDodge, maxX: 20000 } },
    { crouch: true }, { jumpStrikeY: 616 }, { y: 600 }]) {
    assert.throws(() => validatePolicy({ ...base, steps: [{ ...beamStep, ...patch }, finish] }))
  }
  const relic = { id: 'earned', kind: 'relic', counter: 'objectiveItems', minCount: 1, x: 100, y: 616,
    recoverySkipIfEarned: true }
  const normal = { ...base, steps: [relic, finish], requirements: { objectiveItems: 1 } }
  assert.equal(validatePolicy(normal), normal)
  assert.throws(() => validatePolicy({ ...normal, mode: 'mastery' }), /normal-only/)
  assert.throws(() => validatePolicy({ ...normal, steps: [{ ...relic, recoverySkipIfEarned: false }] }), /explicit/)
})

test('beam observations carry across adjacent guarded steps but action state and deadlines do not', () => {
  const memory = { beamAt: 1700, highState: 'idle', highClearedAt: 1500, startedAt: 0,
    attackAt: 1600, facing: 1, jumpAt: 1200, loggedRecoveryStep: true }
  const carried = nextStepMemory(beamStep, { ...beamStep, id: 'next' }, memory)
  assert.deepEqual(carried, { beamAt: 1700, highState: 'idle', highClearedAt: 1500, launchBeamState: 'idle' })
  assert.equal(memory.startedAt, 0)
  assert.deepEqual(nextStepMemory(beamStep, { id: 'unguarded' }, memory), {})
  assert.deepEqual(nextStepMemory(beamStep, { ...beamStep, beamDodge: { ...beamDodge, highId: 'other' } }, memory), {})
})

test('beam dodge retreats out of the overhead ledge footprint and keeps its airborne body stationary', () => {
  const step = { id: 'flame-approach', kind: 'move', x: 18680, y: 616, beamDodge }
  const scene = beamDebug(1500, 'idle', 'telling')
  scene.player.x = 18620
  const memory = { highClearedAt: 1480, highState: 'idle' }
  const retreat = decideStep(step, scene, memory, 0)
  assert.equal(retreat.direction, -1)
  assert.equal(retreat.jump, false)
  scene.player.x = 18540
  scene.activeTimeMs = 1700
  const launch = decideStep(step, scene, memory, 200)
  assert.equal(launch.jump, true)
  assert.equal(launch.direction, 0)
  Object.assign(scene.player, { bodyBottom: 500, velocityY: -100 })
  scene.activeTimeMs = 1850
  assert.equal(decideStep(step, scene, memory, 350).direction, 0)
})

test('relay finish uses one real attack edge after grounded readiness and never assumes completion', () => {
  const step = { id: 'relay-finish', kind: 'finish', x: 26275, y: 616 }
  const debug = { player: player(26275, 616), deliveryState: 'locked' }
  const memory = {}
  assert.equal(decideStep(step, debug, memory, 0).attack, false)
  debug.deliveryState = 'ready'
  debug.player.velocityY = -100
  assert.equal(decideStep(step, debug, memory, 100).attack, false)
  debug.player.velocityY = 0
  const before = structuredClone(debug)
  assert.deepEqual(decideStep(step, debug, memory, 200),
    { direction: 0, crouch: false, jump: false, attack: true, done: false })
  assert.deepEqual(debug, before)
  assert.equal(decideStep(step, debug, memory, 300).attack, false)
  for (const deliveryState of ['igniting', 'delivered']) {
    assert.deepEqual(decideStep(step, { ...debug, deliveryState }, memory, 500),
      { direction: 0, crouch: false, jump: false, attack: false, done: false })
  }
})

test('crossing windows require the lift direction and actual remaining pause time', () => {
  assert.equal(crossingWindowReady(crossing, crossingDebug(1450, 310, 1, true, 649), {}), false)
  assert.equal(crossingWindowReady(crossing, crossingDebug(1450, 310, 1, true, 650), {}), true)
  assert.equal(crossingWindowReady(crossing, crossingDebug(1450, 328, -1, false), {}), true)
  assert.equal(crossingWindowReady(crossing, crossingDebug(1450, 328, 1, false), {}), false)
  assert.equal(crossingWindowReady(crossing, crossingDebug(1350, 328, -1, false), {}), true)
  const memory = {}
  crossingWindowReady(crossing, crossingDebug(1370, 317, -1, false), memory)
  assert.equal(crossingWindowReady(crossing, crossingDebug(1450, 310, 1, true), memory), true)
  assert.equal(crossingWindowReady(crossing, crossingDebug(1550, 310, 1, true, 620), memory), false)
  assert.equal(crossingWindowReady(crossing, crossingDebug(1650, 311, 1, false), memory), false)
  assert.equal(memory.lastAt, 1650)
})

test('crossing windows reject missing, inconsistent or regressed live timing', () => {
  for (const debug of [{}, crossingDebug(NaN, 310, 1, true), crossingDebug(1400, 310, 0, true),
    crossingDebug(1400, 310, 1, true, 0), crossingDebug(1400, 310, 1, false, 650),
    crossingDebug(1400, 310, 1, true, NaN), crossingDebug(1400, 310, 1, true, 821),
    { ...crossingDebug(1400, 310, 1, true), movingPlatforms: [] }]) {
    assert.throws(() => crossingWindowReady(crossing, debug, {}), /live clock and lift/)
  }
  const memory = {}
  crossingWindowReady(crossing, crossingDebug(1450, 318, -1, false), memory)
  assert.throws(() => crossingWindowReady(crossing, crossingDebug(1449, 317, -1, false), memory), /clock regressed/)
})

test('a guarded jump waits with released movement and spends no attempt before a real launch', () => {
  const step = { id: 'choir-crossing', kind: 'jump', x: 11970, y: 616, fromY: 616,
    airJumpDelayMs: 350, launchWindow: crossing }
  const memory = {}
  const wait = decideStep(step, crossingDebug(1000, 450, 1, false), memory, 0)
  assert.deepEqual(wait, { direction: 0, crouch: true, jump: false, attack: false, done: false })
  assert.equal(memory.jumpAt, undefined)
  assert.equal(memory.jumpAttempts, undefined)
  const launch = decideStep(step, crossingDebug(1450, 328, -1, false), memory, 450)
  assert.equal(launch.jump, true)
  assert.equal(launch.direction, 1)
  assert.equal(launch.crouch, false)
  assert.equal(memory.startedAt, 0)
  assert.equal(memory.jumpAttempts, 1)
  const airborne = { ...crossingDebug(1800, 320, 1, false), player: player(11740, 500, -200) }
  assert.equal(decideStep(step, airborne, memory, 800).jump, true)
  assert.equal(memory.jumpAttempts, 1, 'A later bad lift reading cannot restart an airborne jump')
})

test('launch window policy fields cannot change clocks or supply unbounded timing', () => {
  const base = BUILTIN_POLICIES.find(item => item.levelId === 'level-1' && item.mode === 'normal')
  const step = { id: 'window', kind: 'jump', x: 11970, y: 616, fromY: 616, launchWindow: crossing }
  validatePolicy({ ...base, steps: [step, base.steps.at(-1)] })
  for (const patch of [{ cadenceMs: Infinity }, { pauseMs: -1 }, { minPauseMs: 900 }, { phaseStartMs: 1600 },
    { phaseEndMs: 2500 }, { x: 0 }, { liftId: '' }, { setTime: 1500 }]) {
    assert.throws(() => validatePolicy({ ...base, steps: [{ ...step, launchWindow: { ...crossing, ...patch } },
      base.steps.at(-1)] }), /Launch window/)
  }
})

test('moving sword attacks preserve the destination and only strike live nearby foes in front', () => {
  const step = { id: 'armed-approach', kind: 'move', x: 500, y: 616, crouch: true, attackEnemyIds: ['guard'] }
  const memory = {}
  const debug = (x = 340, alive = true, y = 616) => Object.freeze({ player: Object.freeze(player(300, 616)),
    enemies: Object.freeze([Object.freeze({ id: 'guard', x, y, alive })]) })
  assert.deepEqual(decideStep(step, debug(), memory, 1000),
    { direction: 1, crouch: true, jump: false, attack: true, done: false })
  assert.equal(decideStep(step, debug(), memory, 1200).attack, false)
  assert.equal(decideStep(step, debug(), memory, 1460).attack, true)
  for (const data of [debug(200), debug(420), debug(340, false), debug(340, true, 400)]) {
    assert.equal(decideStep(step, data, {}, 2000).attack, false)
  }
  assert.throws(() => decideStep(step, { player: player(300, 616), enemies: [] }, {}, 2000), /enemy missing/)
  const policy = BUILTIN_POLICIES.find(item => item.levelId === 'level-1' && item.mode === 'normal')
  for (const attackEnemyIds of [[], ['fake'], ['gate-clockwork-sentry', 'gate-clockwork-sentry'], 'guard']) {
    assert.throws(() => validatePolicy({ ...policy, steps: [{ ...step, attackEnemyIds }, policy.steps.at(-1)] }), /authored enemy IDs/)
  }
})

test('visible floor flames stop a crouched approach and permit movement only after the path clears', () => {
  const step = { id: 'fire-approach', kind: 'move', x: 6300, y: 616, crouch: true,
    floorHazardBounds: { minX: 6112, maxX: 6500, y: 616 } }
  const flame = Object.freeze({ kind: 'candle', left: 6180, right: 6220, top: 588, bottom: 616 })
  const debug = (x, hazards = [flame]) => Object.freeze({ player: Object.freeze(player(x, 616)), floorHazards: Object.freeze(hazards) })
  const memory = {}
  assert.equal(decideStep(step, debug(6140), memory, 1000).direction, 0)
  assert.equal(decideStep(step, debug(6140, []), memory, 1100).direction, 1)
  assert.equal(memory.startedAt, 1000, 'Hazard response must not extend the step deadline')
  const retreat = decideStep(step, debug(6170), {}, 1000)
  assert.deepEqual(retreat, { direction: -1, crouch: true, jump: false, attack: false, done: false })
  assert.equal(decideStep(step, debug(6230), {}, 1000).direction, 1)
  assert.equal(decideStep(step, debug(6300), {}, 1000).done, true)
  assert.throws(() => decideStep(step, { player: player(6140, 616) }, {}, 1000), /live hazard readback/)
  assert.throws(() => decideStep(step, debug(6140, [{ ...flame, left: NaN }]), {}, 1000), /Invalid visible/)
  const overhead = { ...flame, top: 400, bottom: 450 }
  assert.equal(decideStep(step, debug(6140, [overhead]), {}, 1000).direction, 1)
  const edgeFlame = { ...flame, left: 6115, right: 6145 }
  assert.equal(decideStep(step, debug(6130, [edgeFlame]), {}, 1000).direction, 1, 'Never retreat into the west pit')
  const trapped = [{ ...flame, left: 6110, right: 6505 }]
  assert.equal(decideStep(step, debug(6200, trapped), {}, 1000).direction, 0, 'No invented escape through the corridor boundary')
  const edgeThreat = [{ ...flame, left: 6145, right: 6160 }]
  assert.notEqual(decideStep(step, debug(6113.01, edgeThreat), {}, 1000).direction, -1,
    'A safe escape point is insufficient when one movement interval crosses the corridor edge')
  const policy = BUILTIN_POLICIES.find(item => item.levelId === 'level-1' && item.mode === 'normal')
  for (const changed of [{ crouch: false }, { floorHazardBounds: { minX: 6500, maxX: 6112, y: 616 } },
    { floorHazardBounds: { minX: 6100, maxX: 9000, y: 616 } }, { y: 500 },
    { floorHazardBounds: { minX: 6112, maxX: 6500, y: 616, teleport: true } }]) {
    assert.throws(() => validatePolicy({ ...policy, steps: [{ ...step, ...changed }, policy.steps.at(-1)] }), /supported corridor/)
  }
})

test('wind waits evade visible grenade markers before impact without inventing a new calm window', () => {
  const step = { id: 'guarded-wind', kind: 'wind-cycle', zoneId: 'wind', x: 22844, y: 520,
    crouch: true, anchorTolerance: 24, floorHazardBounds: { minX: 22724, maxX: 22868, y: 520 } }
  const marker = Object.freeze({ left: 22808, right: 22880, top: 502, bottom: 522 })
  const debug = (active, warnings = [marker]) => Object.freeze({ player: Object.freeze(player(22844, 520)),
    windZones: [{ id: 'wind', active, telling: false, direction: -1 }],
    floorHazards: Object.freeze([]), stormWarnings: Object.freeze(warnings) })
  const memory = {}
  assert.equal(decideStep(step, debug(true), memory, 0).direction, -1)
  const unsafeCalm = decideStep(step, debug(false), memory, 100)
  assert.deepEqual(unsafeCalm, { direction: -1, crouch: true, jump: false, attack: false, done: false })
  assert.equal(decideStep(step, debug(false, []), memory, 200).done, false)
  decideStep(step, debug(true, []), memory, 300)
  assert.equal(decideStep(step, debug(false, []), memory, 400).done, true)
  assert.equal(memory.startedAt, 0)
  for (const bad of [false, [{ ...marker, right: NaN }], [null]]) {
    assert.throws(() => decideStep(step, { ...debug(true), stormWarnings: bad }, {}, 0), /Invalid visible storm/)
  }
  const base = BUILTIN_POLICIES.find(item => item.levelId === 'level-1' && item.mode === 'normal')
  assert.doesNotThrow(() => validatePolicy({ ...base, steps: [step, base.steps.at(-1)] }))
  for (const patch of [{ y: 616 }, { x: 22900 }, { crouch: false }]) {
    assert.throws(() => validatePolicy({ ...base, steps: [{ ...step, ...patch }, base.steps.at(-1)] }), /supported corridor/)
  }
})

test('wind-braced movement runs during observed calm and crouches for the warning and gust', () => {
  const step = { id: 'wind-approach', kind: 'move', x: 7340, y: 616, crouch: true, braceWindZoneId: 'foundry-wind' }
  const memory = {}
  const debug = (active, telling) => Object.freeze({ player: Object.freeze(player(7000, 616)),
    windZones: Object.freeze([Object.freeze({ id: 'foundry-wind', active, telling })]) })
  for (const [active, telling] of [[false, false], [false, true], [true, false], [true, true]]) {
    const action = decideStep(step, debug(active, telling), memory, 1000)
    assert.equal(action.crouch, active || telling)
    assert.equal(action.direction, 1)
    assert.equal(action.jump, false)
    assert.equal(action.done, false)
  }
  assert.equal(memory.startedAt, 1000)
  for (const state of [{}, { windZones: [] }, { windZones: [{ id: 'foundry-wind', active: 'yes', telling: false }] }]) {
    assert.throws(() => decideStep(step, { player: player(7000, 616), ...state }, {}, 0), /live cycle readback/)
  }
  const policy = BUILTIN_POLICIES.find(item => item.levelId === 'level-1' && item.mode === 'normal')
  for (const changed of [{ braceWindZoneId: '' }, { braceWindZoneId: true }, { crouch: false },
    { floorHazardBounds: { minX: 6900, maxX: 7500, y: 616 } }]) {
    assert.throws(() => validatePolicy({ ...policy, steps: [{ ...step, ...changed }, policy.steps.at(-1)] }), /Wind bracing/)
  }
})

test('wind-braced jump fights launch only during live calm intervals and retain their deadline', () => {
  const step = { id: 'wind-fight', kind: 'fight', enemyId: 'drone', minX: 6410, maxX: 6504,
    jumpStrikeY: 616, crouch: true, braceWindZoneId: 'foundry-wind' }
  const memory = {}
  const debug = (active, telling, y = 616) => ({ player: player(6440, y),
    enemies: [{ id: 'drone', alive: true, x: 6470, y: 490 }],
    windZones: [{ id: 'foundry-wind', active, telling }] })
  for (const [active, telling] of [[true, false], [false, true], [true, true]]) {
    const action = decideStep(step, debug(active, telling), memory, 1000)
    assert.equal(action.crouch, true)
    assert.equal(action.jump, false)
    assert.equal(action.done, false)
  }
  assert.equal(decideStep(step, debug(false, false), memory, 1100).jump, true)
  assert.equal(decideStep(step, debug(false, false), memory, 1200).jump, false)
  const airborne = decideStep(step, debug(false, false, 500), memory, 1700)
  assert.equal(airborne.jump, false)
  assert.equal(airborne.attack, true)
  assert.equal(memory.startedAt, 1000)
  assert.throws(() => decideStep(step, { player: player(6440, 616), enemies: [] }, {}, 0), /live cycle readback/)
})

test('a missed stair on the observed Prism tilt deck walks back before retrying the original jump', () => {
  const step = { id: 'bridge-retry', kind: 'jump', x: 4684, y: 492, fromY: 616, airJumpDelayMs: 350,
    riseBeforeMoveY: 532, retryTakeoffX: 4580, retryBridgeId: 'relay-tilt-prism' }
  const memory = { startedAt: 0, jumpAt: 0, jumpAttempts: 1, takeoffX: 4591, leftGround: true, airJumped: true, clearedLip: true }
  const scene = { player: player(4677, 605, -25), tiltBridges: {
    playerSupport: { bridgeId: 'relay-tilt-prism', surfaceY: 605 },
    bridges: [{ id: 'relay-tilt-prism', left: { x: 4670, y: 610 }, right: { x: 4880, y: 598 } }],
  } }
  const original = structuredClone(scene)
  assert.deepEqual(decideStep(step, scene, memory, 2000), { direction: -1, crouch: false, jump: false, attack: false, done: false })
  assert.deepEqual(scene, original)
  assert.equal(decideStep(step, { player: player(4640, 610, 50) }, memory, 2150).direction, -1)
  const retry = decideStep(step, { player: player(4580, 616) }, memory, 2400)
  assert.equal(retry.jump, true)
  assert.equal(retry.done, false)
  assert.equal(memory.jumpAttempts, 2)
  assert.equal(memory.startedAt, 0)
  for (const changed of [
    { ...scene, tiltBridges: { ...scene.tiltBridges, playerSupport: null } },
    { ...scene, player: player(4677, 500, -300) },
    { ...scene, player: player(4790, 605, -25) },
  ]) {
    const untouched = { startedAt: 0, jumpAt: 0, jumpAttempts: 1, takeoffX: 4591, leftGround: true, airJumped: true, clearedLip: true }
    decideStep(step, changed, untouched, 2000)
    assert.equal(untouched.returningFromBridge, undefined)
  }
  const bounded = { ...memory, jumpAt: 0, leftGround: true, returningFromBridge: true }
  assert.equal(decideStep(step, { player: player(4790, 605) }, bounded, 3000).direction, 0)
  const base = BUILTIN_POLICIES.find(item => item.levelId === 'level-1' && item.mode === 'normal')
  for (const patch of [{ retryTakeoffX: undefined }, { retryBridgeId: '' }, { retryBridgeId: true }]) {
    assert.throws(() => validatePolicy({ ...base, steps: [{ ...step, ...patch }, base.steps.at(-1)] }), /Bridge retry/)
  }
})

test('bridge walk-back followed by shelf recovery clears the return flag before the next landing', () => {
  const step = { id: 'bridge-shelf-retry', kind: 'jump', x: 4684, y: 492, fromY: 616, airJumpDelayMs: 350,
    riseBeforeMoveY: 532, retryTakeoffX: 4580, retryBridgeId: 'relay-tilt-prism',
    recoveryShelf: { minX: 4670, maxX: 4880, y: 674, returnX: 4580 } }
  const observe = (x, y, velocityY = 0) => ({ player: player(x, y, velocityY) })
  for (const jumpAttempts of [1, 2]) {
    const memory = { startedAt: 0, jumpAt: 0, jumpAttempts, takeoffX: 4580,
      leftGround: true, airJumped: true, clearedLip: true }
    const bridge = { ...observe(4677, 605, -25), tiltBridges: {
      playerSupport: { bridgeId: 'relay-tilt-prism', surfaceY: 605 },
      bridges: [{ id: 'relay-tilt-prism', left: { x: 4670, y: 610 }, right: { x: 4880, y: 598 } }],
    } }
    assert.equal(decideStep(step, bridge, memory, 2000).direction, -1)
    assert.equal(memory.returningFromBridge, true)
    const recovery = decideStep(step, observe(4670, 674), memory, 2150)
    assert.equal(recovery.jump, true)
    assert.equal(recovery.done, false)
    decideStep(step, observe(4620, 580, -100), memory, 2300)
    assert.equal(decideStep(step, observe(4594, 616), memory, 2650).done, false)
    assert.equal(memory.shelfRecovery, undefined)
    assert.equal(memory.returningFromBridge, false)
    assert.equal(memory.jumpAttempts, jumpAttempts, 'Shelf return must not reset the main attempt counter')
    const retry = decideStep(step, observe(4594, 616), memory, 2700)
    assert.equal(retry.jump, true)
    assert.equal(retry.done, false)
    assert.equal(memory.jumpAttempts, jumpAttempts + 1)
    assert.equal(decideStep(step, observe(4594, 540, -200), memory, 2850).done, false)
    const landed = decideStep(step, observe(4684, 492), memory, 3300)
    assert.equal(landed.done, true, 'A valid landing after 600 ms must not restart bridge walk-back')
    assert.equal(landed.direction, 0)
    assert.equal(memory.startedAt, 0, 'Combined recovery must retain the original step deadline')
    assert.equal(memory.shelfRecoveries, 1)
  }
})

test('a missed stair may jump back from its authored recovery shelf but never count recovery as completion', () => {
  const step = { id: 'recoverable-stair', kind: 'jump', x: 4684, y: 492, fromY: 616, riseBeforeMoveY: 532,
    recoveryShelf: { minX: 4670, maxX: 4880, y: 674, returnX: 4580 } }
  const memory = {}
  const observe = (x, y, velocityY = 0) => Object.freeze({ player: Object.freeze(player(x, y, velocityY)) })
  assert.equal(decideStep(step, observe(4580, 616), memory, 0).jump, true)
  decideStep(step, observe(4630, 532, 80), memory, 300)
  const recovery = decideStep(step, observe(4676, 674), memory, 900)
  assert.equal(recovery.jump, true)
  assert.equal(recovery.direction, -1)
  assert.equal(recovery.done, false)
  decideStep(step, observe(4630, 600, -100), memory, 1150)
  assert.equal(decideStep(step, observe(4580, 616), memory, 1500).done, false)
  assert.equal(memory.startedAt, 0)
  assert.equal(memory.shelfRecoveries, 1)
  assert.equal(memory.shelfRecovery, undefined)
  assert.equal(decideStep(step, observe(4580, 616), memory, 1600).jump, true)
  assert.equal(memory.jumpAttempts, 2)
  decideStep(step, observe(4640, 490, -10), memory, 1800)
  assert.equal(decideStep(step, observe(4684, 492), memory, 2000).done, true)
  for (const x of [4660, 4890]) {
    const state = { startedAt: 0, jumpAt: 0, leftGround: true, takeoffX: 4580, jumpAttempts: 1 }
    assert.equal(decideStep(step, observe(x, 674), state, 1000).jump, false)
    assert.equal(state.shelfRecovery, undefined)
  }
  const exhausted = { startedAt: 0, jumpAt: 0, leftGround: true, takeoffX: 4580, jumpAttempts: 3 }
  assert.equal(decideStep(step, observe(4676, 674), exhausted, 1000).jump, false)
  const active = { startedAt: 0, jumpAt: 0, leftGround: true, takeoffX: 4580, jumpAttempts: 1 }
  decideStep(step, observe(4676, 674), active, 1000)
  decideStep(step, observe(4670, 630, -100), active, 1200)
  const outside = decideStep(step, observe(4660, 674), active, 1800)
  assert.equal(outside.jump, false, 'An active recovery cannot rearm outside the authored shelf')
  assert.equal(outside.direction, 0)
  assert.equal(active.shelfRecovery.jumpAttempts, 1)
  const policy = BUILTIN_POLICIES.find(item => item.levelId === 'level-1' && item.mode === 'normal')
  for (const recoveryShelf of [{ ...step.recoveryShelf, y: 900 }, { ...step.recoveryShelf, returnX: 100 },
    { ...step.recoveryShelf, minX: NaN }, { ...step.recoveryShelf, health: 12 }]) {
    assert.throws(() => validatePolicy({ ...policy, steps: [{ ...step, recoveryShelf }, policy.steps.at(-1)] }), /Recovery shelf/)
  }
})

test('built-in policies key the rebuilt opening without replacing L1 normal', () => {
  assert.deepEqual(BUILTIN_POLICIES.map(policy => `${validatePolicy(policy).levelId}/${policy.mode}`).sort(),
    ['level-1/mastery', 'level-1/normal', 'tutorial/mastery', 'tutorial/normal'])
  const levelOne = BUILTIN_POLICIES.find(policy => policy.levelId === 'level-1' && policy.mode === 'normal')
  assert.deepEqual(levelOne.steps.filter(step => step.kind === 'fight').map(step => step.enemyId),
    ['gate-clockwork-sentry', 'courtyard-clockwork-sentry'])
  assert.deepEqual(levelOne.steps.map(step => step.id), ['west-edge', 'broken-step-a', 'broken-step-b', 'center-walkway',
    'first-sentry', 'spike-approach', 'courtyard', 'courtyard-edge', 'final-walkway', 'second-sentry', 'east-gate'])
  assert.deepEqual(levelOne.steps.at(-1), { id: 'east-gate', kind: 'finish', x: 2794, y: 432 })
  for (const opening of OPENING_ROUTE_POLICIES) {
    assert.equal(BUILTIN_POLICIES.find(policy => policy.levelId === opening.levelId && policy.mode === opening.mode), opening)
  }
})

test('only loopback4176 plain HTTP origins are accepted', () => {
  for (const url of ['http://127.0.0.1:4176', 'http://localhost:4176/', 'http://[::1]:4176']) assert.ok(validateBaseUrl(url))
  for (const url of ['https://shadochat.online', 'http://127.0.0.1:4174', 'http://127.0.0.1.evil:4176',
    'http://localhost:4176/path', 'http://name@localhost:4176', 'http://localhost:4176/?token=x']) {
    assert.throws(() => validateBaseUrl(url))
  }
})

test('CLI bounds time, attempts, output names, route IDs and input mode', () => {
  assert.equal(parseArgs(['--dry-run']).dryRun, true)
  assert.deepEqual(parseArgs(['--profiles=android,iphone', '--input=buttons']).profiles, ['android', 'iphone'])
  assert.equal(parseArgs([]).stepScreenshots, 'none')
  assert.equal(parseArgs(['--step-screenshots=all']).stepScreenshots, 'all')
  assert.throws(() => parseArgs(['--step-screenshots=often']), /step-screenshots/)
  for (const arg of ['--attempts=0', '--attempts=4', '--timeout-ms=Infinity', '--sample-ms=0',
    '--run-name=../escape', '--levels=level-11', '--levels=tutorial,tutorial', '--profiles=none', '--input=qa', '--warp']) {
    assert.throws(() => parseArgs([arg]), arg)
  }
})

test('late-campaign mastery can enumerate its full catalog while retaining finite execution bounds', () => {
  assert.equal(parseArgs(['--timeout-ms=900000']).timeoutMs, 900000)
  assert.throws(() => parseArgs(['--timeout-ms=900001']), /Invalid timeout/)
  const base = BUILTIN_POLICIES.find(policy => policy.levelId === 'level-1' && policy.mode === 'normal')
  const steps = Array.from({ length: 499 }, (_, i) => ({ id: `staging-${i}`, kind: 'move', x: 100, y: 432 }))
  assert.doesNotThrow(() => validatePolicy({ ...base, steps: [...steps, base.steps.at(-1)] }))
  assert.throws(() => validatePolicy({ ...base, steps: [...steps, { id: 'extra', kind: 'move', x: 100, y: 432 }, base.steps.at(-1)] }), /1-500/)
})

test('dry validation makes no gameplay claim and live mode requires preview coordination', async t => {
  t.mock.method(console, 'log', () => {})
  const report = await main(['--dry-run'])
  assert.equal(report.status, 'dry-validation-only')
  assert.equal(report.gameplayProven, false)
  await assert.rejects(main([]), /preview-ready/)
  await assert.rejects(main(['--dry-run', '--levels=level-10', '--modes=mastery']), /No real-input policy/)
})

test('default tutorial uses the 2760px four-coin required-sentry route and reports the opening module hash', async t => {
  t.mock.method(console, 'log', () => {})
  const report = await main(['--dry-run'])
  const tutorial = report.policies.find(policy => policy.levelId === 'tutorial')
  assert.equal(tutorial, OPENING_ROUTE_POLICIES.find(policy => policy.levelId === 'tutorial' && policy.mode === 'normal'))
  assert.equal(tutorial.expected.coins, 4)
  assert.deepEqual(tutorial.expected.enemyIds, ['courtyard-training-sentry'])
  assert.deepEqual(tutorial.steps.filter(step => step.kind === 'fight').map(step => step.enemyId), tutorial.expected.enemyIds)
  assert.deepEqual(tutorial.steps.at(-1), { id: 'east-gate', kind: 'finish', x: 2640, y: 432 })
  const ts = await import('typescript')
  const source = ts.createSourceFile('tutorial.ts', await readFile(new URL('../src/features/games/shadow-runner/game/tutorial.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
  const declaration = source.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
    .find(declaration => declaration.name.getText(source) === 'SHADOW_RUNNER_TUTORIAL_LEVEL')
  const property = name => declaration.initializer.properties.find(property => property.name.getText(source) === name).initializer
  assert.equal(Number(property('worldWidth').text), 2760)
  assert.equal(property('coins').elements.length, tutorial.expected.coins)
  assert.deepEqual(property('requiredEnemyIds').elements.map(element => element.text), tutorial.expected.enemyIds)
  const expectedHash = createHash('sha256').update(await readFile(new URL('../scripts/shadow-runner-opening-route-policies.mjs', import.meta.url))).digest('hex')
  assert.equal(report.openingPoliciesSha256, expectedHash)
  assert.match(report.scriptSha256, /^[a-f0-9]{64}$/)
  assert.match(report.policiesSha256, /^[a-f0-9]{64}$/)
  const allOpening = await main(['--dry-run', '--levels=tutorial,level-1', '--modes=normal,mastery'])
  assert.deepEqual(allOpening.policies.map(policy => `${policy.levelId}/${policy.mode}`),
    ['tutorial/normal', 'tutorial/mastery', 'level-1/normal', 'level-1/mastery'])
  assert.equal(allOpening.gameplayProven, false)
})

test('disposable guest unlocks prerequisites, never the target or a lastRun', () => {
  assert.deepEqual(makeGuestSeed('tutorial').levels, {})
  const seed = makeGuestSeed('level-1')
  assert.deepEqual(Object.keys(seed.levels), ['tutorial'])
  assert.equal(seed.ownerId, null)
  assert.deepEqual(seed.pending, {})
  assert.equal(seed.levels.tutorial.lastRun, undefined)
  assert.equal(makeGuestSeed('level-10').levels['level-10'], undefined)
})

test('QA keys and remote/local mutations are prohibited', () => {
  for (const key of ['ArrowRight', 'ArrowLeft', 'KeyS', 'Space', 'KeyJ']) assert.equal(assertRealInputKey(key), key)
  for (const key of ['Digit2', 'Digit3', 'Digit7', 'KeyH', 'KeyK', 'F12']) assert.throws(() => assertRealInputKey(key))
  assert.equal(mayRequest('http://127.0.0.1:4176/assets/game.js', 'GET', 'http://127.0.0.1:4176'), true)
  assert.equal(mayRequest('http://127.0.0.1:4176/api/write', 'POST', 'http://127.0.0.1:4176'), false)
  assert.equal(mayRequest('https://example.com/game.js', 'GET', 'http://127.0.0.1:4176'), false)
})

test('policies cannot smuggle state mutations or arbitrary actions', () => {
  const policy = BUILTIN_POLICIES[0]
  for (const step of [{ id: 'warp', kind: 'teleport', x: 900, y: 432 },
    { id: 'walk', kind: 'move', x: 900, y: 432, health: 999 },
    { id: 'walk', kind: 'move', x: Infinity, y: 432 }]) {
    assert.throws(() => validatePolicy({ ...policy, steps: [step, policy.steps.at(-1)] }))
  }
  assert.throws(() => validatePolicy({ ...policy, steps: [policy.steps[0], policy.steps[0], policy.steps.at(-1)] }))
  assert.throws(() => validatePolicy({ ...policy, steps: [policy.steps[0]] }))
})

test('movement waits for the actual target support and finish never accepts X alone', () => {
  const step = { kind: 'move', x: 480, y: 432 }
  assert.equal(decideStep(step, { player: player(480, 330) }, {}, 0).done, false)
  assert.equal(decideStep(step, { player: player(480, 432) }, {}, 0).done, true)
  assert.equal(decideStep({ ...step, kind: 'finish' }, { player: player(480, 432) }, {}, 0).done, false)
})

test('jump requires takeoff support, releases a bounded second jump and waits for landing', () => {
  const step = { kind: 'jump', x: 700, y: 398, fromY: 432, airJumpDelayMs: 300 }
  const memory = {}
  assert.equal(decideStep(step, { player: player(480, 400, 100) }, memory, 0).jump, false)
  assert.equal(decideStep(step, { player: player(480, 432) }, memory, 10).jump, true)
  assert.equal(decideStep(step, { player: player(530, 330, -300) }, memory, 150).jump, false)
  assert.equal(decideStep(step, { player: player(560, 320, -100) }, memory, 310).jump, true)
  assert.equal(decideStep(step, { player: player(620, 300, -200) }, memory, 500).jump, false)
  assert.equal(decideStep(step, { player: player(700, 320) }, memory, 700).done, false)
  assert.equal(decideStep(step, { player: player(700, 398) }, memory, 1000).done, true)
})

test('tilt takeoff follows confirmed live deck support without accepting a missing or mismatched contact', () => {
  const step = { kind: 'jump', x: 5680, y: 498, fromY: 604, airJumpDelayMs: 350 }
  const debug = { player: player(5552, 615, 10), tiltBridges: {
    playerSupport: { bridgeId: 'vault', surfaceY: 615.2 },
    bridges: [{ id: 'vault', left: { x: 5540, y: 616 }, right: { x: 5800, y: 592 } }],
  } }
  assert.equal(decideStep(step, debug, {}, 0).jump, true)
  assert.equal(decideStep({ kind: 'move', x: 5552, y: 604 }, debug, {}, 0).done, true)
  for (const invalid of [
    { ...debug, tiltBridges: undefined },
    { ...debug, tiltBridges: { ...debug.tiltBridges, playerSupport: null } },
    { ...debug, tiltBridges: { ...debug.tiltBridges, playerSupport: { bridgeId: 'other', surfaceY: 615.2 } } },
    { ...debug, player: player(5552, 613, 10) },
    { ...debug, player: player(5552, 615, -200) },
    { ...debug, player: player(5500, 615, 10) },
  ]) assert.equal(decideStep(step, invalid, {}, 0).jump, false)
  assert.equal(decideStep({ ...step, fromY: 616 }, debug, {}, 0).jump, true)
  assert.equal(decideStep({ ...step, fromY: 650 }, debug, {}, 0).jump, false)
})

test('an interrupted jump retries only on observed takeoff support and never more than three times', () => {
  const step = { kind: 'jump', x: 600, y: 486, fromY: 616, airJumpDelayMs: 350, riseBeforeMoveY: 480 }
  const memory = {}
  for (let attempt = 0; attempt < 3; attempt++) {
    const time = attempt * 1000
    const takeoff = decideStep(step, { player: player(480, 616) }, memory, time)
    assert.equal(takeoff.jump, true)
    assert.equal(takeoff.direction, 0)
    assert.equal(memory.jumpAttempts, attempt + 1)
    assert.equal(decideStep(step, { player: player(480, 530, -200) }, memory, time + 100).jump, false)
    assert.equal(decideStep(step, { player: player(480, 520, -80) }, memory, time + 350).jump, true)
    assert.equal(decideStep(step, { player: player(480, 616, 200) }, memory, time + 750).jump, false)
  }
  assert.equal(decideStep(step, { player: player(480, 616) }, memory, 3000).jump, false)
  assert.equal(memory.jumpAttempts, 3)
  assert.equal(memory.startedAt, 0)
  assert.equal(decideStep(step, { player: player(600, 486) }, memory, 3100).done, true)
})

test('explicit short-step recovery walks back out from under a missed ledge before a bounded retry', () => {
  const step = { id: 'short-step', kind: 'jump', x: 1580, y: 480, fromY: 616,
    airJumpDelayMs: 350, riseBeforeMoveY: 520, retryTakeoffX: 1504 }
  const base = BUILTIN_POLICIES.find(policy => policy.mode === 'normal')
  assert.doesNotThrow(() => validatePolicy({ ...base, steps: [step, base.steps.at(-1)] }))
  for (const invalid of [{ retryTakeoffX: Infinity }, { retryTakeoffX: -1 }, { retryTakeoffX: 1000 },
    { y: 616 }, { riseBeforeMoveY: undefined }]) {
    assert.throws(() => validatePolicy({ ...base, steps: [{ ...step, ...invalid }, base.steps.at(-1)] }), /Takeoff recovery/)
  }
  assert.throws(() => decideStep(step, { player: player(1400, 616) }, {}, 0), /observed takeoff/)
  const memory = {}
  for (let attempt = 0; attempt < 3; attempt++) {
    const time = attempt * 1600
    assert.equal(decideStep(step, { player: player(1504, 616) }, memory, time).jump, true)
    decideStep(step, { player: player(1510, 510, -150) }, memory, time + 200)
    decideStep(step, { player: player(1560, 520, 80) }, memory, time + 400)
    const debug = Object.freeze({ player: Object.freeze(player(1585, 616)) })
    const action = decideStep(step, debug, memory, time + 1000)
    assert.equal(action.jump, false)
    assert.equal(action.done, false)
    assert.equal(action.direction, attempt < 2 ? -1 : 0)
    assert.equal(memory.jumpAttempts, attempt + 1)
  }
  assert.equal(memory.startedAt, 0)
  assert.equal(decideStep(step, { player: player(1504, 616) }, memory, 5000).jump, false)
  assert.equal(decideStep(step, { player: player(1580, 480) }, memory, 5100).done, true)
})

test('a partial landing on a destination floor never triggers a same-height takeoff retry', () => {
  const step = { kind: 'jump', x: 5930, y: 616, fromY: 616, airJumpDelayMs: 350 }
  const memory = {}
  assert.equal(decideStep(step, { player: player(5630, 616) }, memory, 0).jump, true)
  decideStep(step, { player: player(5750, 450, -300) }, memory, 500)
  const landed = decideStep(step, { player: player(5890, 616) }, memory, 1600)
  assert.equal(landed.jump, false)
  assert.equal(landed.direction, 1)
  assert.equal(landed.done, false)
  assert.equal(memory.jumpAttempts, 1)
  assert.equal(decideStep(step, { player: player(5930, 616) }, memory, 1850).done, true)
})

test('explicit crouched landing uses real crouch only after destination-floor contact', () => {
  const step = { id: 'wind-landing', kind: 'jump', x: 5930, y: 616, fromY: 616, airJumpDelayMs: 350, crouchOnLanding: true }
  const base = BUILTIN_POLICIES.find(policy => policy.mode === 'normal')
  assert.doesNotThrow(() => validatePolicy({ ...base, steps: [step, base.steps.at(-1)] }))
  assert.throws(() => validatePolicy({ ...base, steps: [{ ...step, crouchOnLanding: 1 }, base.steps.at(-1)] }), /must be boolean/)
  const memory = {}
  assert.equal(decideStep(step, { player: player(5650, 616) }, memory, 0).crouch, false)
  assert.equal(decideStep(step, { player: player(5850, 520, 150) }, memory, 500).crouch, false)
  const landed = decideStep(step, { player: player(5890, 616) }, memory, 1300)
  assert.deepEqual(landed, { direction: 1, crouch: true, jump: false, attack: false, done: false })
  assert.equal(decideStep(step, { player: player(5930, 616) }, memory, 1600).done, true)
  assert.equal(memory.jumpAttempts, 1)
})

test('Aether third jump requires bounded separate inputs and observed natural power activation', () => {
  const step = { id: 'aether-ascent', kind: 'jump', x: 700, y: 190, fromY: 432,
    airJumpDelayMs: 300, extraAirJumpDelayMs: 650 }
  const base = BUILTIN_POLICIES.find(policy => policy.mode === 'normal')
  assert.doesNotThrow(() => validatePolicy({ ...base, steps: [step, base.steps.at(-1)] }))
  for (const invalid of [{ airJumpDelayMs: undefined }, { extraAirJumpDelayMs: 399 },
    { extraAirJumpDelayMs: 1201 }, { extraAirJumpDelayMs: Infinity }]) {
    assert.throws(() => validatePolicy({ ...base, steps: [{ ...step, ...invalid }, base.steps.at(-1)] }), /Aether third jump/)
  }
  const memory = {}
  assert.equal(decideStep(step, { player: player(480, 432) }, memory, 0).jump, true)
  // A slow observation must not collapse the two air jumps into one held input.
  assert.equal(decideStep(step, { player: player(560, 320, -100) }, memory, 700).jump, true)
  assert.equal(decideStep(step, { player: player(580, 300, -200) }, memory, 740).jump, false)
  assert.throws(() => decideStep(step, { player: player(620, 260, -100) }, memory, 800), /observed active powerup/)
  assert.throws(() => decideStep(step, { player: { ...player(620, 260, -100), aetherStepActive: false } }, memory, 800), /observed active powerup/)
  assert.equal(memory.extraAirJumped, undefined)
  assert.equal(decideStep(step, { player: { ...player(620, 260, -100), aetherStepActive: true } }, memory, 800).jump, true)
  assert.equal(decideStep(step, { player: { ...player(650, 200, -200), aetherStepActive: true } }, memory, 1100).jump, false)
  assert.equal(decideStep(step, { player: player(700, 190) }, memory, 1300).done, true)
})

test('air turns clear an explicit horizontal edge before reversing and releasing the second jump', () => {
  for (const direction of [-1, 1]) {
    const step = { id: 'lift-lip-return', kind: 'jump', x: 3300, y: 326, fromY: 568,
      airJumpDelayMs: 300, viaX: 3300 + direction * 340 }
    const base = BUILTIN_POLICIES.find(policy => policy.mode === 'normal')
    assert.doesNotThrow(() => validatePolicy({ ...base, steps: [step, base.steps.at(-1)] }))
    const memory = {}
    const takeoff = decideStep(step, { player: player(3300, 568) }, memory, 0)
    assert.equal(takeoff.jump, true)
    assert.equal(takeoff.direction, direction)
    assert.equal(decideStep(step, { player: player(3300 + direction * 200, 500, -100) }, memory, 400).jump, false)
    assert.equal(decideStep(step, { player: player(3300, 326) }, memory, 500).done, false)
    // Crossing detection still works when a sample skips over the exact waypoint.
    const turn = decideStep(step, { player: player(step.viaX + direction * 10, 520, 100) }, memory, 800)
    assert.equal(turn.direction, -direction)
    assert.equal(turn.jump, true)
    assert.equal(decideStep(step, { player: player(3300 + direction * 50, 300, -100) }, memory, 1000).jump, false)
    assert.equal(decideStep(step, { player: player(3300, 326) }, memory, 1300).done, true)
    for (const invalid of [{ viaX: -1 }, { viaX: Infinity }, { viaX: step.x },
      { riseBeforeMoveY: 320 }, { viaX: '3400' }]) {
      assert.throws(() => validatePolicy({ ...base, steps: [{ ...step, ...invalid }, base.steps.at(-1)] }), /Air turn/)
    }
  }
})

test('fights approach and use ordinary sword input; missing enemies fail policy', () => {
  const step = { kind: 'fight', enemyId: 'sentry' }
  const debug = { player: player(1200, 432), enemies: [{ id: 'sentry', alive: true, x: 1400, y: 432 }] }
  const memory = {}
  assert.equal(decideStep(step, debug, memory, 0).direction, 1)
  debug.enemies[0].x = 1270
  assert.equal(decideStep(step, debug, memory, 100).attack, true)
  assert.equal(decideStep(step, debug, memory, 200).attack, false)
  debug.enemies[0].alive = false
  assert.equal(decideStep(step, debug, memory, 300).done, true)
  assert.throws(() => decideStep(step, { ...debug, enemies: [] }, {}, 0))
})

test('wind-cycle input waits for a newly observed calm period, never guesses an unknown phase', () => {
  const step = { id: 'wait-murder-wind', kind: 'wind-cycle', zoneId: 'captain-wind-murder', crouch: true, timeoutMs: 5000 }
  const base = BUILTIN_POLICIES.find(policy => policy.mode === 'normal')
  assert.doesNotThrow(() => validatePolicy({ ...base, steps: [step, base.steps.at(-1)] }))
  for (const zoneId of [undefined, '', 1, 'invalid/zone']) {
    assert.throws(() => validatePolicy({ ...base, steps: [{ ...step, zoneId }, base.steps.at(-1)] }), /authored zoneId/)
  }
  const debug = { player: player(4960, 616), windZones: [{ id: step.zoneId, active: false, telling: false }] }
  const memory = {}
  assert.equal(decideStep(step, debug, memory, 0).done, false)
  debug.windZones[0].telling = true
  assert.deepEqual(decideStep(step, debug, memory, 200), { direction: 0, crouch: true, jump: false, attack: false, done: false })
  Object.assign(debug.windZones[0], { telling: false, active: true })
  assert.equal(decideStep(step, debug, memory, 800).done, false)
  debug.windZones[0].active = false
  assert.equal(decideStep(step, debug, memory, 1800).done, true)
  assert.equal(memory.startedAt, 0)
  for (const invalid of [{}, { windZones: [] }, { windZones: [{ id: step.zoneId, active: true }] }]) {
    assert.throws(() => decideStep(step, { player: player(4960, 616), ...invalid }, {}, 0), /live cycle readback/)
  }
})

test('anchored wind waits counter drift with real movement and require actual supported arrival', () => {
  const step = { id: 'hold-foundry-ledge', kind: 'wind-cycle', zoneId: 'relay-wind-foundry', x: 6656, y: 466, crouch: true }
  const base = BUILTIN_POLICIES.find(policy => policy.mode === 'normal')
  assert.doesNotThrow(() => validatePolicy({ ...base, steps: [step, base.steps.at(-1)] }))
  for (const patch of [{ x: undefined }, { y: undefined }, { x: Infinity }, { y: -1 }]) {
    assert.throws(() => validatePolicy({ ...base, steps: [{ ...step, ...patch }, base.steps.at(-1)] }), /finite supported position/)
  }
  const debug = { player: player(6644, 466), windZones: [{ id: step.zoneId, active: true, telling: false }] }
  const memory = {}
  assert.deepEqual(decideStep(step, debug, memory, 0), { direction: 1, crouch: true, jump: false, attack: false, done: false })
  debug.player.x = 6668
  assert.equal(decideStep(step, debug, memory, 100).direction, -1)
  debug.windZones[0].active = false
  assert.equal(decideStep(step, debug, memory, 200).done, false)
  debug.player = player(6656, 440, { velocityY: -100 })
  assert.equal(decideStep(step, debug, memory, 300).done, false)
  debug.player = player(6656, 466)
  assert.equal(decideStep(step, debug, memory, 400).done, false)
  debug.windZones[0].active = true
  assert.equal(decideStep(step, debug, memory, 2000).done, false)
  debug.windZones[0].active = false
  assert.equal(decideStep(step, debug, memory, 3000).done, true)
  assert.equal(memory.startedAt, 0)
})

test('route-specific wind allowance stays bounded and still requires fresh calm and support', () => {
  const step = { id: 'ascent-refuge-calm', kind: 'wind-cycle', zoneId: 'relay-wind-ascent',
    x: 21824, y: 600, crouch: true, anchorTolerance: 16 }
  const base = BUILTIN_POLICIES.find(policy => policy.mode === 'normal')
  assert.doesNotThrow(() => validatePolicy({ ...base, steps: [step, base.steps.at(-1)] }))
  for (const anchorTolerance of [0, 7, 25, Infinity, NaN, '16']) {
    assert.throws(() => validatePolicy({ ...base, steps: [{ ...step, anchorTolerance }, base.steps.at(-1)] }), /tolerance/)
  }
  assert.throws(() => validatePolicy({ ...base, steps: [{ ...step, x: undefined, y: undefined }, base.steps.at(-1)] }), /tolerance/)
  for (const [dx, velocityY, expected] of [[12, 0, true], [16, 0, true], [17, 0, false], [12, -80, false]]) {
    const debug = { player: player(step.x + dx, 600, velocityY),
      windZones: [{ id: step.zoneId, active: true, telling: false }] }
    const memory = {}
    assert.equal(decideStep(step, debug, memory, 0).done, false)
    debug.windZones[0].active = false
    assert.equal(decideStep(step, debug, memory, 100).done, expected)
    assert.equal(decideStep(step, debug, memory, 200).done, false)
    assert.equal(memory.startedAt, 0)
  }
})

test('wind anchoring counters a live gust without accelerating overshoot in its direction', () => {
  const step = { id: 'wind-anchor', kind: 'wind-cycle', zoneId: 'wind', x: 1000, y: 616, crouch: true }
  for (const direction of [-1, 1]) {
    const debug = { player: player(1000, 616), windZones: [{ id: 'wind', active: true, telling: false, direction }] }
    const memory = {}
    assert.equal(decideStep(step, debug, memory, 0).direction, -direction)
    debug.player.x = 1000 - direction * 12
    assert.equal(decideStep(step, debug, memory, 100).direction, 0)
    debug.player.x = 1000 + direction * 12
    assert.equal(decideStep(step, debug, memory, 200).direction, -direction)
    debug.windZones[0].active = false
    debug.player.x = 1000
    assert.equal(decideStep(step, debug, memory, 300).done, true)
    assert.equal(memory.startedAt, 0)
    assert.equal(decideStep({ ...step, x: undefined, y: undefined }, { ...debug,
      windZones: [{ id: 'wind', active: true, telling: false, direction }] }, {}, 0).direction, 0)
  }
})

test('wind combat reserves jumping for witnessed calm onset without suppressing ordinary sword attacks', () => {
  const step = { id: 'grenadier-wind-fight', kind: 'fight', enemyId: 'grenadier', minX: 6936, maxX: 7048,
    crouch: true, braceWindZoneId: 'relay-wind-foundry', jumpStrikeY: 616, freshCalmJump: true }
  const base = BUILTIN_POLICIES.find(policy => policy.mode === 'normal')
  assert.doesNotThrow(() => validatePolicy({ ...base, steps: [step, base.steps.at(-1)] }))
  for (const patch of [{ freshCalmJump: false }, { freshCalmJump: 'true' }, { braceWindZoneId: undefined }, { jumpStrikeY: undefined }]) {
    assert.throws(() => validatePolicy({ ...base, steps: [{ ...step, ...patch }, base.steps.at(-1)] }))
  }
  const memory = { facing: 1 }
  const debug = { player: player(7000, 616), enemies: [{ id: 'grenadier', alive: true, x: 7070, y: 616 }],
    windZones: [{ id: step.braceWindZoneId, active: false, telling: false }] }
  assert.equal(decideStep(step, debug, memory, 0).jump, false, 'Unknown calm age is not a safe takeoff')
  assert.equal(decideStep(step, debug, memory, 500).attack, true)
  debug.windZones[0].telling = true
  assert.equal(decideStep(step, debug, memory, 1000).jump, false)
  debug.windZones[0].telling = false
  assert.equal(decideStep(step, debug, memory, 2000).jump, true)
  assert.equal(decideStep(step, debug, memory, 2700).jump, false, 'A later calm sample is not another fresh onset')
  debug.windZones[0].active = true
  decideStep(step, debug, memory, 3000)
  debug.windZones[0].active = false
  debug.player = player(7000, 550, -100)
  assert.equal(decideStep(step, debug, memory, 4000).jump, false)
  debug.player = player(7000, 616)
  assert.equal(decideStep(step, debug, memory, 4200).jump, false, 'Missing the supported onset consumes the window')
  assert.equal(memory.startedAt, 0)
})

test('natural deaths are logged and legitimate respawn discontinuities are distinguished', () => {
  const old = { player: player(1400, 432), activeTimeMs: 1000 }
  const next = { player: { ...player(112, 404), lives: 2, health: 0 }, activeTimeMs: 1020, respawnPending: true }
  const events = observationEvents(old, next, 20)
  assert.ok(events.some(event => event.kind === 'life-lost'))
  assert.ok(events.some(event => event.kind === 'respawn-start'))
  assert.ok(!events.some(event => event.kind === 'unexplained-position-discontinuity'))
  assert.ok(observationEvents(old, { player: player(5000, 432), activeTimeMs: 900 }, 20)
    .some(event => event.kind === 'unexplained-position-discontinuity'))
})

test('passing requires a results dialog, matching scene and new consistent guest completion', () => {
  const observation = { debug: { levelId: 'tutorial', player: player(1460, 404) }, dialogs: [{ title: 'Level Complete' }],
    record: { lastRun: { recordedAt: '2026-09-08T12:00:01Z', score: 0, coinsCollected: 0 } } }
  const start = '2026-09-08T12:00:00Z'
  assert.equal(hasCompletionEvidence(observation, 'tutorial', start), true)
  assert.equal(hasCompletionEvidence({ ...observation, dialogs: [] }, 'tutorial', start), false)
  assert.equal(hasCompletionEvidence({ ...observation, record: null }, 'tutorial', start), false)
  assert.equal(hasCompletionEvidence(observation, 'level-1', start), false)
  assert.equal(hasCompletionEvidence(observation, 'tutorial', '2026-09-08T12:01:00Z'), false)
})

test('driver sends browser keyboard events, prevents QA keys, and releases held keys', async () => {
  const calls = []
  const page = { keyboard: { down: async key => calls.push(['down', key]), up: async key => calls.push(['up', key]) } }
  let now = 0
  const driver = new RealInputDriver(page, 'keyboard', [], () => now)
  await driver.apply({ direction: 1, jump: true })
  now = 100
  await driver.apply({ direction: 0 })
  await driver.release()
  assert.deepEqual(calls, [['down', 'ArrowRight'], ['down', 'Space'], ['up', 'Space'], ['up', 'ArrowRight']])
  await assert.rejects(driver.keyDown('Digit3'))
})

test('step transitions release movement and action pulses while keeping the next crouch held', async () => {
  const calls = []
  const page = { keyboard: { down: async key => calls.push(['down', key]), up: async key => calls.push(['up', key]) } }
  const driver = new RealInputDriver(page, 'keyboard', [], () => 0)
  await driver.apply({ direction: 1, crouch: true, jump: true, attack: true })
  calls.length = 0
  await driver.finishStep(true)
  assert.deepEqual(calls, [['up', 'ArrowRight'], ['up', 'Space'], ['up', 'KeyJ']])
  assert.deepEqual([...driver.held.keys()], ['KeyS'])
  await driver.finishStep(false)
  assert.deepEqual(calls.at(-1), ['up', 'KeyS'])
  assert.equal(driver.held.size, 0)
})

test('buttons mode holds the named direction button with real pointer input', async () => {
  const calls = []
  const inputs = []
  const page = { mouse: { move: async (x, y) => calls.push(['move', x, y]), down: async () => calls.push(['down']), up: async () => calls.push(['up']) },
    getByRole: (_role, options) => { calls.push(['button', options.name]); return { boundingBox: async () => ({ x: 10, y: 20, width: 40, height: 40 }) } } }
  const driver = new RealInputDriver(page, 'buttons', inputs, () => 0)
  await driver.directionTo(1)
  await driver.release()
  assert.deepEqual(calls, [['button', 'Move right'], ['move', 30, 40], ['down'], ['up']])
  assert.deepEqual(inputs.map(input => input.kind), ['down', 'up'])
})

test('crouch sends the actual runtime S binding and releases it before jumping', async () => {
  const calls = []
  const page = { keyboard: { down: async key => calls.push(['down', key]), up: async key => calls.push(['up', key]) } }
  const driver = new RealInputDriver(page, 'keyboard', [], () => 0)
  await driver.apply({ direction: 0, crouch: true })
  await driver.apply({ direction: 0, jump: true })
  assert.deepEqual(calls, [['down', 'KeyS'], ['up', 'KeyS'], ['down', 'Space']])
  const runtime = await readFile(new URL('../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts', import.meta.url), 'utf8')
  assert.match(runtime, /const crouch = input\.crouch.*keys\?\.s\.isDown/)
})

test('proof source has no QA mutation access or clock controls and observer is read-only', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-route-proof.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /__shadowRunnerQa|\.clock\.|\.setVelocity|\.setPosition|\.defeatEnemy|\.restore\(/)
  assert.doesNotMatch(readObservationInPage.toString(), /setItem|removeItem|dispatchEvent|\.click\(|\bwindow\.[\w.]+\s*=(?!=)/)
})

test('L2-L4 policies have distinct normal/mastery coverage for every authored coin and enemy', () => {
  assert.equal(EXTENDED_ROUTE_POLICIES.length, 10)
  for (const policy of EXTENDED_ROUTE_POLICIES) validatePolicy(policy)
  const selected = selectPolicies(EXTENDED_ROUTE_POLICIES, ['level-2', 'level-3', 'level-4'], ['normal', 'mastery'])
  assert.equal(selected.length, 6)
  assert.deepEqual(selected.filter(policy => policy.mode === 'mastery').map(policy => policy.expected.coins), [12, 16, 30])
  assert.deepEqual(selected.filter(policy => policy.mode === 'mastery').map(policy => policy.expected.enemyIds.length), [3, 5, 7])
  assert.throws(() => selectPolicies([...selected, selected[0]], ['level-2'], ['normal']), /Duplicate/)
  assert.throws(() => selectPolicies(BUILTIN_POLICIES, ['level-2'], ['mastery']), /No real-input policy/)
})

test('L5/L6 prepare four bounded candidates without launching a browser', async t => {
  t.mock.method(console, 'log', () => {})
  const report = await main(['--dry-run', '--levels=level-5,level-6', '--modes=normal,mastery', '--timeout-ms=240000'])
  assert.equal(report.status, 'dry-validation-only')
  assert.equal(report.gameplayProven, false)
  assert.deepEqual(report.policies.map(policy => [policy.levelId, policy.mode, policy.expected.coins, policy.expected.enemyIds.length]), [
    ['level-5', 'normal', 44, 10], ['level-5', 'mastery', 44, 10],
    ['level-6', 'normal', 48, 12], ['level-6', 'mastery', 48, 12],
  ])
  assert.ok(report.policies.every(policy => policy.steps.length <= 150))
  await assert.rejects(main(['--levels=level-5,level-6']), /preview-ready/)
})

test('power steps wait for normal observed activation and cannot inject state', () => {
  for (const power of ['shield', 'chrono', 'surge']) {
    const step = { id: 'power-test', kind: 'power', power, pickupId: 'authored-test', x: 1998, y: 520 }
    const debug = Object.freeze({ player: Object.freeze({ ...player(1998, 520), [`${power}Active`]: false }) })
    const memory = {}
    assert.equal(decideStep(step, debug, memory, 0).jump, true)
    assert.equal(decideStep(step, debug, memory, 900).jump, true)
    assert.equal(decideStep(step, debug, memory, 1800).jump, true)
    assert.equal(decideStep(step, debug, memory, 2700).jump, false)
    assert.equal(decideStep(step, debug, memory, 2800).done, false)
    const active = { player: { ...debug.player, [`${power}Active`]: true } }
    assert.equal(decideStep(step, active, memory, 2900).done, true)
    assert.equal(decideStep(step, { player: { ...active.player, x: 1000 } }, {}, 0).done, false)
    for (const invalid of [{ ...step, power: 'health' }, { ...step, health: 12 }, { ...step, pickupId: '' }]) {
      assert.throws(() => validatePolicy({ ...BUILTIN_POLICIES[0], steps: [invalid, BUILTIN_POLICIES[0].steps.at(-1)] }))
    }
  }
})

test('bounded fights wait for the enemy instead of chasing into the finish trigger', () => {
  const step = { kind: 'fight', enemyId: 'final', maxX: 9990 }
  const debug = { player: player(9985, 584), enemies: [{ id: 'final', alive: true, x: 10200, y: 584 }] }
  const memory = { facing: 1 }
  assert.equal(decideStep(step, debug, memory, 0).direction, 0)
  debug.enemies[0].x = 10070
  const attack = decideStep(step, debug, memory, 1000)
  assert.equal(attack.direction, 0)
  assert.equal(attack.attack, true)
  debug.player.x = 10010
  assert.equal(decideStep(step, debug, memory, 1100).direction, -1)
  assert.equal(decideStep(step, debug, memory, 1100).done, false)
})

test('a bounded fight can re-face the enemy using real movement inside its hold line', () => {
  const step = { kind: 'fight', enemyId: 'final', maxX: 9990 }
  const debug = { player: player(9985, 584), enemies: [{ id: 'final', alive: true, x: 10070, y: 584 }] }
  const memory = {}
  const backstep = decideStep(step, debug, memory, 0)
  assert.equal(backstep.direction, -1)
  assert.equal(backstep.attack, false)
  debug.player.x = 9975
  const face = decideStep(step, debug, memory, 40)
  assert.equal(face.direction, 1)
  assert.equal(face.attack, true)
  debug.player.x = 9985
  assert.equal(decideStep(step, debug, memory, 80).direction, 0)
})

test('terminal coin jumps remain completion checks, never injected or assumed collection', () => {
  const policy = EXTENDED_ROUTE_POLICIES.find(policy => policy.levelId === 'level-6' && policy.mode === 'mastery')
  const step = policy.steps.at(-1)
  assert.equal(step.kind, 'finish')
  assert.equal(step.coinId, 'coin-39')
  assert.equal(step.minCoins, 48)
  const memory = {}
  assert.equal(decideStep(step, { player: player(10070, 560, 100) }, memory, 0).jump, false)
  assert.equal(decideStep(step, { player: player(10070, 584) }, memory, 50).jump, true)
  const airborne = decideStep(step, { player: player(10100, 520, -300) }, memory, 100)
  assert.equal(airborne.jump, false)
  assert.equal(airborne.done, false)
  const missing = structuredClone(policy)
  delete missing.steps.at(-1).coinId
  assert.throws(() => validatePolicy(missing))
  const duplicate = structuredClone(policy)
  duplicate.steps.at(-1).coinId = 'coin-38'
  assert.throws(() => validatePolicy(duplicate), /enumerate every coin/)
})

// Parse literal geometry with the existing TypeScript parser; never execute runtime/asset imports.
async function readAuthoredMidCampaign() {
  const ts = await import('typescript')
  const source = ts.createSourceFile('levels.ts', await readFile(new URL('../src/features/games/shadow-runner/game/levels.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
  const literal = node => {
    if (ts.isStringLiteral(node)) return node.text
    if (ts.isNumericLiteral(node)) return Number(node.text)
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal)
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.filter(ts.isPropertyAssignment)
      .map(property => [property.name.getText(source).replace(/^['"]|['"]$/g, ''), literal(property.initializer)]))
    return undefined
  }
  const levels = []
  for (const statement of source.statements.filter(ts.isVariableStatement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (['SHADOW_RUNNER_LEVEL_FIVE', 'SHADOW_RUNNER_LEVEL_SIX'].includes(declaration.name.getText(source))) levels.push(literal(declaration.initializer))
    }
  }
  assert.equal(levels.length, 2)
  return levels
}

test('L5/L6 catalogs, collectible targets and power targets match actual authored source', async () => {
  for (const level of await readAuthoredMidCampaign()) {
    const policies = EXTENDED_ROUTE_POLICIES.filter(policy => policy.levelId === level.id)
    for (const policy of policies) {
      assert.equal(policy.expected.coins, level.coins.length)
      assert.deepEqual([...policy.expected.enemyIds].sort(), level.enemies.map(enemy => enemy.id).sort())
      const foughtIds = policy.steps.filter(step => step.kind === 'fight').map(step => step.enemyId)
      assert.ok(foughtIds.every(id => level.enemies.some(enemy => enemy.id === id)))
      assert.ok((level.requiredEnemyIds ?? []).every(id => foughtIds.includes(id)))
      if (policy.mode === 'mastery') assert.deepEqual([...foughtIds].sort(), level.enemies.map(enemy => enemy.id).sort())
      for (const step of policy.steps.filter(step => step.kind === 'power')) {
        const pickup = level[step.power === 'shield' ? 'shieldPickups' : 'chronoPickups'].find(pickup => pickup.id === step.pickupId)
        assert.ok(pickup, step.pickupId)
        assert.equal(step.x, pickup.x)
        assert.ok(step.y > pickup.y)
      }
      if (policy.mode === 'mastery') {
        const coins = policy.steps.filter(step => step.coinId)
        assert.deepEqual(coins.map(step => step.coinId).sort(), level.coins.map(coin => coin.id).sort())
        for (const step of coins.filter(step => step.kind === 'collect')) {
          assert.ok(Math.abs(step.x - level.coins.find(coin => coin.id === step.coinId).x) <= 12, step.coinId)
        }
      }
      assert.equal(level.objectivePickups, undefined)
      assert.equal(level.requiredEnemyIds, undefined)
      assert.equal(level.moonShardPickups, undefined)
    }
  }
})

test('L5/L6 target stances have authored support and are not embedded; this is not travel proof', async () => {
  for (const level of await readAuthoredMidCampaign()) {
    const solids = [...level.platforms, ...level.tiltPlatforms, ...level.crouchGates]
    for (const policy of EXTENDED_ROUTE_POLICIES.filter(policy => policy.levelId === level.id)) {
      for (const step of policy.steps.filter(step => Number.isFinite(step.x))) {
        const label = `${policy.levelId}/${policy.mode}/${step.id}`
        assert.ok(solids.some(solid => solid.x <= step.x && solid.x + solid.width >= step.x && solid.y === step.y), `No target support: ${label}`)
        const height = step.crouch ? 27 : 54.6
        assert.ok(!solids.some(solid => step.x + 16.38 > solid.x && step.x - 16.38 < solid.x + solid.width
          && step.y > solid.y && step.y - height < solid.y + solid.height), `Embedded target stance: ${label}`)
      }
    }
  }
})

test('L5 entry nominal stop band clears the hidden step without changing pickup coordinates', async () => {
  const level = (await readAuthoredMidCampaign()).find(level => level.id === 'level-5')
  const hiddenStep = level.platforms.find(platform => platform.id === 'fair-hidden-crouch-step-a')
  for (const policy of EXTENDED_ROUTE_POLICIES.filter(policy => policy.levelId === 'level-5')) {
    const entry = policy.steps.find(step => step.id === 'crawl-floor')
    assert.equal(entry.x, 560)
    assert.equal(entry.y, 584)
    assert.equal(entry.fromY, 584)
    assert.ok(entry.x + 8 + 16.38 < hiddenStep.x)
    assert.equal(policy.steps.find(step => step.pickupId === 'candle-ward-gauntlet').x, 6218)
  }
})

test('L5 mastery stages the missed perch jump on the authored shelf without moving collectibles or the normal route', async () => {
  const level = (await readAuthoredMidCampaign()).find(level => level.id === 'level-5')
  const mastery = EXTENDED_ROUTE_POLICIES.find(policy => policy.levelId === level.id && policy.mode === 'mastery')
  const normal = EXTENDED_ROUTE_POLICIES.find(policy => policy.levelId === level.id && policy.mode === 'normal')
  const shelf = level.platforms.find(platform => platform.id === 'fair-volley-pocket-high')
  const perch = level.platforms.find(platform => platform.id === 'fair-archer-perch-a')
  const index = mastery.steps.findIndex(step => step.id === 'volley-east-perch')
  const takeoff = mastery.steps[index - 1]
  assert.deepEqual(takeoff, { id: 'volley-mastery-takeoff', kind: 'move', x: 2788, y: shelf.y, crouch: false })
  assert.equal(mastery.steps[index - 2].coinId, 'coin-13')
  assert.equal(mastery.steps[index + 1].coinId, 'coin-14')
  assert.equal(mastery.steps[index].fromY, shelf.y)
  assert.equal(mastery.steps[index].airJumpDelayMs, 450)
  assert.equal(mastery.steps[index].y, perch.y)
  assert.equal(mastery.steps[index].x, 3138)
  // The center stays on the shelf throughout the stop band; the toes may overhang its edge.
  for (const x of [takeoff.x - 12, takeoff.x, takeoff.x + 12]) {
    assert.ok(x > shelf.x && x < shelf.x + shelf.width)
    assert.ok(Math.min(x + 16.38, shelf.x + shelf.width) - Math.max(x - 16.38, shelf.x) > 16.38)
  }
  assert.ok(takeoff.x - 12 > 2769, 'Even the early arrival bound advances past the failed takeoff')
  const normalIndex = normal.steps.findIndex(step => step.id === 'volley-east-perch')
  assert.equal(normal.steps[normalIndex - 1].x, 2770)
  assert.equal(normal.steps[normalIndex].airJumpDelayMs, 300)
  for (const coinId of ['coin-13', 'coin-14']) {
    assert.equal(mastery.steps.find(step => step.coinId === coinId).x, level.coins.find(coin => coin.id === coinId).x)
  }
  validatePolicy(mastery)
})

test('L5 mastery perch policy waits for grounded staging, one later air jump and a real landing', () => {
  const policy = EXTENDED_ROUTE_POLICIES.find(policy => policy.levelId === 'level-5' && policy.mode === 'mastery')
  const takeoff = policy.steps.find(step => step.id === 'volley-mastery-takeoff')
  const flight = policy.steps.find(step => step.id === 'volley-east-perch')
  assert.equal(decideStep(takeoff, { player: player(2769, 396) }, {}, 0).done, false)
  assert.equal(decideStep(takeoff, { player: player(2788, 380, 100) }, {}, 0).done, false)
  assert.equal(decideStep(takeoff, { player: player(2788, 396) }, {}, 0).done, true)
  const memory = {}
  assert.equal(decideStep(flight, { player: player(2788, 396) }, memory, 0).jump, true)
  assert.equal(decideStep(flight, { player: player(2850, 290, -100) }, memory, 300).jump, false)
  assert.equal(decideStep(flight, { player: player(2890, 300, 100) }, memory, 449).jump, false)
  assert.equal(decideStep(flight, { player: player(2890, 300, 100) }, memory, 450).jump, true)
  assert.equal(decideStep(flight, { player: player(3000, 280, 100) }, memory, 900).jump, false)
  assert.equal(decideStep(flight, { player: player(3138, 554, 800) }, memory, 1200).done, false)
  assert.equal(decideStep(flight, { player: player(3138, 546) }, memory, 1300).done, true)
})

test('the observer preserves future read-only QA bounding boxes without filtering', () => {
  const debug = { levelId: 'level-5', player: { ...player(560, 584), bodyLeft: 543.62, bodyRight: 576.38 },
    pickups: [{ id: 'coin-3', body: { left: 726, right: 758, top: 532, bottom: 564 } }] }
  const observation = runInNewContext(`(${readObservationInPage.toString()})({ levelId: 'level-5', guestKey: 'guest' })`, {
    window: { __shadowRunnerDebug: () => debug }, localStorage: { getItem: () => null },
    document: { querySelectorAll: () => [] }, performance: { now: () => 123 },
  })
  assert.equal(observation.debug, debug)
  assert.deepEqual(observation.debug.pickups, debug.pickups)
})

test('completion readback accepts a durable guest journal without requiring Web Locks compaction', () => {
  const run = { recordedAt: '2026-09-30T15:00:00Z', score: 420, coinsCollected: 7,
    totalCoins: 122, enemiesDefeated: 4, totalEnemies: 36, fullClear: false, perfectRoute: false }
  const prefix = 'guest:journal:'
  const entries = new Map([
    ['guest', JSON.stringify({ levels: { 'level-10': { lastRun: { ...run, recordedAt: '2026-09-29T15:00:00Z' } } } })],
    [prefix + 'earned', JSON.stringify({ id: 'earned', type: 'complete', ownerId: null, levelId: 'level-10', run })],
    [prefix + 'other-owner', JSON.stringify({ id: 'other-owner', type: 'complete', ownerId: 'alice', levelId: 'level-10', run: { ...run, score: 999 } })],
    [prefix + 'other-level', JSON.stringify({ id: 'other-level', type: 'complete', ownerId: null, levelId: 'level-9', run: { ...run, score: 999 } })],
    [prefix + 'broken', 'not json'],
  ])
  const observe = () => runInNewContext(`(${readObservationInPage.toString()})({ levelId: 'level-10', guestKey: 'guest' })`, {
    window: {}, localStorage: { length: entries.size, key: i => [...entries.keys()][i], getItem: key => entries.get(key) ?? null },
    document: { querySelectorAll: () => [] }, performance: { now: () => 123 },
  })
  assert.equal(observe().record.lastRun.score, 420)
  assert.equal(observe().record.lastRun.recordedAt, run.recordedAt)
  entries.delete('guest')
  assert.equal(observe().record.lastRun.score, 420)
  entries.delete(prefix + 'earned')
  assert.equal(observe().record, null)
})

test('vertical-first jumps hold real movement until the feet clear the lip, without completing early', () => {
  const step = { kind: 'jump', x: 610, y: 512, fromY: 584, riseBeforeMoveY: 506, airJumpDelayMs: 300 }
  const memory = {}
  const takeoff = decideStep(step, { player: player(560, 584) }, memory, 0)
  assert.equal(takeoff.jump, true)
  assert.equal(takeoff.direction, 0)
  assert.equal(decideStep(step, { player: player(560, 520, -180) }, memory, 200).direction, 0)
  const clear = decideStep(step, { player: player(560, 503, -60) }, memory, 300)
  assert.equal(clear.direction, 1)
  assert.equal(clear.jump, true)
  assert.equal(clear.done, false)
  assert.equal(decideStep(step, { player: player(605, 490, 120) }, memory, 700).done, false)
  assert.equal(decideStep(step, { player: player(605, 512) }, memory, 800).done, true)
})

test('jump-strike policies use bounded real jumps and require actual enemy death', () => {
  const step = { kind: 'fight', enemyId: 'barrel', minX: 1784, maxX: 2120, jumpStrikeY: 584 }
  const debug = { player: Object.freeze(player(1900, 584)),
    enemies: [Object.freeze({ id: 'barrel', alive: true, x: 1995, y: 589, health: 4 })] }
  const memory = {}
  const action = decideStep(step, debug, memory, 0)
  assert.equal(action.jump, true)
  assert.equal(action.attack, true)
  assert.equal(action.done, false)
  assert.equal(decideStep(step, debug, memory, 100).jump, false)
  assert.equal(decideStep(step, { ...debug, player: player(1950, 500, -30) }, memory, 600).jump, false)
  assert.equal(debug.enemies[0].health, 4)
  const leftEdge = { ...debug, player: player(1780, 584), enemies: [{ id: 'barrel', alive: true, x: 1760, y: 584 }] }
  assert.equal(decideStep(step, leftEdge, {}, 0).direction, 1)
  const rightEdge = { ...debug, player: player(2130, 584) }
  assert.equal(decideStep(step, rightEdge, {}, 0).direction, -1)
  assert.equal(decideStep(step, { ...debug, enemies: [{ ...debug.enemies[0], alive: false }] }, {}, 0).done, true)
})

test('new movement parameters reject malformed thresholds and unsafe unbounded jump fights', () => {
  const last = BUILTIN_POLICIES[0].steps.at(-1)
  for (const step of [
    { id: 'bad-rise', kind: 'jump', x: 610, y: 512, fromY: 584, riseBeforeMoveY: 584 },
    { id: 'bad-min', kind: 'fight', enemyId: 'barrel', minX: 2200, maxX: 2120 },
    { id: 'no-bounds', kind: 'fight', enemyId: 'barrel', jumpStrikeY: 584 },
    { id: 'bad-height', kind: 'fight', enemyId: 'barrel', minX: 1784, maxX: 2120, jumpStrikeY: -1 },
  ]) assert.throws(() => validatePolicy({ ...BUILTIN_POLICIES[0], steps: [step, last] }))
})

test('L5 lip stages and Moonheart approach, and L6 opening jump fights match authored geometry', async () => {
  const levels = await readAuthoredMidCampaign()
  const fair = levels.find(level => level.id === 'level-5')
  const mastery = EXTENDED_ROUTE_POLICIES.find(policy => policy.levelId === fair.id && policy.mode === 'mastery')
  const retreat = mastery.steps.find(step => step.id === 'cache-return')
  const hidden = fair.platforms.find(platform => platform.id === 'fair-hidden-crouch-step-a')
  assert.ok(retreat.x + 12 + 16.38 < hidden.x)
  for (const [stepId, lip] of [['canopy-step', hidden], ['canopy-cache', fair.crouchGates[0]]]) {
    const step = mastery.steps.find(step => step.id === stepId)
    assert.equal(step.y, lip.y)
    assert.equal(step.riseBeforeMoveY, lip.y - 6)
  }
  for (const policy of EXTENDED_ROUTE_POLICIES.filter(policy => policy.levelId === fair.id)) {
    const jumpIndex = policy.steps.findIndex(step => step.id === 'high-archer-perch')
    assert.equal(policy.steps[jumpIndex].x, fair.boosts[0].x)
    assert.equal(policy.steps[jumpIndex].airJumpDelayMs, 350)
    assert.equal(policy.steps[jumpIndex + 1].enemyId, 'fair-high-archer')
  }
  const yard = levels.find(level => level.id === 'level-6')
  for (const policy of EXTENDED_ROUTE_POLICIES.filter(policy => policy.levelId === yard.id)) {
    const fights = policy.steps.filter(step => step.jumpStrikeY !== undefined)
    assert.deepEqual(fights.map(step => step.enemyId), ['yard-bandit-scout-a', 'yard-sentry-a', 'yard-barrel-a'])
    for (const step of fights) assert.ok(yard.platforms.some(platform => platform.y === step.jumpStrikeY
      && platform.x < step.minX - 16.38 && platform.x + platform.width > step.maxX + 16.38))
  }
})

test('L6 normal omits only optional high fights, keeps ground encounters, and mastery retains both archers', async () => {
  const yard = (await readAuthoredMidCampaign()).find(level => level.id === 'level-6')
  const normal = EXTENDED_ROUTE_POLICIES.find(policy => policy.levelId === yard.id && policy.mode === 'normal')
  const mastery = EXTENDED_ROUTE_POLICIES.find(policy => policy.levelId === yard.id && policy.mode === 'mastery')
  const skipped = yard.enemies.filter(enemy => !normal.steps.some(step => step.enemyId === enemy.id))
  assert.deepEqual(skipped.map(enemy => enemy.id), ['yard-high-archer', 'yard-perch-archer'])
  assert.ok(skipped.every(enemy => !(yard.requiredEnemyIds ?? []).includes(enemy.id)))
  for (const enemy of skipped) assert.ok(mastery.steps.some(step => step.enemyId === enemy.id))
  const road = normal.steps.find(step => step.id === 'lower-road-east')
  const floor = yard.platforms.find(platform => platform.id === 'yard-high-recovery')
  const shield = normal.steps.find(step => step.pickupId === 'yard-shield-high-archer')
  assert.equal(road.y, floor.y)
  assert.equal(shield.y, floor.y)
  assert.ok(floor.x < shield.x && floor.x + floor.width > road.x)
  const overhead = yard.platforms.filter(platform => platform.x < road.x && platform.x + platform.width > shield.x && platform.y < floor.y)
  assert.ok(overhead.every(platform => floor.y - (platform.y + platform.height) > 54.6))
  assert.ok(road.y - yard.platforms.find(platform => platform.id === 'yard-high-step-c').y > 180)
  assert.equal(normal.steps.find(step => step.id === 'mid-floor').airJumpDelayMs, undefined)
  const perch = yard.platforms.find(platform => platform.id === 'yard-archer-perch')
  const takeoff = normal.steps.find(step => step.id === 'gear-east-takeoff')
  assert.ok(takeoff.x - 12 - 16.38 > perch.x + perch.width)
  const normalJump = normal.steps.find(step => step.id === 'gauntlet-tilt')
  assert.equal(normalJump.fromY, 584)
  const masteryTakeoff = mastery.steps.find(step => step.id === 'perch-takeoff')
  assert.ok(masteryTakeoff.x + 12 + 16.38 < perch.x)
  assert.equal(mastery.steps.find(step => step.id === 'archer-perch').riseBeforeMoveY, perch.y - 6)
})

test('mode flags and dry output keep normal/mastery cases separate', async t => {
  t.mock.method(console, 'log', () => {})
  const report = await main(['--dry-run', '--levels=level-2,level-3,level-4', '--modes=normal,mastery'])
  assert.equal(report.policies.length, 6)
  assert.equal(report.gameplayProven, false)
  for (const modes of ['--modes=cheat', '--modes=normal,normal']) assert.throws(() => parseArgs([modes]))
})

test('relic decisions require valid scene counts plus supported arrival and only use bounded real jumps', () => {
  for (const [counter, totalField] of [['moonShards', 'totalMoonShards'], ['objectiveItems', 'totalObjectiveItems'], ['masteryItems', 'totalMasteryItems']]) {
    const step = { kind: 'relic', counter, minCount: 1, x: 3060, y: 278 }
    const debug = { player: Object.freeze({ ...player(3060, 278), [counter]: 0, [totalField]: 3 }) }
    const memory = {}
    assert.equal(decideStep(step, debug, memory, 0).jump, true)
    assert.equal(decideStep(step, debug, memory, 100).jump, false)
    assert.equal(decideStep(step, debug, memory, 900).jump, true)
    assert.equal(decideStep(step, debug, memory, 1800).jump, true)
    assert.equal(decideStep(step, debug, memory, 2700).jump, false)
    assert.equal(decideStep(step, debug, memory, 3000).done, false)
    assert.equal(decideStep({ ...step, crouch: true }, debug, {}, 0).jump, false)
    assert.equal(debug.player[counter], 0)
    const collected = { player: { ...debug.player, [counter]: 1 } }
    assert.equal(decideStep(step, collected, {}, 0).done, true)
    assert.equal(decideStep(step, { player: { ...collected.player, x: 3000 } }, {}, 0).done, false)
    assert.equal(decideStep(step, { player: { ...collected.player, velocityY: 100 } }, {}, 0).done, false)
    assert.equal(decideStep(step, { player: { ...collected.player, bodyBottom: 220 } }, {}, 0).done, false)
    for (const value of [undefined, NaN, Infinity, -1, 0.5, '1', 4]) {
      assert.throws(() => decideStep(step, { player: { ...debug.player, [counter]: value } }, {}, 0), /relic readback/)
    }
    assert.throws(() => decideStep(step, { player: player(3060, 278) }, {}, 0), /relic readback/)
    assert.throws(() => decideStep({ ...step, minCount: 4 }, debug, {}, 0), /observed total/)
  }
})

test('relic policy validation rejects missing declarations, unsafe fields and incomplete required routes', () => {
  for (const change of [
    value => { value.steps.find(step => step.kind === 'relic').counter = 'health' },
    value => { value.steps.find(step => step.kind === 'relic').counter = '__proto__' },
    value => { value.steps.find(step => step.kind === 'relic').minCount = 0 },
    value => { value.steps.find(step => step.kind === 'relic').minCount = 1.5 },
    value => { value.steps.find(step => step.kind === 'relic').minCount = 4 },
    value => { value.steps.find(step => step.kind === 'relic').health = 12 },
    value => { value.steps.find(step => step.kind === 'relic').x = Infinity },
    value => { delete value.requirements },
    value => { value.requirements.moonShards = -1 },
    value => { value.requirements.health = 12 },
    value => { value.requirements.requiredEnemyIds = ['not-a-chosen-enemy'] },
    value => { value.requirements.requiredEnemyIds = ['causeway-stalker-a', 'causeway-stalker-a'] },
    value => { value.steps = value.steps.filter(step => step.id !== 'moon-shard-final-perch') },
    value => { value.steps.find(step => step.id === 'moon-shard-crawl-route').minCount = 1 },
  ]) {
    const copy = structuredClone(CAUSEWAY_ROUTE_POLICIES[0])
    change(copy)
    assert.throws(() => validatePolicy(copy))
  }
})

test('declared relic totals are checked at clean start and completion, without making optional enemies mandatory', () => {
  const requirements = { moonShards: 3, objectiveItems: 0, masteryItems: 0, requiredEnemyIds: ['gate'] }
  const debug = { player: { ...player(118, 616), moonShards: 0, totalMoonShards: 3,
    objectiveItems: 0, totalObjectiveItems: 0, masteryItems: 0, totalMasteryItems: 0 },
    enemies: [{ id: 'gate', alive: true }, { id: 'optional', alive: true }] }
  assert.doesNotThrow(() => assertRouteRequirements(debug, requirements, 'initial'))
  assert.throws(() => assertRouteRequirements(debug, requirements, 'complete'), /Unmet complete requirement/)
  assert.throws(() => assertRouteRequirements({ ...debug, player: { ...debug.player, moonShards: 1 } }, requirements, 'initial'), /Unmet initial/)
  assert.throws(() => assertRouteRequirements({ ...debug, player: { ...debug.player, totalMoonShards: 4 } }, requirements, 'initial'), /total changed/)
  const finished = { ...debug, player: { ...debug.player, moonShards: 3 },
    enemies: [{ id: 'gate', alive: false }, debug.enemies[1]] }
  assert.doesNotThrow(() => assertRouteRequirements(finished, requirements, 'complete'))
  assert.throws(() => assertRouteRequirements({ ...finished, enemies: debug.enemies }, requirements, 'complete'), /required enemy/)
  assert.throws(() => assertRouteRequirements({ ...finished, player: { ...finished.player, moonShards: undefined } }, requirements, 'complete'), /relic readback/)
  assert.throws(() => decideStep({ kind: 'power', power: 'surge', x: 118, y: 616 }, debug, {}, 0), /power readback/)
})

test('L7 dry validation uses all relic and surge steps and hashes its standalone module without browser proof', async t => {
  t.mock.method(console, 'log', () => {})
  const report = await main(['--dry-run', '--levels=level-7', '--modes=normal', '--timeout-ms=240000'])
  assert.equal(report.gameplayProven, false)
  assert.equal(report.policies[0], CAUSEWAY_ROUTE_POLICIES[0])
  assert.equal(report.policies[0].steps.filter(step => step.kind === 'relic').length, 3)
  assert.equal(report.policies[0].steps.filter(step => step.kind === 'power' && step.power === 'surge').length, 3)
  assert.equal(report.causewayPoliciesSha256, createHash('sha256').update(await readFile(new URL('../scripts/shadow-runner-causeway-route-policies.mjs', import.meta.url))).digest('hex'))
})

test('mastery rejects missing/duplicate coins, incomplete enemy catalog and invalid milestones', () => {
  const original = EXTENDED_ROUTE_POLICIES.find(policy => policy.mode === 'mastery')
  for (const change of [
    policy => policy.steps.splice(0, 1),
    policy => { policy.steps.find(step => step.coinId === 'coin-2').coinId = 'coin-1' },
    policy => { policy.steps.find(step => step.coinId === 'coin-2').minCoins = 1 },
    policy => { policy.steps = policy.steps.filter(step => step.enemyId !== 'market-gate-sentry') },
    policy => { policy.expected.enemyIds.push(policy.expected.enemyIds[0]) },
  ]) {
    const policy = structuredClone(original)
    change(policy)
    assert.throws(() => validatePolicy(policy))
  }
})

test('collection uses observed counts, bounded real jumps and never jumps while crouched', () => {
  const step = { kind: 'collect', x: 288, y: 424, minCoins: 1 }
  const debug = { player: player(288, 424) }
  const memory = {}
  assert.equal(decideStep(step, debug, memory, 0).jump, true)
  assert.equal(decideStep(step, debug, memory, 100).jump, false)
  assert.equal(decideStep(step, debug, memory, 900).jump, true)
  assert.equal(decideStep(step, debug, memory, 1800).jump, true)
  assert.equal(decideStep(step, debug, memory, 2700).jump, false)
  assert.equal(decideStep(step, debug, memory, 3000).done, false)
  assert.equal(debug.player.coins, 0)
  debug.player.coins = 1
  assert.equal(decideStep(step, debug, memory, 3100).done, true)
  debug.player.coins = 0
  assert.equal(decideStep({ ...step, crouch: true }, debug, {}, 0).jump, false)
  assert.equal(decideStep(step, { player: player(260, 424) }, {}, 0).direction, 1)
})

test('mastery requires matching persisted full clear totals and observed dead enemies', () => {
  const policy = EXTENDED_ROUTE_POLICIES.find(policy => policy.mode === 'mastery')
  const start = '2026-09-08T12:00:00Z'
  const observation = { debug: { levelId: policy.levelId, player: { ...player(3330, 398), coins: 12 },
    enemies: policy.expected.enemyIds.map(id => ({ id, alive: false })) }, dialogs: [{ title: 'Full Clear' }],
    record: { lastRun: { recordedAt: '2026-09-08T12:00:01Z', score: 0, coinsCollected: 12,
      totalCoins: 12, enemiesDefeated: 3, totalEnemies: 3, fullClear: true } } }
  assert.equal(hasMasteryEvidence(observation, policy, start), true)
  for (const change of [
    value => { value.dialogs = [{ title: 'Level Complete' }] },
    value => { value.record.lastRun.fullClear = false },
    value => { value.record.lastRun.totalCoins = 13 },
    value => { value.record.lastRun.enemiesDefeated = 2 },
    value => { value.debug.enemies[0].alive = true },
    value => { value.debug.enemies[0].id = 'not-the-catalog-enemy' },
  ]) {
    const value = structuredClone(observation)
    change(value)
    assert.equal(hasMasteryEvidence(value, policy, start), false)
  }
})
