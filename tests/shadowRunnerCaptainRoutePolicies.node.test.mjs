import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { CAPTAIN_ROUTE_POLICIES } from '../scripts/shadow-runner-captain-route-policies.mjs'
import { CAUSEWAY_RELIC_STEP_CONTRACT } from '../scripts/shadow-runner-causeway-route-policies.mjs'
import { assertRouteRequirements, decideStep, validatePolicy } from '../scripts/shadow-runner-route-proof.mjs'

// Evaluate the real pure config factories, including generated coin lines and constant roof heights.
function readAuthoredLevel() {
  const require = createRequire(import.meta.url)
  const previous = require.extensions['.ts']
  require.extensions['.ts'] = (module, filename) => {
    module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, filename)
  }
  try {
    return require(fileURLToPath(new URL('../src/features/games/shadow-runner/game/levelNine.ts', import.meta.url))).SHADOW_RUNNER_LEVEL_NINE
  } finally {
    if (previous) require.extensions['.ts'] = previous
    else delete require.extensions['.ts']
  }
}

const level = readAuthoredLevel()
const policy = CAPTAIN_ROUTE_POLICIES[0]
const stepById = id => policy.steps.find(step => step.id === id)
const stepIndex = id => policy.steps.findIndex(step => step.id === id)
const crests = policy.steps.filter(step => step.kind === 'relic')
const fights = policy.steps.filter(step => step.kind === 'fight')
const heroScale = 0.78
const halfWidth = 42 * heroScale / 2
const standingHeight = 70 * heroScale
const crouchHeight = 48 * heroScale * 0.72
const player = (x, bodyBottom, extra = {}) => ({ x, y: bodyBottom, bodyBottom, velocityY: 0, ...extra })
const counterPlayer = (step, count, extra = {}) => player(step.x, step.y, { objectiveItems: count, totalObjectiveItems: 4, ...extra })
const beforeSpanWardMove = step => step.pickupId === 'captain-shield-span' ? { ...step, x: 13760 } : step
const beforeSpanApronFight = step => step.id === 'fight-captain-pikeman-span'
  ? { ...step, maxX: 14100, jumpStrikeY: 616 } : step
const beforeMurderFireResponse = step => {
  if (!['murder-crawl-entry', 'murder-jester-approach', 'fight-captain-jester-murder'].includes(step.id)) return step
  const original = { ...step }
  delete original.floorHazardBounds
  delete original.attackEnemyIds
  if (step.id === 'fight-captain-jester-murder') delete original.crouch
  return original
}

test('Captain Gate normal is one standalone candidate matching the authored world and reward catalog', () => {
  assert.equal(CAPTAIN_ROUTE_POLICIES.length, 2)
  const beforeBridgeWard = { ...policy, steps: policy.steps.filter(step => step.pickupId !== 'captain-shield-murder-bridge')
    .map(beforeSpanWardMove).map(beforeMurderFireResponse).map(beforeSpanApronFight) }
  assert.equal(createHash('sha256').update(JSON.stringify(beforeBridgeWard)).digest('hex'),
    'bbe50b194112cd108e36996d07ec6bdd0586b905938dda4a7dd74cd9ea9807b7')
  assert.equal(policy.levelId, level.id)
  assert.equal(policy.mode, 'normal')
  assert.equal(policy.candidateOnly, true)
  assert.equal(policy.title, level.title)
  assert.equal(policy.worldWidth, level.worldWidth)
  assert.deepEqual(policy.start, { x: level.playerStart.x, y: level.playerStart.y })
  assert.equal(policy.expected.coins, level.coins.length)
  assert.deepEqual(policy.expected.enemyIds, level.enemies.map(enemy => enemy.id))
  assert.equal(validatePolicy(policy), policy)
  assert.equal(new Set(policy.steps.map(step => step.id)).size, policy.steps.length)
  assert.ok(policy.steps.length <= 150)
  assert.match(policy.scope, /No all-coin\/all-enemy, browser, survival or recovery proof/)
})

test('Murder Hall fire response stays on a continuous supported lower corridor and retains the jester fight', () => {
  const floor = level.platforms.find(p => p.id === 'captain-murder-exit')
  const guarded = policy.steps.filter(step => step.floorHazardBounds)
  assert.deepEqual(guarded.map(step => step.id), ['murder-crawl-entry', 'murder-jester-approach', 'fight-captain-jester-murder'])
  for (const step of guarded) {
    assert.deepEqual(step.floorHazardBounds, { minX: 6112, maxX: 6500, y: 616 })
    assert.equal(step.crouch, true)
    assert.equal(step.jumpStrikeY, undefined)
    const { minX, maxX, y } = step.floorHazardBounds
    assert.ok(minX - halfWidth > floor.x)
    assert.ok(maxX + halfWidth < floor.x + floor.width)
    assert.equal(y, floor.y)
    for (let x = minX; x <= maxX; x += 2) {
      const body = { left: x - halfWidth, right: x + halfWidth, top: y - crouchHeight, bottom: y }
      assert.ok(![...level.platforms, ...level.crouchGates, ...level.spikes].some(p =>
        body.left < p.x + p.width && body.right > p.x && body.top < p.y + p.height && body.bottom > p.y))
    }
  }
  assert.deepEqual(stepById('murder-jester-approach').attackEnemyIds, ['captain-jester-murder'])
  assert.ok(stepIndex('fight-captain-jester-murder') < stepIndex('checkpoint-murder'))
})

test('the added bridge ward is observed after the archer and before the exposed crossing', () => {
  const step = stepById('power-captain-shield-murder-bridge')
  const pickup = level.shieldPickups.find(item => item.id === step.pickupId)
  assert.equal(stepIndex(step.id), stepIndex('fight-captain-archer-murder') + 1)
  assert.equal(stepIndex('murder-tilt-takeoff'), stepIndex(step.id) + 1)
  assert.deepEqual(pickup, { id: step.pickupId, x: 5600, y: 558, durationMs: 9000, guardCharges: 4, scoreValue: 0 })
  assert.equal(step.x, pickup.x)
  assert.equal(step.y, 616)
  assert.equal(pickup.healthRestore, undefined)
  assert.equal(decideStep(step, { player: player(step.x, step.y, { shieldActive: false }) }, {}, 0).done, false)
  assert.equal(decideStep(step, { player: player(step.x, step.y, { shieldActive: true }) }, {}, 0).done, true)
})

test('the four required Watchfire Crests use the existing strict objectiveItems contract, not optional Orders', () => {
  assert.equal(level.objectivePickups.length, 4)
  assert.equal(level.masteryPickups.length, 6)
  assert.deepEqual(crests.map(step => step.id), level.objectivePickups.map(pickup => pickup.id))
  assert.deepEqual(crests.map(step => step.minCount), [1, 2, 3, 4])
  assert.equal(policy.requirements.objectiveItems, 4)
  assert.equal(Object.hasOwn(policy.requirements, 'masteryItems'), false)
  assert.equal(Object.hasOwn(policy.requirements, 'moonShards'), false)
  for (const step of crests) {
    assert.equal(step.counter, 'objectiveItems')
    assert.ok(CAUSEWAY_RELIC_STEP_CONTRACT.counters.includes(step.counter))
    assert.ok(Object.keys(step).every(field => CAUSEWAY_RELIC_STEP_CONTRACT.fields.includes(field)))
    const pickup = level.objectivePickups.find(pickup => pickup.id === step.id)
    assert.equal(step.x, pickup.x)
    assert.ok(pickup.y + 18 > step.y - 54.6 && pickup.y - 18 < step.y)
  }
  assert.equal(policy.steps.some(step => step.kind === 'collect' || step.counter === 'masteryItems'), false)
  assert.equal(policy.steps.some(step => level.masteryPickups.some(pickup => pickup.id === step.id || pickup.id === step.pickupId)), false)
})

test('crest steps need both grounded arrival and honest observed count, including bounded pickup hops', () => {
  for (const step of crests) {
    const memory = {}
    assert.equal(decideStep(step, { player: counterPlayer(step, step.minCount - 1) }, memory, 0).done, false)
    assert.equal(decideStep(step, { player: counterPlayer(step, step.minCount) }, {}, 0).done, true)
    assert.equal(decideStep(step, { player: counterPlayer(step, step.minCount, { x: step.x - 40 }) }, {}, 0).done, false)
    assert.equal(decideStep(step, { player: counterPlayer(step, step.minCount, { velocityY: 100 }) }, {}, 0).done, false)
  }
  const memory = {}
  const step = crests[0]
  const jumps = [0, 450, 900, 1800, 2700, 3600].map(now => decideStep(step, { player: counterPlayer(step, 0) }, memory, now).jump)
  assert.equal(jumps.filter(Boolean).length, 3)
  assert.equal(decideStep({ ...step, crouch: true }, { player: counterPlayer(step, 0) }, {}, 0).jump, false)
})

test('missing, fractional, negative or impossible objective observations fail closed', () => {
  const step = crests[0]
  for (const extra of [
    { objectiveItems: undefined }, { totalObjectiveItems: undefined }, { objectiveItems: -1 },
    { objectiveItems: 0.5 }, { objectiveItems: NaN }, { objectiveItems: Infinity },
    { objectiveItems: 5 }, { totalObjectiveItems: 0 }, { totalObjectiveItems: 4.5 },
  ]) assert.throws(() => decideStep(step, { player: counterPlayer(step, 0, extra) }, {}, 0))
  for (const extra of [
    { counter: 'health' }, { counter: 'coins' }, { minCount: 0 }, { minCount: 5 }, { minCount: 1.5 },
    { x: NaN }, { crouch: 'yes' }, { health: 12 }, { teleport: true }, { timeoutMs: 60000 },
  ]) {
    const changed = { ...policy, steps: policy.steps.map(item => item === step ? { ...item, ...extra } : item) }
    assert.throws(() => validatePolicy(changed))
  }
})

test('ordinary finish requires all crests and the seven sealed/finish enemies, not six mastery pickups', () => {
  const expected = [...new Set([...level.encounters.filter(encounter => encounter.sealed).flatMap(encounter => encounter.enemyIds), ...level.requiredEnemyIds])]
  assert.deepEqual(policy.requirements.requiredEnemyIds, expected)
  assert.equal(expected.length, 7)
  const snapshot = {
    player: { objectiveItems: 4, totalObjectiveItems: 4, masteryItems: 0, totalMasteryItems: 6 },
    enemies: level.enemies.map(enemy => ({ id: enemy.id, alive: !expected.includes(enemy.id) })),
  }
  assert.doesNotThrow(() => assertRouteRequirements(snapshot, policy.requirements, 'complete'))
  for (const id of expected) {
    assert.equal(fights.filter(step => step.enemyId === id).length, 1)
    assert.throws(() => assertRouteRequirements({ ...snapshot, enemies: snapshot.enemies.map(enemy => enemy.id === id ? { ...enemy, alive: true } : enemy) }, policy.requirements, 'complete'))
  }
  assert.throws(() => assertRouteRequirements({ ...snapshot, player: { objectiveItems: 3, totalObjectiveItems: 4 } }, policy.requirements, 'complete'))
  assert.throws(() => assertRouteRequirements({ ...snapshot, player: { objectiveItems: 4, totalObjectiveItems: 5 } }, policy.requirements, 'complete'))
  assert.doesNotThrow(() => assertRouteRequirements({ ...snapshot, player: { objectiveItems: 0, totalObjectiveItems: 4 } }, policy.requirements, 'initial'))
  assert.throws(() => assertRouteRequirements(snapshot, policy.requirements, 'initial'))
  assert.ok(fights.every(step => level.enemies.some(enemy => enemy.id === step.enemyId)))
})

test('all nine checkpoints have actual supported arrivals inside their spatial windows', () => {
  const steps = policy.steps.filter(step => step.id.startsWith('checkpoint-'))
  assert.equal(steps.length, level.checkpoints.length)
  for (const [index, checkpoint] of level.checkpoints.entries()) {
    const step = steps[index]
    assert.ok(step.x - 12 >= checkpoint.x && step.x + 12 <= checkpoint.x + checkpoint.triggerWidth, checkpoint.id)
    assert.ok(step.y >= checkpoint.minY && step.y <= checkpoint.maxY, checkpoint.id)
    assert.ok(level.platforms.some(rect => step.x - 12 >= rect.x && step.x + 12 <= rect.x + rect.width && step.y === rect.y), checkpoint.id)
  }
})

test('all stationary targets have full supported arrival bands and are outside solids/hazards without narrow landing exceptions', () => {
  const solids = [...level.platforms, ...level.tiltPlatforms, ...level.crouchGates]
  for (const step of policy.steps.filter(step => Number.isFinite(step.x))) {
    const height = step.crouch ? crouchHeight : standingHeight
    const tolerance = step.kind === 'jump' ? 18 : 12
    for (const x of [step.x - tolerance, step.x, step.x + tolerance]) {
      for (let footX = x - halfWidth; footX <= x + halfWidth; footX += halfWidth) {
        assert.ok(solids.some(rect => rect.x <= footX && rect.x + rect.width >= footX && rect.y === step.y), `Unsupported ${step.id} at${footX}`)
      }
      assert.ok(!solids.some(rect => x + halfWidth > rect.x && x - halfWidth < rect.x + rect.width
        && step.y > rect.y && step.y - height < rect.y + rect.height), `Embedded ${step.id} at${x}`)
      assert.ok(!level.spikes.some(rect => x + halfWidth > rect.x && x - halfWidth < rect.x + rect.width
        && step.y > rect.y && step.y - height < rect.y + rect.height), `Hazard ${step.id} at${x}`)
    }
  }
})

test('normal fixed floor targets do not park the runner inside a moving lift shaft', () => {
  for (const step of policy.steps.filter(step => Number.isFinite(step.x) && step.y === 616)) {
    const tolerance = step.kind === 'jump' ? 18 : 12
    for (const lift of level.movingPlatforms) {
      assert.ok(step.x + tolerance + halfWidth <= lift.x
        || step.x - tolerance - halfWidth >= lift.x + lift.width, `${step.id} overlaps ${lift.id}`)
    }
  }
  assert.equal(stepById('banner-mid').x, 7900)
  assert.ok(stepById('banner-mid').x - stepById('banner-tilt-edge').x <= 320)
})

test('Moonwell bridge landing leaves a full arrival band beyond the moving lift shaft', () => {
  const bridge = level.tiltPlatforms.find(item => item.id === 'captain-tilt-moonwell')
  const lift = level.movingPlatforms.find(item => item.id === 'captain-lift-moonwell')
  for (const id of ['moonwell-tilt', 'moonwell-tilt-edge']) {
    const step = stepById(id)
    const tolerance = step.kind === 'jump' ? 18 : 12
    assert.ok(step.x - tolerance - halfWidth >= lift.x + lift.width, `${id} parks in the lift shaft`)
    assert.ok(step.x + tolerance + halfWidth <= bridge.x + bridge.width, `${id} exceeds the visible deck`)
    assert.equal(step.y, bridge.y)
  }
  assert.deepEqual(stepById('moonwell-crossing-calm'), {
    id: 'moonwell-crossing-calm', kind: 'wind-cycle', zoneId: 'captain-wind-moonwell',
    x: 11860, y: 616, crouch: true, timeoutMs: 5000,
  })
})

test('jump takeoffs match previous arrival height and all planned descents stay below fall-damage threshold', () => {
  let previousY = 616
  for (const step of policy.steps) {
    if (!Number.isFinite(step.x)) continue
    if (step.kind === 'jump') assert.equal(step.fromY, previousY, step.id)
    assert.ok(step.y - previousY < 330, step.id)
    previousY = step.y
  }
  assert.ok(policy.steps.filter(step => Number.isFinite(step.x)).every(step => step.y >= 496))
  for (const [id, platformId] of [
    ['span-step', 'captain-span-step-a'], ['arena-left-cover', 'captain-arena-cover-left'], ['arena-right-cover', 'captain-arena-cover-right'],
  ]) {
    const step = stepById(id)
    const takeoff = policy.steps[stepIndex(id) - 1]
    const platform = level.platforms.find(rect => rect.id === platformId)
    assert.ok(takeoff.x + 12 + halfWidth < platform.x)
    assert.equal(step.riseBeforeMoveY, platform.y - 6)
    const action = decideStep(step, { player: player(takeoff.x, step.fromY) }, {}, 0)
    assert.equal(action.jump, true)
    assert.equal(action.direction, 0)
  }
})

test('every crouch corridor enters before the roof and exits after it, without requested jump strikes beneath it', () => {
  for (const part of ['outer', 'signal', 'murder', 'barracks', 'moonwell', 'span']) {
    const roof = level.crouchGates.find(gate => gate.id === `captain-crouch-${part}`)
    const start = stepIndex(`${part}-crawl-entry`)
    const end = stepIndex(`${part}-crawl-exit`)
    const clearance = 616 - roof.y - roof.height
    assert.equal(clearance, 44)
    assert.ok(Math.abs(crouchHeight - 26.9568) < 0.001)
    assert.ok(clearance > crouchHeight && clearance < standingHeight)
    assert.ok(Math.abs(clearance - crouchHeight - 17.0432) < 0.001)
    assert.ok(policy.steps[start].x + 12 + halfWidth < roof.x)
    assert.ok(policy.steps[end].x - 12 - halfWidth > roof.x + roof.width)
    for (const step of policy.steps.slice(start, end + 1)) {
      if (step.kind === 'fight') assert.equal(step.jumpStrikeY, undefined, step.id)
      else assert.equal(step.crouch, true, step.id)
    }
  }
})

test('normal crosses the roof before fighting the restaged sentry without a forced jump strike', () => {
  const approach = stepById('outer-sentry-approach')
  const fight = stepById('fight-captain-sentry-outer')
  assert.deepEqual(approach, { id: 'outer-sentry-approach', kind: 'move', x: 1260, y: 616, crouch: true })
  assert.equal(stepIndex(fight.id), stepIndex(approach.id) + 1)
  assert.ok(stepIndex(fight.id) < stepIndex('outer-crawl-exit'))
  assert.equal(fight.minX, 1250)
  assert.equal(fight.maxX, 1390)
  assert.equal(fight.jumpStrikeY, undefined)
  const roof = level.crouchGates.find(item => item.id === 'captain-crouch-outer')
  assert.ok(approach.x - 12 - halfWidth > roof.x + roof.width)
  const action = decideStep(fight, { player: player(1260, 616),
    enemies: [{ id: 'captain-sentry-outer', alive: true, x: 1280, y: 616 }] }, {}, 0)
  assert.equal(action.attack, true)
  assert.equal(action.jump, false)
  assert.equal(action.done, false)
})

test('Moonwell Rival uses grounded sword distance on the clear west apron, not shelf-limited jump chasing', () => {
  const roof = level.crouchGates.find(item => item.id === 'captain-crouch-moonwell')
  const exit = stepById('moonwell-crawl-exit')
  const fight = stepById('fight-captain-rival-moonwell')
  assert.ok(exit.x - 12 - halfWidth > roof.x + roof.width)
  assert.ok(fight.minX - halfWidth > roof.x + roof.width)
  assert.equal(stepIndex(fight.id), stepIndex(exit.id) + 1)
  assert.equal(fight.minX, 13390)
  assert.equal(fight.maxX, 13480)
  assert.equal(fight.jumpStrikeY, undefined)
  assert.equal(fight.crouch, undefined)
  assert.equal(fight.timeoutMs, 30000)
  const low = level.platforms.find(item => item.id === 'captain-moonwell-east-low')
  const high = level.platforms.find(item => item.id === 'captain-moonwell-east-high')
  assert.ok(fight.maxX + halfWidth < low.x)
  assert.ok(616 - standingHeight > high.y + high.height)
  // The former east pursuit crosses the low shelf: only 31px of standing headroom remains.
  assert.ok(616 - standingHeight - (low.y + low.height) < 32)
  const action = decideStep(fight, { player: player(exit.x, 616),
    enemies: [{ id: fight.enemyId, alive: true, x: 13460, y: 616 }] }, { facing: 1 }, 0)
  assert.equal(action.jump, false)
  assert.equal(action.attack, true)
  assert.equal(action.direction, 0)
  assert.equal(action.done, false)
})

test('Rival trace approach stops closing after a sword hit and waits for the returning patrol within reach', () => {
  const fight = stepById('fight-captain-rival-moonwell')
  const snapshot = (x, enemyX, alive = true) => ({ player: player(x, 616),
    enemies: [{ id: fight.enemyId, alive, x: enemyX, y: 616 }] })
  // DFLQg13v at113067ms: first sword hit, then the old16px chase ran into contact.
  for (const [x, enemyX] of [[13397, 13433], [13413, 13436], [13390, 13466]]) {
    const action = decideStep(fight, snapshot(x, enemyX), { facing: 1 }, 0)
    assert.equal(action.direction, 0)
    assert.equal(action.jump, false)
    assert.equal(action.attack, true)
  }
  const rival = level.enemies.find(item => item.id === fight.enemyId)
  const anchor = fight.maxX - 12
  assert.ok(rival.patrolRight - anchor < 106)
  for (const enemyX of [rival.patrolRight, rival.patrolRight + 100]) {
    const action = decideStep(fight, snapshot(anchor, enemyX), { facing: 1 }, 0)
    assert.equal(action.direction, 0)
    assert.equal(action.jump, false)
    assert.equal(action.attack, enemyX - anchor <= 108)
    assert.equal(action.done, false)
  }
  assert.equal(decideStep(fight, snapshot(13527, 13560), { facing: 1 }, 0).direction, -1)
  assert.equal(decideStep(fight, snapshot(13381, 13443), {}, 0).direction, 1)
  const memory = { facing: 1 }
  const ready = snapshot(13390, 13460)
  assert.equal(decideStep(fight, ready, memory, 0).attack, true)
  assert.equal(decideStep(fight, ready, memory, 459).attack, false)
  assert.equal(decideStep(fight, ready, memory, 460).attack, true)
  assert.equal(decideStep(fight, snapshot(13390, 13460, false), {}, 0).done, true)
})

test('Rival and ward adjustments preserve mastery and the remaining Span and Inner strategy', () => {
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  assert.equal(hash(CAPTAIN_ROUTE_POLICIES[1]),
    'e65090ba6f7e0cfa590afd1bea1708338093aa931ecca02b4f80c2f565a6154e')
  assert.equal(hash(policy.steps.slice(stepIndex('power-captain-shield-span')).map(beforeSpanWardMove).map(beforeSpanApronFight)),
    'c25306e75c0be75655ca1663d8ebdfda4dc8ef2827f92e33f10257428ac8072f')
  assert.ok(stepIndex('fight-captain-rival-moonwell') < stepIndex('checkpoint-moonwell'))
  assert.equal(stepIndex('power-captain-shield-span'), stepIndex('checkpoint-moonwell') + 1)
  const ward = level.shieldPickups.find(pickup => pickup.id === 'captain-shield-span')
  assert.equal(stepById('power-captain-shield-span').x, ward.x)
  assert.equal(ward.x, 13540)
  assert.ok(ward.x + halfWidth + 12 < level.arrowVolleys.find(volley => volley.id === 'captain-volley-span-head').x)
})

test('Span pikeman inputs wait on supported ground west of the reversing gust', () => {
  const fight = stepById('fight-captain-pikeman-span')
  const wind = level.windZones.find(item => item.id === 'captain-wind-span')
  const floor = level.platforms.find(item => item.id === 'captain-span-entry')
  const enemy = level.enemies.find(item => item.id === fight.enemyId)
  assert.equal(260 + wind.direction * wind.force, -220)
  assert.equal(fight.minX, 13640)
  assert.equal(fight.maxX, 13670)
  assert.equal(fight.jumpStrikeY, undefined)
  assert.equal(fight.timeoutMs, 30000)
  assert.ok(fight.minX - halfWidth > floor.x)
  assert.ok(fight.maxX + halfWidth < wind.x)
  assert.ok(enemy.patrolLeft - (fight.maxX - 12) < 76)
  // Recorded WebKit enemy x13791..13770 is outside reach until its westward return.
  const memory = { facing: 1 }
  const snapshot = x => ({ player: player(13658, 616),
    enemies: [{ id: fight.enemyId, alive: true, x, y: 616 }] })
  const waiting = decideStep(fight, snapshot(13791), memory, 0)
  assert.equal(waiting.direction, 0)
  assert.equal(waiting.jump, false)
  assert.equal(waiting.attack, false)
  const returning = decideStep(fight, snapshot(enemy.patrolLeft), memory, 1000)
  assert.equal(returning.direction, 0)
  assert.equal(returning.jump, false)
  assert.equal(returning.attack, true)
  assert.equal(returning.done, false)
  assert.equal(decideStep(fight, { ...snapshot(enemy.patrolLeft),
    enemies: [{ id: fight.enemyId, alive: false }] }, {}, 1100).done, true)
})

test('Span ends the crawl before the recorded contact chain and only jump-strikes beyond the roof', () => {
  const roof = level.crouchGates.find(item => item.id === 'captain-crouch-span')
  const approach = stepById('span-grenadier-approach')
  const exit = stepById('span-crawl-exit')
  const fight = stepById('fight-captain-grenadier-span')
  assert.equal(approach.x, 15690)
  assert.equal(exit.x, approach.x)
  assert.equal(stepIndex(exit.id), stepIndex(approach.id) + 1)
  assert.equal(stepIndex(fight.id), stepIndex(exit.id) + 1)
  assert.ok(exit.x - 12 - halfWidth > roof.x + roof.width)
  assert.ok(fight.minX - halfWidth > roof.x + roof.width)
  assert.equal(fight.jumpStrikeY, 616)
  // D0hglRV2: at 141460ms x15678 was still healthy; x15687 then took contact damage.
  const beforeContact = player(15678, 616, { crouching: true })
  assert.equal(decideStep(approach, { player: beforeContact }, {}, 0).done, true)
  assert.equal(decideStep(exit, { player: beforeContact }, {}, 0).done, true)
  for (const [x, enemyX] of [[15678, 15715], [15715, 15702], [15715, 15694]]) {
    const action = decideStep(fight, { player: player(x, 616),
      enemies: [{ id: fight.enemyId, alive: true, x: enemyX, y: 616 }] }, {}, 0)
    assert.equal(action.jump, true)
    assert.equal(action.done, false)
  }
  assert.ok(stepIndex(fight.id) < stepIndex('checkpoint-span'))
})

test('Inner entry jumps from the cleared Span apron onto support west of the wind and Chrono', () => {
  const takeoff = stepById('checkpoint-span')
  const entry = stepById('inner-entry')
  const wind = level.windZones.find(item => item.id === 'captain-wind-inner')
  const fight = stepById('fight-captain-pikeman-inner')
  assert.equal(stepIndex(entry.id), stepIndex(takeoff.id) + 1)
  assert.equal(stepIndex(fight.id), stepIndex(entry.id) + 1)
  assert.equal(entry.kind, 'jump')
  assert.equal(entry.fromY, takeoff.y)
  assert.equal(entry.x, 15950)
  assert.equal(entry.y, 616)
  assert.equal(entry.extraAirJumpDelayMs, undefined)
  assert.ok(entry.x + 18 + halfWidth < wind.x)
  const delay = entry.airJumpDelayMs / 1000
  const rise = 620 * delay - 820 * delay ** 2
  const flight = delay + (560 + Math.sqrt(560 ** 2 + 3280 * rise)) / 1640
  assert.ok(entry.x - takeoff.x + 12 + 18 < flight * 260)
  const action = decideStep(entry, { player: player(takeoff.x, takeoff.y) }, {}, 0)
  assert.equal(action.jump, true)
  assert.equal(action.direction, 1)
  assert.equal(action.done, false)
})

test('Inner pikeman combat holds the west apron instead of pursuing into wind that reverses left input', () => {
  const fight = stepById('fight-captain-pikeman-inner')
  const wind = level.windZones.find(item => item.id === 'captain-wind-inner')
  const pikeman = level.enemies.find(item => item.id === fight.enemyId)
  const floor = level.platforms.find(item => item.id === 'captain-inner-entry')
  assert.equal(wind.x, 16000)
  assert.equal(wind.direction, 1)
  assert.equal(wind.force, 500)
  // D0hglRV2 at 146311..147147ms: held-left -260 + wind500 = rightward240.
  assert.equal(-260 + wind.force * wind.direction, 240)
  assert.equal(fight.minX, 15940)
  assert.equal(fight.maxX, 15970)
  assert.equal(fight.jumpStrikeY, 616)
  assert.equal(fight.timeoutMs, 30000)
  assert.ok(fight.minX - halfWidth > floor.x)
  assert.ok(fight.maxX + halfWidth < wind.x)
  assert.ok(pikeman.patrolLeft - (fight.maxX - 12) < 106)
  assert.ok(pikeman.x - stepById('inner-entry').x < pikeman.attackRange)
  for (const phase of [{ active: true, telling: false }, { active: false, telling: true },
    { active: false, telling: false }]) {
    const snapshot = { player: player(15958, 616),
      enemies: [{ id: fight.enemyId, alive: true, x: 16020, y: 616 }],
      windZones: [{ id: wind.id, direction: wind.direction, ...phase }] }
    const action = decideStep(fight, snapshot, { facing: 1 }, 0)
    assert.equal(action.direction, 0)
    assert.equal(action.attack, true)
    assert.equal(action.jump, true)
    assert.equal(action.done, false)
    const recover = decideStep(fight, { ...snapshot, player: player(15985, 616) }, { facing: 1 }, 0)
    assert.equal(recover.direction, -1)
    assert.equal(decideStep(fight, { ...snapshot,
      enemies: [{ ...snapshot.enemies[0], alive: false }] }, {}, 0).done, true)
  }
})

test('normal observes finite Chrono and Mirror Ward after the pikeman, without an unarmed pickup approach through it', () => {
  const fight = stepById('fight-captain-pikeman-inner')
  const chrono = stepById('power-captain-chrono-inner')
  const mirror = stepById('power-captain-mirror-inner')
  assert.equal(stepIndex(chrono.id), stepIndex(fight.id) + 1)
  assert.equal(stepIndex(mirror.id), stepIndex(chrono.id) + 1)
  assert.equal(stepIndex('inner-tilt-takeoff'), stepIndex(mirror.id) + 1)
  const chronoPickup = level.chronoPickups.find(item => item.id === chrono.pickupId)
  const mirrorPickup = level.mirrorWardPickups.find(item => item.id === mirror.pickupId)
  assert.equal(chrono.x, chronoPickup.x)
  assert.equal(mirror.x, mirrorPickup.x)
  assert.equal(chronoPickup.durationMs, 8500)
  assert.equal(chronoPickup.healthRestore, 2)
  assert.equal(mirrorPickup.durationMs, 10000)
  assert.equal(mirrorPickup.reflectionCharges, 5)
  for (const [step, field] of [[chrono, 'chronoActive'], [mirror, 'mirrorWardActive']]) {
    for (const active of [false, true]) {
      const action = decideStep(step, { player: player(step.x, step.y, { [field]: active }) }, {}, 0)
      assert.equal(action.done, active)
    }
    assert.throws(() => decideStep(step, { player: player(step.x, step.y) }, {}, 0))
  }
})

test('sealed encounters are explicitly fought before attempting their required exit', () => {
  for (const [encounterId, exitId] of [
    ['captain-encounter-barracks-seal', 'captain-watchfire-crest-2'],
    ['captain-encounter-inner-seal', 'inner-crest-gap-takeoff'],
    ['captain-encounter-finale', 'arena-right-cover-takeoff'],
  ]) {
    const encounter = level.encounters.find(item => item.id === encounterId)
    for (const id of encounter.enemyIds) assert.ok(stepIndex(`fight-${id}`) < stepIndex(exitId), id)
  }
  assert.ok(stepIndex('captain-watchfire-crest-4') < stepIndex('fight-captain-moonlit-final'))
})

test('Murder Hall archer approach ducks incoming arrows away from the landing edge', () => {
  const approach = stepById('murder-archer-approach')
  const fight = stepById('fight-captain-archer-murder')
  const floor = level.platforms.find(item => item.id === 'captain-murder-hall')
  assert.equal(approach.crouch, true)
  assert.equal(approach.y, floor.y)
  assert.ok(approach.x - 12 - halfWidth >= floor.x + 80)
  assert.equal(stepIndex(fight.id), stepIndex(approach.id) + 1)
  assert.ok(fight.minX - floor.x >= 80)
})

test('the barracks route uses a broad landing and an enclosed warden fight, not a barrier-clamped edge', async () => {
  const encounter = level.encounters.find(item => item.id === 'captain-encounter-barracks-seal')
  const floor = level.platforms.find(rect => rect.id === 'captain-barracks-exit')
  const warden = level.enemies.find(enemy => enemy.id === 'captain-warden-barracks')
  const wallLeft = encounter.x + encounter.width - 34 - 15
  const maximumStandingX = wallLeft - halfWidth
  const minimumStandingX = floor.x + halfWidth
  assert.ok(maximumStandingX - minimumStandingX > 600)
  assert.ok(warden.patrolRight + 30 < wallLeft)
  assert.equal(stepById('barracks-seal-lip'), undefined)
  const step = stepById('barracks-warden-floor')
  assert.ok(step.x - 18 - halfWidth > floor.x)
  assert.ok(step.x + 18 + halfWidth < wallLeft)
  const fight = stepById('fight-captain-warden-barracks')
  assert.ok(fight.minX - halfWidth > floor.x)
  assert.ok(fight.maxX + halfWidth < wallLeft)
  assert.equal(fight.jumpStrikeY, 616)
  assert.match(policy.risks[0], /not fresh real-input survival proof/)
  const landing = player(step.x, 616)
  assert.equal(decideStep(step, { player: landing }, { jumpAt: 0, leftGround: true }, 1000).done, true)
  assert.equal(decideStep(step, { player: { ...landing, velocityY: 200 } }, { jumpAt: 0, leftGround: true }, 1000).done, false)
  // Check the source contract used in the geometry calculation without loading Phaser or a browser.
  const runtime = await readFile(new URL('../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts', import.meta.url), 'utf8')
  assert.ok(runtime.includes('encounter.x + encounter.width - 34'))
  assert.ok(runtime.includes('{ x: x - 15, y: barrierTop, width: 30, height: barrierHeight }'))
  assert.ok(runtime.includes('this.physics.add.collider(this.player, this.encounterBarriers!)'))
})

test('power collection uses only supported observed activation flags at actual pickups', () => {
  const arrays = { shield: 'shieldPickups', chrono: 'chronoPickups', surge: 'surgePickups',
    'sunsteel-edge': 'sunsteelEdgePickups', 'mirror-ward': 'mirrorWardPickups' }
  const flags = { 'sunsteel-edge': 'sunsteelEdgeActive', 'mirror-ward': 'mirrorWardActive' }
  for (const step of policy.steps.filter(step => step.kind === 'power')) {
    const pickup = level[arrays[step.power]].find(item => item.id === step.pickupId)
    assert.ok(pickup, step.pickupId)
    assert.equal(step.x, pickup.x)
    assert.ok(step.y - 54.6 < pickup.y + 18 && step.y > pickup.y - 18)
    const flag = flags[step.power] ?? `${step.power}Active`
    assert.equal(decideStep(step, { player: player(step.x, step.y, { [flag]: false }) }, {}, 0).done, false)
    assert.equal(decideStep(step, { player: player(step.x, step.y, { [flag]: true }) }, {}, 0).done, true)
  }
})

test('boss combat stays between cover blocks and the finish requires a recorded result, never position alone', () => {
  const boss = stepById('fight-captain-moonlit-final')
  const left = level.platforms.find(rect => rect.id === 'captain-arena-cover-left')
  const right = level.platforms.find(rect => rect.id === 'captain-arena-cover-right')
  assert.ok(boss.minX - halfWidth > left.x + left.width)
  assert.ok(boss.maxX + halfWidth < right.x)
  assert.equal(boss.timeoutMs, 30000)
  const finish = policy.steps[policy.steps.length - 1]
  assert.equal(finish.kind, 'finish')
  assert.ok(finish.x > level.finish.x && finish.x < level.finish.x + level.finish.width)
  assert.ok(finish.y - 54.6 < level.finish.y + level.finish.height && finish.y > level.finish.y)
  assert.equal(decideStep(finish, { player: player(finish.x, finish.y) }, {}, 0).done, false)
})

test('the module is JSON-safe data only, with no scene/browser/QA writes or shared imports', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-captain-route-policies.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bimport\b|__shadowRunner|\bwindow\b|\bdocument\b|\bfetch\b|playwright|setPosition|setVelocity|writeFile|localStorage/)
  assert.deepEqual(JSON.parse(JSON.stringify(CAPTAIN_ROUTE_POLICIES)), CAPTAIN_ROUTE_POLICIES)
  const step = crests[0]
  const snapshot = Object.freeze({ player: Object.freeze(counterPlayer(step, 0)) })
  const before = JSON.stringify(snapshot)
  decideStep(step, snapshot, {}, 0)
  assert.equal(JSON.stringify(snapshot), before)
})

const mastery = CAPTAIN_ROUTE_POLICIES.find(item => item.mode === 'mastery')
const masteryStep = id => mastery.steps.find(step => step.id === id)
const masteryIndex = id => mastery.steps.findIndex(step => step.id === id)
const masteryCoins = mastery.steps.filter(step => step.kind === 'collect')
const masteryOrders = mastery.steps.filter(step => step.counter === 'masteryItems')
const blockedIds = new Set(mastery.blockedTransitions.map(item => item.stepId))
const masteryPlatforms = level.platforms
const masterySunsteel = level.sunsteelEdgePickups

test('mastery is a separate bounded source candidate, explicitly not a playable acceptance claim', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(mastery)).digest('hex'),
    'e65090ba6f7e0cfa590afd1bea1708338093aa931ecca02b4f80c2f565a6154e')
  assert.equal(validatePolicy(mastery), mastery)
  assert.equal(mastery.candidateOnly, true)
  assert.equal(mastery.routeStatus, 'integrated-candidate-awaiting-playthrough')
  assert.ok(mastery.steps.length <= 500)
  assert.match(mastery.scope, /90 coins, 28 enemies, four required Watchfire Crests and all six optional/)
  assert.match(mastery.risks.join(' '), /900000ms/)
  assert.match(mastery.risks.join(' '), /requires real-input acceptance replay/)
  assert.deepEqual(mastery.start, policy.start)
  assert.ok(mastery.steps.every(step => step.extraAirJumpDelayMs === undefined))
  assert.equal(mastery.configProposal.status, 'integrated')
  assert.equal(mastery.configProposal.platformAdditions.length, 7)
  for (const addition of mastery.configProposal.platformAdditions) {
    assert.deepEqual(level.platforms.find(item => item.id === addition.id), addition, 'Accepted access must exist unchanged in live config')
    assert.equal(addition.height, 34)
    assert.equal(addition.visualId, 'captain-medium-ledge')
  }
  assert.deepEqual(mastery.configProposal.pickupMoves, [])
  assert.deepEqual(mastery.configProposal.pickupAdditions, [{ id: 'captain-sunsteel-moonwell-order', x: 12820, y: 302,
    durationMs: 9000, healthRestore: 0, charges: 6, attackDamageBonus: 1, guardDamage: 2, reachBonus: 20, scoreValue: 0 }])
  for (const addition of mastery.configProposal.pickupAdditions) {
    assert.deepEqual(level.sunsteelEdgePickups.find(item => item.id === addition.id), addition)
  }
  assert.equal(level.sunsteelEdgePickups.length, 5)
  assert.deepEqual(level.sunsteelEdgePickups.find(item => item.id === 'captain-sunsteel-span'), {
    id: 'captain-sunsteel-span', x: 14000, y: 548, durationMs: 9000, healthRestore: 2,
    charges: 6, attackDamageBonus: 1, guardDamage: 2, reachBonus: 20, scoreValue: 250,
  })
})

test('mastery enumerates all 90 actual runtime coin IDs once with sequential observed milestones', () => {
  assert.equal(mastery.expected.coins, level.coins.length)
  assert.equal(masteryCoins.length, 90)
  assert.equal(new Set(masteryCoins.map(step => step.coinId)).size, 90)
  for (const [index, step] of masteryCoins.entries()) {
    assert.equal(step.minCoins, index + 1)
    const coin = level.coins[Number(step.coinId.slice(5)) - 1]
    assert.ok(coin, step.coinId)
    assert.ok(Math.abs(step.x - coin.x) <= 12, `${step.coinId} does not target ${coin.id}`)
  }
  assert.deepEqual([...masteryCoins.map(step => Number(step.coinId.slice(5)))].sort((a, b) => a - b),
    Array.from({ length: 90 }, (_, index) => index + 1))
  for (const bad of [
    { ...mastery, steps: mastery.steps.filter(step => step.id !== 'collect-coin-65') },
    { ...mastery, steps: mastery.steps.map(step => step.id === 'collect-coin-65' ? { ...step, coinId: 'coin-64' } : step) },
  ]) assert.throws(() => validatePolicy(bad))
})

test('mastery includes every enemy, four required crests and six optional Orders, not five', () => {
  assert.deepEqual(mastery.expected.enemyIds, level.enemies.map(enemy => enemy.id))
  const fights = mastery.steps.filter(step => step.kind === 'fight')
  assert.equal(fights.length, 28)
  assert.ok(level.enemies.every(enemy => fights.filter(step => step.enemyId === enemy.id).length === 1))
  assert.deepEqual(mastery.requirements.requiredEnemyIds, mastery.expected.enemyIds)
  assert.equal(mastery.requirements.objectiveItems, 4)
  assert.equal(mastery.requirements.masteryItems, 6)
  assert.deepEqual(mastery.steps.filter(step => step.counter === 'objectiveItems').map(step => step.id),
    level.objectivePickups.map(item => item.id))
  assert.deepEqual(masteryOrders.map(step => step.id), level.masteryPickups.map(item => item.id))
  assert.deepEqual(masteryOrders.map(step => step.minCount), [1, 2, 3, 4, 5, 6])
  for (const step of masteryOrders) {
    const pickup = level.masteryPickups.find(item => item.id === step.id)
    assert.equal(step.x, pickup.x)
    assert.ok(step.y > pickup.y - 18 && step.y - standingHeight < pickup.y + 18)
    assert.equal(decideStep(step, { player: player(step.x, step.y, { masteryItems: step.minCount - 1, totalMasteryItems: 6 }) }, {}, 0).done, false)
    assert.equal(decideStep(step, { player: player(step.x, step.y, { masteryItems: step.minCount, totalMasteryItems: 6 }) }, {}, 0).done, true)
  }
})

test('mastery coin heights all use actual stance contact or ordinary jumps with proposed Coin45/65 supports', () => {
  const gravity = 1640
  const firstRise = 620 ** 2 / (2 * gravity)
  const doubleRise = 620 * 0.35 - gravity * 0.35 ** 2 / 2 + 560 ** 2 / (2 * gravity)
  for (const step of masteryCoins) {
    const coin = level.coins[Number(step.coinId.slice(5)) - 1]
    const height = step.crouch ? crouchHeight : standingHeight
    const predecessor = mastery.steps[masteryIndex(step.id) - 1]
    const availableRise = step.crouch ? 0 : predecessor?.kind === 'jump' ? doubleRise : firstRise
    assert.ok(step.y - height - availableRise < coin.y + 18 && step.y > coin.y - 18,
      `No modeled pickup contact for ${step.coinId}`)
  }
  assert.equal(masteryStep('collect-coin-45').y, 430)
  assert.equal(masteryStep('collect-coin-65').y, 366)
})

test('mastery retains the inside-roof Jester stance and all nine real spatial checkpoints', () => {
  const fight = masteryStep('fight-captain-jester-murder')
  const before = mastery.steps[masteryIndex(fight.id) - 1]
  assert.equal(fight.jumpStrikeY, undefined)
  assert.equal(before.crouch, true)
  assert.ok(level.crouchGates.some(roof => before.x - halfWidth >= roof.x && before.x + halfWidth <= roof.x + roof.width))
  for (const checkpoint of level.checkpoints) {
    const step = masteryStep(checkpoint.id.replace('captain-', ''))
    assert.ok(step && step.x - 12 >= checkpoint.x && step.x + 12 <= checkpoint.x + checkpoint.triggerWidth)
    assert.ok(step.y >= checkpoint.minY && step.y <= checkpoint.maxY)
  }
  for (const [id, x] of [['checkpoint-signal', 4280], ['checkpoint-moonwell', 13400], ['checkpoint-span', 15700]]) {
    assert.equal(masteryStep(id).x, x)
    assert.equal(masteryStep(id).crouch, true)
  }
})

test('mastery fights the five restaged ground NPCs on clear supported aprons with finite real inputs', () => {
  for (const [part, role, x, patrolLeft, patrolRight] of [
    ['outer', 'sentry', 1280, 1250, 1380], ['signal', 'archer', 4280, 4280, 4280],
    ['barracks', 'grenadier', 10280, 10240, 10360], ['moonwell', 'rival', 13520, 13420, 13560],
    ['span', 'grenadier', 15750, 15700, 15860],
  ]) {
    const enemyId = `captain-${role}-${part}`
    const enemy = level.enemies.find(item => item.id === enemyId)
    assert.deepEqual([enemy.x, enemy.patrolLeft, enemy.patrolRight], [x, patrolLeft, patrolRight])
    const approach = masteryStep(`mastery-${part}-${role}-approach`)
    const fight = masteryStep(`fight-${enemyId}`)
    const roof = level.crouchGates.find(item => item.id === `captain-crouch-${part}`)
    assert.deepEqual([approach.x, approach.y, approach.crouch], [x, 616, false])
    assert.equal(masteryIndex(fight.id), masteryIndex(approach.id) + 1)
    assert.equal(fight.jumpStrikeY, 616)
    assert.equal(fight.timeoutMs, 30000)
    assert.ok(fight.minX <= patrolLeft && fight.maxX >= patrolRight)
    for (const center of [fight.minX - 12, approach.x - 12, approach.x + 12, fight.maxX + 12]) {
      assert.ok(center - halfWidth > roof.x + roof.width, enemyId)
      assert.ok(masteryPlatforms.some(rect => rect.y === 616
        && center - halfWidth >= rect.x && center + halfWidth <= rect.x + rect.width), enemyId)
      assert.ok(![...masteryPlatforms, ...level.crouchGates].some(rect => center + halfWidth > rect.x
        && center - halfWidth < rect.x + rect.width && 616 > rect.y && 616 - standingHeight < rect.y + rect.height), enemyId)
    }
    const action = decideStep(fight, { player: player(x, 616), enemies: [{ id: enemyId, alive: true, x, y: 616 }] }, {}, 0)
    assert.equal(action.attack, true)
    assert.equal(action.done, false)
    assert.equal(decideStep(fight, { player: player(x, 616), enemies: [{ id: enemyId, alive: false, x, y: 616 }] }, {}, 0).done, true)
    // Signal is fought on the east apron before the westward low-coin detour; the other four follow it.
    const exitIndex = masteryIndex(`mastery-${part}-crawl-exit`)
    assert.ok(part === 'signal' ? masteryIndex(fight.id) < masteryIndex('mastery-signal-crawl-entry')
      : masteryIndex(fight.id) > exitIndex)
  }
})

test('mastery preserves actual crouch-height contact through all six low-coin corridors', () => {
  for (const part of ['outer', 'signal', 'murder', 'barracks', 'moonwell', 'span']) {
    const roof = level.crouchGates.find(item => item.id === `captain-crouch-${part}`)
    const start = masteryIndex(`mastery-${part}-crawl-entry`)
    const end = masteryIndex(`mastery-${part}-crawl-exit`)
    assert.ok(start >= 0 && end > start)
    const crawl = mastery.steps.slice(start, end + 1)
    assert.equal(crawl.filter(step => step.kind === 'collect').length, 3)
    for (const step of crawl) {
      if (step.kind === 'fight') assert.equal(step.jumpStrikeY, undefined, step.id)
      else assert.equal(step.crouch, true, step.id)
    }
    const entry = crawl[0]
    const exit = crawl.at(-1)
    assert.ok(entry.x + 12 + halfWidth < roof.x || entry.x - 12 - halfWidth > roof.x + roof.width)
    assert.ok(exit.x - 12 - halfWidth > roof.x + roof.width)
    assert.ok(616 - roof.y - roof.height > crouchHeight)
    assert.ok(616 - roof.y - roof.height < standingHeight)
  }
})

test('every mastery arrival band fits the actual full body on static support or an explicitly phase-dependent lift', () => {
  const solids = [...masteryPlatforms, ...level.tiltPlatforms, ...level.crouchGates]
  const tilts = new Set(level.tiltPlatforms.map(rect => rect.id))
  for (const step of mastery.steps.filter(step => Number.isFinite(step.x))) {
    const height = step.crouch ? crouchHeight : standingHeight
    const tolerance = step.kind === 'jump' ? 18 : 12
    for (const x of [step.x - tolerance, step.x, step.x + tolerance]) {
      const supports = solids.filter(rect => rect.y === step.y)
      supports.push(...level.movingPlatforms.filter(rect => step.y >= Math.min(rect.y, rect.endY)
        && step.y <= Math.max(rect.y, rect.endY)).map(rect => ({ ...rect, y: step.y })))
      for (const footX of [x - halfWidth, x, x + halfWidth]) {
        assert.ok(supports.some(rect => footX >= rect.x && footX <= rect.x + rect.width), `Unsupported ${step.id} at ${footX},${step.y}`)
      }
      assert.ok(!solids.filter(rect => !tilts.has(rect.id)).some(rect => x + halfWidth > rect.x && x - halfWidth < rect.x + rect.width
        && step.y > rect.y && step.y - height < rect.y + rect.height), `Embedded ${step.id} at ${x},${step.y}`)
      assert.ok(!level.spikes.some(rect => x + halfWidth > rect.x && x - halfWidth < rect.x + rect.width
        && step.y > rect.y && step.y - height < rect.y + rect.height), `Spike ${step.id}`)
    }
  }
})

test('all proposed mastery jumps match grounded staging, ordinary ascent limits and safe staged descents', () => {
  let previousY = level.playerStart.y
  for (const step of mastery.steps) {
    if (!Number.isFinite(step.x)) continue
    if (step.kind === 'jump') {
      assert.equal(step.fromY, previousY, step.id)
      assert.ok(step.fromY - step.y <= 213, `Impossible ascent ${step.id}`)
    }
    assert.ok(step.y - previousY < 330, `Unstaged hard fall ${step.id}`)
    previousY = step.y
  }
  assert.equal(blockedIds.size, 0)
})

test('power-dependent Orders each name a real matching pickup, fetch it before the target and avoid intervening fights', () => {
  assert.equal(mastery.powerRoutes.length, 6)
  for (const route of mastery.powerRoutes) {
    const order = level.masteryPickups.find(item => item.id === route.orderId)
    const pickups = route.power === 'gale-mantle' ? level.galeMantlePickups : masterySunsteel
    const pickup = pickups.find(item => item.id === route.pickupId)
    const start = masteryIndex(`power-${route.pickupId}`)
    const end = masteryIndex(route.orderId)
    assert.equal(order.requiredPower, route.power)
    assert.ok(pickup && start >= 0 && start < end)
    assert.deepEqual(mastery.steps[start], { id: `power-${pickup.id}`, kind: 'power', pickupId: pickup.id,
      power: route.power, x: pickup.x, y: route.orderId === 'captain-order-4' ? 370 : 616 })
    assert.ok(!mastery.steps.slice(start + 1, end).some(step => step.kind === 'fight'), route.orderId)
  }
  for (const name of ['outer-gale', 'barracks-sunsteel', 'moonwell-gale']) {
    assert.equal(masteryStep(`reserve-${name}-entry`).crouch, true)
    assert.equal(masteryStep(`reserve-${name}-exit`).crouch, true)
  }
  for (const enemyId of ['captain-pikeman-barracks', 'captain-grenadier-barracks', 'captain-warden-barracks']) {
    assert.ok(masteryIndex(`fight-${enemyId}`) < masteryIndex('power-captain-sunsteel-barracks'))
  }
})

test('all five old failures have explicit proposed access instead of retained impossible milestones', () => {
  assert.deepEqual([...blockedIds], [])
  for (const [stepId, rise] of [['mastery-moonwell-high-b', 140], ['mastery-inner-high-b', 160],
    ['mastery-moonwell-high-c', 80], ['mastery-banner-high', 190]]) {
    const step = masteryStep(stepId)
    assert.equal(step.fromY - step.y, rise)
    assert.ok(rise < 213)
    assert.equal(step.riseBeforeMoveY, step.y - 6)
  }
  assert.equal(masteryStep('mastery-banner-coin-lift-board'), undefined)
  assert.equal(masteryStep('collect-coin-45').y, 430)
  assert.equal(masteryStep('mastery-moonwell-high-b-return').y, 366)
  assert.doesNotMatch(mastery.risks.join(' '), /sit below solid upper ledges|376px/)
})

test('Moonwell descent waits for fresh calm at its supported takeoff, not before the approach', () => {
  const staging = masteryStep('mastery-moonwell-recovery-takeoff')
  const calm = masteryStep('mastery-moonwell-descent-calm')
  assert.equal(staging.crouch, true)
  assert.deepEqual([calm.x, calm.y], [staging.x, staging.y])
  assert.equal(calm.anchorTolerance, 16)
  assert.equal(masteryIndex(calm.id), masteryIndex(staging.id) + 1)
  assert.equal(masteryIndex('mastery-moonwell-high-b-return'), masteryIndex(calm.id) + 1)
  const platform = level.platforms.find(item => item.id === 'captain-moonwell-high-b')
  assert.ok(calm.x - calm.anchorTolerance - halfWidth >= platform.x)
  assert.ok(calm.x + calm.anchorTolerance + halfWidth <= platform.x + platform.width)
})

test('mastery boards its three used relocated shafts with full body margins; Order2 uses the static shortcut', () => {
  const expected = { 'captain-lift-signal': 2980, 'captain-lift-banner-a': 6900,
    'captain-lift-moonwell': 12010 }
  assert.equal(level.movingPlatforms.find(lift => lift.id === 'captain-lift-banner-b').x, 7700)
  assert.deepEqual(mastery.liftRoutes.map(route => route.liftId), Object.keys(expected))
  for (const route of mastery.liftRoutes) {
    const lift = level.movingPlatforms.find(item => item.id === route.liftId)
    const board = masteryStep(route.boardId)
    const ride = masteryStep(route.rideId)
    const approach = masteryStep(route.approachId)
    assert.equal(lift.x, expected[lift.id])
    assert.equal(board.fromY, approach.y)
    assert.equal(board.kind, 'jump')
    assert.equal(ride.kind, 'move')
    assert.equal(board.x, ride.x)
    assert.ok(board.y >= lift.endY && board.y <= lift.y)
    assert.ok(ride.y >= lift.endY && ride.y < board.y)
    assert.equal(masteryIndex(board.id), masteryIndex(approach.id) + 1)
    assert.equal(masteryIndex(ride.id), masteryIndex(board.id) + 1)
    for (const step of [board, ride]) {
      const tolerance = step.kind === 'jump' ? 18 : 12
      assert.ok(step.x - tolerance - halfWidth > lift.x, step.id)
      assert.ok(step.x + tolerance + halfWidth < lift.x + lift.width, step.id)
    }
    for (const x of [ride.x - 12, ride.x + 12]) {
      assert.ok(![...masteryPlatforms, ...level.crouchGates].some(solid =>
        x + halfWidth > solid.x && x - halfWidth < solid.x + solid.width
        && board.y > solid.y && ride.y - standingHeight < solid.y + solid.height), `Blocked shaft sweep: ${lift.id}`)
    }
  }
})

test('moved shaft upper jumps clear the real ledge lip before moving, including the leftward Moonwell exit', () => {
  for (const route of mastery.liftRoutes) {
    const ride = masteryStep(route.rideId)
    const upper = masteryStep(route.upperId)
    const ledge = level.platforms.find(item => item.id === route.ledgeId)
    assert.equal(masteryIndex(upper.id), masteryIndex(ride.id) + 1)
    assert.equal(upper.fromY, ride.y)
    assert.equal(upper.y, ledge.y)
    assert.equal(upper.riseBeforeMoveY, ledge.y - 6)
    if (upper.x > ride.x) assert.ok(ride.x + 12 + halfWidth < ledge.x)
    else assert.ok(ride.x - 12 - halfWidth > ledge.x + ledge.width)
    const action = decideStep(upper, { player: player(ride.x, ride.y) }, {}, 0)
    assert.equal(action.jump, true)
    assert.equal(action.direction, 0)
    const memory = { jumpAt: 0, leftGround: true }
    assert.equal(decideStep(upper, { player: player(ride.x, upper.riseBeforeMoveY - 1, { velocityY: -200 }) }, memory, 150).direction,
      Math.sign(upper.x - ride.x))
  }
})

test('new boarding/upper/retreat actions stay inside the ordinary two-jump envelope and staged descents', () => {
  const ids = new Set(mastery.liftRoutes.flatMap(route => [route.boardId, route.upperId, ...route.retreatIds]))
  for (const id of ids) {
    const step = masteryStep(id)
    const previous = mastery.steps.slice(0, masteryIndex(id)).findLast(item => Number.isFinite(item.x))
    const delay = step.airJumpDelayMs / 1000
    const rise = 620 * delay - 820 * delay ** 2
    const flight = delay + (560 + Math.sqrt(560 ** 2 + 3280 * (step.y - step.fromY + rise))) / 1640
    let stagedTime = 0
    if (step.riseBeforeMoveY !== undefined) {
      const height = step.fromY - step.riseBeforeMoveY
      assert.ok(height <= rise, `${id}: staged clearance exceeds first-jump rise before the scheduled second jump`)
      stagedTime = (620 - Math.sqrt(620 ** 2 - 3280 * height)) / 1640
    }
    assert.equal(step.fromY, previous.y)
    assert.ok(step.y - step.fromY < 330, `${id}: unstaged damaging descent`)
    assert.ok(Math.abs(step.x - previous.x) <= (flight - stagedTime) * 260, `${id}: horizontal envelope after clearance`)
    assert.equal(step.extraAirJumpDelayMs, undefined)
  }
  assert.equal(masteryStep('mastery-banner-high-return-step').y, 430)
  assert.equal(masteryStep('mastery-banner-high-return').fromY, 430)
  assert.equal(masteryStep('mastery-banner-high-a-return').y, 604)
  assert.deepEqual(masteryStep('mastery-inner-lift-board'),
    { id: 'mastery-inner-lift-board', kind: 'jump', x: 16770, y: 500, fromY: 616, airJumpDelayMs: 350 })
  assert.equal(level.movingPlatforms.find(lift => lift.id === 'captain-lift-inner').x, 16680)
})

test('power proposals keep finite durations and charges, remove Order2 lift waits, and fetch Order4 above the floor', () => {
  for (const orderNumber of [1, 2, 3, 4, 6]) {
    const route = mastery.powerRoutes.find(route => route.orderId === `captain-order-${orderNumber}`)
    const pickup = (route.power === 'gale-mantle' ? level.galeMantlePickups : masterySunsteel)
      .find(item => item.id === route.pickupId)
    assert.equal(pickup.durationMs, route.power === 'gale-mantle' ? 10000 : 9000)
    if (route.power === 'sunsteel-edge') assert.equal(pickup.charges, 6)
    const steps = mastery.steps.slice(masteryIndex(`power-${pickup.id}`), masteryIndex(route.orderId) + 1)
      .filter(step => Number.isFinite(step.x))
    const speed = 260 * (pickup.speedMultiplier ?? 1)
    let minimumMs = 0
    for (let index = 1; index < steps.length; index += 1) {
      minimumMs += Math.abs(steps[index].x - steps[index - 1].x) / speed * 1000
      const lifted = mastery.liftRoutes.find(lift => lift.rideId === steps[index].id)
      if (lifted) {
        const lift = level.movingPlatforms.find(item => item.id === lifted.liftId)
        minimumMs += Math.abs(steps[index].y - steps[index - 1].y) / lift.speed * 1000
      }
    }
    assert.ok(minimumMs < pickup.durationMs, `${route.orderId}: impossible even before jump/phase overhead`)
    if (orderNumber === 2) {
      assert.ok(minimumMs < 5500)
      assert.ok(!steps.some(step => mastery.liftRoutes.some(lift => lift.rideId === step.id)))
      assert.deepEqual({ x: pickup.x, y: pickup.y }, { x: 9480, y: 548 })
    }
    if (orderNumber === 4) {
      assert.ok(minimumMs < 1000)
      assert.ok(masteryIndex('mastery-moonwell-step-b') < masteryIndex(`power-${pickup.id}`))
    }
  }
})

test('mastery final requirements fail on any missing Order, crest or enemy and never accept position alone', () => {
  const debug = { player: { objectiveItems: 4, totalObjectiveItems: 4, masteryItems: 6, totalMasteryItems: 6 },
    enemies: level.enemies.map(enemy => ({ id: enemy.id, alive: false })) }
  assert.doesNotThrow(() => assertRouteRequirements(debug, mastery.requirements, 'complete'))
  for (const player of [{ ...debug.player, masteryItems: 5 }, { ...debug.player, objectiveItems: 3 },
    { ...debug.player, totalMasteryItems: 5 }]) assert.throws(() => assertRouteRequirements({ ...debug, player }, mastery.requirements, 'complete'))
  assert.throws(() => assertRouteRequirements({ ...debug, enemies: debug.enemies.map((enemy, i) => ({ ...enemy, alive: i === 0 })) }, mastery.requirements, 'complete'))
  const finish = mastery.steps.at(-1)
  assert.equal(mastery.steps.at(-2).coinId, 'coin-90')
  assert.equal(decideStep(finish, { player: player(finish.x, finish.y) }, {}, 0).done, false)
})
