import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import { SHADOW_RUNNER_OPENING_WALKWAY, usesShadowRunnerOpeningArt } from './runtimeOpeningArt'
import { SHADOW_RUNNER_WAYPOST_TEXTURE } from './runtimeWayposts'
import { getShadowRunnerDistrictDepth, SHADOW_RUNNER_DEPTH_ASSETS } from './runtimeDistrictDepth'
import { getShadowRunnerStoryLandmarkAssets } from './runtimeNarrative'
import { SHADOW_RUNNER_RELAY_MASONRY, usesShadowRunnerRelayMasonry, SHADOW_RUNNER_CAPTAIN_MASONRY, usesShadowRunnerCaptainMasonry } from './runtimePlatformArt'
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
  frameCount: number
  frameSize?: number
  frameWidth?: number
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
  relay: {
    textureKey: 'shadow-runner-relay-terrain-atlas',
    asset: SHADOW_RUNNER_ASSETS.levels.dawnRelaySpireProps,
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

export const DAWN_RELAY_TERRAIN_CROPS: Record<string, ShadowRunnerTextureCrop> = {
  'relay-wide-floor': { x: 52, y: 68, width: 710, height: 174 },
  'relay-cracked-floor': { x: 818, y: 68, width: 675, height: 174 },
  'relay-moon-glass-ledge': { x: 66, y: 278, width: 392, height: 118 },
  'relay-phase-bridge': { x: 506, y: 276, width: 984, height: 122 },
  'relay-recovery-stair': { x: 76, y: 454, width: 310, height: 174 },
  'relay-conduit-overhang': { x: 446, y: 454, width: 382, height: 174 },
  'relay-lift': { x: 874, y: 410, width: 606, height: 230 },
  'relay-cover-pylon': { x: 48, y: 652, width: 150, height: 330 },
  'relay-master-gate': { x: 242, y: 646, width: 440, height: 342 },
  'relay-brazier': { x: 704, y: 648, width: 226, height: 340 },
  'relay-ignition-pedestal': { x: 962, y: 674, width: 190, height: 316 },
  'relay-beam-emitter': { x: 1188, y: 730, width: 328, height: 250 },
}

export const SHADOW_RUNNER_ENEMY_RUNTIME: Record<ShadowRunnerEnemyKind, ShadowRunnerEnemyRuntime> = {
  'clockwork-sentry': {
    textureKey: 'clockwork-sentry',
    asset: SHADOW_RUNNER_ASSETS.enemies.clockworkSentryStrip,
    frameCount: 6,
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
    frameCount: 5,
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
    frameCount: 5,
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
    frameCount: 5,
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
    frameCount: 5,
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
    frameCount: 5,
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
    frameCount: 5,
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
    frameCount: 6,
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
    frameCount: 6,
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
    frameCount: 6,
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
    frameCount: 6,
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
    frameCount: 6,
    frameWidth: 256,
    scale: 0.78,
    body: { width: 44, height: 70, offsetX: 106, offsetY: 58 },
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
    frameCount: 8,
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
  'relay-lancer': {
    textureKey: 'relay-lancer',
    asset: SHADOW_RUNNER_ASSETS.enemies.relayLancerStrip,
    frameCount: 6,
    frameWidth: 256,
    scale: 0.86,
    body: { width: 50, height: 80, offsetX: 103, offsetY: 48 },
    maxVelocityX: 228,
    defaultPatrolSpeed: 96,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'relay-lancer-march',
      attack: 'relay-lancer-strike',
      hit: 'relay-lancer-hit',
      defeated: 'relay-lancer-defeated',
    },
  },
  'prism-caster': {
    textureKey: 'prism-caster',
    asset: SHADOW_RUNNER_ASSETS.enemies.prismCasterStrip,
    frameCount: 6,
    frameWidth: 256,
    scale: 0.8,
    body: { width: 44, height: 72, offsetX: 106, offsetY: 56 },
    maxVelocityX: 154,
    defaultPatrolSpeed: 58,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'prism-caster-hover',
      attack: 'prism-caster-cast',
      hit: 'prism-caster-hit',
      defeated: 'prism-caster-defeated',
    },
  },
  'gearwing-drone': {
    textureKey: 'gearwing-drone',
    asset: SHADOW_RUNNER_ASSETS.enemies.gearwingDroneStrip,
    frameCount: 6,
    frameWidth: 256,
    frameSize: 192,
    scale: 0.76,
    body: { width: 56, height: 44, offsetX: 100, offsetY: 108 },
    maxVelocityX: 340,
    defaultPatrolSpeed: 124,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'gearwing-drone-flight',
      attack: 'gearwing-drone-dive',
      hit: 'gearwing-drone-hit',
      defeated: 'gearwing-drone-defeated',
    },
  },
  'sentry-sovereign': {
    textureKey: 'sentry-sovereign',
    asset: SHADOW_RUNNER_ASSETS.enemies.sentrySovereignStrip,
    frameCount: 10,
    frameWidth: 384,
    frameSize: 192,
    scale: 0.82,
    body: { width: 84, height: 118, offsetX: 150, offsetY: 68 },
    maxVelocityX: 390,
    defaultPatrolSpeed: 146,
    flipWhenFacingLeft: true,
    animations: {
      walk: 'sovereign-guard',
      attack: 'sovereign-attack',
      hit: 'sovereign-hit',
      defeated: 'sovereign-defeated',
    },
  },
}

export function getShadowRunnerTerrainRuntime(terrainSet?: ShadowRunnerRect['terrainSet']) {
  return SHADOW_RUNNER_TERRAIN_RUNTIME[terrainSet ?? 'stone']
}

export type ShadowRunnerRuntimeAsset = {
  key: string
  url: string
} & ({ type: 'image' } | {
  type: 'spritesheet'
  frameWidth: number
  frameHeight: number
  frameCount: number
})

function image(key: string, url: string): ShadowRunnerRuntimeAsset {
  return { type: 'image', key, url }
}

function sheet(key: string, url: string, frameWidth: number, frameCount: number, frameHeight = frameWidth): ShadowRunnerRuntimeAsset {
  return { type: 'spritesheet', key, url, frameWidth, frameHeight, frameCount }
}

export function getShadowRunnerRuntimeManifest(level: ShadowRunnerLevelConfig): ShadowRunnerRuntimeAsset[] {
  const assets = [
    image('shadow-runner-bg', level.backgroundAsset),
    sheet('shadow-runner-idle', SHADOW_RUNNER_ASSETS.hero.menuIdleCapeStrip, 128, 8),
    sheet('shadow-runner-run', SHADOW_RUNNER_ASSETS.hero.runStrip, 128, 6),
    sheet('shadow-runner-jump', SHADOW_RUNNER_ASSETS.hero.jumpAirStrip, 128, 6),
    sheet('shadow-runner-attack', SHADOW_RUNNER_ASSETS.hero.swordAttackStrip, 128, 5),
    sheet('shadow-runner-landing-dust', SHADOW_RUNNER_ASSETS.level.landingDustStrip, 64, 6),
    sheet('shadow-runner-sword-slash', SHADOW_RUNNER_ASSETS.level.swordSlashStrip, 96, 6),
    sheet('shadow-runner-coin-sparkle', SHADOW_RUNNER_ASSETS.gameplay.coinSparkleStrip, 119, 4, 145),
    image('shadow-runner-health-frame', SHADOW_RUNNER_ASSETS.gameplay.healthBarFrame),
    image('shadow-runner-hit-spark', SHADOW_RUNNER_ASSETS.gameplay.hitSpark),
    image('shadow-runner-east-gate', SHADOW_RUNNER_ASSETS.level.eastGate96),
  ]
  if (usesShadowRunnerOpeningArt(level.id) && level.platforms.some(platform => !platform.hidden)) {
    assets.push(image(SHADOW_RUNNER_OPENING_WALKWAY.textureKey, SHADOW_RUNNER_ASSETS.rebuild.silverCourierWalkway))
  }
  if (level.checkpoints?.length) assets.push(image(SHADOW_RUNNER_WAYPOST_TEXTURE, SHADOW_RUNNER_ASSETS.rebuild.courierWaypost))
  for (const key of new Set(getShadowRunnerDistrictDepth(level.id).map(prop => prop.texture))) {
    assets.push(image(key, SHADOW_RUNNER_DEPTH_ASSETS[key]))
  }
  assets.push(...getShadowRunnerStoryLandmarkAssets(level))
  if (level.platforms.some(usesShadowRunnerRelayMasonry)) assets.push(image(SHADOW_RUNNER_RELAY_MASONRY.textureKey, SHADOW_RUNNER_ASSETS.rebuild.relayMasonry))
  if (level.platforms.some(usesShadowRunnerCaptainMasonry)) assets.push(image(SHADOW_RUNNER_CAPTAIN_MASONRY.textureKey, SHADOW_RUNNER_ASSETS.rebuild.captainMasonry))
  const terrainSets = new Set<ShadowRunnerTerrainSet>()
  const terrain = [
    ...level.platforms, ...level.tiltPlatforms, ...(level.spectralPlatforms ?? []),
    ...(level.phasePlatforms ?? []), ...(level.movingPlatforms ?? []),
  ]
  terrain.forEach(platform => terrainSets.add(platform.terrainSet ?? 'stone'))
  terrainSets.add(level.finish.terrainSet ?? 'stone')
  level.crouchGates?.forEach(gate => {
    const set = gate.terrainSet
    terrainSets.add(set && ['moon', 'clock', 'catacomb', 'captain', 'relay', 'candle', 'candleBright', 'candleShelf'].includes(set) ? set : 'bell')
  })
  // These visual dependencies are selected by gameplay, not by platform terrain.
  if (level.shieldPickups?.length || terrainSets.has('candleBright') || terrainSets.has('candleShelf')) terrainSets.add('candle')
  if (level.encounters?.some(encounter => encounter.sealed)) {
    terrainSets.add(level.id === 'level-10' ? 'relay' : level.id === 'level-9' ? 'captain' : 'spectral')
  }
  const enemyKinds = (level.enemies ?? (level.enemy ? [level.enemy] : []))
    .map(enemy => enemy.kind)
  if (enemyKinds.includes('tower-archer') || level.arrowVolleys?.length) terrainSets.add('bell')
  terrainSets.forEach(set => {
    const runtime = SHADOW_RUNNER_TERRAIN_RUNTIME[set]
    if (runtime.asset) assets.push(image(runtime.textureKey, runtime.asset))
  })
  new Set(enemyKinds).forEach(kind => {
    const runtime = SHADOW_RUNNER_ENEMY_RUNTIME[kind]
    assets.push(sheet(runtime.textureKey, runtime.asset, runtime.frameWidth ?? runtime.frameSize ?? 128, runtime.frameCount, runtime.frameSize ?? 128))
  })
  if (level.tiltPlatforms.length) assets.push(image('shadow-runner-tilt-bridge', SHADOW_RUNNER_ASSETS.level.tiltBridge256))
  if (level.spikes.length) assets.push(image('shadow-runner-spike-row', SHADOW_RUNNER_ASSETS.level.spikeRow64))
  if (level.coins.length) assets.push(sheet('shadow-runner-coin', SHADOW_RUNNER_ASSETS.level.coinStrip48, 48, 8))
  if (level.boosts?.length) {
    assets.push(sheet('shadow-runner-moonheart', SHADOW_RUNNER_ASSETS.levels.moonheartCrestStrip, 64, 4))
    assets.push(sheet('shadow-runner-boost-aura', SHADOW_RUNNER_ASSETS.levels.boostAuraStrip, 128, 4))
  }
  const pickups = [
    [level.chronoPickups, 'shadow-runner-chrono-lantern', SHADOW_RUNNER_ASSETS.levels.chronoLanternStrip],
    [level.surgePickups, 'shadow-runner-shadow-surge', SHADOW_RUNNER_ASSETS.levels.shadowSurgeSigilStrip],
    [level.moonShardPickups, 'shadow-runner-moon-shard', SHADOW_RUNNER_ASSETS.levels.moonShardRelicStrip],
    [level.wraithlightPickups, 'shadow-runner-wraithlight', SHADOW_RUNNER_ASSETS.levels.wraithlightLanternStrip],
    [level.mirrorWardPickups, 'shadow-runner-mirror-ward', SHADOW_RUNNER_ASSETS.levels.mirrorWardStrip],
    [level.galeMantlePickups, 'shadow-runner-gale-mantle', SHADOW_RUNNER_ASSETS.levels.galeMantleStrip],
    [level.sunsteelEdgePickups, 'shadow-runner-sunsteel-edge', SHADOW_RUNNER_ASSETS.levels.sunsteelEdgeStrip],
    [level.dawnfireAegisPickups, 'shadow-runner-dawnfire-aegis', SHADOW_RUNNER_ASSETS.levels.dawnfireAegisStrip],
    [level.aetherStepPickups, 'shadow-runner-aether-step', SHADOW_RUNNER_ASSETS.levels.aetherStepStrip],
  ] as const
  pickups.forEach(([items, key, url]) => { if (items?.length) assets.push(sheet(key, url, 64, 4)) })
  if (level.objectivePickups?.length) {
    assets.push(level.id === 'level-10'
      ? sheet('shadow-runner-relay-flame', SHADOW_RUNNER_ASSETS.levels.relayFlameStrip, 64, 4)
      : level.id === 'level-9'
        ? sheet('shadow-runner-watchfire-crest', SHADOW_RUNNER_ASSETS.levels.watchfireCrestStrip, 64, 4)
        : sheet('shadow-runner-relay-seal', SHADOW_RUNNER_ASSETS.levels.relaySealStrip, 64, 4))
  }
  if (level.masteryPickups?.length) {
    assets.push(level.id === 'level-10'
      ? sheet('shadow-runner-last-dispatch', SHADOW_RUNNER_ASSETS.levels.lastDispatchStrip, 64, 4)
      : level.id === 'level-9'
        ? sheet('shadow-runner-captains-orders', SHADOW_RUNNER_ASSETS.levels.captainsOrdersStrip, 64, 4)
        : sheet('shadow-runner-courier-cache', SHADOW_RUNNER_ASSETS.levels.courierCacheStrip, 64, 4))
  }
  if (enemyKinds.includes('storm-grenadier')) assets.push(sheet('shadow-runner-storm-bomb', SHADOW_RUNNER_ASSETS.levels.stormBombStrip, 64, 4))
  if (enemyKinds.some(kind => kind === 'prism-caster' || kind === 'sentry-sovereign')) {
    assets.push(sheet('shadow-runner-relay-orb', SHADOW_RUNNER_ASSETS.levels.relayOrbStrip, 64, 4))
  }
  return Array.from(new Map(assets.map(asset => [asset.key, asset])).values())
}

export function getShadowRunnerRouteRuntimeAssets(level: ShadowRunnerLevelConfig) {
  return getShadowRunnerRuntimeManifest(level).map(asset => asset.url)
}
