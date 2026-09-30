import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { CAUSEWAY_RELIC_STEP_CONTRACT, CAUSEWAY_ROUTE_POLICIES } from '../scripts/shadow-runner-causeway-route-policies.mjs'
import { validatePolicy, decideStep, POWER_READBACK_FIELDS } from '../scripts/shadow-runner-route-proof.mjs'

const policy = CAUSEWAY_ROUTE_POLICIES[0]
const stepById = id => policy.steps.find(step => step.id === id)
const relics = policy.steps.filter(step => step.kind === 'relic')
const mastery = CAUSEWAY_ROUTE_POLICIES.find(candidate => candidate.mode === 'mastery')
const masteryStep = id => mastery.steps.find(step => step.id === id)
const player = (x, bodyBottom, velocityY = 0) => ({ x, y: bodyBottom, bodyBottom, velocityY })

async function readLevel() {
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
  for (const statement of source.statements.filter(ts.isVariableStatement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(source) === 'SHADOW_RUNNER_LEVEL_SEVEN') return literal(declaration.initializer)
    }
  }
  throw new Error('Missing authored Level7 config')
}

const authored = readLevel()

// A declaration contract only. No relic driver is implemented or executed by these tests.
function assertRelicDeclaration(step, totals) {
  assert.equal(step.kind, 'relic')
  assert.match(step.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  assert.ok(Object.keys(step).every(key => CAUSEWAY_RELIC_STEP_CONTRACT.fields.includes(key)))
  assert.ok(CAUSEWAY_RELIC_STEP_CONTRACT.counters.includes(step.counter))
  assert.ok(Number.isInteger(step.minCount) && step.minCount > 0 && step.minCount <= totals[step.counter])
  assert.ok(Number.isFinite(step.x) && step.x >= 0 && Number.isFinite(step.y) && step.y >= 0)
  assert.ok(step.crouch === undefined || typeof step.crouch === 'boolean')
  assert.ok(step.timeoutMs === undefined || (Number.isInteger(step.timeoutMs) && step.timeoutMs >= 1000 && step.timeoutMs <= 30000))
}

test('L7 normal is a standalone candidate with the actual world, spawn and reward catalog', async () => {
  const level = await authored
  assert.equal(CAUSEWAY_ROUTE_POLICIES.length, 2)
  assert.equal(policy.levelId, 'level-7')
  assert.equal(policy.mode, 'normal')
  assert.equal(policy.candidateOnly, true)
  assert.match(policy.scope, /Candidate ordinary route/)
  assert.match(policy.scope, /no all-coin\/all-enemy requirement/)
  assert.equal(policy.title, level.title)
  assert.equal(policy.worldWidth, level.worldWidth)
  assert.deepEqual(policy.start, { x: level.playerStart.x, y: level.playerStart.y })
  assert.equal(policy.expected.coins, level.coins.length)
  assert.deepEqual(policy.expected.enemyIds, level.enemies.map(enemy => enemy.id))
  assert.ok(policy.steps.length <= 150)
})

test('all three authored Moon Shards are required, in order, without making every enemy mandatory', async () => {
  const level = await authored
  assert.equal(level.moonShardPickups.length, 3)
  assert.deepEqual(policy.requirements, { moonShards: 3, objectiveItems: 0, masteryItems: 0, requiredEnemyIds: [] })
  assert.deepEqual(level.requiredEnemyIds ?? [], [])
  assert.equal((level.objectivePickups ?? []).length, 0)
  assert.deepEqual(relics.map(step => step.id), level.moonShardPickups.map(pickup => pickup.id))
  assert.deepEqual(relics.map(step => step.minCount), [1, 2, 3])
  for (const step of relics) {
    assertRelicDeclaration(step, policy.requirements)
    const pickup = level.moonShardPickups.find(pickup => pickup.id === step.id)
    assert.equal(step.x, pickup.x)
    const height = step.crouch ? 27 : 54.6
    assert.ok(pickup.y + 18 > step.y - height && pickup.y - 18 < step.y)
  }
  const fights = policy.steps.filter(step => step.kind === 'fight')
  assert.ok(fights.length < level.enemies.length)
  assert.ok(fights.every(step => level.enemies.some(enemy => enemy.id === step.enemyId)))
  assert.ok(!fights.some(step => ['causeway-high-archer-a', 'causeway-high-archer-b'].includes(step.enemyId)))
  assert.ok(fights.some(step => step.enemyId === 'causeway-high-archer-c'))
  assert.equal(policy.steps.some(step => step.kind === 'collect'), false)
})

test('proposed relic declaration rejects extra mutation fields, invalid counters, bad counts and coordinates', () => {
  for (const invalid of [
    { counter: 'health' }, { counter: 'coins' }, { minCount: 0 }, { minCount: 1.5 }, { minCount: 4 },
    { minCount: Infinity }, { x: NaN }, { y: -1 }, { crouch: 'yes' }, { health: 12 },
    { teleport: true }, { timeoutMs: 60000 }, { id: 'bad id' },
  ]) assert.throws(() => assertRelicDeclaration({ ...relics[0], ...invalid }, policy.requirements))
  for (const counter of CAUSEWAY_RELIC_STEP_CONTRACT.counters) {
    assertRelicDeclaration({ ...relics[0], counter }, { moonShards: 3, objectiveItems: 2, masteryItems: 1 })
  }
  assert.match(CAUSEWAY_RELIC_STEP_CONTRACT.observation, /missing counters fail closed/)
  assert.match(CAUSEWAY_RELIC_STEP_CONTRACT.completion, /AND actual grounded target arrival/)
  assert.equal(CAUSEWAY_RELIC_STEP_CONTRACT.maxGroundJumps, 3)
  assert.equal(CAUSEWAY_RELIC_STEP_CONTRACT.crouchedJumpAllowed, false)
})

test('IDs are unique and the entire relic/surge candidate satisfies the shared harness contract', () => {
  assert.equal(new Set(policy.steps.map(step => step.id)).size, policy.steps.length)
  for (const step of policy.steps) assert.match(step.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  assert.equal(validatePolicy(policy), policy)
  assert.deepEqual(CAUSEWAY_RELIC_STEP_CONTRACT.additionalPower, { name: 'surge', observedFlag: 'surgeActive' })
  assert.match(policy.risks[0], /integration/)
})

test('target positions and their arrival band are supported and unembedded, not proof of intervening travel', async () => {
  const level = await authored
  const solids = [...level.platforms, ...level.tiltPlatforms, ...level.crouchGates]
  for (const step of policy.steps.filter(step => Number.isFinite(step.x))) {
    const height = step.crouch ? 27 : 54.6
    for (const x of [step.x - 12, step.x, step.x + 12]) {
      assert.ok(solids.some(solid => solid.x <= x && solid.x + solid.width >= x && solid.y === step.y), `Unsupported ${step.id} at${x}`)
      assert.ok(!solids.some(solid => x + 16.38 > solid.x && x - 16.38 < solid.x + solid.width
        && step.y > solid.y && step.y - height < solid.y + solid.height), `Embedded ${step.id} at${x}`)
      assert.ok(!level.spikes.some(spike => x + 16.38 > spike.x && x - 16.38 < spike.x + spike.width
        && step.y > spike.y && step.y - height < spike.y + spike.height), `Hazard target ${step.id}`)
    }
  }
})

test('jump stages start at the previous supported height and avoid large direct shard drops', () => {
  let previousY = 616
  for (const step of policy.steps) {
    if (!Number.isFinite(step.x)) continue
    if (step.kind === 'jump') assert.equal(step.fromY, previousY, step.id)
    assert.ok(step.y - previousY < 330, `Large planned landing drop at${step.id}`)
    previousY = step.y
  }
  assert.equal(stepById('first-shard-roof-return').y, 446)
  assert.equal(stepById('first-shard-east-drop').y, 616)
  assert.equal(stepById('final-shard-return-step').y, 360)
  assert.equal(stepById('final-approach-drop').y, 616)
})

test('high shard routes use actual intermediate ledges and rise outside solid undersides', async () => {
  const level = await authored
  for (const [id, platformId] of [
    ['first-shard-step', 'causeway-low-step-a'], ['volley-step-a', 'causeway-high-step-a'],
    ['rubble-east-step', 'causeway-archer-step-b'], ['final-shard-step-a', 'causeway-final-step-a'],
  ]) {
    const index = policy.steps.findIndex(step => step.id === id)
    const step = policy.steps[index]
    const takeoff = policy.steps[index - 1]
    const platform = level.platforms.find(platform => platform.id === platformId)
    assert.equal(step.y, platform.y)
    assert.equal(step.riseBeforeMoveY, platform.y - 6)
    assert.ok(takeoff.x + 12 + 16.38 < platform.x, id)
    const memory = {}
    const action = decideStep(step, { player: player(takeoff.x, step.fromY) }, memory, 0)
    assert.equal(action.direction, 0)
    assert.equal(action.jump, true)
    assert.equal(action.done, false)
  }
  assert.equal(stepById('first-shard-ledge').y, 370)
  assert.equal(stepById('first-shard-perch').y, 278)
  assert.equal(stepById('final-shard-step-b').y, 360)
  assert.equal(stepById('final-shard-perch').y, 260)
})

test('the crouch shard and checkpoint corridors keep the low body until clear of each roof', async () => {
  const level = await authored
  const roof = level.crouchGates.find(gate => gate.id === 'causeway-crawl-gate-b')
  const start = policy.steps.findIndex(step => step.id === 'second-shard-crawl-entry')
  const end = policy.steps.findIndex(step => step.id === 'second-shard-crawl-exit')
  assert.ok(policy.steps[start].x + 12 + 16.38 < roof.x)
  assert.ok(policy.steps[end].x - 12 - 16.38 > roof.x + roof.width)
  assert.ok(policy.steps.slice(start, end + 1).every(step => step.crouch === true))
  assert.equal(relics[1].counter, 'moonShards')
  assert.equal(relics[1].crouch, true)
  for (const id of ['checkpoint-final-archers', 'final-crawl-exit', 'checkpoint-relay-approach', 'relay-crawl-exit']) {
    assert.equal(stepById(id).crouch, true)
  }
})

test('all six checkpoints have supported targets inside their real spatial window', async () => {
  const level = await authored
  const checkpointSteps = policy.steps.filter(step => step.id.startsWith('checkpoint-'))
  assert.equal(checkpointSteps.length, level.checkpoints.length)
  for (const [index, checkpoint] of level.checkpoints.entries()) {
    const step = checkpointSteps[index]
    assert.ok(step.x - 12 >= checkpoint.x && step.x + 12 <= checkpoint.x + (checkpoint.triggerWidth ?? 160), checkpoint.id)
    assert.ok(step.y >= (checkpoint.minY ?? checkpoint.y - 120) && step.y <= (checkpoint.maxY ?? checkpoint.y + 24), checkpoint.id)
  }
})

test('power approaches match authored pickups without injection or unsupported airborne collection stops', async () => {
  const level = await authored
  const arrays = { shield: 'shieldPickups', chrono: 'chronoPickups', surge: 'surgePickups' }
  for (const step of policy.steps.filter(step => step.kind === 'power')) {
    assert.ok(Object.hasOwn(arrays, step.power))
    const pickup = level[arrays[step.power]].find(pickup => pickup.id === step.pickupId)
    assert.ok(pickup, step.pickupId)
    assert.ok(Math.abs(step.x - pickup.x) <= 14)
    assert.ok(step.y > pickup.y && step.y - pickup.y <= 64)
  }
  assert.equal(stepById('power-shadow-surge-final-perch').x, 9874)
  assert.equal(policy.steps.some(step => step.pickupId === 'chrono-causeway-gauntlet'), false)
  assert.ok(policy.steps.findIndex(step => step.id === 'power-shadow-surge-final-perch')
    < policy.steps.findIndex(step => step.id === 'fight-causeway-high-archer-c'))
})

test('normal bypasses optional stalker B on the continuous road after actual Chrono activation', async () => {
  const level = await authored
  const stalker = level.enemies.find(enemy => enemy.id === 'causeway-stalker-b')
  assert.ok(stalker)
  assert.ok(!(level.requiredEnemyIds ?? []).includes(stalker.id))
  assert.ok(policy.expected.enemyIds.includes(stalker.id))
  assert.equal(policy.steps.some(step => step.enemyId === stalker.id), false)
  const index = policy.steps.findIndex(step => step.id === 'power-chrono-causeway-climb')
  const chrono = policy.steps[index]
  const takeoff = policy.steps[index + 1]
  assert.deepEqual(policy.steps.slice(index - 1, index + 6).map(step => step.id), [
    'checkpoint-shard-climb', 'power-chrono-causeway-climb', 'volley-step-takeoff',
    'volley-step-a', 'volley-step-a-edge', 'volley-step-b', 'volley-pocket-drop',
  ])
  assert.equal(takeoff.kind, 'move')
  const floor = level.platforms.find(platform => platform.id === 'causeway-high-recovery-a')
  assert.equal(chrono.y, floor.y)
  assert.equal(takeoff.y, floor.y)
  const left = chrono.x - 12 - 16.38
  const right = takeoff.x + 12 + 16.38
  assert.ok(left > floor.x && right < floor.x + floor.width)
  const obstacles = [...level.platforms, ...level.tiltPlatforms, ...level.crouchGates, ...level.spikes]
  assert.ok(!obstacles.some(solid => solid.x < right && solid.x + solid.width > left
    && solid.y < floor.y && solid.y + solid.height > floor.y - 54.6))
  assert.equal(policy.steps[index + 6].id, 'power-causeway-shield-first-volley')
  assert.deepEqual(relics.map(step => step.minCount), [1, 2, 3])

  const lowHealth = Object.freeze({ ...player(chrono.x, chrono.y), health: 3, lives: 3, chronoActive: false })
  assert.equal(decideStep(chrono, { player: lowHealth }, {}, 0).done, false)
  assert.equal(decideStep(chrono, { player: { ...lowHealth, chronoActive: true } }, {}, 0).done, true)
  const alive = Object.freeze({ id: stalker.id, alive: true, health: 5, x: stalker.x, y: floor.y })
  const action = decideStep(takeoff, { player: lowHealth, enemies: [alive] }, {}, 0)
  assert.equal(action.direction, 1)
  assert.equal(action.attack, false)
  assert.equal(action.jump, false)
  assert.equal(action.done, false)
  assert.equal(lowHealth.health, 3)
  assert.equal(alive.health, 5)
  assert.equal(decideStep(takeoff, { player: player(takeoff.x, floor.y - 30, 100), enemies: [alive] }, {}, 0).done, false)
  assert.equal(decideStep(takeoff, { player: player(takeoff.x, floor.y), enemies: [alive] }, {}, 0).done, true)
})

test('finish is after all required relics and targets the actual gate without an all-enemy condition', async () => {
  const level = await authored
  const finish = policy.steps.at(-1)
  assert.equal(finish.kind, 'finish')
  assert.ok(finish.x > level.finish.x && finish.x < level.finish.x + level.finish.width)
  assert.ok(finish.y - 54.6 < level.finish.y + level.finish.height && finish.y > level.finish.y)
  assert.equal(policy.steps.filter(step => step.kind === 'finish').length, 1)
  assert.equal(relics.at(-1).minCount, policy.requirements.moonShards)
  assert.equal(decideStep(finish, { player: player(finish.x, finish.y) }, {}, 0).done, false)
})

test('the module is JSON-safe declarative data only and cannot operate the scene or browser', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-causeway-route-policies.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bimport\b|__shadowRunner|\bwindow\b|\bdocument\b|\bfetch\b|playwright|setPosition|setVelocity|writeFile|localStorage/)
  assert.deepEqual(JSON.parse(JSON.stringify(CAUSEWAY_ROUTE_POLICIES)), CAUSEWAY_ROUTE_POLICIES)
  assert.deepEqual(JSON.parse(JSON.stringify(CAUSEWAY_RELIC_STEP_CONTRACT)), CAUSEWAY_RELIC_STEP_CONTRACT)
})

test('mastery is separately bounded and explicitly unproven; normal remains byte-equivalent data', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(policy)).digest('hex'),
    '9a0e56a20b534bbeb81c58aed25499bbb45b0b5ef7c6d961896b89755b4415bd')
  assert.equal(validatePolicy(mastery), mastery)
  assert.equal(mastery.candidateOnly, true)
  assert.match(mastery.scope, /No gameplay proof/)
  assert.match(mastery.scope, /first-death stop remain unchanged/)
  assert.equal(mastery.recommendedTimeoutMs, 900000)
  assert.ok(mastery.steps.length <= 500)
  assert.equal(new Set(mastery.steps.map(step => step.id)).size, mastery.steps.length)
  assert.equal(mastery.steps.some(step => step.extraAirJumpDelayMs !== undefined), false)
})

test('mastery enumerates every authored coin and enemy once, and all three required shards', async () => {
  const level = await authored
  const coins = mastery.steps.filter(step => step.kind === 'collect')
  const fights = mastery.steps.filter(step => step.kind === 'fight')
  const shards = mastery.steps.filter(step => step.kind === 'relic')
  assert.equal(coins.length, 60)
  assert.deepEqual(coins.map(step => step.coinId).sort(), level.coins.map(coin => coin.id).sort())
  assert.deepEqual(coins.map(step => step.minCoins), Array.from({ length: 60 }, (_, index) => index + 1))
  assert.equal(fights.length, 15)
  assert.deepEqual(fights.map(step => step.enemyId).sort(), level.enemies.map(enemy => enemy.id).sort())
  assert.deepEqual(mastery.expected, policy.expected)
  assert.deepEqual(mastery.requirements, policy.requirements)
  assert.deepEqual(shards.map(step => step.minCount), [1, 2, 3])
  assert.deepEqual(shards.map(step => step.id), level.moonShardPickups.map(shard => `${shard.id}-mastery`))
  for (const step of shards) assertRelicDeclaration(step, mastery.requirements)
})

const halfWidth = 32.76 / 2
const standingHeight = 54.6
const crouchedHeight = 26.9568
const tolerance = step => step.kind === 'jump' ? 18 : 12
const solidsFor = level => [...level.platforms, ...level.tiltPlatforms, ...level.crouchGates]
const overlaps = (x, y, height, solid) => x + halfWidth > solid.x && x - halfWidth < solid.x + solid.width
  && y > solid.y && y - height < solid.y + solid.height

// Endpoint envelopes, not a physics simulation: dynamic tilts and intervening travel need real input.
function supportedWidth(x, y, solids) {
  const segments = solids.filter(solid => solid.y === y)
    .map(solid => [Math.max(x - halfWidth, solid.x), Math.min(x + halfWidth, solid.x + solid.width)])
    .filter(([left, right]) => left < right).sort((a, b) => a[0] - b[0])
  let end = -Infinity
  let width = 0
  for (const [left, right] of segments) {
    width += Math.max(0, right - Math.max(left, end))
    end = Math.max(end, right)
  }
  return width
}

test('mastery uses exact scaled standing/crouched bodies and nominal supported target envelopes', async () => {
  const level = await authored
  assert.ok(Math.abs(mastery.geometry.bodyWidth - 42 * 0.78) < 1e-10)
  assert.ok(Math.abs(mastery.geometry.standingHeight - 70 * 0.78) < 1e-10)
  assert.ok(Math.abs(mastery.geometry.crouchedHeight - 48 * 0.78 * 0.72) < 1e-10)
  assert.equal(mastery.geometry.arrivalToleranceX, 12)
  assert.equal(mastery.geometry.jumpArrivalToleranceX, 18)
  const solids = solidsFor(level)
  const exceptions = mastery.geometry.partialSupport
  assert.deepEqual(exceptions.map(exception => exception.stepId), ['power-shadow-surge-final-perch'])
  for (const step of mastery.steps.filter(step => Number.isFinite(step.x))) {
    const height = step.crouch ? crouchedHeight : standingHeight
    for (const x of [step.x - tolerance(step), step.x, step.x + tolerance(step)]) {
      const minimum = exceptions.find(exception => exception.stepId === step.id)?.minimumBodyOverlap ?? 32.76
      assert.ok(supportedWidth(x, step.y, solids) >= minimum - 1e-8, `Insufficient support: ${step.id} at${x}`)
      assert.ok(solids.some(solid => solid.y === step.y && x >= solid.x && x <= solid.x + solid.width), step.id)
      assert.ok(!solids.some(solid => overlaps(x, step.y, height, solid)), `Embedded: ${step.id} at${x}`)
      assert.ok(!level.spikes.some(spike => overlaps(x, step.y, height, spike)), `Hazard: ${step.id}`)
    }
  }
})

test('all four mastery crawls keep the exact low body until fully beyond the authored roof', async () => {
  const level = await authored
  for (const suffix of ['a', 'b', 'c', 'd']) {
    const roof = level.crouchGates.find(gate => gate.id === `causeway-crawl-gate-${suffix}`)
    const start = mastery.steps.findIndex(step => step.id === `mastery-crawl-${suffix}-entry`)
    const end = mastery.steps.findIndex(step => step.id === `mastery-crawl-${suffix}-exit`)
    const clearance = 616 - roof.y - roof.height
    assert.equal(clearance, 54)
    assert.ok(clearance < standingHeight && clearance > crouchedHeight)
    assert.ok(Math.abs(clearance - crouchedHeight - mastery.geometry.crouchSpareHeight) < 1e-10)
    assert.ok(mastery.steps[start].x + 12 + halfWidth < roof.x)
    assert.ok(mastery.steps[end].x - 12 - halfWidth > roof.x + roof.width)
    assert.ok(mastery.steps.slice(start, end + 1).every(step => step.crouch === true))
  }
})

test('coin targets cover real pickup heights including bob and the constrained coin33 hop', async () => {
  const level = await authored
  const solids = solidsFor(level)
  const apexRise = 620 ** 2 / (2 * 1640)
  for (const step of mastery.steps.filter(step => step.kind === 'collect')) {
    const pickup = level.coins.find(coin => coin.id === step.coinId)
    assert.ok(Math.abs(pickup.x - step.x) <= 10, step.id)
    const height = step.crouch ? crouchedHeight : standingHeight
    // Circle radius16, authored bob8. A standing collect may use only a normal single jump.
    const neededRise = Math.max(0, step.y - height - (pickup.y - 8 + 16))
    const headroom = Math.min(Infinity, ...solids.filter(solid => solid.y + solid.height <= step.y - height
      && solid.x < step.x + halfWidth + 12 && solid.x + solid.width > step.x - halfWidth - 12)
      .map(solid => step.y - height - solid.y - solid.height))
    assert.ok(neededRise <= (step.crouch ? 0 : Math.min(apexRise, headroom)), `Unreachable pickup height: ${step.id}`)
    assert.ok(pickup.y - 16 < step.y, step.id)
  }
  const low = masteryStep('collect-coin-33')
  const upper = masteryStep('collect-coin-34')
  assert.equal(low.y, 616)
  assert.equal(upper.y, 470)
  assert.ok(mastery.steps.indexOf(low) < mastery.steps.indexOf(masteryStep('mastery-rubble-step-stage')))
  assert.ok(Math.abs((616 - 54.6) - (470 + 42) - 49.4) < 1e-10)
})

test('climbs rise outside solid undersides, with real intermediate stages and bounded drops', async () => {
  const solids = solidsFor(await authored)
  let previous = { x: 118, y: 616, kind: 'move' }
  for (const step of mastery.steps.filter(step => Number.isFinite(step.x))) {
    if (step.kind === 'jump') {
      assert.equal(step.fromY, previous.y, step.id)
      const delay = (step.airJumpDelayMs ?? 0) / 1000
      const maximumRise = step.airJumpDelayMs === undefined ? 620 ** 2 / (2 * 1640)
        : 620 * delay - 0.5 * 1640 * delay ** 2 + 560 ** 2 / (2 * 1640)
      assert.ok(step.fromY - step.y < maximumRise, `Insufficient nominal jump height: ${step.id}`)
      if (step.riseBeforeMoveY !== undefined) {
        assert.equal(step.riseBeforeMoveY, step.y - 6)
        const left = previous.x - tolerance(previous) - halfWidth
        const right = previous.x + tolerance(previous) + halfWidth
        assert.ok(!solids.some(solid => solid.x < right && solid.x + solid.width > left
          && solid.y < step.fromY && solid.y + solid.height > step.riseBeforeMoveY - standingHeight),
        `Rise column hits an underside: ${step.id}`)
        const action = decideStep(step, { player: player(previous.x, step.fromY) }, {}, 0)
        assert.equal(action.direction, 0, step.id)
        assert.equal(action.jump, true, step.id)
      }
    } else assert.ok(step.y >= previous.y, `Ascending move cannot jump: ${step.id}`)
    assert.ok(step.y - previous.y < 330, `Unstaged drop: ${step.id}`)
    previous = step
  }
})

test('mastery combat boundaries have continuous nominal support and never stand inside low roofs', async () => {
  const level = await authored
  const solids = solidsFor(level)
  for (const step of mastery.steps.filter(step => step.kind === 'fight')) {
    const enemy = level.enemies.find(enemy => enemy.id === step.enemyId)
    assert.ok(step.maxX - step.minX >= 24, step.id)
    assert.equal(step.timeoutMs, 30000)
    assert.ok(solids.some(solid => solid.y === enemy.y && solid.x <= step.minX - halfWidth
      && solid.x + solid.width >= step.maxX + halfWidth), `Fight bounds off support: ${step.id}`)
    for (const x of [step.minX, step.maxX]) assert.ok(!solids.some(solid => overlaps(x, enemy.y, standingHeight, solid)), step.id)
    const reachableMin = step.minX + 12
    const reachableMax = step.maxX - 12
    assert.ok(Math.max(reachableMin, enemy.patrolLeft) - Math.min(reachableMax, enemy.patrolRight) <= 108,
      `No potential attack-range intersection with patrol: ${step.id}`)
    if (enemy.kind === 'tower-archer') assert.equal(step.jumpStrikeY, undefined)
    else assert.equal(step.jumpStrikeY, enemy.y)
  }
  assert.equal(masteryStep('fight-causeway-stalker-b').jumpStrikeY, 604)
})

test('authored powers precede their intended fights, but Moonheart remains opportunistic without boost readback', async () => {
  const level = await authored
  const arrays = { shield: 'shieldPickups', chrono: 'chronoPickups', surge: 'surgePickups' }
  const powers = mastery.steps.filter(step => step.kind === 'power')
  assert.equal(powers.length, 8)
  assert.equal(Object.hasOwn(POWER_READBACK_FIELDS, 'boost'), false)
  assert.equal(mastery.powerStrategies.length, 9)
  const pickups = Object.values(arrays).flatMap(key => level[key])
  assert.deepEqual(powers.map(step => step.pickupId).sort(), pickups.map(pickup => pickup.id).sort())
  for (const step of powers) {
    const pickup = level[arrays[step.power]].find(pickup => pickup.id === step.pickupId)
    const strategy = mastery.powerStrategies.find(strategy => strategy.pickupId === step.pickupId)
    assert.equal(strategy.durationMs, pickup.durationMs)
    assert.ok(mastery.steps.indexOf(step) < mastery.steps.indexOf(masteryStep(`fight-${strategy.beforeEnemy}`)))
    if (step.id !== mastery.geometry.aerialPower.stepId) {
      assert.ok(Math.abs(step.x - pickup.x) <= 24, step.id)
      assert.ok(step.y > pickup.y && step.y - pickup.y <= 64, step.id)
    }
    const frozen = Object.freeze({ ...player(step.x, step.y), [POWER_READBACK_FIELDS[step.power]]: false })
    assert.equal(decideStep(step, { player: frozen }, {}, 0).done, false)
    assert.equal(decideStep(step, { player: { ...frozen, [POWER_READBACK_FIELDS[step.power]]: true } }, {}, 0).done, true)
    assert.throws(() => decideStep(step, { player: player(step.x, step.y) }, {}, 0), /missing power readback/)
  }
  const moonheart = level.boosts.find(pickup => pickup.id === 'moonheart-causeway-high')
  const approach = masteryStep('moonheart-high-opportunistic-approach')
  assert.equal(approach.kind, 'move')
  assert.equal(approach.x, moonheart.x)
  assert.equal(approach.y, 285)
  assert.match(mastery.powerStrategies.find(strategy => strategy.pickupId === moonheart.id).plan, /Opportunistic: no boost readback/)
})

test('shield return moves out from under390px shelf before its delayed second jump', async () => {
  const level = await authored
  const shelf = level.platforms.find(platform => platform.id === 'causeway-high-step-b')
  const stage = masteryStep('mastery-shield-return-stage')
  const step = masteryStep('mastery-shield-return-step-a')
  assert.equal(step.airJumpDelayMs, 500)
  assert.equal(step.riseBeforeMoveY, undefined)
  assert.ok(stage.y - 620 ** 2 / (2 * 1640) - standingHeight > shelf.y + shelf.height)
  assert.ok(stage.x + 12 - 260 * 0.5 + halfWidth < shelf.x)
  const memory = {}
  const first = decideStep(step, { player: player(stage.x, stage.y) }, memory, 0)
  assert.equal(first.direction, -1)
  assert.equal(first.jump, true)
  assert.equal(decideStep(step, { player: player(5380, 511, 200) }, memory, 499).jump, false)
  assert.equal(decideStep(step, { player: player(5380, 511, 200) }, memory, 500).jump, true)
})

test('Chrono crossing requires a grounded activation readback, followed by single hops below the perch', async () => {
  const level = await authored
  const { aerialPower } = mastery.geometry
  const pickup = level.chronoPickups.find(pickup => pickup.id === 'chrono-causeway-gauntlet')
  const tilt = level.tiltPlatforms.find(platform => platform.x === 7640)
  const step = masteryStep(aerialPower.stepId)
  assert.deepEqual(aerialPower.pickup, { x: pickup.x, y: pickup.y })
  assert.deepEqual(mastery.steps.slice(mastery.steps.indexOf(masteryStep(aerialPower.departureStep)),
    mastery.steps.indexOf(step) + 1).map(step => step.id), [aerialPower.departureStep, aerialPower.arrivalStep, aerialPower.stepId])
  // Unrotated-deck drop envelope only; bob, actual edge support and timing still need replay.
  const timeAtPickup = (pickup.x - (tilt.x + tilt.width + halfWidth)) / 260
  const feetAtPickup = tilt.y + 0.5 * 1640 * timeAtPickup ** 2
  assert.ok(feetAtPickup - standingHeight < pickup.y - 11 + aerialPower.radius)
  assert.ok(feetAtPickup > pickup.y - aerialPower.radius)
  assert.equal(step.x, 7910)
  assert.equal(step.y, 616)
  for (const id of ['mastery-chrono-return-tilt', 'mastery-chrono-return-step']) {
    const hop = masteryStep(id)
    assert.equal(hop.kind, 'jump')
    assert.equal(hop.airJumpDelayMs, undefined)
    assert.equal(hop.riseBeforeMoveY, undefined)
  }
})

test('all six mastery checkpoints have supported approaches and finish follows every strict objective', async () => {
  const level = await authored
  const checkpoints = mastery.steps.filter(step => step.id.startsWith('checkpoint-'))
  assert.equal(checkpoints.length, level.checkpoints.length)
  for (const [index, checkpoint] of level.checkpoints.entries()) {
    const step = checkpoints[index]
    assert.ok(step.x - 12 >= checkpoint.x && step.x + 12 <= checkpoint.x + (checkpoint.triggerWidth ?? 160), checkpoint.id)
    assert.ok(step.y >= (checkpoint.minY ?? checkpoint.y - 120) && step.y <= (checkpoint.maxY ?? checkpoint.y + 24), checkpoint.id)
  }
  const finish = mastery.steps.at(-1)
  const lastCoin = mastery.steps.at(-2)
  assert.equal(finish.kind, 'finish')
  assert.equal(lastCoin.minCoins, 60)
  assert.ok(lastCoin.x + halfWidth + 12 < level.finish.x)
  assert.ok(finish.x > level.finish.x && finish.x < level.finish.x + level.finish.width)
  assert.equal(decideStep(finish, { player: player(finish.x, finish.y) }, {}, 0).done, false)
  for (const step of mastery.steps.filter(step => step.kind === 'collect')) {
    const frozen = Object.freeze({ ...player(step.x, step.y), coins: step.minCoins - 1 })
    const action = decideStep(step, { player: frozen }, {}, 0)
    assert.equal(action.done, false)
    if (step.crouch) assert.equal(action.jump, false)
    assert.equal(decideStep(step, { player: { ...frozen, coins: step.minCoins } }, {}, 0).done, true)
  }
  for (const step of mastery.steps.filter(step => step.kind === 'fight')) {
    const enemy = Object.freeze({ id: step.enemyId, x: step.minX + 20, y: step.jumpStrikeY ?? 260, alive: true, health: 4 })
    assert.equal(decideStep(step, { player: player(enemy.x - 40, enemy.y), enemies: [enemy] }, {}, 0).done, false)
    assert.equal(enemy.health, 4)
    assert.equal(decideStep(step, { player: player(enemy.x, enemy.y), enemies: [{ ...enemy, alive: false }] }, {}, 0).done, true)
  }
})
