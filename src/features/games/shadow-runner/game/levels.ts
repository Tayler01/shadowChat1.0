import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'

export interface ShadowRunnerRect {
  id: string
  x: number
  y: number
  width: number
  height: number
  visualId?: string
  terrainSet?: 'stone' | 'ivy'
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

export type ShadowRunnerEnemyKind = 'clockwork-sentry' | 'barrel-roller'

export interface ShadowRunnerEnemyConfig extends ShadowRunnerPoint {
  kind: ShadowRunnerEnemyKind
  health: number
  maxHealth: number
  patrolLeft: number
  patrolRight: number
  direction: 1 | -1
  patrolSpeed?: number
}

export type ShadowRunnerPlayableLevelId = 'tutorial' | 'level-1' | 'level-2' | 'level-3'

export interface ShadowRunnerLevelConfig {
  id: ShadowRunnerPlayableLevelId
  campaignLevel?: number
  title: string
  subtitle: string
  objective: string
  completionLine: string
  backgroundAsset: string
  worldWidth: number
  worldHeight: number
  playerStart: ShadowRunnerPoint
  platforms: ShadowRunnerRect[]
  tiltPlatforms: ShadowRunnerTiltPlatform[]
  spikes: ShadowRunnerRect[]
  coins: ShadowRunnerPoint[]
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
    { id: 'tilt-bridge', x: 1020, y: 354, width: 168, height: 28, visualHeight: 54, visualOffsetY: 2, wobbleDurationMs: 1250, wobbleRotation: 0.075 },
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
  completionLine: 'East Gate Run cleared.',
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
  completionLine: 'The market rooftops are clear.',
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
  objective: 'Hold the broken bridges',
  completionLine: 'Ivy Viaduct secured.',
  backgroundAsset: SHADOW_RUNNER_ASSETS.levels.ivyViaductBackground,
  worldWidth: 3860,
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
      patrolLeft: 700,
      patrolRight: 1070,
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
      patrolLeft: 1645,
      patrolRight: 2035,
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
  ],
  finish: { id: 'viaduct-east-gate', x: 3708, y: 280, width: 74, height: 150 },
  platforms: [
    { id: 'ivy-west-walkway', x: 0, y: 428, width: 560, height: 72, terrainSet: 'ivy' },
    { id: 'ivy-stone-step-a', x: 652, y: 392, width: 170, height: 42, terrainSet: 'ivy' },
    { id: 'ivy-barrel-lane-a', visualId: 'ivy-bridge-a', x: 890, y: 420, width: 330, height: 64, terrainSet: 'ivy' },
    { id: 'ivy-upper-shelf-a', x: 1135, y: 284, width: 176, height: 34, terrainSet: 'ivy' },
    { id: 'ivy-plank-lane-a', visualId: 'ivy-plank-a', x: 1480, y: 416, width: 520, height: 58, terrainSet: 'ivy' },
    { id: 'ivy-stone-step-b', visualId: 'ivy-stone-step-a', x: 2110, y: 376, width: 168, height: 42, terrainSet: 'ivy' },
    { id: 'ivy-sentry-lane', visualId: 'ivy-center-arch', x: 2390, y: 412, width: 470, height: 72, terrainSet: 'ivy' },
    { id: 'ivy-plank-lane-b', visualId: 'ivy-plank-b', x: 3000, y: 424, width: 520, height: 58, terrainSet: 'ivy' },
    { id: 'ivy-final-ledge', visualId: 'ivy-east-ledge', x: 3588, y: 404, width: 272, height: 76, terrainSet: 'ivy' },
  ],
  tiltPlatforms: [
    { id: 'ivy-tilt-bridge-a', x: 1286, y: 352, width: 166, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 960, wobbleRotation: 0.115, slideForce: 1080, maxSlideSpeed: 142 },
    { id: 'ivy-tilt-bridge-b', x: 2288, y: 348, width: 158, height: 28, visualHeight: 52, visualOffsetY: -12, wobbleDurationMs: 820, wobbleRotation: 0.13, slideForce: 1180, maxSlideSpeed: 158 },
    { id: 'ivy-tilt-bridge-c', x: 2862, y: 360, width: 150, height: 28, visualHeight: 50, visualOffsetY: -12, wobbleDurationMs: 760, wobbleRotation: 0.145, slideForce: 1260, maxSlideSpeed: 172 },
  ],
  spikes: [
    { id: 'ivy-start-spikes', x: 538, y: 438, width: 112, height: 28 },
    { id: 'ivy-bridge-spikes-a', x: 1216, y: 438, width: 92, height: 28 },
    { id: 'ivy-mid-spikes', x: 2006, y: 438, width: 102, height: 28 },
    { id: 'ivy-sentry-spikes', x: 2784, y: 394, width: 76, height: 24 },
    { id: 'ivy-final-spikes', x: 3512, y: 438, width: 74, height: 28 },
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
    objective: 'Hold the broken bridges',
    difficultyTier: 3,
    difficultyLabel: 'Bridge Pressure',
    routeType: 'Crumbling Route',
    mechanicPreview: 'Falling stones, barrels, tighter spike pits',
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
    mechanicPreview: 'Narrow ledges, arrow slits, scroll thieves',
    thumbnail: SHADOW_RUNNER_ASSETS.levels.bellTowerThumbnail320,
    locationButton: SHADOW_RUNNER_ASSETS.levels.bellTowerLocationButton,
    mapPosition: { left: 64, top: 49 },
  },
  {
    id: 'level-5',
    levelNumber: 5,
    title: 'Candle Fair Ruins',
    objective: 'Slip through the fair',
    difficultyTier: 5,
    difficultyLabel: 'Trick Hazards',
    routeType: 'Fairground Route',
    mechanicPreview: 'Fake pickups, candle traps, jester tricks',
    thumbnail: SHADOW_RUNNER_ASSETS.levels.candleFairThumbnail320,
    locationButton: SHADOW_RUNNER_ASSETS.levels.candleFairLocationButton,
    mapPosition: { left: 77, top: 25 },
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
