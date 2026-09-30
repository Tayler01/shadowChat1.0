import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { RELAY_ROUTE_POLICIES } from '../scripts/shadow-runner-relay-route-policies.mjs'
import { POWER_READBACK_FIELDS, validatePolicy, decideStep, assertRouteRequirements, finaleAction, main } from '../scripts/shadow-runner-route-proof.mjs'

const policy = RELAY_ROUTE_POLICIES[0]
const source = await readFile(new URL('../src/features/games/shadow-runner/game/levelTen.ts', import.meta.url), 'utf8')
const exports = {}
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports, require: name => {
    assert.equal(name, '../assets/manifest')
    return { SHADOW_RUNNER_ASSETS: { levels: {}, rebuild: {} } }
  } }, { timeout: 1000 })
const level = JSON.parse(JSON.stringify(exports.SHADOW_RUNNER_LEVEL_TEN))
const at = (step, extra = {}) => ({ x: step.x, y: step.y, bodyBottom: step.y, velocityY: 0, ...extra })
const stepById = id => policy.steps.find(step => step.id === id)
const stepIndex = id => policy.steps.findIndex(step => step.id === id)
const permanentSolids = [...level.platforms, ...level.crouchGates]
const fixedSolids = [...permanentSolids, ...level.phasePlatforms]
const halfWidth = 16.38
const standingHeight = 54.6
const crouchHeight = 26.9568

test('Last Ascent keeps wind bracing through the final road approach', () => {
  const approach = stepById('gap-24-takeoff')
  assert.equal(approach.braceWindZoneId, 'relay-wind-ascent')
  assert.equal(approach.crouch, true)
  const wind = level.windZones.find(zone => zone.id === approach.braceWindZoneId)
  assert.ok(approach.x > wind.x + wind.width + halfWidth)
  const debug = { player: { x: 23070, y: 616, bodyBottom: 616, velocityY: 0 },
    windZones: [{ id: wind.id, active: true, telling: false }] }
  assert.equal(decideStep(approach, debug, {}, 100).crouch, true)
  assert.equal(decideStep(approach, debug, {}, 100).direction, 1)
})

test('Crown beams leave the mandatory crawl retryable without a consumed shield', () => {
  const roof = level.crouchGates.find(gate => gate.id === 'relay-crouch-crown')
  const lanes = level.relayBeamZones.filter(zone => zone.id.startsWith('relay-beam-crown-'))
  assert.equal(lanes.length, 2)
  for (const lane of lanes) {
    assert.ok(lane.x >= roof.x + roof.width + 2 * halfWidth, `${lane.id} traps the player below the roof`)
    assert.equal(lane.x + lane.width, 18700, 'Preserve the complete open Crown challenge')
    assert.equal(lane.damage, 4)
    assert.equal(lane.cadenceMs, 2750)
  }
})

test('Sovereign combat responds to visible high beam warnings without consuming a suppressed jump', () => {
  const step = stepById('fight-sentry-sovereign')
  assert.equal(step.avoidHighBeamId, 'relay-beam-arena')
  for (const state of ['telling', 'active', 'idle']) {
    const memory = { facing: 1, jumpAt: 0 }
    const debug = { player: { x: 25800, y: 616, bodyBottom: 616, velocityY: 0 },
      enemies: [{ id: 'sentry-sovereign', alive: true, x: 25870, y: 621 }],
      relayBeamZones: [{ id: 'relay-beam-arena', state }] }
    const action = decideStep(step, debug, memory, 1000)
    assert.equal(action.jump, state === 'idle')
    assert.equal(action.crouch, state !== 'idle')
    assert.equal(action.attack, true)
    assert.equal(memory.jumpAt, state === 'idle' ? 1000 : 0)
  }
  assert.throws(() => decideStep(step, { player: { x: 25800, y: 616 },
    enemies: [{ id: 'sentry-sovereign', alive: false }], relayBeamZones: [] }, {}, 1000), /visible beam state/)
})
const overlaps = (a, b) => a.left < b.x + b.width && a.right > b.x && a.bottom > b.y && a.top < b.y + b.height

test('every explicit Relay checkpoint target crosses its actual activation line despite arrival tolerance', () => {
  const steps = policy.steps.filter(step => step.id.startsWith('checkpoint-'))
  assert.equal(steps.length, 10)
  for (const step of steps) {
    const point = level.checkpoints.find(item => item.id === `relay-${step.id}`)
    assert.ok(point, step.id)
    assert.ok(step.x - 12 > point.x, `${step.id} can stop short of activation`)
    assert.ok(step.x + 12 < point.x + point.triggerWidth, `${step.id} can overshoot its trigger`)
    assert.equal(step.y, point.y)
  }
})

test('Foundry east uses a supported fresh-calm band rather than requiring pixel-perfect wind alignment', () => {
  for (const id of ['foundry-east-stair-wind-cycle', 'foundry-east-exit-wind-cycle']) {
    const step = stepById(id)
    assert.equal(step.anchorTolerance, 16)
    const debug = busy => ({ player: at(step, { x: step.x + 11 }),
      windZones: [{ id: step.zoneId, active: busy, telling: false, direction: -1 }] })
    const memory = {}
    assert.equal(decideStep(step, debug(true), memory, 100).done, false)
    assert.equal(decideStep(step, debug(false), memory, 200).done, true)
    assert.equal(decideStep(step, debug(false), memory, 300).done, false)
    const airborne = debug(false)
    airborne.player.bodyBottom -= 30
    assert.equal(decideStep(step, airborne, { previousWindBusy: true }, 400).done, false)
  }
  assert.equal(stepById('gap-08-step').airJumpDelayMs, 200)
  assert.equal(stepById('gap-08-step').crouchOnLanding, true)
})

test('Lock volleys cover their own corridor without reaching the preceding Crown beams', () => {
  const crownEnd = Math.max(...level.relayBeamZones.filter(zone => zone.id.startsWith('relay-beam-crown-'))
    .map(zone => zone.x + zone.width))
  const volleys = level.arrowVolleys.filter(volley => volley.id.startsWith('relay-volley-lock-'))
  assert.equal(volleys.length, 2)
  for (const volley of volleys) {
    assert.equal(volley.direction, -1)
    const end = volley.spawnX - volley.speed * volley.lifetimeMs / 1000
    // Include half the arrow sprite and a full 30fps step before expiration.
    const earliestEdge = end - 36 - volley.speed / 30
    assert.ok(earliestEdge > crownEnd, `${volley.id} reaches Crown at ${earliestEdge}`)
    assert.ok(end <= volley.x, `${volley.id} must reach the beginning of Lock`)
    assert.ok(volley.speed * volley.lifetimeMs / 1000 >= 2100)
    assert.equal(volley.damage, 4)
  }
})

test('Lock ground approaches defend visible arrows only inside supported clear-headroom corridors', () => {
  const ids = ['power-relay-aether-lock', 'fight-relay-warden-02', 'gap-20-takeoff',
    'power-relay-chrono-lock', 'fight-relay-archer-03', 'checkpoint-lock', 'gap-21-takeoff']
  assert.deepEqual(policy.steps.filter(step => step.arrowDodge).map(step => step.id), ids)
  for (const id of ids) {
    const step = stepById(id)
    const area = step.arrowDodge
    assert.equal(step.jumpStrikeY, undefined)
    assert.ok(!step.crouch && !step.beamDodge && !step.braceWindZoneId)
    assert.ok(permanentSolids.some(p => p.y === area.groundY
      && p.x <= area.minX - halfWidth && p.x + p.width >= area.maxX + halfWidth), id)
    const flight = { left: area.minX - halfWidth, right: area.maxX + halfWidth,
      top: 616 - 270, bottom: 615 }
    assert.ok(!fixedSolids.some(p => overlaps(flight, p)), `${id} needs clear jumping space`)
    if (step.kind === 'fight') assert.ok(step.minX >= area.minX && step.maxX <= area.maxX)
    else assert.ok(step.x >= area.minX && step.x <= area.maxX)
  }
})

test('Crown guard and exit policies retain live beam bounds and head clearance', () => {
  const guarded = policy.steps.filter(step => step.beamDodge)
  assert.equal(guarded.length, 7)
  for (const step of guarded) {
    const beam = step.beamDodge
    for (const id of [beam.highId, beam.lowId]) {
      const zone = level.relayBeamZones.find(zone => zone.id === id)
      assert.equal(zone.x, beam.minX)
      assert.equal(zone.x + zone.width, beam.maxX)
    }
    const ledge = level.platforms.find(platform => platform.id === 'relay-access-lock-a')
    assert.ok(beam.maxJumpX + halfWidth + 20 < ledge.x)
    assert.equal(beam.groundY, 616)
  }
  assert.deepEqual(policy.steps.filter(step => step.recoverySkipIfEarned).map(step => step.id), ['relay-flame-4'])
  assert.equal(stepIndex('crown-exit-beam-cycle') + 1, stepIndex('gap-19-step'))
  assert.equal(stepById('crown-exit-beam-cycle').kind, 'beam-cycle')
  const wait = stepById('crown-exit-beam-cycle')
  assert.equal(stepById('gap-19-takeoff').x, wait.x)
  assert.ok(wait.x + 16 < wait.beamDodge.maxJumpX, 'The whole waiting band must allow defensive jumping')
})

test('late Ascent offers an arrow-clear perch and short drop without another forced wind wait', () => {
  const step = level.platforms.find(platform => platform.id === 'relay-access-ascent-b-lower')
  const arrow = level.arrowVolleys.find(volley => volley.id === 'relay-volley-last-jump')
  assert.ok(step.y - crouchHeight > arrow.laneY + 8)
  assert.ok(step.y + step.height < 616 - standingHeight - 6)
  const floor = level.platforms.find(platform => platform.id === 'relay-floor-24')
  assert.ok(floor.x - (step.x + step.width) < halfWidth * 2)
  assert.equal(floor.y - step.y, 96)
  assert.equal(stepById('gap-23-step').airJumpDelayMs, undefined)
  assert.equal(stepById('gap-23-step').extraAirJumpDelayMs, undefined)
  assert.equal(stepById('gap-23-step').crouchOnLanding, true)
  assert.equal(stepById('gap-23-landing').kind, 'move')
  assert.equal(stepById('gap-23-landing').x, level.checkpoints.find(point => point.id === 'relay-checkpoint-last').x)
  assert.ok(stepById('checkpoint-last').x - 12 > level.checkpoints.find(point => point.id === 'relay-checkpoint-last').x)
  for (const id of ['gap-23-landing', 'checkpoint-last', 'fight-relay-grenadier-03']) {
    assert.equal(stepById(id).crouch, true)
    assert.equal(stepById(id).braceWindZoneId, 'relay-wind-ascent')
    assert.equal(stepById(id).jumpStrikeY, undefined)
  }
})

test('late Ascent grenadier leaves two wind cycles between throws without changing other grenadiers', () => {
  const grenadier = level.enemies.find(enemy => enemy.id === 'relay-grenadier-03')
  const wind = level.windZones.find(zone => zone.id === 'relay-wind-ascent')
  assert.ok(grenadier.attackCooldownMs >= wind.cadenceMs * 2)
  assert.equal(grenadier.health, 4)
  assert.equal(grenadier.projectileDamage, undefined)
  for (const id of ['relay-grenadier-01', 'relay-grenadier-02']) {
    assert.equal(level.enemies.find(enemy => enemy.id === id).attackCooldownMs, undefined)
  }
})

function arrivalBodies(step) {
  const tolerance = step.kind === 'jump' ? 18 : 12
  return [-tolerance, 0, tolerance].map(offset => ({ left: step.x + offset - halfWidth,
    right: step.x + offset + halfWidth, top: step.y - (step.crouch ? crouchHeight : standingHeight), bottom: step.y }))
}

test('L10 normal remains an unproven bounded candidate with exact authored objectives', () => {
  assert.equal(validatePolicy(policy), policy)
  assert.equal(policy.candidateOnly, true)
  assert.equal(policy.mode, 'normal')
  assert.equal(policy.worldWidth, level.worldWidth)
  assert.deepEqual([level.coins.length, level.enemies.length, level.objectivePickups.length, level.masteryPickups.length], [122, 36, 5, 8])
  assert.equal(policy.expected.coins, level.coins.length)
  assert.deepEqual(policy.expected.enemyIds, level.enemies.map(enemy => enemy.id))
  assert.ok(policy.steps.length <= 180)
  assert.deepEqual(policy.requirements.requiredEnemyIds, level.requiredEnemyIds)
  assert.equal(policy.requirements.objectiveItems, level.objectivePickups.length)
  const flames = policy.steps.filter(step => step.kind === 'relic')
  assert.deepEqual(flames.map(step => step.id), level.objectivePickups.map(item => item.id))
  assert.deepEqual(flames.map(step => step.x), level.objectivePickups.map(item => item.x))
  assert.equal(Object.hasOwn(policy.requirements, 'masteryItems'), false)
  assert.equal(level.masteryPickups.length, 8)
  assert.match(policy.risks.join(' '), /No browser proof/)
})

test('normal recovery anchors match every authored checkpoint and supported re-entry geometry', () => {
  assert.deepEqual(policy.recoveryPoints.map(point => point.checkpointId), level.checkpoints.map(point => point.id))
  let previousIndex = -1
  for (const point of policy.recoveryPoints) {
    const checkpoint = level.checkpoints.find(item => item.id === point.checkpointId)
    assert.deepEqual([point.x, point.y], [checkpoint.x, checkpoint.y])
    const step = stepById(point.stepId)
    const index = stepIndex(point.stepId)
    assert.ok(index > previousIndex)
    previousIndex = index
    const targetX = step.kind === 'fight' ? Math.max(step.minX, Math.min(step.maxX, point.x)) : step.x
    assert.ok(Math.abs(targetX - point.x) < 100, 'Re-entry must not backtrack over an earlier gap')
    if (step.kind === 'jump') assert.equal(step.fromY, point.y, 'A jump cannot require support lost on respawn')
    for (let x = Math.min(point.x, targetX) - 12; x <= Math.max(point.x, targetX) + 12; x += 2) {
      const body = { left: x - halfWidth, right: x + halfWidth, top: point.y - standingHeight, bottom: point.y }
      assert.ok(permanentSolids.some(p => p.y === point.y && p.x <= body.left && p.x + p.width >= body.right), point.checkpointId)
      assert.ok(!fixedSolids.some(p => overlaps(body, p)), point.checkpointId)
    }
  }
})

test('all final three normal candidates are wired and separately hashed without a gameplay claim', async t => {
  t.mock.method(console, 'log', () => {})
  const report = await main(['--dry-run', '--levels=level-8,level-9,level-10', '--timeout-ms=300000'])
  assert.equal(report.gameplayProven, false)
  assert.equal(report.status, 'dry-validation-only')
  assert.deepEqual(report.policies.map(item => item.levelId), ['level-8', 'level-9', 'level-10'])
  for (const field of ['catacombPoliciesSha256', 'captainPoliciesSha256', 'relayPoliciesSha256']) {
    assert.match(report[field], /^[a-f0-9]{64}$/)
  }
})

test('Foundry recovery begins on clear road after the crawl without replaying the spent Chrono crossing', () => {
  const checkpoint = level.checkpoints.find(p => p.id === 'relay-checkpoint-foundry-entry')
  const anchor = policy.recoveryPoints.find(p => p.checkpointId === checkpoint.id)
  const roof = level.crouchGates.find(p => p.id === 'relay-crouch-foundry')
  assert.equal(anchor.stepId, 'crawl-03-exit')
  assert.equal(stepById(anchor.stepId).crouch, true)
  assert.ok(checkpoint.x - checkpoint.triggerWidth / 2 - halfWidth > roof.x + roof.width)
  assert.ok(checkpoint.minY > 488, 'The high branch does not earn a ground-route checkpoint')
  assert.ok(stepIndex(anchor.stepId) > stepIndex('power-relay-chrono-foundry'))
  assert.ok(stepIndex(anchor.stepId) < stepIndex('fight-relay-drone-01'))
  assert.ok(checkpoint.x < level.platforms.find(p => p.id === 'relay-crouch-step-03').x - 100)
})

test('every target has clear headroom and support; explicit phase boarding targets are conditional', () => {
  for (const step of policy.steps.filter(step => Number.isFinite(step.x))) {
    const previous = policy.steps[policy.steps.indexOf(step) - 1]
    const support = step.kind === 'jump' && previous?.kind === 'phase-cycle'
      ? [level.phasePlatforms.find(platform => platform.id === previous.platformId)] : permanentSolids
    for (const body of arrivalBodies(step)) {
      const ascentEdge = ['gap-22-takeoff', 'ascent-floor-calm'].includes(step.id)
      assert.ok(support.some(s => s.y === step.y && (ascentEdge
        ? Math.min(s.x + s.width, body.right) - Math.max(s.x, body.left) >= 16
        : s.x <= body.left && s.x + s.width >= body.right)), `${step.id}: ${ascentEdge ? '16px edge contact' : 'full support'}`)
      assert.ok(!fixedSolids.some(s => overlaps(body, s)), `${step.id}: headroom`)
      assert.ok(!level.spikes.some(s => overlaps(body, s)), `${step.id}: spikes`)
    }
  }
})

test('Choir fights remain crouched below both beam lanes without skipping either enemy', () => {
  const approach = stepById('choir-outside-approach')
  const beams = level.relayBeamZones.filter(zone => zone.id.startsWith('relay-beam-choir-'))
  assert.equal(beams.length, 2)
  assert.equal(approach.crouch, true)
  for (const enemyId of ['relay-archer-02', 'relay-lancer-04']) {
    const step = stepById(`fight-${enemyId}`)
    assert.equal(step.crouch, true)
    assert.equal(step.jumpStrikeY, undefined)
    assert.ok(stepIndex(step.id) > stepIndex(approach.id))
    assert.ok(stepIndex(step.id) < stepIndex('gap-14-takeoff'))
    assert.ok(beams.every(beam => beam.lanes.every(y => y < approach.y - crouchHeight - 10)))
    const enemy = level.enemies.find(item => item.id === enemyId)
    const debug = { player: at(approach, { x: enemy.x - 65, crouching: true }),
      enemies: [{ ...enemy, alive: true, y: 616 }] }
    const decision = decideStep(step, debug, {}, 1000)
    assert.equal(decision.crouch, true)
    assert.equal(Boolean(decision.jump), false)
    assert.equal(decision.attack, true)
    assert.equal(decision.done, false)
  }
})

test('all seven phase crossings clear solid undersides instead of relying on an intangible arrival', () => {
  for (const [number, phaseId] of [['03', 'relay-phase-01'], ['06', 'relay-phase-02'],
    ['10', 'relay-phase-04'], ['14', 'relay-phase-05'], ['20', 'relay-phase-06']]) {
    const phase = level.phasePlatforms.find(platform => platform.id === phaseId)
    const board = stepById(`gap-${number}-phase-board`)
    const wait = policy.steps[stepIndex(board.id) - 1]
    assert.equal(wait.kind, 'phase-cycle')
    assert.equal(wait.platformId, phase.id)
    assert.equal(wait.crouch, true, 'Do not stand in distant head-height fire while waiting')
    assert.ok(wait.x + 12 + halfWidth < phase.x, `${board.id}: launch clears the west face`)
    assert.equal(board.riseBeforeMoveY, number === '20' ? 410 : phase.y - 6)
    assert.ok(board.riseBeforeMoveY < phase.y)
    assert.equal(board.y, phase.y)
    assert.equal(stepById(`gap-${number}-landing`).kind, 'move')
    const memory = {}
    const debug = state => ({ player: at(wait), phasePlatforms: [{ id: phase.id, state }],
      windZones: wait.windZoneId ? [{ id: wait.windZoneId, active: false, telling: false }] : [] })
    assert.equal(decideStep(wait, debug('solid'), memory, 0).done, false)
    decideStep(wait, debug('intangible'), memory, 100)
    assert.equal(decideStep(wait, debug('solid'), memory, 200).done, true)
    assert.equal(decideStep(board, { player: at(wait) }, {}, 0).direction, 0)
    assert.ok(board.fromY - board.riseBeforeMoveY <= 198, 'No extra-jump power is required')
  }
  for (const [number, phaseId] of [['08', 'relay-phase-03']]) {
    const phase = level.phasePlatforms.find(platform => platform.id === phaseId)
    const jump = stepById(`gap-${number}-landing`)
    const launch = policy.steps[stepIndex(jump.id) - 1]
    assert.equal(jump.riseBeforeMoveY, phase.y - 6)
    assert.ok(launch.x + 12 + halfWidth < phase.x)
    assert.equal(decideStep(jump, { player: at(launch) }, {}, 0).direction, 0)
  }
  const phase = level.phasePlatforms.find(p => p.id === 'relay-phase-07')
  const refuge = level.platforms.find(p => p.id === 'relay-recovery-ascent-gap')
  assert.deepEqual([refuge.x, refuge.y, refuge.width, refuge.height], [21776, 600, 96, 24])
  assert.equal(refuge.visualId, 'relay-recovery-stair')
  assert.equal(refuge.terrainSet, 'relay')
  for (const id of ['gap-22-step', 'gap-22-landing']) {
    const step = stepById(id)
    assert.equal(step.airJumpDelayMs, undefined, 'Single jumps stay below the phase underside')
    assert.equal(step.riseBeforeMoveY, undefined)
    assert.ok(step.fromY - standingHeight - 620 ** 2 / (2 * 1640) > phase.y + phase.height)
  }
  assert.ok(policy.steps.filter(step => step.kind === 'phase-cycle').every(step => step.platformId !== phase.id))
})

test('jump starts use previous supported height and all normal gaps stay bounded', () => {
  let previous = policy.start
  for (const step of policy.steps) {
    if (step.kind === 'jump') {
      assert.equal(step.fromY, previous.y, step.id)
      assert.ok(Math.abs(step.x - previous.x) <= 350, `${step.id}: requires unproven long jump`)
    }
    if (Number.isFinite(step.x)) {
      assert.ok(step.y - previous.y < 330, `${step.id}: unsafe descent`)
      previous = step
    }
  }
})

test('normal crossings use the lower accepted access steps, never an optional upper Dispatch branch', () => {
  assert.equal(level.platforms.length, 88)
  assert.equal(level.platforms.filter(p => p.id.startsWith('relay-access-') || p.id === 'relay-recovery-glass-b').length, 15)
  const moved = ['relay-crouch-step-01', 'relay-crouch-step-02', 'relay-crouch-step-03', 'relay-crouch-step-04',
    'relay-crouch-step-05', 'relay-crouch-step-06', 'relay-dispatch-step-04b']
  const access = level.platforms.filter(p => p.id.startsWith('relay-access-') || p.id === 'relay-recovery-glass-b' || moved.includes(p.id))
  assert.equal(access.length, 22)
  assert.ok(access.every(p => p.y + p.height <= 616 - standingHeight - 6))
  for (const [stepId, platformId] of [
    ['gap-02-step', 'relay-crouch-step-01'], ['gap-02-landing', 'relay-access-approach-b'],
    ['gap-04-step', 'relay-access-prism-a'], ['gap-05-step', 'relay-access-prism-b-lower'],
    ['gap-07-step', 'relay-crouch-step-03'], ['gap-08-step', 'relay-access-foundry-b-lower'],
    ['gap-09-step', 'relay-access-beam-a'], ['gap-09-landing', 'relay-dispatch-step-04a'],
    ['gap-19-step', 'relay-access-lock-a'], ['gap-20-step', 'relay-access-lock-b-lower'], ['gap-22-step', 'relay-recovery-ascent-gap'],
    ['gap-23-step', 'relay-access-ascent-b-lower'],
  ]) {
    const step = stepById(stepId)
    const platform = level.platforms.find(p => p.id === platformId)
    assert.equal(step.kind, 'jump')
    assert.equal(step.y, platform.y, stepId)
    assert.ok(arrivalBodies(step).every(body => body.left >= platform.x && body.right <= platform.x + platform.width), stepId)
  }
  assert.ok(policy.steps.filter(step => Number.isFinite(step.x)).every(step => step.y >= 430))
  assert.ok(policy.steps.every(step => step.extraAirJumpDelayMs === undefined))
})

test('fixed arrival bands avoid every live lift shaft without claiming safe flight through its cycle', () => {
  assert.equal(level.movingPlatforms.length, 8)
  const relocated = { 'relay-lift-approach': 1716, 'relay-lift-prism': 3800, 'relay-lift-choir': 11700,
    'relay-lift-glass': 14760, 'relay-lift-crown': 16780, 'relay-lift-lock': 18780, 'relay-lift-final': 23700 }
  for (const [id, x] of Object.entries(relocated)) assert.equal(level.movingPlatforms.find(lift => lift.id === id).x, x, id)
  for (const step of policy.steps.filter(step => Number.isFinite(step.x))) for (const lift of level.movingPlatforms) {
    const shaft = { x: lift.x, y: Math.min(lift.y, lift.endY), width: lift.width,
      height: Math.abs(lift.y - lift.endY) + lift.height }
    assert.ok(arrivalBodies(step).every(body => !overlaps(body, shaft)), `${step.id}: ${lift.id}`)
  }
  assert.match(policy.risks.join(' '), /flight paths.*real input replay/)
})

test('three X-restaged powers are observed after their complete crouch passage, not through its wall', () => {
  for (const [pickupId, family, crawlNumber, roofId] of [
    ['relay-aether-approach', 'aetherStepPickups', '01', 'relay-crouch-approach'],
    ['relay-dawnfire-prism', 'dawnfireAegisPickups', '02', 'relay-crouch-prism'],
    ['relay-dawnfire-ascent', 'dawnfireAegisPickups', '06', 'relay-crouch-last'],
  ]) {
    const pickup = level[family].find(p => p.id === pickupId)
    const step = stepById(`power-${pickupId}`)
    const exit = stepById(`crawl-${crawlNumber}-exit`)
    const roof = level.crouchGates.find(p => p.id === roofId)
    assert.equal(policy.steps.filter(s => s.pickupId === pickupId).length, 1)
    assert.ok(stepIndex(exit.id) < stepIndex(step.id), pickupId)
    assert.equal(exit.crouch, true)
    assert.ok(exit.x - 12 - halfWidth > roof.x + roof.width, pickupId)
    assert.ok(step.x - 12 - halfWidth > roof.x + roof.width, pickupId)
    assert.equal(step.x, pickup.x + 12)
  }
  for (let n = 1; n <= 6; n++) {
    const number = String(n).padStart(2, '0')
    const roof = level.crouchGates[n - 1]
    const entry = stepById(`crawl-${number}-entry`), exit = stepById(`crawl-${number}-exit`)
    assert.ok(entry.crouch && exit.crouch)
    assert.ok(entry.x + 12 + halfWidth < roof.x)
    assert.ok(exit.x - 12 - halfWidth > roof.x + roof.width)
    assert.equal(stepIndex(exit.id), stepIndex(entry.id) + 1)
  }
})

test('all five restaged tall foes have grounded fights inside supported outside-roof bounds', () => {
  for (const [id, roofId, approachId] of [
    ['relay-caster-01', 'relay-crouch-prism', 'crawl-02-exit'],
    ['relay-lancer-04', 'relay-crouch-choir', 'choir-outside-approach'],
    ['relay-grenadier-02', 'relay-crouch-crown', 'crawl-05-exit'],
    ['relay-caster-06', 'relay-crouch-last', 'crawl-06-exit'],
    ['relay-lancer-07', 'relay-crouch-last', 'crawl-06-exit'],
  ]) {
    const enemy = level.enemies.find(e => e.id === id)
    const fight = stepById(`fight-${id}`)
    const roof = level.crouchGates.find(p => p.id === roofId)
    assert.equal(policy.steps.filter(s => s.enemyId === id).length, 1)
    assert.ok(stepIndex(approachId) < stepIndex(fight.id), id)
    assert.equal(stepById(approachId).crouch, true)
    assert.equal(fight.jumpStrikeY, undefined)
    assert.ok(fight.minX <= enemy.patrolLeft && fight.maxX >= enemy.patrolRight, id)
    assert.ok(fight.minX - 12 - halfWidth > roof.x + roof.width, id)
    for (const x of [fight.minX, enemy.x, fight.maxX]) for (const body of arrivalBodies({ x, y: 616 })) {
      assert.ok(permanentSolids.some(p => p.y === 616 && p.x <= body.left && p.x + p.width >= body.right), id)
      assert.ok(!fixedSolids.some(p => overlaps(body, p)), id)
    }
    const debug = Object.freeze({ player: Object.freeze(at({ x: enemy.x - 60, y: 616 })),
      enemies: Object.freeze([Object.freeze({ id, x: enemy.x, y: enemy.y, alive: true })]) })
    const action = decideStep(fight, debug, { facing: 1 }, 0)
    assert.equal(action.attack, true)
    assert.equal(action.jump, false)
    assert.equal(action.done, false)
  }
})

test('Foundry entry clears the phase bridge underside before moving and braces between exposed jumps', () => {
  const entry = policy.steps.find(step => step.id === 'gap-06-phase-board')
  const takeoff = policy.steps.find(step => step.id === 'gap-06-takeoff')
  const phase = level.phasePlatforms.find(item => item.id === 'relay-phase-02')
  assert.equal(entry.riseBeforeMoveY, phase.y - 6)
  assert.ok(takeoff.x + 12 + halfWidth < phase.x)
  assert.equal(decideStep(entry, { player: { x: takeoff.x, bodyBottom: 616, velocityY: 0 } }, {}, 0).direction, 0)
  const wait = stepById('foundry-phase-cycle')
  assert.equal(wait.kind, 'phase-cycle')
  assert.equal(wait.platformId, phase.id)
  assert.deepEqual([wait.x, wait.y, wait.windZoneId], [takeoff.x, takeoff.y, 'relay-wind-foundry'])
  assert.ok(entry.x - 18 - halfWidth > phase.x && entry.x + 18 + halfWidth < phase.x + phase.width)
  assert.equal(entry.y, phase.y)
  const descent = stepById('gap-06-landing')
  assert.equal(descent.kind, 'move')
  assert.equal(descent.crouch, true)
  assert.ok(descent.y - phase.y < 330)
  const road = level.platforms.find(platform => platform.y === descent.y && platform.x <= descent.x
    && platform.x + platform.width >= descent.x)
  assert.ok(road.x - (phase.x + phase.width) < halfWidth * 2)
  assert.equal(stepIndex(wait.id) + 1, stepIndex(entry.id))
  assert.equal(stepIndex(entry.id) + 1, stepIndex('gap-06-landing'))
  const brace = policy.steps.find(step => step.id === 'foundry-exit-wind-cycle')
  assert.deepEqual({ x: brace.x, y: brace.y, crouch: brace.crouch }, { x: 6656, y: 466, crouch: true })
  assert.ok(policy.steps.indexOf(brace) < policy.steps.findIndex(step => step.id === 'gap-07-landing'))
})

test('Foundry powers stand during calm to collect, brace during gusts and require actual activation', () => {
  for (const id of ['relay-chrono-foundry', 'relay-aether-foundry']) {
    const step = stepById(`power-${id}`)
    const field = POWER_READBACK_FIELDS[step.power]
    assert.equal(step.braceWindZoneId, 'relay-wind-foundry')
    for (const body of arrivalBodies({ ...step, crouch: false })) {
      assert.ok(permanentSolids.some(p => p.y === step.y && p.x <= body.left && p.x + p.width >= body.right))
      assert.ok(!fixedSolids.some(p => overlaps(body, p)), 'Standing pickup must clear the roof')
    }
    const memory = {}
    for (const [active, telling] of [[false, false], [false, true], [true, false]]) {
      const debug = { player: at(step, { [field]: false }), windZones: [{ id: step.braceWindZoneId, active, telling }] }
      const action = decideStep(step, debug, memory, 1000)
      assert.equal(action.crouch, active || telling)
      assert.equal(action.jump, false)
      assert.equal(action.done, false)
      assert.equal(decideStep(step, { ...debug, player: at(step, { [field]: true }) }, memory, 1500).done, true)
    }
    assert.equal(memory.startedAt, 1000)
    assert.throws(() => decideStep(step, { player: at(step, { [field]: false }), windZones: [] }, {}, 0), /live cycle readback/)
  }
})

test('Foundry drone jump-strikes stay outside the roof on continuous supported road', () => {
  const step = stepById('fight-relay-drone-01')
  const roof = level.crouchGates.find(p => p.id === 'relay-crouch-foundry')
  assert.equal(step.braceWindZoneId, 'relay-wind-foundry')
  assert.equal(step.jumpStrikeY, 616)
  assert.ok(step.minX - halfWidth - 12 > roof.x + roof.width)
  for (let x = step.minX - 12; x <= step.maxX + 12; x += 2) {
    assert.ok(permanentSolids.some(p => p.y === step.jumpStrikeY && p.x <= x - halfWidth && p.x + p.width >= x + halfWidth))
    const body = { left: x - halfWidth, right: x + halfWidth, top: 616 - standingHeight, bottom: 616 }
    assert.ok(!fixedSolids.some(p => overlaps(body, p)))
  }
  assert.ok(stepIndex('crawl-03-exit') < stepIndex(step.id))
  assert.ok(stepIndex(step.id) < stepIndex('gap-07-takeoff'))
})

test('approach jump recovery uses a continuous supported floor outside the step underside', () => {
  const jump = stepById('gap-02-step')
  const takeoff = stepById('gap-02-takeoff')
  const ledge = level.platforms.find(item => item.id === 'relay-crouch-step-01')
  assert.equal(jump.retryTakeoffX, takeoff.x)
  assert.ok(jump.retryTakeoffX + 12 + halfWidth < ledge.x)
  for (let x = jump.retryTakeoffX - 12; x <= jump.x + 18; x += 2) {
    const body = { left: x - halfWidth, right: x + halfWidth, top: jump.fromY - standingHeight, bottom: jump.fromY }
    assert.ok(permanentSolids.some(p => p.y === jump.fromY && p.x <= body.left && p.x + p.width >= body.right))
    assert.ok(!fixedSolids.some(p => overlaps(body, p)))
  }
})

test('Foundry clears both guards before moving across the lift shaft to the checkpoint', () => {
  const stage = stepById('foundry-interior-stage')
  const floor = level.platforms.find(item => item.id === 'relay-floor-08')
  const lift = level.movingPlatforms.find(item => item.id === 'relay-lift-foundry')
  assert.deepEqual([stage.x, stage.y, stage.crouch], [7460, floor.y, true])
  const checkpoint = level.checkpoints.find(item => item.id === 'relay-checkpoint-gears')
  assert.ok(stage.x - 12 >= checkpoint.x)
  assert.ok(stage.x + 12 <= checkpoint.x + checkpoint.triggerWidth)
  assert.deepEqual(stage.attackEnemyIds, ['relay-grenadier-01', 'relay-lancer-03'])
  assert.equal(stage.braceWindZoneId, 'relay-wind-foundry')
  const wind = level.windZones.find(zone => zone.id === stage.braceWindZoneId)
  assert.ok(wind.x <= 6950 && wind.x + wind.width > stage.x)
  for (let x = 6950; x <= stage.x; x += 2) {
    const body = { left: x - halfWidth, right: x + halfWidth, top: stage.y - standingHeight, bottom: stage.y }
    assert.ok(!fixedSolids.some(s => overlaps(body, s)), 'Calm interval allows standing under fixed geometry')
    assert.ok(floor.x <= body.left && floor.x + floor.width >= body.right)
  }
  assert.equal(stepIndex('power-relay-aether-foundry') + 1, stepIndex('fight-relay-grenadier-01'))
  assert.equal(stepIndex('fight-relay-grenadier-01') + 1, stepIndex('fight-relay-lancer-03'))
  assert.equal(stepIndex('fight-relay-lancer-03') + 1, stepIndex(stage.id))
  for (const id of ['relay-grenadier-01', 'relay-lancer-03']) {
    const fight = stepById(`fight-${id}`)
    assert.ok(stepIndex(fight.id) < stepIndex(stage.id))
    assert.equal(fight.crouch, true)
    assert.equal(fight.jumpStrikeY, 616)
    assert.equal(fight.freshCalmJump, true)
    assert.equal(fight.braceWindZoneId, wind.id)
    assert.ok(fight.maxX + halfWidth + 12 < lift.x)
    assert.ok(fight.minX - halfWidth - 12 > floor.x)
    assert.ok(floor.x + floor.width - fight.maxX >= 180)
    assert.equal(decideStep(fight, { player: at({ x: 7100, y: 616 }), enemies: [{ id, alive: true, x: 7000, y: 616 }],
      windZones: [{ id: wind.id, active: false, telling: false, direction: -1 }] }, {}, 0).direction, -1)
  }
})

test('the Prism missed-jump recovery uses the existing shelf and returns to the supported takeoff', () => {
  const step = stepById('gap-05-step')
  const shelf = level.platforms.find(p => p.id === 'relay-recovery-02')
  assert.deepEqual(step.recoveryShelf, { minX: shelf.x, maxX: shelf.x + shelf.width, y: shelf.y, returnX: 4580 })
  assert.equal(step.recoveryShelf.returnX, stepById('gap-05-takeoff').x)
  assert.ok(shelf.y - step.fromY <= 100)
  const floor = level.platforms.find(p => p.id === 'relay-floor-05')
  assert.ok(step.recoveryShelf.returnX - halfWidth >= floor.x)
  assert.ok(step.recoveryShelf.returnX + halfWidth <= floor.x + floor.width)
  assert.equal(floor.y, step.fromY)
  const bridge = level.tiltPlatforms.find(item => item.id === step.retryBridgeId)
  assert.equal(step.retryTakeoffX, step.recoveryShelf.returnX)
  assert.equal(bridge.id, 'relay-tilt-prism')
  assert.ok(bridge.x - (floor.x + floor.width) < halfWidth * 2, 'The narrow floor/deck join retains foot support')
  assert.ok(Math.abs(bridge.y - floor.y) < 20, 'The return is a small step down, not another gap jump')
  assert.ok(bridge.x - step.retryTakeoffX < 180)
})

test('Foundry exit preserves later double-jump airtime through an intangible bridge interval', () => {
  const step = stepById('gap-08-landing')
  assert.equal(step.airJumpDelayMs, 350)
  const memory = {}
  const state = (y, velocityY = -200) => ({ player: at({ x: 7658, y }, { velocityY }) })
  assert.equal(decideStep(step, state(480, 0), memory, 0).jump, true)
  assert.equal(decideStep(step, state(405), memory, 150).jump, false)
  assert.equal(decideStep(step, state(360), memory, 350).jump, true)
  assert.equal(memory.airJumped, true)
})

test('Ascent approach braces in live gusts while retaining grounded progress toward the takeoff', () => {
  const step = stepById('gap-22-takeoff')
  const wind = level.windZones.find(item => item.id === step.braceWindZoneId)
  assert.equal(wind.id, 'relay-wind-ascent')
  assert.ok(wind.x < 21110 && wind.x + wind.width > step.x)
  const floor = level.platforms.find(p => p.id === 'relay-floor-22')
  assert.ok(floor.x < 21110 - halfWidth && floor.x + floor.width > step.x)
  assert.ok(floor.x + floor.width - step.x >= halfWidth - 1)
  for (const [active, telling, crouch] of [[true, false, true], [false, true, true], [false, false, false]]) {
    const action = decideStep(step, { player: at({ x: 21110, y: 616 }),
      windZones: [{ id: wind.id, active, telling }] }, {}, 1000)
    assert.equal(action.direction, 1)
    assert.equal(action.crouch, crouch)
    assert.equal(action.jump, false)
    assert.equal(action.done, false)
  }
})

test('Choir landing pocket separates the lift cycle from both unchanged beam rhythms', () => {
  const step = stepById('gap-12-landing')
  const window = step.launchWindow
  const lift = level.movingPlatforms.find(p => p.id === window.liftId)
  assert.equal(window.x, stepById('gap-12-takeoff').x)
  assert.equal(window.topY, lift.endY)
  assert.equal(window.pauseMs, lift.pauseMs)
  assert.equal(window.minPauseMs, 650)
  assert.ok(window.maxRisingY - window.topY <= lift.speed * 0.2)
  const beams = level.relayBeamZones.filter(p => p.id.startsWith('relay-beam-choir-'))
  assert.equal(beams.length, 2)
  assert.ok(beams.every(p => p.x > step.x + 18 + halfWidth && p.x + p.width === 13400))
  assert.deepEqual(beams.map(p => [p.lanes, p.cadenceMs, p.tellDurationMs, p.activeDurationMs, p.delayMs, p.damage]),
    [[[448], 2500, 700, 700, 260, 3], [[548], 2500, 700, 700, 1510, 3]])
  assert.equal(step.timeoutMs, 10000)
  assert.equal(step.airJumpDelayMs, 350)
})

test('normal policy remains finite input data with no mastery dependency or QA mutation capability', () => {
  assert.equal(RELAY_ROUTE_POLICIES.length, 1)
  assert.deepEqual(Object.keys(policy.requirements).sort(), ['objectiveItems', 'requiredEnemyIds'])
  assert.ok(policy.steps.every(step => ['move', 'jump', 'fight', 'power', 'relic', 'wind-cycle', 'phase-cycle', 'beam-cycle', 'finish'].includes(step.kind)))
  assert.ok(policy.steps.every(step => step.counter !== 'masteryItems' && step.coinId === undefined))
  assert.ok(policy.steps.every(step => !level.masteryPickups.some(p => p.id === step.id || p.id === step.pickupId)))
  for (const changed of [{ kind: 'teleport' }, { defeatEnemy: 'sentry-sovereign' }, { health: 12 }, { velocityX: 0 }, { timeoutMs: Infinity }]) {
    const steps = policy.steps.map((step, index) => index === 0 ? { ...step, ...changed } : step)
    assert.throws(() => validatePolicy({ ...policy, steps }))
  }
  const required = [...new Set([...level.encounters.filter(e => e.sealed).flatMap(e => e.enemyIds), ...level.requiredEnemyIds])]
  assert.deepEqual(policy.requirements.requiredEnemyIds, required)
})

test('all nine observable power flags fail closed and need real natural activation', () => {
  const families = { shield: 'shieldPickups', chrono: 'chronoPickups', surge: 'surgePickups',
    'mirror-ward': 'mirrorWardPickups', 'gale-mantle': 'galeMantlePickups', 'sunsteel-edge': 'sunsteelEdgePickups',
    'dawnfire-aegis': 'dawnfireAegisPickups', 'aether-step': 'aetherStepPickups' }
  for (const step of policy.steps.filter(step => step.kind === 'power')) {
    const item = level[families[step.power]].find(item => item.id === step.pickupId)
    assert.ok(item, step.id)
    assert.ok(Math.abs(item.x - step.x) <= 12)
    assert.equal(step.y - item.y, 68)
  }
  for (const [power, field] of Object.entries(POWER_READBACK_FIELDS)) {
    const step = { kind: 'power', power, x: 100, y: 616 }
    assert.throws(() => decideStep(step, { player: at(step) }, {}, 0), /missing power/)
    assert.equal(decideStep(step, { player: at(step, { [field]: false }) }, {}, 0).done, false)
    assert.equal(decideStep(step, { player: at(step, { [field]: true }) }, {}, 0).done, true)
  }
})

test('finale requirements permit optional surviving enemies and uncollected dispatches', () => {
  const debug = { player: { objectiveItems: 5, totalObjectiveItems: 5, masteryItems: 0, totalMasteryItems: 8 },
    enemies: level.enemies.map(enemy => ({ id: enemy.id, alive: enemy.id !== 'sentry-sovereign' })) }
  assert.doesNotThrow(() => assertRouteRequirements(debug, policy.requirements, 'complete'))
  debug.enemies.find(enemy => enemy.id === 'sentry-sovereign').alive = true
  assert.throws(() => assertRouteRequirements(debug, policy.requirements, 'complete'), /required enemy/)
  assert.equal(policy.steps.at(-2).enemyId, 'sentry-sovereign')
  assert.equal(policy.steps.at(-1).kind, 'finish')
})

test('ending UI only advances in order after honest fresh recorded gameplay completion', () => {
  const start = '2026-09-08T00:00:00.000Z'
  const observation = {
    debug: { levelId: 'level-10', player: { objectiveItems: 5, totalObjectiveItems: 5, score: 5000, coins: 20 },
      enemies: [{ id: 'sentry-sovereign', alive: false }] },
    record: { lastRun: { recordedAt: start, score: 5000, coinsCollected: 20 } },
    dialogs: [{ label: 'Dawn Relay Spire finale', title: 'Master Lock Broken', buttons: ['Follow the signal'] }],
  }
  const step = policy.steps.at(-1)
  assert.deepEqual(finaleAction(observation, policy, step, start, 0), { title: 'Master Lock Broken', button: 'Follow the signal' })
  assert.throws(() => finaleAction(observation, policy, policy.steps[0], start, 0), /before the complete/)
  assert.throws(() => finaleAction(observation, policy, step, start, 1), /Unexpected ending/)
  assert.throws(() => finaleAction({ ...observation, record: null }, policy, step, start, 0), /fresh matching/)
  const bossAlive = structuredClone(observation)
  bossAlive.debug.enemies[0].alive = true
  assert.throws(() => finaleAction(bossAlive, policy, step, start, 0), /required enemy/)
  for (const [index, [title, button]] of [['Master Lock Broken', 'Follow the signal'], ['Relay Restored', 'See the dawn'],
    ['Every Road Answers', 'Continue'], ['Campaign Complete', 'View Results']].entries()) {
    observation.dialogs[0] = { label: 'Dawn Relay Spire finale', title, buttons: [button] }
    assert.deepEqual(finaleAction(observation, policy, step, start, index), { title, button })
  }
  observation.dialogs = [{ title: 'Level Complete' }]
  assert.equal(finaleAction(observation, policy, step, start, 4), null)
})
