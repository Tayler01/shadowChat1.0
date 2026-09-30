import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXTENDED_ROUTE_POLICIES } from './shadow-runner-route-policies.mjs'
import { OPENING_ROUTE_POLICIES } from './shadow-runner-opening-route-policies.mjs'
import { CAUSEWAY_ROUTE_POLICIES } from './shadow-runner-causeway-route-policies.mjs'
import { CATACOMB_ROUTE_POLICIES } from './shadow-runner-catacomb-route-policies.mjs'
import { CAPTAIN_ROUTE_POLICIES } from './shadow-runner-captain-route-policies.mjs'
import { RELAY_ROUTE_POLICIES } from './shadow-runner-relay-route-policies.mjs'
import { createCheckpointRecovery, observeCheckpointRecovery, stepAfterCheckpointRecovery,
  validateCheckpointRecovery } from './shadow-runner-checkpoint-recovery.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GUEST_KEY = 'shadow-runner-campaign-progress-v2:guest'
const TITLES = ['Tutorial Run', 'East Gate Run', 'Lantern Market Roofs', 'Ivy Viaduct',
  'Bell Tower Archives', 'Candle Fair Ruins', 'Clockmaker Yard', 'Moonlit Causeway',
  'Courier Catacombs', 'Captain Gate', 'Dawn Relay Spire']
const LEVEL_IDS = ['tutorial', ...Array.from({ length: 10 }, (_, i) => `level-${i + 1}`)]
const KEYS = { left: 'ArrowLeft', right: 'ArrowRight', jump: 'Space', attack: 'KeyJ', crouch: 'KeyS' }
const RELIC_TOTAL_FIELDS = { moonShards: 'totalMoonShards', objectiveItems: 'totalObjectiveItems', masteryItems: 'totalMasteryItems' }
export const POWER_READBACK_FIELDS = {
  shield: 'shieldActive', chrono: 'chronoActive', surge: 'surgeActive',
  wraithlight: 'wraithlightActive', 'mirror-ward': 'mirrorWardActive',
  'gale-mantle': 'galeMantleActive', 'sunsteel-edge': 'sunsteelEdgeActive',
  'dawnfire-aegis': 'dawnfireAegisActive', 'aether-step': 'aetherStepActive',
}
const PROFILES = {
  android: { engine: 'chromium', viewport: { width: 932, height: 430 } },
  iphone: { engine: 'webkit', viewport: { width: 740, height: 390 } },
}

const move = (id, x, y) => ({ id, kind: 'move', x, y })
const jump = (id, x, y, fromY) => ({ id, kind: 'jump', x, y, fromY, airJumpDelayMs: 300 })
const policyKey = policy => `${policy.levelId}/${policy.mode ?? 'normal'}`
const retainedPolicies = [
  {
    levelId: 'level-1', mode: 'normal', title: TITLES[1], start: { x: 112, y: 404 },
    scope: 'Input-only ordinary completion with both sentry fights. Not an all-coin claim.',
    steps: [
      move('west-edge', 480, 432), jump('broken-step-a', 675, 400, 432),
      jump('broken-step-b', 920, 366, 400), jump('center-walkway', 1250, 432, 366),
      { id: 'first-sentry', kind: 'fight', enemyId: 'gate-clockwork-sentry' },
      move('spike-approach', 1660, 432), jump('courtyard', 1950, 404, 432),
      move('courtyard-edge', 2130, 404), jump('final-walkway', 2400, 432, 404),
      { id: 'second-sentry', kind: 'fight', enemyId: 'courtyard-clockwork-sentry' },
      { id: 'east-gate', kind: 'finish', x: 2794, y: 432 },
    ],
  },
]
// Opening replacements are keyed by route and mode; L1 normal remains unchanged.
export const BUILTIN_POLICIES = [...new Map([...retainedPolicies, ...OPENING_ROUTE_POLICIES]
  .map(policy => [policyKey(policy), policy])).values()]

function demand(condition, message) {
  if (!condition) throw new Error(message)
}

export function validateBaseUrl(value) {
  const url = new URL(value)
  demand(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    && url.port === '4176' && !url.username && !url.password && !url.search && !url.hash
    && url.pathname === '/', 'Route proof requires a plain loopback http origin on port 4176')
  return url.origin
}

export function parseArgs(argv) {
  const options = { baseUrl: 'http://127.0.0.1:4176', levels: ['tutorial', 'level-1'],
    profiles: ['android'], modes: ['normal'], input: 'keyboard', attempts: 1, timeoutMs: 90000, sampleMs: 40,
    runName: `shadow-runner-route-proof-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    stepScreenshots: 'none', recovery: 'none', dryRun: false, previewReady: false, headed: false }
  const lists = { levels: 'levels', profiles: 'profiles', modes: 'modes' }
  const strings = { 'base-url': 'baseUrl', input: 'input', 'run-name': 'runName', 'policy-file': 'policyFile', 'step-screenshots': 'stepScreenshots', recovery: 'recovery' }
  const numbers = { attempts: ['attempts', 1, 3], 'timeout-ms': ['timeoutMs', 1000, 900000], 'sample-ms': ['sampleMs', 16, 100] }
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--preview-ready') options.previewReady = true
    else if (arg === '--headed') options.headed = true
    else if (arg === '--help') options.help = true
    else {
      const match = /^--([a-z-]+)=(.+)$/.exec(arg)
      demand(match, `Unsupported argument: ${arg}`)
      const [, name, value] = match
      if (Object.hasOwn(lists, name)) options[lists[name]] = value.split(',')
      else if (Object.hasOwn(strings, name)) options[strings[name]] = value
      else if (Object.hasOwn(numbers, name)) {
        const [field, min, max] = numbers[name]
        demand(Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max, `Invalid ${name}`)
        options[field] = Number(value)
      } else throw new Error(`Unsupported option: ${name}`)
    }
  }
  options.baseUrl = validateBaseUrl(options.baseUrl)
  demand(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(options.runName), 'run-name must be one safe directory name')
  demand(['keyboard', 'buttons'].includes(options.input), 'input must be keyboard or buttons (pointer direction + keyboard actions)')
  demand(['none', 'all'].includes(options.stepScreenshots), 'step-screenshots must be none or all')
  demand(options.levels.length > 0 && options.levels.every(id => LEVEL_IDS.includes(id)), 'Unknown route ID')
  demand(new Set(options.levels).size === options.levels.length, 'Duplicate route ID')
  demand(options.profiles.length > 0 && options.profiles.every(id => Object.hasOwn(PROFILES, id)), 'Unknown profile')
  demand(new Set(options.profiles).size === options.profiles.length, 'Duplicate profile')
  demand(options.modes.length > 0 && options.modes.every(mode => ['normal', 'mastery'].includes(mode)), 'Unknown mode')
  demand(new Set(options.modes).size === options.modes.length, 'Duplicate mode')
  demand(['none', 'checkpoint'].includes(options.recovery), 'recovery must be none or checkpoint')
  demand(options.recovery === 'none' || options.modes.every(mode => mode === 'normal'), 'Checkpoint recovery is normal-only')
  return options
}

export function validatePolicy(policy) {
  demand(policy && LEVEL_IDS.includes(policy.levelId), 'Invalid policy levelId')
  demand(['normal', 'mastery'].includes(policy.mode ?? 'normal'), 'Invalid policy mode')
  demand(policy.title === TITLES[LEVEL_IDS.indexOf(policy.levelId)], 'Policy title must match the route catalog')
  demand(policy.start && Number.isFinite(policy.start.x) && Number.isFinite(policy.start.y), 'Policy requires a finite spawn position')
  demand(Array.isArray(policy.steps) && policy.steps.length > 0 && policy.steps.length <= 500, 'Policy requires 1-500 steps')
  const seen = new Set()
  for (const [index, step] of policy.steps.entries()) {
    demand(step && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(step.id) && !seen.has(step.id), 'Invalid or duplicate step ID')
    seen.add(step.id)
    const allowed = {
      move: ['x', 'y', 'crouch', 'attackEnemyIds', 'floorHazardBounds', 'braceWindZoneId'], jump: ['x', 'y', 'fromY', 'airJumpDelayMs', 'extraAirJumpDelayMs', 'riseBeforeMoveY', 'viaX', 'crouchOnLanding', 'retryTakeoffX', 'retryBridgeId', 'recoveryShelf', 'launchWindow'],
      fight: ['enemyId', 'minX', 'maxX', 'jumpStrikeY', 'crouch', 'floorHazardBounds', 'braceWindZoneId', 'freshCalmJump', 'avoidHighBeamId'], wait: ['durationMs'], finish: ['x', 'y', 'jumpOnEntry', 'coinId', 'minCoins'],
      'wind-cycle': ['zoneId', 'crouch', 'x', 'y', 'anchorTolerance', 'floorHazardBounds'],
      'phase-cycle': ['platformId', 'windZoneId', 'crouch', 'x', 'y'],
      collect: ['x', 'y', 'coinId', 'minCoins', 'crouch'],
      relic: ['x', 'y', 'counter', 'minCount', 'crouch', 'recoverySkipIfEarned'],
      'beam-cycle': ['x', 'y'],
      power: ['x', 'y', 'power', 'pickupId', 'crouch', 'braceWindZoneId'],
    }[step.kind]
    demand(allowed, `Unsupported real-input action: ${step.kind}`)
    const beamAllowed = ['move', 'fight', 'relic', 'power', 'beam-cycle'].includes(step.kind)
    const arrowAllowed = ['move', 'fight', 'power'].includes(step.kind)
    demand(Object.keys(step).every(key => ['id', 'kind', 'timeoutMs', ...(beamAllowed ? ['beamDodge'] : []),
      ...(arrowAllowed ? ['arrowDodge'] : []), ...allowed].includes(key)), `Unknown fields on step ${step.id}`)
    if (['move', 'jump', 'finish', 'collect', 'power', 'relic', 'beam-cycle'].includes(step.kind)) {
      demand(Number.isFinite(step.x) && Number.isFinite(step.y) && step.x >= 0 && step.y >= 0, `Invalid target on ${step.id}`)
    }
    if (step.recoverySkipIfEarned !== undefined) demand(step.recoverySkipIfEarned === true
      && (policy.mode ?? 'normal') === 'normal', 'Earned detour skipping is explicit and normal-only')
    if (step.arrowDodge !== undefined) {
      const area = step.arrowDodge
      demand(area && Object.keys(area).length === 3 && ['minX', 'maxX', 'groundY'].every(key => Number.isFinite(area[key]))
        && area.minX >= 0 && area.maxX > area.minX && area.maxX - area.minX <= 2000 && area.groundY > 0
        && !step.crouch && !step.beamDodge && !step.floorHazardBounds && !step.braceWindZoneId
        && step.jumpStrikeY === undefined && (step.kind === 'fight' || step.y === area.groundY),
      'Arrow dodge requires a bounded clear standing corridor without competing jump policies')
    }
    if (step.beamDodge !== undefined || step.kind === 'beam-cycle') {
      const beam = step.beamDodge
      demand(beam && Object.keys(beam).length === 6
        && ['highId', 'lowId'].every(key => typeof beam[key] === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(beam[key]))
        && beam.highId !== beam.lowId && ['minX', 'maxX', 'maxJumpX', 'groundY'].every(key => Number.isFinite(beam[key]))
        && beam.minX >= 0 && beam.maxX > beam.minX && beam.maxX - beam.minX <= 2000 && beam.groundY > 0
        && beam.maxJumpX > beam.minX && beam.maxJumpX < beam.maxX
        && !step.crouch && step.braceWindZoneId === undefined && step.floorHazardBounds === undefined
        && step.jumpStrikeY === undefined && (step.kind === 'fight' || step.y === beam.groundY),
      'Beam dodge requires a bounded standing corridor and two distinct observed lanes')
    }
    if (step.kind === 'jump') {
      if (step.launchWindow !== undefined) {
        const window = step.launchWindow
        const numbers = ['x', 'topY', 'maxRisingY', 'pauseMs', 'minPauseMs']
        demand(window && Object.keys(window).length === numbers.length + 1
          && typeof window.liftId === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(window.liftId)
          && numbers.every(key => Number.isFinite(window[key]) && window[key] >= 0)
          && Math.abs(window.x - step.x) <= 350 && window.topY > 0 && window.topY < step.fromY
          && window.maxRisingY >= window.topY && window.maxRisingY < step.fromY
          && window.pauseMs > 0 && window.pauseMs <= 5000 && window.minPauseMs > 0 && window.minPauseMs <= window.pauseMs,
        'Launch window requires bounded authored lift timing')
      }
      if (step.retryBridgeId !== undefined) demand(typeof step.retryBridgeId === 'string'
        && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(step.retryBridgeId) && Number.isFinite(step.retryTakeoffX),
      'Bridge retry requires an authored bridge and takeoff target')
      demand(Number.isFinite(step.fromY) && step.fromY >= 0, `Invalid takeoff on ${step.id}`)
      if (step.crouchOnLanding !== undefined) demand(typeof step.crouchOnLanding === 'boolean', 'crouchOnLanding must be boolean')
      demand(step.airJumpDelayMs === undefined || (Number.isFinite(step.airJumpDelayMs)
        && step.airJumpDelayMs >= 100 && step.airJumpDelayMs <= 600), 'Air jump delay must be 100-600ms')
      if (step.extraAirJumpDelayMs !== undefined) demand(Number.isFinite(step.airJumpDelayMs)
        && Number.isFinite(step.extraAirJumpDelayMs) && step.extraAirJumpDelayMs >= step.airJumpDelayMs + 100
        && step.extraAirJumpDelayMs <= 1200, 'Aether third jump requires a second jump and a later delay within 1200ms')
      if (step.riseBeforeMoveY !== undefined) demand(Number.isFinite(step.riseBeforeMoveY)
        && step.riseBeforeMoveY >= 0 && step.riseBeforeMoveY < step.fromY, 'Rise threshold must be above takeoff')
      if (step.viaX !== undefined) demand(Number.isFinite(step.viaX) && step.viaX >= 0 && step.viaX !== step.x
        && step.riseBeforeMoveY === undefined, 'Air turn requires a finite distinct viaX and cannot also wait for a vertical lip')
      if (step.retryTakeoffX !== undefined) demand(Number.isFinite(step.retryTakeoffX) && step.retryTakeoffX >= 0
        && Math.abs(step.retryTakeoffX - step.x) <= 180 && step.y < step.fromY && step.riseBeforeMoveY !== undefined,
      'Takeoff recovery requires a nearby explicit rising-step launch')
      if (step.recoveryShelf !== undefined) {
        const shelf = step.recoveryShelf
        demand(shelf && Object.keys(shelf).length === 4 && ['minX', 'maxX', 'y', 'returnX'].every(key => Number.isFinite(shelf[key]))
          && shelf.minX >= 0 && shelf.maxX > shelf.minX && shelf.maxX - shelf.minX <= 240
          && shelf.y > step.fromY && shelf.y - step.fromY <= 100 && shelf.returnX >= 0
          && Math.max(Math.abs(shelf.returnX - shelf.minX), Math.abs(shelf.returnX - shelf.maxX)) <= 320,
        'Recovery shelf requires bounded authored support and a nearby return')
      }
    }
    if (step.kind === 'fight') {
      demand(typeof step.enemyId === 'string' && step.enemyId.length > 0, 'Fight requires enemyId')
      if (step.maxX !== undefined) demand(Number.isFinite(step.maxX) && step.maxX > 0, 'Fight maxX must be finite and positive')
      if (step.minX !== undefined) demand(Number.isFinite(step.minX) && step.minX >= 0
        && step.minX < step.maxX, 'Fight minX requires a larger maxX')
      if (step.jumpStrikeY !== undefined) demand(Number.isFinite(step.jumpStrikeY) && step.jumpStrikeY > 0
        && Number.isFinite(step.minX) && Number.isFinite(step.maxX), 'Jump strikes require ground height and both patrol bounds')
      demand(!(step.crouch && step.jumpStrikeY !== undefined && !step.braceWindZoneId),
        'Crouched sword fights cannot also request jump strikes without observed wind intervals')
      if (step.freshCalmJump !== undefined) demand(step.freshCalmJump === true
        && typeof step.braceWindZoneId === 'string' && Number.isFinite(step.jumpStrikeY),
      'Fresh calm jumps require a wind-braced jump fight')
      if (step.avoidHighBeamId !== undefined) demand(typeof step.avoidHighBeamId === 'string'
        && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(step.avoidHighBeamId) && Number.isFinite(step.jumpStrikeY),
      'High beam avoidance requires a named visible beam and grounded jump fight')
    }
    if (step.attackEnemyIds !== undefined) demand(Array.isArray(step.attackEnemyIds)
      && step.attackEnemyIds.length > 0 && step.attackEnemyIds.length <= 4
      && new Set(step.attackEnemyIds).size === step.attackEnemyIds.length
      && step.attackEnemyIds.every(id => policy.expected?.enemyIds?.includes(id)),
    'Moving attacks require one to four unique authored enemy IDs')
    if (step.braceWindZoneId !== undefined) demand(typeof step.braceWindZoneId === 'string'
      && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(step.braceWindZoneId) && step.crouch === true
      && step.floorHazardBounds === undefined, 'Wind bracing requires an explicit crouch fallback and a clear standing corridor')
    if (step.floorHazardBounds !== undefined) {
      const bounds = step.floorHazardBounds
      demand(bounds && Object.keys(bounds).length === 3 && ['minX', 'maxX', 'y'].every(key => Number.isFinite(bounds[key]))
        && bounds.minX >= 0 && bounds.maxX > bounds.minX && bounds.y > 0
        && bounds.maxX - bounds.minX <= 800 && step.crouch === true && step.jumpStrikeY === undefined
        && (!['move', 'wind-cycle'].includes(step.kind) || (step.y === bounds.y && step.x >= bounds.minX && step.x <= bounds.maxX))
        && (step.kind !== 'fight' || (step.minX >= bounds.minX && step.maxX <= bounds.maxX)),
      'Floor hazard guard requires a bounded crouched supported corridor')
    }
    if (step.kind === 'power') demand(Object.hasOwn(POWER_READBACK_FIELDS, step.power)
      && typeof step.pickupId === 'string' && step.pickupId.length > 0, 'Power requires a supported authored pickup target')
    if (step.kind === 'relic') demand(Object.hasOwn(RELIC_TOTAL_FIELDS, step.counter)
      && Number.isSafeInteger(step.minCount) && step.minCount > 0
      && Number.isSafeInteger(policy.requirements?.[step.counter]) && step.minCount <= policy.requirements[step.counter],
    'Relic requires an allowed counter and positive minCount within declared requirements')
    if (step.kind === 'collect' || (step.kind === 'finish' && (step.coinId !== undefined || step.minCoins !== undefined))) demand(/^coin-[1-9]\d*$/.test(step.coinId)
      && Number.isInteger(step.minCoins) && step.minCoins > 0, 'Collect requires coinId and positive minCoins')
    if (step.jumpOnEntry !== undefined) demand(typeof step.jumpOnEntry === 'boolean', 'jumpOnEntry must be boolean')
    if (step.kind === 'wait') demand(Number.isFinite(step.durationMs) && step.durationMs >= 0 && step.durationMs <= 10000, 'Wait must be 0-10000ms')
    if (step.kind === 'wind-cycle') {
      demand(typeof step.zoneId === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(step.zoneId), 'Wind cycle requires an authored zoneId')
      if (step.x !== undefined || step.y !== undefined) demand(Number.isFinite(step.x) && step.x >= 0
        && Number.isFinite(step.y) && step.y >= 0, 'Wind hold requires a finite supported position')
      if (step.anchorTolerance !== undefined) demand(Number.isFinite(step.x) && Number.isFinite(step.y)
        && Number.isFinite(step.anchorTolerance) && step.anchorTolerance >= 8 && step.anchorTolerance <= 24,
      'Wind anchor tolerance requires support and must be 8-24px')
    }
    if (step.kind === 'phase-cycle') {
      demand(typeof step.platformId === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(step.platformId), 'Phase cycle requires an authored platformId')
      demand(Number.isFinite(step.x) && step.x >= 0 && Number.isFinite(step.y) && step.y >= 0,
        'Phase hold requires a finite supported position')
      if (step.windZoneId !== undefined) demand(typeof step.windZoneId === 'string'
        && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(step.windZoneId), 'Phase wind gate requires an authored windZoneId')
    }
    if (step.crouch !== undefined) demand(typeof step.crouch === 'boolean', 'Crouch must be boolean')
    if (step.timeoutMs !== undefined) demand(Number.isInteger(step.timeoutMs) && step.timeoutMs >= 1000 && step.timeoutMs <= 30000, 'Step timeout must be 1000-30000ms')
    demand(step.kind !== 'finish' || index === policy.steps.length - 1, 'Finish must be the last step')
  }
  demand(policy.steps.at(-1).kind === 'finish', 'Policy must end with a finish step')
  if (policy.requirements !== undefined) {
    const requirements = policy.requirements
    demand(requirements && typeof requirements === 'object' && !Array.isArray(requirements)
      && Object.keys(requirements).every(key => Object.hasOwn(RELIC_TOTAL_FIELDS, key) || key === 'requiredEnemyIds'),
    'Unknown route requirement')
    for (const counter of Object.keys(RELIC_TOTAL_FIELDS)) {
      if (!Object.hasOwn(requirements, counter)) continue
      const total = requirements[counter]
      demand(Number.isSafeInteger(total) && total >= 0, 'Requirement totals must be nonnegative integers')
      const steps = policy.steps.filter(step => step.kind === 'relic' && step.counter === counter)
      demand(total === 0 ? steps.length === 0 : steps.length > 0 && steps.at(-1).minCount === total
        && steps.every((step, index) => index === 0 || step.minCount > steps[index - 1].minCount),
      'Relic milestones must increase to the declared total')
    }
    if (requirements.requiredEnemyIds !== undefined) demand(Array.isArray(requirements.requiredEnemyIds)
      && new Set(requirements.requiredEnemyIds).size === requirements.requiredEnemyIds.length
      && requirements.requiredEnemyIds.every(id => typeof id === 'string' && id.length > 0
        && policy.steps.some(step => step.kind === 'fight' && step.enemyId === id)), 'Required enemies need unique explicit fight steps')
  }
  if (policy.expected || policy.mode === 'mastery') {
    const expected = policy.expected
    demand(expected && Number.isInteger(expected.coins) && expected.coins > 0
      && Array.isArray(expected.enemyIds) && expected.enemyIds.every(id => typeof id === 'string' && id.length > 0)
      && new Set(expected.enemyIds).size === expected.enemyIds.length, 'Invalid expected coin/enemy catalog')
    if (policy.mode === 'mastery') {
      const coins = policy.steps.filter(step => step.kind === 'collect' || (step.kind === 'finish' && step.coinId))
      demand(coins.length === expected.coins && new Set(coins.map(step => step.coinId)).size === expected.coins
        && coins.every((step, i) => step.minCoins === i + 1)
        && Array.from({ length: expected.coins }, (_, i) => `coin-${i + 1}`).every(id => coins.some(step => step.coinId === id)),
      'Mastery must enumerate every coin once with increasing count milestones')
      const fights = policy.steps.filter(step => step.kind === 'fight')
      demand(fights.length === expected.enemyIds.length
        && expected.enemyIds.every(id => fights.filter(step => step.enemyId === id).length === 1),
      'Mastery must enumerate every enemy once')
    }
  }
  if (policy.recoveryPoints !== undefined) validateCheckpointRecovery(policy)
  return policy
}

export function selectPolicies(policies, levels, modes) {
  return levels.flatMap(id => modes.map(mode => {
    const matches = policies.filter(policy => policy.levelId === id && (policy.mode ?? 'normal') === mode)
    demand(matches.length > 0, `No real-input policy for ${id}/${mode}; supply one with --policy-file. No coverage is claimed.`)
    demand(matches.length === 1, `Duplicate policy for ${id}/${mode}`)
    return validatePolicy(matches[0])
  }))
}

export function makeGuestSeed(levelId) {
  demand(LEVEL_IDS.includes(levelId), 'Unknown guest route')
  const prerequisites = LEVEL_IDS.slice(0, LEVEL_IDS.indexOf(levelId))
  return { version: 2, ownerId: null, pending: {}, levels: Object.fromEntries(prerequisites.map(id => [id, { completedAt: new Date(0).toISOString() }])) }
}

export function assertRealInputKey(key) {
  demand(Object.values(KEYS).includes(key), `Not an allowed gameplay key: ${key}`)
  return key
}

export function mayRequest(url, method, baseUrl) {
  try { return new URL(url).origin === baseUrl && ['GET', 'HEAD'].includes(method) }
  catch { return false }
}

export function assertAttemptDeadline(now, timeoutMs) {
  demand(Number.isFinite(now) && now >= 0 && Number.isFinite(timeoutMs) && timeoutMs > 0 && now < timeoutMs,
    'Route proof deadline expired without timely completion evidence')
}

function groundedAt(player, y, tiltBridges) {
  if (Math.abs(player.bodyBottom - y) <= 6 && Math.abs(player.velocityY) <= 24) return true
  const support = tiltBridges?.playerSupport
  const bridge = tiltBridges?.bridges?.find(item => item.id === support?.bridgeId)
  // A tilted deck's authored Y is its pivot, not the height beneath the feet.
  return Boolean(bridge && Number.isFinite(support.surfaceY)
    && Math.abs((bridge.left.y + bridge.right.y) / 2 - y) <= 0.5
    && Math.abs(player.bodyBottom - support.surfaceY) <= 0.51
    && Math.abs(player.velocityY) <= 60
    && player.x + 16.38 > bridge.left.x && player.x - 16.38 < bridge.right.x)
}

export function crossingWindowReady(window, debug, memory) {
  const time = debug.activeTimeMs
  const lift = debug.movingPlatforms?.find(item => item.id === window.liftId)
  demand(Number.isFinite(time) && time >= 0 && lift && Number.isFinite(lift.y)
    && [-1, 1].includes(lift.direction) && typeof lift.paused === 'boolean'
    && Number.isFinite(lift.pauseRemainingMs) && lift.pauseRemainingMs >= 0 && lift.pauseRemainingMs <= window.pauseMs
    && lift.paused === (lift.pauseRemainingMs > 0),
  'Launch window requires live clock and lift observations')
  demand(memory.lastAt === undefined || time >= memory.lastAt, 'Launch window clock regressed')
  memory.lastAt = time
  const atTop = lift.paused && lift.y === window.topY
  const rising = !lift.paused && lift.direction === -1 && lift.y >= window.topY && lift.y <= window.maxRisingY
  const paused = atTop && lift.pauseRemainingMs >= window.minPauseMs
  return Boolean(rising || paused)
}

function readRelicCounter(player, counter) {
  demand(Object.hasOwn(RELIC_TOTAL_FIELDS, counter), 'Unsupported relic counter')
  const totalField = RELIC_TOTAL_FIELDS[counter]
  demand(Object.hasOwn(player, counter) && Object.hasOwn(player, totalField)
    && Number.isSafeInteger(player[counter]) && Number.isSafeInteger(player[totalField])
    && player[counter] >= 0 && player[totalField] >= player[counter], `Invalid or missing relic readback: ${counter}`)
  return { count: player[counter], total: player[totalField] }
}

export function assertRouteRequirements(debug, requirements, phase) {
  if (!requirements) return
  demand(['initial', 'complete'].includes(phase), 'Unknown requirement phase')
  for (const counter of Object.keys(RELIC_TOTAL_FIELDS)) {
    if (!Object.hasOwn(requirements, counter)) continue
    const observed = readRelicCounter(debug.player, counter)
    demand(observed.total === requirements[counter], `Authored requirement total changed: ${counter}`)
    demand(observed.count === (phase === 'initial' ? 0 : requirements[counter]), `Unmet ${phase} requirement: ${counter}`)
  }
  for (const id of requirements.requiredEnemyIds ?? []) {
    const enemy = debug.enemies?.find(enemy => enemy.id === id)
    demand(enemy && (phase !== 'complete' || enemy.alive === false), `Unmet required enemy: ${id}`)
  }
}

function avoidVisibleArrows(step, debug, memory, action) {
  const area = step.arrowDodge
  const player = debug.player
  demand(Array.isArray(debug.visibleArrows), 'Arrow defense requires visible projectile readback')
  const arrows = debug.visibleArrows
  demand(arrows.every(arrow => ['left', 'right', 'top', 'bottom', 'velocityX', 'velocityY']
    .every(key => Number.isFinite(arrow[key])) && arrow.right > arrow.left && arrow.bottom > arrow.top),
  'Invalid visible arrow geometry or velocity')
  const onFloor = groundedAt(player, area.groundY, debug.tiltBridges)
  demand(['bodyTop', 'bodyBottom', 'bodyLeft', 'bodyRight'].every(key => Number.isFinite(player[key]))
    && player.bodyRight > player.bodyLeft && player.bodyBottom > player.bodyTop,
  'Arrow defense requires the actual player body')
  if (onFloor && player.crouching) return { ...action, direction: 0, crouch: false, jump: false, attack: false, done: false }
  const collision = (velocityY, direction, horizon, initialFoot = area.groundY) => {
    for (let time = 0; time <= horizon; time += 0.025) {
      const foot = velocityY === undefined ? initialFoot
        : Math.min(area.groundY, initialFoot + velocityY * time + 820 * time * time)
      const travel = direction * 260 * time
      const top = foot - (player.bodyBottom - player.bodyTop)
      if (arrows.some(arrow => player.bodyRight + travel + 2 > arrow.left + arrow.velocityX * time
        && player.bodyLeft + travel - 2 < arrow.right + arrow.velocityX * time
        && foot + 3 > arrow.top + arrow.velocityY * time
        && top - 3 < arrow.bottom + arrow.velocityY * time)) return true
    }
    return false
  }
  if (memory.arrowHop) {
    if (!onFloor) memory.arrowHop.airborne = true
    if (memory.arrowHop.airborne && onFloor) delete memory.arrowHop
    else if (!onFloor && !memory.arrowHop.second
      && collision(player.velocityY, 0, 0.3, player.bodyBottom)
      && !collision(-560, 0, 0.4, player.bodyBottom)) {
      memory.arrowHop.second = true
      return { ...action, direction: 0, jump: true, crouch: false, attack: false, done: false }
    }
    else return { ...action, direction: 0, jump: false, crouch: false, attack: false, done: false }
  }
  if (action.done || !onFloor || player.x < area.minX || player.x > area.maxX) return action
  // Forecast only already-visible arrows. A stationary hop preserves the known
  // clear headroom instead of drifting beneath an adjacent ledge during defense.
  const approachingVolley = arrows.some(arrow => {
    const distance = arrow.velocityX < 0 ? arrow.left - player.bodyRight : player.bodyLeft - arrow.right
    return distance > 0 && distance / Math.abs(arrow.velocityX) < 0.45
      && arrow.bottom > area.groundY - 100 && arrow.top < area.groundY
  })
  if (!approachingVolley && !collision(undefined, action.direction, 0.35)) return action
  if (!collision(-620, 0, 0.45)) {
    memory.arrowHop = { airborne: false }
    return { ...action, direction: 0, jump: true, crouch: false, attack: false, done: false }
  }
  return { ...action, direction: 0, jump: false, attack: false, done: false }
}

// Pure route policy. It never receives the page, scene or mutable game state.
export function decideStep(step, debug, memory, now) {
  const previousFacing = memory.facing
  const previousAttackAt = memory.attackAt
  const previousJumpAt = memory.jumpAt
  const previousCollectJumps = memory.collectJumps
  const action = decideRouteStep(step, debug, memory, now)
  if (step.avoidHighBeamId) {
    const beam = debug.relayBeamZones?.find(zone => zone.id === step.avoidHighBeamId)
    demand(beam && ['idle', 'telling', 'active'].includes(beam.state), 'High beam avoidance requires visible beam state')
    if (beam.state !== 'idle' && !action.done) {
      action.jump = false
      action.crouch = true
      memory.jumpAt = previousJumpAt
    }
    return action
  }
  if (step.arrowDodge) {
    const guarded = avoidVisibleArrows(step, debug, memory, action)
    if (guarded !== action) {
      memory.facing = previousFacing
      memory.attackAt = previousAttackAt
      memory.jumpAt = previousJumpAt
      memory.collectJumps = previousCollectJumps
    }
    return guarded
  }
  const beam = step.beamDodge
  if (beam) {
    const high = debug.relayBeamZones?.find(zone => zone.id === beam.highId)
    const low = debug.relayBeamZones?.find(zone => zone.id === beam.lowId)
    demand([high, low].every(zone => zone && ['idle', 'telling', 'active'].includes(zone.state)),
      'Beam dodge requires both live beam states')
    const time = debug.activeTimeMs
    demand(Number.isFinite(time) && time >= 0 && (memory.beamAt === undefined || time >= memory.beamAt),
      'Beam dodge requires a monotonic live clock')
    memory.beamAt = time
    if (memory.highState === 'active' && high.state === 'idle') memory.highClearedAt = time
    memory.highState = high.state
    const onFloor = groundedAt(debug.player, beam.groundY, debug.tiltBridges)
    const inside = debug.player.x >= beam.minX - 20 && debug.player.x <= beam.maxX + 20
    if (memory.dodge) {
      if (!onFloor) memory.dodge.leftGround = true
      if (memory.dodge.leftGround && onFloor) delete memory.dodge
      else {
        action.done = false
        action.jump = false
        action.direction = debug.player.x > beam.maxJumpX && Math.abs(debug.player.velocityY) < 24 ? -1 : 0
        action.attack = action.attack && memory.facing === previousFacing
        if (!action.attack) memory.attackAt = previousAttackAt
        memory.facing = action.direction || previousFacing
        if (memory.dodge.leftGround && !memory.dodge.second && time - memory.dodge.at >= 440
          && high.state !== 'active') {
          action.jump = true
          memory.dodge.second = true
        }
        return action
      }
    }
    if (action.done || !inside) return action
    // Grounded swords avoid the high lanes. Delay the defensive double jump
    // until the witnessed high pulse has cleared, then cover the low pulse.
    action.jump = false
    if (['move', 'beam-cycle'].includes(step.kind) && onFloor && Math.abs(step.x - debug.player.x) < 80) action.crouch = true
    if (debug.player.x > beam.maxJumpX && low.state !== 'idle') {
      action.direction = -1
      action.crouch = false
      action.attack = false
      memory.attackAt = previousAttackAt
      memory.facing = -1
      return action
    }
    const ready = high.state !== 'active' && (low.state === 'active'
      || (low.state === 'telling' && memory.highClearedAt !== undefined && time - memory.highClearedAt >= 150))
    if (low.state !== 'idle' && debug.player.x > beam.maxJumpX - 80) {
      action.direction = 0
      action.attack = action.attack && memory.facing === previousFacing
      if (!action.attack) memory.attackAt = previousAttackAt
      memory.facing = previousFacing
    }
    if (onFloor && ready) {
      memory.dodge = { at: time, leftGround: false, second: false }
      action.jump = true
      action.crouch = false
      action.direction = 0
      action.attack = action.attack && memory.facing === previousFacing
      if (!action.attack) memory.attackAt = previousAttackAt
      memory.facing = previousFacing
    }
    return action
  }
  const bounds = step.floorHazardBounds
  if (!bounds) return action
  demand(Array.isArray(debug.floorHazards), 'Floor hazard guard requires visible live hazard readback')
  for (const hazard of debug.floorHazards) demand(['candle', 'storm'].includes(hazard.kind)
    && ['left', 'right', 'top', 'bottom'].every(key => Number.isFinite(hazard[key]))
    && hazard.left < hazard.right && hazard.top < hazard.bottom, 'Invalid visible floor hazard')
  const warnings = debug.stormWarnings ?? []
  demand(Array.isArray(warnings), 'Invalid visible storm warnings')
  for (const warning of warnings) demand(warning && ['left', 'right', 'top', 'bottom'].every(key => Number.isFinite(warning[key]))
    && warning.left < warning.right && warning.top < warning.bottom, 'Invalid visible storm warning')
  const player = debug.player
  if (!groundedAt(player, bounds.y, debug.tiltBridges)) return action
  // Conservative body margin plus one input interval. No guessed expiry or future spawns.
  const halfWidth = 20
  const margin = 12
  const travelMargin = 24
  const hazards = [...debug.floorHazards, ...warnings].filter(h => h.top < player.bodyBottom && h.bottom > player.bodyBottom - 27)
  const overlapsAt = (x, padding = 0) => hazards.some(h => x + halfWidth + padding > h.left && x - halfWidth - padding < h.right)
  const threatened = overlapsAt(player.x, margin)
  if (!threatened && (!action.direction || !overlapsAt(player.x + action.direction * travelMargin, margin))) return action
  let direction = 0
  if (threatened) {
    const candidates = hazards.flatMap(h => [h.left - halfWidth - margin, h.right + halfWidth + margin])
      .filter(x => x >= bounds.minX && x <= bounds.maxX && !overlapsAt(x, margin - 0.1))
      .filter(x => {
        const nextX = player.x + Math.sign(x - player.x) * travelMargin
        return nextX >= bounds.minX && nextX <= bounds.maxX
      })
      .filter(x => !hazards.some(h => !(player.x + halfWidth + margin > h.left && player.x - halfWidth - margin < h.right)
        && Math.min(x, player.x) - halfWidth < h.right && Math.max(x, player.x) + halfWidth > h.left))
      .sort((a, b) => Math.abs(a - player.x) - Math.abs(b - player.x))
    if (candidates.length) direction = Math.sign(candidates[0] - player.x)
  }
  memory.facing = direction || previousFacing
  const attack = action.attack && direction === action.direction
  if (action.attack && !attack) memory.attackAt = previousAttackAt
  return { ...action, direction, jump: false, attack, done: false }
}

export function nextStepMemory(step, next, memory) {
  if (!step.beamDodge || !next?.beamDodge || step.beamDodge.highId !== next.beamDodge.highId
    || step.beamDodge.lowId !== next.beamDodge.lowId) return {}
  // Carry observations, never action deadlines, attacks, jump attempts or earned-state flags.
  return { beamAt: memory.beamAt, highState: memory.highState, highClearedAt: memory.highClearedAt,
    launchBeamState: memory.highState }
}

function decideRouteStep(step, debug, memory, now) {
  const player = debug.player
  const atSupport = y => groundedAt(player, y, debug.tiltBridges)
  const action = { direction: 0, crouch: Boolean(step.crouch), jump: false, attack: false, done: false }
  if (step.braceWindZoneId) {
    const wind = debug.windZones?.find(zone => zone.id === step.braceWindZoneId)
    demand(wind && typeof wind.active === 'boolean' && typeof wind.telling === 'boolean',
      'Wind bracing requires live cycle readback')
    action.crouch = wind.active || wind.telling
  }
  memory.startedAt ??= now
  if (step.kind === 'wait') return { ...action, done: now - memory.startedAt >= step.durationMs }
  if (step.kind === 'beam-cycle') {
    const beam = debug.relayBeamZones?.find(zone => zone.id === step.beamDodge.highId)
    demand(beam && ['idle', 'telling', 'active'].includes(beam.state), 'Beam cycle requires live high-lane state')
    const freshIdle = memory.launchBeamState === 'active' && beam.state === 'idle'
    memory.launchBeamState = beam.state
    const dx = step.x - player.x
    return { ...action, direction: Math.abs(dx) > 16 ? Math.sign(dx) : 0,
      done: freshIdle && Math.abs(dx) <= 16 && atSupport(step.y) }
  }
  if (step.kind === 'phase-cycle') {
    const phase = debug.phasePlatforms?.find(platform => platform.id === step.platformId)
    demand(phase && ['solid', 'warning', 'intangible'].includes(phase.state), 'Phase cycle requires live state readback')
    const wind = step.windZoneId === undefined ? undefined : debug.windZones?.find(zone => zone.id === step.windZoneId)
    demand(step.windZoneId === undefined || (wind && typeof wind.active === 'boolean' && typeof wind.telling === 'boolean'),
      'Phase cycle requires live wind readback')
    // Only a witnessed transition provides a fresh boarding window. A stale solid readback does not.
    const freshSolid = phase.state === 'solid' && memory.previousPhase !== undefined && memory.previousPhase !== 'solid'
    memory.previousPhase = phase.state
    const dx = step.x - player.x
    return { ...action, direction: Math.abs(dx) > 4 ? Math.sign(dx) : 0,
      done: Boolean(freshSolid && !wind?.active && !wind?.telling && Math.abs(dx) <= 8 && atSupport(step.y)) }
  }
  if (step.kind === 'wind-cycle') {
    const wind = debug.windZones?.find(zone => zone.id === step.zoneId)
    demand(wind && typeof wind.active === 'boolean' && typeof wind.telling === 'boolean', 'Wind cycle requires live cycle readback')
    const busy = wind.active || wind.telling
    // A hit or drift that misses calm onset must wait for the next complete window.
    const freshCalm = memory.previousWindBusy === true && !busy
    memory.previousWindBusy = busy
    const anchored = step.x !== undefined
    const dx = anchored ? step.x - player.x : 0
    // Do not amplify a gust when correcting overshoot. Counter-steer until just
    // beyond the anchor, then let the wind carry back toward it.
    const counterDirection = wind.active && [-1, 1].includes(wind.direction) ? -wind.direction : 0
    const direction = anchored && counterDirection
      ? dx * counterDirection >= -4 ? counterDirection : 0
      : Math.abs(dx) > 4 ? Math.sign(dx) : 0
    return { ...action, direction,
      done: Boolean(freshCalm
        && (!anchored || (Math.abs(dx) <= (step.anchorTolerance ?? 8) && atSupport(step.y)))) }
  }
  if (step.kind === 'fight') {
    const enemy = debug.enemies?.find(enemy => enemy.id === step.enemyId)
    demand(enemy, `Policy enemy missing: ${step.enemyId}`)
    if (!enemy.alive) return { ...action, done: true }
    const dx = enemy.x - player.x
    const direction = Math.sign(dx) || 1
    const jumpStrike = step.jumpStrikeY !== undefined && !action.crouch
    let jumpWindow = true
    if (step.freshCalmJump) {
      const wind = debug.windZones.find(zone => zone.id === step.braceWindZoneId)
      const busy = wind.active || wind.telling
      jumpWindow = memory.previousJumpWindBusy === true && !busy
      memory.previousJumpWindBusy = busy
    }
    action.direction = Math.abs(dx) > (jumpStrike ? 16 : 76) || memory.facing !== direction ? direction : 0
    if (step.maxX !== undefined && action.direction > 0 && player.x >= step.maxX - 12) {
      action.direction = memory.facing === direction ? 0 : -1
    }
    if (step.maxX !== undefined && player.x > step.maxX) action.direction = -1
    if (step.minX !== undefined && action.direction < 0 && player.x <= step.minX + 12) {
      action.direction = memory.facing === direction ? 0 : 1
    }
    if (step.minX !== undefined && player.x < step.minX) action.direction = 1
    if (action.direction) memory.facing = action.direction
    if (memory.facing === direction && Math.abs(dx) <= 108 && Math.abs(enemy.y - player.y) < 90 && now - (memory.attackAt ?? -Infinity) >= 460) {
      action.attack = true
      memory.attackAt = now
    }
    // Ordinary grounded jumps put the runner above incoming contact and permit natural stomps.
    if (jumpStrike && jumpWindow && !action.crouch && Math.abs(dx) < 160 && atSupport(step.jumpStrikeY)
      && now - (memory.jumpAt ?? -Infinity) >= 500) {
      action.jump = true
      memory.jumpAt = now
    }
    return action
  }
  const dx = step.x - player.x
  action.direction = Math.abs(dx) > 8 ? Math.sign(dx) : 0
  if (step.kind === 'move') {
    if (action.direction) memory.facing = action.direction
    if (step.attackEnemyIds) {
      const enemies = step.attackEnemyIds.map(id => {
        const enemy = debug.enemies?.find(item => item.id === id)
        demand(enemy, `Moving attack enemy missing: ${id}`)
        return enemy
      })
      if (enemies.some(enemy => enemy.alive && Math.sign(enemy.x - player.x) === memory.facing
        && Math.abs(enemy.x - player.x) <= 108 && Math.abs(enemy.y - player.y) < 90)
        && now - (memory.attackAt ?? -Infinity) >= 460) {
        action.attack = true
        memory.attackAt = now
      }
    }
    return { ...action, done: Math.abs(dx) <= 12 && atSupport(step.y) }
  }
  if (step.kind === 'collect' || step.kind === 'power' || step.kind === 'relic') {
    const atTarget = Math.abs(dx) <= 12 && atSupport(step.y)
    let observed
    if (step.kind === 'relic') {
      const reading = readRelicCounter(player, step.counter)
      demand(Number.isSafeInteger(step.minCount) && step.minCount > 0 && step.minCount <= reading.total,
        'Relic target exceeds the observed total')
      observed = reading.count >= step.minCount
    } else if (step.kind === 'power') {
      const field = POWER_READBACK_FIELDS[step.power]
      demand(Object.hasOwn(POWER_READBACK_FIELDS, step.power) && typeof player[field] === 'boolean',
        `Invalid or missing power readback: ${step.power}`)
      observed = player[field] && (!Array.isArray(debug.collectedPowerIds) || debug.collectedPowerIds.includes(step.pickupId))
    } else observed = player.coins >= step.minCoins
    // Guarded pickups can register while retreating from a warning. Keep a
    // bounded, grounded arrival without forcing a second visit to an earned item.
    const guardedArrival = step.beamDodge && Math.abs(dx) <= 32 && atSupport(step.y)
    if ((atTarget || guardedArrival) && observed) return { ...action, direction: 0, done: true }
    // Counts are readback milestones, not per-ID evidence. Final mastery checks the full catalog.
    // Power targets require natural activation and match pickup IDs when available.
    if (atTarget && !step.crouch && !step.braceWindZoneId && (memory.collectJumps ?? 0) < 3 && now - (memory.jumpAt ?? -Infinity) >= 900) {
      memory.jumpAt = now
      memory.collectJumps = (memory.collectJumps ?? 0) + 1
      action.jump = true
    }
    return action
  }
  if (step.kind === 'finish') {
    if (debug.deliveryState === 'ready' && atSupport(step.y) && Math.abs(dx) <= 18 && !memory.ignitionPressed) {
      memory.ignitionPressed = true
      return { ...action, direction: 0, attack: true }
    }
    if (debug.deliveryState === 'igniting' || debug.deliveryState === 'delivered') return { ...action, direction: 0 }
    if (step.jumpOnEntry && !memory.finishJumped) {
      if (!atSupport(step.y)) return { ...action, direction: 0 }
      memory.finishJumped = true
      action.jump = true
    }
    return action // Only the results dialog + a fresh recorded run can complete proof.
  }
  if (step.crouchOnLanding && memory.leftGround && atSupport(step.y)
    && Number.isFinite(memory.takeoffX) && Math.abs(player.x - memory.takeoffX) > 36) {
    return { ...action, crouch: true, done: Math.abs(dx) <= 18 }
  }
  const shelf = step.recoveryShelf
  if (shelf && memory.leftGround && (memory.shelfRecovery || (atSupport(shelf.y)
    && player.x >= shelf.minX && player.x <= shelf.maxX && (memory.shelfRecoveries ?? 0) < 2
    && (memory.jumpAttempts ?? 0) < 3))) {
    if (!memory.shelfRecovery) {
      demand(Number.isFinite(memory.takeoffX) && Math.abs(shelf.returnX - memory.takeoffX) <= 36,
        'Shelf recovery must return to the observed takeoff')
      memory.shelfRecovery = {}
      memory.shelfRecoveries = (memory.shelfRecoveries ?? 0) + 1
    }
    if (atSupport(shelf.y) && (player.x < shelf.minX || player.x > shelf.maxX)) {
      return { ...action, direction: 0 }
    }
    const recovery = decideRouteStep({ id: `${step.id}-recovery`, kind: 'jump', x: shelf.returnX,
      y: step.fromY, fromY: shelf.y }, debug, memory.shelfRecovery, now)
    if (recovery.done) {
      Object.assign(memory, { shelfRecovery: undefined, returningFromBridge: false, jumpAt: undefined, leftGround: false,
        airJumped: false, airJumpAt: undefined, extraAirJumped: false, clearedLip: false,
        reachedVia: false, viaDirection: undefined })
    }
    return { ...recovery, done: false }
  }
  // A hit can interrupt a valid jump. Retry only after an observed return to
  // takeoff support, without extending the step deadline or changing game state.
  if (step.retryBridgeId && memory.leftGround && now - memory.jumpAt >= 600 && (memory.jumpAttempts ?? 0) < 3) {
    const bridge = debug.tiltBridges?.bridges?.find(item => item.id === step.retryBridgeId)
    const bridgeContact = bridge && debug.tiltBridges.playerSupport?.bridgeId === step.retryBridgeId
      && groundedAt(player, (bridge.left.y + bridge.right.y) / 2, debug.tiltBridges)
    if ((bridgeContact || memory.returningFromBridge) && Math.abs(player.x - step.retryTakeoffX) <= 180) {
      memory.returningFromBridge = true
      if (Math.abs(player.x - step.retryTakeoffX) <= 8 && atSupport(step.fromY)) memory.returningFromBridge = false
      else return { ...action, direction: Math.sign(step.retryTakeoffX - player.x), jump: false, done: false }
    } else if (memory.returningFromBridge) return { ...action, direction: 0 }
  }
  const canRetry = memory.leftGround && Number.isFinite(memory.takeoffX)
    && atSupport(step.fromY) && now - memory.jumpAt >= 600
    && (memory.jumpAttempts ?? 0) < 3 && !(Math.abs(dx) <= 18 && atSupport(step.y))
  if (canRetry && step.retryTakeoffX !== undefined && Math.abs(player.x - step.retryTakeoffX) <= 180
    && Math.abs(player.x - step.retryTakeoffX) > 8) {
    return { ...action, direction: Math.sign(step.retryTakeoffX - player.x) }
  }
  if (canRetry && (step.retryTakeoffX !== undefined ? Math.abs(player.x - step.retryTakeoffX) <= 8
    : Math.abs(player.x - memory.takeoffX) <= 36)) {
    Object.assign(memory, { jumpAt: undefined, leftGround: false, airJumped: false,
      airJumpAt: undefined, extraAirJumped: false, clearedLip: false,
      reachedVia: false, viaDirection: undefined })
  }
  if (step.riseBeforeMoveY !== undefined && !memory.clearedLip) {
    memory.clearedLip = player.bodyBottom <= step.riseBeforeMoveY
    if (!memory.clearedLip) action.direction = 0
  }
  if (step.viaX !== undefined && !memory.reachedVia) {
    memory.viaDirection ??= Math.sign(step.viaX - player.x)
    memory.reachedVia = memory.viaDirection === 0 || (memory.viaDirection > 0 ? player.x >= step.viaX : player.x <= step.viaX)
    if (!memory.reachedVia) action.direction = memory.viaDirection
  }
  if (memory.jumpAt === undefined) {
    if (step.launchWindow) {
      const ready = crossingWindowReady(step.launchWindow, debug, memory.launchWindow ??= {})
      const launchDx = step.launchWindow.x - player.x
      const supported = atSupport(step.fromY)
      if (!ready || !supported || Math.abs(launchDx) > 8) return { ...action,
        direction: supported && Math.abs(launchDx) > 4 && Math.abs(launchDx) <= 32 ? Math.sign(launchDx) : 0,
        crouch: true, jump: false, done: false }
    }
    if (!atSupport(step.fromY)) return { ...action, direction: 0 }
    demand((memory.jumpAttempts ?? 0) < 3, 'Jump exhausted its bounded attempts')
    if (step.retryTakeoffX !== undefined) demand(Math.abs(player.x - step.retryTakeoffX) <= 36,
      'Explicit recovery launch must match the observed takeoff')
    memory.takeoffX ??= player.x
    memory.jumpAt = now
    memory.jumpAttempts = (memory.jumpAttempts ?? 0) + 1
    action.jump = true
  } else {
    if (!atSupport(step.fromY)) memory.leftGround = true
    const viaReady = step.viaX === undefined || memory.reachedVia
    if (memory.leftGround && viaReady && Math.abs(dx) <= 18 && atSupport(step.y)) return { ...action, direction: 0, done: true }
    if (step.airJumpDelayMs !== undefined && !memory.airJumped && memory.leftGround && viaReady && now - memory.jumpAt >= step.airJumpDelayMs) {
      memory.airJumped = true
      memory.airJumpAt = now
      action.jump = true
    } else if (step.extraAirJumpDelayMs !== undefined && memory.airJumped && !memory.extraAirJumped
      && memory.leftGround && now - memory.jumpAt >= step.extraAirJumpDelayMs && now - memory.airJumpAt >= 100) {
      demand(player.aetherStepActive === true, 'Aether third jump requires an observed active powerup; route timing needs review')
      memory.extraAirJumped = true
      action.jump = true
    }
  }
  return action
}

export function observationEvents(previous, next, elapsedMs) {
  if (!previous?.player || !next?.player) return []
  const events = []
  if (next.player.health < previous.player.health) events.push({ kind: 'damage', amount: previous.player.health - next.player.health })
  if (next.player.lives < previous.player.lives) events.push({ kind: 'life-lost', count: previous.player.lives - next.player.lives })
  if (next.respawnPending && !previous.respawnPending) events.push({ kind: 'respawn-start' })
  if (!next.respawnPending && previous.respawnPending) events.push({ kind: 'respawn-end' })
  if (next.checkpointId !== previous.checkpointId) events.push({ kind: 'checkpoint', id: next.checkpointId })
  const respawn = next.respawnPending || previous.respawnPending || next.player.lives < previous.player.lives
  if (!respawn && Math.abs(next.player.x - previous.player.x) > 600 * elapsedMs / 1000 + 80) {
    events.push({ kind: 'unexplained-position-discontinuity' })
  }
  if (Number.isFinite(previous.activeTimeMs) && next.activeTimeMs < previous.activeTimeMs) events.push({ kind: 'scene-clock-reset' })
  return events
}

function hasRecordedCompletionEvidence(observation, levelId, attemptStartedAt) {
  const run = observation.record?.lastRun
  return observation.debug?.levelId === levelId
    && Number.isFinite(Date.parse(run?.recordedAt)) && Date.parse(run.recordedAt) >= Date.parse(attemptStartedAt)
    && Number.isFinite(run.score) && run.score === observation.debug.player?.score
    && run.coinsCollected === observation.debug.player?.coins
}

export function hasCompletionEvidence(observation, levelId, attemptStartedAt) {
  return hasRecordedCompletionEvidence(observation, levelId, attemptStartedAt)
    && observation.dialogs.some(dialog => ['Level Complete', 'Full Clear', 'Perfect Route'].includes(dialog.title))
}

export function hasMasteryEvidence(observation, policy, attemptStartedAt) {
  const run = observation.record?.lastRun
  const enemies = observation.debug?.enemies ?? []
  return hasCompletionEvidence(observation, policy.levelId, attemptStartedAt)
    && observation.dialogs.some(dialog => ['Full Clear', 'Perfect Route'].includes(dialog.title))
    && run.fullClear === true && run.coinsCollected === policy.expected.coins && run.totalCoins === policy.expected.coins
    && run.enemiesDefeated === policy.expected.enemyIds.length && run.totalEnemies === policy.expected.enemyIds.length
    && enemies.length === policy.expected.enemyIds.length
    && policy.expected.enemyIds.every(id => enemies.some(enemy => enemy.id === id && !enemy.alive))
}

const ENDING_ACTIONS = [
  ['Master Lock Broken', 'Follow the signal'], ['Relay Restored', 'See the dawn'],
  ['Every Road Answers', 'Continue'], ['Campaign Complete', 'View Results'],
]

export function finaleAction(observation, policy, step, attemptStartedAt, nextBeat) {
  const dialog = observation.dialogs.find(dialog => dialog.label === 'Dawn Relay Spire finale')
  if (!dialog) return null
  demand(policy.levelId === 'level-10' && step.kind === 'finish', 'Ending appeared before the complete real-input route')
  assertRouteRequirements(observation.debug, policy.requirements, 'complete')
  // The fresh result must already exist; advancing story UI cannot supply missing gameplay evidence.
  demand(hasRecordedCompletionEvidence(observation, policy.levelId, attemptStartedAt),
    'Ending requires a fresh matching recorded completion')
  const expected = ENDING_ACTIONS[nextBeat]
  demand(expected && dialog.title === expected[0] && dialog.buttons.includes(expected[1]), 'Unexpected ending sequence or missing action')
  return { title: expected[0], button: expected[1] }
}

// The only gameplay page evaluation: snapshot/DOM/storage reads, no QA mutations.
export function readObservationInPage({ levelId, guestKey }) {
  let record = null
  try { record = JSON.parse(localStorage.getItem(guestKey) ?? 'null')?.levels?.[levelId] ?? null } catch { /* Report absent persistence evidence. */ }
  // Guest results may be durable in the journal when Web Locks compaction is
  // unavailable. Read only completion records; never emulate ACKs or save writes.
  if (typeof localStorage.key === 'function' && Number.isSafeInteger(localStorage.length)) {
    const prefix = `${guestKey}:journal:`
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(prefix)) continue
      try {
        const operation = JSON.parse(localStorage.getItem(key) ?? 'null')
        const run = operation?.run
        if (operation?.ownerId !== null || operation.type !== 'complete' || operation.levelId !== levelId
          || key !== `${prefix}${operation.id}` || !Number.isFinite(Date.parse(run?.recordedAt))
          || !['score', 'coinsCollected', 'totalCoins', 'enemiesDefeated', 'totalEnemies'].every(field => Number.isSafeInteger(run[field]) && run[field] >= 0)
          || typeof run.fullClear !== 'boolean' || typeof run.perfectRoute !== 'boolean') continue
        if (!record?.lastRun || Date.parse(run.recordedAt) >= Date.parse(record.lastRun.recordedAt)) {
          record = { ...record, lastRun: run }
        }
      } catch { /* A malformed unrelated entry cannot hide a valid completion. */ }
    }
  }
  return {
    browserTimeMs: performance.now(), debug: window.__shadowRunnerDebug?.() ?? null, record,
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(dialog => ({
      title: dialog.querySelector('h2')?.textContent?.trim() ?? '', text: dialog.textContent?.trim() ?? '',
      label: dialog.getAttribute('aria-label') ?? '',
      buttons: [...dialog.querySelectorAll('button')].map(button => button.textContent?.trim() ?? ''),
    })),
  }
}

export class RealInputDriver {
  constructor(page, mode, log, elapsed) {
    this.page = page
    this.mode = mode
    this.log = log
    this.elapsed = elapsed
    this.held = new Map()
    this.direction = 0
  }
  async keyDown(key, releaseAt = Infinity) {
    assertRealInputKey(key)
    if (this.held.has(key)) return
    await this.page.keyboard.down(key)
    this.held.set(key, releaseAt)
    this.log.push({ atMs: this.elapsed(), input: 'keyboard', kind: 'down', key })
  }
  async keyUp(key) {
    assertRealInputKey(key)
    if (!this.held.has(key)) return
    await this.page.keyboard.up(key)
    this.held.delete(key)
    this.log.push({ atMs: this.elapsed(), input: 'keyboard', kind: 'up', key })
  }
  async directionTo(value) {
    demand([-1, 0, 1].includes(value), 'Invalid movement direction')
    if (this.mode === 'keyboard') {
      await this.keyUp(value < 0 ? KEYS.right : KEYS.left)
      if (value === 0) await this.keyUp(KEYS.right)
      else await this.keyDown(value < 0 ? KEYS.left : KEYS.right)
    } else if (this.direction !== value) {
      if (this.direction) {
        await this.page.mouse.up()
        this.log.push({ atMs: this.elapsed(), input: 'pointer', kind: 'up', direction: this.direction })
      }
      this.direction = 0
      if (value) {
        const label = value < 0 ? 'Move left' : 'Move right'
        const box = await this.page.getByRole('button', { name: label, exact: true }).boundingBox()
        demand(box, `Missing ${label} button`)
        const x = box.x + box.width / 2
        const y = box.y + box.height / 2
        await this.page.mouse.move(x, y)
        await this.page.mouse.down()
        this.log.push({ atMs: this.elapsed(), input: 'pointer', kind: 'down', label, x, y })
      }
    }
    this.direction = value
  }
  async apply(action) {
    for (const [key, until] of this.held) if (until <= this.elapsed()) await this.keyUp(key)
    await this.directionTo(action.direction)
    if (action.crouch) await this.keyDown(KEYS.crouch)
    else await this.keyUp(KEYS.crouch)
    for (const name of ['jump', 'attack']) if (action[name]) await this.keyDown(KEYS[name], this.elapsed() + 70)
  }
  async release() {
    await this.directionTo(0)
    for (const key of [...this.held.keys()]) await this.keyUp(key)
  }
  async finishStep(crouch) {
    await this.directionTo(0)
    await this.keyUp(KEYS.jump)
    await this.keyUp(KEYS.attack)
    if (crouch) await this.keyDown(KEYS.crouch)
    else await this.keyUp(KEYS.crouch)
  }
}

async function readObservation(page, levelId) {
  return page.evaluate(readObservationInPage, { levelId, guestKey: GUEST_KEY })
}

async function launchRoute(page, baseUrl, policy, inputs) {
  await page.goto(`${baseUrl}/?view=games&localPreview=shadow-runner`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Select Level', exact: true }).waitFor({ timeout: 30000 })
  const click = async (label, options = {}) => {
    await page.getByRole('button', { name: label, ...options }).click()
    inputs.push({ phase: 'setup', input: 'pointer', kind: 'click', label: String(label), at: new Date().toISOString() })
  }
  if (policy.levelId === 'tutorial') await click(/Start Tutorial/i)
  else {
    await click('Select Level', { exact: true })
    await click(new RegExp(`^${policy.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} details`))
    await click(/^(Start|Replay)$/)
  }
  await page.waitForFunction(id => window.__shadowRunnerDebug?.().levelId === id, policy.levelId, { timeout: 30000 })
  // Intentionally no old-UI fallback: stale dist must fail instead of yielding misleading proof.
  await click('Begin delivery', { exact: true })
  await page.getByRole('button', { name: 'Move right', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Move left', exact: true }).waitFor()
  await page.locator('canvas').click({ position: { x: 360, y: 160 } })
  inputs.push({ phase: 'setup', input: 'pointer', kind: 'canvas-focus', x: 360, y: 160 })
}

async function runAttempt(browser, config, profile, policy, attempt, output) {
  const mode = policy.mode ?? 'normal'
  const dir = path.join(output, `${profile}-${policy.levelId}-${mode}-attempt-${attempt}`)
  await mkdir(dir)
  const result = { profile, levelId: policy.levelId, attempt, status: 'not-run', proofType: 'real-input',
    mode, scope: policy.scope ?? 'Declarative input-only route policy', startedAt: new Date().toISOString(),
    inputMode: config.input === 'buttons' ? 'pointer-direction + keyboard-actions' : 'keyboard',
    stepScreenshots: config.stepScreenshots, recovery: config.recovery,
    survivalCriterion: config.recovery === 'checkpoint' ? 'finite-lives' : 'deathless',
    prerequisiteUnlocks: Object.keys(makeGuestSeed(policy.levelId).levels), stepsCompleted: [],
    pageErrors: [], consoleErrors: [], requestFailures: [], blockedRequests: [], assetHashes: [], events: [], endingBeats: [],
  }
  const trajectory = []
  const inputs = []
  const assetJobs = []
  const context = await browser.newContext({ viewport: PROFILES[profile].viewport,
    isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: false })
  let page
  let driver
  let lastObservation
  try {
    await context.route('**/*', route => {
      const request = route.request()
      if (mayRequest(request.url(), request.method(), config.baseUrl)) return route.continue()
      const url = new URL(request.url())
      result.blockedRequests.push({ url: `${url.origin}${url.pathname}`, method: request.method() })
      return route.abort('blockedbyclient')
    })
    await context.routeWebSocket('**/*', socket => socket.close({ code: 1008, reason: 'Offline guest route proof' }))
    await context.addInitScript(({ key, progress }) => {
      localStorage.setItem(key, JSON.stringify(progress))
      localStorage.setItem('shadow-runner-music-enabled-v1', 'false')
      localStorage.setItem('shadow-runner-sfx-enabled-v1', 'false')
    }, { key: GUEST_KEY, progress: makeGuestSeed(policy.levelId) })
    page = await context.newPage()
    page.setDefaultTimeout(15000)
    page.on('pageerror', error => result.pageErrors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text()) })
    page.on('requestfailed', request => result.requestFailures.push({ url: request.url().split('?')[0], error: request.failure()?.errorText }))
    page.on('response', response => {
      if (new URL(response.url()).origin !== config.baseUrl) return
      if (response.status() >= 400) result.pageErrors.push(`Local HTTP ${response.status()}: ${new URL(response.url()).pathname}`)
      if (/\.js(?:\?|$)/.test(response.url()) && response.ok()) assetJobs.push(response.body().then(body => {
        result.assetHashes.push({ path: new URL(response.url()).pathname, sha256: createHash('sha256').update(body).digest('hex') })
      }).catch(error => result.pageErrors.push(`Bundle hash failed: ${error.message}`)))
    })
    await launchRoute(page, config.baseUrl, policy, inputs)
    lastObservation = await readObservation(page, policy.levelId)
    const initial = lastObservation.debug?.player
    demand(initial && initial.lives === 3 && initial.health === 12 && initial.coins === 0 && initial.score === 0,
      'Proof must start with normal untouched health/lives and no collected rewards')
    demand(Math.abs(initial.x - policy.start.x) <= 20 && Math.abs(initial.y - policy.start.y) <= 60,
      'Player did not begin at the authored spawn; policy or preview may be stale')
    demand(!lastObservation.record?.lastRun, 'Target route already has a run before proof starts')
    assertRouteRequirements(lastObservation.debug, policy.requirements, 'initial')
    result.initial = lastObservation
    const recovery = config.recovery === 'checkpoint' ? createCheckpointRecovery(policy, lastObservation.debug) : null
    await page.screenshot({ path: path.join(dir, 'start.png') })
    const start = performance.now()
    const elapsed = () => Math.round(performance.now() - start)
    driver = new RealInputDriver(page, config.input, inputs, elapsed)
    let index = 0
    let memory = {}
    let previousAt = 0
    let previousDebug = lastObservation.debug
    while (elapsed() < config.timeoutMs) {
      const observation = await readObservation(page, policy.levelId)
      const now = elapsed()
      assertAttemptDeadline(now, config.timeoutMs)
      const debug = observation.debug
      demand(debug?.levelId === policy.levelId && debug.player, 'Read-only scene observability disappeared')
      lastObservation = observation
      trajectory.push({ atMs: now, step: policy.steps[index].id, ...observation })
      const events = observationEvents(previousDebug, debug, now - previousAt)
      result.events.push(...events.map(event => ({ ...event, atMs: now, x: debug.player.x, y: debug.player.y })))
      demand(!events.some(event => ['unexplained-position-discontinuity', 'scene-clock-reset'].includes(event.kind)),
        'Unexpected discontinuity: proof invalid, inspect trajectory')
      demand(result.pageErrors.length === 0, 'Browser or local asset errors occurred')
      if (recovery) {
        const decision = observeCheckpointRecovery(policy, recovery, debug, index, now)
        if (decision.kind !== 'continue') {
          await driver.release()
          if (decision.kind === 'resume') {
            result.events.push({ ...decision.event, atMs: now, x: debug.player.x, y: debug.player.y })
            index = decision.index
            memory = {}
          } else if (decision.started) {
            result.events.push({ kind: 'checkpoint-recovery-wait', atMs: now, checkpointId: debug.checkpointId ?? null })
          }
          previousDebug = debug
          previousAt = now
          await page.waitForTimeout(config.sampleMs)
          continue
        }
      } else if (debug.respawnPending || debug.player.health <= 0 || debug.player.lives < initial.lives) {
        result.events.push({ kind: 'death-ending-attempt', atMs: now, x: debug.player.x, y: debug.player.y })
        throw new Error('Natural death ended this attempt; no restoration or warp performed')
      }
      if (hasCompletionEvidence(observation, policy.levelId, result.startedAt)) {
        assertRouteRequirements(debug, policy.requirements, 'complete')
        demand(!recovery?.recovered || observation.record.lastRun.perfectRoute === false,
          'Recovered normal completion cannot be recorded as a perfect route')
        demand(mode !== 'mastery' || hasMasteryEvidence(observation, policy, result.startedAt),
          'Mastery incomplete: ordinary completion is not all-coin/all-enemy proof')
        demand(policy.steps[index].kind === 'finish', 'Completion happened before planned route steps finished')
        result.stepsCompleted.push(policy.steps[index].id)
        result.status = 'passed'
        result.completion = observation.record.lastRun
        await driver.release()
        await page.screenshot({ path: path.join(dir, 'completion.png') })
        break
      }
      const step = policy.steps[index]
      const ending = finaleAction(observation, policy, step, result.startedAt, result.endingBeats.length)
      if (ending) {
        await driver.release()
        await page.screenshot({ path: path.join(dir, `ending-${result.endingBeats.length + 1}.png`) })
        await page.getByRole('dialog', { name: 'Dawn Relay Spire finale', exact: true })
          .getByRole('button', { name: ending.button, exact: true }).click()
        result.endingBeats.push(ending)
        inputs.push({ atMs: now, input: 'pointer', kind: 'click', label: ending.button })
        previousDebug = debug
        previousAt = now
        await page.waitForTimeout(config.sampleMs)
        continue
      }
      const effectiveStep = stepAfterCheckpointRecovery(step, recovery)
      if (effectiveStep !== step && !memory.loggedRecoveryStep) {
        result.events.push(step.kind === 'relic'
          ? { kind: 'skip-earned-detour', step: step.id, counter: step.counter, minCount: step.minCount, atMs: now }
          : { kind: 'revisit-consumed-power', step: step.id, pickupId: step.pickupId, atMs: now })
        memory.loggedRecoveryStep = true
      }
      const action = decideStep(effectiveStep, debug, memory, now)
      demand(now - memory.startedAt <= (step.timeoutMs ?? 12000), `Policy stalled at ${step.id}; this is not proof the geometry is impossible`)
      if (action.done) {
        result.stepsCompleted.push(step.id)
        result.events.push({ kind: 'step-complete', step: step.id, atMs: now, x: debug.player.x, y: debug.player.y })
        await driver.finishStep(Boolean(policy.steps[index + 1]?.crouch))
        if (config.stepScreenshots === 'all') {
          await page.screenshot({ path: path.join(dir, `step-${String(index + 1).padStart(2, '0')}-${step.id}.png`) })
        }
        memory = nextStepMemory(effectiveStep, policy.steps[index + 1], memory)
        index += 1
      } else await driver.apply(action)
      previousDebug = debug
      previousAt = now
      // Evidence capture must not force idle time between ordinary inputs.
      if (action.done && config.stepScreenshots === 'none') continue
      await page.waitForTimeout(config.sampleMs)
    }
    demand(result.status === 'passed', 'Route proof deadline expired without a results dialog and fresh completion record')
  } catch (error) {
    result.status = 'failed'
    result.failure = error.message
    result.failureKind = /Natural (death|lives)/.test(error.message) ? 'natural-death'
      : /Checkpoint recovery:/.test(error.message) ? 'invalid-recovery'
      : /Route proof deadline/.test(error.message) ? 'deadline'
      : /Mastery incomplete/.test(error.message) ? 'mastery-incomplete'
        : /Policy stalled/.test(error.message) ? 'policy-stall'
        : /discontinuity|before planned route/.test(error.message) ? 'invalid-proof'
          : /Browser or local asset/.test(error.message) ? 'runtime-or-asset-error' : 'setup-or-policy-error'
    if (driver) await driver.release().catch(() => {})
    if (page) await page.screenshot({ path: path.join(dir, 'failure.png') }).catch(() => {})
  } finally {
    if (driver) await driver.release().catch(() => {})
    await Promise.allSettled(assetJobs)
    result.finishedAt = new Date().toISOString()
    result.final = lastObservation
    result.sampleCount = trajectory.length
    result.inputCount = inputs.length
    result.deaths = result.events.filter(event => ['life-lost', 'respawn-start', 'death-ending-attempt', 'checkpoint-recovery'].includes(event.kind))
    if (result.pageErrors.length && result.status === 'passed') result.status = 'failed'
    await writeFile(path.join(dir, 'trajectory.ndjson'), trajectory.map(value => JSON.stringify(value)).join('\n') + '\n')
    await writeFile(path.join(dir, 'inputs.ndjson'), inputs.map(value => JSON.stringify(value)).join('\n') + '\n')
    await writeFile(path.join(dir, 'deaths.json'), JSON.stringify(result.deaths, null, 2))
    await writeFile(path.join(dir, 'errors.json'), JSON.stringify({ pageErrors: result.pageErrors,
      consoleErrors: result.consoleErrors, requestFailures: result.requestFailures, blockedRequests: result.blockedRequests }, null, 2))
    await writeFile(path.join(dir, 'result.json'), JSON.stringify(result, null, 2))
    await context.close()
  }
  return result
}

export async function main(argv = process.argv.slice(2)) {
  const config = parseArgs(argv)
  if (config.help) {
    console.log('node scripts/shadow-runner-route-proof.mjs --dry-run\n'
      + 'Live, only after main confirms fresh dist: --preview-ready --levels=tutorial,level-1 --profiles=android,iphone\n'
      + 'Options: --base-url=http://127.0.0.1:4176 --input=keyboard|buttons --attempts=1 --timeout-ms=90000 --sample-ms=40 --step-screenshots=none|all --run-name=name --headed\n'
      + 'L2-L6: --levels=level-5,level-6 --modes=normal,mastery --timeout-ms=240000 (L5/L6 candidates require first browser proof)\n'
      + 'L7 candidate: --levels=level-7 --modes=normal --timeout-ms=240000; requires all three Moon Shards.\n'
      + 'Additional policies: --policy-file=local.json containing {"version":1,"policies":[...]} with move/jump/fight/collect/relic/power/wait/wind-cycle/phase-cycle/finish steps.\n'
      + 'Buttons mode uses real pointer direction buttons plus keyboard actions. No synthetic multi-touch claim.\n'
      + 'Optional normal-only --recovery=checkpoint requires authored recoveryPoints (currently L10); uses natural lives and no QA restoration. Default remains deathless.\n'
      + 'No diagnostic warp mode. Existing shortcut-driven smoke tests are separate diagnostic evidence, never route proof.')
    return { status: 'help' }
  }
  let policies = [...BUILTIN_POLICIES, ...EXTENDED_ROUTE_POLICIES, ...CAUSEWAY_ROUTE_POLICIES,
    ...CATACOMB_ROUTE_POLICIES, ...CAPTAIN_ROUTE_POLICIES, ...RELAY_ROUTE_POLICIES]
  if (config.policyFile) {
    const value = JSON.parse(await readFile(path.resolve(REPO, config.policyFile), 'utf8'))
    demand(value.version === 1 && Array.isArray(value.policies), 'Policy file requires version 1 and policies array')
    value.policies.forEach(validatePolicy)
    demand(new Set(value.policies.map(policyKey)).size === value.policies.length, 'Duplicate policy levelId/mode')
    policies = [...policies.filter(policy => !value.policies.some(next => policyKey(next) === policyKey(policy))), ...value.policies]
  }
  const selected = selectPolicies(policies, config.levels, config.modes)
  if (config.recovery === 'checkpoint') selected.forEach(validateCheckpointRecovery)
  const sourceHashes = {
    scriptSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
    policiesSha256: createHash('sha256').update(await readFile(new URL('./shadow-runner-route-policies.mjs', import.meta.url))).digest('hex'),
    openingPoliciesSha256: createHash('sha256').update(await readFile(new URL('./shadow-runner-opening-route-policies.mjs', import.meta.url))).digest('hex'),
    causewayPoliciesSha256: createHash('sha256').update(await readFile(new URL('./shadow-runner-causeway-route-policies.mjs', import.meta.url))).digest('hex'),
    catacombPoliciesSha256: createHash('sha256').update(await readFile(new URL('./shadow-runner-catacomb-route-policies.mjs', import.meta.url))).digest('hex'),
    captainPoliciesSha256: createHash('sha256').update(await readFile(new URL('./shadow-runner-captain-route-policies.mjs', import.meta.url))).digest('hex'),
    relayPoliciesSha256: createHash('sha256').update(await readFile(new URL('./shadow-runner-relay-route-policies.mjs', import.meta.url))).digest('hex'),
    recoverySha256: createHash('sha256').update(await readFile(new URL('./shadow-runner-checkpoint-recovery.mjs', import.meta.url))).digest('hex'),
  }
  if (config.dryRun) {
    const report = { status: 'dry-validation-only', gameplayProven: false, config, policies: selected, ...sourceHashes }
    console.log(JSON.stringify(report, null, 2))
    return report
  }
  demand(config.previewReady, 'Live run requires --preview-ready after coordinating fresh dist at4176 with main; no build is performed here')
  const output = path.join(REPO, 'output', 'playwright', config.runName)
  await mkdir(path.dirname(output), { recursive: true })
  await mkdir(output) // Refuse to overwrite a previous proof run.
  const report = { proofType: 'real-input', startedAt: new Date().toISOString(), config, policies: selected,
    scope: 'Bounded real-input attempts with separate ordinary and all-coin/all-enemy mastery criteria. Not complete campaign or physical-phone proof.',
    ...sourceHashes,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(), results: [],
  }
  const playwright = await import('playwright')
  try {
    for (const profile of config.profiles) {
      const browser = await playwright[PROFILES[profile].engine].launch({ headless: !config.headed })
      try {
        for (const policy of selected) {
          for (let attempt = 1; attempt <= config.attempts; attempt += 1) {
            const result = await runAttempt(browser, config, profile, policy, attempt, output)
            report.results.push(result)
            console.log(`${profile} ${policy.levelId} ${policy.mode ?? 'normal'} attempt${attempt}: ${result.status}${result.failure ? `; ${result.failure}` : ''}`)
            await writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
            if (result.status === 'passed') break
          }
        }
      } finally { await browser.close() }
    }
  } catch (error) {
    report.infrastructureError = error.message
  } finally {
    report.finishedAt = new Date().toISOString()
    report.cases = config.profiles.flatMap(profile => selected.map(policy => {
      const mode = policy.mode ?? 'normal'
      const attempts = report.results.filter(result => result.profile === profile && result.levelId === policy.levelId && result.mode === mode)
      return { profile, levelId: policy.levelId, mode, status: attempts.some(result => result.status === 'passed')
        ? attempts.length > 1 ? 'passed-after-retry' : 'passed' : 'failed', attempts: attempts.length }
    }))
    report.status = report.infrastructureError || report.cases.some(result => result.status === 'failed') ? 'failed' : 'passed'
    await writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
  }
  console.log(`Evidence: ${output}`)
  if (report.status !== 'passed') process.exitCode = 1
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
