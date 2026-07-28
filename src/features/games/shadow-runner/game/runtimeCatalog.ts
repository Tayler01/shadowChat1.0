import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import type {
  ShadowRunnerEnemyKind,
  ShadowRunnerLevelConfig,
  ShadowRunnerRect,
} from './levels'

export interface ShadowRunnerTextureCrop {
  x: number
  y: number
  width: number
  height: number
}

type ShadowRunnerTerrainSet = NonNullable<ShadowRunnerRect['terrainSet']>

interface ShadowRunnerTerrainRuntime {
  textureKey: string
  asset?: string
}

interface ShadowRunnerEnemyRuntime {
  textureKey: string
  asset: string
  scale: number
  body: {
    width: number
    height: number
    offsetX: number
    offsetY: number
  }
  maxVelocityX: number
  defaultPatrolSpeed: number
  flipWhenFacingLeft: boolean
  animations: {
    walk: string
    attack: string
    hit: string
    defeated: string
  }
}

export const SHADOW_RUNNER_TERRAIN_RUNTIME: Record<ShadowRunnerTerrainSet, ShadowRunnerTerrainRuntime> = {
  stone: {
    textureKey: 'shadow-runner-terrain-atlas',
    asset: SHADOW_RUNNER_ASSETS.level.terrainAtlas,
  },
  ivy: {
    textureKey: 'shadow-runner-ivy-terrain-atlas',
    asset: SHADOW_RUNNER_ASSETS.levels.ivyViaductTerrainHazards,
  },
  bell: {
    textureKey: 'shadow-runner-bell-terrain-atlas',
    asset: SHADOW_RUNNER_ASSETS.levels.bellTowerPropsHazards,
  },
  candle: {
    textureKey: 'shadow-runner-candle-terrain-atlas',
    asset: SHADOW_RUNNER_ASSETS.levels.candleFairPropsHazards,
  },
  candleBright: {
    textureKey: 'shadow-runner-candle-readable-terrain-atlas',
    asset: SHADOW_RUNNER_ASSETS.levels.candleFairTerrainReadable,
  },
  candleShelf: {
    textureKey: 'shadow-runner-candle-readable-terrain-atlas',
    asset: SHADOW_RUNNER_ASSETS.levels.candleFairTerrainReadable,
  },
  clock: {
    textureKey: 'shadow-runner-clock-terrain-atlas',
    asset: SHADOW_RUNNER_ASSETS.levels.clockmakerYardProps,
  },
  moon: {
    textureKey: 'shadow-runner-moon-terrain-atlas',
    asset: SHADOW_RUNNER_ASSETS.levels.moonlitCausewayProps,
  },
  catacomb: {
    textureKey: 'shadow-runner-catacomb-terrain-atlas',
    asset: SHADOW_RUNNER_ASSETS.levels.courierCatacombsProps,
  },
  spectral: {
    textureKey: 'shadow-runner-catacomb-terrain-atlas',
    asset: SHADOW_RUNNER_ASSETS.levels.courierCatacombsProps,
  },
  captain: {
    textureKey: 'shadow-runner-captain-terrain-atlas',
    asset: SHADOW_RUNNER_ASSETS.levels.captainGateProps,
  },
}

export const CATACOMB_TERRAIN_CROPS: Record<string, ShadowRunnerTextureCrop> = {
  'catacomb-wide-floor': { x: 38, y: 74, width: 900, height: 136 },
  'catacomb-rubble-floor': { x: 978, y: 74, width: 510, height: 140 },
  'catacomb-medium-ledge': { x: 48, y: 266, width: 548, height: 162 },
  'catacomb-chain-bridge': { x: 662, y: 286, width: 824, height: 166 },
  'catacomb-recovery-slab': { x: 82, y: 520, width: 160, height: 98 },
  'catacomb-overhang': { x: 382, y: 482, width: 504, height: 154 },
  'catacomb-spectral-bridge': { x: 948, y: 496, width: 544, height: 138 },
  'catacomb-hidden-wall': { x: 42, y: 670, width: 226, height: 348 },
  'catacomb-relay-door': { x: 316, y: 654, width: 326, height: 366 },
  'catacomb-seal-altar': { x: 674, y: 660, width: 266, height: 360 },
  'catacomb-cache-pedestal': { x: 994, y: 690, width: 154, height: 330 },
  'catacomb-chain-anchor': { x: 1190, y: 686, width: 312, height: 334 },
}

export const CAPTAIN_GATE_TERRAIN_CROPS: Record<string, ShadowRunnerTextureCrop> = {
  'captain-wide-floor': { x: 38, y: 72, width: 830, height: 164 },
  'captain-rubble-floor': { x: 922, y: 72, width: 580, height: 166 },
  'captain-medium-ledge': { x: 40, y: 294, width: 435, height: 170 },
  'captain-counterweight-bridge': { x: 545, y: 286, width: 960, height: 182 },
  'captain-recovery-step': { x: 55, y: 526, width: 210, height: 145 },
  'captain-overhang': { x: 332, y: 522, width: 558, height: 153 },
  'captain-lift': { x: 940, y: 526, width: 494, height: 162 },
  'captain-barricade': { x: 32, y: 738, width: 255, height: 225 },
  'captain-gate': { x: 312, y: 704, width: 415, height: 275 },
  'captain-beacon': { x: 758, y: 714, width: 135, height: 268 },
  'captain-command-chest': { x: 940, y: 760, width: 250, height: 205 },
  'captain-windbreak': { x: 1184, y: 718, width: 328, height: 260 },
  'captain-arena-floor': { x: 38, y: 72, width: 830, height: 164 },
  'captain-recovery-slab': { x: 922, y: 72, width: 580, height: 166 },
  'captain-cover-plinth': { x: 32, y: 738, width: 255, height: 225 },
  'captain-chain-bridge': { x: 545, y: 286, width: 960, height: 182 },
  'captain-counterweight-lift': { x: 940, y: 526, width: 494, height: 162 },
  'captain-low-overhang': { x: 332, y: 522, width: 558, height: 153 },
}

export const SHADOW_RUNNER_ENEMY_RUNTIME: Record<ShadowRunnerEnemyKind, ShadowRunnerEnemyRuntime> = {
  'clockwork-sentry': {
    textureKey: 'clockwork-sentry',
    asset: SHADOW_RUNNER_ASSETS.enemies.clockworkSentryStrip,
    scale: 0.68,
    body: { width: 50, height: 70, offsetX: 39, offsetY: 58 },
    maxVelocityX: 128,
    defaultPatrolSpeed: 82,
    flipWhenFacingLeft: false,
    animations: {
      walk: 'sentry-walk',
      attack: 'sentry-attack',
      hit: 'sentry-hit',
      defeated: 'sentry-defeated',
    },
  },
  'lantern-bandit-scout': {
    textureKey: 'lantern-bandit-scout',
    asset: SHADOW_RUNNER_ASSETS.enemies.lanternBanditScoutStrip,
    scale: 0.62,
    body: { width: 44, height: 64, offsetX: 42, offsetY: 64 },
    maxVelocityX: 236,
    defaultPatrolSpeed: 176,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'bandit-run',
      attack: 'bandit-attack',
      hit: 'bandit-hit',
      defeated: 'bandit-defeated',
    },
  },
  'barrel-roller': {
    textureKey: 'barrel-roller',
    asset: SHADOW_RUNNER_ASSETS.enemies.barrelRollerStrip,
    scale: 0.58,
    body: { width: 58, height: 48, offsetX: 35, offsetY: 72 },
    maxVelocityX: 196,
    defaultPatrolSpeed: 132,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'barrel-roll',
      attack: 'barrel-impact',
      hit: 'barrel-hit',
      defeated: 'barrel-defeated',
    },
  },
  'scroll-thief': {
    textureKey: 'scroll-thief',
    asset: SHADOW_RUNNER_ASSETS.enemies.scrollThiefStrip,
    scale: 0.62,
    body: { width: 44, height: 62, offsetX: 42, offsetY: 66 },
    maxVelocityX: 224,
    defaultPatrolSpeed: 168,
    flipWhenFacingLeft: false,
    animations: {
      walk: 'scroll-walk',
      attack: 'scroll-attack',
      hit: 'scroll-hit',
      defeated: 'scroll-defeated',
    },
  },
  'tower-archer': {
    textureKey: 'tower-archer',
    asset: SHADOW_RUNNER_ASSETS.enemies.towerArcherStrip,
    scale: 0.66,
    body: { width: 44, height: 70, offsetX: 42, offsetY: 58 },
    maxVelocityX: 0,
    defaultPatrolSpeed: 0,
    flipWhenFacingLeft: false,
    animations: {
      walk: 'archer-ready',
      attack: 'archer-shoot',
      hit: 'archer-hit',
      defeated: 'archer-defeated',
    },
  },
  'candle-jester': {
    textureKey: 'candle-jester',
    asset: SHADOW_RUNNER_ASSETS.enemies.candleJesterStrip,
    scale: 0.64,
    body: { width: 44, height: 68, offsetX: 42, offsetY: 60 },
    maxVelocityX: 168,
    defaultPatrolSpeed: 86,
    flipWhenFacingLeft: false,
    animations: {
      walk: 'jester-dance',
      attack: 'jester-throw',
      hit: 'jester-hit',
      defeated: 'jester-defeated',
    },
  },
  'moon-stalker': {
    textureKey: 'moon-stalker',
    asset: SHADOW_RUNNER_ASSETS.enemies.moonStalkerStrip,
    scale: 0.62,
    body: { width: 42, height: 66, offsetX: 43, offsetY: 62 },
    maxVelocityX: 276,
    defaultPatrolSpeed: 184,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'stalker-run',
      attack: 'stalker-attack',
      hit: 'stalker-hit',
      defeated: 'stalker-defeated',
    },
  },
  'tomb-lurker': {
    textureKey: 'tomb-lurker',
    asset: SHADOW_RUNNER_ASSETS.enemies.tombLurkerStrip,
    scale: 0.78,
    body: { width: 44, height: 66, offsetX: 42, offsetY: 62 },
    maxVelocityX: 300,
    defaultPatrolSpeed: 138,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'lurker-active',
      attack: 'lurker-lunge',
      hit: 'lurker-hit',
      defeated: 'lurker-defeated',
    },
  },
  'crypt-warden': {
    textureKey: 'crypt-warden',
    asset: SHADOW_RUNNER_ASSETS.enemies.cryptWardenStrip,
    scale: 0.9,
    body: { width: 54, height: 82, offsetX: 37, offsetY: 46 },
    maxVelocityX: 210,
    defaultPatrolSpeed: 62,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'warden-walk',
      attack: 'warden-charge',
      hit: 'warden-hit',
      defeated: 'warden-defeated',
    },
  },
  'rival-courier': {
    textureKey: 'rival-courier',
    asset: SHADOW_RUNNER_ASSETS.enemies.rivalCourierStrip,
    scale: 0.82,
    body: { width: 42, height: 70, offsetX: 43, offsetY: 58 },
    maxVelocityX: 360,
    defaultPatrolSpeed: 196,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'rival-run',
      attack: 'rival-dash',
      hit: 'rival-hit',
      defeated: 'rival-defeated',
    },
  },
  'gate-pikeman': {
    textureKey: 'gate-pikeman',
    asset: SHADOW_RUNNER_ASSETS.enemies.gatePikemanStrip,
    scale: 0.86,
    body: { width: 50, height: 80, offsetX: 39, offsetY: 48 },
    maxVelocityX: 168,
    defaultPatrolSpeed: 72,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'pikeman-march',
      attack: 'pikeman-thrust',
      hit: 'pikeman-hit',
      defeated: 'pikeman-defeated',
    },
  },
  'storm-grenadier': {
    textureKey: 'storm-grenadier',
    asset: SHADOW_RUNNER_ASSETS.enemies.stormGrenadierStrip,
    scale: 0.78,
    body: { width: 44, height: 70, offsetX: 42, offsetY: 58 },
    maxVelocityX: 196,
    defaultPatrolSpeed: 92,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'grenadier-walk',
      attack: 'grenadier-throw',
      hit: 'grenadier-hit',
      defeated: 'grenadier-defeated',
    },
  },
  'moonlit-captain': {
    textureKey: 'watch-captain',
    asset: SHADOW_RUNNER_ASSETS.enemies.watchCaptainStrip,
    scale: 0.9,
    body: { width: 48, height: 78, offsetX: 40, offsetY: 50 },
    maxVelocityX: 336,
    defaultPatrolSpeed: 152,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'captain-guard',
      attack: 'captain-slash',
      hit: 'captain-hit',
      defeated: 'captain-defeated',
    },
  },
}

export function getShadowRunnerTerrainRuntime(terrainSet?: ShadowRunnerRect['terrainSet']) {
  return SHADOW_RUNNER_TERRAIN_RUNTIME[terrainSet ?? 'stone']
}

export function getShadowRunnerRouteRuntimeAssets(level: ShadowRunnerLevelConfig) {
  const terrainSets = new Set<ShadowRunnerTerrainSet>()
  level.platforms.forEach(platform => terrainSets.add(platform.terrainSet ?? 'stone'))
  level.tiltPlatforms?.forEach(platform => terrainSets.add(platform.terrainSet ?? 'stone'))
  level.crouchGates?.forEach(gate => terrainSets.add(gate.terrainSet ?? 'stone'))
  level.spectralPlatforms?.forEach(platform => terrainSets.add(platform.terrainSet ?? 'spectral'))
  level.movingPlatforms?.forEach(platform => terrainSets.add(platform.terrainSet ?? 'stone'))
  terrainSets.add(level.finish.terrainSet ?? 'stone')

  const isCaptainGate = (level.id as string) === 'level-9'
  const enemyKinds = (level.enemies ?? (level.enemy ? [level.enemy] : []))
    .map(enemy => enemy.kind)
  const assets = [
    level.backgroundAsset,
    ...Array.from(terrainSets, terrainSet => SHADOW_RUNNER_TERRAIN_RUNTIME[terrainSet].asset),
    ...new Set(
      enemyKinds.map(enemyKind => SHADOW_RUNNER_ENEMY_RUNTIME[enemyKind].asset),
    ),
    level.boosts?.length ? SHADOW_RUNNER_ASSETS.levels.moonheartCrestStrip : undefined,
    level.boosts?.length ? SHADOW_RUNNER_ASSETS.levels.boostAuraStrip : undefined,
    level.chronoPickups?.length ? SHADOW_RUNNER_ASSETS.levels.chronoLanternStrip : undefined,
    level.surgePickups?.length ? SHADOW_RUNNER_ASSETS.levels.shadowSurgeSigilStrip : undefined,
    level.moonShardPickups?.length ? SHADOW_RUNNER_ASSETS.levels.moonShardRelicStrip : undefined,
    level.wraithlightPickups?.length ? SHADOW_RUNNER_ASSETS.levels.wraithlightLanternStrip : undefined,
    level.mirrorWardPickups?.length ? SHADOW_RUNNER_ASSETS.levels.mirrorWardStrip : undefined,
    level.objectivePickups?.length
      ? isCaptainGate
        ? SHADOW_RUNNER_ASSETS.levels.watchfireCrestStrip
        : SHADOW_RUNNER_ASSETS.levels.relaySealStrip
      : undefined,
    level.masteryPickups?.length
      ? isCaptainGate
        ? SHADOW_RUNNER_ASSETS.levels.captainsOrdersStrip
        : SHADOW_RUNNER_ASSETS.levels.courierCacheStrip
      : undefined,
    level.galeMantlePickups?.length
      ? SHADOW_RUNNER_ASSETS.levels.galeMantleStrip
      : undefined,
    level.sunsteelEdgePickups?.length
      ? SHADOW_RUNNER_ASSETS.levels.sunsteelEdgeStrip
      : undefined,
    enemyKinds.includes('storm-grenadier')
      ? SHADOW_RUNNER_ASSETS.levels.stormBombStrip
      : undefined,
  ]

  return Array.from(new Set(assets.filter((asset): asset is string => Boolean(asset))))
}
