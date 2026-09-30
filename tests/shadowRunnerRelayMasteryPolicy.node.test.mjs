import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { RELAY_MASTERY_POLICY as policy } from '../scripts/shadow-runner-relay-mastery-policy.mjs'
import { RELAY_ROUTE_POLICIES } from '../scripts/shadow-runner-relay-route-policies.mjs'
import { validatePolicy, decideStep, assertRouteRequirements, hasMasteryEvidence, finaleAction, POWER_READBACK_FIELDS } from '../scripts/shadow-runner-route-proof.mjs'

const source = await readFile(new URL('../src/features/games/shadow-runner/game/levelTen.ts', import.meta.url), 'utf8')
const exports = {}
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports, require: name => {
    assert.equal(name, '../assets/manifest')
    return { SHADOW_RUNNER_ASSETS: { levels: {}, rebuild: {} } }
  } }, { timeout: 1000 })
const level = JSON.parse(JSON.stringify(exports.SHADOW_RUNNER_LEVEL_TEN))
const halfWidth = 32.76 / 2
const intersects = (x, y, height, solid) => x - halfWidth < solid.x + solid.width && x + halfWidth > solid.x
  && y > solid.y && y - height < solid.y + solid.height
const at = (x, y, extra = {}) => ({ x, y, bodyBottom: y, velocityY: 0, ...extra })
const stepById = id => {
  const step = policy.steps.find(step => step.id === id)
  assert.ok(step, `Missing step: ${id}`)
  return step
}
const stepIndex = id => policy.steps.indexOf(stepById(id))
const before = id => policy.steps.slice(0, stepIndex(id)).findLast(step => Number.isFinite(step.x)) ?? policy.start
const powerFamilies = { shield: 'shieldPickups', chrono: 'chronoPickups', surge: 'surgePickups',
  'mirror-ward': 'mirrorWardPickups', 'gale-mantle': 'galeMantlePickups', 'sunsteel-edge': 'sunsteelEdgePickups',
  'dawnfire-aegis': 'dawnfireAegisPickups', 'aether-step': 'aetherStepPickups' }

test('mastery checkpoint moves finish inside the activation band, not just near the lantern', () => {
  const steps = policy.steps.filter(step => step.id.startsWith('checkpoint-'))
  assert.equal(steps.length, 10)
  for (const step of steps) {
    const point = level.checkpoints.find(item => item.id === `relay-${step.id}`)
    assert.ok(point)
    assert.ok(step.x - 12 > point.x, `${step.id} stops short`)
    assert.ok(step.x + 12 < point.x + point.triggerWidth, `${step.id} overshoots`)
  }
})

test('complete structural candidate validates without claiming browser or gameplay integration readiness', () => {
  assert.equal(policy.candidateOnly, true)
  assert.equal(policy.readyForIntegration, false)
  assert.equal(policy.gameplayProven, false)
  assert.equal(policy.status, 'complete-structural-candidate-awaiting-replay')
  assert.match(policy.scope, /Schema-valid source candidate only; not browser-proven/)
  assert.equal(policy.recommendedTimeoutMs, 900000)
  assert.equal(policy.steps.length, 446)
  assert.equal(policy.steps.filter(step => step.kind === 'finish').length, 1)
  assert.equal(policy.steps.at(-1).kind, 'finish')
  assert.equal(validatePolicy(policy), policy)
  assert.equal(policy.worldWidth, level.worldWidth)
  assert.deepEqual(policy.start, { x: level.playerStart.x, y: level.playerStart.y })
})

test('all122 actual curated coin IDs and coordinates have unambiguous numeric driver aliases', () => {
  assert.equal(policy.catalog.coins.length, 122)
  assert.deepEqual(policy.catalog.coins.map(({ alias: _alias, ...coin }) => coin), level.coins)
  assert.deepEqual(policy.catalog.coins.map(coin => coin.alias), Array.from({ length: 122 }, (_, i) => `coin-${i + 1}`))
  assert.equal(new Set(policy.catalog.coins.map(coin => coin.id)).size, 122)
  assert.equal(policy.collectionTargets.length, 122)
  for (const [i, target] of policy.collectionTargets.entries()) {
    assert.equal(target.coinId, policy.catalog.coins[i].alias)
    assert.equal(target.sourceId, level.coins[i].id)
  }
  assert.equal(policy.expected.coins, level.coins.length)
})

test('all36 enemies, five Flames and eight power-locked Dispatches match actual source', () => {
  assert.equal(policy.catalog.enemies.length, 36)
  assert.deepEqual(policy.catalog.enemies.map(({ id, x, y }) => ({ id, x, y })), level.enemies.map(({ id, x, y }) => ({ id, x, y })))
  assert.deepEqual(policy.expected.enemyIds, level.enemies.map(enemy => enemy.id))
  assert.deepEqual(policy.requirements, { objectiveItems: 5, masteryItems: 8, requiredEnemyIds: ['sentry-sovereign'] })
  assert.deepEqual(policy.catalog.flames.map(({ id, x, y }) => ({ id, x, y })), level.objectivePickups.map(({ id, x, y }) => ({ id, x, y })))
  assert.deepEqual(policy.catalog.dispatches.map(({ id, x, y, requiredPower }) => ({ id, x, y, requiredPower })),
    level.masteryPickups.map(({ id, x, y, requiredPower }) => ({ id, x, y, requiredPower })))
  for (const dispatch of policy.catalog.dispatches) {
    const items = dispatch.requiredPower === 'aether-step' ? level.aetherStepPickups : level.dawnfireAegisPickups
    assert.equal(dispatch.durationMs, items.find(item => item.id === dispatch.pickupId).durationMs)
  }
})

test('contiguous sections derive their inventories from every actual route action exactly once', () => {
  assert.equal(policy.sections.length, 12)
  assert.equal(policy.sections[0].firstStep, 0)
  assert.equal(policy.sections.at(-1).lastStep, policy.steps.length - 1)
  for (const [index, section] of policy.sections.entries()) {
    if (index > 0) assert.equal(section.firstStep, policy.sections[index - 1].lastStep + 1)
    const actions = policy.steps.slice(section.firstStep, section.lastStep + 1)
    assert.equal(section.firstStepId, actions[0].id)
    assert.equal(section.lastStepId, actions.at(-1).id)
    assert.deepEqual(section.coinIds, actions.filter(step => step.kind === 'collect').map(step => step.coinId))
    assert.deepEqual(section.enemyIds, actions.filter(step => step.kind === 'fight').map(step => step.enemyId))
    for (const [field, counter] of [['flameIds', 'objectiveItems'], ['dispatchIds', 'masteryItems']]) {
      assert.deepEqual(section[field], actions.filter(step => step.counter === counter).map(step => step.id))
    }
  }
  for (const [field, expected] of [
    ['coinIds', policy.catalog.coins.map(coin => coin.alias)], ['enemyIds', policy.expected.enemyIds],
    ['flameIds', level.objectivePickups.map(item => item.id)], ['dispatchIds', level.masteryPickups.map(item => item.id)],
  ]) {
    const actual = policy.sections.flatMap(section => section[field])
    assert.equal(new Set(actual).size, actual.length)
    assert.deepEqual(actual.sort(), [...expected].sort())
  }
})

test('nominal collection stances have exact body dimensions and explicit dynamic/partial support', () => {
  assert.equal(policy.geometry.bodyWidth, 32.76)
  assert.equal(policy.geometry.standingHeight, 54.6)
  assert.equal(policy.geometry.crouchedHeight, 26.9568)
  assert.ok(Math.abs(48 * 0.78 * 0.72 - policy.geometry.crouchedHeight) < 1e-10)
  const staticSolids = [...level.platforms, ...level.crouchGates]
  for (const target of policy.collectionTargets) {
    const dynamic = policy.geometry.dynamicCollectionSupport.find(item => item.coinIds.includes(target.coinId))
    const support = dynamic ? [...level.movingPlatforms, ...level.phasePlatforms].find(item => item.id === dynamic.platformId) : null
    const surfaces = support ? [{ ...support, y: dynamic.targetY ?? support.y }] : staticSolids
    const minimum = policy.geometry.partialCollectionSupport.find(item => item.coinId === target.coinId)?.minimumBodyOverlap ?? 32.76
    for (const x of [target.x - 12, target.x, target.x + 12]) {
      assert.ok(surfaces.some(solid => solid.y === target.y
        && Math.min(solid.x + solid.width, x + halfWidth) - Math.max(solid.x, x - halfWidth) >= minimum - 1e-8), `Support ${target.coinId}@${x}/${target.y}`)
      assert.ok(!staticSolids.some(solid => intersects(x, target.y, target.crouch ? 26.9568 : 54.6, solid)), `Static embedding ${target.coinId}@${x}/${target.y}`)
      assert.ok(!level.spikes.some(solid => intersects(x, target.y, target.crouch ? 26.9568 : 54.6, solid)), `Spike ${target.coinId}`)
    }
    const coin = policy.catalog.coins.find(coin => coin.alias === target.coinId)
    assert.ok(Math.abs(coin.x - target.x) < halfWidth + 16, target.coinId)
    const height = target.crouch ? 26.9568 : 54.6
    const neededRise = Math.max(0, target.y - height - (coin.y - 8 + 16))
    const singleRise = 620 ** 2 / (2 * 1640)
    if (policy.geometry.explicitDoubleHopCoinIds.includes(target.coinId)) {
      const collect = stepById('collect-' + target.coinId)
      const hop = policy.steps[stepIndex(collect.id) - 1]
      assert.equal(hop.kind, 'jump')
      assert.deepEqual([hop.x, hop.y, hop.fromY], [target.x, target.y, target.y])
      assert.equal(hop.extraAirJumpDelayMs, undefined)
      assert.ok(neededRise > singleRise, 'This target genuinely needs more than a single jump')
      const seconds = hop.airJumpDelayMs / 1000
      const doubleRise = 620 * seconds - 1640 * seconds ** 2 / 2 + 560 ** 2 / (2 * 1640)
      assert.ok(neededRise <= doubleRise, `Unpowered nominal double-jump height ${target.coinId}`)
    } else assert.ok(neededRise <= (target.crouch ? 0 : singleRise), `Pickup height ${target.coinId}`)
  }
  assert.deepEqual(policy.geometry.explicitDoubleHopCoinIds, ['coin-100'])
})

test('all six low corridors require real crouching and all low coin stances preserve it', () => {
  assert.equal(level.crouchGates.length, 6)
  for (const roof of level.crouchGates) {
    const clearance = 616 - roof.y - roof.height
    assert.equal(clearance, policy.geometry.crouchClearance)
    assert.ok(clearance < 54.6 && clearance > 26.9568)
    assert.ok(Math.abs(clearance - 26.9568 - policy.geometry.crouchSpareHeight) < 1e-10)
    const targets = policy.collectionTargets.filter(target => target.x >= roof.x && target.x <= roof.x + roof.width && target.y === 616)
    assert.equal(targets.length, 3)
    assert.ok(targets.every(target => target.crouch))
  }
})

test('combat holding regions and relic stances use real support, not decorative poles or air stops', () => {
  const solids = [...level.platforms, ...level.crouchGates]
  for (const enemy of policy.catalog.enemies) {
    assert.ok(solids.some(solid => solid.y === enemy.supportY && solid.x <= enemy.minX - halfWidth
      && solid.x + solid.width >= enemy.maxX + halfWidth), enemy.id)
    for (const x of [enemy.minX, enemy.maxX]) assert.ok(!solids.some(solid => intersects(x, enemy.supportY, 54.6, solid)), enemy.id)
  }
  for (const item of [...policy.catalog.flames, ...policy.catalog.dispatches]) {
    assert.ok(solids.some(solid => solid.y === item.targetY && solid.x <= item.x - halfWidth && solid.x + solid.width >= item.x + halfWidth), item.id)
    assert.ok(!solids.some(solid => intersects(item.x, item.targetY, 54.6, solid)), item.id)
  }
})

test('relocated lift center carry paths clear static ceilings but their route crossings remain unproven', () => {
  assert.equal(level.movingPlatforms.length, 8)
  for (const lift of level.movingPlatforms) {
    const x = lift.x + lift.width / 2
    const solids = [...level.platforms, ...level.crouchGates]
    for (const y of [lift.y, lift.endY]) assert.ok(!solids.some(solid => intersects(x, y, 54.6, solid)), lift.id)
    assert.ok(!solids.some(solid => x - halfWidth < solid.x + solid.width && x + halfWidth > solid.x
      && Math.max(lift.y, lift.endY) > solid.y && Math.min(lift.y, lift.endY) - 54.6 < solid.y + solid.height), lift.id)
  }
  const crossings = policy.unresolvedTransitions.find(item => item.id === 'moving-shaft-crossings')
  for (const [stepId, liftId] of [
    ['dispatch-01-cross-shaft', 'relay-lift-approach'], ['prism-east-road', 'relay-lift-prism'],
    ['choir-power-road', 'relay-lift-choir'], ['gap-15-land', 'relay-lift-glass'],
    ['gap-17-land', 'relay-lift-crown'], ['reserve-lock-air-cross', 'relay-lift-lock'],
    ['arena-west-road', 'relay-lift-final'],
  ]) {
    const step = stepById(stepId), start = before(stepId)
    const lift = level.movingPlatforms.find(item => item.id === liftId)
    assert.ok(start.x < lift.x && step.x > lift.x + lift.width, stepId)
    assert.ok(crossings.stepIds.includes(stepId), stepId)
  }
  assert.match(crossings.detail, /no phase alignment or successful campaign crossing is inferred/)
})

test('the entire route has nominal supported arrival bands and clear standing or crouched headroom', () => {
  const solids = [...level.platforms, ...level.crouchGates, ...level.phasePlatforms]
  let previous = policy.start
  for (const step of policy.steps.filter(step => Number.isFinite(step.x))) {
    const margin = step.kind === 'jump' ? 18 : 12
    for (const x of [step.x - margin, step.x + margin]) {
      assert.ok(solids.some(solid => solid.y === step.y && x + halfWidth > solid.x && x - halfWidth < solid.x + solid.width), step.id)
      const height = step.crouch || step.crouchOnLanding ? 26.9568 : 54.6
      assert.ok(!solids.some(solid => intersects(x, step.y, height, solid)), step.id)
      assert.ok(!level.spikes.some(solid => intersects(x, step.y, height, solid)), step.id)
    }
    if (step.kind === 'jump') assert.equal(step.fromY, previous.y, step.id)
    previous = step
  }
  const actions = policy.steps.filter(step => step.kind === 'collect')
  assert.deepEqual(actions.map(step => step.minCoins), Array.from({ length: 122 }, (_, i) => i + 1))
  for (const step of actions) {
    const target = policy.collectionTargets.find(target => target.coinId === step.coinId)
    assert.deepEqual([step.x, step.y, step.crouch], [target.x, target.y, target.crouch], step.id)
  }
  const entry = stepById('dispatch-05-crawl-entry')
  const roof = level.crouchGates.find(item => item.id === 'relay-crouch-choir')
  assert.equal(entry.crouch, true)
  assert.ok(intersects(entry.x + 12, entry.y, 54.6, roof), 'Standing arrival really would overlap the Choir roof')
})

test('counter and active-power readback stays strict for actual actions despite unresolved routes', () => {
  const debug = { player: { objectiveItems: 5, totalObjectiveItems: 5, masteryItems: 8, totalMasteryItems: 8 },
    enemies: policy.expected.enemyIds.map(id => ({ id, alive: false })) }
  assert.doesNotThrow(() => assertRouteRequirements(debug, policy.requirements, 'complete'))
  for (const counter of ['objectiveItems', 'masteryItems']) {
    assert.throws(() => assertRouteRequirements({ ...debug, player: { ...debug.player, [counter]: debug.player[counter] - 1 } }, policy.requirements, 'complete'), /Unmet/)
  }
  for (const step of policy.steps.filter(step => step.kind === 'power')) {
      const field = POWER_READBACK_FIELDS[step.power]
      assert.equal(decideStep(step, { player: at(step.x, step.y, { [field]: false }) }, {}, 0).done, false)
      assert.equal(decideStep(step, { player: at(step.x, step.y, { [field]: true }) }, {}, 0).done, true)
      assert.throws(() => decideStep(step, { player: at(step.x, step.y) }, {}, 0), /missing power/)
  }
  const third = policy.steps.find(step => step.extraAirJumpDelayMs !== undefined)
  const memory = { jumpAt: 0, leftGround: true, airJumped: true, airJumpAt: 350, clearedLip: true }
  assert.throws(() => decideStep(third, { player: at(1560, 380, { velocityY: -20, aetherStepActive: false }) }, memory, 700), /observed active/)
})

test('every real step kind is covered and missing or duplicate mastery targets fail schema validation', () => {
  assert.deepEqual([...new Set(policy.steps.map(step => step.kind))].sort(),
    ['collect', 'fight', 'finish', 'jump', 'move', 'phase-cycle', 'power', 'relic', 'wind-cycle'])
  for (const kind of ['collect', 'fight', 'finish']) {
    const index = policy.steps.findIndex(step => step.kind === kind)
    assert.throws(() => validatePolicy({ ...policy, steps: policy.steps.filter((_, i) => i !== index) }), kind)
  }
  for (const kind of ['collect', 'fight']) {
    const field = kind === 'collect' ? 'coinId' : 'enemyId'
    const [first, second] = policy.steps.filter(step => step.kind === kind)
    assert.throws(() => validatePolicy({ ...policy, steps: policy.steps.map(step => step === second
      ? { ...step, [field]: first[field] } : step) }), kind)
  }
  for (const changed of [{ kind: 'teleport' }, { health: 12 }, { defeatEnemy: 'sentry-sovereign' },
    { velocityX: 0 }, { timeoutMs: Infinity }]) {
    assert.throws(() => validatePolicy({ ...policy, steps: policy.steps.map((step, i) => i === 0 ? { ...step, ...changed } : step) }))
  }
  for (const [catalog, counter] of [[policy.catalog.flames, 'objectiveItems'], [policy.catalog.dispatches, 'masteryItems']]) {
    const steps = policy.steps.filter(step => step.counter === counter)
    assert.deepEqual(steps.map(step => step.id), catalog.map(item => item.id))
    assert.deepEqual(steps.map(step => step.minCount), catalog.map((_, i) => i + 1))
    for (const [i, step] of steps.entries()) {
      assert.deepEqual([step.x, step.y], [catalog[i].x, catalog[i].targetY])
      const observation = count => ({ player: at(step.x, step.y, { [counter]: count,
        [counter === 'objectiveItems' ? 'totalObjectiveItems' : 'totalMasteryItems']: catalog.length }) })
      assert.equal(decideStep(step, observation(i), {}, 0).done, false)
      assert.equal(decideStep(step, observation(i + 1), {}, 0).done, true)
      assert.throws(() => decideStep(step, { player: at(step.x, step.y) }, {}, 0), /missing relic readback/)
    }
  }
})

test('collect, grounded combat, drone strikes and finish depend on observed state, not authored outcomes', () => {
  for (const step of policy.steps.filter(step => step.kind === 'collect')) {
    const observation = coins => ({ player: at(step.x, step.y, { coins }) })
    assert.equal(decideStep(step, observation(step.minCoins - 1), {}, 0).done, false)
    assert.equal(decideStep(step, observation(step.minCoins), {}, 0).done, true)
    assert.equal(decideStep(step, { player: at(step.x + 24, step.y, { coins: 122 }) }, {}, 0).done, false)
    if (step.crouch) assert.equal(decideStep(step, observation(0), {}, 0).jump, false)
  }
  for (const step of policy.steps.filter(step => step.kind === 'fight')) {
    const enemy = policy.catalog.enemies.find(enemy => enemy.id === step.enemyId)
    assert.deepEqual([step.minX, step.maxX], [enemy.minX, enemy.maxX])
    assert.equal(step.timeoutMs, 30000)
    const jumping = enemy.id.includes('drone') || enemy.id === 'sentry-sovereign'
    assert.equal(step.jumpStrikeY, jumping ? enemy.supportY : undefined)
    const x = (step.minX + step.maxX) / 2
    const debug = Object.freeze({ player: Object.freeze(at(x, enemy.supportY)),
      relayBeamZones: Object.freeze([{ id: 'relay-beam-arena', state: 'idle' }]),
      enemies: Object.freeze([Object.freeze({ id: enemy.id, x: x + 20, y: enemy.supportY, alive: true })]) })
    const action = decideStep(step, debug, { facing: 1 }, 0)
    assert.equal(action.done, false)
    assert.equal(action.attack, true)
    assert.equal(action.jump, jumping)
    assert.equal(decideStep(step, { ...debug, enemies: [{ ...debug.enemies[0], alive: false }] }, {}, 0).done, true)
    assert.throws(() => decideStep(step, { player: debug.player, enemies: [] }, {}, 0), /enemy missing/)
  }
  const finish = policy.steps.at(-1)
  assert.equal(decideStep(finish, { player: at(finish.x, finish.y, { coins: 122 }) }, {}, 0).done, false)
})

test('all 21 one-shot power targets match current source and the driver does not infer remaining duration', () => {
  const steps = policy.steps.filter(step => step.kind === 'power')
  assert.equal(steps.length, 21)
  assert.equal(new Set(steps.map(step => step.pickupId)).size, 21)
  const authored = Object.entries(powerFamilies).flatMap(([power, family]) => level[family].map(item => ({ ...item, power })))
  assert.deepEqual(steps.map(step => step.pickupId).sort(), authored.map(item => item.id).sort())
  for (const item of policy.catalog.powers) {
    const pickup = authored.find(pickup => pickup.id === item.id)
    assert.deepEqual([item.power, item.x, item.y, item.durationMs], [pickup.power, pickup.x, pickup.y, pickup.durationMs])
    const step = stepById('power-' + item.id)
    assert.deepEqual([step.power, step.x, step.y], [item.power, item.x, item.targetY])
    const field = POWER_READBACK_FIELDS[step.power]
    // Active boolean alone currently completes this step, even with almost no lifetime left.
    assert.equal(decideStep(step, { player: at(step.x, step.y, { [field]: true,
      [field.replace(/Active$/, 'RemainingMs')]: 1 }) }, {}, 0).done, true)
  }
  assert.match(policy.risks.join(' '), /active booleans, not pickup identity or remaining duration/)
})

test('all eight timed Dispatch chains reserve finite authored powers without combat or wind-wait detours', () => {
  assert.equal(policy.timedDispatches.length, 8)
  assert.deepEqual(policy.timedDispatches.map(item => item.dispatchId), level.masteryPickups.map(item => item.id))
  for (const timed of policy.timedDispatches) {
    const dispatch = policy.catalog.dispatches.find(item => item.id === timed.dispatchId)
    const power = stepById(timed.pickupStepId)
    assert.equal(power.pickupId, dispatch.pickupId)
    assert.equal(power.power, dispatch.requiredPower)
    assert.equal(timed.pickupId, dispatch.pickupId)
    assert.equal(timed.durationMs, level[powerFamilies[power.power]].find(item => item.id === power.pickupId).durationMs)
    assert.equal(timed.dispatchStepId, timed.dispatchId)
    const start = stepIndex(timed.pickupStepId), end = stepIndex(timed.dispatchId)
    assert.ok(start < end)
    const chain = policy.steps.slice(start, end + 1)
    assert.deepEqual(timed.stepIds, chain.map(step => step.id))
    assert.ok(chain.slice(1, -1).every(step => ['move', 'jump'].includes(step.kind)), timed.dispatchId)
    assert.equal(timed.liveWindowProven, false)
    assert.equal(timed.speedBonusBudgeted, false)
    assert.ok(Number.isFinite(timed.locomotionEstimateMs) && timed.locomotionEstimateMs > 0)
    assert.ok(timed.samplingAndActivationReserveMs >= 900)
    assert.equal(timed.nominalSpareMs, timed.durationMs - timed.locomotionEstimateMs - timed.samplingAndActivationReserveMs)
    assert.ok(timed.nominalSpareMs > 0)
    assert.ok(timed.provenance.length > 0)
  }
  const choir = policy.timedDispatches.find(item => item.dispatchId === 'last-dispatch-5')
  assert.equal(choir.nominalSpareMs, 1133)
  for (const id of ['collect-60', 'collect-61', 'collect-62']) {
    assert.ok(stepIndex(id.replace('collect-', 'collect-coin-')) > stepIndex(choir.dispatchId))
  }
  for (const n of ['03', '08']) {
    const wind = stepIndex(`dispatch-${n}-start-wind`)
    const timed = policy.timedDispatches[Number(n) - 1]
    assert.equal(wind + 1, stepIndex(timed.pickupStepId))
    const zone = level.windZones.find(zone => zone.id === stepById(`dispatch-${n}-start-wind`).zoneId)
    assert.ok(timed.locomotionEstimateMs > zone.cadenceMs, 'One fresh rest cannot certify the entire powered chain')
  }
  const arenaPower = stepIndex('power-relay-dawnfire-arena')
  for (const id of ['relay-pikeman-02', 'relay-caster-07', 'relay-drone-06']) assert.ok(stepIndex('fight-' + id) < arenaPower)
  assert.ok(arenaPower < stepIndex('fight-sentry-sovereign'))
})

test('every power reservation is ordered before its sole pickup and preserves its distinct bypass strategy', () => {
  assert.deepEqual(policy.powerReservations.map(item => [item.pickupId, item.strategy]), [
    ['relay-aether-approach', 'crouched-road-bypass'], ['relay-dawnfire-prism', 'crouched-road-bypass'],
    ['relay-aether-foundry', 'airborne-bypass'], ['relay-dawnfire-beam', 'visible-stair-bypass'],
    ['relay-aether-lock', 'airborne-bypass'], ['relay-dawnfire-ascent', 'crouched-road-bypass'],
    ['relay-dawnfire-arena', 'crouched-road-bypass'],
  ])
  for (const reservation of policy.powerReservations) {
    const bypass = stepById(reservation.stepId), start = before(bypass.id)
    const power = policy.catalog.powers.find(item => item.id === reservation.pickupId)
    assert.ok(stepIndex(bypass.id) < stepIndex('power-' + power.id))
    assert.ok(start.x < power.x && bypass.x > power.x, bypass.id)
    if (reservation.strategy === 'crouched-road-bypass') {
      assert.equal(bypass.kind, 'move')
      assert.equal(bypass.crouch, true)
      assert.equal(bypass.y, 616)
      // Aether/Dawnfire circles have radius19 and bob upward only in the current runtime.
      assert.ok(bypass.y - policy.geometry.crouchedHeight > power.y + 19, bypass.id)
    } else if (reservation.strategy === 'airborne-bypass') {
      assert.equal(bypass.kind, 'jump')
      assert.equal(bypass.airJumpDelayMs, 600)
      assert.equal(bypass.extraAirJumpDelayMs, undefined)
      assert.ok(bypass.fromY < power.y - 19)
      assert.ok(policy.unresolvedTransitions.find(item => item.id === 'power-reservation-flight').stepIds.includes(bypass.id))
    } else {
      assert.equal(bypass.id, 'reserve-beam-upper')
      assert.equal(bypass.kind, 'jump')
      assert.equal(bypass.y, 326)
      assert.equal(start.y, 450)
    }
  }
})

test('Foundry phase02 boarding and crouched descent match the revised normal strategy', () => {
  const jump = stepById('gap-06-phase-board'), stage = before(jump.id)
  const normal = RELAY_ROUTE_POLICIES[0].steps.find(step => step.id === 'gap-06-phase-board')
  const phase = level.phasePlatforms.find(item => item.id === 'relay-phase-02')
  assert.deepEqual([jump.x, jump.y, jump.riseBeforeMoveY, jump.crouchOnLanding],
    [normal.x, normal.y, normal.riseBeforeMoveY, normal.crouchOnLanding])
  assert.equal(jump.riseBeforeMoveY, phase.y - 6)
  assert.ok(stage.x + 12 + halfWidth < phase.x)
  const memory = {}
  const launch = decideStep(jump, { player: at(stage.x, stage.y) }, memory, 0)
  assert.equal(launch.jump, true)
  assert.equal(launch.direction, 0)
  assert.equal(decideStep(jump, { player: at(stage.x, 500, { velocityY: -100 }) }, memory, 200).direction, 0)
  const clear = decideStep(jump, { player: at(stage.x, phase.y - 6, { velocityY: -100 }) }, memory, 400)
  assert.equal(clear.direction, 1)
  assert.equal(clear.crouch, false)
  const airborne = decideStep(jump, { player: at(jump.x, 560, { velocityY: 100 }) }, memory, 700)
  assert.equal(airborne.done, false)
  assert.equal(airborne.crouch, false)
  const landed = decideStep(jump, { player: at(jump.x, jump.y) }, memory, 900)
  assert.equal(landed.done, true)
  assert.equal(landed.crouch, false)
  assert.deepEqual(stepById('foundry-phase-cycle'), RELAY_ROUTE_POLICIES[0].steps.find(step => step.id === 'foundry-phase-cycle'))
  const descent = stepById('gap-06-land')
  assert.equal(descent.kind, 'move')
  assert.deepEqual([descent.x, descent.y, descent.crouch], [5930, 616, true])
  assert.equal(stepIndex(descent.id), stepIndex(jump.id) + 1)
  assert.equal(stepById('power-relay-chrono-foundry').crouch, true)
  const brace = stepById('foundry-gap-07-wind')
  const normalBrace = RELAY_ROUTE_POLICIES[0].steps.find(step => step.id === 'foundry-exit-wind-cycle')
  assert.deepEqual([brace.x, brace.y, brace.crouch], [normalBrace.x, normalBrace.y, normalBrace.crouch])
  assert.equal(stepIndex(brace.id) + 1, stepIndex('reserve-foundry-air-cross'))
  assert.equal(stepById('reserve-foundry-air-cross').x - brace.x, 352)
})

test('every anchored wind gate corrects drift and needs a fresh observed cycle plus supported arrival', () => {
  const waits = policy.steps.filter(step => step.kind === 'wind-cycle')
  assert.ok(waits.length > 20)
  assert.deepEqual([...new Set(waits.map(step => step.zoneId))].sort(), level.windZones.map(zone => zone.id).sort())
  for (const step of waits) {
    const zone = level.windZones.find(zone => zone.id === step.zoneId)
    assert.equal(step.timeoutMs, 5000)
    assert.ok(step.timeoutMs > zone.cadenceMs + zone.tellDurationMs + zone.activeDurationMs)
    assert.equal(step.crouch, true)
    assert.deepEqual([step.x, step.y], [before(step.id).x, before(step.id).y])
    for (const x of [step.x - 8, step.x + 8]) {
      assert.ok(level.platforms.some(solid => solid.y === step.y && solid.x <= x - halfWidth
        && solid.x + solid.width >= x + halfWidth), `Supported anchor ${step.id}`)
    }
    const debug = (active, telling, player = at(step.x, step.y)) => ({ player,
      windZones: [{ id: step.zoneId, active, telling }] })
    assert.throws(() => decideStep(step, { player: at(step.x, step.y), windZones: [] }, {}, 0), /live cycle readback/)
    assert.throws(() => decideStep(step, debug(undefined, false), {}, 0), /live cycle readback/)
    const memory = {}
    assert.equal(decideStep(step, debug(false, false), memory, 0).done, false)
    assert.equal(decideStep(step, debug(false, true), memory, 100).done, false)
    assert.equal(decideStep(step, debug(true, false), memory, 500).done, false)
    for (const offset of [-16, 16]) {
      const drift = decideStep(step, debug(false, false, at(step.x + offset, step.y)), memory, 1600)
      assert.equal(drift.direction, -Math.sign(offset))
      assert.equal(drift.crouch, true)
      assert.equal(drift.done, false)
    }
    assert.equal(decideStep(step, debug(false, false, at(step.x, step.y - 40, { velocityY: 100 })), memory, 1700).done, false)
    assert.equal(decideStep(step, debug(false, false), memory, 1800).done, false)
    assert.equal(decideStep(step, debug(true, false), memory, 2800).done, false)
    assert.equal(decideStep(step, debug(false, false), memory, 3500).done, true)
  }
})

test('four phase-supported coin pairs have real boarding steps and explicitly unresolved phase windows', () => {
  assert.deepEqual(policy.geometry.dynamicCollectionSupport.map(item => [item.platformId, item.coinIds]), [
    ['relay-phase-01', ['coin-16', 'coin-17']], ['relay-phase-03', ['coin-44', 'coin-45']],
    ['relay-phase-05', ['coin-70', 'coin-71']], ['relay-phase-06', ['coin-93', 'coin-94']],
  ])
  const unresolved = policy.unresolvedTransitions.find(item => item.id === 'phase-coin-windows')
  for (const support of policy.geometry.dynamicCollectionSupport) {
    const platform = level.phasePlatforms.find(item => item.id === support.platformId)
    assert.ok(platform.solidDurationMs > 0 && platform.warningDurationMs > 0 && platform.intangibleDurationMs > 0)
    const first = stepIndex('collect-' + support.coinIds[0])
    const board = policy.steps[first - 1]
    assert.equal(board.kind, 'jump')
    assert.equal(board.y, platform.y)
    assert.ok(unresolved.stepIds.includes(board.id))
    assert.deepEqual(policy.steps.slice(first, first + 2).map(step => step.coinId), support.coinIds)
    assert.equal(policy.steps[first + 2].kind, 'jump')
    assert.equal(policy.steps[first + 2].fromY, platform.y)
    // The driver currently has no phase readback gate. A jump declaration cannot certify a solid shelf.
    const start = before(board.id)
    assert.equal(decideStep(board, { player: at(start.x, board.fromY) }, {}, 0).jump, true)
  }
  assert.match(unresolved.detail, /No observed phase-platform gate exists/)
  assert.equal(policy.readyForIntegration, false)
})

test('actual jump declarations retain bounded second jumps and require live Aether for the sole third jump', () => {
  const jumps = policy.steps.filter(step => step.kind === 'jump')
  assert.ok(jumps.length > 80)
  assert.equal(jumps.some(step => step.viaX !== undefined), false)
  assert.deepEqual(jumps.filter(step => step.extraAirJumpDelayMs !== undefined).map(step => step.id), ['dispatch-01-cross-shaft'])
  for (const step of jumps) {
    const start = before(step.id)
    const memory = {}
    assert.equal(decideStep(step, { player: at(start.x, step.fromY) }, memory, 0).jump, true)
    const airborne = at(start.x, step.fromY - 60, { velocityY: -100 })
    assert.equal(decideStep(step, { player: airborne }, memory, step.airJumpDelayMs - 1).jump, false)
    assert.equal(decideStep(step, { player: airborne }, memory, step.airJumpDelayMs).jump, true)
    assert.equal(decideStep(step, { player: airborne }, memory, step.airJumpDelayMs + 50).jump, false)
    if (step.extraAirJumpDelayMs !== undefined) {
      const item = level.aetherStepPickups.find(item => item.id === 'relay-aether-approach')
      assert.equal(item.extraAirJumps, 1)
      assert.ok(stepIndex('power-' + item.id) < stepIndex(step.id))
      for (const active of [false, undefined]) {
        assert.throws(() => decideStep(step, { player: { ...airborne, aetherStepActive: active } }, { ...memory }, step.extraAirJumpDelayMs), /observed active/)
      }
      assert.equal(decideStep(step, { player: { ...airborne, aetherStepActive: true } }, memory, step.extraAirJumpDelayMs).jump, true)
      assert.equal(decideStep(step, { player: { ...airborne, aetherStepActive: true } }, memory, step.extraAirJumpDelayMs + 100).jump, false)
    }
    assert.equal(decideStep(step, { player: at(step.x, step.y) }, memory, 1400).done, true)
  }
})

test('mastery acceptance requires fresh exact persisted counts and every authored dead enemy ID', () => {
  const started = '2026-09-12T00:00:00.000Z'
  const observation = {
    debug: { levelId: policy.levelId, player: { coins: 122, score: 5000, objectiveItems: 5, totalObjectiveItems: 5,
      masteryItems: 8, totalMasteryItems: 8 }, enemies: level.enemies.map(enemy => ({ id: enemy.id, alive: false })) },
    record: { lastRun: { recordedAt: started, score: 5000, coinsCollected: 122, totalCoins: 122,
      enemiesDefeated: 36, totalEnemies: 36, fullClear: true } },
    dialogs: [{ title: 'Full Clear' }],
  }
  assert.equal(hasMasteryEvidence(observation, policy, started), true)
  for (const title of ['Perfect Route', 'Full Clear']) {
    assert.equal(hasMasteryEvidence({ ...observation, dialogs: [{ title }] }, policy, started), true)
  }
  for (const [field, value] of [['coinsCollected', 121], ['totalCoins', 121], ['enemiesDefeated', 35], ['totalEnemies', 35],
    ['fullClear', false], ['recordedAt', '2026-09-11T23:59:59.999Z'], ['score', 4999]]) {
    assert.equal(hasMasteryEvidence({ ...observation, record: { lastRun: { ...observation.record.lastRun, [field]: value } } }, policy, started), false, field)
  }
  for (const enemy of level.enemies) {
    for (const enemies of [observation.debug.enemies.filter(item => item.id !== enemy.id),
      observation.debug.enemies.map(item => item.id === enemy.id ? { ...item, alive: true } : item),
      observation.debug.enemies.map(item => item.id === enemy.id ? { ...item, id: 'unrelated-enemy' } : item)]) {
      assert.equal(hasMasteryEvidence({ ...observation, debug: { ...observation.debug, enemies } }, policy, started), false, enemy.id)
    }
  }
  assert.equal(hasMasteryEvidence({ ...observation, dialogs: [{ title: 'Level Complete' }] }, policy, started), false)
  assert.equal(hasMasteryEvidence({ ...observation, dialogs: [] }, policy, started), false)
  assert.doesNotThrow(() => assertRouteRequirements(observation.debug, policy.requirements, 'complete'))
  for (const [counter, total] of [['objectiveItems', 5], ['masteryItems', 8]]) {
    for (let count = 0; count < total; count++) {
      assert.throws(() => assertRouteRequirements({ ...observation.debug,
        player: { ...observation.debug.player, [counter]: count } }, policy.requirements, 'complete'), /Unmet/)
    }
  }
  assert.equal(policy.finale.requiresFreshRecordedCompletion, true)
  for (const [index, beat] of policy.finale.beats.entries()) {
    const finale = { ...observation, dialogs: [{ label: 'Dawn Relay Spire finale', title: beat.title, buttons: [beat.button] }] }
    assert.deepEqual(finaleAction(finale, policy, policy.steps.at(-1), started, index), beat)
    assert.throws(() => finaleAction({ ...finale, record: null }, policy, policy.steps.at(-1), started, index), /fresh matching/)
    assert.throws(() => finaleAction(finale, policy, policy.steps[0], started, index), /before the complete/)
  }
})

test('the isolated source module is pure JSON data and leaves runtime/harness/normal policy alone', async () => {
  const module = await readFile(new URL('../scripts/shadow-runner-relay-mastery-policy.mjs', import.meta.url), 'utf8')
  const parsed = ts.createSourceFile('policy.mjs', module, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const forbidden = new Set(['__shadowRunner', 'window', 'document', 'fetch', 'playwright', 'setPosition', 'setVelocity', 'writeFile', 'localStorage'])
  const visit = node => {
    assert.equal(ts.isImportDeclaration(node), false)
    if (ts.isIdentifier(node)) assert.equal(forbidden.has(node.text), false, node.text)
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.deepEqual(JSON.parse(JSON.stringify(policy)), policy)
  assert.ok(policy.unresolvedTransitions.length >= 7)
  for (const transition of policy.unresolvedTransitions) {
    assert.ok(transition.detail.length > 0 && transition.stepIds.length > 0)
    transition.stepIds.forEach(stepById)
  }
  assert.match(policy.risks.join(' '), /Moonheart.*opportunistic without boost readback/)
})
