import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createCheckpointRecovery, observeCheckpointRecovery, stepAfterCheckpointRecovery,
  validateCheckpointRecovery } from '../scripts/shadow-runner-checkpoint-recovery.mjs'
import { assertAttemptDeadline, decideStep, main, parseArgs } from '../scripts/shadow-runner-route-proof.mjs'

const policy = { mode: 'normal', worldWidth: 2000, start: { x: 112, y: 616 }, steps: [
  { id: 'start', kind: 'move', x: 500, y: 616 },
  { id: 'power', kind: 'power', power: 'chrono', pickupId: 'chrono-a', x: 600, y: 616, crouch: true, braceWindZoneId: 'wind' },
  { id: 'fight', kind: 'fight', enemyId: 'guard', minX: 640, maxX: 800 },
  { id: 'finish', kind: 'finish', x: 1900, y: 616 },
], recoveryPoints: [{ checkpointId: 'checkpoint-a', stepId: 'power', x: 650, y: 616 }] }
const debug = (player = {}, extra = {}) => ({ respawnPending: false, checkpointId: null, collectedPowerIds: [],
  player: { x: 112, y: 616, bodyBottom: 616, velocityY: 0, health: 12, lives: 3, checkpointRespawns: 0,
    coins: 0, moonShards: 0, objectiveItems: 0, masteryItems: 0, ...player },
  enemies: [{ id: 'guard', alive: true, health: 4 }], ...extra })
const death = (extra = {}) => debug({ x: 750, health: 0, lives: 2, checkpointRespawns: 1 },
  { checkpointId: 'checkpoint-a', respawnPending: true, ...extra })
const returned = (extra = {}) => debug({ x: 650, lives: 2, checkpointRespawns: 1 },
  { checkpointId: 'checkpoint-a', ...extra })

test('finite-life recovery is explicit, normal-only, and unavailable without authored anchors', async t => {
  t.mock.method(console, 'log', () => {})
  assert.equal(parseArgs([]).recovery, 'none')
  assert.equal(parseArgs(['--recovery=checkpoint']).recovery, 'checkpoint')
  assert.throws(() => parseArgs(['--recovery=warp']), /recovery/)
  assert.throws(() => parseArgs(['--recovery=checkpoint', '--modes=normal,mastery']), /normal-only/)
  await assert.rejects(main(['--dry-run', '--recovery=checkpoint', '--levels=level-9']), /authored recovery points/)
  const report = await main(['--dry-run', '--recovery=checkpoint', '--levels=level-10'])
  assert.equal(report.gameplayProven, false)
  assert.match(report.recoverySha256, /^[a-f0-9]{64}$/)
  assert.equal(report.config.recovery, 'checkpoint')
  assert.equal(report.policies[0].recoveryPoints.length, 11)
})

test('anchors reject unknown actions, duplicates, unbounded locations and extra fields', () => {
  assert.equal(validateCheckpointRecovery(policy), policy)
  for (const recoveryPoints of [[], [policy.recoveryPoints[0], policy.recoveryPoints[0]],
    [{ ...policy.recoveryPoints[0], x: NaN }], [{ ...policy.recoveryPoints[0], y: -1 }],
    [{ ...policy.recoveryPoints[0], x: 2001 }], [{ ...policy.recoveryPoints[0], stepId: 'finish' }],
    [{ ...policy.recoveryPoints[0], stepId: 'missing' }], [{ ...policy.recoveryPoints[0], health: 12 }]]) {
    assert.throws(() => validateCheckpointRecovery({ ...policy, recoveryPoints }), /Checkpoint recovery/)
  }
  assert.throws(() => validateCheckpointRecovery({ ...policy, mode: 'mastery' }), /only normal/)
})

test('a witnessed death releases input until natural supported respawn, then rewinds only the policy', () => {
  const tracker = createCheckpointRecovery(policy, debug())
  const dying = death()
  const original = structuredClone(dying)
  assert.deepEqual(observeCheckpointRecovery(policy, tracker, dying, 2, 1000), { kind: 'wait', started: true })
  assert.deepEqual(observeCheckpointRecovery(policy, tracker, dying, 2, 1100), { kind: 'wait', started: false })
  assert.deepEqual(dying, original)
  const result = observeCheckpointRecovery(policy, tracker, returned(), 2, 1260)
  assert.equal(result.kind, 'resume')
  assert.equal(result.index, 1)
  assert.equal(result.event.fromStep, 'fight')
  assert.equal(result.event.toStep, 'power')
  assert.equal(result.event.lives, 2)
  assert.equal(tracker.recovered, 1)
  assert.deepEqual(observeCheckpointRecovery(policy, tracker, returned(), 1, 1300), { kind: 'continue' })
})

test('fall deaths with positive health and a sampled completed respawn remain legitimate', () => {
  const tracker = createCheckpointRecovery(policy, debug())
  assert.equal(observeCheckpointRecovery(policy, tracker, { ...death(), player: { ...death().player, health: 12 } }, 2, 1000).kind, 'wait')
  assert.equal(observeCheckpointRecovery(policy, tracker, returned(), 2, 1260).kind, 'resume')
  const delayedObserver = createCheckpointRecovery(policy, debug())
  assert.equal(observeCheckpointRecovery(policy, delayedObserver, returned(), 2, 1000).kind, 'resume')
})

test('initial-spawn recovery never creates a checkpoint or advances route progress', () => {
  const tracker = createCheckpointRecovery(policy, debug())
  const sample = debug({ lives: 2, checkpointRespawns: 1 })
  const result = observeCheckpointRecovery(policy, tracker, sample, 1, 1000)
  assert.equal(result.index, 0)
  assert.equal(result.event.checkpointId, null)
})

test('only the two existing spare lives are usable; counters and lives cannot be reset', () => {
  const tracker = createCheckpointRecovery(policy, debug())
  observeCheckpointRecovery(policy, tracker, returned(), 2, 1000)
  const second = returned()
  Object.assign(second.player, { lives: 1, checkpointRespawns: 2 })
  assert.equal(observeCheckpointRecovery(policy, tracker, second, 2, 2000).kind, 'resume')
  const third = returned()
  Object.assign(third.player, { lives: 0, checkpointRespawns: 3 })
  assert.throws(() => observeCheckpointRecovery(policy, tracker, third, 2, 3000), /Natural lives exhausted/)
  for (const patch of [{ lives: 4 }, { lives: 1, checkpointRespawns: 2 }, { checkpointRespawns: 1 },
    { lives: 2, checkpointRespawns: 0 }]) {
    assert.throws(() => observeCheckpointRecovery(policy, createCheckpointRecovery(policy, debug()), debug(patch), 2, 1000), /Checkpoint recovery/)
  }
})

test('expired consumed powers become ordinary positional revisits without faking activation', () => {
  const tracker = createCheckpointRecovery(policy, debug())
  const collectedPowerIds = ['chrono-a']
  const sample = returned({ collectedPowerIds })
  observeCheckpointRecovery(policy, tracker, sample, 2, 1000)
  const step = stepAfterCheckpointRecovery(policy.steps[1], tracker)
  assert.deepEqual(step, { id: 'power', kind: 'move', x: 600, y: 616, crouch: true, braceWindZoneId: 'wind' })
  const scene = { ...sample, player: { ...sample.player, x: 600, chronoActive: false }, windZones: [{ id: 'wind', active: true, telling: false }] }
  assert.equal(decideStep(step, scene, {}, 1100).done, true)
  assert.equal(scene.player.chronoActive, false)
  assert.equal(stepAfterCheckpointRecovery({ ...policy.steps[1], pickupId: 'chrono-b' }, tracker).kind, 'power')
  assert.equal(stepAfterCheckpointRecovery(policy.steps[1], createCheckpointRecovery(policy, debug())).kind, 'power')
  collectedPowerIds.push('not-observed')
  assert.equal(tracker.consumedAtDeath.has('not-observed'), false)
  const beamDodge = { highId: 'high', lowId: 'low', minX: 0, maxX: 1000, maxJumpX: 800, groundY: 616 }
  assert.deepEqual(stepAfterCheckpointRecovery({ ...policy.steps[1], beamDodge }, tracker).beamDodge, beamDodge)
  const arrowDodge = { minX: 100, maxX: 900, groundY: 616 }
  const guarded = stepAfterCheckpointRecovery({ ...policy.steps[1], crouch: false, braceWindZoneId: undefined, arrowDodge }, tracker)
  assert.deepEqual(guarded.arrowDodge, arrowDodge)
  const live = { ...sample, player: { ...sample.player, x: 300, y: 616, bodyTop: 561.4,
    bodyBottom: 616, bodyLeft: 283.62, bodyRight: 316.38, velocityY: 0, chronoActive: false },
  visibleArrows: [{ left: 510, right: 532, top: 541.6, bottom: 546.93, velocityX: -640, velocityY: 0 }] }
  assert.equal(decideStep(guarded, live, {}, 1200).jump, true)
  assert.equal(live.player.chronoActive, false)
})

test('only opted-in detours earned before a witnessed death are skipped after completed recovery', () => {
  const step = { id: 'flame-four', kind: 'relic', counter: 'objectiveItems', minCount: 4,
    x: 1000, y: 616, recoverySkipIfEarned: true }
  const tracker = createCheckpointRecovery(policy, debug())
  assert.equal(stepAfterCheckpointRecovery(step, tracker), step)
  const progress = debug({ objectiveItems: 4 }, { checkpointId: 'checkpoint-a' })
  observeCheckpointRecovery(policy, tracker, progress, 2, 500)
  assert.equal(stepAfterCheckpointRecovery(step, tracker), step)
  const dying = death()
  dying.player.objectiveItems = 4
  observeCheckpointRecovery(policy, tracker, dying, 2, 1000)
  assert.equal(stepAfterCheckpointRecovery(step, tracker), step)
  const resumed = returned()
  resumed.player.objectiveItems = 4
  observeCheckpointRecovery(policy, tracker, resumed, 2, 1260)
  assert.deepEqual(stepAfterCheckpointRecovery(step, tracker), { id: step.id, kind: 'wait', durationMs: 0 })
  for (const patch of [{ recoverySkipIfEarned: undefined }, { minCount: 5 }, { counter: 'masteryItems' }]) {
    const required = { ...step, ...patch }
    assert.equal(stepAfterCheckpointRecovery(required, tracker), required)
  }
  assert.equal(step.x, 1000)
  assert.equal(resumed.player.objectiveItems, 4)
})

test('ordinary power collection cannot borrow another pickup of the same active type', () => {
  const step = { id: 'collect-power', kind: 'power', pickupId: 'chrono-b', power: 'chrono', x: 600, y: 616 }
  const scene = debug({ x: 600, chronoActive: true }, { collectedPowerIds: ['chrono-a'] })
  assert.equal(decideStep(step, scene, {}, 1000).done, false)
  scene.collectedPowerIds.push('chrono-b')
  assert.equal(decideStep(step, scene, {}, 1100).done, true)
})

test('recovery rejects erased pickups, counters, defeated enemies or restored enemy health', () => {
  const progress = debug({ coins: 4, objectiveItems: 1 }, { checkpointId: 'checkpoint-a', collectedPowerIds: ['chrono-a'],
    enemies: [{ id: 'guard', alive: false, health: 0 }] })
  for (const mutation of [sample => { sample.player.coins = 0 }, sample => { sample.player.objectiveItems = 0 },
    sample => { sample.collectedPowerIds = [] }, sample => { sample.enemies[0] = { id: 'guard', alive: true, health: 4 } }]) {
    const tracker = createCheckpointRecovery(policy, debug())
    observeCheckpointRecovery(policy, tracker, progress, 2, 500)
    const sample = structuredClone(progress)
    Object.assign(sample.player, { lives: 2, checkpointRespawns: 1, x: 650 })
    mutation(sample)
    assert.throws(() => observeCheckpointRecovery(policy, tracker, sample, 2, 1000), /reset|revived/)
  }
  const tracker = createCheckpointRecovery(policy, debug())
  const damaged = debug({}, { enemies: [{ id: 'guard', alive: true, health: 2 }] })
  observeCheckpointRecovery(policy, tracker, damaged, 2, 500)
  assert.throws(() => observeCheckpointRecovery(policy, tracker, returned(), 2, 1000), /revived/)
})

test('recovery fails closed on wrong checkpoint, route advance, bad landing and stalled respawn', () => {
  for (const [sample, index] of [[death({ checkpointId: 'unknown' }), 2], [death(), 0],
    [debug({ health: 0 }), 2], [debug({}, { respawnPending: true }), 2]]) {
    assert.throws(() => observeCheckpointRecovery(policy, createCheckpointRecovery(policy, debug()), sample, index, 1000), /Checkpoint recovery/)
  }
  for (const mutate of [sample => { sample.checkpointId = 'other' }, sample => { sample.player.x = 900 },
    sample => { sample.player.bodyBottom = 480 }, sample => { sample.player.velocityY = -400 },
    sample => { sample.enemies[0].health = 5 }]) {
    const tracker = createCheckpointRecovery(policy, debug())
    observeCheckpointRecovery(policy, tracker, death(), 2, 1000)
    const sample = returned()
    mutate(sample)
    assert.throws(() => observeCheckpointRecovery(policy, tracker, sample, 2, 1260), /Checkpoint recovery/)
  }
  const tracker = createCheckpointRecovery(policy, debug())
  observeCheckpointRecovery(policy, tracker, death(), 2, 1000)
  assert.throws(() => observeCheckpointRecovery(policy, tracker, death(), 2, 4001), /bounded wait/)
})

test('missing or malformed fresh-build evidence cannot silently enable recovery', () => {
  for (const mutate of [sample => { delete sample.player.checkpointRespawns }, sample => { delete sample.collectedPowerIds },
    sample => { sample.collectedPowerIds = ['a', 'a'] }, sample => { sample.enemies = null },
    sample => { sample.player.coins = 1 }, sample => { sample.enemies[0].alive = false }]) {
    const sample = debug()
    mutate(sample)
    assert.throws(() => createCheckpointRecovery(policy, sample), /Checkpoint recovery/)
  }
})

test('a witnessed checkpoint cannot disappear or regress before the next death', () => {
  const expanded = { ...policy, recoveryPoints: [...policy.recoveryPoints,
    { checkpointId: 'checkpoint-b', stepId: 'fight', x: 800, y: 616 }] }
  for (const checkpointId of [null, 'checkpoint-a', 'unknown']) {
    const tracker = createCheckpointRecovery(expanded, debug())
    observeCheckpointRecovery(expanded, tracker, debug({}, { checkpointId: 'checkpoint-b' }), 2, 1000)
    assert.throws(() => observeCheckpointRecovery(expanded, tracker, debug({}, { checkpointId }), 2, 1100), /checkpoint disappeared/)
  }
})

test('health restored between deaths is rejected before it can become a new baseline', () => {
  const tracker = createCheckpointRecovery(policy, debug())
  observeCheckpointRecovery(policy, tracker, debug({}, { enemies: [{ id: 'guard', alive: true, health: 1 }] }), 2, 1000)
  assert.throws(() => observeCheckpointRecovery(policy, tracker, debug(), 2, 1100), /revived/)
})

test('post-read time is bounded before accepting any progress or completion', async () => {
  assert.doesNotThrow(() => assertAttemptDeadline(999, 1000))
  for (const now of [1000, 1001, NaN, Infinity, -1]) assert.throws(() => assertAttemptDeadline(now, 1000), /deadline expired/)
  const source = await readFile(new URL('../scripts/shadow-runner-route-proof.mjs', import.meta.url), 'utf8')
  assert.match(source, /const observation = await readObservation\(page, policy.levelId\)\s+const now = elapsed\(\)\s+assertAttemptDeadline\(now, config.timeoutMs\)/)
})

test('recovery helper contains no game/clock mutation or browser access', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-checkpoint-recovery.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /__shadowRunnerQa|\.clock\.|\.setVelocity|\.setPosition|\.evaluate\(|localStorage|\.restore\(/)
})
