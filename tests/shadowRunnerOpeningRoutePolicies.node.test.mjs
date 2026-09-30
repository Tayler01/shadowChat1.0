import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { OPENING_ROUTE_POLICIES } from '../scripts/shadow-runner-opening-route-policies.mjs'
import { EXTENDED_ROUTE_POLICIES } from '../scripts/shadow-runner-route-policies.mjs'
import { BUILTIN_POLICIES, decideStep, hasMasteryEvidence, selectPolicies, validatePolicy } from '../scripts/shadow-runner-route-proof.mjs'

const key = policy => `${policy.levelId}/${policy.mode}`
const player = (x, bodyBottom, coins = 0, velocityY = 0) => ({ x, y: bodyBottom, bodyBottom, velocityY, coins, score: 100 })
const tutorialPolicies = OPENING_ROUTE_POLICIES.filter(policy => policy.levelId === 'tutorial')
const levelOne = OPENING_ROUTE_POLICIES.find(policy => policy.levelId === 'level-1')

// Read literal config data with the same parser used by the campaign policy tests.
async function readLevel(relativePath, name) {
  const source = ts.createSourceFile(relativePath, await readFile(new URL(relativePath, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
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
      if (declaration.name.getText(source) === name) return literal(declaration.initializer)
    }
  }
  throw new Error(`Missing authored config ${name}`)
}

const authored = Promise.all([
  readLevel('../src/features/games/shadow-runner/game/tutorial.ts', 'SHADOW_RUNNER_TUTORIAL_LEVEL'),
  readLevel('../src/features/games/shadow-runner/game/levels.ts', 'SHADOW_RUNNER_FULL_LEVEL_ONE'),
])

test('three standalone opening policies validate and remain explicitly unproven candidates', () => {
  assert.deepEqual(OPENING_ROUTE_POLICIES.map(key), ['tutorial/normal', 'tutorial/mastery', 'level-1/mastery'])
  for (const policy of OPENING_ROUTE_POLICIES) {
    assert.equal(validatePolicy(policy), policy)
    assert.match(policy.scope, /candidate/i)
    assert.ok(policy.steps.length <= 30)
    assert.equal(policy.steps.at(-1).kind, 'finish')
  }
})

test('key-based wiring replaces stale tutorial normal without altering any other existing route', () => {
  const replacing = new Set(OPENING_ROUTE_POLICIES.map(key))
  const existing = [...BUILTIN_POLICIES, ...EXTENDED_ROUTE_POLICIES]
  const unchanged = existing.filter(policy => !replacing.has(key(policy)))
  const merged = [...unchanged, ...OPENING_ROUTE_POLICIES]
  const selected = selectPolicies(merged, ['tutorial', 'level-1'], ['normal', 'mastery'])
  assert.equal(selected.length, 4)
  assert.equal(selected[0], OPENING_ROUTE_POLICIES[0])
  assert.equal(selected[2], existing.find(policy => key(policy) === 'level-1/normal'))
  for (const policy of unchanged) assert.equal(merged.find(current => key(current) === key(policy)), policy)
  assert.throws(() => selectPolicies([...merged, OPENING_ROUTE_POLICIES[0]], ['tutorial'], ['normal']), /Duplicate/)
})

test('spawn, rewards, enemies and finish targets match the rebuilt tutorial and unchanged L1', async () => {
  for (const level of await authored) {
    for (const policy of OPENING_ROUTE_POLICIES.filter(policy => policy.levelId === level.id)) {
      assert.equal(policy.title, level.title)
      assert.deepEqual(policy.start, { x: level.playerStart.x, y: level.playerStart.y })
      assert.equal(policy.expected.coins, level.coins.length)
      assert.deepEqual(policy.expected.enemyIds, level.enemies.map(enemy => enemy.id))
      assert.deepEqual(policy.steps.filter(step => step.kind === 'fight').map(step => step.enemyId), level.enemies.map(enemy => enemy.id))
      const finish = policy.steps.at(-1)
      assert.ok(finish.x > level.finish.x && finish.x < level.finish.x + level.finish.width)
      assert.equal(finish.y, level.finish.y + level.finish.height)
      if (level.id === 'tutorial') {
        assert.equal(level.worldWidth, 2760)
        assert.deepEqual(level.requiredEnemyIds, policy.expected.enemyIds)
      }
    }
  }
})

test('mastery enumerates every original coin once in order at its real X coordinate', async () => {
  for (const level of await authored) {
    const policy = OPENING_ROUTE_POLICIES.find(policy => policy.levelId === level.id && policy.mode === 'mastery')
    const coins = policy.steps.filter(step => step.kind === 'collect')
    assert.deepEqual(coins.map(step => [step.coinId, step.minCoins]), level.coins.map((coin, index) => [coin.id, index + 1]))
    for (const step of coins) assert.equal(step.x, level.coins.find(coin => coin.id === step.coinId).x)
    for (const invalid of [
      { ...policy, steps: policy.steps.filter(step => step !== coins[0]) },
      { ...policy, steps: policy.steps.map(step => step === coins[0] ? { ...step, minCoins: 2 } : step) },
      { ...policy, steps: policy.steps.filter(step => step.kind !== 'fight') },
    ]) assert.throws(() => validatePolicy(invalid))
  }
  assert.equal(tutorialPolicies.find(policy => policy.mode === 'normal').steps.some(step => step.kind === 'collect'), false)
})

test('every target and its 12px arrival band has support and a clear full-body stance (not travel proof)', async () => {
  for (const level of await authored) {
    const solids = [...level.platforms, ...level.tiltPlatforms, ...(level.crouchGates ?? [])]
    for (const policy of OPENING_ROUTE_POLICIES.filter(policy => policy.levelId === level.id)) {
      for (const step of policy.steps.filter(step => Number.isFinite(step.x))) {
        const label = `${key(policy)}/${step.id}`
        const height = step.crouch ? 48 * 0.78 * 0.72 : 70 * 0.78
        for (const x of [step.x - 12, step.x, step.x + 12]) {
          assert.ok(solids.some(solid => solid.x <= x && solid.x + solid.width >= x && solid.y === step.y), `No support: ${label}`)
          assert.ok(!solids.some(solid => x + 16.38 > solid.x && x - 16.38 < solid.x + solid.width
            && step.y > solid.y && step.y - height < solid.y + solid.height), `Embedded target: ${label}`)
          assert.ok(!level.spikes.some(spike => x + 16.38 > spike.x && x - 16.38 < spike.x + spike.width
            && step.y > spike.y && step.y - height < spike.y + spike.height), `Hazard target: ${label}`)
        }
      }
    }
  }
})

test('jump takeoff heights follow the previous supported target without silently skipping climbs', () => {
  for (const policy of OPENING_ROUTE_POLICIES) {
    let previousTarget
    for (const step of policy.steps) {
      if (step.kind === 'jump') assert.equal(step.fromY, previousTarget?.y, `${key(policy)}/${step.id}`)
      if (Number.isFinite(step.x)) previousTarget = step
    }
  }
})

test('tutorial distinguishes a single first jump from the delayed second jump on the 160px rise', () => {
  for (const policy of tutorialPolicies) {
    const first = policy.steps.find(step => step.id === 'first-rise')
    const second = policy.steps.find(step => step.id === 'double-rise')
    const firstMemory = {}
    assert.equal(first.airJumpDelayMs, undefined)
    assert.equal(decideStep(first, { player: player(380, 432) }, firstMemory, 0).jump, true)
    assert.equal(decideStep(first, { player: player(460, 330, 0, -100) }, firstMemory, 400).jump, false)
    assert.equal(decideStep(first, { player: player(520, 344) }, firstMemory, 750).done, true)
    const memory = {}
    assert.equal(second.fromY - second.y, 160)
    assert.equal(second.airJumpDelayMs, 350)
    assert.equal(decideStep(second, { player: player(600, 344) }, memory, 0).jump, true)
    assert.equal(decideStep(second, { player: player(680, 234, 0, -100) }, memory, 340).jump, false)
    assert.equal(decideStep(second, { player: player(680, 229, 0, -50) }, memory, 360).jump, true)
    assert.equal(decideStep(second, { player: player(820, 184) }, memory, 1000).done, true)
  }
})

test('tutorial keeps crouch through the entire mandatory roof and only stands beyond its edge', async () => {
  const level = (await authored)[0]
  const roof = level.platforms.find(platform => platform.id === 'courtyard-crawl-roof')
  assert.equal(432 - roof.y - roof.height, 44)
  for (const policy of tutorialPolicies) {
    const entry = policy.steps.findIndex(step => step.id === 'crawl-entry')
    const exit = policy.steps.findIndex(step => step.id === 'crawl-exit')
    assert.ok(policy.steps[entry].x + 12 + 16.38 < roof.x)
    assert.ok(policy.steps[exit].x - 12 - 16.38 > roof.x + roof.width)
    assert.ok(policy.steps.slice(entry, exit + 1).every(step => step.crouch === true))
    assert.equal(policy.steps[exit + 1].crouch, false)
    const collect = policy.steps.find(step => step.coinId === 'coin-3')
    if (collect) {
      const debug = Object.freeze({ player: Object.freeze(player(1650, 432, 2)) })
      const action = decideStep(collect, debug, {}, 0)
      assert.equal(action.crouch, true)
      assert.equal(action.jump, false)
      assert.equal(action.done, false)
      assert.equal(decideStep(collect, { player: player(1650, 432, 3) }, {}, 0).done, true)
    }
  }
})

test('tutorial checkpoint target is inside its actual spatial window before the required sentry', async () => {
  const level = (await authored)[0]
  const checkpoint = level.checkpoints[0]
  for (const policy of tutorialPolicies) {
    const index = policy.steps.findIndex(step => step.id === 'training-checkpoint')
    const step = policy.steps[index]
    assert.ok(step.x - 12 >= checkpoint.x && step.x + 12 <= checkpoint.x + checkpoint.triggerWidth)
    assert.ok(step.y >= checkpoint.minY && step.y <= checkpoint.maxY)
    assert.equal(policy.steps[index + 1].enemyId, level.requiredEnemyIds[0])
    assert.ok(step.x < level.enemies[0].patrolLeft - 100)
  }
})

test('L1 reaches the upper shelf from the first bridge before descending for both guarded fights', async () => {
  const level = (await authored)[1]
  const index = levelOne.steps.findIndex(step => step.id === 'upper-shelf')
  assert.equal(levelOne.steps[index - 1].coinId, 'coin-4')
  assert.equal(levelOne.steps[index].fromY, level.tiltPlatforms[0].y)
  assert.equal(levelOne.steps[index].y, level.platforms.find(platform => platform.id === 'upper-coin-shelf').y)
  assert.deepEqual(levelOne.steps.slice(index + 1, index + 3).map(step => step.coinId), ['coin-5', 'coin-6'])
  assert.equal(levelOne.steps[index + 3].id, 'sentry-court-landing')
  const fights = levelOne.steps.filter(step => step.kind === 'fight')
  assert.ok(fights[0].maxX + 16.38 < level.spikes.find(spike => spike.id === 'sentry-spikes').x)
  assert.ok(fights[1].maxX + 16.38 < level.finish.x)
  assert.ok(levelOne.steps.find(step => step.coinId === 'coin-10').x + 12 + 16.38 < level.finish.x)
})

test('opening mastery cannot pass on position, an old result, missing coins or a live enemy', () => {
  const started = '2026-09-09T01:17:00Z'
  for (const policy of OPENING_ROUTE_POLICIES.filter(policy => policy.mode === 'mastery')) {
    const observation = {
      debug: { levelId: policy.levelId, player: player(policy.steps.at(-1).x, 432, policy.expected.coins),
        enemies: policy.expected.enemyIds.map(id => ({ id, alive: false })) },
      dialogs: [{ title: 'Full Clear' }],
      record: { lastRun: { recordedAt: '2026-09-09T01:18:00Z', score: 100, fullClear: true,
        coinsCollected: policy.expected.coins, totalCoins: policy.expected.coins,
        enemiesDefeated: policy.expected.enemyIds.length, totalEnemies: policy.expected.enemyIds.length } },
    }
    assert.equal(hasMasteryEvidence(observation, policy, started), true)
    assert.equal(decideStep(policy.steps.at(-1), observation.debug, {}, 0).done, false)
    for (const mutate of [
      value => { value.dialogs = [] },
      value => { value.record.lastRun.recordedAt = '2026-09-09T01:16:00Z' },
      value => { value.record.lastRun.coinsCollected-- },
      value => { value.debug.enemies[0].alive = true },
      value => { value.record.lastRun.fullClear = false },
    ]) {
      const rejected = structuredClone(observation)
      mutate(rejected)
      assert.equal(hasMasteryEvidence(rejected, policy, started), false)
    }
  }
})

test('opening policy module is data-only and has no browser, QA or runtime mutation capability', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-opening-route-policies.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bimport\b|__shadowRunner|\bwindow\b|\bdocument\b|\bfetch\b|\bprocess\b|playwright|setPosition|setVelocity|writeFile/)
  for (const policy of OPENING_ROUTE_POLICIES) {
    assert.deepEqual(JSON.parse(JSON.stringify(policy)), policy)
    assert.ok(policy.steps.every(step => ['move', 'jump', 'collect', 'fight', 'finish'].includes(step.kind)))
  }
})
