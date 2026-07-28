import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import { SHADOW_RUNNER_LEVEL_EIGHT } from './levelEight'
import {
  SHADOW_RUNNER_LEVEL_NINE,
  SHADOW_RUNNER_LEVEL_NINE_ASSETS,
} from './levelNine'

export interface ShadowRunnerRect {
  id: string
  x: number
  y: number
  width: number
  height: number
  visualId?: string
  terrainSet?: 'stone' | 'ivy' | 'bell' | 'candle' | 'candleBright' | 'candleShelf' | 'clock' | 'moon' | 'catacomb' | 'spectral' | 'captain'
  hidden?: boolean
  damage?: number
}

export interface ShadowRunnerTiltPlatform extends ShadowRunnerRect {
  visualHeight?: number
  visualOffsetY?: number
  wobbleDurationMs?: number
  wobbleRotation?: number
  slideForce?: number
  maxSlideSpeed?: number
}

export interface ShadowRunnerPoint {
  id: string
  x: number
  y: number
}

export interface ShadowRunnerCheckpoint extends ShadowRunnerPoint {
  label: string
  triggerWidth?: number
  minY?: number
  maxY?: number
}

export interface ShadowRunnerBodyBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export interface ShadowRunnerBoostPickup extends ShadowRunnerPoint {
  scoreValue?: number
  durationMs?: number
  guardCharges?: number
}

export interface ShadowRunnerShieldPickup extends ShadowRunnerPoint {
  scoreValue?: number
  durationMs?: number
  guardCharges?: number
}

export interface ShadowRunnerChronoPickup extends ShadowRunnerPoint {
  scoreValue?: number
  durationMs?: number
  healthRestore?: number
  timeScale?: number
}

export interface ShadowRunnerSurgePickup extends ShadowRunnerPoint {
  scoreValue?: number
  durationMs?: number
  healthRestore?: number
  guardCharges?: number
  speedMultiplier?: number
}

export interface ShadowRunnerMoonShardPickup extends ShadowRunnerPoint {
  scoreValue?: number
}

export interface ShadowRunnerObjectivePickup extends ShadowRunnerPoint {
  scoreValue?: number
}

export interface ShadowRunnerMasteryPickup extends ShadowRunnerPoint {
  scoreValue?: number
  requiredPower?: ShadowRunnerMasteryPower
}

export interface ShadowRunnerWraithlightPickup extends ShadowRunnerPoint {
  scoreValue?: number
  durationMs?: number
  healthRestore?: number
}

export interface ShadowRunnerMirrorWardPickup extends ShadowRunnerPoint {
  scoreValue?: number
  durationMs?: number
  reflectionCharges?: number
}

export interface ShadowRunnerCrouchGate extends ShadowRunnerRect {
  visualFrame?: number
  visualWidth?: number
  visualHeight?: number
  visualOffsetY?: number
}

export interface ShadowRunnerArrowVolley extends ShadowRunnerRect {
  direction: 1 | -1
  spawnX: number
  laneY: number
  intervalMs?: number
  delayMs?: number
  speed?: number
  lifetimeMs?: number
  damage?: number
}

export type ShadowRunnerMasteryPower = 'gale-mantle' | 'sunsteel-edge'

export interface ShadowRunnerWindZone extends ShadowRunnerRect {
  direction: 1 | -1
  force: number
  cadenceMs: number
  tellDurationMs: number
  activeDurationMs: number
  crouchForceMultiplier: number
}

export interface ShadowRunnerMovingPlatform extends ShadowRunnerRect {
  endX?: number
  endY: number
  speed: number
  pauseMs: number
}

export interface ShadowRunnerGaleMantlePickup extends ShadowRunnerPoint {
  scoreValue?: number
  durationMs: number
  healthRestore: number
  speedMultiplier: number
  fallDamageCap: number
}

export interface ShadowRunnerSunsteelEdgePickup extends ShadowRunnerPoint {
  scoreValue?: number
  durationMs: number
  healthRestore: number
  charges: number
  attackDamageBonus: number
  guardDamage: number
  reachBonus: number
}

export interface ShadowRunnerFinishRequirementText {
  missingObjectives: string
  missingRequiredEnemies: string
  missingObjectivesAndEnemies: string
}

export interface ShadowRunnerBossPhaseConfig {
  id: string
  label: string
  healthAtOrBelow: number
  guard?: number
  attackCooldownMs?: number
  patrolSpeedMultiplier?: number
  chargeCount?: number
}

export type ShadowRunnerEnemyKind =
  | 'clockwork-sentry'
  | 'lantern-bandit-scout'
  | 'barrel-roller'
  | 'scroll-thief'
  | 'tower-archer'
  | 'candle-jester'
  | 'moon-stalker'
  | 'tomb-lurker'
  | 'crypt-warden'
  | 'rival-courier'
  | 'gate-pikeman'
  | 'storm-grenadier'
  | 'moonlit-captain'

export interface ShadowRunnerEnemyConfig extends ShadowRunnerPoint {
  kind: ShadowRunnerEnemyKind
  health: number
  maxHealth: number
  patrolLeft: number
  patrolRight: number
  direction: 1 | -1
  patrolSpeed?: number
  attackRange?: number
  attackCooldownMs?: number
  projectileSpeed?: number
  contactDamage?: number
  projectileDamage?: number
  guard?: number
  encounterId?: string
  projectileArcHeight?: number
  projectileWarningMs?: number
  hazardDurationMs?: number
  bossPhases?: ShadowRunnerBossPhaseConfig[]
}

export interface ShadowRunnerEncounterConfig extends ShadowRunnerRect {
  enemyIds: string[]
  sealed?: boolean
}

export type ShadowRunnerPlayableLevelId =
  | 'tutorial'
  | 'level-1'
  | 'level-2'
  | 'level-3'
  | 'level-4'
  | 'level-5'
  | 'level-6'
  | 'level-7'
  | 'level-8'
  | 'level-9'

export interface ShadowRunnerLevelConfig {
  id: ShadowRunnerPlayableLevelId
  campaignLevel?: number
  title: string
  subtitle: string
  objective: string
  introLine?: string
  completionLine: string
  backgroundAsset: string
  worldWidth: number
  worldHeight: number
  playerStart: ShadowRunnerPoint
  checkpoints?: ShadowRunnerCheckpoint[]
  platforms: ShadowRunnerRect[]
  tiltPlatforms: ShadowRunnerTiltPlatform[]
  crouchGates?: ShadowRunnerCrouchGate[]
  spikes: ShadowRunnerRect[]
  coins: ShadowRunnerPoint[]
  boosts?: ShadowRunnerBoostPickup[]
  shieldPickups?: ShadowRunnerShieldPickup[]
  chronoPickups?: ShadowRunnerChronoPickup[]
  surgePickups?: ShadowRunnerSurgePickup[]
  moonShardPickups?: ShadowRunnerMoonShardPickup[]
  objectiveLabel?: string
  objectivePickups?: ShadowRunnerObjectivePickup[]
  masteryLabel?: string
  masteryPickups?: ShadowRunnerMasteryPickup[]
  wraithlightPickups?: ShadowRunnerWraithlightPickup[]
  mirrorWardPickups?: ShadowRunnerMirrorWardPickup[]
  galeMantlePickups?: ShadowRunnerGaleMantlePickup[]
  sunsteelEdgePickups?: ShadowRunnerSunsteelEdgePickup[]
  spectralPlatforms?: ShadowRunnerRect[]
  windZones?: ShadowRunnerWindZone[]
  movingPlatforms?: ShadowRunnerMovingPlatform[]
  requiredEnemyIds?: string[]
  finishRequirementText?: ShadowRunnerFinishRequirementText
  encounters?: ShadowRunnerEncounterConfig[]
  arrowVolleys?: ShadowRunnerArrowVolley[]
  enemy?: ShadowRunnerEnemyConfig
  enemies?: ShadowRunnerEnemyConfig[]
  finish: ShadowRunnerRect
}

export interface ShadowRunnerCampaignLevel {
  id: string
  levelNumber: number
  title: string
  objective: string
  difficultyTier: number
  difficultyLabel: string
  routeType: string
  mechanicPreview: string
  thumbnail: string
  locationButton: string
  mapPosition: {
    left: number
    top: number
  }
  playableLevelId?: ShadowRunnerPlayableLevelId
}

const BASE_BACKGROUND = SHADOW_RUNNER_ASSETS.home.background

export const SHADOW_RUNNER_TUTORIAL_LEVEL: ShadowRunnerLevelConfig = {
  id: 'tutorial',
  title: 'Tutorial Run',
  subtitle: 'Learn The Route',
  objective: 'Reach the east gate',
  introLine: 'Learn the courier steps before the moon road opens.',
  completionLine: 'The first shadow route is open.',
  backgroundAsset: BASE_BACKGROUND,
  worldWidth: 1580,
  worldHeight: 540,
  playerStart: { id: 'start', x: 112, y: 404 },
  finish: { id: 'east-gate', x: 1430, y: 282, width: 74, height: 150 },
  platforms: [
    { id: 'west-walkway', x: 0, y: 432, width: 520, height: 72 },
    { id: 'broken-step-a', x: 638, y: 398, width: 148, height: 42 },
    { id: 'broken-step-b', x: 890, y: 368, width: 182, height: 42 },
    { id: 'east-ledge', x: 1192, y: 404, width: 388, height: 76 },
  ],
  tiltPlatforms: [
    { id: 'tilt-bridge', x: 1020, y: 354, width: 168, height: 28, visualHeight: 54, visualOffsetY: -12, wobbleDurationMs: 1250, wobbleRotation: 0.075 },
  ],
  spikes: [
    { id: 'pit-spikes', x: 532, y: 486, width: 132, height: 28 },
  ],
  coins: [
    { id: 'coin-1', x: 330, y: 338 },
    { id: 'coin-2', x: 690, y: 318 },
    { id: 'coin-3', x: 950, y: 292 },
    { id: 'coin-4', x: 1240, y: 322 },
  ],
}

export const SHADOW_RUNNER_FULL_LEVEL_ONE: ShadowRunnerLevelConfig = {
  id: 'level-1',
  campaignLevel: 1,
  title: 'East Gate Run',
  subtitle: 'Campaign Route 1',
  objective: 'Reach the east gate',
  introLine: 'Carry the sealed letter through the first broken gate.',
  completionLine: 'East Gate cleared. The first seal is still warm.',
  backgroundAsset: BASE_BACKGROUND,
  worldWidth: 2920,
  worldHeight: 540,
  playerStart: { id: 'start', x: 112, y: 404 },
  checkpoints: [
    { id: 'east-gate-midpoint', label: 'Courtyard', x: 1950, y: 404 },
  ],
  enemies: [
    {
      id: 'gate-clockwork-sentry',
      kind: 'clockwork-sentry',
      x: 1480,
      y: 392,
      health: 3,
      maxHealth: 3,
      patrolLeft: 1240,
      patrolRight: 1600,
      direction: -1,
    },
    {
      id: 'courtyard-clockwork-sentry',
      kind: 'clockwork-sentry',
      x: 2405,
      y: 392,
      health: 3,
      maxHealth: 3,
      patrolLeft: 2305,
      patrolRight: 2640,
      direction: 1,
    },
  ],
  finish: { id: 'east-gate', x: 2762, y: 282, width: 74, height: 150 },
  platforms: [
    { id: 'west-walkway', x: 0, y: 432, width: 520, height: 72 },
    { id: 'broken-step-a', x: 612, y: 400, width: 148, height: 42 },
    { id: 'broken-step-b', x: 850, y: 366, width: 182, height: 42 },
    { id: 'center-walkway', x: 1130, y: 432, width: 690, height: 72 },
    { id: 'east-ledge', x: 1910, y: 404, width: 330, height: 76 },
    { id: 'final-walkway', visualId: 'center-walkway', x: 2350, y: 432, width: 570, height: 72 },
    { id: 'upper-coin-shelf', x: 1325, y: 286, width: 170, height: 34 },
  ],
  tiltPlatforms: [
    { id: 'tilt-bridge', x: 1038, y: 354, width: 168, height: 28, visualHeight: 54, visualOffsetY: -12, wobbleDurationMs: 1150, wobbleRotation: 0.08, slideForce: 860, maxSlideSpeed: 92 },
    { id: 'courtyard-tilt-bridge', x: 2186, y: 374, width: 156, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 1040, wobbleRotation: 0.095, slideForce: 930, maxSlideSpeed: 104 },
  ],
  spikes: [
    { id: 'pit-spikes', x: 532, y: 486, width: 196, height: 28 },
    { id: 'sentry-spikes', x: 1708, y: 414, width: 70, height: 24 },
    { id: 'courtyard-gap-spikes', x: 2254, y: 486, width: 104, height: 28 },
  ],
  coins: [
    { id: 'coin-1', x: 330, y: 338 },
    { id: 'coin-2', x: 675, y: 318 },
    { id: 'coin-3', x: 920, y: 288 },
    { id: 'coin-4', x: 1102, y: 270 },
    { id: 'coin-5', x: 1368, y: 232 },
    { id: 'coin-6', x: 1448, y: 232 },
    { id: 'coin-7', x: 1960, y: 322 },
    { id: 'coin-8', x: 2218, y: 286 },
    { id: 'coin-9', x: 2460, y: 338 },
    { id: 'coin-10', x: 2688, y: 338 },
  ],
}

export const SHADOW_RUNNER_LEVEL_TWO: ShadowRunnerLevelConfig = {
  id: 'level-2',
  campaignLevel: 2,
  title: 'Lantern Market Roofs',
  subtitle: 'Campaign Route 2',
  objective: 'Cross the market roofs',
  introLine: 'Cross the lantern roofs before the clockwork patrols tighten.',
  completionLine: 'Lantern Market cleared. A second route marker glows.',
  backgroundAsset: SHADOW_RUNNER_ASSETS.levels.lanternMarketBackground,
  worldWidth: 3420,
  worldHeight: 540,
  playerStart: { id: 'start', x: 120, y: 396 },
  checkpoints: [
    { id: 'market-midpoint', label: 'Upper Market', x: 2268, y: 390 },
  ],
  enemies: [
    {
      id: 'market-roof-sentry-a',
      kind: 'clockwork-sentry',
      x: 1518,
      y: 386,
      health: 3,
      maxHealth: 3,
      patrolLeft: 1365,
      patrolRight: 1570,
      direction: -1,
    },
    {
      id: 'market-roof-sentry-b',
      kind: 'clockwork-sentry',
      x: 2385,
      y: 374,
      health: 3,
      maxHealth: 3,
      patrolLeft: 2250,
      patrolRight: 2635,
      direction: 1,
    },
    {
      id: 'market-gate-sentry',
      kind: 'clockwork-sentry',
      x: 3025,
      y: 380,
      health: 4,
      maxHealth: 4,
      patrolLeft: 2925,
      patrolRight: 3225,
      direction: -1,
    },
  ],
  finish: { id: 'market-east-gate', x: 3294, y: 280, width: 74, height: 150 },
  platforms: [
    { id: 'west-walkway', x: 0, y: 424, width: 430, height: 72 },
    { id: 'broken-step-a', x: 542, y: 378, width: 156, height: 42 },
    { id: 'broken-step-b', x: 790, y: 340, width: 190, height: 42 },
    { id: 'center-walkway', x: 1110, y: 412, width: 450, height: 72 },
    { id: 'upper-coin-shelf', x: 1340, y: 284, width: 182, height: 34 },
    { id: 'market-roof-a', visualId: 'center-walkway', x: 1650, y: 408, width: 410, height: 72 },
    { id: 'market-roof-b', visualId: 'east-ledge', x: 2230, y: 390, width: 470, height: 76 },
    { id: 'market-roof-c', visualId: 'center-walkway', x: 2920, y: 398, width: 500, height: 72 },
  ],
  tiltPlatforms: [
    { id: 'tilt-bridge', x: 992, y: 330, width: 168, height: 28, visualHeight: 54, visualOffsetY: -12, wobbleDurationMs: 980, wobbleRotation: 0.1, slideForce: 960, maxSlideSpeed: 118 },
    { id: 'tilt-bridge-2', x: 2050, y: 348, width: 158, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 900, wobbleRotation: 0.12, slideForce: 1040, maxSlideSpeed: 136 },
    { id: 'tilt-bridge-3', x: 2720, y: 358, width: 162, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 840, wobbleRotation: 0.13, slideForce: 1120, maxSlideSpeed: 150 },
  ],
  spikes: [
    { id: 'market-gap-spikes', x: 430, y: 424, width: 180, height: 28 },
    { id: 'market-bridge-spikes-a', x: 984, y: 438, width: 116, height: 28 },
    { id: 'market-sentry-spikes', x: 1898, y: 384, width: 126, height: 24 },
    { id: 'market-bridge-spikes-b', x: 2075, y: 438, width: 136, height: 28 },
    { id: 'market-final-spikes', x: 2718, y: 438, width: 156, height: 28 },
  ],
  coins: [
    { id: 'coin-1', x: 288, y: 332 },
    { id: 'coin-2', x: 600, y: 292 },
    { id: 'coin-3', x: 850, y: 252 },
    { id: 'coin-4', x: 1080, y: 250 },
    { id: 'coin-5', x: 1385, y: 232 },
    { id: 'coin-6', x: 1475, y: 232 },
    { id: 'coin-7', x: 1715, y: 314 },
    { id: 'coin-8', x: 2240, y: 318 },
    { id: 'coin-9', x: 2398, y: 304 },
    { id: 'coin-10', x: 2728, y: 278 },
    { id: 'coin-11', x: 3025, y: 308 },
    { id: 'coin-12', x: 3210, y: 308 },
  ],
}

export const SHADOW_RUNNER_LEVEL_THREE: ShadowRunnerLevelConfig = {
  id: 'level-3',
  campaignLevel: 3,
  title: 'Ivy Viaduct',
  subtitle: 'Campaign Route 3',
  objective: 'Cross the ivy viaduct',
  introLine: 'Keep moving when the old bridge tilts.',
  completionLine: 'Ivy Viaduct holds. The sealed road remembers the Runner.',
  backgroundAsset: SHADOW_RUNNER_ASSETS.levels.ivyViaductBackground,
  worldWidth: 4720,
  worldHeight: 540,
  playerStart: { id: 'start', x: 118, y: 400 },
  checkpoints: [
    { id: 'viaduct-midpoint', label: 'Center Arch', x: 2424, y: 412 },
    { id: 'viaduct-final-run', label: 'East Viaduct', x: 3618, y: 404 },
  ],
  enemies: [
    {
      id: 'viaduct-barrel-a',
      kind: 'barrel-roller',
      x: 930,
      y: 370,
      health: 2,
      maxHealth: 2,
      patrolLeft: 918,
      patrolRight: 1158,
      direction: 1,
      patrolSpeed: 126,
    },
    {
      id: 'viaduct-barrel-b',
      kind: 'barrel-roller',
      x: 1790,
      y: 388,
      health: 2,
      maxHealth: 2,
      patrolLeft: 1548,
      patrolRight: 1954,
      direction: -1,
      patrolSpeed: 142,
    },
    {
      id: 'viaduct-sentry',
      kind: 'clockwork-sentry',
      x: 2600,
      y: 382,
      health: 3,
      maxHealth: 3,
      patrolLeft: 2460,
      patrolRight: 2770,
      direction: -1,
      patrolSpeed: 88,
    },
    {
      id: 'viaduct-barrel-c',
      kind: 'barrel-roller',
      x: 3260,
      y: 392,
      health: 3,
      maxHealth: 3,
      patrolLeft: 3065,
      patrolRight: 3500,
      direction: 1,
      patrolSpeed: 154,
    },
    {
      id: 'viaduct-final-barrel',
      kind: 'barrel-roller',
      x: 4260,
      y: 390,
      health: 3,
      maxHealth: 3,
      patrolLeft: 4140,
      patrolRight: 4495,
      direction: -1,
      patrolSpeed: 168,
    },
  ],
  finish: { id: 'viaduct-east-gate', x: 4552, y: 280, width: 74, height: 150 },
  platforms: [
    { id: 'ivy-west-walkway', x: 0, y: 428, width: 560, height: 72, terrainSet: 'ivy' },
    { id: 'ivy-stone-step-a', x: 652, y: 392, width: 170, height: 42, terrainSet: 'ivy' },
    { id: 'ivy-barrel-lane-a', visualId: 'ivy-bridge-a', x: 890, y: 420, width: 330, height: 64, terrainSet: 'ivy' },
    { id: 'ivy-upper-shelf-a', x: 1135, y: 284, width: 176, height: 34, terrainSet: 'ivy' },
    { id: 'ivy-plank-lane-a', visualId: 'ivy-plank-a', x: 1480, y: 416, width: 520, height: 58, terrainSet: 'ivy' },
    { id: 'ivy-stone-step-b', visualId: 'ivy-stone-step-a', x: 2110, y: 376, width: 168, height: 42, terrainSet: 'ivy' },
    { id: 'ivy-sentry-lane', visualId: 'ivy-center-arch', x: 2390, y: 412, width: 470, height: 72, terrainSet: 'ivy' },
    { id: 'ivy-plank-lane-b', visualId: 'ivy-plank-b', x: 3000, y: 424, width: 520, height: 58, terrainSet: 'ivy' },
    { id: 'ivy-final-ledge', visualId: 'ivy-east-ledge', x: 3588, y: 404, width: 256, height: 76, terrainSet: 'ivy' },
    { id: 'ivy-final-step', visualId: 'ivy-stone-step-a', x: 3868, y: 372, width: 160, height: 42, terrainSet: 'ivy' },
    { id: 'ivy-final-run', visualId: 'ivy-plank-b', x: 4100, y: 416, width: 560, height: 58, terrainSet: 'ivy' },
  ],
  tiltPlatforms: [
    { id: 'ivy-tilt-bridge-a', x: 1286, y: 352, width: 166, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 920, wobbleRotation: 0.13, slideForce: 1240, maxSlideSpeed: 162 },
    { id: 'ivy-tilt-bridge-b', x: 2288, y: 348, width: 158, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 780, wobbleRotation: 0.15, slideForce: 1380, maxSlideSpeed: 184 },
    { id: 'ivy-tilt-bridge-c', x: 2862, y: 360, width: 150, height: 28, visualHeight: 50, visualOffsetY: -12, wobbleDurationMs: 720, wobbleRotation: 0.165, slideForce: 1500, maxSlideSpeed: 204 },
    { id: 'ivy-final-tilt-bridge', x: 3710, y: 350, width: 158, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 680, wobbleRotation: 0.18, slideForce: 1640, maxSlideSpeed: 226 },
  ],
  spikes: [
    { id: 'ivy-start-spikes', x: 538, y: 438, width: 112, height: 28 },
    { id: 'ivy-bridge-spikes-a', x: 1216, y: 438, width: 92, height: 28 },
    { id: 'ivy-bridge-spikes-b', x: 1452, y: 438, width: 72, height: 28 },
    { id: 'ivy-mid-spikes', x: 2006, y: 438, width: 102, height: 28 },
    { id: 'ivy-tilt-spikes-b', x: 2448, y: 438, width: 98, height: 28 },
    { id: 'ivy-sentry-spikes', x: 2784, y: 394, width: 76, height: 24 },
    { id: 'ivy-final-spikes', x: 3512, y: 438, width: 74, height: 28 },
    { id: 'ivy-final-bridge-spikes', x: 3868, y: 438, width: 118, height: 28 },
    { id: 'ivy-gate-spikes', x: 4564, y: 438, width: 68, height: 28 },
  ],
  coins: [
    { id: 'coin-1', x: 310, y: 338 },
    { id: 'coin-2', x: 710, y: 310 },
    { id: 'coin-3', x: 1038, y: 324 },
    { id: 'coin-4', x: 1210, y: 232 },
    { id: 'coin-5', x: 1392, y: 278 },
    { id: 'coin-6', x: 1660, y: 318 },
    { id: 'coin-7', x: 1940, y: 318 },
    { id: 'coin-8', x: 2308, y: 284 },
    { id: 'coin-9', x: 2570, y: 314 },
    { id: 'coin-10', x: 2888, y: 286 },
    { id: 'coin-11', x: 3210, y: 332 },
    { id: 'coin-12', x: 3440, y: 332 },
    { id: 'coin-13', x: 3748, y: 276 },
    { id: 'coin-14', x: 3925, y: 306 },
    { id: 'coin-15', x: 4220, y: 320 },
    { id: 'coin-16', x: 4460, y: 320 },
  ],
}

export const SHADOW_RUNNER_LEVEL_FOUR: ShadowRunnerLevelConfig = {
  id: 'level-4',
  campaignLevel: 4,
  title: 'Bell Tower Archives',
  subtitle: 'Campaign Route 4',
  objective: 'Find the forged order',
  introLine: 'Find forged records. Crouch low. Watch arrows.',
  completionLine: 'Bell Tower cleared. The forged line is in your satchel.',
  backgroundAsset: SHADOW_RUNNER_ASSETS.levels.bellTowerBackground,
  worldWidth: 6120,
  worldHeight: 540,
  playerStart: { id: 'start', x: 118, y: 398 },
  checkpoints: [
    { id: 'archive-mid-landing', label: 'Archive Landing', x: 2110, y: 390 },
    { id: 'archive-thief-lane', label: 'Record Hall', x: 4080, y: 400 },
    { id: 'archive-gauntlet', label: 'Upper Archive', x: 4900, y: 420 },
  ],
  enemies: [
    {
      id: 'archive-sentry-a',
      kind: 'clockwork-sentry',
      x: 1580,
      y: 386,
      health: 4,
      maxHealth: 4,
      patrolLeft: 1455,
      patrolRight: 1845,
      direction: -1,
      patrolSpeed: 94,
    },
    {
      id: 'archive-tower-archer-a',
      kind: 'tower-archer',
      x: 2578,
      y: 312,
      health: 3,
      maxHealth: 3,
      patrolLeft: 2528,
      patrolRight: 2628,
      direction: -1,
      patrolSpeed: 0,
      attackRange: 620,
      attackCooldownMs: 1220,
      projectileSpeed: 430,
    },
    {
      id: 'archive-barrel-roller',
      kind: 'barrel-roller',
      x: 3045,
      y: 390,
      health: 3,
      maxHealth: 3,
      patrolLeft: 2895,
      patrolRight: 3280,
      direction: 1,
      patrolSpeed: 168,
    },
    {
      id: 'archive-scroll-thief-a',
      kind: 'scroll-thief',
      x: 4165,
      y: 366,
      health: 2,
      maxHealth: 2,
      patrolLeft: 4038,
      patrolRight: 4405,
      direction: -1,
      patrolSpeed: 176,
    },
    {
      id: 'archive-tower-archer-b',
      kind: 'tower-archer',
      x: 4630,
      y: 294,
      health: 4,
      maxHealth: 4,
      patrolLeft: 4575,
      patrolRight: 4690,
      direction: -1,
      patrolSpeed: 0,
      attackRange: 680,
      attackCooldownMs: 1080,
      projectileSpeed: 470,
    },
    {
      id: 'archive-sentry-b',
      kind: 'clockwork-sentry',
      x: 5050,
      y: 386,
      health: 4,
      maxHealth: 4,
      patrolLeft: 4870,
      patrolRight: 5265,
      direction: 1,
      patrolSpeed: 106,
    },
    {
      id: 'archive-scroll-thief-b',
      kind: 'scroll-thief',
      x: 5485,
      y: 346,
      health: 3,
      maxHealth: 3,
      patrolLeft: 5390,
      patrolRight: 5650,
      direction: -1,
      patrolSpeed: 188,
    },
  ],
  finish: { id: 'bell-tower-seal', x: 5968, y: 280, width: 74, height: 150 },
  platforms: [
    { id: 'bell-start-walkway', visualId: 'bell-long-ledge', x: 0, y: 424, width: 405, height: 72, terrainSet: 'bell' },
    { id: 'bell-crouch-floor-a', visualId: 'bell-long-ledge', x: 430, y: 424, width: 420, height: 72, terrainSet: 'bell' },
    { id: 'bell-hidden-crouch-step-a', x: 444, y: 348, width: 64, height: 12, hidden: true },
    { id: 'bell-step-a', visualId: 'bell-small-ledge', x: 940, y: 388, width: 220, height: 44, terrainSet: 'bell' },
    { id: 'bell-sentry-run', visualId: 'bell-long-ledge', x: 1440, y: 420, width: 510, height: 72, terrainSet: 'bell' },
    { id: 'bell-risk-shelf-a', visualId: 'bell-scroll-shelf', x: 1682, y: 284, width: 188, height: 38, terrainSet: 'bell' },
    { id: 'bell-mid-landing', visualId: 'bell-wide-ledge', x: 2076, y: 390, width: 342, height: 70, terrainSet: 'bell' },
    { id: 'bell-archer-perch-a', visualId: 'bell-small-block', x: 2504, y: 348, width: 238, height: 50, terrainSet: 'bell' },
    { id: 'bell-barrel-lane', visualId: 'bell-long-ledge', x: 2880, y: 424, width: 445, height: 72, terrainSet: 'bell' },
    { id: 'bell-crouch-floor-b', visualId: 'bell-wide-ledge', x: 3360, y: 424, width: 438, height: 72, terrainSet: 'bell' },
    { id: 'bell-hidden-crouch-step-b', x: 3364, y: 348, width: 64, height: 12, hidden: true },
    { id: 'bell-thief-lane', visualId: 'bell-wood-platform', x: 4040, y: 400, width: 382, height: 58, terrainSet: 'bell' },
    { id: 'bell-archer-perch-b', visualId: 'bell-small-ledge', x: 4560, y: 332, width: 264, height: 46, terrainSet: 'bell' },
    { id: 'bell-gauntlet-floor', visualId: 'bell-long-ledge', x: 4860, y: 420, width: 460, height: 72, terrainSet: 'bell' },
    { id: 'bell-final-step', visualId: 'bell-small-block', x: 5400, y: 382, width: 260, height: 48, terrainSet: 'bell' },
    { id: 'bell-final-walkway', visualId: 'bell-wide-ledge', x: 5708, y: 424, width: 412, height: 72, terrainSet: 'bell' },
  ],
  tiltPlatforms: [
    { id: 'bell-tilt-bridge-a', x: 1216, y: 356, width: 158, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 720, wobbleRotation: 0.17, slideForce: 1540, maxSlideSpeed: 218 },
    { id: 'bell-tilt-bridge-b', x: 3824, y: 346, width: 148, height: 28, visualHeight: 50, visualOffsetY: -12, wobbleDurationMs: 650, wobbleRotation: 0.19, slideForce: 1720, maxSlideSpeed: 240 },
    { id: 'bell-final-tilt', x: 5280, y: 348, width: 142, height: 28, visualHeight: 50, visualOffsetY: -12, wobbleDurationMs: 610, wobbleRotation: 0.2, slideForce: 1800, maxSlideSpeed: 255 },
  ],
  crouchGates: [
    { id: 'bell-low-archive-lintel-a', x: 512, y: 232, width: 286, height: 158 },
    { id: 'bell-low-archive-lintel-b', x: 3432, y: 232, width: 320, height: 158 },
  ],
  spikes: [
    { id: 'bell-start-pit', x: 850, y: 440, width: 104, height: 28 },
    { id: 'bell-tilt-pit-a', x: 1168, y: 440, width: 78, height: 28 },
    { id: 'bell-tilt-pit-b', x: 1368, y: 440, width: 76, height: 28 },
    { id: 'bell-sentry-spikes', x: 1908, y: 402, width: 48, height: 24 },
    { id: 'bell-archive-gap-a', x: 2422, y: 440, width: 78, height: 28 },
    { id: 'bell-barrel-warning', x: 3272, y: 440, width: 78, height: 28 },
    { id: 'bell-crouch-exit-spikes', x: 3796, y: 440, width: 64, height: 28 },
    { id: 'bell-thief-lane-spikes', x: 4408, y: 412, width: 54, height: 24 },
    { id: 'bell-archer-drop-spikes', x: 4818, y: 440, width: 54, height: 28 },
    { id: 'bell-gauntlet-spikes', x: 5318, y: 438, width: 76, height: 28 },
    { id: 'bell-final-spikes', x: 5658, y: 438, width: 58, height: 28 },
  ],
  coins: [
    { id: 'coin-1', x: 292, y: 334 },
    { id: 'coin-2', x: 602, y: 404 },
    { id: 'coin-3', x: 724, y: 404 },
    { id: 'coin-4', x: 1034, y: 302 },
    { id: 'coin-5', x: 1288, y: 278 },
    { id: 'coin-6', x: 1512, y: 332 },
    { id: 'coin-7', x: 1745, y: 226 },
    { id: 'coin-8', x: 1842, y: 226 },
    { id: 'coin-9', x: 2180, y: 308 },
    { id: 'coin-10', x: 2360, y: 308 },
    { id: 'coin-11', x: 2572, y: 272 },
    { id: 'coin-12', x: 3010, y: 332 },
    { id: 'coin-13', x: 3208, y: 332 },
    { id: 'coin-14', x: 3520, y: 404 },
    { id: 'coin-15', x: 3678, y: 404 },
    { id: 'coin-16', x: 3900, y: 276 },
    { id: 'coin-17', x: 4155, y: 314 },
    { id: 'coin-18', x: 4328, y: 314 },
    { id: 'coin-19', x: 4616, y: 272 },
    { id: 'coin-20', x: 4978, y: 330 },
    { id: 'coin-21', x: 5178, y: 330 },
    { id: 'coin-22', x: 5340, y: 270 },
    { id: 'coin-23', x: 5492, y: 304 },
    { id: 'coin-24', x: 5888, y: 330 },
    { id: 'coin-25', x: 560, y: 188 },
    { id: 'coin-26', x: 646, y: 170 },
    { id: 'coin-27', x: 746, y: 188 },
    { id: 'coin-28', x: 3468, y: 188 },
    { id: 'coin-29', x: 3568, y: 170 },
    { id: 'coin-30', x: 3690, y: 188 },
  ],
  boosts: [
    { id: 'moonheart-crest-high-archive', x: 1768, y: 222, scoreValue: 140, durationMs: 8800, guardCharges: 2 },
    { id: 'moonheart-crest-archer-perch', x: 4644, y: 272, scoreValue: 140, durationMs: 7600, guardCharges: 2 },
  ],
}

export const SHADOW_RUNNER_LEVEL_FIVE: ShadowRunnerLevelConfig = {
  id: 'level-5',
  campaignLevel: 5,
  title: 'Candle Fair Ruins',
  subtitle: 'Campaign Route 5',
  objective: 'Slip through the fair',
  introLine: 'Shield up. Stay low. Pick coin risks.',
  completionLine: 'Candle Fair cleared. The ruined route is yours.',
  backgroundAsset: SHADOW_RUNNER_ASSETS.levels.candleFairBackground,
  worldWidth: 8900,
  worldHeight: 720,
  playerStart: { id: 'start', x: 118, y: 552 },
  checkpoints: [
    { id: 'fair-first-volley', label: 'Fair Entrance', x: 2158, y: 584 },
    { id: 'fair-high-route', label: 'Candle Walk', x: 4420, y: 614 },
    { id: 'fair-gauntlet', label: 'Ruined Gauntlet', x: 6226, y: 520 },
    { id: 'fair-final-entry', label: 'East Gate Approach', x: 8050, y: 584 },
  ],
  enemies: [
    {
      id: 'fair-start-sentry',
      kind: 'clockwork-sentry',
      x: 1160,
      y: 548,
      health: 3,
      maxHealth: 3,
      patrolLeft: 1080,
      patrolRight: 1268,
      direction: -1,
      patrolSpeed: 98,
    },
    {
      id: 'fair-bridge-barrel',
      kind: 'barrel-roller',
      x: 1782,
      y: 548,
      health: 3,
      maxHealth: 3,
      patrolLeft: 1744,
      patrolRight: 1904,
      direction: 1,
      patrolSpeed: 158,
    },
    {
      id: 'fair-candle-jester-a',
      kind: 'candle-jester',
      x: 3565,
      y: 548,
      health: 3,
      maxHealth: 3,
      patrolLeft: 3404,
      patrolRight: 3744,
      direction: -1,
      patrolSpeed: 92,
      attackRange: 350,
      attackCooldownMs: 1320,
      projectileSpeed: 300,
    },
    {
      id: 'fair-scroll-thief-a',
      kind: 'scroll-thief',
      x: 3990,
      y: 548,
      health: 3,
      maxHealth: 3,
      patrolLeft: 3914,
      patrolRight: 4212,
      direction: 1,
      patrolSpeed: 172,
    },
    {
      id: 'fair-candle-jester-b',
      kind: 'candle-jester',
      x: 4518,
      y: 430,
      health: 3,
      maxHealth: 3,
      patrolLeft: 4410,
      patrolRight: 4654,
      direction: -1,
      patrolSpeed: 88,
      attackRange: 338,
      attackCooldownMs: 1280,
      projectileSpeed: 312,
    },
    {
      id: 'fair-high-archer',
      kind: 'tower-archer',
      x: 5246,
      y: 168,
      health: 3,
      maxHealth: 3,
      patrolLeft: 5200,
      patrolRight: 5300,
      direction: -1,
      patrolSpeed: 0,
      attackRange: 680,
      attackCooldownMs: 1240,
      projectileSpeed: 470,
    },
    {
      id: 'fair-low-barrel',
      kind: 'barrel-roller',
      x: 5845,
      y: 560,
      health: 3,
      maxHealth: 3,
      patrolLeft: 5768,
      patrolRight: 6054,
      direction: 1,
      patrolSpeed: 168,
    },
    {
      id: 'fair-candle-jester-c',
      kind: 'candle-jester',
      x: 6498,
      y: 548,
      health: 3,
      maxHealth: 3,
      patrolLeft: 6398,
      patrolRight: 6684,
      direction: -1,
      patrolSpeed: 94,
      attackRange: 370,
      attackCooldownMs: 1280,
      projectileSpeed: 320,
    },
    {
      id: 'fair-gauntlet-archer',
      kind: 'tower-archer',
      x: 7468,
      y: 472,
      health: 3,
      maxHealth: 3,
      patrolLeft: 7418,
      patrolRight: 7522,
      direction: -1,
      patrolSpeed: 0,
      attackRange: 700,
      attackCooldownMs: 1240,
      projectileSpeed: 500,
    },
    {
      id: 'fair-final-sentry',
      kind: 'clockwork-sentry',
      x: 8350,
      y: 548,
      health: 3,
      maxHealth: 3,
      patrolLeft: 8290,
      patrolRight: 8604,
      direction: 1,
      patrolSpeed: 96,
    },
  ],
  finish: { id: 'fair-east-gate', x: 8752, y: 414, width: 74, height: 150 },
  platforms: [
    { id: 'fair-start-stage', visualId: 'candle-wide-stage', x: 0, y: 584, width: 518, height: 86, terrainSet: 'candleBright' },
    { id: 'fair-first-crouch-floor', visualId: 'candle-wide-stage', x: 560, y: 584, width: 430, height: 86, terrainSet: 'candleBright' },
    { id: 'fair-hidden-crouch-step-a', x: 594, y: 512, width: 58, height: 12, hidden: true },
    { id: 'fair-crouch-top-cache-a', visualId: 'candle-lintel', x: 664, y: 420, width: 244, height: 40, terrainSet: 'candleShelf' },
    { id: 'fair-sentry-rubble', visualId: 'candle-rubble-floor', x: 1050, y: 584, width: 248, height: 70, terrainSet: 'candleBright' },
    { id: 'fair-bridge-landing-chip', visualId: 'candle-small-plank', x: 1592, y: 584, width: 106, height: 56, terrainSet: 'candleShelf' },
    { id: 'fair-bridge-entry', visualId: 'candle-small-plank', x: 1716, y: 584, width: 216, height: 70, terrainSet: 'candleBright' },
    { id: 'fair-shield-table-a', visualId: 'candle-high-shelf', x: 1948, y: 520, width: 184, height: 42, terrainSet: 'candleShelf' },
    { id: 'fair-volley-floor-a', visualId: 'candle-wide-stage', x: 2126, y: 584, width: 224, height: 76, terrainSet: 'candleBright' },
    { id: 'fair-volley-pocket-low', visualId: 'candle-lintel', x: 2440, y: 584, width: 300, height: 70, terrainSet: 'candleBright' },
    { id: 'fair-volley-pocket-high', visualId: 'candle-high-shelf', x: 2608, y: 396, width: 194, height: 42, terrainSet: 'candleShelf' },
    { id: 'fair-archer-perch-a', visualId: 'candle-hanging-shelf', x: 3096, y: 546, width: 236, height: 54, terrainSet: 'candleShelf' },
    { id: 'fair-jester-floor-a', visualId: 'candle-wide-stage', x: 3376, y: 584, width: 396, height: 76, terrainSet: 'candleBright' },
    { id: 'fair-thief-floor-a', visualId: 'candle-rubble-floor', x: 3890, y: 584, width: 346, height: 70, terrainSet: 'candleBright' },
    { id: 'fair-candle-platform-a', visualId: 'candle-high-shelf', x: 4380, y: 466, width: 304, height: 52, terrainSet: 'candleShelf' },
    { id: 'fair-high-step-a', visualId: 'candle-small-plank', x: 4720, y: 462, width: 172, height: 40, terrainSet: 'candleShelf' },
    { id: 'fair-high-step-b', visualId: 'candle-small-plank', x: 4948, y: 332, width: 172, height: 40, terrainSet: 'candleShelf' },
    { id: 'fair-high-archer-perch', visualId: 'candle-hanging-shelf', x: 5178, y: 204, width: 228, height: 44, terrainSet: 'candleShelf' },
    { id: 'fair-high-step-c', visualId: 'candle-small-plank', x: 5488, y: 314, width: 178, height: 40, terrainSet: 'candleShelf' },
    { id: 'fair-high-recovery-a', visualId: 'candle-rubble-floor', x: 4390, y: 614, width: 300, height: 58, terrainSet: 'candleBright' },
    { id: 'fair-high-recovery-b', visualId: 'candle-wide-stage', x: 4740, y: 614, width: 350, height: 58, terrainSet: 'candleBright' },
    { id: 'fair-high-recovery-c', visualId: 'candle-rubble-floor', x: 5140, y: 614, width: 430, height: 58, terrainSet: 'candleBright' },
    { id: 'fair-high-drop-floor', visualId: 'candle-rubble-floor', x: 5740, y: 596, width: 342, height: 72, terrainSet: 'candleBright' },
    { id: 'fair-shield-table-b', visualId: 'candle-high-shelf', x: 6202, y: 520, width: 184, height: 42, terrainSet: 'candleShelf' },
    { id: 'fair-gauntlet-floor-a', visualId: 'candle-wide-stage', x: 6370, y: 584, width: 342, height: 76, terrainSet: 'candleBright' },
    { id: 'fair-gauntlet-pocket-low', visualId: 'candle-lintel', x: 6796, y: 584, width: 310, height: 72, terrainSet: 'candleBright' },
    { id: 'fair-gauntlet-pocket-high', visualId: 'candle-high-shelf', x: 7048, y: 386, width: 198, height: 42, terrainSet: 'candleShelf' },
    { id: 'fair-gauntlet-archer-perch', visualId: 'candle-hanging-shelf', x: 7394, y: 508, width: 250, height: 52, terrainSet: 'candleShelf' },
    { id: 'fair-final-entry', visualId: 'candle-rubble-floor', x: 8016, y: 584, width: 214, height: 72, terrainSet: 'candleBright' },
    { id: 'fair-final-floor', visualId: 'candle-wide-stage', x: 8260, y: 584, width: 376, height: 76, terrainSet: 'candleBright' },
    { id: 'fair-final-gate-floor', visualId: 'candle-wide-stage', x: 8660, y: 584, width: 240, height: 76, terrainSet: 'candleBright' },
  ],
  tiltPlatforms: [
    { id: 'fair-tilt-bridge-a', x: 1324, y: 516, width: 162, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 700, wobbleRotation: 0.185, slideForce: 1680, maxSlideSpeed: 238 },
    { id: 'fair-high-tilt', x: 5338, y: 276, width: 150, height: 28, visualHeight: 50, visualOffsetY: -12, wobbleDurationMs: 680, wobbleRotation: 0.195, slideForce: 1760, maxSlideSpeed: 258 },
    { id: 'fair-final-tilt', x: 7688, y: 492, width: 154, height: 28, visualHeight: 50, visualOffsetY: -12, wobbleDurationMs: 660, wobbleRotation: 0.205, slideForce: 1840, maxSlideSpeed: 276 },
  ],
  crouchGates: [
    { id: 'fair-low-canopy-a', x: 642, y: 414, width: 284, height: 116, terrainSet: 'candleBright' },
    { id: 'fair-volley-low-cover-a', x: 2534, y: 424, width: 176, height: 106, terrainSet: 'candleBright' },
    { id: 'fair-gauntlet-low-cover-a', x: 6906, y: 424, width: 170, height: 106, terrainSet: 'candleBright' },
  ],
  spikes: [
    { id: 'fair-start-pit', x: 1000, y: 612, width: 72, height: 28 },
    { id: 'fair-tilt-pit-a', x: 1288, y: 612, width: 72, height: 28 },
    { id: 'fair-tilt-pit-b', x: 1490, y: 612, width: 86, height: 28 },
    { id: 'fair-bridge-skip-spikes', x: 1636, y: 612, width: 72, height: 28 },
    { id: 'fair-volley-spikes-a', x: 2358, y: 612, width: 74, height: 28 },
    { id: 'fair-jester-spikes-a', x: 3778, y: 610, width: 108, height: 28 },
    { id: 'fair-high-drop-spikes-a', x: 5660, y: 628, width: 78, height: 28 },
    { id: 'fair-gauntlet-spikes-a', x: 6718, y: 610, width: 72, height: 28 },
    { id: 'fair-gauntlet-spikes-b', x: 7252, y: 610, width: 86, height: 28 },
    { id: 'fair-final-tilt-spikes-a', x: 7608, y: 612, width: 76, height: 28 },
    { id: 'fair-final-tilt-spikes-b', x: 7854, y: 612, width: 152, height: 28 },
    { id: 'fair-final-spikes', x: 8630, y: 610, width: 46, height: 28 },
  ],
  coins: [
    { id: 'coin-1', x: 304, y: 496 },
    { id: 'coin-2', x: 610, y: 548 },
    { id: 'coin-3', x: 742, y: 548 },
    { id: 'coin-4', x: 810, y: 360 },
    { id: 'coin-5', x: 906, y: 360 },
    { id: 'coin-6', x: 1136, y: 496 },
    { id: 'coin-7', x: 1398, y: 440 },
    { id: 'coin-8', x: 1668, y: 496 },
    { id: 'coin-9', x: 1928, y: 458 },
    { id: 'coin-10', x: 2158, y: 500 },
    { id: 'coin-11', x: 2468, y: 548 },
    { id: 'coin-12', x: 2688, y: 334 },
    { id: 'coin-13', x: 2772, y: 334 },
    { id: 'coin-14', x: 3138, y: 468 },
    { id: 'coin-15', x: 3470, y: 498 },
    { id: 'coin-16', x: 3684, y: 498 },
    { id: 'coin-17', x: 3982, y: 500 },
    { id: 'coin-18', x: 4194, y: 500 },
    { id: 'coin-19', x: 4460, y: 404 },
    { id: 'coin-20', x: 4658, y: 404 },
    { id: 'coin-21', x: 4808, y: 398 },
    { id: 'coin-22', x: 5032, y: 268 },
    { id: 'coin-23', x: 5244, y: 134 },
    { id: 'coin-24', x: 5386, y: 220 },
    { id: 'coin-25', x: 5570, y: 252 },
    { id: 'coin-26', x: 5818, y: 512 },
    { id: 'coin-27', x: 6036, y: 512 },
    { id: 'coin-28', x: 6208, y: 458 },
    { id: 'coin-29', x: 6446, y: 498 },
    { id: 'coin-30', x: 6672, y: 498 },
    { id: 'coin-31', x: 6908, y: 548 },
    { id: 'coin-32', x: 7114, y: 324 },
    { id: 'coin-33', x: 7212, y: 324 },
    { id: 'coin-34', x: 7468, y: 430 },
    { id: 'coin-35', x: 7752, y: 426 },
    { id: 'coin-36', x: 8024, y: 500 },
    { id: 'coin-37', x: 8224, y: 500 },
    { id: 'coin-38', x: 8378, y: 500 },
    { id: 'coin-39', x: 8560, y: 496 },
    { id: 'coin-40', x: 8718, y: 496 },
    { id: 'coin-41', x: 706, y: 300 },
    { id: 'coin-42', x: 744, y: 270 },
    { id: 'coin-43', x: 782, y: 300 },
    { id: 'coin-44', x: 5284, y: 92 },
  ],
  boosts: [
    { id: 'moonheart-crest-high-fair', x: 5286, y: 130, scoreValue: 175, durationMs: 9200, guardCharges: 2 },
  ],
  shieldPickups: [
    { id: 'candle-ward-first-volley', x: 1998, y: 460, scoreValue: 90, durationMs: 11200, guardCharges: 6 },
    { id: 'candle-ward-gauntlet', x: 6218, y: 460, scoreValue: 95, durationMs: 11400, guardCharges: 7 },
    { id: 'candle-ward-final-bridge', x: 8054, y: 520, scoreValue: 85, durationMs: 8600, guardCharges: 5 },
  ],
  arrowVolleys: [
    { id: 'fair-volley-a-head', x: 1940, y: 184, width: 1180, height: 392, direction: -1, spawnX: 3240, laneY: 448, intervalMs: 1640, delayMs: 260, speed: 440, lifetimeMs: 3700 },
    { id: 'fair-volley-a-crouch', x: 1940, y: 184, width: 1180, height: 392, direction: -1, spawnX: 3240, laneY: 514, intervalMs: 1880, delayMs: 780, speed: 425, lifetimeMs: 3700 },
    { id: 'fair-volley-a-jump', x: 1940, y: 184, width: 1180, height: 392, direction: -1, spawnX: 3240, laneY: 332, intervalMs: 2040, delayMs: 1320, speed: 460, lifetimeMs: 3600 },
    { id: 'fair-volley-b-head', x: 6240, y: 188, width: 1260, height: 396, direction: -1, spawnX: 7580, laneY: 438, intervalMs: 1580, delayMs: 320, speed: 455, lifetimeMs: 3900 },
    { id: 'fair-volley-b-crouch', x: 6240, y: 188, width: 1260, height: 396, direction: -1, spawnX: 7580, laneY: 514, intervalMs: 1840, delayMs: 860, speed: 440, lifetimeMs: 3900 },
    { id: 'fair-volley-b-jump', x: 6240, y: 188, width: 1260, height: 396, direction: -1, spawnX: 7580, laneY: 316, intervalMs: 1980, delayMs: 1420, speed: 475, lifetimeMs: 3800 },
  ],
}

export const SHADOW_RUNNER_LEVEL_SIX: ShadowRunnerLevelConfig = {
  id: 'level-6',
  campaignLevel: 6,
  title: 'Clockmaker Yard',
  subtitle: 'Campaign Route 6',
  objective: 'Break the gear lock',
  introLine: 'Catch the clock. Slow the yard. Break the gear lock.',
  completionLine: 'Clockmaker Yard cleared. The machine road stands still.',
  backgroundAsset: SHADOW_RUNNER_ASSETS.levels.clockmakerYardBackground,
  worldWidth: 10260,
  worldHeight: 720,
  playerStart: { id: 'start', x: 118, y: 552 },
  checkpoints: [
    { id: 'yard-first-lock', label: 'First Gear Lock', x: 2360, y: 584 },
    { id: 'yard-high-route', label: 'Counterweight Walk', x: 4060, y: 614 },
    { id: 'yard-gear-run', label: 'Gear Run', x: 6610, y: 584 },
    { id: 'yard-gauntlet', label: 'Machine Gauntlet', x: 8460, y: 614 },
    { id: 'yard-final-approach', label: 'Clock Gate Approach', x: 9360, y: 584 },
  ],
  enemies: [
    {
      id: 'yard-bandit-scout-a', kind: 'lantern-bandit-scout', x: 820, y: 548,
      health: 4, maxHealth: 4, patrolLeft: 680, patrolRight: 1000, direction: -1,
      patrolSpeed: 178, contactDamage: 2,
    },
    {
      id: 'yard-sentry-a', kind: 'clockwork-sentry', x: 1260, y: 548,
      health: 4, maxHealth: 4, patrolLeft: 1190, patrolRight: 1395, direction: 1,
      patrolSpeed: 104, contactDamage: 2,
    },
    {
      id: 'yard-barrel-a', kind: 'barrel-roller', x: 1910, y: 548,
      health: 4, maxHealth: 4, patrolLeft: 1790, patrolRight: 2150, direction: -1,
      patrolSpeed: 174, contactDamage: 4,
    },
    {
      id: 'yard-bandit-scout-b', kind: 'lantern-bandit-scout', x: 2490, y: 548,
      health: 4, maxHealth: 4, patrolLeft: 2330, patrolRight: 2690, direction: 1,
      patrolSpeed: 186, contactDamage: 2,
    },
    {
      id: 'yard-scroll-thief', kind: 'scroll-thief', x: 3560, y: 548,
      health: 4, maxHealth: 4, patrolLeft: 3410, patrolRight: 3870, direction: -1,
      patrolSpeed: 182, contactDamage: 2,
    },
    {
      id: 'yard-high-archer', kind: 'tower-archer', x: 4810, y: 224,
      health: 4, maxHealth: 4, patrolLeft: 4760, patrolRight: 4920, direction: -1,
      patrolSpeed: 0, attackRange: 720, attackCooldownMs: 1180, projectileSpeed: 500,
      contactDamage: 1, projectileDamage: 3,
    },
    {
      id: 'yard-jester', kind: 'candle-jester', x: 5600, y: 548,
      health: 4, maxHealth: 4, patrolLeft: 5440, patrolRight: 5840, direction: 1,
      patrolSpeed: 98, attackRange: 390, attackCooldownMs: 1200, projectileSpeed: 332,
      contactDamage: 2, projectileDamage: 2,
    },
    {
      id: 'yard-bandit-scout-c', kind: 'lantern-bandit-scout', x: 7470, y: 548,
      health: 4, maxHealth: 4, patrolLeft: 7410, patrolRight: 7620, direction: -1,
      patrolSpeed: 190, contactDamage: 2,
    },
    {
      id: 'yard-barrel-b', kind: 'barrel-roller', x: 6740, y: 548,
      health: 4, maxHealth: 4, patrolLeft: 6570, patrolRight: 7010, direction: 1,
      patrolSpeed: 180, contactDamage: 4,
    },
    {
      id: 'yard-perch-archer', kind: 'tower-archer', x: 6850, y: 344,
      health: 4, maxHealth: 4, patrolLeft: 6790, patrolRight: 6970, direction: -1,
      patrolSpeed: 0, attackRange: 740, attackCooldownMs: 1140, projectileSpeed: 520,
      contactDamage: 1, projectileDamage: 3,
    },
    {
      id: 'yard-bandit-scout-d', kind: 'lantern-bandit-scout', x: 8720, y: 578,
      health: 4, maxHealth: 4, patrolLeft: 8500, patrolRight: 9000, direction: 1,
      patrolSpeed: 194, contactDamage: 2,
    },
    {
      id: 'yard-final-sentry', kind: 'clockwork-sentry', x: 10070, y: 548,
      health: 5, maxHealth: 5, patrolLeft: 9950, patrolRight: 10220, direction: -1,
      patrolSpeed: 112, contactDamage: 3,
    },
  ],
  finish: {
    id: 'yard-gear-lock', visualId: 'clock-switch', x: 10126, y: 414, width: 78, height: 150,
  },
  platforms: [
    { id: 'yard-start-floor', visualId: 'clock-wide-floor', x: 0, y: 584, width: 500, height: 86, terrainSet: 'clock' },
    { id: 'yard-first-floor', visualId: 'clock-wide-floor', x: 620, y: 584, width: 420, height: 86, terrainSet: 'clock' },
    { id: 'yard-sentry-step', visualId: 'clock-rubble-floor', x: 1160, y: 584, width: 260, height: 78, terrainSet: 'clock' },
    { id: 'yard-first-landing', visualId: 'clock-wide-floor', x: 1760, y: 584, width: 420, height: 86, terrainSet: 'clock' },
    { id: 'yard-switch-floor', visualId: 'clock-medium-ledge', x: 2300, y: 584, width: 420, height: 78, terrainSet: 'clock' },
    { id: 'yard-first-crawl-floor', visualId: 'clock-wide-floor', x: 2810, y: 584, width: 470, height: 86, terrainSet: 'clock' },
    { id: 'yard-scout-floor', visualId: 'clock-wide-floor', x: 3380, y: 584, width: 520, height: 86, terrainSet: 'clock' },
    { id: 'yard-high-recovery', visualId: 'clock-rubble-floor', x: 4010, y: 614, width: 1260, height: 58, terrainSet: 'clock' },
    { id: 'yard-high-step-a', visualId: 'clock-medium-ledge', x: 4100, y: 500, width: 250, height: 46, terrainSet: 'clock' },
    { id: 'yard-high-step-b', visualId: 'clock-gear-bridge', x: 4420, y: 380, width: 240, height: 40, terrainSet: 'clock' },
    { id: 'yard-high-step-c', visualId: 'clock-medium-ledge', x: 4730, y: 260, width: 240, height: 42, terrainSet: 'clock' },
    { id: 'yard-high-step-d', visualId: 'clock-gear-bridge', x: 5070, y: 390, width: 250, height: 40, terrainSet: 'clock' },
    { id: 'yard-mid-floor', visualId: 'clock-wide-floor', x: 5410, y: 584, width: 460, height: 86, terrainSet: 'clock' },
    { id: 'yard-second-crawl-floor', visualId: 'clock-wide-floor', x: 5990, y: 584, width: 430, height: 86, terrainSet: 'clock' },
    { id: 'yard-gear-floor', visualId: 'clock-wide-floor', x: 6540, y: 584, width: 500, height: 86, terrainSet: 'clock' },
    { id: 'yard-archer-perch', visualId: 'clock-medium-ledge', x: 6760, y: 380, width: 240, height: 44, terrainSet: 'clock' },
    { id: 'yard-bridge-landing', visualId: 'clock-wide-floor', x: 7380, y: 584, width: 480, height: 86, terrainSet: 'clock' },
    { id: 'yard-gauntlet-floor', visualId: 'clock-wide-floor', x: 7980, y: 584, width: 420, height: 86, terrainSet: 'clock' },
    { id: 'yard-gauntlet-upper', visualId: 'clock-gear-bridge', x: 8240, y: 450, width: 220, height: 40, terrainSet: 'clock' },
    { id: 'yard-gauntlet-recovery', visualId: 'clock-rubble-floor', x: 8440, y: 614, width: 760, height: 58, terrainSet: 'clock' },
    { id: 'yard-gauntlet-bridge', visualId: 'clock-gear-bridge', x: 8460, y: 430, width: 240, height: 40, terrainSet: 'clock' },
    { id: 'yard-final-approach', visualId: 'clock-wide-floor', x: 9300, y: 584, width: 400, height: 86, terrainSet: 'clock' },
    { id: 'yard-final-floor', visualId: 'clock-wide-floor', x: 9920, y: 584, width: 340, height: 86, terrainSet: 'clock' },
  ],
  tiltPlatforms: [
    { id: 'yard-first-tilt', x: 1460, y: 520, width: 170, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 620, wobbleRotation: 0.205, slideForce: 1880, maxSlideSpeed: 282 },
    { id: 'yard-high-tilt', x: 4985, y: 325, width: 142, height: 28, visualHeight: 50, visualOffsetY: -12, wobbleDurationMs: 600, wobbleRotation: 0.215, slideForce: 1940, maxSlideSpeed: 294 },
    { id: 'yard-gauntlet-tilt', x: 7080, y: 520, width: 180, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 590, wobbleRotation: 0.22, slideForce: 1980, maxSlideSpeed: 304 },
    { id: 'yard-final-tilt', x: 9740, y: 520, width: 150, height: 28, visualHeight: 50, visualOffsetY: -12, wobbleDurationMs: 570, wobbleRotation: 0.225, slideForce: 2040, maxSlideSpeed: 312 },
  ],
  crouchGates: [
    { id: 'yard-crawl-gate-a', visualId: 'clock-overhang', x: 2900, y: 414, width: 270, height: 116, terrainSet: 'clock' },
    { id: 'yard-crawl-gate-b', visualId: 'clock-overhang', x: 6090, y: 414, width: 250, height: 116, terrainSet: 'clock' },
    { id: 'yard-crawl-gate-c', visualId: 'clock-overhang', x: 8080, y: 414, width: 250, height: 116, terrainSet: 'clock' },
  ],
  spikes: [
    { id: 'yard-gap-a', x: 502, y: 612, width: 116, height: 28, damage: 3 },
    { id: 'yard-gap-b', x: 1042, y: 612, width: 116, height: 28, damage: 3 },
    { id: 'yard-first-tilt-pit-a', x: 1422, y: 612, width: 82, height: 28, damage: 3 },
    { id: 'yard-first-tilt-pit-b', x: 1632, y: 612, width: 126, height: 28, damage: 3 },
    { id: 'yard-gap-c', x: 2182, y: 612, width: 116, height: 28, damage: 3 },
    { id: 'yard-gap-d', x: 2722, y: 612, width: 86, height: 28, damage: 3 },
    { id: 'yard-gap-e', x: 3282, y: 612, width: 96, height: 28, damage: 3 },
    { id: 'yard-gap-f', x: 3902, y: 632, width: 106, height: 28, damage: 3 },
    { id: 'yard-gap-g', x: 5272, y: 632, width: 136, height: 28, damage: 3 },
    { id: 'yard-gap-h', x: 5872, y: 612, width: 116, height: 28, damage: 3 },
    { id: 'yard-gap-i', x: 6422, y: 612, width: 116, height: 28, damage: 3 },
    { id: 'yard-gauntlet-pit-a', x: 7042, y: 612, width: 88, height: 28, damage: 3 },
    { id: 'yard-gauntlet-pit-b', x: 7262, y: 612, width: 116, height: 28, damage: 3 },
    { id: 'yard-gap-j', x: 7862, y: 612, width: 116, height: 28, damage: 3 },
    { id: 'yard-gap-k', x: 9202, y: 632, width: 96, height: 28, damage: 3 },
    { id: 'yard-final-pit-a', x: 9702, y: 612, width: 74, height: 28, damage: 3 },
    { id: 'yard-final-pit-b', x: 9892, y: 612, width: 26, height: 28, damage: 3 },
  ],
  coins: [
    { id: 'coin-1', x: 270, y: 496 }, { id: 'coin-2', x: 680, y: 500 },
    { id: 'coin-3', x: 850, y: 500 }, { id: 'coin-4', x: 1220, y: 500 },
    { id: 'coin-5', x: 1508, y: 448 }, { id: 'coin-6', x: 1810, y: 500 },
    { id: 'coin-7', x: 2070, y: 500 }, { id: 'coin-8', x: 2350, y: 500 },
    { id: 'coin-9', x: 2630, y: 500 }, { id: 'coin-10', x: 2860, y: 548 },
    { id: 'coin-11', x: 3080, y: 548 }, { id: 'coin-12', x: 3440, y: 500 },
    { id: 'coin-13', x: 3700, y: 500 }, { id: 'coin-14', x: 4070, y: 548 },
    { id: 'coin-15', x: 4180, y: 438 }, { id: 'coin-16', x: 4490, y: 318 },
    { id: 'coin-17', x: 4800, y: 198 }, { id: 'coin-18', x: 5040, y: 260 },
    { id: 'coin-19', x: 5140, y: 328 }, { id: 'coin-20', x: 5260, y: 548 },
    { id: 'coin-21', x: 5470, y: 500 }, { id: 'coin-22', x: 5790, y: 500 },
    { id: 'coin-23', x: 6050, y: 548 }, { id: 'coin-24', x: 6280, y: 548 },
    { id: 'coin-25', x: 6600, y: 500 }, { id: 'coin-26', x: 6870, y: 318 },
    { id: 'coin-27', x: 7125, y: 448 }, { id: 'coin-28', x: 7430, y: 500 },
    { id: 'coin-29', x: 7740, y: 500 }, { id: 'coin-30', x: 8030, y: 548 },
    { id: 'coin-31', x: 8280, y: 388 }, { id: 'coin-32', x: 8490, y: 368 },
    { id: 'coin-33', x: 8690, y: 548 }, { id: 'coin-34', x: 8940, y: 548 },
    { id: 'coin-35', x: 9320, y: 500 }, { id: 'coin-36', x: 9560, y: 500 },
    { id: 'coin-37', x: 9785, y: 448 }, { id: 'coin-38', x: 9970, y: 500 },
    { id: 'coin-39', x: 10130, y: 500 }, { id: 'coin-40', x: 2960, y: 352 },
    { id: 'coin-41', x: 3040, y: 330 }, { id: 'coin-42', x: 3120, y: 352 },
    { id: 'coin-43', x: 4340, y: 438 }, { id: 'coin-44', x: 4610, y: 318 },
    { id: 'coin-45', x: 4920, y: 198 }, { id: 'coin-46', x: 6180, y: 352 },
    { id: 'coin-47', x: 8160, y: 352 }, { id: 'coin-48', x: 8580, y: 368 },
  ],
  boosts: [
    { id: 'moonheart-yard-high-route', x: 4800, y: 174, scoreValue: 180, durationMs: 9000, guardCharges: 2 },
  ],
  shieldPickups: [
    { id: 'yard-shield-high-archer', x: 4050, y: 550, scoreValue: 100, durationMs: 9800, guardCharges: 5 },
    { id: 'yard-shield-gauntlet', x: 8448, y: 550, scoreValue: 105, durationMs: 10000, guardCharges: 5 },
  ],
  chronoPickups: [
    { id: 'chrono-lantern-first-lock', x: 2380, y: 506, scoreValue: 150, durationMs: 9000, healthRestore: 4, timeScale: 0.58 },
    { id: 'chrono-lantern-gear-run', x: 6600, y: 506, scoreValue: 160, durationMs: 9400, healthRestore: 3, timeScale: 0.55 },
    { id: 'chrono-lantern-final', x: 9350, y: 506, scoreValue: 170, durationMs: 8800, healthRestore: 3, timeScale: 0.52 },
  ],
  arrowVolleys: [
    { id: 'yard-volley-a-head', x: 3920, y: 170, width: 1480, height: 430, direction: -1, spawnX: 5480, laneY: 446, intervalMs: 1520, delayMs: 280, speed: 490, lifetimeMs: 3900, damage: 3 },
    { id: 'yard-volley-a-crouch', x: 3920, y: 170, width: 1480, height: 430, direction: -1, spawnX: 5480, laneY: 514, intervalMs: 1810, delayMs: 900, speed: 470, lifetimeMs: 3900, damage: 2 },
    { id: 'yard-volley-b-head', x: 7860, y: 180, width: 1420, height: 420, direction: -1, spawnX: 9360, laneY: 438, intervalMs: 1460, delayMs: 320, speed: 510, lifetimeMs: 4000, damage: 3 },
    { id: 'yard-volley-b-crouch', x: 7860, y: 180, width: 1420, height: 420, direction: -1, spawnX: 9360, laneY: 514, intervalMs: 1760, delayMs: 980, speed: 490, lifetimeMs: 4000, damage: 2 },
  ],
}

export const SHADOW_RUNNER_LEVEL_SEVEN: ShadowRunnerLevelConfig = {
  id: 'level-7',
  campaignLevel: 7,
  title: 'Moonlit Causeway',
  subtitle: 'Campaign Route 7',
  objective: 'Recover the three Moon Shards',
  introLine: 'Recover every shard. Cross the moon road. Do not trust the bridges.',
  completionLine: 'Moonlit Causeway cleared. The shard is whole again.',
  backgroundAsset: SHADOW_RUNNER_ASSETS.levels.moonlitCausewayBackground,
  worldWidth: 12740,
  worldHeight: 760,
  playerStart: { id: 'start', x: 118, y: 584 },
  checkpoints: [
    { id: 'causeway-first-bridge', label: 'First Causeway', x: 2060, y: 616 },
    { id: 'causeway-shard-climb', label: 'Shard Climb', x: 4400, y: 604 },
    { id: 'causeway-arrow-pocket', label: 'Arrow Pocket', x: 5520, y: 616 },
    { id: 'causeway-moon-gauntlet', label: 'Moon Gauntlet', x: 7900, y: 616 },
    { id: 'causeway-final-archers', label: 'Final Archers', x: 8960, y: 616 },
    { id: 'causeway-relay-approach', label: 'Relay Approach', x: 11280, y: 616 },
  ],
  enemies: [
    {
      id: 'causeway-stalker-a', kind: 'moon-stalker', x: 900, y: 616,
      health: 5, maxHealth: 5, patrolLeft: 760, patrolRight: 1120, direction: -1,
      patrolSpeed: 172, attackRange: 430, attackCooldownMs: 1150, contactDamage: 3,
    },
    {
      id: 'causeway-sentry-a', kind: 'clockwork-sentry', x: 1510, y: 616,
      health: 4, maxHealth: 4, patrolLeft: 1390, patrolRight: 1700, direction: 1,
      patrolSpeed: 98, contactDamage: 2,
    },
    {
      id: 'causeway-bandit-a', kind: 'lantern-bandit-scout', x: 2210, y: 616,
      health: 4, maxHealth: 4, patrolLeft: 2070, patrolRight: 2420, direction: -1,
      patrolSpeed: 184, contactDamage: 2,
    },
    {
      id: 'causeway-jester-a', kind: 'candle-jester', x: 3000, y: 616,
      health: 4, maxHealth: 4, patrolLeft: 2830, patrolRight: 3160, direction: 1,
      patrolSpeed: 96, attackRange: 400, attackCooldownMs: 1100, projectileSpeed: 350,
      contactDamage: 2, projectileDamage: 2,
    },
    {
      id: 'causeway-barrel-a', kind: 'barrel-roller', x: 3770, y: 616,
      health: 4, maxHealth: 4, patrolLeft: 3580, patrolRight: 4000, direction: -1,
      patrolSpeed: 176, contactDamage: 4,
    },
    {
      id: 'causeway-stalker-b', kind: 'moon-stalker', x: 4680, y: 616,
      health: 5, maxHealth: 5, patrolLeft: 4480, patrolRight: 5100, direction: 1,
      patrolSpeed: 182, attackRange: 470, attackCooldownMs: 1040, contactDamage: 3,
    },
    {
      id: 'causeway-high-archer-a', kind: 'tower-archer', x: 5780, y: 285,
      health: 4, maxHealth: 4, patrolLeft: 5710, patrolRight: 5880, direction: -1,
      patrolSpeed: 0, attackRange: 840, attackCooldownMs: 1040, projectileSpeed: 540,
      contactDamage: 1, projectileDamage: 3,
    },
    {
      id: 'causeway-bandit-b', kind: 'lantern-bandit-scout', x: 6480, y: 616,
      health: 4, maxHealth: 4, patrolLeft: 6320, patrolRight: 6720, direction: 1,
      patrolSpeed: 188, contactDamage: 2,
    },
    {
      id: 'causeway-barrel-b', kind: 'barrel-roller', x: 7240, y: 616,
      health: 4, maxHealth: 4, patrolLeft: 7060, patrolRight: 7520, direction: -1,
      patrolSpeed: 180, contactDamage: 4,
    },
    {
      id: 'causeway-high-archer-b', kind: 'tower-archer', x: 7780, y: 340,
      health: 4, maxHealth: 4, patrolLeft: 7710, patrolRight: 7900, direction: -1,
      patrolSpeed: 0, attackRange: 880, attackCooldownMs: 980, projectileSpeed: 560,
      contactDamage: 1, projectileDamage: 3,
    },
    {
      id: 'causeway-stalker-c', kind: 'moon-stalker', x: 8160, y: 616,
      health: 5, maxHealth: 5, patrolLeft: 7960, patrolRight: 8420, direction: 1,
      patrolSpeed: 188, attackRange: 500, attackCooldownMs: 980, contactDamage: 3,
    },
    {
      id: 'causeway-jester-b', kind: 'candle-jester', x: 9280, y: 616,
      health: 4, maxHealth: 4, patrolLeft: 9040, patrolRight: 9660, direction: -1,
      patrolSpeed: 104, attackRange: 420, attackCooldownMs: 1060, projectileSpeed: 360,
      contactDamage: 2, projectileDamage: 2,
    },
    {
      id: 'causeway-high-archer-c', kind: 'tower-archer', x: 10180, y: 260,
      health: 4, maxHealth: 4, patrolLeft: 10120, patrolRight: 10320, direction: -1,
      patrolSpeed: 0, attackRange: 940, attackCooldownMs: 960, projectileSpeed: 570,
      contactDamage: 1, projectileDamage: 3,
    },
    {
      id: 'causeway-stalker-d', kind: 'moon-stalker', x: 10460, y: 616,
      health: 5, maxHealth: 5, patrolLeft: 10240, patrolRight: 10710, direction: 1,
      patrolSpeed: 190, attackRange: 520, attackCooldownMs: 940, contactDamage: 3,
    },
    {
      id: 'causeway-final-sentry', kind: 'clockwork-sentry', x: 11660, y: 616,
      health: 5, maxHealth: 5, patrolLeft: 11400, patrolRight: 11930, direction: -1,
      patrolSpeed: 112, contactDamage: 3,
    },
  ],
  finish: {
    id: 'causeway-relay-gate', visualId: 'moon-relay-gate', terrainSet: 'moon', x: 12526, y: 446, width: 88, height: 150,
  },
  platforms: [
    { id: 'causeway-start-floor', visualId: 'moon-wide-floor', x: 0, y: 616, width: 560, height: 76, terrainSet: 'moon' },
    { id: 'causeway-first-floor', visualId: 'moon-wide-floor', x: 680, y: 616, width: 520, height: 76, terrainSet: 'moon' },
    { id: 'causeway-sentry-run', visualId: 'moon-rubble-floor', x: 1320, y: 616, width: 460, height: 72, terrainSet: 'moon' },
    { id: 'causeway-first-landing', visualId: 'moon-wide-floor', x: 1980, y: 616, width: 520, height: 76, terrainSet: 'moon' },
    { id: 'causeway-low-step-a', visualId: 'moon-medium-ledge', x: 2360, y: 490, width: 220, height: 42, terrainSet: 'moon' },
    { id: 'causeway-crawl-floor-a', visualId: 'moon-wide-floor', x: 2680, y: 616, width: 560, height: 76, terrainSet: 'moon' },
    { id: 'causeway-shard-ledge-a', visualId: 'moon-medium-ledge', x: 2700, y: 370, width: 210, height: 42, terrainSet: 'moon' },
    { id: 'causeway-shard-perch-a', visualId: 'moon-narrow-bridge', x: 3020, y: 278, width: 260, height: 38, terrainSet: 'moon' },
    { id: 'causeway-mid-floor', visualId: 'moon-rubble-floor', x: 3480, y: 616, width: 620, height: 72, terrainSet: 'moon' },
    { id: 'causeway-mid-gap-chip', visualId: 'moon-narrow-bridge', x: 4175, y: 574, width: 110, height: 34, terrainSet: 'moon' },
    { id: 'causeway-high-recovery-a', visualId: 'moon-wide-floor', x: 4370, y: 604, width: 900, height: 64, terrainSet: 'moon' },
    { id: 'causeway-high-step-a', visualId: 'moon-medium-ledge', x: 5120, y: 500, width: 220, height: 42, terrainSet: 'moon' },
    { id: 'causeway-high-step-b', visualId: 'moon-narrow-bridge', x: 5420, y: 390, width: 220, height: 38, terrainSet: 'moon' },
    { id: 'causeway-high-archer-perch-a', visualId: 'moon-medium-ledge', x: 5700, y: 285, width: 250, height: 42, terrainSet: 'moon' },
    { id: 'causeway-volley-pocket', visualId: 'moon-rubble-floor', x: 5480, y: 616, width: 520, height: 72, terrainSet: 'moon' },
    { id: 'causeway-crawl-floor-b', visualId: 'moon-wide-floor', x: 6240, y: 616, width: 520, height: 76, terrainSet: 'moon' },
    { id: 'causeway-rubble-run', visualId: 'moon-rubble-floor', x: 6960, y: 616, width: 620, height: 72, terrainSet: 'moon' },
    { id: 'causeway-archer-step-b', visualId: 'moon-medium-ledge', x: 7460, y: 470, width: 220, height: 42, terrainSet: 'moon' },
    { id: 'causeway-high-archer-perch-b', visualId: 'moon-medium-ledge', x: 7700, y: 340, width: 250, height: 42, terrainSet: 'moon' },
    { id: 'causeway-gauntlet-floor', visualId: 'moon-wide-floor', x: 7880, y: 616, width: 600, height: 76, terrainSet: 'moon' },
    { id: 'causeway-moon-gauntlet-chip', visualId: 'moon-narrow-bridge', x: 8605, y: 574, width: 165, height: 34, terrainSet: 'moon' },
    { id: 'causeway-final-recovery', visualId: 'moon-rubble-floor', x: 8860, y: 616, width: 940, height: 72, terrainSet: 'moon' },
    { id: 'causeway-final-step-a', visualId: 'moon-medium-ledge', x: 9550, y: 470, width: 220, height: 42, terrainSet: 'moon' },
    { id: 'causeway-final-step-b', visualId: 'moon-narrow-bridge', x: 9860, y: 360, width: 220, height: 38, terrainSet: 'moon' },
    { id: 'causeway-final-shard-perch', visualId: 'moon-medium-ledge', x: 10120, y: 260, width: 260, height: 42, terrainSet: 'moon' },
    { id: 'causeway-final-gap-chip', visualId: 'moon-narrow-bridge', x: 9940, y: 570, width: 128, height: 34, terrainSet: 'moon' },
    { id: 'causeway-final-approach', visualId: 'moon-wide-floor', x: 10160, y: 616, width: 620, height: 76, terrainSet: 'moon' },
    { id: 'causeway-relay-floor', visualId: 'moon-wide-floor', x: 11220, y: 616, width: 800, height: 76, terrainSet: 'moon' },
    { id: 'causeway-finish-floor', visualId: 'moon-medium-ledge', x: 12220, y: 616, width: 420, height: 70, terrainSet: 'moon' },
  ],
  tiltPlatforms: [
    { id: 'causeway-opening-tilt', x: 570, y: 552, width: 116, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 560, wobbleRotation: 0.235, slideForce: 2100, maxSlideSpeed: 324 },
    { id: 'causeway-first-tilt', x: 1810, y: 552, width: 158, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 540, wobbleRotation: 0.24, slideForce: 2140, maxSlideSpeed: 334 },
    { id: 'causeway-mid-tilt', x: 6060, y: 552, width: 160, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 520, wobbleRotation: 0.245, slideForce: 2200, maxSlideSpeed: 344 },
    { id: 'causeway-gauntlet-tilt', x: 7640, y: 552, width: 164, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 510, wobbleRotation: 0.25, slideForce: 2240, maxSlideSpeed: 352 },
    { id: 'causeway-final-tilt', x: 10950, y: 552, width: 172, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 500, wobbleRotation: 0.255, slideForce: 2300, maxSlideSpeed: 360 },
  ],
  crouchGates: [
    { id: 'causeway-crawl-gate-a', visualId: 'moon-tall-overhang', x: 2790, y: 446, width: 300, height: 116, terrainSet: 'moon' },
    { id: 'causeway-crawl-gate-b', visualId: 'moon-tall-overhang', x: 6320, y: 446, width: 280, height: 116, terrainSet: 'moon' },
    { id: 'causeway-crawl-gate-c', visualId: 'moon-tall-overhang', x: 8940, y: 446, width: 330, height: 116, terrainSet: 'moon' },
    { id: 'causeway-crawl-gate-d', visualId: 'moon-tall-overhang', x: 11310, y: 446, width: 270, height: 116, terrainSet: 'moon' },
  ],
  spikes: [
    { id: 'causeway-gap-a', x: 560, y: 644, width: 120, height: 30, damage: 3 },
    { id: 'causeway-gap-b', x: 1200, y: 644, width: 120, height: 30, damage: 3 },
    { id: 'causeway-gap-c', x: 1780, y: 644, width: 200, height: 30, damage: 3 },
    { id: 'causeway-gap-d', x: 2500, y: 644, width: 180, height: 30, damage: 3 },
    { id: 'causeway-gap-e', x: 3240, y: 644, width: 240, height: 30, damage: 3 },
    { id: 'causeway-gap-f', x: 4100, y: 644, width: 270, height: 30, damage: 3 },
    { id: 'causeway-gap-g', x: 5270, y: 644, width: 210, height: 30, damage: 3 },
    { id: 'causeway-gap-h', x: 6000, y: 644, width: 240, height: 30, damage: 3 },
    { id: 'causeway-gap-i', x: 6760, y: 644, width: 200, height: 30, damage: 3 },
    { id: 'causeway-gap-j', x: 7580, y: 644, width: 300, height: 30, damage: 3 },
    { id: 'causeway-gap-k', x: 8480, y: 644, width: 380, height: 30, damage: 3 },
    { id: 'causeway-gap-l', x: 9800, y: 644, width: 360, height: 30, damage: 3 },
    { id: 'causeway-gap-m', x: 10780, y: 644, width: 440, height: 30, damage: 3 },
    { id: 'causeway-gap-n', x: 12020, y: 644, width: 200, height: 30, damage: 3 },
  ],
  coins: [
    { id: 'coin-1', x: 250, y: 532 }, { id: 'coin-2', x: 720, y: 532 },
    { id: 'coin-3', x: 920, y: 532 }, { id: 'coin-4', x: 1110, y: 532 },
    { id: 'coin-5', x: 1400, y: 532 }, { id: 'coin-6', x: 1600, y: 532 },
    { id: 'coin-7', x: 1840, y: 490 }, { id: 'coin-8', x: 2070, y: 532 },
    { id: 'coin-9', x: 2290, y: 532 }, { id: 'coin-10', x: 2460, y: 430 },
    { id: 'coin-11', x: 2745, y: 600 }, { id: 'coin-12', x: 2845, y: 600 },
    { id: 'coin-13', x: 2945, y: 600 }, { id: 'coin-14', x: 3070, y: 218 },
    { id: 'coin-15', x: 3210, y: 218 }, { id: 'coin-16', x: 3540, y: 532 },
    { id: 'coin-17', x: 3780, y: 532 }, { id: 'coin-18', x: 4030, y: 532 },
    { id: 'coin-19', x: 4420, y: 560 }, { id: 'coin-20', x: 4660, y: 560 },
    { id: 'coin-21', x: 4920, y: 560 }, { id: 'coin-22', x: 5200, y: 438 },
    { id: 'coin-23', x: 5480, y: 330 }, { id: 'coin-24', x: 5760, y: 225 },
    { id: 'coin-25', x: 5920, y: 225 }, { id: 'coin-26', x: 6140, y: 492 },
    { id: 'coin-27', x: 6280, y: 600 }, { id: 'coin-28', x: 6380, y: 600 },
    { id: 'coin-29', x: 6480, y: 600 }, { id: 'coin-30', x: 6580, y: 600 },
    { id: 'coin-31', x: 7040, y: 532 }, { id: 'coin-32', x: 7280, y: 532 },
    { id: 'coin-33', x: 7520, y: 532 }, { id: 'coin-34', x: 7520, y: 408 },
    { id: 'coin-35', x: 7780, y: 278 }, { id: 'coin-36', x: 7920, y: 278 },
    { id: 'coin-37', x: 8060, y: 532 }, { id: 'coin-38', x: 8300, y: 532 },
    { id: 'coin-39', x: 8900, y: 532 }, { id: 'coin-40', x: 9020, y: 600 },
    { id: 'coin-41', x: 9120, y: 600 }, { id: 'coin-42', x: 9220, y: 600 },
    { id: 'coin-43', x: 9480, y: 532 }, { id: 'coin-44', x: 9620, y: 410 },
    { id: 'coin-45', x: 9900, y: 302 }, { id: 'coin-46', x: 10160, y: 200 },
    { id: 'coin-47', x: 10320, y: 200 }, { id: 'coin-48', x: 10500, y: 532 },
    { id: 'coin-49', x: 11020, y: 492 }, { id: 'coin-50', x: 11330, y: 600 },
    { id: 'coin-51', x: 11430, y: 600 }, { id: 'coin-52', x: 11530, y: 600 },
    { id: 'coin-53', x: 11720, y: 532 }, { id: 'coin-54', x: 11920, y: 532 },
    { id: 'coin-55', x: 12260, y: 532 }, { id: 'coin-56', x: 12420, y: 492 },
    { id: 'coin-57', x: 2730, y: 308 }, { id: 'coin-58', x: 2870, y: 308 },
    { id: 'coin-59', x: 5180, y: 438 }, { id: 'coin-60', x: 9890, y: 300 },
  ],
  boosts: [
    { id: 'moonheart-causeway-high', x: 5740, y: 225, scoreValue: 190, durationMs: 9000, guardCharges: 2 },
  ],
  shieldPickups: [
    { id: 'causeway-shield-first-volley', x: 5500, y: 552, scoreValue: 105, durationMs: 10200, guardCharges: 6 },
    { id: 'causeway-shield-final-archers', x: 8900, y: 552, scoreValue: 110, durationMs: 10800, guardCharges: 6 },
    { id: 'causeway-shield-relay', x: 11280, y: 552, scoreValue: 105, durationMs: 9600, guardCharges: 5 },
  ],
  chronoPickups: [
    { id: 'chrono-causeway-climb', x: 4460, y: 568, scoreValue: 165, durationMs: 9000, healthRestore: 3, timeScale: 0.55 },
    { id: 'chrono-causeway-gauntlet', x: 7860, y: 552, scoreValue: 170, durationMs: 9200, healthRestore: 3, timeScale: 0.52 },
  ],
  surgePickups: [
    { id: 'shadow-surge-first-shard', x: 2520, y: 430, scoreValue: 220, durationMs: 9800, healthRestore: 5, guardCharges: 4, speedMultiplier: 1.12 },
    { id: 'shadow-surge-gauntlet', x: 8140, y: 552, scoreValue: 230, durationMs: 10400, healthRestore: 4, guardCharges: 4, speedMultiplier: 1.15 },
    { id: 'shadow-surge-final-perch', x: 9860, y: 300, scoreValue: 240, durationMs: 9600, healthRestore: 4, guardCharges: 3, speedMultiplier: 1.14 },
  ],
  moonShardPickups: [
    { id: 'moon-shard-first-high', x: 3060, y: 218, scoreValue: 275 },
    { id: 'moon-shard-crawl-route', x: 6460, y: 600, scoreValue: 275 },
    { id: 'moon-shard-final-perch', x: 10180, y: 200, scoreValue: 325 },
  ],
  arrowVolleys: [
    { id: 'causeway-volley-a-head', x: 4320, y: 170, width: 1760, height: 458, direction: -1, spawnX: 6220, laneY: 468, intervalMs: 1420, delayMs: 260, speed: 540, lifetimeMs: 4200, damage: 3 },
    { id: 'causeway-volley-a-crouch', x: 4320, y: 170, width: 1760, height: 458, direction: -1, spawnX: 6220, laneY: 532, intervalMs: 1700, delayMs: 740, speed: 520, lifetimeMs: 4200, damage: 2 },
    { id: 'causeway-volley-a-jump', x: 4320, y: 170, width: 1760, height: 458, direction: -1, spawnX: 6220, laneY: 340, intervalMs: 1920, delayMs: 1120, speed: 560, lifetimeMs: 4100, damage: 3 },
    { id: 'causeway-volley-b-head', x: 7680, y: 180, width: 2200, height: 450, direction: -1, spawnX: 10020, laneY: 462, intervalMs: 1380, delayMs: 220, speed: 560, lifetimeMs: 4500, damage: 3 },
    { id: 'causeway-volley-b-crouch', x: 7680, y: 180, width: 2200, height: 450, direction: -1, spawnX: 10020, laneY: 532, intervalMs: 1660, delayMs: 800, speed: 540, lifetimeMs: 4500, damage: 2 },
    { id: 'causeway-volley-b-jump', x: 7680, y: 180, width: 2200, height: 450, direction: -1, spawnX: 10020, laneY: 322, intervalMs: 1880, delayMs: 1280, speed: 580, lifetimeMs: 4400, damage: 3 },
    { id: 'causeway-volley-c-head', x: 10800, y: 180, width: 1460, height: 450, direction: -1, spawnX: 12380, laneY: 458, intervalMs: 1360, delayMs: 260, speed: 570, lifetimeMs: 3900, damage: 3 },
    { id: 'causeway-volley-c-crouch', x: 10800, y: 180, width: 1460, height: 450, direction: -1, spawnX: 12380, laneY: 532, intervalMs: 1700, delayMs: 880, speed: 550, lifetimeMs: 3900, damage: 2 },
  ],
}

export function getShadowRunnerLevelEnemies(level: ShadowRunnerLevelConfig) {
  return level.enemies ?? (level.enemy ? [level.enemy] : [])
}

const DEFAULT_ENEMY_CONTACT_DAMAGE: Record<ShadowRunnerEnemyKind, number> = {
  'clockwork-sentry': 2,
  'lantern-bandit-scout': 2,
  'barrel-roller': 4,
  'scroll-thief': 2,
  'tower-archer': 1,
  'candle-jester': 2,
  'moon-stalker': 3,
  'tomb-lurker': 2,
  'crypt-warden': 3,
  'rival-courier': 3,
  'gate-pikeman': 3,
  'storm-grenadier': 2,
  'moonlit-captain': 4,
}

const DEFAULT_ENEMY_PROJECTILE_DAMAGE: Partial<Record<ShadowRunnerEnemyKind, number>> = {
  'tower-archer': 3,
  'candle-jester': 2,
  'storm-grenadier': 3,
}

export function getShadowRunnerEnemyContactDamage(enemy: ShadowRunnerEnemyConfig) {
  return enemy.contactDamage ?? DEFAULT_ENEMY_CONTACT_DAMAGE[enemy.kind]
}

export function getShadowRunnerEnemyProjectileDamage(enemy: ShadowRunnerEnemyConfig) {
  return enemy.projectileDamage ?? DEFAULT_ENEMY_PROJECTILE_DAMAGE[enemy.kind] ?? 1
}

export function isShadowRunnerFinishOverlap(
  body: ShadowRunnerBodyBounds,
  finish: ShadowRunnerRect,
  options: { fallRespawnPending?: boolean; bottomGrace?: number } = {},
) {
  if (options.fallRespawnPending) return false

  const bottomGrace = options.bottomGrace ?? 26
  return body.right >= finish.x
    && body.left <= finish.x + finish.width
    && body.bottom >= finish.y
    && body.top <= finish.y + finish.height
    && body.bottom <= finish.y + finish.height + bottomGrace
}

export const SHADOW_RUNNER_LEVEL_CONFIGS: Record<ShadowRunnerPlayableLevelId, ShadowRunnerLevelConfig> = {
  tutorial: SHADOW_RUNNER_TUTORIAL_LEVEL,
  'level-1': SHADOW_RUNNER_FULL_LEVEL_ONE,
  'level-2': SHADOW_RUNNER_LEVEL_TWO,
  'level-3': SHADOW_RUNNER_LEVEL_THREE,
  'level-4': SHADOW_RUNNER_LEVEL_FOUR,
  'level-5': SHADOW_RUNNER_LEVEL_FIVE,
  'level-6': SHADOW_RUNNER_LEVEL_SIX,
  'level-7': SHADOW_RUNNER_LEVEL_SEVEN,
  'level-8': SHADOW_RUNNER_LEVEL_EIGHT,
  'level-9': SHADOW_RUNNER_LEVEL_NINE,
}

export const SHADOW_RUNNER_CAMPAIGN_LEVELS: ShadowRunnerCampaignLevel[] = [
  {
    id: 'level-1',
    levelNumber: 1,
    title: 'East Gate Run',
    objective: 'Reach the east gate',
    difficultyTier: 1,
    difficultyLabel: 'Courier Trial',
    routeType: 'Training Route',
    mechanicPreview: 'Longer gate run, two sentries, two tilt bridges, wider spike gaps',
    thumbnail: SHADOW_RUNNER_ASSETS.levels.eastGateRunThumbnail320,
    locationButton: SHADOW_RUNNER_ASSETS.levels.eastGateRunLocationButton,
    mapPosition: { left: 18, top: 59 },
    playableLevelId: 'level-1',
  },
  {
    id: 'level-2',
    levelNumber: 2,
    title: 'Lantern Market Roofs',
    objective: 'Cross the market roofs',
    difficultyTier: 2,
    difficultyLabel: 'Market Timing',
    routeType: 'Rooftop Route',
    mechanicPreview: 'Market roof chain with three sentries, faster tilt bridges, and denser spikes',
    thumbnail: SHADOW_RUNNER_ASSETS.levels.lanternMarketThumbnail320,
    locationButton: SHADOW_RUNNER_ASSETS.levels.lanternMarketLocationButton,
    mapPosition: { left: 44, top: 58 },
    playableLevelId: 'level-2',
  },
  {
    id: 'level-3',
    levelNumber: 3,
    title: 'Ivy Viaduct',
    objective: 'Cross the ivy viaduct',
    difficultyTier: 3,
    difficultyLabel: 'Bridge Pressure',
    routeType: 'Crumbling Route',
    mechanicPreview: 'Heavier barrel pressure, faster tilt bridges, tighter spike pits',
    thumbnail: SHADOW_RUNNER_ASSETS.levels.ivyViaductThumbnail320,
    locationButton: SHADOW_RUNNER_ASSETS.levels.ivyViaductLocationButton,
    mapPosition: { left: 35, top: 37 },
    playableLevelId: 'level-3',
  },
  {
    id: 'level-4',
    levelNumber: 4,
    title: 'Bell Tower Archives',
    objective: 'Find the forged order',
    difficultyTier: 4,
    difficultyLabel: 'Vertical Climb',
    routeType: 'Tower Route',
    mechanicPreview: 'Required low-clearance platforms, Tower Archers, scroll thieves, and hard bonus routes',
    thumbnail: SHADOW_RUNNER_ASSETS.levels.bellTowerThumbnail320,
    locationButton: SHADOW_RUNNER_ASSETS.levels.bellTowerLocationButton,
    mapPosition: { left: 64, top: 49 },
    playableLevelId: 'level-4',
  },
  {
    id: 'level-5',
    levelNumber: 5,
    title: 'Candle Fair Ruins',
    objective: 'Slip through the fair',
    difficultyTier: 5,
    difficultyLabel: 'Trick Hazards',
    routeType: 'Fairground Route',
    mechanicPreview: 'Shielded archer volleys, Candle Jesters, fall-risk high routes',
    thumbnail: SHADOW_RUNNER_ASSETS.levels.candleFairThumbnail320,
    locationButton: SHADOW_RUNNER_ASSETS.levels.candleFairLocationButton,
    mapPosition: { left: 77, top: 25 },
    playableLevelId: 'level-5',
  },
  {
    id: 'level-6',
    levelNumber: 6,
    title: 'Clockmaker Yard',
    objective: 'Break the gear lock',
    difficultyTier: 6,
    difficultyLabel: 'Clockwork Pace',
    routeType: 'Machine Route',
    mechanicPreview: 'Chrono Lantern time fields, Lantern Bandit Scouts, gear gauntlets',
    thumbnail: SHADOW_RUNNER_ASSETS.levels.clockmakerYardThumbnail320,
    locationButton: SHADOW_RUNNER_ASSETS.levels.clockmakerYardLocationButton,
    mapPosition: { left: 56, top: 31 },
    playableLevelId: 'level-6',
  },
  {
    id: 'level-7',
    levelNumber: 7,
    title: 'Moonlit Causeway',
    objective: 'Recover the shard',
    difficultyTier: 7,
    difficultyLabel: 'Causeway Chase',
    routeType: 'Timed Route',
    mechanicPreview: 'Moon Shards, Shadow Surge, Moon Stalkers, shield pockets, brutal tilt bridges',
    thumbnail: SHADOW_RUNNER_ASSETS.levels.moonlitCausewayThumbnail320,
    locationButton: SHADOW_RUNNER_ASSETS.levels.moonlitCausewayLocationButton,
    mapPosition: { left: 78, top: 61 },
    playableLevelId: 'level-7',
  },
  {
    id: 'level-8',
    levelNumber: 8,
    title: 'Courier Catacombs',
    objective: 'Open the relay door',
    difficultyTier: 8,
    difficultyLabel: 'Hidden Paths',
    routeType: 'Branching Route',
    mechanicPreview: 'Wraithlight paths, Mirror Ward reflections, Relay Seals, guarded ambushes',
    thumbnail: SHADOW_RUNNER_ASSETS.levels.courierCatacombsThumbnail320,
    locationButton: SHADOW_RUNNER_ASSETS.levels.courierCatacombsLocationButton,
    mapPosition: { left: 38, top: 84 },
    playableLevelId: 'level-8',
  },
  {
    id: 'level-9',
    levelNumber: 9,
    title: 'Captain Gate',
    objective: 'Recover four Watchfire Crests and defeat the Moonlit Captain',
    difficultyTier: 9,
    difficultyLabel: 'Stormwatch Siege',
    routeType: 'Fortress Assault',
    mechanicPreview: 'Storm winds, counterweight lifts, Gale Mantle, Sunsteel Edge, and the Moonlit Captain',
    thumbnail: SHADOW_RUNNER_LEVEL_NINE_ASSETS.thumbnail320,
    locationButton: SHADOW_RUNNER_LEVEL_NINE_ASSETS.locationButton,
    mapPosition: { left: 78, top: 78 },
    playableLevelId: 'level-9',
  },
  {
    id: 'level-10',
    levelNumber: 10,
    title: 'Dawn Relay Spire',
    objective: 'Light the relay',
    difficultyTier: 10,
    difficultyLabel: 'Final Relay',
    routeType: 'Finale Route',
    mechanicPreview: 'All mechanics mixed with relay timing',
    thumbnail: SHADOW_RUNNER_ASSETS.home.background,
    locationButton: SHADOW_RUNNER_ASSETS.levels.dawnRelaySpireLocationButton,
    mapPosition: { left: 88, top: 47 },
  },
]

export function getShadowRunnerLevelConfig(levelId: ShadowRunnerPlayableLevelId) {
  return SHADOW_RUNNER_LEVEL_CONFIGS[levelId]
}
