import Phaser from 'phaser'
import {
  createTiltBridgeGeometry, updateTiltBridgeGeometry, getTiltBridgeContactIndex,
  getTiltBridgeDownhillAcceleration, DEFAULT_TILT_BRIDGE_DECK,
  type TiltBridgeGeometry, type TiltBridgePose,
} from './runtimeTiltBridge'
import {
  getShadowRunnerReachedMoments,
  getShadowRunnerStoryLandmarks,
  SHADOW_RUNNER_STORY_LANDMARK_DEPTH,
} from './runtimeNarrative'
import { getShadowRunnerDistrictDepth, getShadowRunnerDepthPropX, type ShadowRunnerDepthProp } from './runtimeDistrictDepth'
import {
  applyShadowRunnerMovingPlatformCarry,
  getShadowRunnerMovingPlatformStep,
  planShadowRunnerMovingPlatformCarry,
} from './runtimeMovingPlatform'
import { getShadowRunnerWaypostAppearance, getShadowRunnerWaypostPlacement, SHADOW_RUNNER_WAYPOST_TEXTURE } from './runtimeWayposts'
import { configureShadowRunnerPickupBody, syncShadowRunnerPickupBody } from './runtimePickupBodies'
import { getShadowRunnerPlatformArtLayout, SHADOW_RUNNER_PLATFORM_CONTACTS, SHADOW_RUNNER_RELAY_MASONRY, usesShadowRunnerRelayMasonry, SHADOW_RUNNER_CAPTAIN_MASONRY, usesShadowRunnerCaptainMasonry } from './runtimePlatformArt'
import type { ShadowRunnerSoundEvent } from '../audio'
import type { ShadowRunnerInputRef } from './input'
import {
  getShadowRunnerOpeningBackdropLayout,
  getShadowRunnerOpeningBackdropX,
  getShadowRunnerWalkwayPatches,
  SHADOW_RUNNER_OPENING_WALKWAY,
  usesShadowRunnerOpeningArt,
  usesShadowRunnerDepthBackdrop,
  type ShadowRunnerBackdropLayout,
  type ShadowRunnerMasonryArt,
} from './runtimeOpeningArt'
import {
  advanceShadowRunnerActiveTime,
  canShadowRunnerStand,
  canShadowRunnerSwordHit,
  createShadowRunnerSpectralGrace,
  findShadowRunnerCheckpoint,
  getShadowRunnerBeamCycle,
  getShadowRunnerEncounterRecoveryIds,
  getShadowRunnerLandingDamage,
  getShadowRunnerReflectedVelocity,
  isShadowRunnerEncounterReentered,
  SHADOW_RUNNER_HAZARD_HITBOXES,
  shouldShadowRunnerCrouch,
  updateShadowRunnerSpectralGrace,
} from './runtimeReliability'
import {
  getShadowRunnerLevelConfig,
  getShadowRunnerLevelEnemies,
  getShadowRunnerEnemyContactDamage,
  getShadowRunnerEnemyProjectileDamage,
  isShadowRunnerFinishOverlap,
  type ShadowRunnerArrowVolley,
  type ShadowRunnerBoostPickup,
  type ShadowRunnerChronoPickup,
  type ShadowRunnerDawnfireAegisPickup,
  type ShadowRunnerEnemyConfig,
  type ShadowRunnerEnemyKind,
  type ShadowRunnerEncounterConfig,
  type ShadowRunnerGaleMantlePickup,
  type ShadowRunnerLevelConfig,
  type ShadowRunnerMasteryPickup,
  type ShadowRunnerMirrorWardPickup,
  type ShadowRunnerMovingPlatform,
  type ShadowRunnerPhasePlatform,
  type ShadowRunnerRelayBeamZone,
  type ShadowRunnerMoonShardPickup,
  type ShadowRunnerObjectivePickup,
  type ShadowRunnerPlayableLevelId,
  type ShadowRunnerShieldPickup,
  type ShadowRunnerSunsteelEdgePickup,
  type ShadowRunnerSurgePickup,
  type ShadowRunnerAetherStepPickup,
  type ShadowRunnerTiltPlatform,
  type ShadowRunnerWindZone,
  type ShadowRunnerWraithlightPickup,
} from './levels'
import {
  CAPTAIN_GATE_TERRAIN_CROPS,
  CATACOMB_TERRAIN_CROPS,
  DAWN_RELAY_TERRAIN_CROPS,
  SHADOW_RUNNER_ENEMY_RUNTIME,
  getShadowRunnerRuntimeManifest,
  getShadowRunnerTerrainRuntime,
  type ShadowRunnerRuntimeAsset,
} from './runtimeCatalog'
import {
  getShadowRunnerRuntimeLoadProgress,
  isShadowRunnerRuntimeAssetReady,
  queueShadowRunnerRuntimeAssets,
  type ShadowRunnerRuntimeLoadProgress,
} from './runtimeLoading'
import {
  blockShadowRunnerProjectileWithShield,
  collectShadowRunnerBoost,
  collectShadowRunnerChrono,
  collectShadowRunnerCoin,
  collectShadowRunnerDawnfireAegis,
  collectShadowRunnerGaleMantle,
  collectShadowRunnerMastery,
  collectShadowRunnerMirrorWard,
  collectShadowRunnerMoonShard,
  collectShadowRunnerObjective,
  collectShadowRunnerShield,
  collectShadowRunnerSunsteelEdge,
  collectShadowRunnerSurge,
  collectShadowRunnerAetherStep,
  collectShadowRunnerWraithlight,
  createInitialShadowRunnerSimulation,
  consumeShadowRunnerSunsteelCharge,
  damageShadowRunnerEnemy,
  damageShadowRunnerPlayer,
  doesShadowRunnerAetherPreventFallDamage,
  getShadowRunnerEncounterBarrierState,
  getShadowRunnerGaleFallDamageCap,
  getShadowRunnerGaleSpeedMultiplier,
  getShadowRunnerAetherExtraAirJumps,
  getShadowRunnerAetherSpeedMultiplier,
  getShadowRunnerDawnfireProperties,
  getShadowRunnerHudState,
  getShadowRunnerChronoTimeScale,
  getShadowRunnerSurgeSpeedMultiplier,
  getShadowRunnerSunsteelStrikeProperties,
  isShadowRunnerBoostActive,
  isShadowRunnerChronoActive,
  isShadowRunnerDawnfireAegisActive,
  isShadowRunnerGaleMantleActive,
  isShadowRunnerMirrorWardActive,
  isShadowRunnerShieldActive,
  isShadowRunnerSurgeActive,
  isShadowRunnerSunsteelEdgeActive,
  isShadowRunnerAetherStepActive,
  isShadowRunnerWraithlightActive,
  reflectShadowRunnerProjectileWithMirrorWard,
  restoreShadowRunnerPlayer,
  spendShadowRunnerLife,
  type ShadowRunnerEnemyState,
  type ShadowRunnerHudState,
  type ShadowRunnerSimulationState,
} from './simulation'

interface CreateShadowRunnerGameOptions {
  parent: HTMLElement
  input: ShadowRunnerInputRef
  levelId?: ShadowRunnerPlayableLevelId
  onHudChange: (state: ShadowRunnerHudState) => void
  onReady?: () => void
  onLoadError?: (error: Error) => void
  onLoadProgress?: (progress: ShadowRunnerRuntimeLoadProgress) => void
  onSoundEvent?: (event: ShadowRunnerSoundEvent) => void
  onStoryMoment?: (momentId: string) => void
  reducedMotion?: boolean
  startPaused?: boolean
}

export type ShadowRunnerPhaserGameHandle = Phaser.Game & {
  setPaused: (paused: boolean) => void
  setReducedMotion: (reducedMotion: boolean) => void
}

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys

const GAME_WIDTH = 960
const GAME_HEIGHT = 540
const HERO_SCALE = 0.78
const PLAYER_SPEED = 260
const CRAWL_SPEED = 112
const JUMP_VELOCITY = -620
const DOUBLE_JUMP_VELOCITY = -560
const GRAVITY_Y = 1640
const TILT_PHYSICS_DELTA = 1 / 60
const TILT_CAMERA_MARGIN = 320
const TILT_BODY_BUDGET = 512
const TILT_DEBUG_BRIDGE_LIMIT = 16
const ARCHER_PROJECTILE_LIFETIME_MS = 2600
const CANDLE_PROJECTILE_LIFETIME_MS = 1700
const CANDLE_HAZARD_LIFETIME_MS = 1450
const STORM_BOMB_LIFETIME_MS = 2600
const STORM_HAZARD_LIFETIME_MS = 1250
const DRONE_WARNING_MS = 300
const DRONE_DIVE_MS = 580
const DRONE_DIVE_SPEED_X = 225

interface TextureCrop {
  x: number
  y: number
  width: number
  height: number
}

interface ShadowRunnerDebugSnapshot {
  levelId: ShadowRunnerPlayableLevelId
  deliveryState: NonNullable<ShadowRunnerHudState['deliveryState']>
  activeTimeMs: number
  attackId: number
  attackHitEnemyIds: string[]
  deadlines: { attackUntil: number; attackCooldownUntil: number; spectralGraceUntil: number }
  entityCounts: { displayObjects: number; enemies: number; tweens: number }
  tiltBridges: {
    totalBridgeCount: number
    activeBodyCount: number
    bridges: Array<{
      id: string
      /** Radians; endpoints and surface heights are unrounded world pixels. */
      visualRotation: number
      left: { x: number; y: number }
      right: { x: number; y: number }
      maxSurfaceError: number
      activeBodyCount: number
    }>
    /** Last Arcade-confirmed cap top, not a geometry-only grounding guess. */
    playerSupport: { bridgeId: string; surfaceY: number } | null
  }
  openingArt?: {
    walkwayReady: boolean
    platforms: Array<{ id: string; x: number; y: number; width: number; height: number; texture: string }>
    backdrop?: { x: number; y: number; width: number; height: number; travelX: number; frozen: boolean }
  }
  districtDepth?: Array<{ id: string; x: number; y: number; width: number; height: number; alpha: number; frozen: boolean }>
  checkpointId?: string
  collectedPowerIds: string[]
  wayposts?: Array<{ id: string; x: number; y: number; width: number; height: number; tint: number; alpha: number }>
  objective: string
  respawnPending: boolean
  player?: {
    x: number
    y: number
    velocityX: number
    velocityY: number
    bodyTop: number
    bodyBottom: number
    bodyLeft: number
    bodyRight: number
    bodyHeight: number
    crouchInput: boolean
    crouching: boolean
    standingBlocked: boolean
    health: number
    lives: number
    checkpointRespawns: number
    coins: number
    score: number
    shieldActive: boolean
    shieldRemainingMs: number
    shieldGuardCharges: number
    chronoActive: boolean
    chronoRemainingMs: number
    surgeActive: boolean
    surgeRemainingMs: number
    wraithlightActive: boolean
    wraithlightRemainingMs: number
    mirrorWardActive: boolean
    mirrorWardRemainingMs: number
    mirrorWardCharges: number
    galeMantleActive: boolean
    galeMantleRemainingMs: number
    sunsteelEdgeActive: boolean
    sunsteelEdgeRemainingMs: number
    sunsteelEdgeCharges: number
    dawnfireAegisActive: boolean
    dawnfireAegisRemainingMs: number
    aetherStepActive: boolean
    aetherStepRemainingMs: number
    moonShards: number
    totalMoonShards: number
    objectiveItems: number
    totalObjectiveItems: number
    masteryItems: number
    totalMasteryItems: number
  }
  enemies: Array<{
    id: string
    kind: ShadowRunnerEnemyKind
    alive: boolean
    x: number
    y: number
    velocityX: number
    velocityY: number
    health: number
    maxHealth: number
    patrolLeft: number
    patrolRight: number
    direction: 1 | -1
    guard: number
    maxGuard: number
    activated: boolean
    bossPhaseId?: string
    bossPhaseLabel?: string
  }>
  encounters: Array<{
    id: string
    sealed: boolean
    barrierActive: boolean
    cleared: boolean
    remainingEnemies: number
  }>
  pools: {
    projectiles: { active: number; total: number; stormBombs: number }
    candleHazards: { active: number; total: number; stormHazards: number }
  }
  /** Visible, enabled floor-hazard collision bounds in unrounded world pixels. */
  floorHazards: Array<{ kind: 'candle' | 'storm'; left: number; right: number; top: number; bottom: number }>
  /** Visible grenade landing markers, separate from damaging collision bodies. */
  stormWarnings: Array<{ left: number; right: number; top: number; bottom: number }>
  /** Only visible hostile arrows; no off-camera projectiles or emitter clocks. */
  visibleArrows: Array<{ left: number; right: number; top: number; bottom: number; velocityX: number; velocityY: number }>
  windZones: Array<{
    id: string
    active: boolean
    telling: boolean
    direction: 1 | -1
  }>
  movingPlatforms: Array<{
    id: string
    x: number
    y: number
    direction: 1 | -1
    paused: boolean
    pauseRemainingMs: number
  }>
  phasePlatforms: Array<{
    id: string
    state: 'solid' | 'warning' | 'intangible' | null
  }>
  relayBeamZones: Array<{
    id: string
    state: 'idle' | 'telling' | 'active' | null
    lanes: number[]
  }>
}

type ShadowRunnerDebugWindow = Window & typeof globalThis & {
  __shadowRunnerDebug?: () => ShadowRunnerDebugSnapshot
  __shadowRunnerQa?: {
    teleport: (x: number, y: number) => void
    restore: () => void
    damage: (amount: number) => void
    collect: (
      kind: 'shield' | 'wraithlight' | 'mirrorWard' | 'galeMantle' | 'sunsteelEdge' | 'dawnfireAegis' | 'aetherStep' | 'objective' | 'mastery',
      index?: number,
    ) => void
    defeatEnemy: (enemyId: string) => void
    damageEnemy: (enemyId: string, amount: number) => void
    fireAtPlayer: () => void
    stormAtPlayer: () => void
    move: (direction: 'left' | 'right', pressed: boolean) => void
  }
}

interface PlatformVisualOptions {
  texture?: string
  frame?: string | number
  useImage?: boolean
  hidden?: boolean
  displayWidth?: number
  displayHeight?: number
  visualOffsetY?: number
  depth?: number
}

type PlatformVisual = Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite | Phaser.GameObjects.Rectangle

interface TiltPlatformRuntime {
  config: ShadowRunnerTiltPlatform
  visual: PlatformVisual
  pose: TiltBridgePose
  geometry: TiltBridgeGeometry
  nextGeometry: TiltBridgeGeometry
  startRotation: number
  endRotation: number
  bodies: Phaser.Physics.Arcade.Body[]
}

interface TiltActorRuntime {
  body: Phaser.Physics.Arcade.Body
  support: TiltPlatformRuntime | null
  supportY: number
  selected: TiltPlatformRuntime | null
  selectedIndex: number
  collided: boolean
  driveX: number
  slipX: number
  controlled: boolean
  dragX: number
  accelerationX: number
  maxVelocityX: number
  collider: Phaser.Physics.Arcade.Collider
}

interface ArrowVolleyRuntime {
  config: ShadowRunnerArrowVolley
  nextShotAt: number
  armed: boolean
}

interface SpectralPlatformRuntime {
  config: NonNullable<ShadowRunnerLevelConfig['spectralPlatforms']>[number]
  visual: PlatformVisual
  collider?: Phaser.GameObjects.Rectangle
}

interface PhasePlatformRuntime {
  config: ShadowRunnerPhasePlatform
  visual: PlatformVisual
  collider?: Phaser.GameObjects.Rectangle
  state: 'solid' | 'warning' | 'intangible' | null
}

interface MovingPlatformRuntime {
  config: ShadowRunnerMovingPlatform
  visual: PlatformVisual
  visualOffsetY: number
  collider?: Phaser.GameObjects.Rectangle
  startX: number
  startY: number
  endX: number
  endY: number
  direction: 1 | -1
  pauseUntil: number
  lastX: number
  lastY: number
}

interface WindZoneRuntime {
  config: ShadowRunnerWindZone
  visual: Phaser.GameObjects.Graphics
  active: boolean
  telling: boolean
  renderState: 'idle' | 'telling' | 'active' | null
}

interface RelayBeamZoneRuntime {
  config: ShadowRunnerRelayBeamZone
  visual: Phaser.GameObjects.Graphics
  state: 'idle' | 'telling' | 'active' | null
  activatedAt: number | null
  lastGuardedCycle: number
}

interface EncounterBarrierRuntime {
  encounterId: string
  enemyIds: string[]
  visual: PlatformVisual
  collider?: Phaser.GameObjects.Rectangle
  active: boolean
}

const TERRAIN_CROPS: Record<string, TextureCrop> = {
  'west-walkway': { x: 48, y: 113, width: 368, height: 162 },
  'broken-step-a': { x: 463, y: 113, width: 340, height: 162 },
  'broken-step-b': { x: 864, y: 106, width: 351, height: 194 },
  'center-walkway': { x: 48, y: 113, width: 368, height: 162 },
  'east-ledge': { x: 864, y: 106, width: 351, height: 194 },
  'upper-coin-shelf': { x: 493, y: 368, width: 258, height: 178 },
}

const IVY_TERRAIN_CROPS: Record<string, TextureCrop> = {
  'ivy-west-walkway': { x: 42, y: 58, width: 500, height: 150 },
  'ivy-stone-step-a': { x: 1188, y: 92, width: 138, height: 90 },
  'ivy-bridge-a': { x: 44, y: 420, width: 224, height: 104 },
  'ivy-upper-shelf-a': { x: 437, y: 238, width: 96, height: 144 },
  'ivy-plank-a': { x: 322, y: 421, width: 202, height: 104 },
  'ivy-center-arch': { x: 46, y: 235, width: 346, height: 154 },
  'ivy-plank-b': { x: 570, y: 420, width: 214, height: 100 },
  'ivy-east-ledge': { x: 785, y: 62, width: 246, height: 130 },
}

const BELL_TERRAIN_CROPS: Record<string, TextureCrop> = {
  'bell-long-ledge': { x: 46, y: 44, width: 334, height: 98 },
  'bell-small-ledge': { x: 412, y: 48, width: 92, height: 64 },
  'bell-wide-ledge': { x: 478, y: 174, width: 278, height: 78 },
  'bell-small-block': { x: 1168, y: 164, width: 74, height: 128 },
  'bell-scroll-shelf': { x: 552, y: 322, width: 176, height: 254 },
  'bell-wood-platform': { x: 1078, y: 596, width: 250, height: 178 },
  'bell-arrow': { x: 242, y: 876, width: 176, height: 30 },
}

const CANDLE_TERRAIN_CROPS: Record<string, TextureCrop> = {
  'candle-wide-stage': { x: 34, y: 42, width: 492, height: 220 },
  'candle-rubble-floor': { x: 544, y: 78, width: 306, height: 194 },
  'candle-high-shelf': { x: 844, y: 60, width: 254, height: 198 },
  'candle-hanging-shelf': { x: 1090, y: 62, width: 244, height: 194 },
  'candle-lintel': { x: 44, y: 316, width: 288, height: 112 },
  'candle-small-plank': { x: 44, y: 454, width: 302, height: 86 },
  'candle-ward-token': { x: 38, y: 610, width: 86, height: 86 },
}

const CANDLE_READABLE_TERRAIN_CROPS: Record<string, TextureCrop> = {
  'candle-wide-stage': { x: 45, y: 55, width: 886, height: 231 },
  'candle-rubble-floor': { x: 982, y: 86, width: 664, height: 200 },
  'candle-high-shelf': { x: 887, y: 358, width: 701, height: 196 },
  'candle-small-plank': { x: 111, y: 364, width: 695, height: 156 },
  'candle-hanging-shelf': { x: 118, y: 561, width: 719, height: 307 },
  'candle-lintel': { x: 958, y: 687, width: 586, height: 176 },
}

const CLOCK_TERRAIN_CROPS: Record<string, TextureCrop> = {
  'clock-wide-floor': { x: 28, y: 248, width: 500, height: 220 },
  'clock-medium-ledge': { x: 555, y: 270, width: 255, height: 220 },
  'clock-gear-bridge': { x: 838, y: 270, width: 260, height: 220 },
  'clock-overhang': { x: 1125, y: 220, width: 388, height: 300 },
  'clock-rubble-floor': { x: 70, y: 590, width: 390, height: 190 },
  'clock-switch': { x: 555, y: 535, width: 220, height: 260 },
  'clock-gear': { x: 845, y: 525, width: 250, height: 280 },
  'clock-counterweight': { x: 1170, y: 530, width: 230, height: 280 },
}

const MOON_TERRAIN_CROPS: Record<string, TextureCrop> = {
  'moon-wide-floor': { x: 34, y: 45, width: 1186, height: 196 },
  'moon-medium-ledge': { x: 46, y: 315, width: 626, height: 150 },
  'moon-narrow-bridge': { x: 60, y: 545, width: 552, height: 72 },
  'moon-rubble-floor': { x: 48, y: 654, width: 616, height: 168 },
  'moon-tall-overhang': { x: 735, y: 302, width: 428, height: 578 },
  'moon-relay-gate': { x: 26, y: 852, width: 344, height: 332 },
  'moon-shard-altar': { x: 430, y: 875, width: 285, height: 310 },
  'moon-chain-anchor': { x: 770, y: 885, width: 160, height: 310 },
  'moon-pillar-cap': { x: 987, y: 938, width: 190, height: 236 },
}

const TERRAIN_FRAME_PREFIX = 'terrain-'

function getTerrainFrameKey(platformId: string) {
  return `${TERRAIN_FRAME_PREFIX}${platformId}`
}

function isCandleTerrainSet(terrainSet?: ShadowRunnerLevelConfig['platforms'][number]['terrainSet']) {
  return terrainSet === 'candle' || terrainSet === 'candleBright' || terrainSet === 'candleShelf'
}

function isShadowRunnerLocalQaEnabled() {
  if (typeof window === 'undefined') return false

  const host = window.location.hostname
  const localHost = host === '127.0.0.1' || host === 'localhost'

  return localHost && new URLSearchParams(window.location.search).get('localPreview') === 'shadow-runner'
}

function addStaticPlatform(
  scene: Phaser.Scene,
  group: Phaser.Physics.Arcade.StaticGroup,
  rect: { x: number; y: number; width: number; height: number },
  options: PlatformVisualOptions = {},
): PlatformVisual {
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const texture = options.texture ?? 'shadow-runner-stone'
  const displayWidth = options.displayWidth ?? rect.width
  const contact = typeof options.frame === 'string'
    ? SHADOW_RUNNER_PLATFORM_CONTACTS[texture]?.[options.frame]
    : undefined
  const artLayout = !options.hidden && contact && options.displayHeight === undefined
    ? getShadowRunnerPlatformArtLayout(rect, scene.textures.getFrame(texture, options.frame).height, contact)
    : null
  const displayHeight = artLayout?.displayHeight ?? options.displayHeight ?? rect.height
  const visualY = centerY + (artLayout?.offsetY ?? options.visualOffsetY ?? 0)
  const visual = options.hidden
    ? scene.add.rectangle(centerX, visualY, rect.width, rect.height, 0x000000, 0)
    : options.useImage || options.frame !== undefined
      ? scene.add.image(centerX, visualY, texture, options.frame)
      : scene.add.tileSprite(centerX, visualY, rect.width, rect.height, texture)

  visual.setOrigin(0.5)
  visual.setDepth(options.depth ?? 3)

  if (visual instanceof Phaser.GameObjects.Image) {
    visual.setDisplaySize(displayWidth, displayHeight)
  } else if (visual instanceof Phaser.GameObjects.TileSprite) {
    visual.setTileScale(1, 1)
  }

  const platform = scene.add.rectangle(centerX, centerY, rect.width, rect.height, 0x000000, 0)
  group.add(platform)
  visual.setData('platformCollider', platform)

  const body = platform.body as Phaser.Physics.Arcade.StaticBody
  body.setSize(rect.width, rect.height)
  body.updateFromGameObject()

  return visual
}

class ShadowRunnerLevelScene extends Phaser.Scene {
  private readonly controls: ShadowRunnerInputRef
  private readonly level: ShadowRunnerLevelConfig
  private readonly onHudChange: (state: ShadowRunnerHudState) => void
  private readonly onStoryMoment?: (momentId: string) => void
  private readonly discoveredMoments = new Set<string>()
  private checkpointWayposts: Array<{ index: number; image: Phaser.GameObjects.Image }> = []
  private readonly onReady?: () => void
  private readonly onLoadError?: (error: Error) => void
  private readonly onLoadProgress?: (progress: ShadowRunnerRuntimeLoadProgress) => void
  private readonly onSoundEvent?: (event: ShadowRunnerSoundEvent) => void
  private reducedMotion: boolean
  private pauseRequested: boolean
  private gameplayPaused = true
  private sceneReady = false
  private runtimeDisposed = false
  private loadFailure: Error | null = null
  private runtimeManifest: ShadowRunnerRuntimeAsset[] = []
  private loadedAssetKeys = new Set<string>()
  private openingBackdrop?: Phaser.GameObjects.Image
  private openingBackdropLayout?: ShadowRunnerBackdropLayout
  private districtDepth: Array<{ config: ShadowRunnerDepthProp; image: Phaser.GameObjects.Image }> = []
  private openingPlatformArt: NonNullable<ShadowRunnerDebugSnapshot['openingArt']>['platforms'] = []

  private state: ShadowRunnerSimulationState
  private cursors?: CursorKeys
  private keys?: Record<'a' | 'd' | 'w' | 'space' | 'z' | 'j' | 'shift' | 's', Phaser.Input.Keyboard.Key>
  private platforms?: Phaser.Physics.Arcade.StaticGroup
  private spikes?: Phaser.Physics.Arcade.StaticGroup
  private coins?: Phaser.Physics.Arcade.StaticGroup
  private boostPickups?: Phaser.Physics.Arcade.StaticGroup
  private shieldPickups?: Phaser.Physics.Arcade.StaticGroup
  private chronoPickups?: Phaser.Physics.Arcade.StaticGroup
  private surgePickups?: Phaser.Physics.Arcade.StaticGroup
  private moonShardPickups?: Phaser.Physics.Arcade.StaticGroup
  private wraithlightPickups?: Phaser.Physics.Arcade.StaticGroup
  private mirrorWardPickups?: Phaser.Physics.Arcade.StaticGroup
  private galeMantlePickups?: Phaser.Physics.Arcade.StaticGroup
  private sunsteelEdgePickups?: Phaser.Physics.Arcade.StaticGroup
  private dawnfireAegisPickups?: Phaser.Physics.Arcade.StaticGroup
  private aetherStepPickups?: Phaser.Physics.Arcade.StaticGroup
  private objectivePickups?: Phaser.Physics.Arcade.StaticGroup
  private masteryPickups?: Phaser.Physics.Arcade.StaticGroup
  private candleHazards?: Phaser.Physics.Arcade.StaticGroup
  private crouchGates?: Phaser.Physics.Arcade.StaticGroup
  private encounterBarriers?: Phaser.Physics.Arcade.StaticGroup
  private archerProjectiles?: Phaser.Physics.Arcade.Group
  private player?: Phaser.Physics.Arcade.Sprite
  private enemies: Phaser.Physics.Arcade.Sprite[] = []
  private tiltPlatforms: TiltPlatformRuntime[] = []
  private spectralPlatforms: SpectralPlatformRuntime[] = []
  private phasePlatforms: PhasePlatformRuntime[] = []
  private movingPlatforms: MovingPlatformRuntime[] = []
  private windZones: WindZoneRuntime[] = []
  private relayBeamZones: RelayBeamZoneRuntime[] = []
  private encounterBarrierRuntimes: EncounterBarrierRuntime[] = []
  private clearedEncounterIds = new Set<string>()
  private recoveringEncounterIds = new Set<string>()
  private arrowVolleys: ArrowVolleyRuntime[] = []
  private boostAura?: Phaser.GameObjects.Sprite
  private shieldAura?: Phaser.GameObjects.Graphics
  private chronoAura?: Phaser.GameObjects.Graphics
  private surgeAura?: Phaser.GameObjects.Graphics
  private wraithlightAura?: Phaser.GameObjects.Graphics
  private mirrorWardAura?: Phaser.GameObjects.Graphics
  private galeMantleAura?: Phaser.GameObjects.Graphics
  private sunsteelEdgeAura?: Phaser.GameObjects.Graphics
  private dawnfireAegisAura?: Phaser.GameObjects.Graphics
  private aetherStepAura?: Phaser.GameObjects.Graphics
  private enemyHealthBars: Phaser.GameObjects.Graphics[] = []
  private enemyHealthFrames: Phaser.GameObjects.Image[] = []
  private slashArc?: Phaser.GameObjects.Graphics
  private slashSprite?: Phaser.GameObjects.Sprite
  private readonly qaEnabled = isShadowRunnerLocalQaEnabled()
  private lastJumpPresses = 0
  private lastAttackPresses = 0
  private activeTimeMs = 0
  private frameDeltaMs = 0
  private attackId = 0
  private attackHitEnemyIds = new Set<string>()
  private attackHitProjectile = false
  private crouching = false
  private standingBlocked = false
  private spectralGrace = createShadowRunnerSpectralGrace()
  private jumpsUsed = 0
  private wasOnFloor = false
  private finishSparked = false
  private deliveryState: NonNullable<ShadowRunnerHudState['deliveryState']> = 'locked'
  private deliveryRequested = false
  private deliveryStartedAt = 0
  private deliveryFlame?: Phaser.GameObjects.Sprite
  private finishVisual?: Phaser.GameObjects.Image
  private respawnPending = false
  private activeCheckpointIndex = -1
  private checkpointToast?: Phaser.GameObjects.Text
  private respawnPoint: { x: number; y: number }
  private lastHudSignature = ''
  private tiltBodies: Phaser.Physics.Arcade.Body[] = []
  private tiltActors: TiltActorRuntime[] = []
  private tiltClockMs = 0
  private tiltNextClockMs = 0
  private tiltCleanup?: () => void
  private airborneStartY: number | null = null
  private lastSupportedFootY: number | null = null

  constructor(options: Omit<CreateShadowRunnerGameOptions, 'parent'>) {
    super('ShadowRunnerLevelScene')
    this.controls = options.input
    this.level = getShadowRunnerLevelConfig(options.levelId ?? 'tutorial')
    this.respawnPoint = { ...this.level.playerStart }
    this.state = createInitialShadowRunnerSimulation(this.level)
    this.onHudChange = options.onHudChange
    this.onStoryMoment = options.onStoryMoment
    this.onReady = options.onReady
    this.onLoadError = options.onLoadError
    this.onLoadProgress = options.onLoadProgress
    this.onSoundEvent = options.onSoundEvent
    this.reducedMotion = options.reducedMotion ?? false
    this.pauseRequested = options.startPaused ?? true
  }

  setReducedMotion(reducedMotion: boolean) {
    if (this.runtimeDisposed) return
    this.reducedMotion = reducedMotion
    if (reducedMotion) {
      this.cameras?.main?.shakeEffect.reset()
      this.cameras?.main?.flashEffect.reset()
    }
  }

  setPaused(paused: boolean) {
    this.pauseRequested = paused
    this.lastJumpPresses = this.controls.current.jumpPresses
    this.lastAttackPresses = this.controls.current.attackPresses
    this.consumeKeyboardActionPresses()
    this.deliveryRequested = false
    if (!this.sceneReady || this.runtimeDisposed) return
    this.gameplayPaused = paused || this.loadFailure !== null
    if (this.gameplayPaused) {
      this.physics.world.pause()
      if (this.sys.isActive()) this.sys.pause()
    } else {
      this.physics.world.resume()
      if (this.sys.isPaused()) this.sys.resume()
    }
  }

  private reportLoadFailure(error: Error) {
    if (this.runtimeDisposed || this.loadFailure) return
    this.loadFailure = error
    this.gameplayPaused = true
    this.physics.world.pause()
    this.emitLoadProgress('failed')
    this.onLoadError?.(error)
  }

  private validateLoadedTextures() {
    if (this.runtimeDisposed || this.loadFailure) return
    for (const asset of this.runtimeManifest) {
      if (!isShadowRunnerRuntimeAssetReady(asset, this.textures)) {
        this.reportLoadFailure(new Error(`Shadow Runner asset could not be decoded: ${asset.key}`))
        return
      }
    }
  }

  private emitLoadProgress(phase: ShadowRunnerRuntimeLoadProgress['phase']) {
    if (this.runtimeDisposed) return
    this.onLoadProgress?.(getShadowRunnerRuntimeLoadProgress(this.runtimeManifest, this.loadedAssetKeys, phase))
  }

  private observeRuntimeLoading() {
    this.runtimeDisposed = false
    this.sceneReady = false
    this.loadFailure = null
    this.loadedAssetKeys.clear()
    const loaded = (key: string) => {
      if (this.runtimeDisposed || this.loadFailure) return
      const asset = this.runtimeManifest.find(current => current.key === key)
      if (!asset) return
      if (!isShadowRunnerRuntimeAssetReady(asset, this.textures)) {
        this.reportLoadFailure(new Error(`Shadow Runner asset could not be decoded: ${key}`))
        return
      }
      this.loadedAssetKeys.add(key)
      this.emitLoadProgress('loading')
    }
    const failed = (file: Phaser.Loader.File) => {
      this.reportLoadFailure(new Error(`Shadow Runner asset could not load: ${file.key}`))
    }
    const completed = () => {
      this.validateLoadedTextures()
      if (this.runtimeDisposed || this.loadFailure) return
      this.runtimeManifest.forEach(asset => this.loadedAssetKeys.add(asset.key))
      this.emitLoadProgress('loading')
    }
    const cleanup = () => {
      this.runtimeDisposed = true
      this.sceneReady = false
      this.gameplayPaused = true
      this.load.off(Phaser.Loader.Events.FILE_COMPLETE, loaded)
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, failed)
      this.load.off(Phaser.Loader.Events.COMPLETE, completed)
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup)
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup)
      this.loadedAssetKeys.clear()
    }
    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, loaded)
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, failed)
    this.load.once(Phaser.Loader.Events.COMPLETE, completed)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)
  }

  preload() {
    this.runtimeManifest = getShadowRunnerRuntimeManifest(this.level)
    this.observeRuntimeLoading()
    this.runtimeManifest.forEach(asset => {
      if (isShadowRunnerRuntimeAssetReady(asset, this.textures)) this.loadedAssetKeys.add(asset.key)
    })
    this.emitLoadProgress('loading')
    queueShadowRunnerRuntimeAssets(this.load, this.runtimeManifest)
  }

  create() {
    this.gameplayPaused = true
    this.physics.world.pause()
    const paused = () => {
      this.gameplayPaused = true
      this.physics.world.pause()
    }
    const resumed = () => {
      if (this.runtimeDisposed || this.loadFailure) return
      this.gameplayPaused = false
      this.physics.world.resume()
    }
    const created = () => {
      if (this.runtimeDisposed) return
      this.sceneReady = true
      // SceneManager overwrites pauses inside create(), then emits CREATE.
      this.setPaused(this.pauseRequested)
      if (!this.loadFailure) {
        this.emitLoadProgress('ready')
        this.onReady?.()
      }
    }
    const cleanup = () => {
      this.runtimeDisposed = true
      this.sceneReady = false
      this.gameplayPaused = true
      this.events.off(Phaser.Scenes.Events.PAUSE, paused)
      this.events.off(Phaser.Scenes.Events.RESUME, resumed)
      this.events.off(Phaser.Scenes.Events.CREATE, created)
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup)
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup)
    }
    this.events.on(Phaser.Scenes.Events.PAUSE, paused)
    this.events.on(Phaser.Scenes.Events.RESUME, resumed)
    this.events.once(Phaser.Scenes.Events.CREATE, created)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)
    this.validateLoadedTextures()
    if (this.runtimeDisposed || this.loadFailure) return
    try {
      this.createLevelScene()
    } catch (error) {
      this.reportLoadFailure(error instanceof Error ? error : new Error('Unable to create the Shadow Runner scene'))
    }
  }

  private createLevelScene() {
    this.tiltCleanup?.()
    this.state = createInitialShadowRunnerSimulation(this.level)
    this.discoveredMoments.clear()
    this.checkpointWayposts = []
    this.activeTimeMs = 0
    this.frameDeltaMs = 0
    this.attackId = 0
    this.attackHitEnemyIds.clear()
    this.attackHitProjectile = false
    this.crouching = false
    this.standingBlocked = false
    this.spectralGrace = createShadowRunnerSpectralGrace()
    this.lastJumpPresses = this.controls.current.jumpPresses
    this.lastAttackPresses = this.controls.current.attackPresses
    const advanceTime = (_wallTime: number, delta: number) => {
      const previous = this.activeTimeMs
      if (!this.gameplayPaused && !this.state.defeated && !this.state.outOfLives) {
        this.activeTimeMs = advanceShadowRunnerActiveTime(previous, delta)
      }
      this.frameDeltaMs = this.activeTimeMs - previous
    }
    this.events.on(Phaser.Scenes.Events.PRE_UPDATE, advanceTime)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PRE_UPDATE, advanceTime)
    })
    this.enemies = []
    this.openingBackdrop = undefined
    this.openingBackdropLayout = undefined
    this.districtDepth = []
    this.openingPlatformArt = []
    this.enemyHealthBars = []
    this.enemyHealthFrames = []
    this.tiltPlatforms = []
    this.spectralPlatforms = []
    this.phasePlatforms = []
    this.movingPlatforms = []
    this.windZones = []
    this.relayBeamZones = []
    this.arrowVolleys = []
    this.boostAura = undefined
    this.shieldAura = undefined
    this.chronoAura = undefined
    this.surgeAura = undefined
    this.wraithlightAura = undefined
    this.mirrorWardAura = undefined
    this.galeMantleAura = undefined
    this.sunsteelEdgeAura = undefined
    this.dawnfireAegisAura = undefined
    this.aetherStepAura = undefined
    this.wasOnFloor = false
    this.airborneStartY = null
    this.lastSupportedFootY = null
    this.respawnPending = false
    this.activeCheckpointIndex = -1
    this.checkpointToast = undefined
    this.clearedEncounterIds.clear()
    this.recoveringEncounterIds.clear()
    this.encounterBarrierRuntimes = []
    this.respawnPoint = { ...this.level.playerStart }
    this.finishSparked = false

    this.deliveryState = 'locked'
    this.deliveryRequested = false
    this.deliveryStartedAt = 0
    this.deliveryFlame = undefined
    this.finishVisual = undefined
    this.physics.world.setBounds(0, 0, this.level.worldWidth, this.level.worldHeight)
    this.createTextures()
    this.registerTerrainFrames()
    this.createBackground()
    this.createAnimations()
    this.createLevel()
    this.createCheckpointWayposts()
    this.createStoryLandmarks()
    this.createActors()
    this.createInput()
    if (this.qaEnabled) {
      this.registerQaDebugSnapshot()
    }

    this.cameras.main.setBounds(0, 0, this.level.worldWidth, this.level.worldHeight)
    this.cameras.main.startFollow(this.player!, true, 0.12, 0.12, -110, 52)
    this.cameras.main.setDeadzone(190, 92)

    this.startTiltBridgePhysics()

    this.emitHud(true)
  }

  update() {
    if (this.gameplayPaused || this.runtimeDisposed || this.loadFailure) return
    this.updateOpeningBackdrop()
    const time = this.activeTimeMs
    if (!this.player) return
    if (this.respawnPending || this.state.defeated || this.state.outOfLives) {
      this.emitHud()
      return
    }

    if (this.deliveryState === 'igniting') {
      this.updateRelayDelivery()
      this.emitHud()
      return
    }

    this.updatePlayer(time)
    if (this.respawnPending) return
    this.updateMovingPlatforms(time)
    this.updatePhasePlatforms(time)
    this.updateCheckpointProgress()
    this.updateStoryMoments()
    this.updateEncounterActivations(time)
    this.updateEnemies(time)
    this.updateEncounterBarriers()
    this.updateArrowVolleys(time)
    this.updateArcherProjectiles(time)
    this.updateCandleHazards(time)
    this.updateWindZones(time)
    this.updateRelayBeamZones(time)
    this.updateBoostAura(time)
    this.updateShieldAura(time)
    this.updateChronoAura(time)
    this.updateSurgeAura(time)
    this.updateWraithlight(time)
    this.updateMirrorWardAura(time)
    this.updateGaleMantleAura(time)
    this.updateSunsteelEdgeAura(time)
    this.updateDawnfireAegisAura(time)
    this.updateAetherStepAura(time)
    this.updateHealthBars()
    this.checkFinish()
    this.emitHud()
  }

  private updateStoryMoments() {
    if (!this.player) return
    const body = this.player.body as Phaser.Physics.Arcade.Body
    for (const moment of getShadowRunnerReachedMoments(this.level.id, { x: body.center.x, y: body.bottom }, this.discoveredMoments)) {
      this.discoveredMoments.add(moment.id)
      this.onStoryMoment?.(moment.id)
    }
  }

  private createBackground() {
    const sky = this.add.image(0, 0, 'shadow-runner-bg')
    sky.setOrigin(0)
    if (usesShadowRunnerDepthBackdrop(this.level.id)) {
      const layout = getShadowRunnerOpeningBackdropLayout(sky.width, sky.height, GAME_WIDTH, GAME_HEIGHT)
      sky.setDisplaySize(layout.width, layout.height)
      sky.setPosition(getShadowRunnerOpeningBackdropX(layout, 0, this.level.worldWidth - GAME_WIDTH, this.reducedMotion), layout.y)
      this.openingBackdrop = sky
      this.openingBackdropLayout = layout
    } else {
      sky.setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
    }
    sky.setScrollFactor(0)

    this.districtDepth = getShadowRunnerDistrictDepth(this.level.id).map(config => {
      const image = this.add.image(getShadowRunnerDepthPropX(config, 0), config.y, config.texture)
      image.setOrigin(0.5, 0).setDisplaySize(config.width, config.height).setScrollFactor(0).setAlpha(config.alpha)
      return { config, image }
    })

    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02040a, 0.2)
    shade.setOrigin(0)
    shade.setScrollFactor(0)

  }

  private updateOpeningBackdrop() {
    if (this.reducedMotion) return
    if (this.openingBackdrop && this.openingBackdropLayout) {
      this.openingBackdrop.x = getShadowRunnerOpeningBackdropX(
        this.openingBackdropLayout, this.cameras.main.scrollX, this.level.worldWidth - GAME_WIDTH, false,
      )
    }
    for (const { config, image } of this.districtDepth) {
      image.x = getShadowRunnerDepthPropX(config, this.cameras.main.scrollX)
    }
  }

  private createAnimations() {
    this.anims.create({
      key: 'runner-idle',
      frames: this.anims.generateFrameNumbers('shadow-runner-idle', { start: 0, end: 7 }),
      frameRate: 8,
      repeat: -1,
    })
    this.anims.create({
      key: 'runner-run',
      frames: this.anims.generateFrameNumbers('shadow-runner-run', { start: 0, end: 5 }),
      frameRate: 10,
      repeat: -1,
    })
    this.anims.create({
      key: 'runner-jump',
      frames: this.anims.generateFrameNumbers('shadow-runner-jump', { start: 0, end: 5 }),
      frameRate: 10,
      repeat: 0,
    })
    this.anims.create({
      key: 'runner-attack',
      frames: this.anims.generateFrameNumbers('shadow-runner-attack', { start: 0, end: 4 }),
      frameRate: 13,
      repeat: 0,
    })
    if (this.textures.exists('clockwork-sentry')) {
      this.anims.create({
        key: 'sentry-idle',
        frames: [{ key: 'clockwork-sentry', frame: 0 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'sentry-walk',
        frames: this.anims.generateFrameNumbers('clockwork-sentry', { start: 0, end: 2 }),
        frameRate: 4,
        repeat: -1,
      })
      this.anims.create({
        key: 'sentry-attack',
        frames: [{ key: 'clockwork-sentry', frame: 3 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'sentry-hit',
        frames: [{ key: 'clockwork-sentry', frame: 4 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'sentry-defeated',
        frames: [{ key: 'clockwork-sentry', frame: 5 }],
        frameRate: 1,
        repeat: 0,
      })
    }
    if (this.textures.exists('barrel-roller')) {
      this.anims.create({
        key: 'barrel-idle',
        frames: [{ key: 'barrel-roller', frame: 0 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'barrel-roll',
        frames: this.anims.generateFrameNumbers('barrel-roller', { start: 0, end: 2 }),
        frameRate: 8,
        repeat: -1,
      })
      this.anims.create({
        key: 'barrel-impact',
        frames: [{ key: 'barrel-roller', frame: 2 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'barrel-hit',
        frames: [{ key: 'barrel-roller', frame: 3 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'barrel-defeated',
        frames: [{ key: 'barrel-roller', frame: 4 }],
        frameRate: 1,
        repeat: 0,
      })
    }
    if (this.textures.exists('scroll-thief')) {
      this.anims.create({
        key: 'scroll-walk',
        frames: this.anims.generateFrameNumbers('scroll-thief', { start: 0, end: 1 }),
        frameRate: 8,
        repeat: -1,
      })
      this.anims.create({
        key: 'scroll-attack',
        frames: [{ key: 'scroll-thief', frame: 2 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'scroll-hit',
        frames: [{ key: 'scroll-thief', frame: 3 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'scroll-defeated',
        frames: [{ key: 'scroll-thief', frame: 4 }],
        frameRate: 1,
        repeat: 0,
      })
    }
    if (this.textures.exists('tower-archer')) {
      this.anims.create({
        key: 'archer-idle',
        frames: [{ key: 'tower-archer', frame: 0 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'archer-ready',
        frames: this.anims.generateFrameNumbers('tower-archer', { start: 0, end: 1 }),
        frameRate: 4,
        repeat: -1,
      })
      this.anims.create({
        key: 'archer-shoot',
        frames: this.anims.generateFrameNumbers('tower-archer', { start: 2, end: 3 }),
        frameRate: 9,
        repeat: 0,
      })
      this.anims.create({
        key: 'archer-hit',
        frames: [{ key: 'tower-archer', frame: 4 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'archer-defeated',
        frames: [{ key: 'tower-archer', frame: 4 }],
        frameRate: 1,
        repeat: 0,
      })
    }
    if (this.textures.exists('lantern-bandit-scout')) {
      this.anims.create({
        key: 'bandit-run',
        frames: this.anims.generateFrameNumbers('lantern-bandit-scout', { start: 0, end: 1 }),
        frameRate: 8,
        repeat: -1,
      })
      this.anims.create({
        key: 'bandit-attack',
        frames: [{ key: 'lantern-bandit-scout', frame: 2 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'bandit-hit',
        frames: [{ key: 'lantern-bandit-scout', frame: 3 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'bandit-defeated',
        frames: [{ key: 'lantern-bandit-scout', frame: 4 }],
        frameRate: 1,
        repeat: 0,
      })
    }
    if (this.textures.exists('moon-stalker')) {
      this.anims.create({
        key: 'stalker-run',
        frames: this.anims.generateFrameNumbers('moon-stalker', { start: 0, end: 1 }),
        frameRate: 8,
        repeat: -1,
      })
      this.anims.create({
        key: 'stalker-attack',
        frames: [{ key: 'moon-stalker', frame: 2 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'stalker-hit',
        frames: [{ key: 'moon-stalker', frame: 3 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'stalker-defeated',
        frames: [{ key: 'moon-stalker', frame: 4 }],
        frameRate: 1,
        repeat: 0,
      })
    }
    if (this.textures.exists('tomb-lurker')) {
      this.anims.create({ key: 'lurker-dormant', frames: [{ key: 'tomb-lurker', frame: 0 }], frameRate: 1 })
      this.anims.create({ key: 'lurker-warning', frames: [{ key: 'tomb-lurker', frame: 1 }], frameRate: 1 })
      this.anims.create({ key: 'lurker-active', frames: [{ key: 'tomb-lurker', frame: 2 }], frameRate: 1 })
      this.anims.create({ key: 'lurker-lunge', frames: [{ key: 'tomb-lurker', frame: 3 }], frameRate: 1 })
      this.anims.create({ key: 'lurker-hit', frames: [{ key: 'tomb-lurker', frame: 4 }], frameRate: 1 })
      this.anims.create({ key: 'lurker-defeated', frames: [{ key: 'tomb-lurker', frame: 5 }], frameRate: 1 })
    }
    if (this.textures.exists('crypt-warden')) {
      this.anims.create({
        key: 'warden-walk',
        frames: this.anims.generateFrameNumbers('crypt-warden', { start: 0, end: 1 }),
        frameRate: 5,
        repeat: -1,
      })
      this.anims.create({ key: 'warden-guard', frames: [{ key: 'crypt-warden', frame: 2 }], frameRate: 1 })
      this.anims.create({ key: 'warden-charge', frames: [{ key: 'crypt-warden', frame: 3 }], frameRate: 1 })
      this.anims.create({ key: 'warden-hit', frames: [{ key: 'crypt-warden', frame: 4 }], frameRate: 1 })
      this.anims.create({ key: 'warden-defeated', frames: [{ key: 'crypt-warden', frame: 5 }], frameRate: 1 })
    }
    if (this.textures.exists('rival-courier')) {
      this.anims.create({
        key: 'rival-run',
        frames: this.anims.generateFrameNumbers('rival-courier', { start: 0, end: 1 }),
        frameRate: 9,
        repeat: -1,
      })
      this.anims.create({ key: 'rival-ready', frames: [{ key: 'rival-courier', frame: 0 }], frameRate: 1 })
      this.anims.create({
        key: 'rival-dash',
        frames: this.anims.generateFrameNumbers('rival-courier', { start: 2, end: 3 }),
        frameRate: 10,
        repeat: 0,
      })
      this.anims.create({ key: 'rival-hit', frames: [{ key: 'rival-courier', frame: 4 }], frameRate: 1 })
      this.anims.create({ key: 'rival-defeated', frames: [{ key: 'rival-courier', frame: 5 }], frameRate: 1 })
    }
    if (this.textures.exists('candle-jester')) {
      this.anims.create({
        key: 'jester-dance',
        frames: this.anims.generateFrameNumbers('candle-jester', { start: 0, end: 1 }),
        frameRate: 7,
        repeat: -1,
      })
      this.anims.create({
        key: 'jester-throw',
        frames: this.anims.generateFrameNumbers('candle-jester', { start: 2, end: 3 }),
        frameRate: 10,
        repeat: 0,
      })
      this.anims.create({
        key: 'jester-hit',
        frames: [{ key: 'candle-jester', frame: 4 }],
        frameRate: 1,
        repeat: 0,
      })
      this.anims.create({
        key: 'jester-defeated',
        frames: [{ key: 'candle-jester', frame: 4 }],
        frameRate: 1,
        repeat: 0,
      })
    }
    if (this.textures.exists('shadow-runner-coin')) {
      this.anims.create({
        key: 'coin-spin',
        frames: this.anims.generateFrameNumbers('shadow-runner-coin', { start: 0, end: 7 }),
        frameRate: 10,
        repeat: -1,
      })
    }
    if (this.textures.exists('shadow-runner-moonheart')) {
      this.anims.create({
        key: 'moonheart-spin',
        frames: this.anims.generateFrameNumbers('shadow-runner-moonheart', { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1,
      })
    }
    if (this.textures.exists('shadow-runner-boost-aura')) {
      this.anims.create({
        key: 'boost-aura',
        frames: this.anims.generateFrameNumbers('shadow-runner-boost-aura', { start: 0, end: 3 }),
        frameRate: 9,
        repeat: -1,
      })
    }
    if (this.textures.exists('shadow-runner-chrono-lantern')) {
      this.anims.create({
        key: 'chrono-lantern-spin',
        frames: this.anims.generateFrameNumbers('shadow-runner-chrono-lantern', { start: 0, end: 3 }),
        frameRate: 7,
        repeat: -1,
      })
    }
    if (this.textures.exists('shadow-runner-shadow-surge')) {
      this.anims.create({
        key: 'shadow-surge-spin',
        frames: this.anims.generateFrameNumbers('shadow-runner-shadow-surge', { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1,
      })
    }
    if (this.textures.exists('shadow-runner-moon-shard')) {
      this.anims.create({
        key: 'moon-shard-glow',
        frames: this.anims.generateFrameNumbers('shadow-runner-moon-shard', { start: 0, end: 3 }),
        frameRate: 7,
        repeat: -1,
      })
    }
    if (this.textures.exists('shadow-runner-wraithlight')) {
      this.anims.create({
        key: 'wraithlight-pulse',
        frames: this.anims.generateFrameNumbers('shadow-runner-wraithlight', { start: 0, end: 3 }),
        frameRate: 7,
        repeat: -1,
      })
    }
    if (this.textures.exists('shadow-runner-mirror-ward')) {
      this.anims.create({
        key: 'mirror-ward-pulse',
        frames: this.anims.generateFrameNumbers('shadow-runner-mirror-ward', { start: 0, end: 3 }),
        frameRate: 7,
        repeat: -1,
      })
    }
    if (this.textures.exists('shadow-runner-relay-seal')) {
      this.anims.create({
        key: 'relay-seal-spin',
        frames: this.anims.generateFrameNumbers('shadow-runner-relay-seal', { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1,
      })
    }
    if (this.textures.exists('shadow-runner-courier-cache')) {
      this.anims.create({
        key: 'courier-cache-reveal',
        frames: this.anims.generateFrameNumbers('shadow-runner-courier-cache', { start: 0, end: 3 }),
        frameRate: 5,
        repeat: -1,
      })
    }
    if (this.textures.exists('gate-pikeman')) {
      this.anims.create({ key: 'pikeman-march', frames: this.anims.generateFrameNumbers('gate-pikeman', { start: 0, end: 1 }), frameRate: 6, repeat: -1 })
      this.anims.create({ key: 'pikeman-guard', frames: [{ key: 'gate-pikeman', frame: 2 }], frameRate: 1 })
      this.anims.create({ key: 'pikeman-thrust', frames: [{ key: 'gate-pikeman', frame: 3 }], frameRate: 1 })
      this.anims.create({ key: 'pikeman-hit', frames: [{ key: 'gate-pikeman', frame: 4 }], frameRate: 1 })
      this.anims.create({ key: 'pikeman-defeated', frames: [{ key: 'gate-pikeman', frame: 5 }], frameRate: 1 })
    }
    if (this.textures.exists('storm-grenadier')) {
      this.anims.create({ key: 'grenadier-walk', frames: this.anims.generateFrameNumbers('storm-grenadier', { start: 0, end: 1 }), frameRate: 7, repeat: -1 })
      this.anims.create({ key: 'grenadier-windup', frames: [{ key: 'storm-grenadier', frame: 2 }], frameRate: 1 })
      this.anims.create({ key: 'grenadier-throw', frames: [{ key: 'storm-grenadier', frame: 3 }], frameRate: 1 })
      this.anims.create({ key: 'grenadier-hit', frames: [{ key: 'storm-grenadier', frame: 4 }], frameRate: 1 })
      this.anims.create({ key: 'grenadier-defeated', frames: [{ key: 'storm-grenadier', frame: 5 }], frameRate: 1 })
    }
    if (this.textures.exists('watch-captain')) {
      this.anims.create({ key: 'captain-guard', frames: this.anims.generateFrameNumbers('watch-captain', { start: 0, end: 2 }), frameRate: 6, repeat: -1 })
      this.anims.create({ key: 'captain-charge', frames: [{ key: 'watch-captain', frame: 3 }], frameRate: 1 })
      this.anims.create({ key: 'captain-slash', frames: [{ key: 'watch-captain', frame: 4 }], frameRate: 1 })
      this.anims.create({ key: 'captain-command', frames: [{ key: 'watch-captain', frame: 5 }], frameRate: 1 })
      this.anims.create({ key: 'captain-hit', frames: [{ key: 'watch-captain', frame: 6 }], frameRate: 1 })
      this.anims.create({ key: 'captain-defeated', frames: [{ key: 'watch-captain', frame: 7 }], frameRate: 1 })
    }
    if (this.textures.exists('relay-lancer')) {
      this.anims.create({ key: 'relay-lancer-march', frames: this.anims.generateFrameNumbers('relay-lancer', { start: 0, end: 1 }), frameRate: 7, repeat: -1 })
      this.anims.create({ key: 'relay-lancer-ready', frames: [{ key: 'relay-lancer', frame: 2 }], frameRate: 1 })
      this.anims.create({ key: 'relay-lancer-strike', frames: [{ key: 'relay-lancer', frame: 3 }], frameRate: 1 })
      this.anims.create({ key: 'relay-lancer-hit', frames: [{ key: 'relay-lancer', frame: 4 }], frameRate: 1 })
      this.anims.create({ key: 'relay-lancer-defeated', frames: [{ key: 'relay-lancer', frame: 5 }], frameRate: 1 })
    }
    if (this.textures.exists('prism-caster')) {
      this.anims.create({ key: 'prism-caster-hover', frames: this.anims.generateFrameNumbers('prism-caster', { start: 0, end: 1 }), frameRate: 6, repeat: -1 })
      this.anims.create({ key: 'prism-caster-windup', frames: [{ key: 'prism-caster', frame: 2 }], frameRate: 1 })
      this.anims.create({ key: 'prism-caster-cast', frames: [{ key: 'prism-caster', frame: 3 }], frameRate: 1 })
      this.anims.create({ key: 'prism-caster-hit', frames: [{ key: 'prism-caster', frame: 4 }], frameRate: 1 })
      this.anims.create({ key: 'prism-caster-defeated', frames: [{ key: 'prism-caster', frame: 5 }], frameRate: 1 })
    }
    if (this.textures.exists('gearwing-drone')) {
      this.anims.create({ key: 'gearwing-drone-flight', frames: this.anims.generateFrameNumbers('gearwing-drone', { start: 0, end: 1 }), frameRate: 10, repeat: -1 })
      this.anims.create({ key: 'gearwing-drone-tell', frames: [{ key: 'gearwing-drone', frame: 2 }], frameRate: 1 })
      this.anims.create({ key: 'gearwing-drone-dive', frames: [{ key: 'gearwing-drone', frame: 3 }], frameRate: 1 })
      this.anims.create({ key: 'gearwing-drone-hit', frames: [{ key: 'gearwing-drone', frame: 4 }], frameRate: 1 })
      this.anims.create({ key: 'gearwing-drone-defeated', frames: [{ key: 'gearwing-drone', frame: 5 }], frameRate: 1 })
    }
    if (this.textures.exists('sentry-sovereign')) {
      this.anims.create({ key: 'sovereign-guard', frames: this.anims.generateFrameNumbers('sentry-sovereign', { start: 0, end: 2 }), frameRate: 6, repeat: -1 })
      this.anims.create({ key: 'sovereign-sweep', frames: [{ key: 'sentry-sovereign', frame: 3 }], frameRate: 1 })
      this.anims.create({ key: 'sovereign-orbs', frames: [{ key: 'sentry-sovereign', frame: 4 }], frameRate: 1 })
      this.anims.create({ key: 'sovereign-charge', frames: [{ key: 'sentry-sovereign', frame: 5 }], frameRate: 1 })
      this.anims.create({ key: 'sovereign-shockwave', frames: [{ key: 'sentry-sovereign', frame: 6 }], frameRate: 1 })
      this.anims.create({ key: 'sovereign-attack', frames: [{ key: 'sentry-sovereign', frame: 8 }], frameRate: 1 })
      this.anims.create({ key: 'sovereign-hit', frames: [{ key: 'sentry-sovereign', frame: 7 }], frameRate: 1 })
      this.anims.create({ key: 'sovereign-defeated', frames: [{ key: 'sentry-sovereign', frame: 9 }], frameRate: 1 })
    }
    const levelNinePickupAnimations = [
      ['gale-mantle-pulse', 'shadow-runner-gale-mantle'],
      ['sunsteel-edge-pulse', 'shadow-runner-sunsteel-edge'],
      ['watchfire-crest-spin', 'shadow-runner-watchfire-crest'],
      ['captains-orders-reveal', 'shadow-runner-captains-orders'],
      ['storm-bomb-spin', 'shadow-runner-storm-bomb'],
    ] as const
    levelNinePickupAnimations.forEach(([key, texture]) => {
      if (!this.textures.exists(texture)) return
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(texture, { start: 0, end: 3 }),
        frameRate: texture === 'shadow-runner-storm-bomb' ? 10 : 7,
        repeat: -1,
      })
    })
    const levelTenAnimations = [
      ['dawnfire-aegis-pulse', 'shadow-runner-dawnfire-aegis'],
      ['aether-step-pulse', 'shadow-runner-aether-step'],
      ['relay-flame-spin', 'shadow-runner-relay-flame'],
      ['last-dispatch-reveal', 'shadow-runner-last-dispatch'],
      ['relay-orb-spin', 'shadow-runner-relay-orb'],
    ] as const
    levelTenAnimations.forEach(([key, texture]) => {
      if (!this.textures.exists(texture)) return
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(texture, { start: 0, end: 3 }),
        frameRate: texture === 'shadow-runner-relay-orb' ? 11 : 7,
        repeat: -1,
      })
    })
    this.anims.create({
      key: 'landing-dust',
      frames: this.anims.generateFrameNumbers('shadow-runner-landing-dust', { start: 0, end: 5 }),
      frameRate: 18,
      repeat: 0,
    })
    this.anims.create({
      key: 'sword-slash',
      frames: this.anims.generateFrameNumbers('shadow-runner-sword-slash', { start: 0, end: 5 }),
      frameRate: 20,
      repeat: 0,
    })
    this.anims.create({
      key: 'coin-sparkle',
      frames: this.anims.generateFrameNumbers('shadow-runner-coin-sparkle', { start: 0, end: 3 }),
      frameRate: 11,
      repeat: 0,
    })
  }

  private createOpeningPlatformTexture(width: number, height: number, art: ShadowRunnerMasonryArt = SHADOW_RUNNER_OPENING_WALKWAY) {
    const key = `${art.textureKey}-${width}x${height}`
    if (this.textures.exists(key)) return key
    const source = this.textures.get(art.textureKey).getSourceImage()
    if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)
      || source.width !== art.width || source.height !== art.height) {
      throw new Error('Masonry raster dimensions do not match its art catalog')
    }
    const patches = getShadowRunnerWalkwayPatches(width, height, art)
    const texture = this.textures.createCanvas(key, width, height)
    if (!texture) throw new Error('Unable to compose the masonry texture')
    const context = texture.getContext()
    context.imageSmoothingEnabled = false
    // One cached raster composite per size; no procedural fill or per-frame uploads.
    patches.forEach(({ source: crop, destination }) => {
      context.drawImage(source, crop.x, crop.y, crop.width, crop.height, destination.x, destination.y, destination.width, destination.height)
    })
    texture.refresh()
    return key
  }

  private createStaticPlatform(platform: ShadowRunnerLevelConfig['platforms'][number]) {
    const masonry = usesShadowRunnerRelayMasonry(platform) ? SHADOW_RUNNER_RELAY_MASONRY
      : usesShadowRunnerCaptainMasonry(platform) ? SHADOW_RUNNER_CAPTAIN_MASONRY : null
    if (masonry) {
      const texture = this.createOpeningPlatformTexture(platform.width, platform.height, masonry)
      addStaticPlatform(this, this.platforms!, platform, { texture, useImage: true })
      return
    }
    if (usesShadowRunnerOpeningArt(this.level.id) && !platform.hidden) {
      const texture = this.createOpeningPlatformTexture(platform.width, platform.height)
      addStaticPlatform(this, this.platforms!, platform, { texture, useImage: true })
      this.openingPlatformArt.push({ id: platform.id, x: platform.x, y: platform.y, width: platform.width, height: platform.height, texture })
      return
    }
    const frameKey = getTerrainFrameKey(platform.visualId ?? platform.id)
    const terrainTexture = getShadowRunnerTerrainRuntime(platform.terrainSet).textureKey
    const hasTerrainFrame = this.textures.exists(terrainTexture)
      && this.textures.get(terrainTexture).has(frameKey)
    const candleFallbackTexture = 'shadow-runner-candle-terrain-atlas'
    const hasCandleFallbackFrame = isCandleTerrainSet(platform.terrainSet)
      && this.textures.exists(candleFallbackTexture)
      && this.textures.get(candleFallbackTexture).has(frameKey)

    addStaticPlatform(this, this.platforms!, platform, hasTerrainFrame
      ? { texture: terrainTexture, frame: frameKey, useImage: true, hidden: platform.hidden }
      : hasCandleFallbackFrame
        ? { texture: candleFallbackTexture, frame: frameKey, useImage: true, hidden: platform.hidden }
        : { texture: 'shadow-runner-stone', hidden: platform.hidden })
  }

  private createLevel() {
    this.platforms = this.physics.add.staticGroup()
    this.spikes = this.physics.add.staticGroup()
    this.coins = this.physics.add.staticGroup()
    this.boostPickups = this.physics.add.staticGroup()
    this.shieldPickups = this.physics.add.staticGroup()
    this.chronoPickups = this.physics.add.staticGroup()
    this.surgePickups = this.physics.add.staticGroup()
    this.moonShardPickups = this.physics.add.staticGroup()
    this.wraithlightPickups = this.physics.add.staticGroup()
    this.mirrorWardPickups = this.physics.add.staticGroup()
    this.galeMantlePickups = this.physics.add.staticGroup()
    this.sunsteelEdgePickups = this.physics.add.staticGroup()
    this.dawnfireAegisPickups = this.physics.add.staticGroup()
    this.aetherStepPickups = this.physics.add.staticGroup()
    this.objectivePickups = this.physics.add.staticGroup()
    this.masteryPickups = this.physics.add.staticGroup()
    this.candleHazards = this.physics.add.staticGroup({ maxSize: 24 })
    this.crouchGates = this.physics.add.staticGroup()
    this.encounterBarriers = this.physics.add.staticGroup()

    this.level.platforms.forEach(platform => this.createStaticPlatform(platform))

    this.level.crouchGates?.forEach(gate => {
      this.createCrouchGate(gate)
    })

    this.level.spectralPlatforms?.forEach(platform => {
      const terrainTexture = getShadowRunnerTerrainRuntime(platform.terrainSet).textureKey
      const frameKey = getTerrainFrameKey(platform.visualId ?? platform.id)
      const hasFrame = this.textures.exists(terrainTexture)
        && this.textures.get(terrainTexture).has(frameKey)
      const visual = addStaticPlatform(this, this.platforms!, platform, hasFrame
        ? {
            texture: terrainTexture,
            frame: frameKey,
            useImage: true,
            depth: 7,
          }
        : { texture: 'shadow-runner-stone' })
      const collider = visual.getData('platformCollider') as Phaser.GameObjects.Rectangle | undefined
      const body = collider?.body as Phaser.Physics.Arcade.StaticBody | undefined
      visual.setAlpha(0.2)
      if (body) body.enable = false
      this.spectralPlatforms.push({ config: platform, visual, collider })
    })

    this.level.phasePlatforms?.forEach(platform => {
      const terrain = getShadowRunnerTerrainRuntime(platform.terrainSet)
      const frame = getTerrainFrameKey(platform.visualId ?? platform.id)
      const hasFrame = this.textures.exists(terrain.textureKey)
        && this.textures.get(terrain.textureKey).has(frame)
      const visual = addStaticPlatform(this, this.platforms!, platform, hasFrame
        ? {
            texture: terrain.textureKey,
            frame,
            useImage: true,
            displayWidth: platform.width + 22,
            displayHeight: Math.max(62, platform.height + 30),
            visualOffsetY: -10,
            depth: 8,
          }
        : { texture: 'shadow-runner-stone', depth: 8 })
      this.phasePlatforms.push({
        config: platform,
        visual,
        collider: visual.getData('platformCollider') as Phaser.GameObjects.Rectangle | undefined,
        state: null,
      })
    })

    this.level.encounters
      ?.filter(encounter => encounter.sealed)
      .forEach(encounter => {
        this.createEncounterBarrier(encounter, encounter.x - 34)
        this.createEncounterBarrier(encounter, encounter.x + encounter.width - 34)
      })

    this.level.tiltPlatforms.forEach((platform, index) => this.createTiltPlatform(platform, index))

    this.level.movingPlatforms?.forEach(platform => {
      const terrain = getShadowRunnerTerrainRuntime(platform.terrainSet)
      const frame = getTerrainFrameKey(platform.visualId ?? platform.id)
      const contact = SHADOW_RUNNER_PLATFORM_CONTACTS[terrain.textureKey]?.[frame]
      const hasFrame = this.textures.exists(terrain.textureKey)
        && this.textures.get(terrain.textureKey).has(frame)
      const visual = addStaticPlatform(this, this.platforms!, platform, hasFrame
        ? {
            texture: terrain.textureKey,
            frame,
            useImage: true,
            displayWidth: platform.width + 22,
            displayHeight: contact ? undefined : Math.max(56, platform.height + 28),
            visualOffsetY: -10,
            depth: 8,
          }
        : { texture: 'shadow-runner-stone', depth: 8 })
      this.movingPlatforms.push({
        config: platform,
        visual,
        visualOffsetY: visual.y - platform.y - platform.height / 2,
        collider: visual.getData('platformCollider') as Phaser.GameObjects.Rectangle | undefined,
        startX: platform.x,
        startY: platform.y,
        endX: platform.endX ?? platform.x,
        endY: platform.endY,
        direction: -1,
        pauseUntil: 0,
        lastX: platform.x,
        lastY: platform.y,
      })
    })

    this.windZones = (this.level.windZones ?? []).map(zone => {
      const visual = this.add.graphics()
      visual.setDepth(2)
      return { config: zone, visual, active: false, telling: false, renderState: null }
    })

    this.relayBeamZones = (this.level.relayBeamZones ?? []).map(config => {
      const visual = this.add.graphics()
      visual.setDepth(21)
      return { config, visual, state: null, activatedAt: null, lastGuardedCycle: -1 }
    })

    this.arrowVolleys = (this.level.arrowVolleys ?? []).map(config => ({
      config,
      nextShotAt: 0,
      armed: false,
    }))

    this.level.boosts?.forEach((boost, index) => {
      const boostSprite = this.boostPickups!.create(boost.x, boost.y, 'shadow-runner-moonheart') as Phaser.Physics.Arcade.Sprite
      boostSprite.setName(boost.id)
      boostSprite.setScale(0.82)
      configureShadowRunnerPickupBody(boostSprite, 18)
      boostSprite.setImmovable(true)
      boostSprite.setDepth(14)
      boostSprite.setData('collected', false)
      boostSprite.play('moonheart-spin')
      this.tweens.add({
        targets: boostSprite,
        onUpdate: () => syncShadowRunnerPickupBody(boostSprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: boost.y - 10,
        duration: 720,
        yoyo: true,
        repeat: -1,
        delay: index * 160,
        ease: 'Sine.inOut',
      })
    })

    this.level.shieldPickups?.forEach((shield, index) => {
      const shieldFrame = getTerrainFrameKey('candle-ward-token')
      const hasShieldFrame = this.textures.exists('shadow-runner-candle-terrain-atlas')
        && this.textures.get('shadow-runner-candle-terrain-atlas').has(shieldFrame)
      const shieldSprite = hasShieldFrame
        ? this.shieldPickups!.create(shield.x, shield.y, 'shadow-runner-candle-terrain-atlas', shieldFrame) as Phaser.Physics.Arcade.Sprite
        : this.shieldPickups!.create(shield.x, shield.y, 'shadow-runner-shield-pickup') as Phaser.Physics.Arcade.Sprite
      shieldSprite.setName(shield.id)
      shieldSprite.setDisplaySize(42, 42)
      configureShadowRunnerPickupBody(shieldSprite, 16)
      shieldSprite.setImmovable(true)
      shieldSprite.setDepth(15)
      shieldSprite.setData('collected', false)
      this.tweens.add({
        targets: shieldSprite,
        onUpdate: () => syncShadowRunnerPickupBody(shieldSprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: shield.y - 9,
        duration: 760,
        yoyo: true,
        repeat: -1,
        delay: index * 170,
        ease: 'Sine.inOut',
      })
    })

    this.level.chronoPickups?.forEach((chrono, index) => {
      const chronoSprite = this.chronoPickups!.create(
        chrono.x,
        chrono.y,
        'shadow-runner-chrono-lantern',
      ) as Phaser.Physics.Arcade.Sprite
      chronoSprite.setName(chrono.id)
      chronoSprite.setScale(0.9)
      configureShadowRunnerPickupBody(chronoSprite, 18)
      chronoSprite.setImmovable(true)
      chronoSprite.setDepth(16)
      chronoSprite.setData('collected', false)
      chronoSprite.play('chrono-lantern-spin')
      this.tweens.add({
        targets: chronoSprite,
        onUpdate: () => syncShadowRunnerPickupBody(chronoSprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: chrono.y - 11,
        duration: 680,
        yoyo: true,
        repeat: -1,
        delay: index * 180,
        ease: 'Sine.inOut',
      })
    })

    this.level.surgePickups?.forEach((surge, index) => {
      const surgeSprite = this.surgePickups!.create(
        surge.x,
        surge.y,
        'shadow-runner-shadow-surge',
      ) as Phaser.Physics.Arcade.Sprite
      surgeSprite.setName(surge.id)
      surgeSprite.setScale(0.9)
      configureShadowRunnerPickupBody(surgeSprite, 18)
      surgeSprite.setImmovable(true)
      surgeSprite.setDepth(17)
      surgeSprite.setData('collected', false)
      surgeSprite.play('shadow-surge-spin')
      this.tweens.add({
        targets: surgeSprite,
        onUpdate: () => syncShadowRunnerPickupBody(surgeSprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: surge.y - 12,
        duration: 650,
        yoyo: true,
        repeat: -1,
        delay: index * 150,
        ease: 'Sine.inOut',
      })
    })

    this.level.moonShardPickups?.forEach((shard, index) => {
      const shardSprite = this.moonShardPickups!.create(
        shard.x,
        shard.y,
        'shadow-runner-moon-shard',
      ) as Phaser.Physics.Arcade.Sprite
      shardSprite.setName(shard.id)
      shardSprite.setScale(0.92)
      configureShadowRunnerPickupBody(shardSprite, 18)
      shardSprite.setImmovable(true)
      shardSprite.setDepth(18)
      shardSprite.setData('collected', false)
      shardSprite.play('moon-shard-glow')
      this.tweens.add({
        targets: shardSprite,
        onUpdate: () => syncShadowRunnerPickupBody(shardSprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: shard.y - 13,
        duration: 720,
        yoyo: true,
        repeat: -1,
        delay: index * 190,
        ease: 'Sine.inOut',
      })
    })

    this.level.wraithlightPickups?.forEach((pickup, index) => {
      const sprite = this.wraithlightPickups!.create(
        pickup.x,
        pickup.y,
        'shadow-runner-wraithlight',
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setName(pickup.id)
      sprite.setScale(0.96)
      configureShadowRunnerPickupBody(sprite, 18)
      sprite.setImmovable(true)
      sprite.setDepth(18)
      sprite.setData('collected', false)
      sprite.play('wraithlight-pulse')
      this.tweens.add({
        targets: sprite,
        onUpdate: () => syncShadowRunnerPickupBody(sprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: pickup.y - 11,
        duration: 690,
        yoyo: true,
        repeat: -1,
        delay: index * 150,
        ease: 'Sine.inOut',
      })
    })

    this.level.mirrorWardPickups?.forEach((pickup, index) => {
      const sprite = this.mirrorWardPickups!.create(
        pickup.x,
        pickup.y,
        'shadow-runner-mirror-ward',
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setName(pickup.id)
      sprite.setScale(0.96)
      configureShadowRunnerPickupBody(sprite, 18)
      sprite.setImmovable(true)
      sprite.setDepth(18)
      sprite.setData('collected', false)
      sprite.play('mirror-ward-pulse')
      this.tweens.add({
        targets: sprite,
        onUpdate: () => syncShadowRunnerPickupBody(sprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: pickup.y - 10,
        duration: 720,
        yoyo: true,
        repeat: -1,
        delay: index * 170,
        ease: 'Sine.inOut',
      })
    })

    this.level.galeMantlePickups?.forEach((pickup, index) => {
      const sprite = this.galeMantlePickups!.create(
        pickup.x,
        pickup.y,
        'shadow-runner-gale-mantle',
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setName(pickup.id)
      sprite.setScale(0.98)
      configureShadowRunnerPickupBody(sprite, 19)
      sprite.setImmovable(true)
      sprite.setDepth(19)
      sprite.setData('collected', false)
      sprite.play('gale-mantle-pulse')
      this.tweens.add({
        targets: sprite,
        onUpdate: () => syncShadowRunnerPickupBody(sprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: pickup.y - 11,
        duration: 680,
        yoyo: true,
        repeat: -1,
        delay: index * 160,
        ease: 'Sine.inOut',
      })
    })

    this.level.sunsteelEdgePickups?.forEach((pickup, index) => {
      const sprite = this.sunsteelEdgePickups!.create(
        pickup.x,
        pickup.y,
        'shadow-runner-sunsteel-edge',
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setName(pickup.id)
      sprite.setScale(0.98)
      configureShadowRunnerPickupBody(sprite, 19)
      sprite.setImmovable(true)
      sprite.setDepth(20)
      sprite.setData('collected', false)
      sprite.play('sunsteel-edge-pulse')
      this.tweens.add({
        targets: sprite,
        onUpdate: () => syncShadowRunnerPickupBody(sprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: pickup.y - 12,
        duration: 640,
        yoyo: true,
        repeat: -1,
        delay: index * 170,
        ease: 'Sine.inOut',
      })
    })

    this.level.dawnfireAegisPickups?.forEach((pickup, index) => {
      const sprite = this.dawnfireAegisPickups!.create(
        pickup.x,
        pickup.y,
        'shadow-runner-dawnfire-aegis',
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setName(pickup.id)
      sprite.setScale(1.02)
      configureShadowRunnerPickupBody(sprite, 19)
      sprite.setImmovable(true)
      sprite.setDepth(21)
      sprite.setData('collected', false)
      sprite.play('dawnfire-aegis-pulse')
      this.tweens.add({
        targets: sprite,
        onUpdate: () => syncShadowRunnerPickupBody(sprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: pickup.y - 12,
        duration: 620,
        yoyo: true,
        repeat: -1,
        delay: index * 170,
        ease: 'Sine.inOut',
      })
    })

    this.level.aetherStepPickups?.forEach((pickup, index) => {
      const sprite = this.aetherStepPickups!.create(
        pickup.x,
        pickup.y,
        'shadow-runner-aether-step',
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setName(pickup.id)
      sprite.setScale(1.02)
      configureShadowRunnerPickupBody(sprite, 19)
      sprite.setImmovable(true)
      sprite.setDepth(21)
      sprite.setData('collected', false)
      sprite.play('aether-step-pulse')
      this.tweens.add({
        targets: sprite,
        onUpdate: () => syncShadowRunnerPickupBody(sprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: pickup.y - 13,
        duration: 670,
        yoyo: true,
        repeat: -1,
        delay: index * 180,
        ease: 'Sine.inOut',
      })
    })

    this.level.objectivePickups?.forEach((pickup, index) => {
      const sprite = this.objectivePickups!.create(
        pickup.x,
        pickup.y,
        this.level.id === 'level-10'
          ? 'shadow-runner-relay-flame'
          : this.level.id === 'level-9'
            ? 'shadow-runner-watchfire-crest'
            : 'shadow-runner-relay-seal',
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setName(pickup.id)
      sprite.setScale(1.04)
      configureShadowRunnerPickupBody(sprite, 19)
      sprite.setImmovable(true)
      sprite.setDepth(19)
      sprite.setData('collected', false)
      sprite.play(
        this.level.id === 'level-10'
          ? 'relay-flame-spin'
          : this.level.id === 'level-9'
            ? 'watchfire-crest-spin'
            : 'relay-seal-spin',
      )
      this.tweens.add({
        targets: sprite,
        onUpdate: () => syncShadowRunnerPickupBody(sprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: pickup.y - 12,
        duration: 760,
        yoyo: true,
        repeat: -1,
        delay: index * 180,
        ease: 'Sine.inOut',
      })
    })

    this.level.masteryPickups?.forEach(pickup => {
      const sprite = this.masteryPickups!.create(
        pickup.x,
        pickup.y,
        this.level.id === 'level-10'
          ? 'shadow-runner-last-dispatch'
          : this.level.id === 'level-9'
            ? 'shadow-runner-captains-orders'
            : 'shadow-runner-courier-cache',
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setName(pickup.id)
      sprite.setScale(1.02)
      configureShadowRunnerPickupBody(sprite, 19)
      sprite.setImmovable(true)
      sprite.setDepth(19)
      sprite.setData('collected', false)
      sprite.setData('requiredPower', pickup.requiredPower ?? 'wraithlight')
      sprite.setAlpha(0.16)
      sprite.play(
        this.level.id === 'level-10'
          ? 'last-dispatch-reveal'
          : this.level.id === 'level-9'
            ? 'captains-orders-reveal'
            : 'courier-cache-reveal',
      )
      const body = sprite.body as Phaser.Physics.Arcade.StaticBody
      body.enable = false
    })

    this.level.spikes.forEach(spike => {
      const spikeVisual = addStaticPlatform(this, this.spikes!, spike, { texture: 'shadow-runner-spike-row' })
      const spikeCollider = spikeVisual.getData('platformCollider') as Phaser.GameObjects.Rectangle | undefined
      spikeCollider?.setData('damage', spike.damage ?? 3)
    })

    this.level.coins.forEach((coin, index) => {
      const coinSprite = this.coins!.create(coin.x, coin.y, 'shadow-runner-coin') as Phaser.Physics.Arcade.Sprite
      coinSprite.setName(coin.id)
      coinSprite.setScale(0.74)
      configureShadowRunnerPickupBody(coinSprite, 16)
      coinSprite.setImmovable(true)
      coinSprite.setDepth(16)
      coinSprite.setData('collected', false)
      coinSprite.play('coin-spin')
      this.tweens.add({
        targets: coinSprite,
        onUpdate: () => syncShadowRunnerPickupBody(coinSprite, this.cameras.main.scrollX, GAME_WIDTH),
        y: coin.y - 8,
        duration: 900,
        yoyo: true,
        repeat: -1,
        delay: index * 90,
        ease: 'Sine.inOut',
      })
    })

    const finish = this.level.finish
    const finishFrame = getTerrainFrameKey(finish.visualId ?? '')
    const finishTerrainTexture = getShadowRunnerTerrainRuntime(finish.terrainSet).textureKey
    const hasFinishTerrain = finish.visualId
      && this.textures.exists(finishTerrainTexture)
      && this.textures.get(finishTerrainTexture).has(finishFrame)
    if (hasFinishTerrain) {
      const gate = this.add.image(
        finish.x + finish.width / 2,
        finish.y + finish.height,
        finishTerrainTexture,
        finishFrame,
      )
      gate.setOrigin(0.5, 1)
      gate.setDisplaySize(
        finish.terrainSet === 'relay' ? 176 : finish.terrainSet === 'captain' ? 230 : finish.terrainSet === 'catacomb' ? 210 : finish.terrainSet === 'moon' ? 156 : 116,
        finish.terrainSet === 'relay' ? 286 : finish.terrainSet === 'captain' ? 250 : finish.terrainSet === 'catacomb' ? 232 : finish.terrainSet === 'moon' ? 170 : 164,
      )
      gate.setDepth(5)
      this.finishVisual = gate
      if (this.level.finishInteraction === 'ignite-relay') {
        this.deliveryFlame = this.add.sprite(finish.x + finish.width / 2, finish.y + 32, 'shadow-runner-relay-flame', 0)
          .setDisplaySize(112, 112).setDepth(19).setVisible(false)
      }
    } else if (this.textures.exists('shadow-runner-east-gate')) {
      const gate = this.add.image(finish.x + finish.width / 2, finish.y + finish.height, 'shadow-runner-east-gate')
      gate.setOrigin(0.5, 1)
      gate.setDisplaySize(96, 180)
      gate.setDepth(5)
    } else {
      this.add.rectangle(finish.x + finish.width / 2, finish.y + finish.height / 2, finish.width, finish.height, 0x211b2e, 0.64)
      this.add.rectangle(finish.x + finish.width / 2, finish.y + 24, finish.width + 18, 18, 0xd2a649, 0.86)
      this.add.rectangle(finish.x + finish.width / 2, finish.y + finish.height - 14, finish.width + 24, 18, 0x5f4420, 0.94)
    }
  }

  private createEncounterBarrier(encounter: ShadowRunnerEncounterConfig, x: number) {
    if (!this.encounterBarriers) return

    const captainBarrier = this.level.id === 'level-9'
    const relayBarrier = this.level.id === 'level-10'
    const terrain = getShadowRunnerTerrainRuntime(
      relayBarrier ? 'relay' : captainBarrier ? 'captain' : 'spectral',
    )
    const frame = getTerrainFrameKey(
      relayBarrier
        ? 'relay-phase-bridge'
        : captainBarrier
          ? 'captain-counterweight-bridge'
          : 'catacomb-spectral-bridge',
    )
    const hasFrame = this.textures.exists(terrain.textureKey)
      && this.textures.get(terrain.textureKey).has(frame)
    const barrierTop = Math.max(90, encounter.y)
    const barrierBottom = Math.min(this.level.worldHeight - 38, encounter.y + encounter.height)
    const barrierHeight = Math.max(180, barrierBottom - barrierTop)
    const visual = addStaticPlatform(
      this,
      this.encounterBarriers,
      { x: x - 15, y: barrierTop, width: 30, height: barrierHeight },
      hasFrame
        ? {
            texture: terrain.textureKey,
            frame,
            useImage: true,
            displayWidth: barrierHeight,
            displayHeight: 46,
            depth: 22,
          }
        : { texture: 'shadow-runner-stone', depth: 22 },
    )
    const collider = visual.getData('platformCollider') as Phaser.GameObjects.Rectangle | undefined
    const body = collider?.body as Phaser.Physics.Arcade.StaticBody | undefined

    visual.setRotation(Math.PI / 2)
    visual.setAlpha(0)
    visual.setVisible(false)
    if (body) body.enable = false

    this.encounterBarrierRuntimes.push({
      encounterId: encounter.id,
      enemyIds: encounter.enemyIds,
      visual,
      collider,
      active: false,
    })
  }

  private createCrouchGate(gate: NonNullable<ShadowRunnerLevelConfig['crouchGates']>[number]) {
    const visualX = gate.x + gate.width / 2
    const moonGate = gate.terrainSet === 'moon'
    const clockGate = gate.terrainSet === 'clock'
    const catacombGate = gate.terrainSet === 'catacomb'
    const captainGate = gate.terrainSet === 'captain'
    const relayGate = gate.terrainSet === 'relay'
    const candleGate = isCandleTerrainSet(gate.terrainSet)
    const readableCandleGate = gate.terrainSet === 'candleBright' || gate.terrainSet === 'candleShelf'
    const terrainTexture = relayGate
      ? 'shadow-runner-relay-terrain-atlas'
      : captainGate
      ? 'shadow-runner-captain-terrain-atlas'
      : moonGate
      ? 'shadow-runner-moon-terrain-atlas'
      : clockGate
      ? 'shadow-runner-clock-terrain-atlas'
      : catacombGate
        ? 'shadow-runner-catacomb-terrain-atlas'
      : candleGate
        ? readableCandleGate && this.textures.exists('shadow-runner-candle-readable-terrain-atlas')
          ? 'shadow-runner-candle-readable-terrain-atlas'
          : 'shadow-runner-candle-terrain-atlas'
        : 'shadow-runner-bell-terrain-atlas'
    const slabFrame = getTerrainFrameKey(
      moonGate
        ? 'moon-tall-overhang'
        : relayGate
          ? 'relay-conduit-overhang'
        : captainGate
          ? 'captain-overhang'
        : clockGate
          ? 'clock-overhang'
          : catacombGate
            ? 'catacomb-overhang'
            : candleGate
              ? 'candle-lintel'
              : 'bell-wide-ledge',
    )
    const blockFrame = getTerrainFrameKey(candleGate ? 'candle-small-plank' : 'bell-small-block')
    const shelfFrame = getTerrainFrameKey(candleGate ? 'candle-high-shelf' : 'bell-scroll-shelf')
    const hasGateTerrain = this.textures.exists(terrainTexture)
      && this.textures.get(terrainTexture).has(slabFrame)
      && (relayGate || captainGate || clockGate || moonGate || catacombGate || (
        this.textures.get(terrainTexture).has(blockFrame)
        && this.textures.get(terrainTexture).has(shelfFrame)
      ))
    const undersideY = gate.y + gate.height - 31
    const supportY = gate.y + gate.height - 92
    const archiveStackY = gate.y + 46

    if ((relayGate || captainGate || clockGate || moonGate || catacombGate) && hasGateTerrain) {
      const overhang = this.add.image(visualX, gate.y + gate.height / 2 - 16, terrainTexture, slabFrame)
      overhang.setDisplaySize(
        gate.width + (moonGate ? 58 : relayGate ? 54 : captainGate ? 52 : catacombGate ? 46 : 40),
        gate.height + (moonGate ? 128 : relayGate ? 96 : captainGate ? 92 : catacombGate ? 78 : 92),
      )
      overhang.setDepth(7)
    } else if (hasGateTerrain) {
      const slab = this.add.image(visualX, undersideY, terrainTexture, slabFrame)
      slab.setDisplaySize(gate.width + 34, 64)
      slab.setDepth(7)

      const leftBlock = this.add.image(gate.x + 34, supportY, terrainTexture, blockFrame)
      leftBlock.setDisplaySize(70, 146)
      leftBlock.setDepth(6)

      const rightBlock = this.add.image(gate.x + gate.width - 34, supportY, terrainTexture, blockFrame)
      rightBlock.setDisplaySize(70, 146)
      rightBlock.setDepth(6)

      const archiveStack = this.add.image(visualX, archiveStackY, terrainTexture, shelfFrame)
      archiveStack.setDisplaySize(Math.min(168, gate.width * 0.58), 138)
      archiveStack.setDepth(8)
    } else {
      this.add.rectangle(visualX, undersideY, gate.width + 34, 64, 0x1b2130, 0.74)
      this.add.rectangle(visualX, archiveStackY, Math.min(168, gate.width * 0.58), 124, 0x2f261a, 0.82)
    }

    const blocker = this.add.rectangle(
      gate.x + gate.width / 2,
      gate.y + gate.height / 2,
      gate.width,
      gate.height,
      0x000000,
      0,
    )
    blocker.setName(gate.id)
    blocker.setData('low-clearance-blocker', true)
    this.crouchGates!.add(blocker)

    const body = blocker.body as Phaser.Physics.Arcade.StaticBody
    body.setSize(gate.width, gate.height)
    body.updateFromGameObject()
  }

  private createActors() {
    const start = this.level.playerStart
    this.player = this.physics.add.sprite(start.x, start.y, 'shadow-runner-idle')
    this.player.setDepth(11)
    this.player.setOrigin(0.5, 1)
    this.player.setScale(HERO_SCALE)
    this.player.setCollideWorldBounds(false)
    this.player.setMaxVelocity(360, 940)
    this.player.setDragX(1450)
    this.player.setSize(42, 70)
    this.player.setOffset(43, 58)
    this.player.play('runner-idle')

    if (this.textures.exists('shadow-runner-boost-aura')) {
      this.boostAura = this.add.sprite(start.x, start.y - 54, 'shadow-runner-boost-aura')
      this.boostAura.setVisible(false)
      this.boostAura.setDepth(24)
      this.boostAura.setAlpha(0.7)
      this.boostAura.play('boost-aura')
    }

    this.shieldAura = this.add.graphics()
    this.shieldAura.setDepth(25)
    this.shieldAura.setVisible(false)

    this.chronoAura = this.add.graphics()
    this.chronoAura.setDepth(24)
    this.chronoAura.setVisible(false)

    this.surgeAura = this.add.graphics()
    this.surgeAura.setDepth(26)
    this.surgeAura.setVisible(false)

    this.wraithlightAura = this.add.graphics()
    this.wraithlightAura.setDepth(23)
    this.wraithlightAura.setVisible(false)

    this.mirrorWardAura = this.add.graphics()
    this.mirrorWardAura.setDepth(27)
    this.mirrorWardAura.setVisible(false)

    this.galeMantleAura = this.add.graphics()
    this.galeMantleAura.setDepth(24)
    this.galeMantleAura.setVisible(false)

    this.sunsteelEdgeAura = this.add.graphics()
    this.sunsteelEdgeAura.setDepth(28)
    this.sunsteelEdgeAura.setVisible(false)

    this.dawnfireAegisAura = this.add.graphics()
    this.dawnfireAegisAura.setDepth(29)
    this.dawnfireAegisAura.setVisible(false)

    this.aetherStepAura = this.add.graphics()
    this.aetherStepAura.setDepth(24)
    this.aetherStepAura.setVisible(false)

    getShadowRunnerLevelEnemies(this.level).forEach(enemyStart => {
      const enemy = this.createEnemySprite(enemyStart)
      this.enemies.push(enemy)
      this.enemyHealthBars.push(this.add.graphics())
      this.enemyHealthFrames.push(this.add.image(0, 0, 'shadow-runner-health-frame'))
    })

    this.archerProjectiles = this.physics.add.group({
      allowGravity: false,
      maxSize: 48,
    })

    this.slashArc = this.add.graphics()
    this.slashArc.setDepth(30)
    this.slashSprite = this.add.sprite(0, 0, 'shadow-runner-sword-slash')
    this.slashSprite.setVisible(false)
    this.slashSprite.setDepth(30)
    this.slashSprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.slashSprite?.setVisible(false)
    })

    this.physics.add.collider(this.player, this.platforms!)
    this.physics.add.collider(this.player, this.crouchGates!)
    this.physics.add.collider(this.player, this.encounterBarriers!)
    this.enemies.forEach(enemy => {
      if (this.getEnemyKind(enemy) !== 'gearwing-drone') {
        this.physics.add.collider(enemy, this.platforms!)
        this.physics.add.collider(enemy, this.crouchGates!)
      }
      this.physics.add.overlap(this.player!, enemy, () => this.handlePlayerEnemyOverlap(this.activeTimeMs, enemy))
      this.physics.add.overlap(enemy, this.archerProjectiles!, (_enemy, projectile) => {
        this.handleReflectedProjectileEnemyHit(enemy, projectile as Phaser.Physics.Arcade.Image)
      })
    })
    this.physics.add.collider(this.archerProjectiles, this.platforms!, (projectile, platform) => {
      const hazardProjectile = projectile as Phaser.Physics.Arcade.Image
      this.maybeCreateProjectileImpactHazard(hazardProjectile, (platform as Phaser.Physics.Arcade.Image).body!)
      this.disableProjectile(hazardProjectile)
    })
    this.physics.add.collider(this.archerProjectiles, this.crouchGates!, (projectile, platform) => {
      const hazardProjectile = projectile as Phaser.Physics.Arcade.Image
      this.maybeCreateProjectileImpactHazard(hazardProjectile, (platform as Phaser.Physics.Arcade.Image).body!)
      this.disableProjectile(hazardProjectile)
    })
    this.physics.add.collider(this.archerProjectiles, this.encounterBarriers!, projectile => {
      this.disableProjectile(projectile as Phaser.Physics.Arcade.Image)
    })
    this.physics.add.overlap(this.player, this.archerProjectiles, (_player, projectile) => {
      const hazardProjectile = projectile as Phaser.Physics.Arcade.Image
      if (this.tryReflectProjectileWithMirrorWard(hazardProjectile)) return
      if (this.tryBlockProjectileWithShield(hazardProjectile)) return

      this.disableProjectile(hazardProjectile)
      this.damagePlayerFromHazard(
        this.activeTimeMs,
        hazardProjectile.x,
        Number(hazardProjectile.getData('damage') ?? 1),
      )
    })
    this.physics.add.overlap(this.player, this.candleHazards!, (_player, hazard) => {
      const activeHazard = hazard as Phaser.GameObjects.GameObject & { x?: number }
      this.damagePlayerFromHazard(
        this.activeTimeMs,
        activeHazard.x,
        Number(activeHazard.getData('damage') ?? 1),
      )
    })
    this.physics.add.overlap(this.player, this.spikes!, (_player, spike) => {
      const hazard = spike as Phaser.GameObjects.GameObject
      this.damagePlayerFromHazard(this.activeTimeMs, undefined, Number(hazard.getData('damage') ?? 3))
    })
    this.physics.add.overlap(this.player, this.coins!, (_player, coin) => {
      this.collectCoin(coin as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.boostPickups!, (_player, boost) => {
      this.collectBoost(boost as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.shieldPickups!, (_player, shield) => {
      this.collectShield(shield as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.chronoPickups!, (_player, chrono) => {
      this.collectChrono(chrono as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.surgePickups!, (_player, surge) => {
      this.collectSurge(surge as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.moonShardPickups!, (_player, shard) => {
      this.collectMoonShard(shard as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.wraithlightPickups!, (_player, pickup) => {
      this.collectWraithlight(pickup as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.mirrorWardPickups!, (_player, pickup) => {
      this.collectMirrorWard(pickup as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.galeMantlePickups!, (_player, pickup) => {
      this.collectGaleMantle(pickup as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.sunsteelEdgePickups!, (_player, pickup) => {
      this.collectSunsteelEdge(pickup as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.dawnfireAegisPickups!, (_player, pickup) => {
      this.collectDawnfireAegis(pickup as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.aetherStepPickups!, (_player, pickup) => {
      this.collectAetherStep(pickup as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.objectivePickups!, (_player, pickup) => {
      this.collectObjective(pickup as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.masteryPickups!, (_player, pickup) => {
      this.collectMastery(pickup as Phaser.Physics.Arcade.Sprite)
    })
  }

  private createEnemySprite(enemyStart: ShadowRunnerEnemyConfig) {
    const runtime = SHADOW_RUNNER_ENEMY_RUNTIME[enemyStart.kind]
    const enemy = this.physics.add.sprite(enemyStart.x, enemyStart.y, runtime.textureKey)
    enemy.setDepth(10)
    enemy.setName(enemyStart.id)
    enemy.setData('enemyId', enemyStart.id)
    enemy.setData('enemyKind', enemyStart.kind)
    enemy.setData('startX', enemyStart.x)
    enemy.setData('startY', enemyStart.y)
    enemy.setOrigin(0.5, 1)
    enemy.setCollideWorldBounds(false)
    enemy.setScale(runtime.scale)
    enemy.setSize(runtime.body.width, runtime.body.height)
    enemy.setOffset(runtime.body.offsetX, runtime.body.offsetY)
    enemy.setMaxVelocity(runtime.maxVelocityX, 920)
    enemy.play(enemyStart.kind === 'tomb-lurker' ? 'lurker-dormant' : runtime.animations.walk)
    this.setEnemyFacing(enemy, enemyStart.direction)

    if (enemyStart.kind === 'gearwing-drone') {
      const body = enemy.body as Phaser.Physics.Arcade.Body
      body.setAllowGravity(false)
      enemy.setData('hoverPhase', (enemyStart.x % 500) / 500 * Math.PI * 2)
      enemy.setData('droneAttackUntil', 0)
    }

    const enemyState = this.state.enemies.find(current => current.id === enemyStart.id)
    if (enemyState && !enemyState.activated) {
      enemy.setVelocity(0, 0)
      enemy.setData('sleeping', true)
      if (enemyStart.kind !== 'tomb-lurker') {
        enemy.setAlpha(0.42)
      }
      const body = enemy.body as Phaser.Physics.Arcade.Body
      body.enable = false
    }
    return enemy
  }

  private createInput() {
    this.cursors = this.input.keyboard?.createCursorKeys()
    this.keys = this.input.keyboard?.addKeys({
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      z: Phaser.Input.Keyboard.KeyCodes.Z,
      j: Phaser.Input.Keyboard.KeyCodes.J,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      s: Phaser.Input.Keyboard.KeyCodes.S,
    }) as Record<'a' | 'd' | 'w' | 'space' | 'z' | 'j' | 'shift' | 's', Phaser.Input.Keyboard.Key> | undefined

    if (this.qaEnabled) {
      this.registerQaShortcuts()
    }
  }

  private registerQaShortcuts() {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.code === 'Digit2') {
        const enemy = this.getFirstAliveEnemyConfig()
        if (enemy) {
          this.teleportPlayerForQa(enemy.x - 120, enemy.y)
        }
      } else if (event.code === 'Digit3') {
        const finish = this.level.finish
        this.teleportPlayerForQa(finish.x + finish.width / 2, finish.y + finish.height)
      } else if (event.code === 'Digit4') {
        const tiltPlatform = this.level.tiltPlatforms[0]
        if (tiltPlatform) {
          this.teleportPlayerForQa(tiltPlatform.x + tiltPlatform.width / 2, tiltPlatform.y - 2)
        }
      } else if (event.code === 'Digit5') {
        const boost = this.level.boosts?.[0]
        if (boost) {
          this.teleportPlayerForQa(boost.x, boost.y + 28)
        }
      } else if (event.code === 'Digit6') {
        const shield = this.level.shieldPickups?.[0]
        if (shield) {
          this.teleportPlayerForQa(shield.x, shield.y + 28)
        }
      } else if (event.code === 'Digit7') {
        const chrono = this.level.chronoPickups?.[0]
        if (chrono) {
          this.teleportPlayerForQa(chrono.x, chrono.y + 28)
        }
      } else if (event.code === 'KeyH') {
        this.damagePlayerFromHazard(this.activeTimeMs)
      } else if (event.code === 'KeyK') {
        this.damageEnemyForQa()
      }
    })
  }

  private registerQaDebugSnapshot() {
    if (!this.qaEnabled || this.runtimeDisposed) return
    const debugWindow = window as ShadowRunnerDebugWindow
    const snapshot: NonNullable<ShadowRunnerDebugWindow['__shadowRunnerDebug']> = () => {
      const playerBody = this.player?.body as Phaser.Physics.Arcade.Body | undefined
      const tiltActor = this.tiltActors[0]
      const supportedBridge = playerBody?.enable && tiltActor?.body === playerBody && !this.respawnPending
        ? tiltActor.support : null
      const camera = this.cameras?.main
      const view = camera?.worldView
      const floorHazards = this.candleHazards?.getChildren().flatMap<ShadowRunnerDebugSnapshot['floorHazards'][number]>(child => {
        const hazard = child as Phaser.Physics.Arcade.Image
        const body = hazard.body as Phaser.Physics.Arcade.StaticBody | null
        if (!camera || !view || !camera.visible || camera.alpha <= 0
          || !hazard.active || !hazard.visible || hazard.alpha <= 0 || !body?.enable
          || (hazard.cameraFilter & camera.id) !== 0) return []
        const kind = hazard.getData('hazardKind')
        if (kind !== 'candle' && kind !== 'storm') return []
        // Read the collision body as-is: visual tween sizes are not hitbox sizes.
        const { left, right, top, bottom } = body
        if (![left, right, top, bottom].every(Number.isFinite)
          || right <= left || bottom <= top
          || right <= view.left || left >= view.right || bottom <= view.top || top >= view.bottom) return []
        return [{ kind, left, right, top, bottom }]
      }) ?? []

      const stormWarnings = this.archerProjectiles?.getChildren().flatMap<ShadowRunnerDebugSnapshot['stormWarnings'][number]>(child => {
        const projectile = child as Phaser.Physics.Arcade.Image
        if (!camera || !view || !camera.visible || camera.alpha <= 0 || !projectile.active
          || !projectile.body?.enable || projectile.getData('projectileKind') !== 'storm-bomb') return []
        const marker = projectile.getData('warningMarker') as Phaser.GameObjects.Ellipse | undefined
        if (!marker?.active || !marker.visible || marker.alpha <= 0 || (marker.cameraFilter & camera.id) !== 0) return []
        const { left, right, top, bottom } = marker.getBounds()
        if (![left, right, top, bottom].every(Number.isFinite) || right <= left || bottom <= top
          || right <= view.left || left >= view.right || bottom <= view.top || top >= view.bottom) return []
        return [{ left, right, top, bottom }]
      }) ?? []

      const visibleArrows = this.archerProjectiles?.getChildren().flatMap<ShadowRunnerDebugSnapshot['visibleArrows'][number]>(child => {
        const projectile = child as Phaser.Physics.Arcade.Image
        const body = projectile.body as Phaser.Physics.Arcade.Body | null
        if (!camera || !view || !camera.visible || camera.alpha <= 0
          || !projectile.active || !projectile.visible || projectile.alpha <= 0 || !body?.enable
          || (projectile.cameraFilter & camera.id) !== 0
          || projectile.getData('projectileKind') !== 'arrow' || projectile.getData('reflectedByPlayer')) return []
        const { left, right, top, bottom } = body
        const velocityX = body.velocity?.x
        const velocityY = body.velocity?.y
        if (![left, right, top, bottom, velocityX, velocityY].every(Number.isFinite)
          || right <= left || bottom <= top
          || right <= view.left || left >= view.right || bottom <= view.top || top >= view.bottom) return []
        return [{ left, right, top, bottom, velocityX, velocityY }]
      }) ?? []

      return {
        levelId: this.level.id,
        deliveryState: this.deliveryState,
        activeTimeMs: this.activeTimeMs,
        attackId: this.attackId,
        attackHitEnemyIds: [...this.attackHitEnemyIds],
        deadlines: {
          attackUntil: this.state.player.attackingUntil,
          attackCooldownUntil: this.state.player.attackCooldownUntil,
          spectralGraceUntil: this.spectralGrace.until,
        },
        entityCounts: {
          displayObjects: this.children.length,
          enemies: this.enemies.length,
          tweens: this.tweens.getTweens().length,
        },
        tiltBridges: {
          totalBridgeCount: this.tiltPlatforms.length,
          activeBodyCount: this.tiltBodies.length,
          bridges: this.tiltPlatforms.slice(0, TILT_DEBUG_BRIDGE_LIMIT).map(bridge => {
            // Inactive physics geometry is stale; sample the displayed pose
            // without updating either live geometry buffer or exposing its refs.
            const rotation = bridge.visual.rotation
            const cos = Math.cos(rotation)
            const sin = Math.sin(rotation)
            const { pivotX, pivotY, deckOffsetY, length } = bridge.pose
            const centerX = pivotX - deckOffsetY * sin
            const centerY = pivotY + deckOffsetY * cos
            const halfX = length * cos / 2
            const halfY = length * sin / 2
            return {
              id: bridge.config.id,
              visualRotation: rotation,
              left: { x: centerX - halfX, y: centerY - halfY },
              right: { x: centerX + halfX, y: centerY + halfY },
              maxSurfaceError: Math.abs(sin) * length / bridge.geometry.slices.length / 2,
              activeBodyCount: bridge.bodies.length,
            }
          }),
          playerSupport: supportedBridge
            ? { bridgeId: supportedBridge.config.id, surfaceY: tiltActor.supportY } : null,
        },
        openingArt: usesShadowRunnerOpeningArt(this.level.id) ? {
          walkwayReady: this.textures.exists(SHADOW_RUNNER_OPENING_WALKWAY.textureKey),
          platforms: this.openingPlatformArt.map(platform => ({ ...platform })),
          backdrop: this.openingBackdrop && this.openingBackdropLayout ? {
            x: this.openingBackdrop.x,
            y: this.openingBackdrop.y,
            width: this.openingBackdrop.displayWidth,
            height: this.openingBackdrop.displayHeight,
            travelX: this.openingBackdropLayout.travelX,
            frozen: this.reducedMotion || this.gameplayPaused,
          } : undefined,
        } : undefined,
        checkpointId: this.level.checkpoints?.[this.activeCheckpointIndex]?.id,
        // Collected sprites remain in their groups after their bodies are disabled.
        collectedPowerIds: [
          this.boostPickups, this.shieldPickups, this.chronoPickups, this.surgePickups,
          this.wraithlightPickups, this.mirrorWardPickups, this.galeMantlePickups,
          this.sunsteelEdgePickups, this.dawnfireAegisPickups, this.aetherStepPickups,
        ].flatMap(group => group?.getChildren().flatMap(child => {
          const sprite = child as Phaser.Physics.Arcade.Sprite
          return sprite.getData('collected') === true && typeof sprite.name === 'string' && sprite.name.length > 0
            ? [sprite.name] : []
        }) ?? []),
        districtDepth: this.districtDepth.map(({ config, image }) => ({
          id: config.id, x: image.x, y: image.y, width: image.displayWidth, height: image.displayHeight,
          alpha: image.alpha, frozen: this.reducedMotion || this.gameplayPaused,
        })),
        wayposts: this.checkpointWayposts.map(({ index, image }) => ({
          id: this.level.checkpoints![index].id, x: image.x, y: image.y,
          width: image.displayWidth, height: image.displayHeight, tint: image.tintTopLeft, alpha: image.alpha,
        })),
        objective: this.state.objective,
        respawnPending: this.respawnPending,
        player: this.player
          ? {
              x: Math.round(this.player.x),
              y: Math.round(this.player.y),
              velocityX: Math.round(playerBody?.velocity.x ?? 0),
              velocityY: Math.round(playerBody?.velocity.y ?? 0),
              bodyTop: Math.round(playerBody?.top ?? 0),
              bodyBottom: Math.round(playerBody?.bottom ?? 0),
              bodyLeft: playerBody?.left ?? 0,
              bodyRight: playerBody?.right ?? 0,
              bodyHeight: Math.round(playerBody?.height ?? 0),
              crouchInput: this.controls.current.crouch,
              crouching: this.crouching,
              standingBlocked: this.standingBlocked,
              health: this.state.player.health,
              lives: this.state.player.lives,
              checkpointRespawns: this.state.player.checkpointRespawns,
              coins: this.state.player.coins,
              score: this.state.player.score,
              shieldActive: isShadowRunnerShieldActive(this.state, this.activeTimeMs),
              shieldRemainingMs: Math.max(0, this.state.player.shieldActiveUntil - this.activeTimeMs),
              shieldGuardCharges: this.state.player.shieldGuardCharges,
              chronoActive: isShadowRunnerChronoActive(this.state, this.activeTimeMs),
              chronoRemainingMs: Math.max(0, this.state.player.chronoActiveUntil - this.activeTimeMs),
              surgeActive: isShadowRunnerSurgeActive(this.state, this.activeTimeMs),
              surgeRemainingMs: Math.max(0, this.state.player.surgeActiveUntil - this.activeTimeMs),
              wraithlightActive: isShadowRunnerWraithlightActive(this.state, this.activeTimeMs),
              wraithlightRemainingMs: Math.max(0, this.state.player.wraithlightActiveUntil - this.activeTimeMs),
              mirrorWardActive: isShadowRunnerMirrorWardActive(this.state, this.activeTimeMs),
              mirrorWardRemainingMs: Math.max(0, this.state.player.mirrorWardActiveUntil - this.activeTimeMs),
              mirrorWardCharges: this.state.player.mirrorWardCharges,
              galeMantleActive: isShadowRunnerGaleMantleActive(this.state, this.activeTimeMs),
              galeMantleRemainingMs: Math.max(0, this.state.player.galeMantleActiveUntil - this.activeTimeMs),
              sunsteelEdgeActive: isShadowRunnerSunsteelEdgeActive(this.state, this.activeTimeMs),
              sunsteelEdgeRemainingMs: Math.max(0, this.state.player.sunsteelEdgeActiveUntil - this.activeTimeMs),
              sunsteelEdgeCharges: this.state.player.sunsteelEdgeCharges,
              dawnfireAegisActive: isShadowRunnerDawnfireAegisActive(this.state, this.activeTimeMs),
              dawnfireAegisRemainingMs: Math.max(0, this.state.player.dawnfireAegisActiveUntil - this.activeTimeMs),
              aetherStepActive: isShadowRunnerAetherStepActive(this.state, this.activeTimeMs),
              aetherStepRemainingMs: Math.max(0, this.state.player.aetherStepActiveUntil - this.activeTimeMs),
              moonShards: this.state.player.moonShards,
              totalMoonShards: this.level.moonShardPickups?.length ?? 0,
              objectiveItems: this.state.player.objectiveItems,
              totalObjectiveItems: this.level.objectivePickups?.length ?? 0,
              masteryItems: this.state.player.masteryItems,
              totalMasteryItems: this.level.masteryPickups?.length ?? 0,
            }
          : undefined,
        enemies: this.enemies.map(enemy => {
          const enemyState = this.getEnemyState(enemy)
          const body = enemy.body as Phaser.Physics.Arcade.Body | undefined

          return {
            id: this.getEnemyId(enemy),
            kind: this.getEnemyKind(enemy),
            alive: Boolean(enemyState?.alive),
            x: Math.round(enemy.x),
            y: Math.round(enemy.y),
            velocityX: Math.round(body?.velocity.x ?? 0),
            velocityY: Math.round(body?.velocity.y ?? 0),
            health: enemyState?.health ?? 0,
            maxHealth: enemyState?.maxHealth ?? 0,
            patrolLeft: enemyState?.patrolLeft ?? 0,
            patrolRight: enemyState?.patrolRight ?? 0,
            direction: enemyState?.direction ?? 1,
            guard: enemyState?.guard ?? 0,
            maxGuard: enemyState?.maxGuard ?? 0,
            activated: Boolean(enemyState?.activated),
            bossPhaseId: enemy.getData('bossPhaseId') as string | undefined,
            bossPhaseLabel: enemy.getData('bossPhaseLabel') as string | undefined,
          }
        }),
        encounters: (this.level.encounters ?? []).map(encounter => ({
          id: encounter.id,
          sealed: Boolean(encounter.sealed),
          barrierActive: this.encounterBarrierRuntimes.some(
            runtime => runtime.encounterId === encounter.id && runtime.active,
          ),
          cleared: this.clearedEncounterIds.has(encounter.id) || encounter.enemyIds.every(enemyId => {
            const enemy = this.state.enemies.find(current => current.id === enemyId)
            return !enemy?.alive
          }),
          remainingEnemies: encounter.enemyIds.filter(enemyId => {
            const enemy = this.state.enemies.find(current => current.id === enemyId)
            return Boolean(enemy?.alive)
          }).length,
        })),
        pools: {
          projectiles: {
            active: this.archerProjectiles?.countActive(true) ?? 0,
            total: this.archerProjectiles?.getLength() ?? 0,
            stormBombs: this.archerProjectiles?.getChildren().filter(child => (
              (child as Phaser.Physics.Arcade.Image).active
              && (child as Phaser.Physics.Arcade.Image).getData('projectileKind') === 'storm-bomb'
            )).length ?? 0,
          },
          candleHazards: {
            active: this.candleHazards?.countActive(true) ?? 0,
            total: this.candleHazards?.getLength() ?? 0,
            stormHazards: this.candleHazards?.getChildren().filter(child => (
              (child as Phaser.Physics.Arcade.Image).active
              && (child as Phaser.Physics.Arcade.Image).getData('hazardKind') === 'storm'
            )).length ?? 0,
          },
        },
        floorHazards,
        stormWarnings,
        visibleArrows,
        windZones: this.windZones.map(runtime => ({
          id: runtime.config.id,
          active: runtime.active,
          telling: runtime.telling,
          direction: runtime.config.direction,
        })),
        movingPlatforms: this.movingPlatforms.map(runtime => ({
          id: runtime.config.id,
          x: Math.round(runtime.lastX),
          y: Math.round(runtime.lastY),
          direction: runtime.direction,
          paused: this.activeTimeMs < runtime.pauseUntil,
          pauseRemainingMs: Math.max(0, runtime.pauseUntil - this.activeTimeMs),
        })),
        phasePlatforms: this.phasePlatforms.map(runtime => ({
          id: runtime.config.id,
          state: runtime.state,
        })),
        relayBeamZones: this.relayBeamZones.map(runtime => ({
          id: runtime.config.id,
          state: runtime.state,
          lanes: runtime.config.lanes,
        })),
      }
    }
    const qa: NonNullable<ShadowRunnerDebugWindow['__shadowRunnerQa']> = {
      teleport: (x, y) => this.teleportPlayerForQa(x, y),
      restore: () => {
        restoreShadowRunnerPlayer(this.state)
        this.state.player.lastDamagedAt = this.activeTimeMs
        this.emitHud(true)
      },
      damage: amount => {
        this.state.player.lastDamagedAt = Number.NEGATIVE_INFINITY
        this.damagePlayerFromHazard(this.activeTimeMs, undefined, amount)
      },
      collect: (kind, index = 0) => {
        const pickup = kind === 'shield'
          ? this.level.shieldPickups?.[index]
          : kind === 'wraithlight'
            ? this.level.wraithlightPickups?.[index]
            : kind === 'mirrorWard'
              ? this.level.mirrorWardPickups?.[index]
            : kind === 'galeMantle'
              ? this.level.galeMantlePickups?.[index]
              : kind === 'sunsteelEdge'
                ? this.level.sunsteelEdgePickups?.[index]
                : kind === 'dawnfireAegis'
                  ? this.level.dawnfireAegisPickups?.[index]
                  : kind === 'aetherStep'
                    ? this.level.aetherStepPickups?.[index]
                    : kind === 'objective'
                      ? this.level.objectivePickups?.[index]
                      : this.level.masteryPickups?.[index]
        if (pickup) {
          this.teleportPlayerForQa(pickup.x, pickup.y + 24)
        }
      },
      defeatEnemy: enemyId => {
        const enemyState = this.state.enemies.find(current => current.id === enemyId)
        const enemy = this.enemies.find(current => this.getEnemyId(current) === enemyId)
        if (!enemyState || !enemy) return
        enemyState.activated = true
        enemyState.guard = 0
        enemyState.health = 0
        enemyState.alive = false
        this.defeatEnemy(enemy)
        this.emitHud(true)
      },
      damageEnemy: (enemyId, amount) => {
        const enemyState = this.state.enemies.find(current => current.id === enemyId)
        const enemy = this.enemies.find(current => this.getEnemyId(current) === enemyId)
        if (!enemyState || !enemy || !enemyState.alive) return
        enemyState.activated = true
        const body = enemy.body as Phaser.Physics.Arcade.Body
        body.enable = true
        enemy.setData('sleeping', false)
        enemy.setAlpha(1)
        enemyState.lastDamagedAt = Number.NEGATIVE_INFINITY
        damageShadowRunnerEnemy(this.state, this.activeTimeMs, amount, enemyId, { bypassGuard: true })
        if (!enemyState.alive) {
          this.defeatEnemy(enemy)
        }
        this.emitHud(true)
      },
      fireAtPlayer: () => {
        if (!this.player) return
        const body = this.player.body as Phaser.Physics.Arcade.Body
        this.createArrowProjectile(
          body.center.x - 84,
          body.center.y,
          1,
          420,
          2200,
          3,
        )
      },
      stormAtPlayer: () => {
        const grenadier = this.enemies.find(enemy => this.getEnemyKind(enemy) === 'storm-grenadier')
        if (!grenadier || !this.player) return
        const config = getShadowRunnerLevelEnemies(this.level)
          .find(enemy => enemy.id === this.getEnemyId(grenadier))
        const direction = this.player.x >= grenadier.x ? 1 : -1
        this.createStormBomb(grenadier, direction, config)
      },
      move: (direction, pressed) => {
        this.controls.current[direction] = pressed
      },
    }

    debugWindow.__shadowRunnerDebug = snapshot
    debugWindow.__shadowRunnerQa = qa
    const cleanup = () => {
      if (debugWindow.__shadowRunnerDebug === snapshot) {
        delete debugWindow.__shadowRunnerDebug
      }
      if (debugWindow.__shadowRunnerQa === qa) {
        delete debugWindow.__shadowRunnerQa
      }
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup)
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup)
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)
  }

  private teleportPlayerForQa(x: number, y: number) {
    if (!this.player) return

    this.releasePlayerTiltContact()
    this.airborneStartY = null
    this.lastSupportedFootY = null
    this.wasOnFloor = false
    this.spectralGrace = createShadowRunnerSpectralGrace()
    this.player.setVelocity(0, 0)
    this.player.setPosition(x, y)
    this.cameras.main.centerOn(x, y - 80)
  }

  private getEnemyId(enemy: Phaser.Physics.Arcade.Sprite) {
    return String(enemy.getData('enemyId') ?? enemy.name)
  }

  private getEnemyKind(enemy: Phaser.Physics.Arcade.Sprite): ShadowRunnerEnemyKind {
    return (enemy.getData('enemyKind') as ShadowRunnerEnemyKind | undefined)
      ?? this.getEnemyState(enemy)?.kind
      ?? 'clockwork-sentry'
  }

  private getEnemyPatrolSpeed(enemyState: ShadowRunnerEnemyState) {
    return enemyState.patrolSpeed ?? SHADOW_RUNNER_ENEMY_RUNTIME[enemyState.kind].defaultPatrolSpeed
  }

  private getEnemyAnimation(enemyKind: ShadowRunnerEnemyKind, state: 'walk' | 'attack' | 'hit' | 'defeated') {
    return SHADOW_RUNNER_ENEMY_RUNTIME[enemyKind].animations[state]
  }

  private setEnemyFacing(enemy: Phaser.Physics.Arcade.Sprite, direction: 1 | -1) {
    const enemyKind = this.getEnemyKind(enemy)
    const runtime = SHADOW_RUNNER_ENEMY_RUNTIME[enemyKind]
    enemy.setFlipX(runtime.flipWhenFacingLeft ? direction < 0 : direction > 0)
  }

  private getEnemyState(enemy: Phaser.Physics.Arcade.Sprite): ShadowRunnerEnemyState | undefined {
    const enemyId = this.getEnemyId(enemy)
    return this.state.enemies.find(current => current.id === enemyId)
  }

  private getFirstAliveEnemy() {
    return this.enemies.find(enemy => this.getEnemyState(enemy)?.alive)
  }

  private getFirstAliveEnemyConfig() {
    return getShadowRunnerLevelEnemies(this.level).find(enemy => {
      const state = this.state.enemies.find(current => current.id === enemy.id)
      return state?.alive
    })
  }

  private playSound(event: ShadowRunnerSoundEvent) {
    this.onSoundEvent?.(event)
  }

  private flashCamera(duration: number, red: number, green: number, blue: number) {
    if (this.reducedMotion) return
    this.cameras.main.flash(duration, red, green, blue, false)
  }

  private shakeCamera(duration: number, intensity: number) {
    if (this.reducedMotion) return
    this.cameras.main.shake(duration, intensity)
  }

  private damageEnemyForQa() {
    const enemy = this.getFirstAliveEnemy()
    if (!enemy) return

    const enemyState = this.getEnemyState(enemy)
    const damaged = damageShadowRunnerEnemy(this.state, this.activeTimeMs, 1, this.getEnemyId(enemy))
    if (!damaged) return

    this.playSound('enemy-hit')
    this.addHitFlash(enemy.x, enemy.y - 42)
    if (!enemyState?.alive) {
      this.defeatEnemy(enemy)
    }
    this.emitHud(true)
  }

  private consumeActionKeyPress(key: Phaser.Input.Keyboard.Key | undefined) {
    if (!key) return false
    const pressed = Phaser.Input.Keyboard.JustDown(key)
    return pressed && !key.originalEvent?.repeat
  }

  private consumeKeyboardActionPresses() {
    // JustDown consumes an edge. Read every binding before combining them so
    // simultaneous inputs cannot leak into a later frame or survive a pause.
    const up = this.consumeActionKeyPress(this.cursors?.up)
    const w = this.consumeActionKeyPress(this.keys?.w)
    const space = this.consumeActionKeyPress(this.keys?.space)
    const z = this.consumeActionKeyPress(this.keys?.z)
    const j = this.consumeActionKeyPress(this.keys?.j)
    return { jump: up || w || space, attack: z || j }
  }

  private updatePlayer(time: number) {
    const player = this.player!
    const body = player.body as Phaser.Physics.Arcade.Body
    const input = this.controls.current
    const cursors = this.cursors
    const keys = this.keys
    const onBridge = Boolean(this.tiltActors[0]?.support)
    const onFloor = onBridge || body.blocked.down || body.touching.down
    const left = input.left || Boolean(cursors?.left.isDown) || Boolean(keys?.a.isDown)
    const right = input.right || Boolean(cursors?.right.isDown) || Boolean(keys?.d.isDown)
    const crouch = input.crouch || Boolean(keys?.shift.isDown) || Boolean(keys?.s.isDown)
    const keyboardPresses = this.consumeKeyboardActionPresses()
    const jumpPress = input.jumpPresses !== this.lastJumpPresses || keyboardPresses.jump
    const attackPress = input.attackPresses !== this.lastAttackPresses || keyboardPresses.attack

    this.lastJumpPresses = input.jumpPresses
    this.lastAttackPresses = input.attackPresses
    this.deliveryRequested = false
    this.clampPlayerHorizontalBounds(body)
    this.standingBlocked = this.crouching
      && !canShadowRunnerStand(body, 70 * HERO_SCALE, this.getSolidBodies())
    const crouching = shouldShadowRunnerCrouch(
      crouch && !jumpPress,
      onFloor,
      this.crouching,
      !this.standingBlocked,
    )

    if (onFloor && (onBridge || body.velocity.y >= 0)) {
      this.jumpsUsed = 0
      if (!this.wasOnFloor && time > 320) {
        this.playSound('land')
        this.addDustPuff(player.x, player.y - 22)
        this.applyFallDamageOnLanding(time)
        if (this.respawnPending) return
      }
      this.airborneStartY = null
      this.lastSupportedFootY = body.bottom
    }

    if (!onFloor) {
      if (this.wasOnFloor || this.airborneStartY === null) {
        this.airborneStartY = this.lastSupportedFootY ?? body.bottom
      }
    }

    // Arcade applies drag before the next input refresh. Braking held movement
    // makes travel depend on render rate and can cancel crouched wind control.
    body.setDragX(left !== right ? 0 : 1450)
    if (left !== right) {
      const direction = right ? 1 : -1
      const speedMultiplier = getShadowRunnerSurgeSpeedMultiplier(this.state, time)
        * getShadowRunnerGaleSpeedMultiplier(this.state, time)
        * getShadowRunnerAetherSpeedMultiplier(this.state, time)
      this.state.player.facing = direction
      player.setFlipX(direction < 0)
      player.setVelocityX((crouching ? CRAWL_SPEED : PLAYER_SPEED * speedMultiplier) * direction)
    } else {
      player.setVelocityX(0)
    }

    this.setPlayerStance(crouching)

    this.applyTiltPlatformInfluence()

    if (jumpPress && !this.standingBlocked) {
      this.tryJump(onFloor)
    }

    if (attackPress) {
      if (this.deliveryState === 'ready' && onFloor && !jumpPress
        && isShadowRunnerFinishOverlap(body, this.level.finish)) this.deliveryRequested = true
      else this.tryAttack(time)
    }

    this.resolveAttackHit(time)

    if (player.y > this.level.worldHeight + 90) {
      this.handlePlayerFellOut()
      return
    }

    this.updateHeroAnimation(time, left || right, onFloor, crouching)
    this.wasOnFloor = onFloor
  }

  private getSolidBodies() {
    return [this.platforms, this.crouchGates, this.encounterBarriers].flatMap(group => (
      (group?.getChildren() ?? []).flatMap(child => {
        const body = child.body as Phaser.Physics.Arcade.StaticBody | null
        return body?.enable && !body.checkCollision.none ? [body] : []
      })
    ))
  }

  private setPlayerStance(crouching: boolean) {
    if (!this.player || this.crouching === crouching) return
    const body = this.player.body as Phaser.Physics.Arcade.Body
    const previousHeight = body.height
    this.crouching = crouching
    this.player.setScale(HERO_SCALE, HERO_SCALE * (crouching ? 0.72 : 1))
    this.player.setSize(42, crouching ? 48 : 70)
    this.player.setOffset(43, crouching ? 80 : 58)
    body.updateBounds()
    // Resize around the feet without turning the size change into physics motion.
    const shift = previousHeight - body.height
    body.position.y += shift
    body.prev.y += shift
    body.prevFrame.y += shift
    body.updateCenter()
  }

  private updateMovingPlatforms(time: number) {
    if (!this.player || this.movingPlatforms.length === 0) return

    const deltaSeconds = Math.min(0.05, this.frameDeltaMs / 1000)
    if (deltaSeconds <= 0) return
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    const solids = this.getSolidBodies()

    this.movingPlatforms.forEach(runtime => {
      const { config } = runtime
      if (time < runtime.pauseUntil) return
      const platformBody = runtime.collider?.body as Phaser.Physics.Arcade.StaticBody | undefined
      if (!platformBody?.enable) return

      const targetX = runtime.direction < 0 ? runtime.endX : runtime.startX
      const targetY = runtime.direction < 0 ? runtime.endY : runtime.startY
      const requested = getShadowRunnerMovingPlatformStep(
        { x: runtime.lastX, y: runtime.lastY }, { x: targetX, y: targetY }, config.speed, deltaSeconds,
      )
      const carry = planShadowRunnerMovingPlatformCarry(platformBody, requested, playerBody, solids)
      const nextX = runtime.lastX + carry.delta.x
      const nextY = runtime.lastY + carry.delta.y
      if (carry.blocked || (Math.abs(nextX - targetX) < 0.001 && Math.abs(nextY - targetY) < 0.001)) {
        runtime.direction = runtime.direction < 0 ? 1 : -1
        runtime.pauseUntil = time + config.pauseMs
      }

      runtime.lastX = nextX
      runtime.lastY = nextY
      runtime.visual.setPosition(
        nextX + config.width / 2,
        nextY + config.height / 2 + runtime.visualOffsetY,
      )
      runtime.collider?.setPosition(
        nextX + config.width / 2,
        nextY + config.height / 2,
      )
      platformBody.updateFromGameObject()

      if (carry.supported && (carry.riderDelta.x !== 0 || carry.riderDelta.y !== 0)) {
        applyShadowRunnerMovingPlatformCarry(playerBody, this.player!, carry.riderDelta)
      }
    })
  }

  private updatePhasePlatforms(time: number) {
    this.phasePlatforms.forEach(runtime => {
      const { config } = runtime
      const cycleDuration = config.solidDurationMs
        + config.warningDurationMs
        + config.intangibleDurationMs
      const cycle = (time + (config.phaseOffsetMs ?? 0)) % cycleDuration
      const state = cycle < config.solidDurationMs
        ? 'solid'
        : cycle < config.solidDurationMs + config.warningDurationMs
          ? 'warning'
          : 'intangible'
      if (runtime.state === state) return

      runtime.state = state
      const body = runtime.collider?.body as Phaser.Physics.Arcade.StaticBody | undefined
      if (body) {
        body.enable = state !== 'intangible'
      }
      runtime.visual.setAlpha(state === 'solid' ? 0.96 : state === 'warning' ? 0.58 : 0.16)
      if (
        runtime.visual instanceof Phaser.GameObjects.Image
        || runtime.visual instanceof Phaser.GameObjects.TileSprite
      ) {
        runtime.visual.setTint(
          state === 'solid' ? 0xffffff : state === 'warning' ? 0xffd56a : 0x72dfff,
        )
      }
    })
  }

  private updateWindZones(time: number) {
    if (!this.player) return

    const body = this.player.body as Phaser.Physics.Arcade.Body
    const galeActive = isShadowRunnerGaleMantleActive(this.state, time)

    this.windZones.forEach(runtime => {
      const zone = runtime.config
      const cycle = time % zone.cadenceMs
      const telling = cycle < zone.tellDurationMs
      const active = cycle >= zone.tellDurationMs
        && cycle < zone.tellDurationMs + zone.activeDurationMs
      runtime.telling = telling
      runtime.active = active

      const renderState = active ? 'active' : telling ? 'telling' : 'idle'
      if (runtime.renderState !== renderState) {
        runtime.renderState = renderState
        runtime.visual.clear()
        runtime.visual.fillStyle(
          active ? 0x8edfff : telling ? 0xf0d381 : 0x7e98b8,
          active ? 0.14 : telling ? 0.1 : 0.035,
        )
        runtime.visual.fillRect(zone.x, zone.y, zone.width, zone.height)
        runtime.visual.lineStyle(
          active ? 3 : 2,
          active ? 0xbceeff : telling ? 0xf0d381 : 0x8797ac,
          active ? 0.72 : telling ? 0.5 : 0.22,
        )
        const arrowDirection = zone.direction
        for (let x = zone.x + 54; x < zone.x + zone.width - 24; x += 120) {
          const y = zone.y + 74 + ((x - zone.x) % 220)
          runtime.visual.beginPath()
          runtime.visual.moveTo(x - arrowDirection * 18, y - 10)
          runtime.visual.lineTo(x + arrowDirection * 18, y)
          runtime.visual.lineTo(x - arrowDirection * 18, y + 10)
          runtime.visual.strokePath()
        }
      }

      if (!active || galeActive) return
      const inside = body.center.x >= zone.x
        && body.center.x <= zone.x + zone.width
        && body.center.y >= zone.y
        && body.center.y <= zone.y + zone.height
      if (!inside) return

      const crouching = body.height <= 50 && (body.blocked.down || body.touching.down)
      const multiplier = crouching ? zone.crouchForceMultiplier : 1
      const nextVelocity = Phaser.Math.Clamp(
        body.velocity.x + zone.direction * zone.force * multiplier,
        -430,
        430,
      )
      this.player?.setVelocityX(nextVelocity)
    })
  }

  private updateRelayBeamZones(time: number) {
    if (!this.player) return

    const body = this.player.body as Phaser.Physics.Arcade.Body
    this.relayBeamZones.forEach(runtime => {
      const zone = runtime.config
      const sovereign = this.enemies.find(enemy => this.getEnemyKind(enemy) === 'sentry-sovereign')
      const sovereignState = sovereign ? this.getEnemyState(sovereign) : undefined
      const sovereignPhase = String(sovereign?.getData('bossPhaseId') ?? '')
      const sovereignSweeping = sovereignState
        ? time < Number(sovereign?.getData('sovereignAttackUntil') ?? 0) && sovereign?.getData('sovereignAttackType') === 'sweep'
        : false
      const arenaBeamEnabled = zone.id !== 'relay-beam-arena'
        || (sovereignState?.alive && sovereignState.activated && !this.respawnPending
          && sovereignPhase !== '' && sovereignPhase !== 'iron-decree' && !sovereignSweeping)

      if (!arenaBeamEnabled) {
        runtime.activatedAt = null
        runtime.lastGuardedCycle = -1
        if (runtime.state !== 'idle') {
          runtime.state = 'idle'
          runtime.visual.clear()
        }
        return
      }

      if (runtime.activatedAt === null) {
        runtime.activatedAt = time
      }
      const { cycleIndex, state } = getShadowRunnerBeamCycle(
        time, zone, zone.id === 'relay-beam-arena' ? runtime.activatedAt : undefined,
      )

      if (runtime.state !== state) {
        runtime.state = state
        runtime.visual.clear()
        zone.lanes.forEach(laneY => {
          if (state === 'idle') {
            runtime.visual.lineStyle(1, 0x8ddcea, 0.16)
          } else if (state === 'telling') {
            runtime.visual.lineStyle(3, 0xffdf79, 0.7)
          } else {
            runtime.visual.lineStyle(8, 0xfff1a6, 0.94)
          }
          this.drawRelayBeamLane(runtime.visual, zone, laneY)
          if (state === 'active') {
            runtime.visual.lineStyle(2, 0xff7a45, 0.9)
            this.drawRelayBeamLane(runtime.visual, zone, laneY - 8)
            this.drawRelayBeamLane(runtime.visual, zone, laneY + 8)
          }
        })
      }

      if (state !== 'active') return
      const horizontallyInside = body.right >= zone.x && body.left <= zone.x + zone.width
      const hitLane = zone.lanes.find(laneY => laneY >= body.top - 8 && laneY <= body.bottom + 8)
      const laneHit = hitLane !== undefined
      if (!horizontallyInside || !laneHit) return
      if (this.isPlayerInRelayBeamCover(body, zone)) return
      if (runtime.lastGuardedCycle === cycleIndex) return

      const guarded = blockShadowRunnerProjectileWithShield(this.state, time)
        || reflectShadowRunnerProjectileWithMirrorWard(this.state, time)
      if (guarded) {
        runtime.lastGuardedCycle = cycleIndex
        this.addHitFlash(this.player!.x, this.player!.y - 42)
        this.playSound('enemy-hit')
        this.emitHud(true)
        return
      }
      this.damagePlayerFromHazard(time, undefined, zone.damage)
    })
  }

  private drawRelayBeamLane(
    graphics: Phaser.GameObjects.Graphics,
    zone: ShadowRunnerRelayBeamZone,
    laneY: number,
  ) {
    const covers = this.getRelayBeamCoverIntervals(zone)
    let cursorX = zone.x

    covers.forEach(cover => {
      if (cover.start > cursorX) {
        graphics.lineBetween(cursorX, laneY, cover.start, laneY)
      }
      cursorX = Math.max(cursorX, cover.end)
    })
    if (cursorX < zone.x + zone.width) {
      graphics.lineBetween(cursorX, laneY, zone.x + zone.width, laneY)
    }
  }

  private getRelayBeamCoverIntervals(zone: ShadowRunnerRelayBeamZone) {
    const zoneEnd = zone.x + zone.width
    return this.level.platforms
      .filter(platform => (
        (platform.id.startsWith('relay-cover-') || platform.id.startsWith('relay-arena-cover-'))
        && platform.x < zoneEnd
        && platform.x + platform.width > zone.x
      ))
      .map(platform => ({
        start: Math.max(zone.x, platform.x - 48),
        end: Math.min(zoneEnd, platform.x + platform.width + 48),
      }))
      .sort((left, right) => left.start - right.start)
  }

  private isPlayerInRelayBeamCover(
    body: Phaser.Physics.Arcade.Body,
    zone: ShadowRunnerRelayBeamZone,
  ) {
    return this.getRelayBeamCoverIntervals(zone)
      .some(cover => body.center.x >= cover.start && body.center.x <= cover.end)
  }

  private createTiltPlatform(config: ShadowRunnerTiltPlatform, index: number) {
    const terrain = getShadowRunnerTerrainRuntime(config.terrainSet)
    const customFrame = getTerrainFrameKey(config.visualId ?? config.id)
    const custom = this.textures.exists(terrain.textureKey) && this.textures.get(terrain.textureKey).has(customFrame)
    const texture = custom ? terrain.textureKey
      : this.textures.exists('shadow-runner-tilt-bridge') ? 'shadow-runner-tilt-bridge' : 'shadow-runner-tilt-stone'
    const frame = this.textures.getFrame(texture, custom ? customFrame : undefined)
    const metadata = custom ? SHADOW_RUNNER_PLATFORM_CONTACTS[texture]?.[customFrame] : undefined
    const deck = texture === 'shadow-runner-tilt-bridge' ? DEFAULT_TILT_BRIDGE_DECK
      : { left: 0, right: frame.width, top: metadata?.top ?? 0 }
    const pose: TiltBridgePose = {
      pivotX: config.x + config.width / 2, pivotY: config.y, length: config.width,
      deckOffsetY: 0, rotation: index % 2 === 0 ? -0.05 : 0.05,
    }
    // Rotate art and collision about the same authored deck midpoint, not alpha bounds.
    const visual = this.add.image(pose.pivotX, pose.pivotY, texture, custom ? customFrame : undefined)
      .setOrigin((deck.left + deck.right) / 2 / frame.width, deck.top / frame.height)
      .setDisplaySize(config.width * frame.width / (deck.right - deck.left), config.visualHeight ?? (custom ? 66 : 54))
      .setDepth(custom ? 5 : 4).setRotation(pose.rotation)
      .setData('tilt-platform', true).setData('currentRotation', pose.rotation)
    this.tiltPlatforms.push({
      config, visual, pose, startRotation: pose.rotation,
      endRotation: (index % 2 === 0 ? 1 : -1) * (config.wobbleRotation ?? 0.08),
      geometry: createTiltBridgeGeometry(pose), nextGeometry: createTiltBridgeGeometry(pose), bodies: [],
    })
  }

  private startTiltBridgePhysics() {
    if (!this.tiltPlatforms.length || !this.player) return
    this.tiltClockMs = 0
    const world = this.physics.world
    const addActor = (body: Phaser.Physics.Arcade.Body) => {
      const actor: TiltActorRuntime = {
        body, support: null, supportY: 0, selected: null, selectedIndex: -1, collided: false,
        driveX: 0, slipX: 0, controlled: false, dragX: body.drag.x,
        accelerationX: body.acceleration.x, maxVelocityX: body.maxVelocity.x,
        collider: world.addCollider(body, this.tiltBodies, () => { actor.collided = true }, (_actor, candidate) => {
          const cap = candidate as Phaser.Physics.Arcade.Body
          if (!body.enable || this.runtimeDisposed || body.deltaY() <= cap.deltaY()
            || body.prev.y + body.height > cap.prev.y + world.OVERLAP_BIAS) return false
          if (!actor.selected) {
            for (const bridge of this.tiltPlatforms) {
              if (!bridge.bodies.includes(cap)) continue
              actor.selected = bridge
              actor.selectedIndex = getTiltBridgeContactIndex(bridge.nextGeometry, body.left, body.right)
              break
            }
          }
          return actor.selected?.bodies[actor.selectedIndex] === cap
        }),
      }
      this.tiltActors.push(actor)
    }
    addActor(this.player.body as Phaser.Physics.Arcade.Body)
    for (const enemy of this.enemies) {
      if (this.getEnemyKind(enemy) !== 'gearwing-drone') addActor(enemy.body as Phaser.Physics.Arcade.Body)
    }
    // The process callback receives the bare cap; the synchronous collision
    // callback receives its absent gameObject. Retain only that current contact.
    let projectileImpactCap: Phaser.Physics.Arcade.Body | undefined
    const projectiles = this.archerProjectiles && world.addCollider(this.tiltBodies, this.archerProjectiles, (_cap, projectile) => {
      const hazardProjectile = projectile as Phaser.Physics.Arcade.Image
      if (projectileImpactCap) this.maybeCreateProjectileImpactHazard(hazardProjectile, projectileImpactCap)
      projectileImpactCap = undefined
      this.disableProjectile(hazardProjectile)
    }, (candidate, projectile) => {
      projectileImpactCap = undefined
      const body = (projectile as Phaser.Physics.Arcade.Image).body as Phaser.Physics.Arcade.Body
      const cap = candidate as Phaser.Physics.Arcade.Body
      if (!body?.enable || !cap.enable || this.runtimeDisposed) return false
      if (body.deltaY() <= cap.deltaY() || body.prev.y + body.height > cap.prev.y + world.OVERLAP_BIAS) return false
      projectileImpactCap = cap
      return true
    })
    const step = () => this.updateTiltBridges()
    world.on('worldstep', step)
    const cleanup = () => {
      world.off('worldstep', step)
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup)
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup)
      for (const actor of this.tiltActors) {
        this.releaseTiltActor(actor)
        if (actor.collider.world) actor.collider.destroy()
      }
      if (projectiles?.world) projectiles.destroy()
      for (const bridge of this.tiltPlatforms) this.removeTiltBridgeBodies(bridge)
      this.tiltActors.length = 0
      this.tiltPlatforms.length = 0
      this.tiltCleanup = undefined
    }
    this.tiltCleanup = cleanup
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)
    this.prepareTiltBridgeStep()
  }

  private tiltRotationAt(bridge: TiltPlatformRuntime, time: number) {
    const mix = (1 - Math.cos(time * Math.PI / (bridge.config.wobbleDurationMs ?? 1150))) / 2
    return bridge.startRotation + (bridge.endRotation - bridge.startRotation) * mix
  }

  private removeTiltBridgeBodies(bridge: TiltPlatformRuntime) {
    for (const body of bridge.bodies) {
      // These bodies have no GameObject resources. Retire synchronously so a
      // stopped scene need not run another postUpdate to drain pendingDestroy.
      // Arcade's plugin may already have nulled its world during scene teardown.
      body.world?.disableBody(body)
      body.enable = false
      const index = this.tiltBodies.indexOf(body)
      if (index >= 0) this.tiltBodies.splice(index, 1)
    }
    bridge.bodies.length = 0
    for (const actor of this.tiltActors) {
      if (actor.support === bridge || actor.selected === bridge) this.releaseTiltActor(actor)
    }
  }

  private isTiltBridgeNear(bridge: TiltPlatformRuntime, playerOnly: boolean) {
    const camera = this.cameras.main
    const player = this.player?.body as Phaser.Physics.Arcade.Body | undefined
    const { x, y, width } = bridge.config
    const padding = TILT_CAMERA_MARGIN
    if (player?.enable && player.right > x - padding && player.left < x + width + padding
      && Math.abs(player.bottom - y) < padding) return true
    return !playerOnly && x + width > camera.scrollX - padding
      && x < camera.scrollX + camera.width / camera.zoom + padding
      && y > camera.scrollY - padding && y < camera.scrollY + camera.height / camera.zoom + padding
  }

  private refreshTiltBridgeBodies() {
    for (const bridge of this.tiltPlatforms) {
      if (bridge.bodies.length && !this.isTiltBridgeNear(bridge, false)) this.removeTiltBridgeBodies(bridge)
    }
    // A teleport's destination has priority over the camera's previous viewport.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const bridge of this.tiltPlatforms) {
        if (bridge.bodies.length || !this.isTiltBridgeNear(bridge, pass === 0)
          || this.tiltBodies.length + bridge.geometry.slices.length > TILT_BODY_BUDGET) continue
        bridge.pose.rotation = this.tiltRotationAt(bridge, this.tiltClockMs)
        updateTiltBridgeGeometry(bridge.geometry, bridge.pose)
        for (const slice of bridge.geometry.slices) {
          const body = new Phaser.Physics.Arcade.Body(this.physics.world)
          body.setSize(slice.width, slice.height, false).setAllowGravity(false).setImmovable(true).setFrictionX(1)
          body.position.set(slice.x, slice.y)
          body.updateCenter()
          body.checkCollision.left = false
          body.checkCollision.right = false
          body.checkCollision.down = false
          this.physics.world.add(body)
          bridge.bodies.push(body)
          this.tiltBodies.push(body)
        }
      }
    }
  }

  private updateTiltBridges() {
    this.tiltClockMs = this.tiltNextClockMs
    for (const actor of this.tiltActors) {
      if (actor.collided && actor.selected && actor.body.enable) {
        if (actor.controlled) {
          const limit = actor.selected.config.maxSlideSpeed ?? 110
          actor.slipX = Phaser.Math.Clamp(actor.body.velocity.x - actor.driveX, -limit, limit)
        }
        actor.support = actor.selected
        actor.supportY = actor.selected.nextGeometry.slices[actor.selectedIndex].y
      } else this.releaseTiltActor(actor)
      actor.selected = null
      actor.selectedIndex = -1
      actor.collided = false
    }
    for (const bridge of this.tiltPlatforms) {
      if (bridge.bodies.length) {
        const previous = bridge.geometry
        bridge.geometry = bridge.nextGeometry
        bridge.nextGeometry = previous
      }
      bridge.visual.setRotation(this.tiltRotationAt(bridge, this.tiltClockMs))
      bridge.visual.setData('currentRotation', bridge.visual.rotation)
    }
    this.prepareTiltBridgeStep()
  }

  private prepareTiltBridgeStep() {
    this.refreshTiltBridgeBodies()
    this.tiltNextClockMs = this.tiltClockMs
      + TILT_PHYSICS_DELTA * 1000 * getShadowRunnerChronoTimeScale(this.state, this.activeTimeMs)
    for (const bridge of this.tiltPlatforms) {
      if (!bridge.bodies.length) continue
      bridge.pose.rotation = this.tiltRotationAt(bridge, this.tiltNextClockMs)
      updateTiltBridgeGeometry(bridge.nextGeometry, bridge.pose)
      for (let index = 0; index < bridge.bodies.length; index += 1) {
        const body = bridge.bodies[index]
        const target = bridge.nextGeometry.slices[index]
        body.setSize(target.width, target.height, false)
        body.setVelocity((target.x - body.x) / TILT_PHYSICS_DELTA, (target.y - body.y) / TILT_PHYSICS_DELTA)
      }
    }
    for (const actor of this.tiltActors) this.prepareTiltActorStep(actor)
  }

  private prepareTiltActorStep(actor: TiltActorRuntime) {
    const bridge = actor.support
    const body = actor.body
    if (!bridge || !body.enable) return
    if (body === this.player?.body) {
      const input = this.controls.current
      const left = input.left || Boolean(this.cursors?.left.isDown) || Boolean(this.keys?.a.isDown)
      const right = input.right || Boolean(this.cursors?.right.isDown) || Boolean(this.keys?.d.isDown)
      const speed = this.crouching ? CRAWL_SPEED : PLAYER_SPEED
        * getShadowRunnerSurgeSpeedMultiplier(this.state, this.activeTimeMs)
        * getShadowRunnerGaleSpeedMultiplier(this.state, this.activeTimeMs)
        * getShadowRunnerAetherSpeedMultiplier(this.state, this.activeTimeMs)
      actor.driveX = left === right ? 0 : right ? speed : -speed
      if (!actor.controlled) {
        actor.dragX = body.drag.x
        actor.accelerationX = body.acceleration.x
        actor.maxVelocityX = body.maxVelocity.x
        actor.controlled = true
      }
      body.setDragX(0).setMaxVelocity(430, body.maxVelocity.y)
      body.setVelocityX(Phaser.Math.Clamp(actor.driveX + actor.slipX, -430, 430))
      const gravity = (bridge.config.slideForce ?? GRAVITY_Y)
        * getShadowRunnerChronoTimeScale(this.state, this.activeTimeMs)
      body.setAccelerationX(getTiltBridgeDownhillAcceleration(bridge.visual.rotation, gravity) * (actor.driveX ? 0.42 : 1))
    }
    const vx = Phaser.Math.Clamp(body.velocity.x + body.acceleration.x * TILT_PHYSICS_DELTA, -body.maxVelocity.x, body.maxVelocity.x)
    const nextIndex = getTiltBridgeContactIndex(bridge.nextGeometry,
      body.left + vx * TILT_PHYSICS_DELTA, body.right + vx * TILT_PHYSICS_DELTA)
    if (nextIndex >= 0) {
      body.setVelocityY(Math.max(bridge.bodies[nextIndex].velocity.y,
        (bridge.nextGeometry.slices[nextIndex].y - actor.supportY) / TILT_PHYSICS_DELTA))
    }
  }

  private releaseTiltActor(actor: TiltActorRuntime) {
    // Arcade resets flags per render, not per catch-up substep. A departing
    // bridge must not leave a phantom floor. Preserve native static-floor flags
    // only when the actor is still at that floor's separated top.
    if (actor.support) {
      const body = actor.body
      const onStaticFloor = body.blocked.down && this.physics.world?.staticBodies.entries.some(floor => (
        floor.enable && floor.checkCollision.up && body.right > floor.left && body.left < floor.right
        && Math.abs(body.bottom - floor.top) < 0.001
      ))
      if (!onStaticFloor) {
        body.touching.down = false
        body.touching.none = !(body.touching.up || body.touching.left || body.touching.right)
        body.blocked.down = false
        body.blocked.none = !(body.blocked.up || body.blocked.left || body.blocked.right)
      }
    }
    if (actor.controlled) {
      actor.body.setDragX(actor.dragX).setAccelerationX(actor.accelerationX)
      actor.body.setMaxVelocity(actor.maxVelocityX, actor.body.maxVelocity.y)
    }
    actor.support = null
    actor.selected = null
    actor.selectedIndex = -1
    actor.collided = false
    actor.controlled = false
    actor.slipX = 0
  }

  private releasePlayerTiltContact() {
    const actor = this.tiltActors[0]
    if (actor) this.releaseTiltActor(actor)
  }

  private applyTiltPlatformInfluence() {
    const actor = this.tiltActors[0]
    if (actor) this.prepareTiltActorStep(actor)
  }

  private applyFallDamageOnLanding(time: number) {
    if (!this.player || this.airborneStartY === null) return
    if (doesShadowRunnerAetherPreventFallDamage(this.state, time)) return

    const body = this.player.body as Phaser.Physics.Arcade.Body
    const rawDamage = getShadowRunnerLandingDamage(this.airborneStartY, body.bottom)
    if (rawDamage === 0) return
    const heavyFall = rawDamage === 4
    const galeCap = getShadowRunnerGaleFallDamageCap(this.state, time)
    const damaged = this.damagePlayerFromHazard(
      time,
      undefined,
      galeCap === null ? rawDamage : Math.min(rawDamage, galeCap),
    )
    if (damaged) {
      this.addDustPuff(this.player.x, this.player.y - 18)
      this.shakeCamera(heavyFall ? 120 : 76, heavyFall ? 0.0028 : 0.0018)
    }
  }

  private updateEncounterActivations(time: number) {
    if (!this.player) return

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    this.level.encounters?.forEach(encounter => {
      const inside = playerBody.center.x >= encounter.x
        && playerBody.center.x <= encounter.x + encounter.width
        && playerBody.center.y >= encounter.y
        && playerBody.center.y <= encounter.y + encounter.height
      if (!inside) return

      if (isShadowRunnerEncounterReentered(playerBody, encounter)) {
        this.recoveringEncounterIds.delete(encounter.id)
      }

      encounter.enemyIds.forEach(enemyId => {
        const enemyState = this.state.enemies.find(current => current.id === enemyId)
        if (!enemyState?.alive || enemyState.activated) return

        enemyState.activated = true
        const enemy = this.enemies.find(current => this.getEnemyId(current) === enemyId)
        if (!enemy) return

        const body = enemy.body as Phaser.Physics.Arcade.Body
        body.enable = true
        enemy.setData('sleeping', false)
        enemy.setAlpha(1)

        if (enemyState.kind === 'tomb-lurker') {
          const harmfulAt = time + 700
          enemy.setData('harmfulAt', harmfulAt)
          enemyState.attackUntil = harmfulAt
          enemy.play('lurker-warning', true)
          enemy.setTint(0x9fffd6)
          this.addHitFlash(enemy.x, enemy.y - 48)
        } else {
          enemy.setData('harmfulAt', time)
          enemy.play(this.getEnemyAnimation(enemyState.kind, 'walk'), true)
        }
      })
    })
  }

  private updateEncounterBarriers() {
    this.encounterBarrierRuntimes.forEach(runtime => {
      const barrierState = getShadowRunnerEncounterBarrierState(
        this.state.enemies,
        runtime.enemyIds,
        this.clearedEncounterIds.has(runtime.encounterId),
      )
      if (barrierState.cleared) {
        this.clearedEncounterIds.add(runtime.encounterId)
      }
      const active = barrierState.active && !this.recoveringEncounterIds.has(runtime.encounterId)
      if (active === runtime.active) return

      runtime.active = active
      const body = runtime.collider?.body as Phaser.Physics.Arcade.StaticBody | undefined
      if (body) {
        body.enable = active
        if (active) body.updateFromGameObject()
      }
      runtime.collider?.setActive(active)
      runtime.visual.setVisible(active)
      runtime.visual.setAlpha(active ? 0.92 : 0)

      if (active) {
        this.tweens.add({
          targets: runtime.visual,
          alpha: { from: 0.4, to: 0.96 },
          duration: 260,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.inOut',
        })
      }
    })
  }

  private updateEnemies(time: number) {
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)

    this.enemies.forEach(enemy => {
      const enemyState = this.getEnemyState(enemy)
      if (!enemyState?.alive) return
      if (!enemyState.activated) {
        enemy.setVelocity(0, 0)
        return
      }
      const enemyKind = this.getEnemyKind(enemy)
      const body = enemy.body as Phaser.Physics.Arcade.Body
      const recentlyHit = time - enemyState.lastDamagedAt < 180

      if (enemy.y > this.level.worldHeight + 110) {
        // Reset the physics history too: postUpdate must not add the old fall delta to the spawn.
        body.reset(Number(enemy.getData('startX') ?? enemyState.patrolLeft), Number(enemy.getData('startY') ?? 380))
        this.cancelGearwingDroneAttack(enemy)
        enemyState.direction = enemyState.direction === 1 ? -1 : 1
      }

      if (enemyKind === 'tower-archer') {
        this.updateTowerArcher(time, enemy, enemyState)
        return
      }

      if (enemyKind === 'gearwing-drone') {
        this.updateGearwingDrone(time, enemy, enemyState)
        return
      }

      if (enemyKind === 'sentry-sovereign' && !recentlyHit && this.trySentrySovereignAttack(time, enemy, enemyState)) {
        return
      }

      if (enemyKind === 'moonlit-captain' && !recentlyHit && this.tryMoonlitCaptainAttack(time, enemy, enemyState)) {
        return
      }

      if (enemyKind === 'relay-lancer' && !recentlyHit && this.tryRelayLancerAttack(time, enemy, enemyState)) {
        return
      }

      if (enemyKind === 'gate-pikeman' && !recentlyHit && this.tryGatePikemanThrust(time, enemy, enemyState)) {
        return
      }

      if (enemyKind === 'prism-caster' && !recentlyHit && this.tryPrismCasterCast(time, enemy, enemyState)) {
        return
      }

      if (enemyKind === 'storm-grenadier' && !recentlyHit) {
        this.tryStormGrenadierThrow(time, enemy, enemyState)
      }

      if (enemyKind === 'tomb-lurker' && !recentlyHit && this.tryTombLurkerLunge(time, enemy, enemyState)) {
        return
      }

      if (enemyKind === 'crypt-warden' && !recentlyHit && this.tryCryptWardenCharge(time, enemy, enemyState)) {
        return
      }

      if (enemyKind === 'rival-courier' && !recentlyHit && this.tryRivalCourierDash(time, enemy, enemyState)) {
        return
      }

      if (enemyKind === 'candle-jester' && !recentlyHit) {
        this.tryCandleJesterThrow(time, enemy, enemyState)
      }

      if (enemyKind === 'moon-stalker' && !recentlyHit && this.tryMoonStalkerLunge(time, enemy, enemyState)) {
        return
      }

      if (recentlyHit) {
        enemy.setVelocityX(body.velocity.x * 0.78)
      } else if (time < enemyState.attackUntil) {
        enemy.setVelocityX(0)
      } else {
        const direction = enemyState.direction
        const phaseSpeedMultiplier = enemyKind === 'sentry-sovereign'
          ? Number(enemy.getData('bossPatrolSpeedMultiplier') ?? 1)
          : 1
        const patrolSpeed = this.getEnemyPatrolSpeed(enemyState) * phaseSpeedMultiplier * chronoScale
        enemy.setVelocityX(direction * patrolSpeed)
        this.setEnemyFacing(enemy, direction)

        if ((direction < 0 && enemy.x <= enemyState.patrolLeft) || body.blocked.left) {
          enemy.setX(Phaser.Math.Clamp(enemy.x, enemyState.patrolLeft, enemyState.patrolRight))
          enemyState.direction = 1
          enemy.setVelocityX(patrolSpeed)
          this.setEnemyFacing(enemy, 1)
        } else if ((direction > 0 && enemy.x >= enemyState.patrolRight) || body.blocked.right) {
          enemy.setX(Phaser.Math.Clamp(enemy.x, enemyState.patrolLeft, enemyState.patrolRight))
          enemyState.direction = -1
          enemy.setVelocityX(-patrolSpeed)
          this.setEnemyFacing(enemy, -1)
        }
      }

      if (time - enemyState.lastDamagedAt < 180) {
        enemy.play(this.getEnemyAnimation(enemyKind, 'hit'), true)
        enemy.setTint(0xffe08a)
      } else if (time < enemyState.attackUntil) {
        enemy.clearTint()
        const attackAnimation = this.getEnemyAnimation(enemyKind, 'attack')
        if (enemy.anims.currentAnim?.key !== attackAnimation) {
          enemy.play(attackAnimation, true)
        }
      } else {
        enemy.clearTint()
        const walkAnimation = this.getEnemyAnimation(enemyKind, 'walk')
        if (enemy.anims.currentAnim?.key !== walkAnimation) {
          enemy.play(walkAnimation, true)
        }
      }
    })
  }

  private tryRelayLancerAttack(
    time: number,
    enemy: Phaser.Physics.Arcade.Sprite,
    enemyState: ShadowRunnerEnemyState,
  ) {
    if (!this.player) return false

    const config = getShadowRunnerLevelEnemies(this.level).find(current => current.id === enemyState.id)
    const range = config?.attackRange ?? 360
    const cooldown = config?.attackCooldownMs ?? 1320
    const dx = Math.abs(this.player.x - enemy.x)
    const dy = Math.abs(this.player.y - enemy.y)
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)

    if (time < enemyState.attackUntil) {
      const elapsed = time - enemyState.lastShotAt
      const striking = elapsed >= 320
      const attackIndex = Number(enemy.getData('lancerAttackIndex') ?? 0)
      const highSweep = attackIndex % 2 === 0
      enemy.setData('highThrust', striking && highSweep)
      enemy.setVelocityX(striking ? enemyState.direction * (highSweep ? 285 : 235) * chronoScale : 0)
      enemy.play(striking ? 'relay-lancer-strike' : 'relay-lancer-ready', true)
      enemy.setTint(striking ? 0xffffff : highSweep ? 0xffd56a : 0x88f5ff)
      this.setEnemyFacing(enemy, enemyState.direction)
      return true
    }

    enemy.setData('highThrust', false)
    enemy.clearTint()
    if (dx > range || dy > 100 || time - enemyState.lastShotAt < cooldown / chronoScale) {
      return false
    }

    enemyState.direction = this.player.x >= enemy.x ? 1 : -1
    enemyState.lastShotAt = time
    enemyState.attackUntil = time + 780
    enemy.setData('lancerAttackIndex', Number(enemy.getData('lancerAttackIndex') ?? -1) + 1)
    enemy.setVelocityX(0)
    enemy.play('relay-lancer-ready', true)
    enemy.setTint(0xffd56a)
    this.setEnemyFacing(enemy, enemyState.direction)
    return true
  }

  private tryPrismCasterCast(
    time: number,
    enemy: Phaser.Physics.Arcade.Sprite,
    enemyState: ShadowRunnerEnemyState,
  ) {
    if (!this.player) return false

    const config = getShadowRunnerLevelEnemies(this.level).find(current => current.id === enemyState.id)
    const range = config?.attackRange ?? 720
    const cooldown = config?.attackCooldownMs ?? 1680
    const dx = Math.abs(this.player.x - enemy.x)
    const dy = Math.abs(this.player.y - enemy.y)
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)

    if (time < enemyState.attackUntil) {
      const releaseAt = Number(enemy.getData('orbReleaseAt') ?? Number.POSITIVE_INFINITY)
      const released = Boolean(enemy.getData('orbReleased'))
      enemy.setVelocityX(0)
      if (!released && time >= releaseAt) {
        enemy.setData('orbReleased', true)
        enemy.play('prism-caster-cast', true)
        enemy.clearTint()
        this.createRelayOrbs(enemy, 1, config, {
          x: Number(enemy.getData('orbTargetX') ?? this.player.x),
          y: Number(enemy.getData('orbTargetY') ?? this.player.y),
        })
      } else if (!released) {
        enemy.play('prism-caster-windup', true)
        enemy.setTint(0x89f7ff)
      }
      return true
    }

    enemy.clearTint()
    if (dx > range || dy > 220 || time - enemyState.lastShotAt < cooldown / chronoScale) {
      return false
    }

    enemyState.direction = this.player.x >= enemy.x ? 1 : -1
    enemyState.lastShotAt = time
    enemyState.attackUntil = time + 720
    enemy.setData('orbReleaseAt', time + 420)
    enemy.setData('orbReleased', false)
    const targetBody = this.player.body as Phaser.Physics.Arcade.Body
    enemy.setData('orbTargetX', targetBody.center.x + targetBody.velocity.x * 0.18)
    enemy.setData('orbTargetY', targetBody.center.y)
    enemy.setVelocityX(0)
    enemy.play('prism-caster-windup', true)
    enemy.setTint(0x89f7ff)
    this.setEnemyFacing(enemy, enemyState.direction)
    return true
  }

  private updateGearwingDrone(
    time: number,
    enemy: Phaser.Physics.Arcade.Sprite,
    enemyState: ShadowRunnerEnemyState,
  ) {
    if (!this.player) return

    const config = getShadowRunnerLevelEnemies(this.level).find(current => current.id === enemyState.id)
    const startY = Number(enemy.getData('startY') ?? enemy.y)
    const phase = Number(enemy.getData('hoverPhase') ?? 0)
    const cooldown = config?.attackCooldownMs ?? 1550
    const range = config?.attackRange ?? 500
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)
    const dx = Math.abs(this.player.x - enemy.x)

    // Reaction deadlines cannot own or resume a drone's tell/dive.
    if (time < Number(enemy.getData('droneAttackUntil') ?? 0)) {
      const elapsed = time - enemyState.lastShotAt
      if (elapsed < DRONE_WARNING_MS) {
        enemy.setVelocity(0, 0)
        enemy.play('gearwing-drone-tell', true)
        enemy.setTint(0xffd56a)
      } else {
        enemy.clearTint()
        enemy.setVelocity(
          enemyState.direction * DRONE_DIVE_SPEED_X * chronoScale,
          310 * chronoScale,
        )
        enemy.play('gearwing-drone-dive', true)
      }
      return
    }

    enemy.setData('droneAttackUntil', 0)
    if (time < enemyState.attackUntil) return

    enemy.clearTint()
    enemy.setData('highThrust', false)
    const targetY = startY + Math.sin(time / 340 + phase) * 22
    const verticalVelocity = Phaser.Math.Clamp((targetY - enemy.y) * 4.5, -230, 230)
    const patrolSpeed = this.getEnemyPatrolSpeed(enemyState) * chronoScale
    if (enemy.x <= enemyState.patrolLeft) {
      enemyState.direction = 1
    } else if (enemy.x >= enemyState.patrolRight) {
      enemyState.direction = -1
    }
    enemy.setVelocity(enemyState.direction * patrolSpeed, verticalVelocity)
    enemy.play('gearwing-drone-flight', true)
    this.setEnemyFacing(enemy, enemyState.direction)

    // Finish the return to flight before rearming; repeated dives must not migrate into earlier encounters.
    const recovered = enemy.x >= enemyState.patrolLeft && enemy.x <= enemyState.patrolRight
      && Math.abs(targetY - enemy.y) <= 30
    const playerInPatrol = this.player.x >= enemyState.patrolLeft && this.player.x <= enemyState.patrolRight
    // Commit only when the existing dive can reach the player's vicinity.
    // Far-away tells otherwise interrupt patrol forever without closing the gap.
    const diveReach = DRONE_DIVE_SPEED_X * chronoScale * DRONE_DIVE_MS / 1000 + 42
    if (
      recovered && playerInPatrol && dx <= Math.min(range, diveReach)
      && this.player.y > enemy.y + 70
      && time - enemyState.lastShotAt >= cooldown / chronoScale
    ) {
      enemyState.direction = this.player.x >= enemy.x ? 1 : -1
      enemyState.lastShotAt = time
      enemyState.attackUntil = time + DRONE_WARNING_MS + DRONE_DIVE_MS
      enemy.setData('droneAttackUntil', enemyState.attackUntil)
      enemy.setVelocity(0, 0)
      enemy.play('gearwing-drone-tell', true)
      enemy.setTint(0xffd56a)
    }
  }

  private cancelGearwingDroneAttack(enemy: Phaser.Physics.Arcade.Sprite) {
    if (this.getEnemyKind(enemy) !== 'gearwing-drone') return
    enemy.setData('droneAttackUntil', 0)
    const enemyState = this.getEnemyState(enemy)
    if (enemyState) enemyState.attackUntil = 0
    enemy.setVelocity(0, 0)
    enemy.clearTint()
  }

  private cancelSentrySovereignAttack(enemy: Phaser.Physics.Arcade.Sprite) {
    if (this.getEnemyKind(enemy) !== 'sentry-sovereign') return
    enemy.setData('sovereignAttackUntil', 0)
    enemy.setData('sovereignAttackReleased', true)
    enemy.setData('highThrust', false)
    enemy.setData('sovereignAttackGeneration', Number(enemy.getData('sovereignAttackGeneration') ?? 0) + 1)
  }

  private trySentrySovereignAttack(
    time: number,
    enemy: Phaser.Physics.Arcade.Sprite,
    enemyState: ShadowRunnerEnemyState,
  ) {
    if (!this.player) return false

    const config = getShadowRunnerLevelEnemies(this.level).find(current => current.id === enemyState.id)
    const phases = config?.bossPhases ?? []
    const phase = [...phases]
      .reverse()
      .find(candidate => enemyState.health <= candidate.healthAtOrBelow)
      ?? phases[0]
    if (!phase) return false

    if (enemy.getData('bossPhaseId') !== phase.id) {
      this.cancelSentrySovereignAttack(enemy)
      enemy.setData('bossPhaseId', phase.id)
      enemy.setData('bossPhaseLabel', phase.label)
      enemy.setData('bossAttackIndex', 0)
      enemy.setData('bossPatrolSpeedMultiplier', phase.patrolSpeedMultiplier ?? 1)
      enemyState.guard = Math.max(enemyState.guard, phase.guard ?? 0)
      enemyState.maxGuard = Math.max(enemyState.maxGuard, phase.guard ?? 0)
      enemy.setTint(0xffd56a)
      this.showCheckpointToast(phase.label)
      this.flashCamera(110, 255, 206, 92)
    }

    const range = config?.attackRange ?? 520
    const cooldown = phase.attackCooldownMs ?? config?.attackCooldownMs ?? 1500
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)
    const dx = Math.abs(this.player.x - enemy.x)
    const dy = Math.abs(this.player.y - enemy.y)

    // Contact reactions share attackUntil, but cannot revive a cancelled boss attack.
    if (time < Number(enemy.getData('sovereignAttackUntil') ?? 0)) {
      const elapsed = time - enemyState.lastShotAt
      const attackType = String(enemy.getData('sovereignAttackType') ?? phase.attackStyle ?? 'sweep')
      const released = Boolean(enemy.getData('sovereignAttackReleased'))
      const telling = elapsed < (attackType === 'sweep' ? 380 : 500)
      if (attackType !== 'sweep') {
        enemyState.direction = Number(enemy.getData('sovereignChargeDirection')) >= 0 ? 1 : -1
      }

      if (telling) {
        enemy.setVelocityX(0)
        enemy.setTint(attackType === 'orbs' ? 0x89f7ff : 0xffd56a)
        enemy.play(
          attackType === 'orbs'
            ? 'sovereign-orbs'
            : attackType === 'shockwave'
              ? 'sovereign-shockwave'
              : 'sovereign-sweep',
          true,
        )
      } else if (attackType === 'sweep') {
        enemy.clearTint()
        enemy.setData('highThrust', true)
        const chargeCount = Math.max(1, Number(enemy.getData('sovereignChargeCount') ?? 1))
        const chargeDirection = Number(enemy.getData('sovereignChargeDirection') ?? enemyState.direction) >= 0 ? 1 : -1
        const chargeIndex = Math.min(chargeCount - 1, Math.floor(Math.max(0, elapsed - 380) / 360))
        const direction = (chargeDirection * (chargeIndex % 2 === 0 ? 1 : -1)) as 1 | -1
        enemyState.direction = direction
        this.setEnemyFacing(enemy, direction)
        enemy.setVelocityX(direction * 315 * (phase.patrolSpeedMultiplier ?? 1) * chronoScale)
        enemy.play('sovereign-sweep', true)
      } else {
        enemy.setVelocityX(0)
        enemy.clearTint()
        if (!released) {
          enemy.setData('sovereignAttackReleased', true)
          if (attackType === 'orbs') {
            this.createRelayOrbs(enemy, phase.orbCount ?? 2, config, enemy.getData('sovereignOrbTarget'))
          } else {
            this.createSovereignShockwaves(enemy, phase.shockwaveCount ?? 2, config)
          }
          this.shakeCamera(85, 0.002)
        }
      }
      this.setEnemyFacing(enemy, enemyState.direction)
      return true
    }

    enemy.setData('highThrust', false)
    enemy.clearTint()
    if (dx > range || dy > 150 || time - enemyState.lastShotAt < cooldown / chronoScale) {
      return false
    }

    const attackIndex = Number(enemy.getData('bossAttackIndex') ?? 0)
    const baseStyle = phase.attackStyle ?? 'sweep'
    const attackType = baseStyle === 'finale'
      ? (['sweep', 'orbs', 'shockwave'] as const)[attackIndex % 3]
      : phase.id === 'crownfall'
        ? (['sweep', 'shockwave'] as const)[attackIndex % 2]
        : baseStyle
    const chargeCount = attackType === 'sweep' ? Math.max(1, phase.chargeCount ?? 1) : 1
    enemyState.direction = this.player.x >= enemy.x ? 1 : -1
    enemyState.lastShotAt = time
    enemyState.attackUntil = time + (attackType === 'sweep' ? 580 + chargeCount * 360 : 1050)
    enemy.setData('sovereignAttackUntil', enemyState.attackUntil)
    enemy.setData('sovereignAttackGeneration', Number(enemy.getData('sovereignAttackGeneration') ?? 0) + 1)
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    enemy.setData('sovereignOrbTarget', {
      x: playerBody.center.x + playerBody.velocity.x * 0.18,
      y: playerBody.center.y,
      facing: enemyState.direction,
    })
    enemy.setData('bossAttackIndex', attackIndex + 1)
    enemy.setData('sovereignAttackType', attackType)
    enemy.setData('sovereignAttackReleased', false)
    enemy.setData('sovereignChargeCount', chargeCount)
    enemy.setData('sovereignChargeDirection', enemyState.direction)
    enemy.setVelocityX(0)
    this.setEnemyFacing(enemy, enemyState.direction)
    return true
  }

  private tryTombLurkerLunge(
    time: number,
    enemy: Phaser.Physics.Arcade.Sprite,
    enemyState: ShadowRunnerEnemyState,
  ) {
    if (!this.player) return false

    const harmfulAt = Number(enemy.getData('harmfulAt') ?? 0)
    if (time < harmfulAt) {
      enemy.setVelocityX(0)
      enemy.play('lurker-warning', true)
      return true
    }
    enemy.clearTint()

    const config = getShadowRunnerLevelEnemies(this.level).find(current => current.id === enemyState.id)
    const range = config?.attackRange ?? 330
    const cooldown = config?.attackCooldownMs ?? 1280
    const dx = Math.abs(this.player.x - enemy.x)
    const dy = Math.abs(this.player.y - enemy.y)
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)

    if (time < enemyState.attackUntil) {
      enemy.setVelocityX(enemyState.direction * 265 * chronoScale)
      this.setEnemyFacing(enemy, enemyState.direction)
      enemy.play('lurker-lunge', true)
      return true
    }

    if (dx > range || dy > 100 || time - enemyState.lastShotAt < cooldown / chronoScale) {
      return false
    }

    enemyState.direction = this.player.x >= enemy.x ? 1 : -1
    enemyState.lastShotAt = time
    enemyState.attackUntil = time + 460
    enemy.setVelocityX(enemyState.direction * 265 * chronoScale)
    this.setEnemyFacing(enemy, enemyState.direction)
    enemy.play('lurker-lunge', true)
    return true
  }

  private tryCryptWardenCharge(
    time: number,
    enemy: Phaser.Physics.Arcade.Sprite,
    enemyState: ShadowRunnerEnemyState,
  ) {
    if (!this.player) return false

    const config = getShadowRunnerLevelEnemies(this.level).find(current => current.id === enemyState.id)
    const range = config?.attackRange ?? 255
    const cooldown = config?.attackCooldownMs ?? 1500
    const dx = Math.abs(this.player.x - enemy.x)
    const dy = Math.abs(this.player.y - enemy.y)
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)

    if (time < enemyState.attackUntil) {
      const elapsed = time - enemyState.lastShotAt
      if (elapsed < 300) {
        enemy.setVelocityX(0)
        enemy.play('warden-guard', true)
      } else {
        enemy.setVelocityX(enemyState.direction * 215 * chronoScale)
        enemy.play('warden-charge', true)
      }
      this.setEnemyFacing(enemy, enemyState.direction)
      return true
    }

    if (dx > range || dy > 92 || time - enemyState.lastShotAt < cooldown / chronoScale) {
      return false
    }

    enemyState.direction = this.player.x >= enemy.x ? 1 : -1
    enemyState.lastShotAt = time
    enemyState.attackUntil = time + 760
    enemy.setVelocityX(0)
    this.setEnemyFacing(enemy, enemyState.direction)
    enemy.play('warden-guard', true)
    return true
  }

  private tryRivalCourierDash(
    time: number,
    enemy: Phaser.Physics.Arcade.Sprite,
    enemyState: ShadowRunnerEnemyState,
  ) {
    if (!this.player) return false

    const config = getShadowRunnerLevelEnemies(this.level).find(current => current.id === enemyState.id)
    const range = config?.attackRange ?? 440
    const cooldown = config?.attackCooldownMs ?? 1260
    const dx = Math.abs(this.player.x - enemy.x)
    const dy = Math.abs(this.player.y - enemy.y)
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)

    if (time < enemyState.attackUntil) {
      const elapsed = time - enemyState.lastShotAt
      if (elapsed < 240) {
        enemy.setVelocityX(0)
        enemy.play('rival-ready', true)
        enemy.setTint(0xff8f7c)
      } else {
        enemy.clearTint()
        enemy.setVelocityX(enemyState.direction * 330 * chronoScale)
        enemy.play('rival-dash', true)
      }
      this.setEnemyFacing(enemy, enemyState.direction)
      return true
    }

    enemy.clearTint()
    if (dx > range || dy > 96 || time - enemyState.lastShotAt < cooldown / chronoScale) {
      return false
    }

    enemyState.direction = this.player.x >= enemy.x ? 1 : -1
    enemyState.lastShotAt = time
    enemyState.attackUntil = time + 650
    enemy.setVelocityX(0)
    this.setEnemyFacing(enemy, enemyState.direction)
    enemy.play('rival-ready', true)
    enemy.setTint(0xff8f7c)
    return true
  }

  private tryGatePikemanThrust(
    time: number,
    enemy: Phaser.Physics.Arcade.Sprite,
    enemyState: ShadowRunnerEnemyState,
  ) {
    if (!this.player) return false

    const config = getShadowRunnerLevelEnemies(this.level).find(current => current.id === enemyState.id)
    const range = config?.attackRange ?? 340
    const cooldown = config?.attackCooldownMs ?? 1400
    const dx = Math.abs(this.player.x - enemy.x)
    const dy = Math.abs(this.player.y - enemy.y)
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)

    if (time < enemyState.attackUntil) {
      const elapsed = time - enemyState.lastShotAt
      const thrusting = elapsed >= 300
      enemy.setData('highThrust', thrusting)
      enemy.setVelocityX(thrusting ? enemyState.direction * 270 * chronoScale : 0)
      enemy.play(thrusting ? 'pikeman-thrust' : 'pikeman-guard', true)
      enemy.setTint(thrusting ? 0xffffff : 0xf0d381)
      this.setEnemyFacing(enemy, enemyState.direction)
      return true
    }

    enemy.setData('highThrust', false)
    enemy.clearTint()
    if (dx > range || dy > 94 || time - enemyState.lastShotAt < cooldown / chronoScale) {
      return false
    }

    enemyState.direction = this.player.x >= enemy.x ? 1 : -1
    enemyState.lastShotAt = time
    enemyState.attackUntil = time + 760
    enemy.setVelocityX(0)
    enemy.play('pikeman-guard', true)
    enemy.setTint(0xf0d381)
    this.setEnemyFacing(enemy, enemyState.direction)
    return true
  }

  private tryStormGrenadierThrow(
    time: number,
    enemy: Phaser.Physics.Arcade.Sprite,
    enemyState: ShadowRunnerEnemyState,
  ) {
    if (!this.player) return

    const config = getShadowRunnerLevelEnemies(this.level).find(current => current.id === enemyState.id)
    const range = config?.attackRange ?? 640
    const cooldown = config?.attackCooldownMs ?? 1700
    const dx = Math.abs(this.player.x - enemy.x)
    const dy = Math.abs(this.player.y - enemy.y)
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)

    if (time < enemyState.attackUntil) {
      enemy.setVelocityX(0)
      const releaseAt = Number(enemy.getData('bombReleaseAt') ?? Number.POSITIVE_INFINITY)
      const released = Boolean(enemy.getData('bombReleased'))
      if (!released && time >= releaseAt) {
        enemy.setData('bombReleased', true)
        enemy.play('grenadier-throw', true)
        this.createStormBomb(enemy, enemyState.direction, config)
      } else if (!released) {
        enemy.play('grenadier-windup', true)
        enemy.setTint(0x91dfff)
      }
      return
    }

    enemy.clearTint()
    if (dx > range || dy > 190 || time - enemyState.lastShotAt < cooldown / chronoScale) return

    enemyState.direction = this.player.x >= enemy.x ? 1 : -1
    enemyState.lastShotAt = time
    enemyState.attackUntil = time + 620
    enemy.setData('bombReleaseAt', time + (config?.projectileWarningMs ?? 680) * 0.42)
    enemy.setData('bombReleased', false)
    enemy.setVelocityX(0)
    enemy.play('grenadier-windup', true)
    enemy.setTint(0x91dfff)
    this.setEnemyFacing(enemy, enemyState.direction)
  }

  private tryMoonlitCaptainAttack(
    time: number,
    enemy: Phaser.Physics.Arcade.Sprite,
    enemyState: ShadowRunnerEnemyState,
  ) {
    if (!this.player) return false

    const config = getShadowRunnerLevelEnemies(this.level).find(current => current.id === enemyState.id)
    const phases = config?.bossPhases ?? []
    const phase = [...phases]
      .reverse()
      .find(candidate => enemyState.health <= candidate.healthAtOrBelow)
      ?? phases[0]
    if (!phase) return false

    if (enemy.getData('bossPhaseId') !== phase.id) {
      enemy.setData('bossPhaseId', phase.id)
      enemy.setData('bossPhaseLabel', phase.label)
      enemyState.guard = Math.max(enemyState.guard, phase.guard ?? 0)
      enemyState.maxGuard = Math.max(enemyState.maxGuard, phase.guard ?? 0)
      enemy.setTint(0xf0d381)
      this.showCheckpointToast(phase.label)
      this.flashCamera(90, 196, 221, 255)
    }

    const range = config?.attackRange ?? 430
    const cooldown = phase.attackCooldownMs ?? config?.attackCooldownMs ?? 1380
    const dx = Math.abs(this.player.x - enemy.x)
    const dy = Math.abs(this.player.y - enemy.y)
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)
    const chargeCount = phase.chargeCount ?? 0

    if (time < enemyState.attackUntil) {
      const elapsed = time - enemyState.lastShotAt
      const telling = elapsed < 280
      if (telling) {
        enemy.setVelocityX(0)
        enemy.play('captain-command', true)
        enemy.setTint(0xf0d381)
      } else {
        const body = enemy.body as Phaser.Physics.Arcade.Body
        if (chargeCount > 1 && (body.blocked.left || body.blocked.right)) {
          enemyState.direction = enemyState.direction === 1 ? -1 : 1
        }
        const phaseSpeed = this.getEnemyPatrolSpeed(enemyState)
          * (phase.patrolSpeedMultiplier ?? 1)
        enemy.setVelocityX(
          enemyState.direction * (chargeCount > 0 ? phaseSpeed * 1.9 : phaseSpeed * 0.92) * chronoScale,
        )
        enemy.play(chargeCount > 0 ? 'captain-charge' : 'captain-slash', true)
        enemy.clearTint()
      }
      this.setEnemyFacing(enemy, enemyState.direction)
      return true
    }

    enemy.clearTint()
    if (dx > range || dy > 110 || time - enemyState.lastShotAt < cooldown / chronoScale) {
      return false
    }

    enemyState.direction = this.player.x >= enemy.x ? 1 : -1
    enemyState.lastShotAt = time
    enemyState.attackUntil = time + 720 + chargeCount * 170
    enemy.setVelocityX(0)
    enemy.play('captain-command', true)
    enemy.setTint(0xf0d381)
    this.setEnemyFacing(enemy, enemyState.direction)
    return true
  }

  private updateTowerArcher(time: number, enemy: Phaser.Physics.Arcade.Sprite, enemyState: ShadowRunnerEnemyState) {
    const player = this.player
    const recentlyHit = time - enemyState.lastDamagedAt < 180

    enemy.setVelocityX(0)

    if (player) {
      const direction = player.x >= enemy.x ? 1 : -1
      enemyState.direction = direction
      this.setEnemyFacing(enemy, direction)
    }

    if (recentlyHit) {
      enemy.play(this.getEnemyAnimation('tower-archer', 'hit'), true)
      enemy.setTint(0xffe08a)
      return
    }

    enemy.clearTint()

    if (!player) {
      enemy.play(this.getEnemyAnimation('tower-archer', 'walk'), true)
      return
    }

    const range = getShadowRunnerLevelEnemies(this.level)
      .find(config => config.id === enemyState.id)
      ?.attackRange ?? 600
    const cooldown = getShadowRunnerLevelEnemies(this.level)
      .find(config => config.id === enemyState.id)
      ?.attackCooldownMs ?? 1250
    const projectileSpeed = getShadowRunnerLevelEnemies(this.level)
      .find(config => config.id === enemyState.id)
      ?.projectileSpeed ?? 430
    const dx = Math.abs(player.x - enemy.x)
    const dy = Math.abs(player.y - enemy.y)
    const camera = this.cameras.main
    const archerTelegraphed = enemy.x >= camera.scrollX - 140 && enemy.x <= camera.scrollX + camera.width + 140
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)
    const effectiveCooldown = chronoScale < 1 ? cooldown / chronoScale : cooldown
    const canShoot = archerTelegraphed && dx <= range && dy <= 180 && time - enemyState.lastShotAt >= effectiveCooldown

    if (canShoot) {
      enemyState.lastShotAt = time
      enemyState.attackUntil = time + 360
      enemy.play(this.getEnemyAnimation('tower-archer', 'attack'), true)
      this.createArcherProjectile(enemy, enemyState.direction, projectileSpeed, enemyState.id)
      return
    }

    if (time < enemyState.attackUntil) {
      const attackAnimation = this.getEnemyAnimation('tower-archer', 'attack')
      if (enemy.anims.currentAnim?.key !== attackAnimation) {
        enemy.play(attackAnimation, true)
      }
      return
    }

    const readyAnimation = this.getEnemyAnimation('tower-archer', 'walk')
    if (enemy.anims.currentAnim?.key !== readyAnimation) {
      enemy.play(readyAnimation, true)
    }
  }

  private tryCandleJesterThrow(time: number, enemy: Phaser.Physics.Arcade.Sprite, enemyState: ShadowRunnerEnemyState) {
    if (!this.player || time < enemyState.attackUntil) return

    const enemyConfig = getShadowRunnerLevelEnemies(this.level).find(config => config.id === enemyState.id)
    const range = enemyConfig?.attackRange ?? 360
    const cooldown = enemyConfig?.attackCooldownMs ?? 1180
    const projectileSpeed = enemyConfig?.projectileSpeed ?? 320
    const dx = Math.abs(this.player.x - enemy.x)
    const dy = Math.abs(this.player.y - enemy.y)

    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)
    const effectiveCooldown = chronoScale < 1 ? cooldown / chronoScale : cooldown
    if (dx > range || dy > 126 || time - enemyState.lastShotAt < effectiveCooldown) return

    const direction = this.player.x >= enemy.x ? 1 : -1
    enemyState.direction = direction
    enemyState.lastShotAt = time
    enemyState.attackUntil = time + 360
    this.setEnemyFacing(enemy, direction)
    this.createCandleProjectile(enemy, direction, projectileSpeed, enemyState.id)
  }

  private tryMoonStalkerLunge(time: number, enemy: Phaser.Physics.Arcade.Sprite, enemyState: ShadowRunnerEnemyState) {
    if (!this.player) return false

    const enemyConfig = getShadowRunnerLevelEnemies(this.level).find(config => config.id === enemyState.id)
    const range = enemyConfig?.attackRange ?? 440
    const cooldown = enemyConfig?.attackCooldownMs ?? 1100
    const dx = Math.abs(this.player.x - enemy.x)
    const dy = Math.abs(this.player.y - enemy.y)
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)
    const effectiveCooldown = chronoScale < 1 ? cooldown / chronoScale : cooldown

    if (time < enemyState.attackUntil) {
      const direction = enemyState.direction
      enemy.setVelocityX(direction * this.getEnemyPatrolSpeed(enemyState) * 1.62 * chronoScale)
      this.setEnemyFacing(enemy, direction)
      const attackAnimation = this.getEnemyAnimation('moon-stalker', 'attack')
      if (enemy.anims.currentAnim?.key !== attackAnimation) {
        enemy.play(attackAnimation, true)
      }
      return true
    }

    if (dx > range || dy > 96 || time - enemyState.lastShotAt < effectiveCooldown) return false

    const direction = this.player.x >= enemy.x ? 1 : -1
    enemyState.direction = direction
    enemyState.lastShotAt = time
    enemyState.attackUntil = time + 540
    enemy.setVelocityX(direction * this.getEnemyPatrolSpeed(enemyState) * 1.7 * chronoScale)
    this.setEnemyFacing(enemy, direction)
    enemy.play(this.getEnemyAnimation('moon-stalker', 'attack'), true)
    return true
  }

  private createArcherProjectile(
    enemy: Phaser.Physics.Arcade.Sprite,
    direction: 1 | -1,
    speed: number,
    enemyId: string,
  ) {
    const enemyConfig = getShadowRunnerLevelEnemies(this.level).find(config => config.id === enemyId)
    this.createArrowProjectile(
      enemy.x + direction * 42,
      enemy.y - 56,
      direction,
      speed,
      ARCHER_PROJECTILE_LIFETIME_MS,
      enemyConfig ? getShadowRunnerEnemyProjectileDamage(enemyConfig) : 3,
    )
  }

  private createArrowProjectile(
    x: number,
    y: number,
    direction: 1 | -1,
    speed: number,
    lifetimeMs = ARCHER_PROJECTILE_LIFETIME_MS,
    damage = 3,
  ) {
    if (!this.archerProjectiles) return

    const arrowFrame = getTerrainFrameKey('bell-arrow')
    const hasAtlasArrow = this.textures.exists('shadow-runner-bell-terrain-atlas')
      && this.textures.get('shadow-runner-bell-terrain-atlas').has(arrowFrame)
    const arrow = this.acquireProjectile(
      x,
      y,
      hasAtlasArrow ? 'shadow-runner-bell-terrain-atlas' : 'shadow-runner-arrow',
      hasAtlasArrow ? arrowFrame : undefined,
    )
    if (!arrow) return
    arrow.setDepth(19)
    arrow.setDisplaySize(72, 16)
    arrow.setFlipX(direction < 0)
    arrow.setData('spawnedAt', this.activeTimeMs)
    arrow.setData('lifetimeMs', lifetimeMs)
    arrow.setData('projectileKind', 'arrow')
    arrow.setData('damage', damage)
    arrow.setData('baseSpeedX', direction * speed)
    arrow.setVelocityX(direction * speed * getShadowRunnerChronoTimeScale(this.state, this.activeTimeMs))

    const body = arrow.body as Phaser.Physics.Arcade.Body
    body.allowGravity = false
    body.setSize(54, 10)
    body.setOffset(9, 3)
  }

  private createCandleProjectile(
    enemy: Phaser.Physics.Arcade.Sprite,
    direction: 1 | -1,
    speed: number,
    enemyId: string,
  ) {
    if (!this.archerProjectiles) return

    const candle = this.acquireProjectile(
      enemy.x + direction * 34,
      enemy.y - 52,
      'shadow-runner-candle-projectile',
    )
    if (!candle) return
    candle.setDepth(20)
    candle.setDisplaySize(34, 18)
    candle.setFlipX(direction < 0)
    candle.setData('spawnedAt', this.activeTimeMs)
    candle.setData('lifetimeMs', CANDLE_PROJECTILE_LIFETIME_MS)
    candle.setData('projectileKind', 'candle')
    const enemyConfig = getShadowRunnerLevelEnemies(this.level).find(config => config.id === enemyId)
    candle.setData('damage', enemyConfig ? getShadowRunnerEnemyProjectileDamage(enemyConfig) : 2)
    candle.setData('baseSpeedX', direction * speed)
    candle.setVelocity(
      direction * speed * getShadowRunnerChronoTimeScale(this.state, this.activeTimeMs),
      -72,
    )
    candle.setAngularVelocity(direction * 320)

    const body = candle.body as Phaser.Physics.Arcade.Body
    body.allowGravity = true
    body.setGravityY(420)
    body.setSize(26, 14)
    body.setOffset(4, 2)
  }

  private createRelayOrbs(
    enemy: Phaser.Physics.Arcade.Sprite,
    count: number,
    enemyConfig?: ShadowRunnerEnemyConfig,
    telegraphedTarget?: { x: number; y: number; facing?: 1 | -1 },
  ) {
    if (!this.player) return

    const safeCount = Phaser.Math.Clamp(Math.floor(count), 1, 3)
    const speed = enemyConfig?.projectileSpeed ?? 480
    const damage = enemyConfig ? getShadowRunnerEnemyProjectileDamage(enemyConfig) : 3
    const facing: 1 | -1 = telegraphedTarget?.facing ?? (this.player.x >= enemy.x ? 1 : -1)
    const startX = enemy.x + facing * 48
    const startY = enemy.y - (this.getEnemyKind(enemy) === 'sentry-sovereign' ? 92 : 64)
    // Arcade can let an already embedded projectile escape through cover. Check
    // the whole muzzle reach, using the 28px body scaled from its 64px frame.
    const muzzleHalfSize = 14 * (46 / 64)
    if (this.getSolidBodies().some(body => body.left < Math.max(enemy.x, startX) + muzzleHalfSize
      && body.right > Math.min(enemy.x, startX) - muzzleHalfSize
      && body.top < startY + muzzleHalfSize && body.bottom > startY - muzzleHalfSize)) return
    const targetBody = this.player.body as Phaser.Physics.Arcade.Body
    const targetX = telegraphedTarget?.x ?? targetBody.center.x + targetBody.velocity.x * 0.18
    const targetY = telegraphedTarget?.y ?? targetBody.center.y

    for (let index = 0; index < safeCount; index += 1) {
      const spread = (index - (safeCount - 1) / 2) * 72
      const angle = Phaser.Math.Angle.Between(startX, startY, targetX, targetY + spread)
      const orb = this.acquireProjectile(startX, startY, 'shadow-runner-relay-orb', 0)
      if (!orb) continue

      const velocityX = Math.cos(angle) * speed
      const velocityY = Math.sin(angle) * speed
      orb.setDepth(22)
      orb.setDisplaySize(46, 46)
      orb.setData('spawnedAt', this.activeTimeMs)
      orb.setData('lifetimeMs', 3600)
      orb.setData('projectileKind', 'relay-orb')
      orb.setData('damage', damage)
      orb.setData('baseSpeedX', velocityX)
      orb.setData('baseSpeedY', velocityY)
      orb.setVelocity(velocityX, velocityY)
      orb.setAngularVelocity(180)

      const body = orb.body as Phaser.Physics.Arcade.Body
      body.allowGravity = false
      body.setSize(28, 28)
      body.setOffset(18, 18)
    }
  }

  private createSovereignShockwaves(
    enemy: Phaser.Physics.Arcade.Sprite,
    count: number,
    enemyConfig?: ShadowRunnerEnemyConfig,
  ) {
    const safeCount = Phaser.Math.Clamp(Math.floor(count), 1, 3)
    const damage = enemyConfig ? getShadowRunnerEnemyProjectileDamage(enemyConfig) : 3
    const generation = enemy.getData('sovereignAttackGeneration')
    const directions: Array<1 | -1> = safeCount === 1
      ? [this.state.player.facing]
      : safeCount > 2
        ? [-1, 1, this.state.player.facing]
        : [-1, 1]

    directions.forEach((direction, index) => {
      this.time.delayedCall(index * 160, () => {
        const owner = this.getEnemyState(enemy)
        if (this.runtimeDisposed || this.gameplayPaused || this.respawnPending
          || this.state.defeated || this.state.outOfLives || !enemy.active
          || !owner?.alive || !owner.activated
          || enemy.getData('sovereignAttackGeneration') !== generation) return
        const wave = this.acquireProjectile(
          enemy.x + direction * 62,
          enemy.y - 22,
          'shadow-runner-relay-orb',
          2,
        )
        if (!wave) return

        const speed = 430 + index * 45
        wave.setDepth(22)
        wave.setDisplaySize(76, 28)
        wave.setTint(0xffd56a)
        wave.setData('spawnedAt', this.activeTimeMs)
        wave.setData('lifetimeMs', 2800)
        wave.setData('projectileKind', 'relay-shockwave')
        wave.setData('damage', damage)
        wave.setData('baseSpeedX', direction * speed)
        wave.setData('baseSpeedY', 0)
        wave.setVelocity(direction * speed, 0)

        const body = wave.body as Phaser.Physics.Arcade.Body
        body.allowGravity = false
        body.setSize(58, 18)
        body.setOffset(3, 5)
      })
    })
  }

  private createStormBomb(
    enemy: Phaser.Physics.Arcade.Sprite,
    direction: 1 | -1,
    enemyConfig?: ShadowRunnerEnemyConfig,
  ) {
    if (!this.archerProjectiles || !this.player) return

    const startX = enemy.x + direction * 32
    const startY = enemy.y - 62
    const targetX = Phaser.Math.Clamp(
      this.player.x + Number((this.player.body as Phaser.Physics.Arcade.Body).velocity.x) * 0.16,
      40,
      this.level.worldWidth - 40,
    )
    const targetY = this.player.y - 12
    const distanceX = targetX - startX
    const nominalSpeed = enemyConfig?.projectileSpeed ?? 350
    const flightSeconds = Phaser.Math.Clamp(Math.abs(distanceX) / Math.max(260, nominalSpeed), 0.82, 1.28)
    const arcHeight = enemyConfig?.projectileArcHeight ?? 210
    const gravity = (8 * arcHeight) / (flightSeconds * flightSeconds)
    const velocityX = distanceX / flightSeconds
    const velocityY = (targetY - startY - 0.5 * gravity * flightSeconds * flightSeconds) / flightSeconds

    const bomb = this.acquireProjectile(startX, startY, 'shadow-runner-storm-bomb', 0)
    if (!bomb) return

    const warning = this.add.ellipse(targetX, targetY + 4, 72, 20, 0x8edfff, 0.2)
    warning.setStrokeStyle(2, 0xdaf7ff, 0.82)
    warning.setDepth(17)
    this.tweens.add({
      targets: warning,
      alpha: 0.62,
      scaleX: 0.72,
      scaleY: 0.72,
      duration: enemyConfig?.projectileWarningMs ?? 680,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })

    bomb.setDepth(21)
    bomb.setDisplaySize(46, 46)
    bomb.setData('spawnedAt', this.activeTimeMs)
    bomb.setData('lifetimeMs', STORM_BOMB_LIFETIME_MS)
    bomb.setData('projectileKind', 'storm-bomb')
    bomb.setData('damage', enemyConfig ? getShadowRunnerEnemyProjectileDamage(enemyConfig) : 3)
    bomb.setData('hazardDurationMs', enemyConfig?.hazardDurationMs ?? STORM_HAZARD_LIFETIME_MS)
    bomb.setData('baseSpeedX', velocityX)
    bomb.setData('warningMarker', warning)
    bomb.setVelocity(velocityX, velocityY)
    bomb.setAngularVelocity(direction * 260)

    const body = bomb.body as Phaser.Physics.Arcade.Body
    body.allowGravity = true
    body.setGravityY(gravity - GRAVITY_Y)
    body.setSize(30, 30)
    body.setOffset(17, 17)
  }

  private acquireProjectile(x: number, y: number, texture: string, frame?: string | number) {
    if (!this.archerProjectiles) return null

    const pooled = this.archerProjectiles.getFirstDead(false) as Phaser.Physics.Arcade.Image | null
    const projectile = pooled
      ?? this.archerProjectiles.create(x, y, texture, frame) as Phaser.Physics.Arcade.Image | null
    if (!projectile) return null

    if (pooled) {
      projectile.setTexture(texture, frame)
      projectile.enableBody(true, x, y, true, true)
    }
    projectile.setAlpha(1)
    projectile.clearTint()
    projectile.setAngle(0)
    projectile.setAngularVelocity(0)
    projectile.setGravityY(0)
    projectile.setVelocity(0, 0)
    projectile.setData('baseSpeedY', 0)
    projectile.setData('reflectedByPlayer', false)
    return projectile
  }

  private updateArrowVolleys(time: number) {
    if (!this.player || !this.archerProjectiles) return
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)

    this.arrowVolleys.forEach(runtime => {
      const volley = runtime.config
      const playerBody = this.player!.body as Phaser.Physics.Arcade.Body
      const horizontallyActive = this.player!.x >= volley.x - 360 && this.player!.x <= volley.x + volley.width + 160
      const verticallyActive = playerBody.center.y >= volley.y - 92 && playerBody.center.y <= volley.y + volley.height + 92
      const active = horizontallyActive && verticallyActive
      if (!active) {
        runtime.armed = false
        runtime.nextShotAt = 0
        return
      }

      if (!runtime.armed) {
        runtime.armed = true
        runtime.nextShotAt = time + (volley.delayMs ?? 0) / chronoScale
      }

      if (time < runtime.nextShotAt) return

      this.createArrowProjectile(
        volley.spawnX,
        volley.laneY,
        volley.direction,
        volley.speed ?? 520,
        volley.lifetimeMs ?? 3400,
        volley.damage ?? 3,
      )
      runtime.nextShotAt = time + (volley.intervalMs ?? 1300) / chronoScale
    })
  }

  private updateArcherProjectiles(time: number) {
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)

    this.archerProjectiles?.getChildren().forEach(child => {
      const projectile = child as Phaser.Physics.Arcade.Image
      if (!projectile.active) return

      const spawnedAt = Number(projectile.getData('spawnedAt') ?? time)
      const lifetimeMs = Number(projectile.getData('lifetimeMs') ?? ARCHER_PROJECTILE_LIFETIME_MS)
      const baseSpeedX = Number(projectile.getData('baseSpeedX') ?? projectile.body?.velocity.x ?? 0)
      projectile.setVelocityX(baseSpeedX * chronoScale)
      if (projectile.getData('projectileKind') === 'storm-bomb') {
        projectile.setFrame(Math.floor((time - spawnedAt) / 90) % 2)
      } else if (projectile.getData('projectileKind') === 'relay-orb') {
        const baseSpeedY = Number(projectile.getData('baseSpeedY') ?? projectile.body?.velocity.y ?? 0)
        projectile.setVelocityY(baseSpeedY * chronoScale)
        projectile.setFrame(Math.floor((time - spawnedAt) / 80) % 4)
      }
      const expired = time - spawnedAt > lifetimeMs
      const outsideWorld = projectile.x < -80
        || projectile.x > this.level.worldWidth + 80
        || projectile.y > this.level.worldHeight + 100

      if (expired || outsideWorld) {
        this.disableProjectile(projectile)
      }
    })
  }

  private disableProjectile(projectile: Phaser.Physics.Arcade.Image) {
    const warning = projectile.getData('warningMarker') as Phaser.GameObjects.Arc | undefined
    if (warning) {
      this.tweens.killTweensOf(warning)
      warning.destroy()
      projectile.setData('warningMarker', undefined)
    }
    projectile.clearTint()
    projectile.disableBody(true, true)
  }

  private tryReflectProjectileWithMirrorWard(projectile: Phaser.Physics.Arcade.Image) {
    if (projectile.getData('reflectedByPlayer')) return true

    const reflected = reflectShadowRunnerProjectileWithMirrorWard(this.state, this.activeTimeMs)
    if (!reflected) return false

    const currentBaseSpeed = Number(
      projectile.getData('baseSpeedX') ?? projectile.body?.velocity.x ?? 0,
    )
    const reflectedVelocity = getShadowRunnerReflectedVelocity(currentBaseSpeed, this.state.player.facing)
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, this.activeTimeMs)
    projectile.setData('reflectedByPlayer', true)
    projectile.setData('baseSpeedX', reflectedVelocity.x)
    projectile.setData('baseSpeedY', reflectedVelocity.y)
    projectile.setData('spawnedAt', this.activeTimeMs)
    projectile.setData('lifetimeMs', Math.max(2200, Number(projectile.getData('lifetimeMs') ?? 0)))
    projectile.setTint(0x88ffe2)
    projectile.setFlipX(reflectedVelocity.x < 0)
    projectile.setVelocity(reflectedVelocity.x * chronoScale, reflectedVelocity.y * chronoScale)
    projectile.setAngularVelocity(0)
    const body = projectile.body as Phaser.Physics.Arcade.Body
    body.allowGravity = false
    body.setGravityY(0)
    const warning = projectile.getData('warningMarker') as Phaser.GameObjects.Arc | undefined
    if (warning) {
      this.tweens.killTweensOf(warning)
      warning.destroy()
      projectile.setData('warningMarker', undefined)
    }
    this.playSound('enemy-hit')
    this.addHitFlash(projectile.x, projectile.y)
    this.shakeCamera(42, 0.0012)
    this.emitHud(true)
    return true
  }

  private handleReflectedProjectileEnemyHit(
    enemy: Phaser.Physics.Arcade.Sprite,
    projectile: Phaser.Physics.Arcade.Image,
  ) {
    if (!projectile.active || !projectile.getData('reflectedByPlayer')) return

    const enemyState = this.getEnemyState(enemy)
    if (!enemyState?.alive || !enemyState.activated) return

    const damaged = damageShadowRunnerEnemy(
      this.state,
      this.activeTimeMs,
      2,
      this.getEnemyId(enemy),
      { bypassGuard: true },
    )
    if (!damaged) return

    this.cancelGearwingDroneAttack(enemy)
    if (this.getEnemyKind(enemy) === 'gearwing-drone') {
      enemyState.attackUntil = this.activeTimeMs + 160
      if (enemyState.alive) enemy.play('gearwing-drone-hit', true)
    }
    this.disableProjectile(projectile)
    this.playSound('enemy-hit')
    this.addHitFlash(enemy.x, enemy.y - 42)
    enemy.setVelocityX(Math.sign(Number(projectile.getData('baseSpeedX') ?? 1)) * 220)
    if (!enemyState.alive) {
      this.defeatEnemy(enemy)
    }
    this.emitHud(true)
  }

  private tryBlockProjectileWithShield(projectile: Phaser.Physics.Arcade.Image) {
    const blocked = blockShadowRunnerProjectileWithShield(this.state, this.activeTimeMs)
    if (!blocked) return false

    this.playSound('enemy-hit')
    this.addHitFlash(projectile.x, projectile.y)
    this.disableProjectile(projectile)
    this.emitHud(true)
    return true
  }

  private maybeCreateProjectileImpactHazard(
    projectile: Phaser.Physics.Arcade.Image,
    surface: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody,
  ) {
    const body = projectile.body as Phaser.Physics.Arcade.Body | null
    // Callbacks precede sprite synchronization, and thin fast projectiles can
    // separate beyond the surface. Anchor fire to the witnessed top-face contact.
    if (!body?.enable || !surface?.enable || surface.checkCollision.none
      || !body.touching.down || !surface.touching.up
      || body.right <= surface.left || body.left >= surface.right) return
    const projectileKind = projectile.getData('projectileKind')
    const x = Phaser.Math.Clamp(body.center.x, surface.left, surface.right)
    const hazard = projectileKind === 'candle' ? this.createCandleHazard(x, surface.top - 26)
      : projectileKind === 'storm-bomb' ? this.createStormHazard(x, surface.top - 19,
        Number(projectile.getData('hazardDurationMs') ?? STORM_HAZARD_LIFETIME_MS)) : undefined
    hazard?.setData('impactSupport', { body: surface, x: surface.center.x, y: surface.top })
  }

  private createCandleHazard(x: number, y: number) {
    if (!this.candleHazards) return

    const pooled = this.candleHazards.getFirstDead(false) as Phaser.Physics.Arcade.Image | null
    const hazard = pooled
      ?? this.candleHazards.create(x, y, 'shadow-runner-candle-flame') as Phaser.Physics.Arcade.Image | null
    if (!hazard) return

    if (pooled) {
      this.tweens.killTweensOf(hazard)
      hazard.setTexture('shadow-runner-candle-flame')
      hazard.enableBody(true, x, y, true, true)
    }
    hazard.clearTint()
    hazard.setAlpha(1)
    hazard.setScale(1)
    hazard.setDisplaySize(34, 52)
    hazard.setDepth(18)
    hazard.setData('expiresAt', this.activeTimeMs + CANDLE_HAZARD_LIFETIME_MS)
    hazard.setData('damage', 1)
    hazard.setData('hazardKind', 'candle')
    hazard.setImmovable(true)

    const body = hazard.body as Phaser.Physics.Arcade.StaticBody
    this.setHazardHitbox(body, 'candle')

    this.tweens.add({
      targets: hazard,
      alpha: 0.54,
      scaleX: 1.12,
      scaleY: 0.9,
      duration: 140,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })
    return hazard
  }

  private createStormHazard(x: number, y: number, durationMs: number) {
    if (!this.candleHazards) return

    const pooled = this.candleHazards.getFirstDead(false) as Phaser.Physics.Arcade.Image | null
    const hazard = pooled
      ?? this.candleHazards.create(x, y, 'shadow-runner-storm-bomb', 3) as Phaser.Physics.Arcade.Image | null
    if (!hazard) return

    if (pooled) {
      this.tweens.killTweensOf(hazard)
      hazard.setTexture('shadow-runner-storm-bomb', 3)
      hazard.enableBody(true, x, y, true, true)
    }
    hazard.setAlpha(0.9)
    hazard.setScale(1)
    hazard.setDisplaySize(70, 38)
    hazard.setDepth(20)
    hazard.setTint(0xa5edff)
    hazard.setData('expiresAt', this.activeTimeMs + durationMs)
    hazard.setData('damage', 2)
    hazard.setData('hazardKind', 'storm')
    hazard.setImmovable(true)

    const body = hazard.body as Phaser.Physics.Arcade.StaticBody
    this.setHazardHitbox(body, 'storm')

    this.tweens.add({
      targets: hazard,
      alpha: 0.42,
      scaleX: 1.12,
      scaleY: 0.88,
      duration: 105,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })
    this.shakeCamera(55, 0.0015)
    return hazard
  }

  private setHazardHitbox(body: Phaser.Physics.Arcade.StaticBody, kind: keyof typeof SHADOW_RUNNER_HAZARD_HITBOXES) {
    const bounds = SHADOW_RUNNER_HAZARD_HITBOXES[kind]
    // Clear the previous pooled offset before syncing; refresh would erase custom bounds.
    body.setOffset(0, 0)
    body.updateFromGameObject()
    body.setSize(bounds.width, bounds.height, false)
    body.setOffset(bounds.offsetX, bounds.offsetY)
  }

  private updateCandleHazards(time: number) {
    this.candleHazards?.getChildren().forEach(child => {
      const hazard = child as Phaser.Physics.Arcade.Image
      if (!hazard.active) return

      const expiresAt = Number(hazard.getData('expiresAt') ?? time)
      const support = hazard.getData('impactSupport') as {
        body: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody; x: number; y: number
      } | undefined
      if (time < expiresAt && (!support || (support.body.enable && !support.body.checkCollision.none))) {
        if (support) {
          const dx = support.body.center.x - support.x
          const dy = support.body.top - support.y
          const body = hazard.body as Phaser.Physics.Arcade.StaticBody
          // Preserve the fixed damage rectangle while the artwork pulses.
          if (dx !== 0 || dy !== 0) {
            hazard.setPosition(hazard.x + dx, hazard.y + dy)
            body.x += dx
            body.y += dy
            body.updateCenter()
            support.x = support.body.center.x
            support.y = support.body.top
          }
        }
        return
      }

      hazard.disableBody(true, true)
      hazard.setData('impactSupport', undefined)
      hazard.clearTint()
      this.tweens.killTweensOf(hazard)
    })
  }

  private tryJump(onFloor: boolean) {
    if (!this.player) return

    if (onFloor) {
      this.releasePlayerTiltContact()
      this.airborneStartY = (this.player.body as Phaser.Physics.Arcade.Body).bottom
      this.player.setVelocityY(JUMP_VELOCITY)
      this.jumpsUsed = 1
      this.playSound('jump')
      return
    }

    const maxJumps = 2 + getShadowRunnerAetherExtraAirJumps(this.state, this.activeTimeMs)
    if (this.jumpsUsed < maxJumps) {
      this.releasePlayerTiltContact()
      this.player.setVelocityY(DOUBLE_JUMP_VELOCITY)
      this.jumpsUsed += 1
      this.playSound('double-jump')
      this.addDustPuff(this.player.x, this.player.y - 52)
    }
  }

  private tryAttack(time: number) {
    if (this.respawnPending || this.state.outOfLives || this.state.defeated
      || time < this.state.player.attackCooldownUntil) return

    this.attackId += 1
    this.attackHitEnemyIds.clear()
    this.attackHitProjectile = false
    this.state.player.attackingUntil = time + 265
    this.state.player.attackCooldownUntil = time + 420
    consumeShadowRunnerSunsteelCharge(this.state, time, 280)
    this.player?.play('runner-attack', true)
    this.playSound('sword-swing')
    this.playSwordSlash()
  }

  private resolveAttackHit(time: number) {
    const player = this.player
    if (!player || this.attackId === 0 || time >= this.state.player.attackingUntil) {
      this.slashArc?.clear()
      return
    }

    const facing = this.state.player.facing
    const sunsteelStrike = getShadowRunnerSunsteelStrikeProperties(this.state, time)
    const dawnfire = getShadowRunnerDawnfireProperties(this.state, time)
    const slashX = player.x + facing * 48
    const slashY = player.y - 46

    this.slashArc?.clear()
    if (!this.slashSprite?.visible) {
      this.slashArc?.lineStyle(5, 0xf0d381, 0.94)
      this.slashArc?.arc(slashX, slashY, 34, facing === 1 ? -0.9 : 2.2, facing === 1 ? 0.9 : 4.05)
      this.slashArc?.strokePath()
    }

    const bomb = this.archerProjectiles?.getChildren().find(child => {
      const projectile = child as Phaser.Physics.Arcade.Image
      const projectileKind = projectile.getData('projectileKind')
      if (!projectile.active || (projectileKind !== 'storm-bomb' && projectileKind !== 'relay-orb')) return false
      const reachX = facing === 1 ? projectile.x - player.x : player.x - projectile.x
      return reachX > -14
        && reachX < 106 + sunsteelStrike.reachBonus
        && Math.abs(projectile.y - slashY) < 76
    }) as Phaser.Physics.Arcade.Image | undefined
    if (bomb && !this.attackHitProjectile && (sunsteelStrike.attackDamageBonus > 0 || dawnfire.attackDamageBonus > 0)) {
      this.attackHitProjectile = true
      this.disableProjectile(bomb)
      this.playSound('enemy-hit')
      this.addHitFlash(bomb.x, bomb.y)
      this.state.player.score += 40
    }

    const enemy = this.enemies.find(current => {
      const enemyState = this.getEnemyState(current)
      if (!canShadowRunnerSwordHit(enemyState, this.attackHitEnemyIds)) return false

      const reachX = facing === 1 ? current.x - player.x : player.x - current.x
      const vertical = Math.abs(current.y - player.y)
      // Include close body overlap so contact cannot create a sword dead zone.
      if (reachX <= -14 || reachX >= 106 + sunsteelStrike.reachBonus || vertical >= 74) return false
      const playerBody = player.body as Phaser.Physics.Arcade.Body
      const enemyBody = current.body as Phaser.Physics.Arcade.Body
      const strike = new Phaser.Geom.Line(playerBody.center.x, playerBody.center.y, enemyBody.center.x, enemyBody.center.y)
      return !this.getSolidBodies().some(body => Phaser.Geom.Intersects.LineToRectangle(
        strike, new Phaser.Geom.Rectangle(body.left, body.top, body.width, body.height),
      ))
    })
    if (!enemy) return

    const enemyState = this.getEnemyState(enemy)
    const boostActive = isShadowRunnerBoostActive(this.state, time)
    const surgeActive = isShadowRunnerSurgeActive(this.state, time)
    const enemyKind = this.getEnemyKind(enemy)
    const rearAttack = enemyKind === 'crypt-warden' && enemyState
      ? (player.x < enemy.x && enemyState.direction > 0)
        || (player.x > enemy.x && enemyState.direction < 0)
      : false
    const damaged = damageShadowRunnerEnemy(
      this.state,
      time,
      (boostActive || surgeActive ? 2 : 1)
        + sunsteelStrike.attackDamageBonus
        + dawnfire.attackDamageBonus,
      this.getEnemyId(enemy),
      {
        bypassGuard: rearAttack,
        guardDamage: Math.max(
          boostActive || surgeActive ? 2 : 1,
          sunsteelStrike.guardDamage,
          dawnfire.guardDamage,
        ),
      },
    )
    if (damaged) {
      this.attackHitEnemyIds.add(this.getEnemyId(enemy))
      this.cancelSentrySovereignAttack(enemy)
      this.cancelGearwingDroneAttack(enemy)
      if (enemyKind === 'gearwing-drone' && enemyState?.alive) enemy.play('gearwing-drone-hit', true)
      if (enemyState) {
        enemyState.attackUntil = time + 160
      }
      this.playSound('enemy-hit')
      enemy.setVelocityX(
        facing * (
          boostActive
          || surgeActive
          || sunsteelStrike.attackDamageBonus > 0
          || dawnfire.attackDamageBonus > 0
            ? 245
            : 190
        ),
      )
      this.addHitFlash(enemy.x, enemy.y - 42)
      if (!enemyState?.alive) {
        this.defeatEnemy(enemy)
      }
    }
  }

  private handlePlayerEnemyOverlap(time: number, enemy: Phaser.Physics.Arcade.Sprite) {
    if (this.deliveryState === 'igniting' || this.deliveryState === 'delivered') return
    const player = this.player
    const enemyState = this.getEnemyState(enemy)
    if (!player || !enemyState?.alive || !enemyState.activated) return
    if (time < Number(enemy.getData('harmfulAt') ?? 0)) return

    const body = player.body as Phaser.Physics.Arcade.Body
    const enemyKind = this.getEnemyKind(enemy)
    if (
      (enemyKind === 'gate-pikeman'
        || enemyKind === 'relay-lancer'
        || enemyKind === 'sentry-sovereign')
      && enemy.getData('highThrust')
      && body.height <= 50
    ) {
      return
    }
    const isStomp = body.velocity.y > 130 && player.y < enemy.y - 24

    if (isStomp) {
      const stompDamage = isShadowRunnerBoostActive(this.state, time) || isShadowRunnerSurgeActive(this.state, time) ? 3 : 2
      const damaged = damageShadowRunnerEnemy(
        this.state,
        time,
        stompDamage,
        this.getEnemyId(enemy),
        { bypassGuard: true },
      )
      player.setVelocityY(-390)
      this.cancelGearwingDroneAttack(enemy)
      enemyState.attackUntil = time + 160
      this.cancelSentrySovereignAttack(enemy)
      if (damaged) {
        if (enemyKind === 'gearwing-drone' && enemyState.alive) enemy.play('gearwing-drone-hit', true)
        this.playSound('stomp')
        this.addHitFlash(enemy.x, enemy.y - 42)
      }
      if (!enemyState.alive) {
        this.defeatEnemy(enemy)
      }
      return
    }

    const enemyConfig = getShadowRunnerLevelEnemies(this.level)
      .find(config => config.id === enemyState.id)
    const contactDamage = enemyConfig ? getShadowRunnerEnemyContactDamage(enemyConfig) : 2
    const damaged = this.damagePlayerFromHazard(time, enemy.x, contactDamage)
    if (damaged) {
      this.cancelGearwingDroneAttack(enemy)
      enemyState.attackUntil = time + (
        enemyKind === 'barrel-roller'
          ? 340
          : enemyKind === 'lantern-bandit-scout'
            ? 310
            : 280
      )
      enemyState.direction = player.x < enemy.x ? -1 : 1
      this.setEnemyFacing(enemy, enemyState.direction)
      enemy.play(this.getEnemyAnimation(enemyKind, enemyKind === 'gearwing-drone' ? 'walk' : 'attack'), true)
    }
  }

  private damagePlayerFromHazard(time: number, sourceX?: number, amount = 1) {
    if (this.deliveryState === 'igniting' || this.deliveryState === 'delivered') return false
    const resistedHit = (
      isShadowRunnerBoostActive(this.state, time) && this.state.player.boostGuardCharges > 0
    ) || isShadowRunnerSurgeActive(this.state, time)
    const dawnfire = getShadowRunnerDawnfireProperties(this.state, time)
    const mitigatedAmount = Math.max(1, Math.ceil(amount * dawnfire.damageResistanceMultiplier))
    const damaged = damageShadowRunnerPlayer(this.state, time, mitigatedAmount)
    if (!damaged || !this.player) return false

    this.playSound('player-hurt')
    const knockback = sourceX === undefined
      ? (this.state.player.facing === 1 ? -1 : 1)
      : (this.player.x < sourceX ? -1 : 1)
    const dawnfireActive = dawnfire.damageResistanceMultiplier < 1
    const knockbackStrength = resistedHit
      ? 145
      : dawnfireActive
        ? 168
        : 220 + Math.max(0, mitigatedAmount - 1) * 62
    this.player.setVelocity(
      knockback * knockbackStrength,
      resistedHit || dawnfireActive ? -210 : -290 - Math.max(0, mitigatedAmount - 1) * 28,
    )
    this.player.setTint(resistedHit ? 0xf0d381 : dawnfireActive ? 0xffd56a : 0xffd0b3)
    this.shakeCamera(
      resistedHit || dawnfireActive ? 56 : 90,
      resistedHit || dawnfireActive ? 0.0014 : 0.0022,
    )

    this.time.delayedCall(190, () => {
      this.player?.clearTint()
    })

    if (this.state.player.health <= 0) {
      this.handlePlayerHealthDepleted()
    }

    return true
  }

  private handlePlayerHealthDepleted() {
    const hasLivesLeft = spendShadowRunnerLife(this.state)
    this.suspendPlayerForRespawn()
    this.emitHud(true)

    if (!hasLivesLeft) {
      this.playSound('route-failed')
      this.player?.setTint(0x6d7380)
      this.addDustPuff(this.player?.x ?? 0, (this.player?.y ?? 0) - 28)
      return
    }

    this.playSound('life-lost')
    this.time.delayedCall(260, () => {
      this.respawnPlayer()
    })
  }

  private handlePlayerFellOut() {
    if (!this.player || this.respawnPending || this.state.outOfLives) return

    const hasLivesLeft = spendShadowRunnerLife(this.state)
    this.suspendPlayerForRespawn()
    this.emitHud(true)

    this.playSound(hasLivesLeft ? 'life-lost' : 'route-failed')
    this.player.setTint(0x6d7380)
    this.addDustPuff(this.player.x, this.level.worldHeight - 20)

    if (!hasLivesLeft) return

    this.time.delayedCall(260, () => {
      this.respawnPlayer()
    })
  }

  private suspendPlayerForRespawn() {
    if (!this.player) return

    this.releasePlayerTiltContact()
    this.respawnPending = true
    this.deliveryState = 'locked'
    this.deliveryRequested = false
    this.deliveryFlame?.setVisible(false)
    this.state.player.attackingUntil = 0
    this.attackHitEnemyIds.clear()
    this.enemies.forEach(enemy => {
      this.cancelSentrySovereignAttack(enemy)
      this.cancelGearwingDroneAttack(enemy)
    })
    this.archerProjectiles?.getChildren().forEach(child => {
      const projectile = child as Phaser.Physics.Arcade.Image
      if (projectile.active) this.disableProjectile(projectile)
    })
    this.candleHazards?.getChildren().forEach(child => {
      const hazard = child as Phaser.Physics.Arcade.Image
      if (!hazard.active) return
      hazard.disableBody(true, true)
      hazard.clearTint()
      this.tweens.killTweensOf(hazard)
    })
    this.player.setVelocity(0, 0)
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.enable = false
  }

  private clampPlayerHorizontalBounds(body: Phaser.Physics.Arcade.Body) {
    if (!this.player) return

    const minX = 24
    const maxX = this.level.worldWidth - 24
    if (this.player.x < minX) {
      this.player.setX(minX)
      if (body.velocity.x < 0) {
        this.player.setVelocityX(0)
      }
    } else if (this.player.x > maxX) {
      this.player.setX(maxX)
      if (body.velocity.x > 0) {
        this.player.setVelocityX(0)
      }
    }
  }

  private respawnPlayer() {
    if (!this.player || this.state.outOfLives) return

    this.releasePlayerTiltContact()
    restoreShadowRunnerPlayer(this.state)
    this.state.player.lastDamagedAt = this.activeTimeMs
    this.jumpsUsed = 0
    this.wasOnFloor = false
    this.airborneStartY = null
    this.lastSupportedFootY = null
    this.spectralGrace = createShadowRunnerSpectralGrace()
    this.recoveringEncounterIds = new Set(getShadowRunnerEncounterRecoveryIds(
      this.level.encounters ?? [],
      this.state.enemies,
      this.clearedEncounterIds,
      { x: this.respawnPoint.x, y: this.respawnPoint.y - 35 * HERO_SCALE },
    ))
    this.respawnPending = false
    this.player.enableBody(true, this.respawnPoint.x, this.respawnPoint.y, true, true)
    this.player.setVelocity(0, 0)
    this.updateEncounterBarriers()
    // Check destination headroom; the stance before death may not fit this checkpoint.
    this.standingBlocked = !canShadowRunnerStand(
      this.player.body as Phaser.Physics.Arcade.Body, 70 * HERO_SCALE, this.getSolidBodies(),
    )
    this.setPlayerStance(this.standingBlocked)
    this.player.clearTint()
    this.playSound('respawn')
    this.addDustPuff(this.player.x, this.player.y - 28)
    this.emitHud(true)
  }

  private collectCoin(coin: Phaser.Physics.Arcade.Sprite) {
    if (coin.getData('collected')) return

    coin.setData('collected', true)
    this.tweens.killTweensOf(coin)
    collectShadowRunnerCoin(this.state)
    this.playSound('coin')
    this.addCoinSparkle(coin.x, coin.y)
    this.tweens.add({
      targets: coin,
      scale: 1.8,
      alpha: 0,
      y: coin.y - 24,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => coin.disableBody(true, true),
    })
  }

  private collectBoost(boostSprite: Phaser.Physics.Arcade.Sprite) {
    if (boostSprite.getData('collected')) return

    const boost: ShadowRunnerBoostPickup | undefined = this.level.boosts?.find(current => current.id === boostSprite.name)
    if (!boost) return

    boostSprite.setData('collected', true)
    this.tweens.killTweensOf(boostSprite)
    collectShadowRunnerBoost(this.state, this.activeTimeMs, boost)
    this.playSound('coin')
    this.addCoinSparkle(boostSprite.x, boostSprite.y)
    this.addDustPuff(boostSprite.x, boostSprite.y + 18)
    this.tweens.add({
      targets: boostSprite,
      scale: 1.55,
      alpha: 0,
      y: boostSprite.y - 26,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => boostSprite.disableBody(true, true),
    })
    this.emitHud(true)
  }

  private createStoryLandmarks() {
    for (const landmark of getShadowRunnerStoryLandmarks(this.level)) {
      this.add.image(landmark.x, landmark.y, landmark.texture)
        .setName(landmark.momentId).setData('landmarkId', landmark.landmarkId)
        .setOrigin(0.5, 1).setDisplaySize(landmark.width, landmark.height)
        .setDepth(SHADOW_RUNNER_STORY_LANDMARK_DEPTH)
    }
  }

  private createCheckpointWayposts() {
    if (!this.textures.exists(SHADOW_RUNNER_WAYPOST_TEXTURE)) return
    this.level.checkpoints?.forEach((checkpoint, index) => {
      const placement = getShadowRunnerWaypostPlacement(this.level, checkpoint)
      if (!placement) return
      const appearance = getShadowRunnerWaypostAppearance(false)
      const image = this.add.image(placement.x, placement.y, SHADOW_RUNNER_WAYPOST_TEXTURE)
        .setOrigin(0.5, 1).setDisplaySize(placement.width, placement.height)
        .setDepth(2).setTint(appearance.tint).setAlpha(appearance.alpha)
      this.checkpointWayposts.push({ index, image })
    })
  }

  private updateCheckpointProgress() {
    if (!this.player || this.respawnPending || this.state.outOfLives) return

    const checkpoints = this.level.checkpoints ?? []
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    const activatedIndex = findShadowRunnerCheckpoint(checkpoints, this.activeCheckpointIndex, playerBody.center)

    if (activatedIndex === this.activeCheckpointIndex) return
    const checkpoint = checkpoints[activatedIndex]
    this.activeCheckpointIndex = activatedIndex
    this.checkpointWayposts.forEach(post => {
      const appearance = getShadowRunnerWaypostAppearance(post.index <= activatedIndex)
      post.image.setTint(appearance.tint).setAlpha(appearance.alpha)
    })
    this.respawnPoint = { x: checkpoint.x, y: checkpoint.y }
    restoreShadowRunnerPlayer(this.state)
    this.state.player.lastDamagedAt = this.activeTimeMs
    this.showCheckpointToast(checkpoint.label)
    this.emitHud(true)
  }

  private clearCheckpointToast() {
    if (this.checkpointToast) {
      this.tweens.killTweensOf(this.checkpointToast)
      this.checkpointToast.destroy()
      this.checkpointToast = undefined
    }
  }

  private showCheckpointToast(label: string) {
    this.clearCheckpointToast()

    const toast = this.add.text(GAME_WIDTH / 2, 174, `CHECKPOINT  -  ${label}`, {
      color: '#f6e6bb',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      stroke: '#120a03',
      strokeThickness: 6,
    })
    toast.setOrigin(0.5)
    toast.setScrollFactor(0)
    toast.setDepth(38)
    toast.setAlpha(0)
    this.checkpointToast = toast

    this.tweens.add({
      targets: toast,
      alpha: 1,
      y: 188,
      duration: 180,
      hold: 900,
      yoyo: true,
      onComplete: () => {
        toast.destroy()
        if (this.checkpointToast === toast) {
          this.checkpointToast = undefined
        }
      },
    })
  }

  private collectShield(shieldSprite: Phaser.Physics.Arcade.Sprite) {
    if (shieldSprite.getData('collected')) return

    const shield: ShadowRunnerShieldPickup | undefined = this.level.shieldPickups?.find(current => current.id === shieldSprite.name)
    if (!shield) return

    shieldSprite.setData('collected', true)
    this.tweens.killTweensOf(shieldSprite)
    collectShadowRunnerShield(this.state, this.activeTimeMs, shield)
    this.playSound('coin')
    this.addCoinSparkle(shieldSprite.x, shieldSprite.y)
    this.addDustPuff(shieldSprite.x, shieldSprite.y + 18)
    this.tweens.add({
      targets: shieldSprite,
      scale: 1.45,
      alpha: 0,
      y: shieldSprite.y - 24,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => shieldSprite.disableBody(true, true),
    })
    this.emitHud(true)
  }

  private collectChrono(chronoSprite: Phaser.Physics.Arcade.Sprite) {
    if (chronoSprite.getData('collected')) return

    const chrono: ShadowRunnerChronoPickup | undefined = this.level.chronoPickups
      ?.find(current => current.id === chronoSprite.name)
    if (!chrono) return

    chronoSprite.setData('collected', true)
    this.tweens.killTweensOf(chronoSprite)
    collectShadowRunnerChrono(this.state, this.activeTimeMs, chrono)
    this.playSound('coin')
    this.addCoinSparkle(chronoSprite.x, chronoSprite.y)
    this.addDustPuff(chronoSprite.x, chronoSprite.y + 18)
    this.flashCamera(110, 70, 225, 255)
    this.tweens.add({
      targets: chronoSprite,
      scale: 1.5,
      alpha: 0,
      y: chronoSprite.y - 28,
      duration: 240,
      ease: 'Quad.easeOut',
      onComplete: () => chronoSprite.disableBody(true, true),
    })
    this.emitHud(true)
  }

  private collectSurge(surgeSprite: Phaser.Physics.Arcade.Sprite) {
    if (surgeSprite.getData('collected')) return

    const surge: ShadowRunnerSurgePickup | undefined = this.level.surgePickups
      ?.find(current => current.id === surgeSprite.name)
    if (!surge) return

    surgeSprite.setData('collected', true)
    this.tweens.killTweensOf(surgeSprite)
    collectShadowRunnerSurge(this.state, this.activeTimeMs, surge)
    this.playSound('coin')
    this.addCoinSparkle(surgeSprite.x, surgeSprite.y)
    this.addDustPuff(surgeSprite.x, surgeSprite.y + 18)
    this.flashCamera(100, 150, 232, 255)
    this.tweens.add({
      targets: surgeSprite,
      scale: 1.58,
      alpha: 0,
      y: surgeSprite.y - 28,
      duration: 230,
      ease: 'Quad.easeOut',
      onComplete: () => surgeSprite.disableBody(true, true),
    })
    this.emitHud(true)
  }

  private collectMoonShard(shardSprite: Phaser.Physics.Arcade.Sprite) {
    if (shardSprite.getData('collected')) return

    const shard: ShadowRunnerMoonShardPickup | undefined = this.level.moonShardPickups
      ?.find(current => current.id === shardSprite.name)
    const totalMoonShards = this.level.moonShardPickups?.length ?? 0
    if (!shard || totalMoonShards <= 0) return

    shardSprite.setData('collected', true)
    this.tweens.killTweensOf(shardSprite)
    collectShadowRunnerMoonShard(this.state, shard, totalMoonShards)
    this.finishSparked = false
    this.playSound('coin')
    this.addCoinSparkle(shardSprite.x, shardSprite.y)
    this.addDustPuff(shardSprite.x, shardSprite.y + 18)
    this.flashCamera(120, 210, 245, 255)
    this.tweens.add({
      targets: shardSprite,
      scale: 1.64,
      alpha: 0,
      y: shardSprite.y - 30,
      duration: 250,
      ease: 'Quad.easeOut',
      onComplete: () => shardSprite.disableBody(true, true),
    })
    this.emitHud(true)
  }

  private collectWraithlight(sprite: Phaser.Physics.Arcade.Sprite) {
    if (sprite.getData('collected')) return

    const pickup: ShadowRunnerWraithlightPickup | undefined = this.level.wraithlightPickups
      ?.find(current => current.id === sprite.name)
    if (!pickup) return

    sprite.setData('collected', true)
    this.tweens.killTweensOf(sprite)
    collectShadowRunnerWraithlight(this.state, this.activeTimeMs, pickup)
    this.playSound('coin')
    this.addCoinSparkle(sprite.x, sprite.y)
    this.addDustPuff(sprite.x, sprite.y + 18)
    this.tweens.add({
      targets: sprite,
      scale: 1.65,
      alpha: 0,
      y: sprite.y - 30,
      duration: 240,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.disableBody(true, true),
    })
    this.updateWraithlight(this.activeTimeMs)
    this.emitHud(true)
  }

  private collectMirrorWard(sprite: Phaser.Physics.Arcade.Sprite) {
    if (sprite.getData('collected')) return

    const pickup: ShadowRunnerMirrorWardPickup | undefined = this.level.mirrorWardPickups
      ?.find(current => current.id === sprite.name)
    if (!pickup) return

    sprite.setData('collected', true)
    this.tweens.killTweensOf(sprite)
    collectShadowRunnerMirrorWard(this.state, this.activeTimeMs, pickup)
    this.playSound('coin')
    this.addCoinSparkle(sprite.x, sprite.y)
    this.addDustPuff(sprite.x, sprite.y + 18)
    this.tweens.add({
      targets: sprite,
      scale: 1.62,
      alpha: 0,
      y: sprite.y - 28,
      duration: 230,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.disableBody(true, true),
    })
    this.emitHud(true)
  }

  private collectGaleMantle(sprite: Phaser.Physics.Arcade.Sprite) {
    if (sprite.getData('collected')) return

    const pickup: ShadowRunnerGaleMantlePickup | undefined = this.level.galeMantlePickups
      ?.find(current => current.id === sprite.name)
    if (!pickup) return

    sprite.setData('collected', true)
    this.tweens.killTweensOf(sprite)
    collectShadowRunnerGaleMantle(this.state, this.activeTimeMs, pickup)
    this.playSound('coin')
    this.addCoinSparkle(sprite.x, sprite.y)
    this.addDustPuff(sprite.x, sprite.y + 18)
    this.flashCamera(110, 148, 225, 255)
    this.tweens.add({
      targets: sprite,
      scale: 1.62,
      alpha: 0,
      y: sprite.y - 30,
      duration: 235,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.disableBody(true, true),
    })
    this.updateGaleMantleAura(this.activeTimeMs)
    this.emitHud(true)
  }

  private collectSunsteelEdge(sprite: Phaser.Physics.Arcade.Sprite) {
    if (sprite.getData('collected')) return

    const pickup: ShadowRunnerSunsteelEdgePickup | undefined = this.level.sunsteelEdgePickups
      ?.find(current => current.id === sprite.name)
    if (!pickup) return

    sprite.setData('collected', true)
    this.tweens.killTweensOf(sprite)
    collectShadowRunnerSunsteelEdge(this.state, this.activeTimeMs, pickup)
    this.playSound('coin')
    this.addCoinSparkle(sprite.x, sprite.y)
    this.addDustPuff(sprite.x, sprite.y + 18)
    this.flashCamera(110, 255, 196, 72)
    this.tweens.add({
      targets: sprite,
      scale: 1.62,
      alpha: 0,
      y: sprite.y - 30,
      duration: 235,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.disableBody(true, true),
    })
    this.updateSunsteelEdgeAura(this.activeTimeMs)
    this.emitHud(true)
  }

  private collectDawnfireAegis(sprite: Phaser.Physics.Arcade.Sprite) {
    if (sprite.getData('collected')) return

    const pickup: ShadowRunnerDawnfireAegisPickup | undefined = this.level.dawnfireAegisPickups
      ?.find(current => current.id === sprite.name)
    if (!pickup) return

    sprite.setData('collected', true)
    this.tweens.killTweensOf(sprite)
    collectShadowRunnerDawnfireAegis(this.state, this.activeTimeMs, pickup)
    this.playSound('coin')
    this.addCoinSparkle(sprite.x, sprite.y)
    this.addDustPuff(sprite.x, sprite.y + 18)
    this.flashCamera(125, 255, 148, 70)
    this.tweens.add({
      targets: sprite,
      scale: 1.7,
      alpha: 0,
      y: sprite.y - 32,
      duration: 245,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.disableBody(true, true),
    })
    this.updateDawnfireAegisAura(this.activeTimeMs)
    this.emitHud(true)
  }

  private collectAetherStep(sprite: Phaser.Physics.Arcade.Sprite) {
    if (sprite.getData('collected')) return

    const pickup: ShadowRunnerAetherStepPickup | undefined = this.level.aetherStepPickups
      ?.find(current => current.id === sprite.name)
    if (!pickup) return

    sprite.setData('collected', true)
    this.tweens.killTweensOf(sprite)
    collectShadowRunnerAetherStep(this.state, this.activeTimeMs, pickup)
    this.playSound('coin')
    this.addCoinSparkle(sprite.x, sprite.y)
    this.addDustPuff(sprite.x, sprite.y + 18)
    this.flashCamera(115, 126, 239, 255)
    this.tweens.add({
      targets: sprite,
      scale: 1.7,
      alpha: 0,
      y: sprite.y - 34,
      duration: 245,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.disableBody(true, true),
    })
    this.updateAetherStepAura(this.activeTimeMs)
    this.emitHud(true)
  }

  private collectObjective(sprite: Phaser.Physics.Arcade.Sprite) {
    if (sprite.getData('collected')) return

    const pickup: ShadowRunnerObjectivePickup | undefined = this.level.objectivePickups
      ?.find(current => current.id === sprite.name)
    if (!pickup) return

    sprite.setData('collected', true)
    this.tweens.killTweensOf(sprite)
    collectShadowRunnerObjective(this.state, pickup)
    this.finishSparked = false
    this.playSound('coin')
    this.addCoinSparkle(sprite.x, sprite.y)
    this.addDustPuff(sprite.x, sprite.y + 18)
    this.flashCamera(125, 246, 204, 92)
    this.tweens.add({
      targets: sprite,
      scale: 1.72,
      alpha: 0,
      y: sprite.y - 32,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.disableBody(true, true),
    })
    this.showCheckpointToast(
      `${this.level.objectiveLabel ?? 'Objectives'} ${this.state.player.objectiveItems}/${this.level.objectivePickups?.length ?? 0}`,
    )
    this.emitHud(true)
  }

  private collectMastery(sprite: Phaser.Physics.Arcade.Sprite) {
    const pickup: ShadowRunnerMasteryPickup | undefined = this.level.masteryPickups
      ?.find(current => current.id === sprite.name)
    if (!pickup) return
    const powerActive = pickup.requiredPower === 'gale-mantle'
      ? isShadowRunnerGaleMantleActive(this.state, this.activeTimeMs)
      : pickup.requiredPower === 'sunsteel-edge'
        ? isShadowRunnerSunsteelEdgeActive(this.state, this.activeTimeMs)
        : pickup.requiredPower === 'dawnfire-aegis'
          ? isShadowRunnerDawnfireAegisActive(this.state, this.activeTimeMs)
          : pickup.requiredPower === 'aether-step'
            ? isShadowRunnerAetherStepActive(this.state, this.activeTimeMs)
        : isShadowRunnerWraithlightActive(this.state, this.activeTimeMs)
    if (sprite.getData('collected') || !powerActive) return

    sprite.setData('collected', true)
    this.tweens.killTweensOf(sprite)
    collectShadowRunnerMastery(this.state, pickup)
    this.playSound('coin')
    this.addCoinSparkle(sprite.x, sprite.y)
    this.addDustPuff(sprite.x, sprite.y + 18)
    this.tweens.add({
      targets: sprite,
      scale: 1.7,
      alpha: 0,
      y: sprite.y - 30,
      duration: 250,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.disableBody(true, true),
    })
    this.emitHud(true)
  }

  private defeatEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    this.cancelGearwingDroneAttack(enemy)
    const body = enemy.body as Phaser.Physics.Arcade.Body
    body.enable = false
    enemy.setVelocity(0, 0)
    enemy.clearTint()
    enemy.play(this.getEnemyAnimation(this.getEnemyKind(enemy), 'defeated'), true)
    this.playSound('enemy-defeat')
    this.addDustPuff(enemy.x, enemy.y - 28)
  }

  private updateHeroAnimation(time: number, moving: boolean, onFloor: boolean, crouching: boolean) {
    if (!this.player) return

    if (time < this.state.player.attackingUntil) return

    if (!onFloor) {
      if (this.player.anims.currentAnim?.key !== 'runner-jump') {
        this.player.play('runner-jump', true)
      }
      return
    }

    if (crouching) {
      if (moving) {
        if (this.player.anims.currentAnim?.key !== 'runner-run') {
          this.player.play('runner-run', true)
        }
      } else if (this.player.anims.currentAnim?.key !== 'runner-idle') {
        this.player.play('runner-idle', true)
      }
      return
    }

    if (moving) {
      if (this.player.anims.currentAnim?.key !== 'runner-run') {
        this.player.play('runner-run', true)
      }
      return
    }

    if (this.player.anims.currentAnim?.key !== 'runner-idle') {
      this.player.play('runner-idle', true)
    }
  }

  private updateBoostAura(time: number) {
    if (!this.player || !this.boostAura) return

    const active = isShadowRunnerBoostActive(this.state, time)
    this.boostAura.setVisible(active)

    if (!active) return

    this.boostAura.setPosition(this.player.x, this.player.y - 54)
    this.boostAura.setFlipX(this.player.flipX)
    this.boostAura.setScale(0.86 + Math.sin(time / 180) * 0.04)
    this.boostAura.setAlpha(0.58 + Math.sin(time / 120) * 0.12)
  }

  private updateShieldAura(time: number) {
    if (!this.player || !this.shieldAura) return

    const active = isShadowRunnerShieldActive(this.state, time) && this.state.player.shieldGuardCharges > 0
    this.shieldAura.setVisible(active)
    this.shieldAura.clear()

    if (!active) return

    const pulse = 1 + Math.sin(time / 130) * 0.035
    this.shieldAura.lineStyle(3, 0x8ad7ff, 0.72)
    this.shieldAura.strokeEllipse(this.player.x, this.player.y - 44, 74 * pulse, 92 * pulse)
    this.shieldAura.lineStyle(1, 0xf0d381, 0.56)
    this.shieldAura.strokeEllipse(this.player.x, this.player.y - 44, 86 * pulse, 102 * pulse)
  }

  private updateChronoAura(time: number) {
    if (!this.player || !this.chronoAura) return

    const active = isShadowRunnerChronoActive(this.state, time)
    this.chronoAura.setVisible(active)
    this.chronoAura.clear()

    if (!active) return

    const pulse = 1 + Math.sin(time / 150) * 0.05
    this.chronoAura.lineStyle(2, 0x70e8ff, 0.72)
    this.chronoAura.strokeCircle(this.player.x, this.player.y - 46, 46 * pulse)
    this.chronoAura.lineStyle(1, 0xf0d381, 0.5)
    this.chronoAura.strokeCircle(this.player.x, this.player.y - 46, 55 * pulse)
    this.chronoAura.fillStyle(0x70e8ff, 0.14)
    this.chronoAura.fillCircle(this.player.x, this.player.y - 46, 40 * pulse)
  }

  private updateSurgeAura(time: number) {
    if (!this.player || !this.surgeAura) return

    const active = isShadowRunnerSurgeActive(this.state, time)
    this.surgeAura.setVisible(active)
    this.surgeAura.clear()

    if (!active) return

    const pulse = 1 + Math.sin(time / 90) * 0.045
    this.surgeAura.lineStyle(3, 0xf0d381, 0.62)
    this.surgeAura.strokeCircle(this.player.x, this.player.y - 46, 47 * pulse)
    this.surgeAura.lineStyle(2, 0xa9efff, 0.66)
    this.surgeAura.strokeEllipse(this.player.x, this.player.y - 46, 78 * pulse, 96 * pulse)
    this.surgeAura.fillStyle(0x70e8ff, 0.1)
    this.surgeAura.fillEllipse(this.player.x, this.player.y - 46, 62 * pulse, 82 * pulse)
  }

  private updateWraithlight(time: number) {
    if (!this.player || !this.wraithlightAura) return

    const active = isShadowRunnerWraithlightActive(this.state, time)
    this.spectralGrace = updateShadowRunnerSpectralGrace(
      this.spectralGrace,
      active,
      this.state.player.wraithlightActiveUntil,
      time,
      this.getSupportedSpectralPlatformId(),
    )

    this.spectralPlatforms.forEach(platform => {
      const graceActive = this.spectralGrace.platformId === platform.config.id
      platform.visual.setAlpha(active ? 0.94 : graceActive ? 0.58 : 0.2)
      const body = platform.collider?.body as Phaser.Physics.Arcade.StaticBody | undefined
      if (body) body.enable = active || graceActive
    })

    this.masteryPickups?.getChildren().forEach(child => {
      const cache = child as Phaser.Physics.Arcade.Sprite
      if (cache.getData('collected') || cache.getData('requiredPower') !== 'wraithlight') return
      cache.setAlpha(active ? 1 : 0.16)
      const body = cache.body as Phaser.Physics.Arcade.StaticBody
      body.enable = active
    })

    this.wraithlightAura.setVisible(active)
    this.wraithlightAura.clear()
    if (!active) return

    const pulse = 1 + Math.sin(time / 130) * 0.05
    this.wraithlightAura.lineStyle(2, 0x75ffd2, 0.62)
    this.wraithlightAura.strokeCircle(this.player.x, this.player.y - 44, 48 * pulse)
    this.wraithlightAura.fillStyle(0x43d9bd, 0.08)
    this.wraithlightAura.fillCircle(this.player.x, this.player.y - 44, 42 * pulse)
  }

  private getSupportedSpectralPlatformId() {
    if (!this.player) return null

    const body = this.player.body as Phaser.Physics.Arcade.Body
    if (!body.enable || !(body.blocked.down || body.touching.down) || body.velocity.y < 0) return null
    return this.spectralPlatforms.find(platform => {
      const rect = platform.config
      const platformBody = platform.collider?.body as Phaser.Physics.Arcade.StaticBody | undefined
      return platformBody?.enable
        && body.right > rect.x && body.left < rect.x + rect.width
        && Math.abs(body.bottom - rect.y) <= 2
    })?.config.id ?? null
  }

  private updateMirrorWardAura(time: number) {
    if (!this.player || !this.mirrorWardAura) return

    const active = isShadowRunnerMirrorWardActive(this.state, time)
    this.mirrorWardAura.setVisible(active)
    this.mirrorWardAura.clear()
    if (!active) return

    const pulse = 1 + Math.sin(time / 105) * 0.04
    this.mirrorWardAura.lineStyle(3, 0xeefcff, 0.78)
    this.mirrorWardAura.strokeEllipse(this.player.x, this.player.y - 44, 78 * pulse, 98 * pulse)
    this.mirrorWardAura.lineStyle(2, 0x75ffd2, 0.58)
    this.mirrorWardAura.strokeEllipse(this.player.x, this.player.y - 44, 88 * pulse, 108 * pulse)
  }

  private updateGaleMantleAura(time: number) {
    if (!this.player || !this.galeMantleAura) return

    const active = isShadowRunnerGaleMantleActive(this.state, time)
    this.updatePowerGatedMastery('gale-mantle', active)
    this.galeMantleAura.setVisible(active)
    this.galeMantleAura.clear()
    if (!active) return

    const pulse = 1 + Math.sin(time / 95) * 0.05
    this.galeMantleAura.lineStyle(3, 0x9be8ff, 0.7)
    this.galeMantleAura.strokeEllipse(this.player.x, this.player.y - 44, 82 * pulse, 104 * pulse)
    this.galeMantleAura.lineStyle(1, 0xf4fbff, 0.52)
    this.galeMantleAura.strokeEllipse(this.player.x - 8, this.player.y - 44, 98 * pulse, 76 * pulse)
  }

  private updateSunsteelEdgeAura(time: number) {
    if (!this.player || !this.sunsteelEdgeAura) return

    const active = isShadowRunnerSunsteelEdgeActive(this.state, time)
    this.updatePowerGatedMastery('sunsteel-edge', active)
    this.sunsteelEdgeAura.setVisible(active)
    this.sunsteelEdgeAura.clear()
    if (!active) return

    const pulse = 1 + Math.sin(time / 88) * 0.045
    const facing = this.state.player.facing
    this.sunsteelEdgeAura.lineStyle(4, 0xffcb4f, 0.84)
    this.sunsteelEdgeAura.lineBetween(
      this.player.x + facing * 16,
      this.player.y - 66,
      this.player.x + facing * 64 * pulse,
      this.player.y - 34,
    )
    this.sunsteelEdgeAura.lineStyle(2, 0xfff1b4, 0.62)
    this.sunsteelEdgeAura.strokeCircle(this.player.x, this.player.y - 44, 42 * pulse)
  }

  private updateDawnfireAegisAura(time: number) {
    if (!this.player || !this.dawnfireAegisAura) return

    const active = isShadowRunnerDawnfireAegisActive(this.state, time)
    this.updatePowerGatedMastery('dawnfire-aegis', active)
    this.dawnfireAegisAura.setVisible(active)
    this.dawnfireAegisAura.clear()
    if (!active) return

    const pulse = 1 + Math.sin(time / 92) * 0.045
    this.dawnfireAegisAura.lineStyle(4, 0xffd56a, 0.86)
    this.dawnfireAegisAura.strokeEllipse(this.player.x, this.player.y - 44, 82 * pulse, 108 * pulse)
    this.dawnfireAegisAura.lineStyle(2, 0xff7a36, 0.7)
    this.dawnfireAegisAura.strokeCircle(this.player.x, this.player.y - 44, 48 * pulse)
  }

  private updateAetherStepAura(time: number) {
    if (!this.player || !this.aetherStepAura) return

    const active = isShadowRunnerAetherStepActive(this.state, time)
    this.updatePowerGatedMastery('aether-step', active)
    this.aetherStepAura.setVisible(active)
    this.aetherStepAura.clear()
    if (!active) return

    const pulse = 1 + Math.sin(time / 82) * 0.05
    this.aetherStepAura.lineStyle(3, 0x8ff8ff, 0.76)
    this.aetherStepAura.strokeEllipse(this.player.x, this.player.y - 28, 76 * pulse, 36 * pulse)
    this.aetherStepAura.lineStyle(2, 0xd6ffff, 0.54)
    this.aetherStepAura.strokeEllipse(this.player.x, this.player.y - 18, 98 * pulse, 28 * pulse)
  }

  private updatePowerGatedMastery(
    requiredPower: 'gale-mantle' | 'sunsteel-edge' | 'dawnfire-aegis' | 'aether-step',
    active: boolean,
  ) {
    this.masteryPickups?.getChildren().forEach(child => {
      const pickup = child as Phaser.Physics.Arcade.Sprite
      if (pickup.getData('collected') || pickup.getData('requiredPower') !== requiredPower) return
      pickup.setAlpha(active ? 1 : 0.16)
      const body = pickup.body as Phaser.Physics.Arcade.StaticBody
      body.enable = active
    })
  }

  private updateHealthBars() {
    this.enemies.forEach((enemy, index) => {
      const enemyState = this.getEnemyState(enemy)
      const healthBar = this.enemyHealthBars[index]
      const healthFrame = this.enemyHealthFrames[index]

      if (enemyState?.alive && enemyState.activated) {
        this.drawHealthBar(healthBar, healthFrame, enemy.x, enemy.y - 74, enemyState.health, enemyState.maxHealth)
      } else {
        healthBar?.clear()
        healthFrame?.setVisible(false)
      }
    })
  }

  private drawHealthBar(
    graphics: Phaser.GameObjects.Graphics | undefined,
    frame: Phaser.GameObjects.Image | undefined,
    x: number,
    y: number,
    health: number,
    maxHealth: number,
  ) {
    if (!graphics) return

    const width = 58
    const height = 7
    const ratio = maxHealth > 0 ? Phaser.Math.Clamp(health / maxHealth, 0, 1) : 0

    frame?.setVisible(true)
    frame?.setPosition(x, y)
    frame?.setDisplaySize(74, 18)
    frame?.setDepth(34)

    graphics.clear()
    graphics.setDepth(35)
    graphics.fillStyle(0x170305, 0.95)
    graphics.fillRect(x - width / 2, y - height / 2, width, height)

    if (ratio > 0) {
      graphics.fillStyle(0xe21d2f, 0.98)
      graphics.fillRect(x - width / 2, y - height / 2, width * ratio, height)
      graphics.fillStyle(0xff6b61, 0.78)
      graphics.fillRect(x - width / 2 + 1, y - height / 2 + 1, Math.max(0, width * ratio - 2), 1)
    }
  }

  private checkFinish() {
    if (!this.player || this.state.defeated || this.state.outOfLives || this.respawnPending
      || this.runtimeDisposed || this.gameplayPaused || this.deliveryState === 'igniting') return

    const finish = this.level.finish
    const body = this.player.body as Phaser.Physics.Arcade.Body
    const overlapsFinish = isShadowRunnerFinishOverlap(body, finish, { fallRespawnPending: this.respawnPending })

    if (!overlapsFinish && this.deliveryState === 'ready') {
      this.deliveryState = 'locked'
      this.deliveryRequested = false
      this.deliveryFlame?.setVisible(false)
      this.state.objective = this.level.objective
    }

    if (overlapsFinish) {
      const totalObjectiveItems = this.level.objectivePickups?.length ?? 0
      const requiredEnemy = (this.level.requiredEnemyIds ?? [])
        .map(enemyId => this.state.enemies.find(enemy => enemy.id === enemyId))
        .find(enemy => enemy?.alive)
      if (totalObjectiveItems > 0 && this.state.player.objectiveItems < totalObjectiveItems) {
        const label = this.level.objectiveLabel ?? 'Objectives'
        const requirement = requiredEnemy
          ? this.level.finishRequirementText?.missingObjectivesAndEnemies
          : this.level.finishRequirementText?.missingObjectives
        this.state.objective = requirement ?? `${label} ${this.state.player.objectiveItems}/${totalObjectiveItems}`
        if (!this.finishSparked) {
          this.finishSparked = true
          this.showCheckpointToast(this.state.objective)
          this.addHitFlash(finish.x + finish.width / 2, finish.y + 42)
        }
        this.emitHud(true)
        return
      }

      if (requiredEnemy) {
        this.state.objective = this.level.finishRequirementText?.missingRequiredEnemies
          ?? (this.level.id === 'level-8' ? 'Defeat the Rival Courier' : 'Defeat the required enemy')
        if (!this.finishSparked) {
          this.finishSparked = true
          this.showCheckpointToast(this.state.objective)
          this.addHitFlash(finish.x + finish.width / 2, finish.y + 42)
        }
        this.emitHud(true)
        return
      }

      const totalMoonShards = this.level.moonShardPickups?.length ?? 0
      if (totalMoonShards > 0 && this.state.player.moonShards < totalMoonShards) {
        this.state.objective = `Moon Shards ${this.state.player.moonShards}/${totalMoonShards}`
        if (!this.finishSparked) {
          this.finishSparked = true
          this.showCheckpointToast(`Moon Shards ${this.state.player.moonShards}/${totalMoonShards}`)
          this.addHitFlash(finish.x + finish.width / 2, finish.y + 42)
        }
        this.emitHud(true)
        return
      }

      if (this.level.finishInteraction === 'ignite-relay') {
        const supported = (body.blocked.down || body.touching.down) && Math.abs(body.velocity.y) <= 24
        if (!supported) {
          this.deliveryState = 'locked'
          this.deliveryRequested = false
          this.deliveryFlame?.setVisible(false)
          return
        }
        if (this.deliveryState !== 'ready') {
          this.deliveryState = 'ready'
          this.deliveryRequested = false
          this.clearCheckpointToast()
          this.deliveryFlame?.setVisible(true).setAlpha(0.45).setFrame(0)
          this.state.objective = 'Deliver the true order'
        } else if (this.deliveryRequested) {
          this.deliveryState = 'igniting'
          this.deliveryRequested = false
          this.deliveryStartedAt = this.activeTimeMs
          this.state.objective = 'The relay answers'
          this.state.player.attackingUntil = 0
          this.player.setVelocity(0, 0)
          if (this.crouching && canShadowRunnerStand(body, 70 * HERO_SCALE, this.getSolidBodies())) {
            this.setPlayerStance(false)
          }
          body.enable = false
          this.player.play('runner-idle', true)
          this.finishVisual?.setTint(0xffe5a8)
          this.updateRelayDelivery()
        }
        this.emitHud(true)
        return
      }
      this.completeDelivery()
    }
  }

  private updateRelayDelivery() {
    if (this.deliveryState !== 'igniting' || this.runtimeDisposed || this.gameplayPaused
      || this.respawnPending || this.state.outOfLives) return
    const progress = Math.min(1, Math.max(0, (this.activeTimeMs - this.deliveryStartedAt) / 1400))
    const size = this.reducedMotion ? 128 : 112 + progress * 32
    this.deliveryFlame?.setVisible(true).setAlpha(1).setDisplaySize(size, size)
      .setFrame(this.reducedMotion ? 3 : Math.min(3, Math.floor(progress * 4)))
    if (progress < 1) return
    this.deliveryState = 'delivered'
    this.completeDelivery()
  }

  private completeDelivery() {
    if (this.state.defeated || this.state.outOfLives || this.respawnPending || this.runtimeDisposed || this.gameplayPaused) return
    if (this.level.finishInteraction && this.deliveryState !== 'delivered') return
    const finish = this.level.finish
    const completion = getShadowRunnerHudState(this.state, this.level.coins.length, this.activeTimeMs)
    this.state.defeated = true
    this.state.objective = this.level.completionLine
    this.state.player.score += completion.perfectRoute ? 1200 : completion.fullClear ? 700 : 300
    this.finishSparked = true
    this.playSound('level-complete')
    this.addDustPuff(finish.x + finish.width / 2, finish.y + finish.height - 20)
    this.addCoinSparkle(finish.x + finish.width / 2, finish.y + 38)
    this.emitHud(true)
  }

  private emitHud(force = false) {
    const hud = getShadowRunnerHudState(this.state, this.level.coins.length, this.activeTimeMs)
    if (this.level.finishInteraction) hud.deliveryState = this.deliveryState
    const signature = JSON.stringify(hud)
    if (!force && signature === this.lastHudSignature) return

    this.lastHudSignature = signature
    this.onHudChange(hud)
  }

  private addDustPuff(x: number, y: number) {
    if (this.textures.exists('shadow-runner-landing-dust')) {
      const puff = this.add.sprite(x, y, 'shadow-runner-landing-dust')
      puff.setDepth(18)
      puff.setScale(0.9)
      puff.play('landing-dust')
      puff.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => puff.destroy())
      return
    }

    const puff = this.add.circle(x, y, 8, 0xd6c18a, 0.42)
    puff.setDepth(18)
    this.tweens.add({
      targets: puff,
      scale: 2.4,
      alpha: 0,
      duration: 250,
      ease: 'Quad.easeOut',
      onComplete: () => puff.destroy(),
    })
  }

  private addHitFlash(x: number, y: number) {
    const flash = this.add.image(x, y, 'shadow-runner-hit-spark')
    flash.setDepth(30)
    flash.setDisplaySize(66, 58)
    this.tweens.add({
      targets: flash,
      scale: 1.2,
      alpha: 0,
      rotation: 0.9,
      duration: 190,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    })
  }

  private addCoinSparkle(x: number, y: number) {
    const sparkle = this.add.sprite(x, y, 'shadow-runner-coin-sparkle')
    sparkle.setDepth(18)
    sparkle.setDisplaySize(56, 68)
    sparkle.play('coin-sparkle')
    sparkle.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sparkle.destroy())
  }

  private playSwordSlash() {
    if (!this.player || !this.slashSprite || !this.textures.exists('shadow-runner-sword-slash')) return

    const facing = this.state.player.facing
    this.slashArc?.clear()
    this.slashSprite.setVisible(true)
    this.slashSprite.setPosition(this.player.x + facing * 50, this.player.y - 46)
    this.slashSprite.setFlipX(facing < 0)
    this.slashSprite.setScale(0.86)
    this.slashSprite.play('sword-slash', true)
  }

  private createTextures() {
    if (!this.textures.exists('shadow-runner-stone')) {
      const stone = this.make.graphics({ x: 0, y: 0 })
      stone.fillStyle(0x273342, 1)
      stone.fillRect(0, 0, 48, 24)
      stone.fillStyle(0x3f4e58, 1)
      stone.fillRect(0, 0, 48, 5)
      stone.fillStyle(0x111820, 1)
      stone.fillRect(0, 21, 48, 3)
      stone.lineStyle(2, 0x151b22, 1)
      stone.strokeRect(0, 0, 48, 24)
      stone.generateTexture('shadow-runner-stone', 48, 24)
      stone.destroy()
    }

    if (!this.textures.exists('shadow-runner-tilt-stone')) {
      const tilt = this.make.graphics({ x: 0, y: 0 })
      tilt.fillStyle(0x4a3b2b, 1)
      tilt.fillRect(0, 0, 56, 18)
      tilt.fillStyle(0x7d6342, 1)
      tilt.fillRect(0, 0, 56, 4)
      tilt.lineStyle(2, 0x1b1612, 1)
      tilt.strokeRect(0, 0, 56, 18)
      tilt.generateTexture('shadow-runner-tilt-stone', 56, 18)
      tilt.destroy()
    }

    if (!this.textures.exists('shadow-runner-spike-row')) {
      const spikes = this.make.graphics({ x: 0, y: 0 })
      spikes.fillStyle(0x0b0d12, 1)
      spikes.fillRect(0, 20, 64, 8)
      spikes.fillStyle(0xd9d1bb, 1)
      for (let i = 0; i < 8; i += 1) {
        spikes.fillTriangle(i * 8, 22, i * 8 + 4, 0, i * 8 + 8, 22)
      }
      spikes.generateTexture('shadow-runner-spike-row', 64, 28)
      spikes.destroy()
    }

    if (!this.textures.exists('shadow-runner-arrow')) {
      const arrow = this.make.graphics({ x: 0, y: 0 })
      arrow.fillStyle(0x28170d, 1)
      arrow.fillRect(10, 5, 46, 4)
      arrow.fillStyle(0xe7d8a9, 1)
      arrow.fillTriangle(56, 1, 72, 7, 56, 13)
      arrow.fillStyle(0x8c7041, 1)
      arrow.fillTriangle(12, 7, 0, 1, 4, 7)
      arrow.fillTriangle(12, 7, 0, 13, 4, 7)
      arrow.lineStyle(1, 0x050403, 0.8)
      arrow.strokeRect(10, 5, 46, 4)
      arrow.generateTexture('shadow-runner-arrow', 72, 14)
      arrow.destroy()
    }

    if (!this.textures.exists('shadow-runner-candle-projectile')) {
      const candle = this.make.graphics({ x: 0, y: 0 })
      candle.fillStyle(0xf7e8b1, 1)
      candle.fillRoundedRect(7, 7, 21, 9, 3)
      candle.fillStyle(0x6b4021, 1)
      candle.fillRect(4, 9, 7, 5)
      candle.fillStyle(0xffd33f, 1)
      candle.fillCircle(28, 8, 5)
      candle.fillStyle(0xff6d1f, 0.95)
      candle.fillCircle(30, 8, 3)
      candle.lineStyle(1, 0x2d1609, 0.85)
      candle.strokeRoundedRect(7, 7, 21, 9, 3)
      candle.generateTexture('shadow-runner-candle-projectile', 38, 22)
      candle.destroy()
    }

    if (!this.textures.exists('shadow-runner-candle-flame')) {
      const flame = this.make.graphics({ x: 0, y: 0 })
      flame.fillStyle(0x2d1505, 0.72)
      flame.fillEllipse(18, 44, 34, 10)
      flame.fillStyle(0xff6b20, 0.95)
      flame.fillTriangle(18, 5, 5, 42, 29, 42)
      flame.fillStyle(0xffcf43, 0.95)
      flame.fillTriangle(19, 14, 11, 42, 26, 42)
      flame.fillStyle(0xf8f0b4, 0.95)
      flame.fillTriangle(19, 24, 15, 42, 23, 42)
      flame.generateTexture('shadow-runner-candle-flame', 36, 52)
      flame.destroy()
    }

    if (!this.textures.exists('shadow-runner-shield-pickup')) {
      const shield = this.make.graphics({ x: 0, y: 0 })
      shield.fillStyle(0x132338, 0.98)
      shield.fillRoundedRect(8, 6, 32, 36, 10)
      shield.fillStyle(0x8ad7ff, 0.95)
      shield.fillTriangle(24, 12, 13, 20, 24, 40)
      shield.fillTriangle(24, 12, 35, 20, 24, 40)
      shield.lineStyle(3, 0xf0d381, 0.95)
      shield.strokeRoundedRect(8, 6, 32, 36, 10)
      shield.generateTexture('shadow-runner-shield-pickup', 48, 48)
      shield.destroy()
    }


  }

  private registerTerrainFrames() {
    this.registerTerrainFrameSet('shadow-runner-terrain-atlas', TERRAIN_CROPS)
    this.registerTerrainFrameSet('shadow-runner-ivy-terrain-atlas', IVY_TERRAIN_CROPS)
    this.registerTerrainFrameSet('shadow-runner-bell-terrain-atlas', BELL_TERRAIN_CROPS)
    this.registerTerrainFrameSet('shadow-runner-candle-terrain-atlas', CANDLE_TERRAIN_CROPS)
    this.registerTerrainFrameSet('shadow-runner-candle-readable-terrain-atlas', CANDLE_READABLE_TERRAIN_CROPS)
    this.registerTerrainFrameSet('shadow-runner-clock-terrain-atlas', CLOCK_TERRAIN_CROPS)
    this.registerTerrainFrameSet('shadow-runner-moon-terrain-atlas', MOON_TERRAIN_CROPS)
    this.registerTerrainFrameSet('shadow-runner-catacomb-terrain-atlas', CATACOMB_TERRAIN_CROPS)
    this.registerTerrainFrameSet('shadow-runner-captain-terrain-atlas', CAPTAIN_GATE_TERRAIN_CROPS)
    this.registerTerrainFrameSet('shadow-runner-relay-terrain-atlas', DAWN_RELAY_TERRAIN_CROPS)
  }

  private registerTerrainFrameSet(textureKey: string, crops: Record<string, TextureCrop>) {
    if (!this.textures.exists(textureKey)) return

    const terrainTexture = this.textures.get(textureKey)

    Object.entries(crops).forEach(([platformId, crop]) => {
      const frameKey = getTerrainFrameKey(platformId)
      if (!terrainTexture.has(frameKey)) {
        terrainTexture.add(frameKey, 0, crop.x, crop.y, crop.width, crop.height)
      }
    })
  }
}

export function createShadowRunnerPhaserGame(options: CreateShadowRunnerGameOptions): ShadowRunnerPhaserGameHandle {
  const scene = new ShadowRunnerLevelScene(options)
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: options.parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#02040a',
    pixelArt: true,
    antialias: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      parent: options.parent,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: GRAVITY_Y },
        debug: false,
      },
    },
    scene: [scene],
  })
  return Object.assign(game, {
    setPaused: (paused: boolean) => scene.setPaused(paused),
    setReducedMotion: (reducedMotion: boolean) => scene.setReducedMotion(reducedMotion),
  })
}
