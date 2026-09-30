import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { CATACOMB_ROUTE_POLICIES } from '../scripts/shadow-runner-catacomb-route-policies.mjs'
import { assertRouteRequirements, decideStep, validatePolicy } from '../scripts/shadow-runner-route-proof.mjs'

const policy = CATACOMB_ROUTE_POLICIES[0]
const byId = id => policy.steps.find(step => step.id === id)
const relics = policy.steps.filter(step => step.kind === 'relic')
const HALF_BODY = 16.38
const ARRIVAL = 12
const echoLowFights = [
  { enemyId: 'catacomb-jester-echo', approachId: 'echo-jester-low-approach', gateId: 'catacomb-crawl-gate-d', exitId: 'echo-crawl-west-exit' },
  { enemyId: 'catacomb-lurker-echo', approachId: 'echo-lurker-low-approach', gateId: 'catacomb-crawl-gate-e', exitId: 'echo-crawl-east-exit' },
]
const bodyHeight = step => step.crouch ? 26.9568 : 54.6
const playerAt = (step, overrides = {}) => ({
  x: step.x, y: step.y, bodyBottom: step.y, velocityY: 0,
  objectiveItems: 0, totalObjectiveItems: 3, ...overrides,
})

async function readLevel() {
  const source = await readFile(new URL('../src/features/games/shadow-runner/game/levelEight.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  // Evaluate this local data module only; its sole value import gets an inert asset fixture.
  runInNewContext(compiled, { exports, require: name => {
    assert.equal(name, '../assets/manifest')
    return { SHADOW_RUNNER_ASSETS: { rebuild: { courierCatacombsBackground: 'unused-local-test-asset' } } }
  } }, { timeout: 1000, filename: 'levelEight.ts' })
  return JSON.parse(JSON.stringify(exports.SHADOW_RUNNER_LEVEL_EIGHT))
}

const authored = readLevel()

test('L8 is one unproven normal candidate with the exact authored catalog', async () => {
  const level = await authored
  assert.equal(CATACOMB_ROUTE_POLICIES.filter(candidate => candidate.mode === 'normal').length, 1)
  assert.equal(policy.levelId, level.id)
  assert.equal(policy.title, level.title)
  assert.equal(policy.mode, 'normal')
  assert.equal(policy.candidateOnly, true)
  assert.deepEqual(policy.start, { x: level.playerStart.x, y: level.playerStart.y })
  assert.equal(policy.worldWidth, level.worldWidth)
  assert.equal(policy.expected.coins, level.coins.length)
  assert.deepEqual(policy.expected.enemyIds, level.enemies.map(enemy => enemy.id))
  assert.equal(validatePolicy(policy), policy)
  assert.match(policy.risks.join(' '), /No browser proof/)
})

const mastery = CATACOMB_ROUTE_POLICIES.find(candidate => candidate.mode === 'mastery')
const masteryById = id => mastery.steps.find(step => step.id === id)
const masteryIndex = id => mastery.steps.findIndex(step => step.id === id)

test('adding mastery does not mutate the separately authored normal policy', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-catacomb-route-policies.mjs', import.meta.url), 'utf8')
  const normalSource = source.slice(0, source.indexOf('\nfunction catacombMasteryCandidate'))
  const exports = {}
  runInNewContext(ts.transpileModule(normalSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports }, { timeout: 1000 })
  assert.deepEqual(policy, JSON.parse(JSON.stringify(exports.CATACOMB_ROUTE_POLICIES[0])))
  assert.equal(createHash('sha256').update(JSON.stringify(policy)).digest('hex'), 'd224a01b1952d5fbe1834bb16fe6ed9b558b0701631a253ee639b6a8d04d3b18')
  assert.equal(CATACOMB_ROUTE_POLICIES.length, 2)
  assert.equal(mastery.candidateOnly, true)
  assert.equal(mastery.recommendedTimeoutMs, 900000)
  assert.ok(mastery.steps.length <= 500)
  assert.equal(validatePolicy(mastery), mastery)
  assert.match(mastery.risks.join(' '), /No browser proof/)
})

test('mastery enumerates exactly72 authored coins and22 enemies with strict final totals', async () => {
  const level = await authored
  assert.equal(level.coins.length, 72)
  assert.equal(level.enemies.length, 22)
  assert.equal(mastery.expected.coins, level.coins.length)
  assert.deepEqual(mastery.expected.enemyIds, level.enemies.map(enemy => enemy.id))
  const coins = mastery.steps.filter(step => step.kind === 'collect')
  assert.equal(coins.length, 72)
  assert.deepEqual(coins.map(step => step.minCoins), Array.from({ length: 72 }, (_, index) => index + 1))
  assert.deepEqual(coins.map(step => Number(step.coinId.slice(5))).sort((a, b) => a - b), Array.from({ length: 72 }, (_, index) => index + 1))
  assert.deepEqual(mastery.steps.filter(step => step.kind === 'fight').map(step => step.enemyId).sort(), level.enemies.map(enemy => enemy.id).sort())
  assert.deepEqual(mastery.requirements, { objectiveItems: 3, masteryItems: 5, requiredEnemyIds: mastery.expected.enemyIds })
  assert.throws(() => validatePolicy({ ...mastery, steps: mastery.steps.filter(step => step.coinId !== 'coin-72') }), /every coin/)
  assert.throws(() => validatePolicy({ ...mastery, steps: mastery.steps.filter(step => step.enemyId !== 'catacomb-barrel-recovery') }), /Required enemies|every enemy/)
})

test('three seals and all five power-gated caches use actual catalog identity and observed counters', async () => {
  const level = await authored
  for (const [counter, catalog] of [['objectiveItems', level.objectivePickups], ['masteryItems', level.masteryPickups]]) {
    const steps = mastery.steps.filter(step => step.kind === 'relic' && step.counter === counter)
    assert.deepEqual(steps.map(step => step.id), catalog.map(item => item.id))
    assert.deepEqual(steps.map(step => step.minCount), catalog.map((_, index) => index + 1))
    for (const [index, step] of steps.entries()) {
      assert.equal(step.x, catalog[index].x)
      const player = playerAt(step, { masteryItems: 0, totalMasteryItems: 5 })
      assert.equal(decideStep(step, { player }, {}, 0).done, false)
      player[counter] = step.minCount
      assert.equal(decideStep(step, { player }, {}, 0).done, true)
    }
  }
  const lowCache = masteryById('catacomb-cache-5')
  assert.equal(lowCache.crouch, true)
  assert.equal(decideStep(lowCache, { player: playerAt(lowCache, { masteryItems: 4, totalMasteryItems: 5 }) }, {}, 0).jump, false)
  const complete = { player: { objectiveItems: 3, totalObjectiveItems: 3, masteryItems: 5, totalMasteryItems: 5 }, enemies: level.enemies.map(enemy => ({ id: enemy.id, alive: false })) }
  assert.doesNotThrow(() => assertRouteRequirements(complete, mastery.requirements, 'complete'))
  for (const counter of ['objectiveItems', 'masteryItems']) {
    const missing = structuredClone(complete)
    missing.player[counter] -= 1
    assert.throws(() => assertRouteRequirements(missing, mastery.requirements, 'complete'), /Unmet complete/)
  }
})

test('mastery targets have authored support; narrow partial support is itemized, not hidden', async () => {
  const level = await authored
  const permanent = [...level.platforms, ...level.crouchGates, ...level.tiltPlatforms]
  const all = [...permanent, ...level.spectralPlatforms]
  const issues = []
  const partialFound = new Set()
  for (const step of mastery.steps.filter(step => Number.isFinite(step.x))) {
    const tolerance = step.kind === 'jump' ? 18 : 12
    const support = all.filter(solid => solid.y === step.y)
    const partial = mastery.geometry.partialSupport.find(item => item.stepId === step.id)
    for (const x of [step.x - tolerance, step.x, step.x + tolerance]) {
      const overlap = Math.max(0, ...support.map(solid => Math.min(x + HALF_BODY, solid.x + solid.width) - Math.max(x - HALF_BODY, solid.x)))
      if (overlap < 32.76 - 1e-8) {
        partialFound.add(step.id)
        if (!partial || overlap < partial.minimumBodyOverlap - 1e-8) issues.push(`${step.id}/${x}: unsupported or undeclared overlap ${overlap}`)
      }
      const intersects = solid => x + HALF_BODY > solid.x && x - HALF_BODY < solid.x + solid.width
        && step.y > solid.y && step.y - bodyHeight(step) < solid.y + solid.height
      if (all.some(intersects)) issues.push(`${step.id}/${x}: embedded body`)
      if (level.spikes.some(intersects)) issues.push(`${step.id}/${x}: spike overlap`)
    }
    if (!permanent.some(solid => solid.y === step.y && solid.x <= step.x && solid.x + solid.width >= step.x)) {
      const window = mastery.powerWindows.find(window => masteryIndex(window.startStepId) < mastery.steps.indexOf(step)
        && mastery.steps.indexOf(step) < masteryIndex(window.escapeStepId))
      assert.ok(window && window.spectralIds.some(id => level.spectralPlatforms.some(solid => solid.id === id && solid.y === step.y && solid.x < step.x && solid.x + solid.width > step.x)), `Unplanned spectral dependency: ${step.id}`)
    }
  }
  assert.deepEqual(issues, [])
  assert.deepEqual([...partialFound].sort(), mastery.geometry.partialSupport.map(item => item.stepId).sort())
})

test('mastery coin targets intersect the actual pickup circle at every arrival-band endpoint', async () => {
  const level = await authored
  for (const step of mastery.steps.filter(step => step.kind === 'collect')) {
    const item = level.coins[Number(step.coinId.slice(5)) - 1]
    for (const x of [step.x - 12, step.x, step.x + 12]) {
      const dx = Math.max(Math.abs(item.x - x) - HALF_BODY, 0)
      const dy = Math.max(step.y - bodyHeight(step) - item.y, item.y - step.y, 0)
      assert.ok(Math.hypot(dx, dy) <= 14, `${step.id}: pickup circle outside arrival body at ${x}`)
    }
  }
})

test('every natural power is authored, finite and observed without injecting activation', async () => {
  const level = await authored
  const catalogs = { wraithlight: level.wraithlightPickups, 'mirror-ward': level.mirrorWardPickups,
    shield: level.shieldPickups, chrono: level.chronoPickups, surge: level.surgePickups }
  const flags = { wraithlight: 'wraithlightActive', 'mirror-ward': 'mirrorWardActive', shield: 'shieldActive', chrono: 'chronoActive', surge: 'surgeActive' }
  for (const step of mastery.steps.filter(step => step.kind === 'power')) {
    const pickup = catalogs[step.power].find(item => item.id === step.pickupId)
    assert.ok(pickup, step.id)
    assert.ok(Math.abs(step.x - pickup.x) <= 14, step.id)
    const player = playerAt(step, { [flags[step.power]]: false })
    assert.equal(decideStep(step, { player }, {}, 0).done, false)
    player[flags[step.power]] = true
    assert.equal(decideStep(step, { player }, {}, 0).done, true)
    delete player[flags[step.power]]
    assert.throws(() => decideStep(step, { player }, {}, 0), /power readback/)
  }
  assert.equal(level.aetherStepPickups?.length ?? 0, 0)
  assert.ok(mastery.steps.every(step => step.extraAirJumpDelayMs === undefined))
})

test('Wraithlight windows cover all caches, end on permanent returns and contain no combat or grace waits', async () => {
  const level = await authored
  assert.deepEqual(mastery.powerWindows.flatMap(window => window.cacheStepIds), level.masteryPickups.map(item => item.id))
  for (const window of mastery.powerWindows) {
    const pickup = level.wraithlightPickups.find(item => item.id === window.pickupId)
    assert.equal(window.durationMs, pickup.durationMs)
    const start = masteryIndex(window.startStepId)
    const escape = masteryIndex(window.escapeStepId)
    const end = Math.max(escape, ...window.cacheStepIds.map(masteryIndex))
    assert.ok(start < escape && window.cacheStepIds.every(id => masteryIndex(id) > start))
    assert.ok(mastery.steps.slice(start, end + 1).every(step => !['fight', 'wait'].includes(step.kind)))
    const target = masteryById(window.escapeStepId)
    assert.ok(level.platforms.some(platform => platform.y === target.y && platform.x < target.x && platform.x + platform.width > target.x))
    let travelLowerBoundMs = 0
    let previous = mastery.steps[start]
    for (const step of mastery.steps.slice(start + 1, end + 1)) {
      if (!Number.isFinite(step.x)) continue
      travelLowerBoundMs += Math.abs(step.x - previous.x) / (step.crouch ? 112 : 260) * 1000
      previous = step
    }
    assert.ok(travelLowerBoundMs < window.durationMs, `${window.pickupId}: impossible even at ideal horizontal speed`)
  }
  assert.match(mastery.powerStrategy.join(' '), /650ms grace is support-only/)
  assert.match(mastery.risks.join(' '), /same12.5s/)
})

test('actual spectral grace never activates a second platform or extends the cache power', async () => {
  const source = await readFile(new URL('../src/features/games/shadow-runner/game/runtimeReliability.ts', import.meta.url), 'utf8')
  const exports = {}
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: name => { assert.equal(name, './simulation'); return {} },
  }, { timeout: 1000 })
  const { createShadowRunnerSpectralGrace: create, updateShadowRunnerSpectralGrace: update } = exports
  const powered = update(create(), true, 12000, 11990, 'spectral-a')
  assert.equal(update(powered, false, 12000, 12010, 'spectral-a').platformId, 'spectral-a')
  assert.equal(update(powered, false, 12000, 12010, 'spectral-b').platformId, null)
  assert.equal(update(powered, false, 12000, 12650, 'spectral-a').platformId, null)
  const runtime = await readFile(new URL('../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts', import.meta.url), 'utf8')
  const collection = runtime.slice(runtime.indexOf('private collectMastery('), runtime.indexOf('private collectMastery(') + 1700)
  assert.match(collection, /isShadowRunnerWraithlightActive/)
  assert.match(collection, /!powerActive\) return/)
  assert.doesNotMatch(collection, /spectralGrace/)
})

test('all mastery jumps use matched takeoff height and at most the normal double-jump envelope', () => {
  let previous = mastery.start
  for (const step of mastery.steps.filter(step => Number.isFinite(step.x))) {
    if (step.kind === 'jump') {
      assert.equal(step.fromY, previous.y, step.id)
      const viaTime = step.viaX === undefined ? 0 : Math.abs(step.viaX - previous.x) / 260
      const delay = step.airJumpDelayMs === undefined ? 0 : Math.max(viaTime, step.airJumpDelayMs / 1000)
      const rise = delay ? 620 * delay - 820 * delay ** 2 : 0
      const velocity = delay ? 560 : 620
      const flight = delay + (velocity + Math.sqrt(velocity ** 2 + 3280 * (step.y - step.fromY + rise))) / 1640
      const distance = step.viaX === undefined ? Math.abs(step.x - previous.x) : Math.abs(step.viaX - previous.x) + Math.abs(step.x - step.viaX)
      assert.ok(Number.isFinite(flight) && distance <= flight * 260 + 18, `Exceeds ideal envelope including arrival tolerance: ${step.id}`)
    }
    assert.ok(step.y - previous.y < 330, `Unplanned damaging drop: ${step.id}`)
    previous = step
  }
})

test('mastery staged rises clear real platform lips in either direction before moving', async () => {
  const level = await authored
  const solids = [...level.platforms, ...level.crouchGates, ...level.spectralPlatforms]
  for (const step of mastery.steps.filter(step => step.riseBeforeMoveY !== undefined)) {
    const index = masteryIndex(step.id)
    const takeoff = mastery.steps.slice(0, index).findLast(candidate => Number.isFinite(candidate.x))
    const support = solids.find(solid => solid.y === step.y && solid.x < step.x && solid.x + solid.width > step.x)
    const tolerance = takeoff.kind === 'jump' ? 18 : 12
    assert.ok(support, step.id)
    assert.equal(step.riseBeforeMoveY, support.y - 6)
    if (takeoff.x < step.x) assert.ok(takeoff.x + tolerance + HALF_BODY < support.x, `Stage overlaps west lip: ${step.id}`)
    else assert.ok(takeoff.x - tolerance - HALF_BODY > support.x + support.width, `Stage overlaps east lip: ${step.id}`)
    for (const x of [takeoff.x - tolerance, takeoff.x + tolerance]) {
      assert.ok(!solids.some(solid => x + HALF_BODY > solid.x && x - HALF_BODY < solid.x + solid.width
        && solid.y < takeoff.y && solid.y + solid.height > step.riseBeforeMoveY - 54.6), `Head-blocked staged rise: ${step.id}/${x}`)
    }
    const action = decideStep(step, { player: playerAt(takeoff) }, {}, 0)
    assert.equal(action.jump, true)
    assert.equal(action.direction, 0)
  }
})

test('final air turn crosses viaX before reversing and uses only one second jump', () => {
  const step = masteryById('mastery-final-perch')
  const start = masteryById('mastery-final-air-turn-stage')
  const memory = {}
  assert.equal(step.viaX, 15965)
  assert.equal(step.airJumpDelayMs, 100)
  const initial = decideStep(step, { player: playerAt(start) }, memory, 0)
  assert.equal(initial.direction, -1)
  assert.equal(initial.jump, true)
  const before = decideStep(step, { player: playerAt(start, { x: 15970, bodyBottom: 292, velocityY: -420 }) }, memory, 120)
  assert.equal(before.direction, -1)
  assert.equal(before.jump, false)
  const turn = decideStep(step, { player: playerAt(start, { x: 15964, bodyBottom: 286, velocityY: -400 }) }, memory, 160)
  assert.equal(turn.direction, 1)
  assert.equal(turn.jump, true)
  assert.equal(decideStep(step, { player: playerAt(start, { x: 15980, bodyBottom: 260, velocityY: -500 }) }, memory, 260).jump, false)
  assert.equal(step.extraAirJumpDelayMs, undefined)
})

test('all eight mastery checkpoint targets remain inside actual body-center windows', async () => {
  const level = await authored
  assert.deepEqual(mastery.checkpointTargets.map(item => item.checkpointId), level.checkpoints.map(item => item.id))
  let previous = -1
  for (const target of mastery.checkpointTargets) {
    const checkpoint = level.checkpoints.find(item => item.id === target.checkpointId)
    const step = masteryById(target.stepId)
    assert.ok(masteryIndex(step.id) > previous)
    previous = masteryIndex(step.id)
    assert.ok(step.x - 12 >= checkpoint.x + 2 && step.x + 12 <= checkpoint.x + checkpoint.triggerWidth - 2)
    assert.ok(step.y - bodyHeight(step) / 2 >= checkpoint.minY && step.y - bodyHeight(step) / 2 <= checkpoint.maxY)
  }
})

test('low coins/caches crouch and constrained combat stays on clear supported aprons', async () => {
  const level = await authored
  const solids = [...level.platforms, ...level.crouchGates, ...level.tiltPlatforms]
  for (const step of mastery.steps.filter(step => step.kind === 'collect')) {
    const coin = level.coins[Number(step.coinId.slice(5)) - 1]
    if (coin.y === 596) assert.equal(step.crouch, true, step.id)
  }
  const barrel = mastery.steps.find(step => step.enemyId === 'catacomb-barrel-recovery')
  assert.equal(barrel.jumpStrikeY, undefined)
  assert.ok(barrel.minX - HALF_BODY > 10660)
  for (const step of mastery.steps.filter(step => step.kind === 'fight')) {
    const enemy = level.enemies.find(item => item.id === step.enemyId)
    for (let x = step.minX; x <= step.maxX; x += 5) {
      assert.ok(solids.some(solid => solid.y === enemy.y && solid.x <= x - HALF_BODY && solid.x + solid.width >= x + HALF_BODY), `Unsupported fight ${step.id}/${x}`)
      assert.ok(!solids.some(solid => x + HALF_BODY > solid.x && x - HALF_BODY < solid.x + solid.width && enemy.y > solid.y && enemy.y - 54.6 < solid.y + solid.height), `Embedded standing fight ${step.id}/${x}`)
    }
  }
})

test('final Rival stays alive until all coins and caches precede the only finish step', () => {
  const finalFight = mastery.steps.findIndex(step => step.enemyId === 'catacomb-rival-final')
  assert.ok(mastery.steps.filter(step => ['collect', 'relic'].includes(step.kind)).every(step => mastery.steps.indexOf(step) < finalFight))
  assert.equal(mastery.steps.filter(step => step.kind === 'finish').length, 1)
  assert.equal(mastery.steps.at(-1).id, 'mastery-catacomb-relay-door')
  assert.equal(mastery.steps.find(step => step.enemyId === 'catacomb-rival-final').jumpStrikeY, undefined)
})

test('requires every Relay Seal, but not caches or an all-coin route', async () => {
  const level = await authored
  assert.equal(policy.requirements.objectiveItems, level.objectivePickups.length)
  assert.deepEqual(relics.map(step => step.id), level.objectivePickups.map(pickup => pickup.id))
  assert.deepEqual(relics.map(step => step.minCount), [1, 2, 3])
  assert.ok(relics.every(step => step.counter === 'objectiveItems'))
  assert.equal(Object.hasOwn(policy.requirements, 'masteryItems'), false)
  assert.equal(level.masteryPickups.length, 5)
  assert.equal(policy.steps.some(step => step.kind === 'collect'), false)
  for (const [index, step] of relics.entries()) {
    const pickup = level.objectivePickups[index]
    assert.equal(step.x, pickup.x)
    assert.ok(step.y > pickup.y && step.y - pickup.y <= 80)
    assert.equal(step.crouch, undefined, 'Seals above a standing body require a natural jump, not a crouched stall')
  }
})

test('optional Ossuary and Echo fights leave sealed-passage and finish requirements unchanged', async () => {
  const level = await authored
  const necessary = [...new Set([
    ...level.encounters.filter(encounter => encounter.sealed).flatMap(encounter => encounter.enemyIds),
    ...level.requiredEnemyIds,
  ])]
  const fights = policy.steps.filter(step => step.kind === 'fight')
  assert.deepEqual(necessary, ['catacomb-warden-sanctum', 'catacomb-archer-sanctum', 'catacomb-rival-final'])
  assert.deepEqual(policy.requirements.requiredEnemyIds, necessary)
  const archers = ['catacomb-archer-ossuary-a', 'catacomb-archer-ossuary-b']
  assert.deepEqual(fights.map(step => step.enemyId), [...archers, ...echoLowFights.map(item => item.enemyId), ...necessary])
  assert.equal(fights.length, 7)
  assert.ok(fights.length < level.enemies.length)
  for (const step of fights) {
    const enemy = level.enemies.find(enemy => enemy.id === step.enemyId)
    if (!archers.includes(enemy.id)) assert.equal(enemy.y, 616)
    if (necessary.includes(step.enemyId)) {
      assert.ok(step.minX < enemy.x && step.maxX > enemy.x)
      assert.equal(step.jumpStrikeY, 616)
    } else {
      assert.equal(Object.hasOwn(step, 'jumpStrikeY'), false)
      assert.equal(Object.hasOwn(step, 'crouch'), false, 'Fight contract has no crouch field; retain the actual stance with roof clearance')
      assert.ok(step.minX < enemy.patrolRight && step.maxX > enemy.patrolLeft)
    }
    assert.equal(step.timeoutMs, 30000)
  }
})

test('Echo and Ossuary revisions add eight normal steps and preserve mastery byte-for-byte as JSON', () => {
  const additions = new Set([...echoLowFights.flatMap(item => [item.approachId, `fight-${item.enemyId}`]),
    'power-catacomb-mirror-echo', 'power-catacomb-mirror-ossuary',
    'fight-catacomb-archer-ossuary-a', 'fight-catacomb-archer-ossuary-b'])
  assert.equal(policy.steps.length, 113)
  assert.equal(policy.steps.filter(step => additions.has(step.id)).length, 8)
  const original = policy.steps.filter(step => !additions.has(step.id))
  assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'), 'e4e82d982b87561fb8b24d7426b408c1f540ea48b339780c13299dd17a31cff8')
  assert.equal(createHash('sha256').update(JSON.stringify(mastery)).digest('hex'), 'efa572ddba0b6e753451bdd55e2c452a3aaf62c62df63e7a4822e10401047d1d')
})

test('inside-gate Echo approaches and bounded fights retain crouch through the actual standing guard', async () => {
  const level = await authored
  const source = await readFile(new URL('../src/features/games/shadow-runner/game/runtimeReliability.ts', import.meta.url), 'utf8')
  const exports = {}
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: name => { assert.equal(name, './simulation'); return {} },
  }, { timeout: 1000 })
  const { canShadowRunnerStand, shouldShadowRunnerCrouch } = exports
  const solids = [...level.platforms, ...level.crouchGates]
  const obstacles = solids.map(solid => ({ left: solid.x, right: solid.x + solid.width, top: solid.y, bottom: solid.y + solid.height }))
  for (const item of echoLowFights) {
    const approach = byId(item.approachId)
    const fight = byId(`fight-${item.enemyId}`)
    const gate = level.crouchGates.find(gate => gate.id === item.gateId)
    const exit = byId(item.exitId)
    assert.equal(approach.crouch, true)
    assert.equal(approach.y, 616)
    assert.equal(exit.crouch, true)
    assert.equal(policy.steps[policy.steps.indexOf(fight) - 1], approach)
    assert.equal(policy.steps[policy.steps.indexOf(fight) + 1], exit)
    assert.ok(approach.x >= fight.minX && approach.x <= fight.maxX)
    assert.equal(616 - (gate.y + gate.height), 54)
    // Include the driver's 12px bound margin; this is not a knockback guarantee.
    for (const x of [approach.x - ARRIVAL, approach.x + ARRIVAL, fight.minX - ARRIVAL, fight.maxX + ARRIVAL]) {
      const body = { left: x - HALF_BODY, right: x + HALF_BODY, top: 616 - 26.9568, bottom: 616 }
      assert.ok(body.left > gate.x && body.right < gate.x + gate.width, `${item.enemyId}: whole body must remain below roof`)
      assert.ok(body.top > gate.y + gate.height)
      assert.ok(level.platforms.some(solid => solid.y === 616 && solid.x <= body.left && solid.x + solid.width >= body.right))
      assert.equal(canShadowRunnerStand(body, 54.6, obstacles), false)
      assert.equal(shouldShadowRunnerCrouch(false, true, true, canShadowRunnerStand(body, 54.6, obstacles)), true)
    }
    for (const x of [exit.x - ARRIVAL, exit.x + ARRIVAL]) {
      const body = { left: x - HALF_BODY, right: x + HALF_BODY, top: 616 - 26.9568, bottom: 616 }
      assert.equal(canShadowRunnerStand(body, 54.6, obstacles), true, 'Following crouched exit must actually clear the roof')
    }
  }
})

test('low Echo fight actions attack at actual foe height without jumping, granting kills or escaping bounds', () => {
  for (const item of echoLowFights) {
    const step = byId(`fight-${item.enemyId}`)
    const approach = byId(item.approachId)
    const debug = { player: playerAt(approach, { crouching: true, standingBlocked: true }),
      enemies: [{ id: item.enemyId, x: approach.x + 60, y: 616, alive: true }] }
    const memory = { facing: 1 }
    for (const time of [0, 100, 460, 30000]) {
      const action = decideStep(step, debug, memory, time)
      assert.equal(action.jump, false)
      assert.equal(action.crouch, false)
      assert.equal(action.attack, time !== 100)
      assert.equal(action.done, false, 'A timeout cannot manufacture an observed kill')
    }
    for (const [x, enemyX, facing] of [[step.minX - 4, step.minX - 150, -1], [step.maxX + 4, step.maxX + 150, 1]]) {
      const action = decideStep(step, { player: playerAt(approach, { x }), enemies: [{ ...debug.enemies[0], x: enemyX }] }, { facing }, 0)
      assert.equal(action.direction, -facing, 'Correct out-of-bounds motion toward the interior')
      assert.equal(action.jump, false)
    }
    debug.enemies[0].alive = false
    const complete = decideStep(step, debug, memory, 31000)
    assert.equal(complete.done, true)
    assert.equal(complete.jump, false)
    assert.equal(complete.attack, false)
    assert.equal(complete.direction, 0)
  }
})

test('normal readback permits uncollected caches and optional living enemies but fails missing requirements', async () => {
  const level = await authored
  const observation = complete => ({
    player: { objectiveItems: complete ? 3 : 0, totalObjectiveItems: 3, masteryItems: 0, totalMasteryItems: 5 },
    enemies: level.enemies.map(enemy => ({ id: enemy.id, alive: !(complete && policy.requirements.requiredEnemyIds.includes(enemy.id)) })),
  })
  assert.doesNotThrow(() => assertRouteRequirements(observation(false), policy.requirements, 'initial'))
  assert.doesNotThrow(() => assertRouteRequirements(observation(true), policy.requirements, 'complete'))
  const missingSeal = observation(true)
  missingSeal.player.objectiveItems = 2
  assert.throws(() => assertRouteRequirements(missingSeal, policy.requirements, 'complete'), /Unmet/)
  for (const id of policy.requirements.requiredEnemyIds) {
    const missingFight = observation(true)
    missingFight.enemies.find(enemy => enemy.id === id).alive = true
    assert.throws(() => assertRouteRequirements(missingFight, policy.requirements, 'complete'), /Unmet required enemy/)
  }
})

test('relic steps require both observed counts and grounded target arrival', () => {
  const step = relics[0]
  const done = player => decideStep(step, { player }, {}, 0).done
  assert.equal(done(playerAt(step)), false)
  assert.equal(done(playerAt(step, { objectiveItems: 1 })), true)
  assert.equal(done(playerAt(step, { objectiveItems: 1, x: step.x + 30 })), false)
  assert.equal(done(playerAt(step, { objectiveItems: 1, bodyBottom: step.y - 30 })), false)
  assert.equal(done(playerAt(step, { objectiveItems: 1, velocityY: 100 })), false)
  for (const overrides of [{ objectiveItems: undefined }, { objectiveItems: NaN }, { objectiveItems: -1 }, { totalObjectiveItems: undefined }]) {
    assert.throws(() => done(playerAt(step, overrides)), /Invalid or missing relic readback/)
  }
})

test('uncollected seals use bounded natural jumps without manufacturing completion', () => {
  const step = relics[2]
  const memory = {}
  for (const [index, time] of [0, 900, 1800, 2700].entries()) {
    const action = decideStep(step, { player: playerAt(step) }, memory, time)
    assert.equal(action.jump, index < 3)
    assert.equal(action.done, false)
    assert.equal(action.attack, false)
  }
  assert.equal(memory.collectJumps, 3)
})

test('every target and arrival band has permanent or chain support and avoids solid/spike overlap', async () => {
  const level = await authored
  const solids = [...level.platforms, ...level.tiltPlatforms, ...level.crouchGates]
  const failures = []
  for (const step of policy.steps.filter(step => Number.isFinite(step.x))) {
    for (const x of [step.x - ARRIVAL, step.x, step.x + ARRIVAL]) {
      const partial = {
        'fork-low-landing': { surface: 'catacomb-crawl-floor-a', minimumOverlap: 12.38 },
        'vault-chain-west': { surface: 'catacomb-tilt-vault', minimumOverlap: 10.38 },
      }[step.id]
      const supported = solids.some(solid => solid.y === step.y && (
        (solid.x <= x - HALF_BODY && solid.x + solid.width >= x + HALF_BODY)
        || (solid.id === partial?.surface && Math.min(x + HALF_BODY, solid.x + solid.width) - Math.max(x - HALF_BODY, solid.x) >= partial.minimumOverlap - 1e-8)
      ))
      if (!supported) failures.push(`Unsupported body at ${step.id}/${x}`)
      const intersects = solid => x + HALF_BODY > solid.x && x - HALF_BODY < solid.x + solid.width
        && step.y > solid.y && step.y - bodyHeight(step) < solid.y + solid.height
      if (solids.some(intersects)) failures.push(`Embedded target ${step.id}/${x}`)
      if (level.spikes.some(intersects)) failures.push(`Spike target ${step.id}/${x}`)
    }
  }
  assert.deepEqual(failures, [])
})

test('normal fork landing clears the hidden toe across the actual18px jump band before crawling underneath', async () => {
  const level = await authored
  const landing = byId('fork-low-landing')
  const crawl = byId('fork-crawl-entry')
  const toe = level.platforms.find(platform => platform.id === 'catacomb-fork-toe-step')
  const floor = level.platforms.find(platform => platform.id === 'catacomb-crawl-floor-a')
  assert.equal(landing.x, 2834)
  assert.equal(landing.y, 616)
  assert.ok(landing.x + 18 + HALF_BODY < toe.x)
  for (const x of [landing.x - 18, landing.x + 18]) {
    const overlap = Math.min(x + HALF_BODY, floor.x + floor.width) - Math.max(x - HALF_BODY, floor.x)
    assert.ok(overlap >= 12.38 - 1e-8)
  }
  assert.equal(crawl.crouch, true)
  assert.equal(crawl.y, 616)
  assert.ok(crawl.x > toe.x && crawl.x < toe.x + toe.width)
  assert.ok(crawl.y - (toe.y + toe.height) > 26.9568)
  assert.equal(masteryById('mastery-fork-toe').y, toe.y)
})

test('normal and mastery vault chain staging clear the return-step underside across18px tolerance', async () => {
  const level = await authored
  const lip = level.platforms.find(platform => platform.id === 'catacomb-vault-return-b')
  const chain = level.tiltPlatforms.find(platform => platform.id === 'catacomb-tilt-vault')
  assert.equal(byId('vault-chain-west').x, 5552)
  for (const [step, minimumOverlap] of [[byId('vault-chain-west'), 10.38], [masteryById('mastery-vault-chain'), 16.38]]) {
    assert.equal(step.y, chain.y)
    assert.ok(step.x + 18 + HALF_BODY < lip.x, step.id)
    for (const x of [step.x - 18, step.x + 18]) {
      const overlap = Math.min(x + HALF_BODY, chain.x + chain.width) - Math.max(x - HALF_BODY, chain.x)
      assert.ok(overlap >= minimumOverlap - 1e-8, step.id)
    }
  }
})

test('jump takeoff heights are consistent and unsupported large leaps/drops are not declared', () => {
  let previous = policy.start
  for (const step of policy.steps.filter(step => Number.isFinite(step.x))) {
    if (step.kind === 'jump') {
      assert.equal(step.fromY, previous.y, step.id)
      const delay = step.airJumpDelayMs === undefined ? 0 : step.airJumpDelayMs / 1000
      const rise = delay ? 620 * delay - 820 * delay ** 2 : 0
      const velocity = delay ? 560 : 620
      const flight = delay + (velocity + Math.sqrt(velocity ** 2 + 3280 * (step.y - step.fromY + rise))) / 1640
      assert.ok(Number.isFinite(flight) && Math.abs(step.x - previous.x) <= flight * 260, `Exceeds ideal no-obstacle jump envelope: ${step.id}`)
    }
    assert.ok(step.y - previous.y < 330, `Unplanned damaging drop ${step.id}`)
    previous = step
  }
})

test('staged rises start outside the lip and request vertical clearance before moving', async () => {
  const level = await authored
  for (const step of policy.steps.filter(step => step.riseBeforeMoveY !== undefined)) {
    const index = policy.steps.indexOf(step)
    const takeoff = policy.steps.slice(0, index).findLast(candidate => Number.isFinite(candidate.x))
    const support = level.platforms.find(platform => platform.y === step.y && platform.x < step.x && platform.x + platform.width > step.x)
    assert.ok(support, step.id)
    assert.ok(takeoff.x + ARRIVAL + HALF_BODY < support.x, `Takeoff inside lip ${step.id}`)
    assert.equal(step.riseBeforeMoveY, support.y - 6)
    for (const x of [takeoff.x - ARRIVAL, takeoff.x + ARRIVAL]) {
      assert.ok(![...level.platforms, ...level.crouchGates].some(solid =>
        x + HALF_BODY > solid.x && x - HALF_BODY < solid.x + solid.width
        && solid.y < takeoff.y && solid.y + solid.height > step.riseBeforeMoveY - 54.6), `Head-blocked vertical rise ${step.id}`)
    }
    const action = decideStep(step, { player: playerAt(takeoff) }, {}, 0)
    assert.equal(action.direction, 0)
    assert.equal(action.jump, true)
  }
})

test('all eight checkpoint metadata targets sit safely inside the authored body-center windows', async () => {
  const level = await authored
  assert.equal(policy.checkpointTargets.length, 8)
  assert.deepEqual(policy.checkpointTargets.map(target => target.checkpointId), level.checkpoints.map(checkpoint => checkpoint.id))
  let previousIndex = -1
  for (const [index, target] of policy.checkpointTargets.entries()) {
    const checkpoint = level.checkpoints[index]
    const step = byId(target.stepId)
    assert.ok(step)
    assert.ok(policy.steps.indexOf(step) > previousIndex)
    previousIndex = policy.steps.indexOf(step)
    assert.ok(step.x - ARRIVAL >= checkpoint.x + 2 && step.x + ARRIVAL <= checkpoint.x + checkpoint.triggerWidth - 2, target.checkpointId)
    const centerY = step.y - bodyHeight(step) / 2
    assert.ok(centerY >= checkpoint.minY && centerY <= checkpoint.maxY, target.checkpointId)
  }
  assert.match(policy.risks.join(' '), /does not enforce checkpointTargets/)
})

test('each chosen low crawl stays crouched until the whole arrival body clears its gate', async () => {
  const level = await authored
  for (const [startId, endId, gateId] of [
    ['fork-crawl-entry', 'fork-crawl-exit', 'catacomb-crawl-gate-a'],
    ['vault-crawl-entry', 'vault-crawl-exit', 'catacomb-crawl-gate-b'],
    ['echo-crawl-west-entry', 'echo-crawl-west-exit', 'catacomb-crawl-gate-d'],
    ['echo-crawl-east-entry', 'echo-crawl-east-exit', 'catacomb-crawl-gate-e'],
  ]) {
    const start = byId(startId)
    const end = byId(endId)
    const gate = level.crouchGates.find(gate => gate.id === gateId)
    assert.ok(start.x + ARRIVAL + HALF_BODY < gate.x)
    assert.ok(end.x - ARRIVAL - HALF_BODY > gate.x + gate.width)
    for (const step of policy.steps.slice(policy.steps.indexOf(start), policy.steps.indexOf(end) + 1)) {
      const guardedFight = echoLowFights.find(item => item.gateId === gateId && step.id === `fight-${item.enemyId}`)
      if (guardedFight) {
        assert.equal(step.kind, 'fight')
        assert.equal(Object.hasOwn(step, 'jumpStrikeY'), false)
        assert.equal(Object.hasOwn(step, 'crouch'), false)
        assert.ok(step.minX - ARRIVAL - HALF_BODY > gate.x)
        assert.ok(step.maxX + ARRIVAL + HALF_BODY < gate.x + gate.width)
      } else assert.equal(step.crouch, true, step.id)
    }
  }
})

test('power steps use supported live-driver flags and real pickups before their intended sections', async () => {
  const level = await authored
  const lists = { shield: level.shieldPickups, chrono: level.chronoPickups, surge: level.surgePickups, 'mirror-ward': level.mirrorWardPickups }
  const powers = policy.steps.filter(step => step.kind === 'power')
  assert.equal(powers.length, 7)
  for (const step of powers) {
    const pickup = lists[step.power]?.find(pickup => pickup.id === step.pickupId)
    assert.ok(pickup, step.id)
    assert.ok(Math.abs(step.x - pickup.x) <= 14)
    assert.ok(step.y > pickup.y && step.y - pickup.y <= 80)
    const observedFlag = step.power === 'mirror-ward' ? 'mirrorWardActive' : `${step.power}Active`
    assert.equal(decideStep(step, { player: playerAt(step, { [observedFlag]: false }) }, {}, 0).done, false)
    assert.equal(decideStep(step, { player: playerAt(step, { [observedFlag]: true }) }, {}, 0).done, true)
    assert.throws(() => decideStep(step, { player: playerAt(step) }, {}, 0), /Invalid or missing power readback/)
  }
  const before = (first, second) => assert.ok(policy.steps.indexOf(byId(first)) < policy.steps.indexOf(byId(second)))
  before('power-catacomb-shield-ossuary', 'ossuary-cover-west')
  before('power-catacomb-mirror-ossuary', 'power-catacomb-shield-ossuary')
  before('fight-catacomb-archer-ossuary-a', 'ossuary-perch-east')
  before('fight-catacomb-archer-ossuary-b', 'ossuary-east-step')
  before('power-catacomb-mirror-echo', 'echo-exit-takeoff')
  before('power-catacomb-surge-sanctum', 'fight-catacomb-warden-sanctum')
  before('power-catacomb-shield-sanctum', 'fight-catacomb-archer-sanctum')
  assert.match(policy.powerStrategy.join(' '), /Never depend on Wraithlight/)
})

test('Echo Mirror Ward is a finite observed pickup stop, not assumed protection or an injected grant', async () => {
  const level = await authored
  const step = byId('power-catacomb-mirror-echo')
  const pickup = level.mirrorWardPickups.find(item => item.id === step.pickupId)
  const shelf = level.platforms.find(item => item.id === 'catacomb-echo-return-b')
  assert.equal(step.x, pickup.x)
  assert.equal(step.y, 616)
  assert.equal(step.timeoutMs, 5000)
  assert.equal(pickup.durationMs, 10000)
  assert.equal(pickup.reflectionCharges, 5)
  assert.equal(policy.steps[policy.steps.indexOf(step) - 1].id, 'echo-crawl-east-exit')
  assert.equal(policy.steps[policy.steps.indexOf(step) + 1].id, 'echo-exit-takeoff')
  assert.equal(step.crouch, undefined)
  const memory = {}
  for (const [index, now] of [0, 900, 1800, 2700, 5000].entries()) {
    const action = decideStep(step, { player: playerAt(step, { mirrorWardActive: false }) }, memory, now)
    assert.equal(action.done, false)
    assert.equal(action.attack, false)
    assert.equal(action.jump, index < 3)
  }
  assert.equal(memory.collectJumps, 3)
  assert.equal(decideStep(step, { player: playerAt(step, { mirrorWardActive: true }) }, {}, 0).done, true)
  assert.equal(decideStep(step, { player: playerAt(step, { mirrorWardActive: true, bodyBottom: 590, velocityY: -100 }) }, {}, 0).done, false)
  assert.throws(() => decideStep(step, { player: playerAt(step) }, {}, 0), /power readback/)
  // The shelf limits a natural jump to29.4px but leaves the entire pickup bob
  // range inside the standing AABB at ceiling contact. No roof crossing is needed.
  const ceiling = shelf.y + shelf.height
  const contactFoot = ceiling + 54.6
  assert.ok(contactFoot < step.y)
  assert.ok(pickup.y - 10 > ceiling && pickup.y < contactFoot)
  for (const x of [step.x - ARRIVAL, step.x + ARRIVAL]) {
    assert.ok(x - HALF_BODY < pickup.x && x + HALF_BODY > pickup.x)
  }
})

test('lower pursuit recovery and the final gate avoid optional spectral/cache requirements', async () => {
  const level = await authored
  assert.equal(byId('pursuit-recovery-slab').y, 666)
  assert.equal(byId('pursuit-east-landing').fromY, 666)
  const finish = policy.steps.at(-1)
  assert.equal(finish.kind, 'finish')
  assert.equal(policy.steps.filter(step => step.kind === 'finish').length, 1)
  assert.ok(finish.x - ARRIVAL > level.finish.x && finish.x + ARRIVAL < level.finish.x + level.finish.width)
  assert.equal(decideStep(finish, { player: playerAt(finish) }, {}, 0).done, false)
  assert.ok(relics.every(step => policy.steps.indexOf(step) < policy.steps.indexOf(finish)))
})

test('module is inert JSON-safe policy data with unique IDs and no scene, storage or browser writes', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-catacomb-route-policies.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bimport\b|__shadowRunner|\bwindow\b|\bdocument\b|\bfetch\b|playwright|setPosition|setVelocity|writeFile|localStorage|child_process/)
  assert.deepEqual(JSON.parse(JSON.stringify(CATACOMB_ROUTE_POLICIES)), CATACOMB_ROUTE_POLICIES)
  assert.equal(new Set(policy.steps.map(step => step.id)).size, policy.steps.length)
  assert.ok(policy.steps.length <= 150)
  for (const field of ['teleport', 'collect', 'restore', 'health', 'lives']) {
    assert.throws(() => validatePolicy({ ...policy, steps: [{ ...policy.steps[0], [field]: true }, ...policy.steps.slice(1)] }), /Unknown fields/)
  }
})
