import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'

export interface ShadowRunnerRect {
  id: string
  x: number
  y: number
  width: number
  height: number
  visualId?: string
  terrainSet?: 'stone' | 'ivy' | 'bell' | 'candle'
  hidden?: boolean
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
}

export type ShadowRunnerEnemyKind = 'clockwork-sentry' | 'barrel-roller' | 'scroll-thief' | 'tower-archer' | 'candle-jester'

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
}

export type ShadowRunnerPlayableLevelId = 'tutorial' | 'level-1' | 'level-2' | 'level-3' | 'level-4' | 'level-5'

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
  platforms: ShadowRunnerRect[]
  tiltPlatforms: ShadowRunnerTiltPlatform[]
  crouchGates?: ShadowRunnerCrouchGate[]
  spikes: ShadowRunnerRect[]
  coins: ShadowRunnerPoint[]
  boosts?: ShadowRunnerBoostPickup[]
  shieldPickups?: ShadowRunnerShieldPickup[]
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
  enemies: [
    {
      id: 'viaduct-barrel-a',
      kind: 'barrel-roller',
      x: 870,
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
  enemies: [
    {
      id: 'fair-start-sentry',
      kind: 'clockwork-sentry',
      x: 1160,
      y: 548,
      health: 4,
      maxHealth: 4,
      patrolLeft: 1058,
      patrolRight: 1264,
      direction: -1,
      patrolSpeed: 98,
    },
    {
      id: 'fair-bridge-barrel',
      kind: 'barrel-roller',
      x: 1650,
      y: 548,
      health: 3,
      maxHealth: 3,
      patrolLeft: 1535,
      patrolRight: 1855,
      direction: 1,
      patrolSpeed: 174,
    },
    {
      id: 'fair-offscreen-archer-a',
      kind: 'tower-archer',
      x: 3168,
      y: 512,
      health: 4,
      maxHealth: 4,
      patrolLeft: 3128,
      patrolRight: 3210,
      direction: -1,
      patrolSpeed: 0,
      attackRange: 720,
      attackCooldownMs: 1060,
      projectileSpeed: 500,
    },
    {
      id: 'fair-candle-jester-a',
      kind: 'candle-jester',
      x: 3565,
      y: 548,
      health: 3,
      maxHealth: 3,
      patrolLeft: 3380,
      patrolRight: 3738,
      direction: -1,
      patrolSpeed: 92,
      attackRange: 390,
      attackCooldownMs: 1160,
      projectileSpeed: 320,
    },
    {
      id: 'fair-scroll-thief-a',
      kind: 'scroll-thief',
      x: 3990,
      y: 548,
      health: 3,
      maxHealth: 3,
      patrolLeft: 3860,
      patrolRight: 4200,
      direction: 1,
      patrolSpeed: 186,
    },
    {
      id: 'fair-candle-jester-b',
      kind: 'candle-jester',
      x: 4518,
      y: 430,
      health: 3,
      maxHealth: 3,
      patrolLeft: 4385,
      patrolRight: 4668,
      direction: -1,
      patrolSpeed: 88,
      attackRange: 360,
      attackCooldownMs: 1040,
      projectileSpeed: 335,
    },
    {
      id: 'fair-high-archer',
      kind: 'tower-archer',
      x: 5246,
      y: 168,
      health: 4,
      maxHealth: 4,
      patrolLeft: 5200,
      patrolRight: 5300,
      direction: -1,
      patrolSpeed: 0,
      attackRange: 820,
      attackCooldownMs: 1040,
      projectileSpeed: 500,
    },
    {
      id: 'fair-low-barrel',
      kind: 'barrel-roller',
      x: 5845,
      y: 560,
      health: 4,
      maxHealth: 4,
      patrolLeft: 5712,
      patrolRight: 6058,
      direction: 1,
      patrolSpeed: 188,
    },
    {
      id: 'fair-candle-jester-c',
      kind: 'candle-jester',
      x: 6498,
      y: 548,
      health: 4,
      maxHealth: 4,
      patrolLeft: 6350,
      patrolRight: 6718,
      direction: -1,
      patrolSpeed: 94,
      attackRange: 420,
      attackCooldownMs: 980,
      projectileSpeed: 350,
    },
    {
      id: 'fair-gauntlet-archer',
      kind: 'tower-archer',
      x: 7468,
      y: 472,
      health: 4,
      maxHealth: 4,
      patrolLeft: 7418,
      patrolRight: 7522,
      direction: -1,
      patrolSpeed: 0,
      attackRange: 860,
      attackCooldownMs: 980,
      projectileSpeed: 530,
    },
    {
      id: 'fair-final-sentry',
      kind: 'clockwork-sentry',
      x: 8248,
      y: 548,
      health: 5,
      maxHealth: 5,
      patrolLeft: 8116,
      patrolRight: 8378,
      direction: 1,
      patrolSpeed: 106,
    },
    {
      id: 'fair-final-thief',
      kind: 'scroll-thief',
      x: 8544,
      y: 548,
      health: 3,
      maxHealth: 3,
      patrolLeft: 8430,
      patrolRight: 8665,
      direction: -1,
      patrolSpeed: 198,
    },
  ],
  finish: { id: 'fair-east-gate', x: 8752, y: 414, width: 74, height: 150 },
  platforms: [
    { id: 'fair-start-stage', visualId: 'candle-wide-stage', x: 0, y: 584, width: 518, height: 86, terrainSet: 'candle' },
    { id: 'fair-first-crouch-floor', visualId: 'candle-wide-stage', x: 560, y: 584, width: 430, height: 86, terrainSet: 'candle' },
    { id: 'fair-hidden-crouch-step-a', x: 594, y: 512, width: 58, height: 12, hidden: true },
    { id: 'fair-crouch-top-cache-a', visualId: 'candle-lintel', x: 664, y: 420, width: 244, height: 40, terrainSet: 'candle' },
    { id: 'fair-sentry-rubble', visualId: 'candle-rubble-floor', x: 1050, y: 584, width: 248, height: 70, terrainSet: 'candle' },
    { id: 'fair-bridge-entry', visualId: 'candle-small-plank', x: 1540, y: 584, width: 338, height: 70, terrainSet: 'candle' },
    { id: 'fair-shield-table-a', visualId: 'candle-high-shelf', x: 1908, y: 520, width: 184, height: 42, terrainSet: 'candle' },
    { id: 'fair-volley-floor-a', visualId: 'candle-wide-stage', x: 2050, y: 584, width: 290, height: 76, terrainSet: 'candle' },
    { id: 'fair-volley-pocket-low', visualId: 'candle-lintel', x: 2390, y: 584, width: 260, height: 70, terrainSet: 'candle' },
    { id: 'fair-volley-pocket-high', visualId: 'candle-high-shelf', x: 2598, y: 396, width: 184, height: 42, terrainSet: 'candle' },
    { id: 'fair-archer-perch-a', visualId: 'candle-hanging-shelf', x: 3084, y: 546, width: 240, height: 54, terrainSet: 'candle' },
    { id: 'fair-jester-floor-a', visualId: 'candle-wide-stage', x: 3370, y: 584, width: 430, height: 76, terrainSet: 'candle' },
    { id: 'fair-thief-floor-a', visualId: 'candle-rubble-floor', x: 3845, y: 584, width: 392, height: 70, terrainSet: 'candle' },
    { id: 'fair-candle-platform-a', visualId: 'candle-high-shelf', x: 4375, y: 466, width: 316, height: 52, terrainSet: 'candle' },
    { id: 'fair-high-step-a', visualId: 'candle-small-plank', x: 4720, y: 462, width: 172, height: 40, terrainSet: 'candle' },
    { id: 'fair-high-step-b', visualId: 'candle-small-plank', x: 4948, y: 332, width: 172, height: 40, terrainSet: 'candle' },
    { id: 'fair-high-archer-perch', visualId: 'candle-hanging-shelf', x: 5178, y: 204, width: 228, height: 44, terrainSet: 'candle' },
    { id: 'fair-high-step-c', visualId: 'candle-small-plank', x: 5488, y: 314, width: 178, height: 40, terrainSet: 'candle' },
    { id: 'fair-high-drop-floor', visualId: 'candle-rubble-floor', x: 5700, y: 596, width: 394, height: 72, terrainSet: 'candle' },
    { id: 'fair-shield-table-b', visualId: 'candle-high-shelf', x: 6190, y: 520, width: 184, height: 42, terrainSet: 'candle' },
    { id: 'fair-gauntlet-floor-a', visualId: 'candle-wide-stage', x: 6336, y: 584, width: 388, height: 76, terrainSet: 'candle' },
    { id: 'fair-gauntlet-pocket-low', visualId: 'candle-lintel', x: 6812, y: 584, width: 250, height: 72, terrainSet: 'candle' },
    { id: 'fair-gauntlet-pocket-high', visualId: 'candle-high-shelf', x: 7040, y: 386, width: 194, height: 42, terrainSet: 'candle' },
    { id: 'fair-gauntlet-archer-perch', visualId: 'candle-hanging-shelf', x: 7388, y: 508, width: 258, height: 52, terrainSet: 'candle' },
    { id: 'fair-final-entry', visualId: 'candle-rubble-floor', x: 7860, y: 584, width: 246, height: 72, terrainSet: 'candle' },
    { id: 'fair-final-floor', visualId: 'candle-wide-stage', x: 8148, y: 584, width: 484, height: 76, terrainSet: 'candle' },
    { id: 'fair-final-gate-floor', visualId: 'candle-wide-stage', x: 8660, y: 584, width: 240, height: 76, terrainSet: 'candle' },
  ],
  tiltPlatforms: [
    { id: 'fair-tilt-bridge-a', x: 1324, y: 516, width: 162, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 640, wobbleRotation: 0.21, slideForce: 1900, maxSlideSpeed: 270 },
    { id: 'fair-high-tilt', x: 5338, y: 276, width: 150, height: 28, visualHeight: 50, visualOffsetY: -12, wobbleDurationMs: 610, wobbleRotation: 0.22, slideForce: 1980, maxSlideSpeed: 292 },
    { id: 'fair-final-tilt', x: 7688, y: 492, width: 154, height: 28, visualHeight: 50, visualOffsetY: -12, wobbleDurationMs: 580, wobbleRotation: 0.235, slideForce: 2080, maxSlideSpeed: 310 },
  ],
  crouchGates: [
    { id: 'fair-low-canopy-a', x: 642, y: 414, width: 284, height: 116, terrainSet: 'candle' },
    { id: 'fair-volley-low-cover-a', x: 2436, y: 424, width: 180, height: 106, terrainSet: 'candle' },
    { id: 'fair-gauntlet-low-cover-a', x: 6856, y: 424, width: 164, height: 106, terrainSet: 'candle' },
  ],
  spikes: [
    { id: 'fair-start-pit', x: 1000, y: 612, width: 72, height: 28 },
    { id: 'fair-tilt-pit-a', x: 1288, y: 612, width: 72, height: 28 },
    { id: 'fair-tilt-pit-b', x: 1490, y: 612, width: 58, height: 28 },
    { id: 'fair-volley-spikes-a', x: 2342, y: 612, width: 46, height: 28 },
    { id: 'fair-jester-spikes-a', x: 3798, y: 610, width: 48, height: 28 },
    { id: 'fair-high-drop-spikes-a', x: 5660, y: 628, width: 42, height: 28 },
    { id: 'fair-gauntlet-spikes-a', x: 6728, y: 610, width: 82, height: 28 },
    { id: 'fair-gauntlet-spikes-b', x: 7240, y: 610, width: 74, height: 28 },
    { id: 'fair-final-tilt-spikes-a', x: 7612, y: 612, width: 72, height: 28 },
    { id: 'fair-final-tilt-spikes-b', x: 7856, y: 612, width: 74, height: 28 },
    { id: 'fair-final-spikes', x: 8634, y: 610, width: 38, height: 28 },
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
    { id: 'candle-ward-first-volley', x: 1986, y: 460, scoreValue: 90, durationMs: 9500, guardCharges: 5 },
    { id: 'candle-ward-gauntlet', x: 6266, y: 460, scoreValue: 95, durationMs: 10200, guardCharges: 6 },
    { id: 'candle-ward-final-bridge', x: 7918, y: 520, scoreValue: 85, durationMs: 7600, guardCharges: 4 },
  ],
  arrowVolleys: [
    { id: 'fair-volley-a-head', x: 1940, y: 184, width: 1180, height: 392, direction: -1, spawnX: 3240, laneY: 448, intervalMs: 1180, delayMs: 0, speed: 520, lifetimeMs: 3400 },
    { id: 'fair-volley-a-crouch', x: 1940, y: 184, width: 1180, height: 392, direction: -1, spawnX: 3240, laneY: 514, intervalMs: 1420, delayMs: 420, speed: 500, lifetimeMs: 3400 },
    { id: 'fair-volley-a-jump', x: 1940, y: 184, width: 1180, height: 392, direction: -1, spawnX: 3240, laneY: 332, intervalMs: 1560, delayMs: 760, speed: 545, lifetimeMs: 3400 },
    { id: 'fair-volley-a-high', x: 2260, y: 160, width: 760, height: 330, direction: -1, spawnX: 3240, laneY: 270, intervalMs: 1840, delayMs: 1040, speed: 560, lifetimeMs: 3200 },
    { id: 'fair-volley-b-head', x: 6240, y: 188, width: 1260, height: 396, direction: -1, spawnX: 7580, laneY: 438, intervalMs: 980, delayMs: 180, speed: 560, lifetimeMs: 3600 },
    { id: 'fair-volley-b-crouch', x: 6240, y: 188, width: 1260, height: 396, direction: -1, spawnX: 7580, laneY: 514, intervalMs: 1240, delayMs: 560, speed: 540, lifetimeMs: 3600 },
    { id: 'fair-volley-b-jump', x: 6240, y: 188, width: 1260, height: 396, direction: -1, spawnX: 7580, laneY: 316, intervalMs: 1320, delayMs: 900, speed: 585, lifetimeMs: 3600 },
    { id: 'fair-volley-b-high', x: 6760, y: 150, width: 740, height: 338, direction: -1, spawnX: 7580, laneY: 252, intervalMs: 1540, delayMs: 1220, speed: 600, lifetimeMs: 3400 },
  ],
}

export function getShadowRunnerLevelEnemies(level: ShadowRunnerLevelConfig) {
  return level.enemies ?? (level.enemy ? [level.enemy] : [])
}

export const SHADOW_RUNNER_LEVEL_CONFIGS: Record<ShadowRunnerPlayableLevelId, ShadowRunnerLevelConfig> = {
  tutorial: SHADOW_RUNNER_TUTORIAL_LEVEL,
  'level-1': SHADOW_RUNNER_FULL_LEVEL_ONE,
  'level-2': SHADOW_RUNNER_LEVEL_TWO,
  'level-3': SHADOW_RUNNER_LEVEL_THREE,
  'level-4': SHADOW_RUNNER_LEVEL_FOUR,
  'level-5': SHADOW_RUNNER_LEVEL_FIVE,
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
    mechanicPreview: 'Faster platforms, gears, guarded switches',
    thumbnail: SHADOW_RUNNER_ASSETS.home.background,
    locationButton: SHADOW_RUNNER_ASSETS.levels.clockmakerYardLocationButton,
    mapPosition: { left: 56, top: 31 },
  },
  {
    id: 'level-7',
    levelNumber: 7,
    title: 'Moonlit Causeway',
    objective: 'Recover the shard',
    difficultyTier: 7,
    difficultyLabel: 'Causeway Chase',
    routeType: 'Timed Route',
    mechanicPreview: 'Moving bridges, chase pressure, spike gaps',
    thumbnail: SHADOW_RUNNER_ASSETS.home.background,
    locationButton: SHADOW_RUNNER_ASSETS.levels.moonlitCausewayLocationButton,
    mapPosition: { left: 78, top: 61 },
  },
  {
    id: 'level-8',
    levelNumber: 8,
    title: 'Courier Catacombs',
    objective: 'Open the relay door',
    difficultyTier: 8,
    difficultyLabel: 'Hidden Paths',
    routeType: 'Branching Route',
    mechanicPreview: 'Secret chambers, optional shards, ambushes',
    thumbnail: SHADOW_RUNNER_ASSETS.home.background,
    locationButton: SHADOW_RUNNER_ASSETS.levels.courierCatacombsLocationButton,
    mapPosition: { left: 38, top: 84 },
  },
  {
    id: 'level-9',
    levelNumber: 9,
    title: 'Captain Gate',
    objective: 'Survive the watch',
    difficultyTier: 9,
    difficultyLabel: 'Captain Watch',
    routeType: 'Boss Gate',
    mechanicPreview: 'Mixed patrols, ranged pressure, captain duel',
    thumbnail: SHADOW_RUNNER_ASSETS.home.background,
    locationButton: SHADOW_RUNNER_ASSETS.levels.captainGateLocationButton,
    mapPosition: { left: 78, top: 78 },
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
