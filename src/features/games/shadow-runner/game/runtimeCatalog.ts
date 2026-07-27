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
}

export function getShadowRunnerTerrainRuntime(terrainSet?: ShadowRunnerRect['terrainSet']) {
  return SHADOW_RUNNER_TERRAIN_RUNTIME[terrainSet ?? 'stone']
}

export function getShadowRunnerRouteRuntimeAssets(level: ShadowRunnerLevelConfig) {
  const terrainSets = new Set<ShadowRunnerTerrainSet>()
  level.platforms.forEach(platform => terrainSets.add(platform.terrainSet ?? 'stone'))
  level.crouchGates?.forEach(gate => terrainSets.add(gate.terrainSet ?? 'stone'))
  level.spectralPlatforms?.forEach(platform => terrainSets.add(platform.terrainSet ?? 'spectral'))
  terrainSets.add(level.finish.terrainSet ?? 'stone')

  const assets = [
    level.backgroundAsset,
    ...Array.from(terrainSets, terrainSet => SHADOW_RUNNER_TERRAIN_RUNTIME[terrainSet].asset),
    ...new Set(
      (level.enemies ?? (level.enemy ? [level.enemy] : []))
        .map(enemy => SHADOW_RUNNER_ENEMY_RUNTIME[enemy.kind].asset),
    ),
    level.boosts?.length ? SHADOW_RUNNER_ASSETS.levels.moonheartCrestStrip : undefined,
    level.boosts?.length ? SHADOW_RUNNER_ASSETS.levels.boostAuraStrip : undefined,
    level.chronoPickups?.length ? SHADOW_RUNNER_ASSETS.levels.chronoLanternStrip : undefined,
    level.surgePickups?.length ? SHADOW_RUNNER_ASSETS.levels.shadowSurgeSigilStrip : undefined,
    level.moonShardPickups?.length ? SHADOW_RUNNER_ASSETS.levels.moonShardRelicStrip : undefined,
    level.wraithlightPickups?.length ? SHADOW_RUNNER_ASSETS.levels.wraithlightLanternStrip : undefined,
    level.mirrorWardPickups?.length ? SHADOW_RUNNER_ASSETS.levels.mirrorWardStrip : undefined,
    level.objectivePickups?.length ? SHADOW_RUNNER_ASSETS.levels.relaySealStrip : undefined,
    level.masteryPickups?.length ? SHADOW_RUNNER_ASSETS.levels.courierCacheStrip : undefined,
  ]

  return Array.from(new Set(assets.filter((asset): asset is string => Boolean(asset))))
}
