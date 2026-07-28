import Phaser from 'phaser'
import type { ShadowRunnerSoundEvent } from '../audio'
import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import type { ShadowRunnerInputRef } from './input'
import {
  getShadowRunnerLevelConfig,
  getShadowRunnerLevelEnemies,
  getShadowRunnerEnemyContactDamage,
  getShadowRunnerEnemyProjectileDamage,
  isShadowRunnerFinishOverlap,
  type ShadowRunnerArrowVolley,
  type ShadowRunnerBoostPickup,
  type ShadowRunnerChronoPickup,
  type ShadowRunnerEnemyConfig,
  type ShadowRunnerEnemyKind,
  type ShadowRunnerEncounterConfig,
  type ShadowRunnerGaleMantlePickup,
  type ShadowRunnerLevelConfig,
  type ShadowRunnerMasteryPickup,
  type ShadowRunnerMirrorWardPickup,
  type ShadowRunnerMovingPlatform,
  type ShadowRunnerMoonShardPickup,
  type ShadowRunnerObjectivePickup,
  type ShadowRunnerPlayableLevelId,
  type ShadowRunnerShieldPickup,
  type ShadowRunnerSunsteelEdgePickup,
  type ShadowRunnerSurgePickup,
  type ShadowRunnerTiltPlatform,
  type ShadowRunnerWindZone,
  type ShadowRunnerWraithlightPickup,
} from './levels'
import {
  CAPTAIN_GATE_TERRAIN_CROPS,
  CATACOMB_TERRAIN_CROPS,
  SHADOW_RUNNER_ENEMY_RUNTIME,
  getShadowRunnerTerrainRuntime,
} from './runtimeCatalog'
import {
  blockShadowRunnerProjectileWithShield,
  collectShadowRunnerBoost,
  collectShadowRunnerChrono,
  collectShadowRunnerCoin,
  collectShadowRunnerGaleMantle,
  collectShadowRunnerMastery,
  collectShadowRunnerMirrorWard,
  collectShadowRunnerMoonShard,
  collectShadowRunnerObjective,
  collectShadowRunnerShield,
  collectShadowRunnerSunsteelEdge,
  collectShadowRunnerSurge,
  collectShadowRunnerWraithlight,
  createInitialShadowRunnerSimulation,
  consumeShadowRunnerSunsteelCharge,
  damageShadowRunnerEnemy,
  damageShadowRunnerPlayer,
  getShadowRunnerEncounterBarrierState,
  getShadowRunnerGaleFallDamageCap,
  getShadowRunnerGaleSpeedMultiplier,
  getShadowRunnerHudState,
  getShadowRunnerChronoTimeScale,
  getShadowRunnerSurgeSpeedMultiplier,
  getShadowRunnerSunsteelStrikeProperties,
  isShadowRunnerBoostActive,
  isShadowRunnerChronoActive,
  isShadowRunnerGaleMantleActive,
  isShadowRunnerMirrorWardActive,
  isShadowRunnerShieldActive,
  isShadowRunnerSurgeActive,
  isShadowRunnerSunsteelEdgeActive,
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
  onSoundEvent?: (event: ShadowRunnerSoundEvent) => void
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
const TILT_ACTIVE_ROTATION = 0.025
const TILT_DUMP_ROTATION = 0.105
const ARCHER_PROJECTILE_LIFETIME_MS = 2600
const CANDLE_PROJECTILE_LIFETIME_MS = 1700
const CANDLE_HAZARD_LIFETIME_MS = 1450
const STORM_BOMB_LIFETIME_MS = 2600
const STORM_HAZARD_LIFETIME_MS = 1250
const FALL_DAMAGE_DISTANCE = 330
const HEAVY_FALL_DAMAGE_DISTANCE = 500

interface TextureCrop {
  x: number
  y: number
  width: number
  height: number
}

interface ShadowRunnerDebugSnapshot {
  levelId: ShadowRunnerPlayableLevelId
  checkpointId?: string
  objective: string
  player?: {
    x: number
    y: number
    velocityX: number
    velocityY: number
    bodyTop: number
    bodyBottom: number
    bodyHeight: number
    crouchInput: boolean
    health: number
    lives: number
    coins: number
    score: number
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
  }>
}

type ShadowRunnerDebugWindow = Window & typeof globalThis & {
  __shadowRunnerDebug?: () => ShadowRunnerDebugSnapshot
  __shadowRunnerQa?: {
    teleport: (x: number, y: number) => void
    restore: () => void
    damage: (amount: number) => void
    collect: (
      kind: 'wraithlight' | 'mirrorWard' | 'galeMantle' | 'sunsteelEdge' | 'objective' | 'mastery',
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
  collider?: Phaser.GameObjects.Rectangle
  fallThroughUntil?: number
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

interface MovingPlatformRuntime {
  config: ShadowRunnerMovingPlatform
  visual: PlatformVisual
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
  const displayHeight = options.displayHeight ?? rect.height
  const visualY = centerY + (options.visualOffsetY ?? 0)
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
  private readonly onReady?: () => void
  private readonly onSoundEvent?: (event: ShadowRunnerSoundEvent) => void

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
  private movingPlatforms: MovingPlatformRuntime[] = []
  private windZones: WindZoneRuntime[] = []
  private encounterBarrierRuntimes: EncounterBarrierRuntime[] = []
  private clearedEncounterIds = new Set<string>()
  private arrowVolleys: ArrowVolleyRuntime[] = []
  private boostAura?: Phaser.GameObjects.Sprite
  private shieldAura?: Phaser.GameObjects.Graphics
  private chronoAura?: Phaser.GameObjects.Graphics
  private surgeAura?: Phaser.GameObjects.Graphics
  private wraithlightAura?: Phaser.GameObjects.Graphics
  private mirrorWardAura?: Phaser.GameObjects.Graphics
  private galeMantleAura?: Phaser.GameObjects.Graphics
  private sunsteelEdgeAura?: Phaser.GameObjects.Graphics
  private playerHealthBar?: Phaser.GameObjects.Graphics
  private enemyHealthBars: Phaser.GameObjects.Graphics[] = []
  private playerHealthFrame?: Phaser.GameObjects.Image
  private enemyHealthFrames: Phaser.GameObjects.Image[] = []
  private slashArc?: Phaser.GameObjects.Graphics
  private slashSprite?: Phaser.GameObjects.Sprite
  private readonly qaEnabled = isShadowRunnerLocalQaEnabled()
  private lastJumpPresses = 0
  private lastAttackPresses = 0
  private jumpsUsed = 0
  private wasOnFloor = false
  private finishSparked = false
  private fallRespawnPending = false
  private activeCheckpointIndex = -1
  private checkpointToast?: Phaser.GameObjects.Text
  private respawnPoint: { x: number; y: number }
  private lastHudSignature = ''
  private activeTiltPlatformId: string | null = null
  private activeTiltStartedAt = 0
  private airborneStartY: number | null = null
  private airbornePeakY = 0
  private lastAirborneVelocityY = 0

  constructor(options: Omit<CreateShadowRunnerGameOptions, 'parent'>) {
    super('ShadowRunnerLevelScene')
    this.controls = options.input
    this.level = getShadowRunnerLevelConfig(options.levelId ?? 'tutorial')
    this.respawnPoint = { ...this.level.playerStart }
    this.state = createInitialShadowRunnerSimulation(this.level)
    this.onHudChange = options.onHudChange
    this.onReady = options.onReady
    this.onSoundEvent = options.onSoundEvent
  }

  preload() {
    this.load.image('shadow-runner-bg', this.level.backgroundAsset)
    this.load.spritesheet('shadow-runner-idle', SHADOW_RUNNER_ASSETS.hero.menuIdleCapeStrip, {
      frameWidth: 128,
      frameHeight: 128,
    })
    this.load.spritesheet('shadow-runner-run', SHADOW_RUNNER_ASSETS.hero.runStrip, {
      frameWidth: 128,
      frameHeight: 128,
    })
    this.load.spritesheet('shadow-runner-jump', SHADOW_RUNNER_ASSETS.hero.jumpAirStrip, {
      frameWidth: 128,
      frameHeight: 128,
    })
    this.load.spritesheet('shadow-runner-attack', SHADOW_RUNNER_ASSETS.hero.swordAttackStrip, {
      frameWidth: 128,
      frameHeight: 128,
    })
    this.load.spritesheet('clockwork-sentry', SHADOW_RUNNER_ASSETS.enemies.clockworkSentryStrip, {
      frameWidth: 128,
      frameHeight: 128,
    })
    this.load.spritesheet('barrel-roller', SHADOW_RUNNER_ASSETS.enemies.barrelRollerStrip, {
      frameWidth: 128,
      frameHeight: 128,
    })
    this.load.spritesheet('scroll-thief', SHADOW_RUNNER_ASSETS.enemies.scrollThiefStrip, {
      frameWidth: 128,
      frameHeight: 128,
    })
    this.load.spritesheet('tower-archer', SHADOW_RUNNER_ASSETS.enemies.towerArcherStrip, {
      frameWidth: 128,
      frameHeight: 128,
    })
    this.load.spritesheet('candle-jester', SHADOW_RUNNER_ASSETS.enemies.candleJesterStrip, {
      frameWidth: 128,
      frameHeight: 128,
    })
    this.load.image('shadow-runner-terrain-atlas', SHADOW_RUNNER_ASSETS.level.terrainAtlas)
    this.load.image('shadow-runner-ivy-terrain-atlas', SHADOW_RUNNER_ASSETS.levels.ivyViaductTerrainHazards)
    this.load.image('shadow-runner-bell-terrain-atlas', SHADOW_RUNNER_ASSETS.levels.bellTowerPropsHazards)
    this.load.image('shadow-runner-candle-terrain-atlas', SHADOW_RUNNER_ASSETS.levels.candleFairPropsHazards)
    this.load.image('shadow-runner-candle-readable-terrain-atlas', SHADOW_RUNNER_ASSETS.levels.candleFairTerrainReadable)
    this.load.image('shadow-runner-tilt-bridge', SHADOW_RUNNER_ASSETS.level.tiltBridge256)
    this.load.spritesheet('shadow-runner-coin', SHADOW_RUNNER_ASSETS.level.coinStrip48, {
      frameWidth: 48,
      frameHeight: 48,
    })
    this.load.spritesheet('shadow-runner-moonheart', SHADOW_RUNNER_ASSETS.levels.moonheartCrestStrip, {
      frameWidth: 64,
      frameHeight: 64,
    })
    this.load.spritesheet('shadow-runner-boost-aura', SHADOW_RUNNER_ASSETS.levels.boostAuraStrip, {
      frameWidth: 128,
      frameHeight: 128,
    })
    if (this.level.id === 'level-6' || this.level.id === 'level-7' || this.level.id === 'level-8') {
      this.load.spritesheet('lantern-bandit-scout', SHADOW_RUNNER_ASSETS.enemies.lanternBanditScoutStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
    }
    if (this.level.id === 'level-6') {
      this.load.image('shadow-runner-clock-terrain-atlas', SHADOW_RUNNER_ASSETS.levels.clockmakerYardProps)
      this.load.spritesheet('shadow-runner-chrono-lantern', SHADOW_RUNNER_ASSETS.levels.chronoLanternStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
    }
    if (this.level.id === 'level-7') {
      this.load.spritesheet('moon-stalker', SHADOW_RUNNER_ASSETS.enemies.moonStalkerStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
      this.load.image('shadow-runner-moon-terrain-atlas', SHADOW_RUNNER_ASSETS.levels.moonlitCausewayProps)
      this.load.spritesheet('shadow-runner-chrono-lantern', SHADOW_RUNNER_ASSETS.levels.chronoLanternStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-shadow-surge', SHADOW_RUNNER_ASSETS.levels.shadowSurgeSigilStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-moon-shard', SHADOW_RUNNER_ASSETS.levels.moonShardRelicStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
    }
    if (this.level.id === 'level-8') {
      this.load.spritesheet('moon-stalker', SHADOW_RUNNER_ASSETS.enemies.moonStalkerStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
      this.load.spritesheet('tomb-lurker', SHADOW_RUNNER_ASSETS.enemies.tombLurkerStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
      this.load.spritesheet('crypt-warden', SHADOW_RUNNER_ASSETS.enemies.cryptWardenStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
      this.load.spritesheet('rival-courier', SHADOW_RUNNER_ASSETS.enemies.rivalCourierStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
      this.load.image('shadow-runner-catacomb-terrain-atlas', SHADOW_RUNNER_ASSETS.levels.courierCatacombsProps)
      this.load.spritesheet('shadow-runner-chrono-lantern', SHADOW_RUNNER_ASSETS.levels.chronoLanternStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-shadow-surge', SHADOW_RUNNER_ASSETS.levels.shadowSurgeSigilStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-wraithlight', SHADOW_RUNNER_ASSETS.levels.wraithlightLanternStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-mirror-ward', SHADOW_RUNNER_ASSETS.levels.mirrorWardStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-relay-seal', SHADOW_RUNNER_ASSETS.levels.relaySealStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-courier-cache', SHADOW_RUNNER_ASSETS.levels.courierCacheStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
    }
    if (this.level.id === 'level-9') {
      this.load.spritesheet('moon-stalker', SHADOW_RUNNER_ASSETS.enemies.moonStalkerStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
      this.load.spritesheet('tomb-lurker', SHADOW_RUNNER_ASSETS.enemies.tombLurkerStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
      this.load.spritesheet('crypt-warden', SHADOW_RUNNER_ASSETS.enemies.cryptWardenStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
      this.load.spritesheet('rival-courier', SHADOW_RUNNER_ASSETS.enemies.rivalCourierStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
      this.load.spritesheet('gate-pikeman', SHADOW_RUNNER_ASSETS.enemies.gatePikemanStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
      this.load.spritesheet('storm-grenadier', SHADOW_RUNNER_ASSETS.enemies.stormGrenadierStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
      this.load.spritesheet('watch-captain', SHADOW_RUNNER_ASSETS.enemies.watchCaptainStrip, {
        frameWidth: 128,
        frameHeight: 128,
      })
      this.load.image('shadow-runner-captain-terrain-atlas', SHADOW_RUNNER_ASSETS.levels.captainGateProps)
      this.load.spritesheet('shadow-runner-chrono-lantern', SHADOW_RUNNER_ASSETS.levels.chronoLanternStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-shadow-surge', SHADOW_RUNNER_ASSETS.levels.shadowSurgeSigilStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-wraithlight', SHADOW_RUNNER_ASSETS.levels.wraithlightLanternStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-mirror-ward', SHADOW_RUNNER_ASSETS.levels.mirrorWardStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-gale-mantle', SHADOW_RUNNER_ASSETS.levels.galeMantleStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-sunsteel-edge', SHADOW_RUNNER_ASSETS.levels.sunsteelEdgeStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-watchfire-crest', SHADOW_RUNNER_ASSETS.levels.watchfireCrestStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-captains-orders', SHADOW_RUNNER_ASSETS.levels.captainsOrdersStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
      this.load.spritesheet('shadow-runner-storm-bomb', SHADOW_RUNNER_ASSETS.levels.stormBombStrip, {
        frameWidth: 64,
        frameHeight: 64,
      })
    }
    this.load.image('shadow-runner-spike-row', SHADOW_RUNNER_ASSETS.level.spikeRow64)
    this.load.image('shadow-runner-east-gate', SHADOW_RUNNER_ASSETS.level.eastGate96)
    this.load.spritesheet('shadow-runner-landing-dust', SHADOW_RUNNER_ASSETS.level.landingDustStrip, {
      frameWidth: 64,
      frameHeight: 64,
    })
    this.load.spritesheet('shadow-runner-sword-slash', SHADOW_RUNNER_ASSETS.level.swordSlashStrip, {
      frameWidth: 96,
      frameHeight: 96,
    })
    this.load.image('shadow-runner-health-frame', SHADOW_RUNNER_ASSETS.gameplay.healthBarFrame)
    this.load.image('shadow-runner-hit-spark', SHADOW_RUNNER_ASSETS.gameplay.hitSpark)
    this.load.spritesheet('shadow-runner-coin-sparkle', SHADOW_RUNNER_ASSETS.gameplay.coinSparkleStrip, {
      frameWidth: 119,
      frameHeight: 145,
    })
  }

  create() {
    this.state = createInitialShadowRunnerSimulation(this.level)
    this.enemies = []
    this.enemyHealthBars = []
    this.enemyHealthFrames = []
    this.tiltPlatforms = []
    this.spectralPlatforms = []
    this.movingPlatforms = []
    this.windZones = []
    this.arrowVolleys = []
    this.boostAura = undefined
    this.shieldAura = undefined
    this.chronoAura = undefined
    this.surgeAura = undefined
    this.wraithlightAura = undefined
    this.mirrorWardAura = undefined
    this.galeMantleAura = undefined
    this.sunsteelEdgeAura = undefined
    this.wasOnFloor = false
    this.airborneStartY = null
    this.airbornePeakY = 0
    this.lastAirborneVelocityY = 0
    this.fallRespawnPending = false
    this.activeCheckpointIndex = -1
    this.checkpointToast = undefined
    this.clearedEncounterIds.clear()
    this.respawnPoint = { ...this.level.playerStart }
    this.finishSparked = false
    this.physics.world.setBounds(0, 0, this.level.worldWidth, this.level.worldHeight)
    this.createTextures()
    this.registerTerrainFrames()
    this.createBackground()
    this.createAnimations()
    this.createLevel()
    this.createActors()
    this.createInput()
    if (this.qaEnabled) {
      this.registerQaDebugSnapshot()
    }

    this.cameras.main.setBounds(0, 0, this.level.worldWidth, this.level.worldHeight)
    this.cameras.main.startFollow(this.player!, true, 0.12, 0.12, -110, 52)
    this.cameras.main.setDeadzone(190, 92)

    this.emitHud(true)
    this.onReady?.()
  }

  update(time: number) {
    if (!this.player) return

    this.updatePlayer(time)
    this.updateMovingPlatforms(time)
    this.updateCheckpointProgress()
    this.updateEncounterActivations(time)
    this.updateEnemies(time)
    this.updateEncounterBarriers()
    this.updateArrowVolleys(time)
    this.updateArcherProjectiles(time)
    this.updateCandleHazards(time)
    this.updateWindZones(time)
    this.updateBoostAura(time)
    this.updateShieldAura(time)
    this.updateChronoAura(time)
    this.updateSurgeAura(time)
    this.updateWraithlight(time)
    this.updateMirrorWardAura(time)
    this.updateGaleMantleAura(time)
    this.updateSunsteelEdgeAura(time)
    this.updateHealthBars()
    this.checkFinish()
    this.emitHud()
  }

  private createBackground() {
    const sky = this.add.image(0, 0, 'shadow-runner-bg')
    sky.setOrigin(0)
    sky.setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
    sky.setScrollFactor(0)

    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02040a, 0.2)
    shade.setOrigin(0)
    shade.setScrollFactor(0)

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
    this.anims.create({
      key: 'coin-spin',
      frames: this.anims.generateFrameNumbers('shadow-runner-coin', { start: 0, end: 7 }),
      frameRate: 10,
      repeat: -1,
    })
    this.anims.create({
      key: 'moonheart-spin',
      frames: this.anims.generateFrameNumbers('shadow-runner-moonheart', { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    })
    this.anims.create({
      key: 'boost-aura',
      frames: this.anims.generateFrameNumbers('shadow-runner-boost-aura', { start: 0, end: 3 }),
      frameRate: 9,
      repeat: -1,
    })
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
    this.objectivePickups = this.physics.add.staticGroup()
    this.masteryPickups = this.physics.add.staticGroup()
    this.candleHazards = this.physics.add.staticGroup({ maxSize: 24 })
    this.crouchGates = this.physics.add.staticGroup()
    this.encounterBarriers = this.physics.add.staticGroup()

    this.level.platforms.forEach(platform => {
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
    })

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

    this.level.encounters
      ?.filter(encounter => encounter.sealed)
      .forEach(encounter => {
        this.createEncounterBarrier(encounter, encounter.x - 34)
        this.createEncounterBarrier(encounter, encounter.x + encounter.width - 34)
      })

    this.level.tiltPlatforms.forEach((platform, index) => {
      const customTerrain = getShadowRunnerTerrainRuntime(platform.terrainSet)
      const customFrame = getTerrainFrameKey(platform.visualId ?? platform.id)
      const hasCustomTilt = this.textures.exists(customTerrain.textureKey)
        && this.textures.get(customTerrain.textureKey).has(customFrame)
      const hasTiltAsset = this.textures.exists('shadow-runner-tilt-bridge')
      const wobbleRotation = platform.wobbleRotation ?? 0.08
      const sprite = addStaticPlatform(this, this.platforms!, platform, hasCustomTilt
        ? {
            texture: customTerrain.textureKey,
            frame: customFrame,
            useImage: true,
            displayWidth: platform.width + 24,
            displayHeight: platform.visualHeight ?? 66,
            visualOffsetY: platform.visualOffsetY ?? -12,
            depth: 5,
          }
        : hasTiltAsset
          ? {
            texture: 'shadow-runner-tilt-bridge',
            useImage: true,
            displayWidth: platform.width + 18,
            displayHeight: platform.visualHeight ?? 54,
            visualOffsetY: platform.visualOffsetY ?? -10,
            depth: 4,
            }
          : { texture: 'shadow-runner-tilt-stone' })
      const startRotation = index % 2 === 0 ? -0.05 : 0.05
      sprite.setData('tilt-platform', true)
      sprite.setData('baseRotation', startRotation)
      sprite.setData('currentRotation', startRotation)
      sprite.setRotation(startRotation)
      this.tiltPlatforms.push({
        config: platform,
        visual: sprite,
        collider: sprite.getData('platformCollider') as Phaser.GameObjects.Rectangle | undefined,
      })
      this.tweens.add({
        targets: sprite,
        rotation: index % 2 === 0 ? wobbleRotation : -wobbleRotation,
        duration: platform.wobbleDurationMs ?? 1150,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
        onUpdate: () => {
          sprite.setData('currentRotation', sprite.rotation)
        },
      })
    })

    this.level.movingPlatforms?.forEach(platform => {
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
            displayHeight: Math.max(56, platform.height + 28),
            visualOffsetY: -10,
            depth: 8,
          }
        : { texture: 'shadow-runner-stone', depth: 8 })
      this.movingPlatforms.push({
        config: platform,
        visual,
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

    this.arrowVolleys = (this.level.arrowVolleys ?? []).map(config => ({
      config,
      nextShotAt: 0,
      armed: false,
    }))

    this.level.boosts?.forEach((boost, index) => {
      const boostSprite = this.boostPickups!.create(boost.x, boost.y, 'shadow-runner-moonheart') as Phaser.Physics.Arcade.Sprite
      boostSprite.setName(boost.id)
      boostSprite.setScale(0.82)
      boostSprite.setCircle(18, 14, 14)
      boostSprite.setImmovable(true)
      boostSprite.setDepth(14)
      boostSprite.setData('collected', false)
      boostSprite.play('moonheart-spin')
      this.tweens.add({
        targets: boostSprite,
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
      shieldSprite.setCircle(16, 8, 8)
      shieldSprite.setImmovable(true)
      shieldSprite.setDepth(15)
      shieldSprite.setData('collected', false)
      this.tweens.add({
        targets: shieldSprite,
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
      chronoSprite.setCircle(18, 14, 14)
      chronoSprite.setImmovable(true)
      chronoSprite.setDepth(16)
      chronoSprite.setData('collected', false)
      chronoSprite.play('chrono-lantern-spin')
      this.tweens.add({
        targets: chronoSprite,
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
      surgeSprite.setCircle(18, 14, 14)
      surgeSprite.setImmovable(true)
      surgeSprite.setDepth(17)
      surgeSprite.setData('collected', false)
      surgeSprite.play('shadow-surge-spin')
      this.tweens.add({
        targets: surgeSprite,
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
      shardSprite.setCircle(18, 14, 14)
      shardSprite.setImmovable(true)
      shardSprite.setDepth(18)
      shardSprite.setData('collected', false)
      shardSprite.play('moon-shard-glow')
      this.tweens.add({
        targets: shardSprite,
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
      sprite.setCircle(18, 14, 14)
      sprite.setImmovable(true)
      sprite.setDepth(18)
      sprite.setData('collected', false)
      sprite.play('wraithlight-pulse')
      this.tweens.add({
        targets: sprite,
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
      sprite.setCircle(18, 14, 14)
      sprite.setImmovable(true)
      sprite.setDepth(18)
      sprite.setData('collected', false)
      sprite.play('mirror-ward-pulse')
      this.tweens.add({
        targets: sprite,
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
      sprite.setCircle(19, 13, 13)
      sprite.setImmovable(true)
      sprite.setDepth(19)
      sprite.setData('collected', false)
      sprite.play('gale-mantle-pulse')
      this.tweens.add({
        targets: sprite,
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
      sprite.setCircle(19, 13, 13)
      sprite.setImmovable(true)
      sprite.setDepth(20)
      sprite.setData('collected', false)
      sprite.play('sunsteel-edge-pulse')
      this.tweens.add({
        targets: sprite,
        y: pickup.y - 12,
        duration: 640,
        yoyo: true,
        repeat: -1,
        delay: index * 170,
        ease: 'Sine.inOut',
      })
    })

    this.level.objectivePickups?.forEach((pickup, index) => {
      const sprite = this.objectivePickups!.create(
        pickup.x,
        pickup.y,
        this.level.id === 'level-9' ? 'shadow-runner-watchfire-crest' : 'shadow-runner-relay-seal',
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setName(pickup.id)
      sprite.setScale(1.04)
      sprite.setCircle(19, 13, 13)
      sprite.setImmovable(true)
      sprite.setDepth(19)
      sprite.setData('collected', false)
      sprite.play(this.level.id === 'level-9' ? 'watchfire-crest-spin' : 'relay-seal-spin')
      this.tweens.add({
        targets: sprite,
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
        this.level.id === 'level-9' ? 'shadow-runner-captains-orders' : 'shadow-runner-courier-cache',
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setName(pickup.id)
      sprite.setScale(1.02)
      sprite.setCircle(19, 13, 13)
      sprite.setImmovable(true)
      sprite.setDepth(19)
      sprite.setData('collected', false)
      sprite.setData('requiredPower', pickup.requiredPower ?? 'wraithlight')
      sprite.setAlpha(0.16)
      sprite.play(this.level.id === 'level-9' ? 'captains-orders-reveal' : 'courier-cache-reveal')
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
      coinSprite.setCircle(16, 8, 8)
      coinSprite.setImmovable(true)
      coinSprite.setDepth(16)
      coinSprite.setData('collected', false)
      coinSprite.play('coin-spin')
      this.tweens.add({
        targets: coinSprite,
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
        finish.terrainSet === 'captain' ? 230 : finish.terrainSet === 'catacomb' ? 210 : finish.terrainSet === 'moon' ? 156 : 116,
        finish.terrainSet === 'captain' ? 250 : finish.terrainSet === 'catacomb' ? 232 : finish.terrainSet === 'moon' ? 170 : 164,
      )
      gate.setDepth(5)
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
    const terrain = getShadowRunnerTerrainRuntime(captainBarrier ? 'captain' : 'spectral')
    const frame = getTerrainFrameKey(captainBarrier ? 'captain-counterweight-bridge' : 'catacomb-spectral-bridge')
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
    const candleGate = isCandleTerrainSet(gate.terrainSet)
    const readableCandleGate = gate.terrainSet === 'candleBright' || gate.terrainSet === 'candleShelf'
    const terrainTexture = captainGate
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
      && (captainGate || clockGate || moonGate || catacombGate || (
        this.textures.get(terrainTexture).has(blockFrame)
        && this.textures.get(terrainTexture).has(shelfFrame)
      ))
    const undersideY = gate.y + gate.height - 31
    const supportY = gate.y + gate.height - 92
    const archiveStackY = gate.y + 46

    if ((captainGate || clockGate || moonGate || catacombGate) && hasGateTerrain) {
      const overhang = this.add.image(visualX, gate.y + gate.height / 2 - 16, terrainTexture, slabFrame)
      overhang.setDisplaySize(
        gate.width + (moonGate ? 58 : captainGate ? 52 : catacombGate ? 46 : 40),
        gate.height + (moonGate ? 128 : captainGate ? 92 : catacombGate ? 78 : 92),
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
    this.player.setOrigin(0.5, 1)
    this.player.setScale(HERO_SCALE)
    this.player.setCollideWorldBounds(false)
    this.player.setMaxVelocity(360, 940)
    this.player.setDragX(1450)
    this.player.setSize(42, 70)
    this.player.setOffset(43, 58)
    this.player.play('runner-idle')

    this.playerHealthBar = this.add.graphics()
    this.playerHealthFrame = this.add.image(0, 0, 'shadow-runner-health-frame')

    this.boostAura = this.add.sprite(start.x, start.y - 54, 'shadow-runner-boost-aura')
    this.boostAura.setVisible(false)
    this.boostAura.setDepth(24)
    this.boostAura.setAlpha(0.7)
    this.boostAura.play('boost-aura')

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
      this.physics.add.collider(enemy, this.platforms!)
      this.physics.add.overlap(this.player!, enemy, () => this.handlePlayerEnemyOverlap(this.time.now, enemy))
      this.physics.add.overlap(enemy, this.archerProjectiles!, (_enemy, projectile) => {
        this.handleReflectedProjectileEnemyHit(enemy, projectile as Phaser.Physics.Arcade.Image)
      })
    })
    this.physics.add.collider(this.archerProjectiles, this.platforms!, projectile => {
      const hazardProjectile = projectile as Phaser.Physics.Arcade.Image
      this.maybeCreateProjectileImpactHazard(hazardProjectile)
      this.disableProjectile(hazardProjectile)
    })
    this.physics.add.collider(this.archerProjectiles, this.crouchGates!, projectile => {
      const hazardProjectile = projectile as Phaser.Physics.Arcade.Image
      this.maybeCreateProjectileImpactHazard(hazardProjectile)
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
        this.time.now,
        hazardProjectile.x,
        Number(hazardProjectile.getData('damage') ?? 1),
      )
    })
    this.physics.add.overlap(this.player, this.candleHazards!, (_player, hazard) => {
      const activeHazard = hazard as Phaser.GameObjects.GameObject & { x?: number }
      this.damagePlayerFromHazard(
        this.time.now,
        activeHazard.x,
        Number(activeHazard.getData('damage') ?? 1),
      )
    })
    this.physics.add.overlap(this.player, this.spikes!, (_player, spike) => {
      const hazard = spike as Phaser.GameObjects.GameObject
      this.damagePlayerFromHazard(this.time.now, undefined, Number(hazard.getData('damage') ?? 3))
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
        this.damagePlayerFromHazard(this.time.now)
      } else if (event.code === 'KeyK') {
        this.damageEnemyForQa()
      }
    })
  }

  private registerQaDebugSnapshot() {
    const debugWindow = window as ShadowRunnerDebugWindow
    debugWindow.__shadowRunnerDebug = () => {
      const playerBody = this.player?.body as Phaser.Physics.Arcade.Body | undefined

      return {
        levelId: this.level.id,
        checkpointId: this.level.checkpoints?.[this.activeCheckpointIndex]?.id,
        objective: this.state.objective,
        player: this.player
          ? {
              x: Math.round(this.player.x),
              y: Math.round(this.player.y),
              velocityX: Math.round(playerBody?.velocity.x ?? 0),
              velocityY: Math.round(playerBody?.velocity.y ?? 0),
              bodyTop: Math.round(playerBody?.top ?? 0),
              bodyBottom: Math.round(playerBody?.bottom ?? 0),
              bodyHeight: Math.round(playerBody?.height ?? 0),
              crouchInput: this.controls.current.crouch,
              health: this.state.player.health,
              lives: this.state.player.lives,
              coins: this.state.player.coins,
              score: this.state.player.score,
              chronoActive: isShadowRunnerChronoActive(this.state, this.time.now),
              chronoRemainingMs: Math.max(0, this.state.player.chronoActiveUntil - this.time.now),
              surgeActive: isShadowRunnerSurgeActive(this.state, this.time.now),
              surgeRemainingMs: Math.max(0, this.state.player.surgeActiveUntil - this.time.now),
              wraithlightActive: isShadowRunnerWraithlightActive(this.state, this.time.now),
              wraithlightRemainingMs: Math.max(0, this.state.player.wraithlightActiveUntil - this.time.now),
              mirrorWardActive: isShadowRunnerMirrorWardActive(this.state, this.time.now),
              mirrorWardRemainingMs: Math.max(0, this.state.player.mirrorWardActiveUntil - this.time.now),
              mirrorWardCharges: this.state.player.mirrorWardCharges,
              galeMantleActive: isShadowRunnerGaleMantleActive(this.state, this.time.now),
              galeMantleRemainingMs: Math.max(0, this.state.player.galeMantleActiveUntil - this.time.now),
              sunsteelEdgeActive: isShadowRunnerSunsteelEdgeActive(this.state, this.time.now),
              sunsteelEdgeRemainingMs: Math.max(0, this.state.player.sunsteelEdgeActiveUntil - this.time.now),
              sunsteelEdgeCharges: this.state.player.sunsteelEdgeCharges,
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
          cleared: this.clearedEncounterIds.has(encounter.id),
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
          paused: this.time.now < runtime.pauseUntil,
        })),
      }
    }
    debugWindow.__shadowRunnerQa = {
      teleport: (x, y) => this.teleportPlayerForQa(x, y),
      restore: () => {
        restoreShadowRunnerPlayer(this.state)
        this.state.player.lastDamagedAt = this.time.now
        this.emitHud(true)
      },
      damage: amount => {
        this.state.player.lastDamagedAt = Number.NEGATIVE_INFINITY
        this.damagePlayerFromHazard(this.time.now, undefined, amount)
      },
      collect: (kind, index = 0) => {
        const pickup = kind === 'wraithlight'
          ? this.level.wraithlightPickups?.[index]
          : kind === 'mirrorWard'
            ? this.level.mirrorWardPickups?.[index]
            : kind === 'galeMantle'
              ? this.level.galeMantlePickups?.[index]
              : kind === 'sunsteelEdge'
                ? this.level.sunsteelEdgePickups?.[index]
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
        damageShadowRunnerEnemy(this.state, this.time.now, amount, enemyId, { bypassGuard: true })
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (debugWindow.__shadowRunnerDebug) {
        delete debugWindow.__shadowRunnerDebug
      }
      if (debugWindow.__shadowRunnerQa) {
        delete debugWindow.__shadowRunnerQa
      }
    })
  }

  private teleportPlayerForQa(x: number, y: number) {
    if (!this.player) return

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

  private damageEnemyForQa() {
    const enemy = this.getFirstAliveEnemy()
    if (!enemy) return

    const enemyState = this.getEnemyState(enemy)
    const damaged = damageShadowRunnerEnemy(this.state, this.time.now, 1, this.getEnemyId(enemy))
    if (!damaged) return

    this.playSound('enemy-hit')
    this.addHitFlash(enemy.x, enemy.y - 42)
    if (!enemyState?.alive) {
      this.defeatEnemy(enemy)
    }
    this.emitHud(true)
  }

  private updatePlayer(time: number) {
    const player = this.player!
    const body = player.body as Phaser.Physics.Arcade.Body
    const input = this.controls.current
    const cursors = this.cursors
    const keys = this.keys
    const onFloor = body.blocked.down || body.touching.down
    const left = input.left || Boolean(cursors?.left.isDown) || Boolean(keys?.a.isDown)
    const right = input.right || Boolean(cursors?.right.isDown) || Boolean(keys?.d.isDown)
    const crouch = input.crouch || Boolean(keys?.shift.isDown) || Boolean(keys?.s.isDown)
    const crouching = crouch && onFloor
    const jumpPress = input.jumpPresses !== this.lastJumpPresses
      || Boolean(cursors?.up && Phaser.Input.Keyboard.JustDown(cursors.up))
      || Boolean(keys?.w && Phaser.Input.Keyboard.JustDown(keys.w))
      || Boolean(keys?.space && Phaser.Input.Keyboard.JustDown(keys.space))
    const attackPress = input.attackPresses !== this.lastAttackPresses
      || Boolean(keys?.z && Phaser.Input.Keyboard.JustDown(keys.z))
      || Boolean(keys?.j && Phaser.Input.Keyboard.JustDown(keys.j))

    this.lastJumpPresses = input.jumpPresses
    this.lastAttackPresses = input.attackPresses
    this.clampPlayerHorizontalBounds(body)

    if (onFloor && body.velocity.y >= 0) {
      this.jumpsUsed = 0
      if (!this.wasOnFloor && time > 320) {
        this.playSound('land')
        this.addDustPuff(player.x, player.y - 22)
        this.applyFallDamageOnLanding(time)
      }
      this.airborneStartY = null
      this.airbornePeakY = player.y
    }

    if (!onFloor) {
      if (this.wasOnFloor || this.airborneStartY === null) {
        this.airborneStartY = player.y
        this.airbornePeakY = player.y
      }
      this.airbornePeakY = Math.min(this.airbornePeakY, player.y)
      this.lastAirborneVelocityY = body.velocity.y
    }

    if (left !== right) {
      const direction = right ? 1 : -1
      const speedMultiplier = getShadowRunnerSurgeSpeedMultiplier(this.state, time)
        * getShadowRunnerGaleSpeedMultiplier(this.state, time)
      this.state.player.facing = direction
      player.setFlipX(direction < 0)
      player.setVelocityX((crouching ? CRAWL_SPEED : PLAYER_SPEED * speedMultiplier) * direction)
    } else {
      player.setVelocityX(0)
    }

    if (crouching) {
      player.setScale(HERO_SCALE, HERO_SCALE * 0.72)
      player.setSize(42, 48)
      player.setOffset(43, 82)
    } else {
      player.setScale(HERO_SCALE, HERO_SCALE)
      player.setSize(42, 70)
      player.setOffset(43, 58)
    }

    this.applyTiltPlatformInfluence(time, left, right, onFloor)

    if (jumpPress) {
      this.tryJump(onFloor)
    }

    if (attackPress) {
      this.tryAttack(time)
    }

    this.resolveAttackHit(time)

    if (player.y > this.level.worldHeight + 90) {
      this.handlePlayerFellOut()
      return
    }

    this.updateHeroAnimation(time, left || right, onFloor, crouching)
    this.wasOnFloor = onFloor
  }

  private updateMovingPlatforms(time: number) {
    if (!this.player) return

    const deltaSeconds = Math.min(0.05, Math.max(0, this.game.loop.delta / 1000))
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body

    this.movingPlatforms.forEach(runtime => {
      const { config } = runtime
      if (time < runtime.pauseUntil || deltaSeconds <= 0) return

      const targetX = runtime.direction < 0 ? runtime.endX : runtime.startX
      const targetY = runtime.direction < 0 ? runtime.endY : runtime.startY
      const distance = Phaser.Math.Distance.Between(runtime.lastX, runtime.lastY, targetX, targetY)
      const standing = playerBody.center.x >= runtime.lastX - 8
        && playerBody.center.x <= runtime.lastX + config.width + 8
        && playerBody.bottom >= runtime.lastY - 12
        && playerBody.bottom <= runtime.lastY + 18
        && playerBody.velocity.y >= -24

      let nextX = targetX
      let nextY = targetY
      const travel = config.speed * deltaSeconds
      if (distance > travel && distance > 0) {
        const ratio = travel / distance
        nextX = Phaser.Math.Linear(runtime.lastX, targetX, ratio)
        nextY = Phaser.Math.Linear(runtime.lastY, targetY, ratio)
      } else {
        runtime.direction = runtime.direction < 0 ? 1 : -1
        runtime.pauseUntil = time + config.pauseMs
      }

      const dx = nextX - runtime.lastX
      const dy = nextY - runtime.lastY
      runtime.lastX = nextX
      runtime.lastY = nextY
      runtime.visual.setPosition(
        nextX + config.width / 2,
        nextY + config.height / 2 - 10,
      )
      runtime.collider?.setPosition(
        nextX + config.width / 2,
        nextY + config.height / 2,
      )
      const platformBody = runtime.collider?.body as Phaser.Physics.Arcade.StaticBody | undefined
      platformBody?.updateFromGameObject()

      if (standing && (dx !== 0 || dy !== 0)) {
        this.player?.setPosition(this.player.x + dx, this.player.y + dy)
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

  private applyTiltPlatformInfluence(time: number, left: boolean, right: boolean, onFloor: boolean) {
    this.updateTiltPlatformFallThrough(time)

    if (!this.player || !onFloor) {
      this.activeTiltPlatformId = null
      this.activeTiltStartedAt = 0
      return
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body
    const platform = this.getStandingTiltPlatform(body)
    if (!platform) {
      this.activeTiltPlatformId = null
      this.activeTiltStartedAt = 0
      return
    }

    const rotation = Number(platform.visual.getData('currentRotation') ?? platform.visual.rotation ?? 0)
    const chronoScale = getShadowRunnerChronoTimeScale(this.state, time)
    const slideForce = (platform.config.slideForce ?? 860) * chronoScale
    const maxSlideSpeed = (platform.config.maxSlideSpeed ?? 110) * Math.max(0.72, chronoScale)
    const platformId = platform.config.id
    const strongTilt = Math.abs(rotation) >= TILT_DUMP_ROTATION

    if (this.activeTiltPlatformId !== platformId || !strongTilt) {
      this.activeTiltPlatformId = platformId
      this.activeTiltStartedAt = strongTilt ? time : 0
    }

    const tiltHoldMs = strongTilt && this.activeTiltStartedAt > 0 ? time - this.activeTiltStartedAt : 0
    const dumpReadiness = Phaser.Math.Clamp((tiltHoldMs * chronoScale - 420) / 920, 0, 1)
    const waitingOnBridge = !left && !right
    const slideMultiplier = strongTilt && waitingOnBridge ? 1.24 + dumpReadiness * 1.45 : 1
    const slideLimit = maxSlideSpeed + (waitingOnBridge ? dumpReadiness * 120 : dumpReadiness * 42)
    const slideVelocity = Phaser.Math.Clamp(rotation * slideForce * slideMultiplier, -slideLimit, slideLimit)
    const tiltDirection = Math.sign(rotation) as -1 | 0 | 1

    if (Math.abs(slideVelocity) < 5 || Math.abs(rotation) < TILT_ACTIVE_ROTATION) return

    const inputDamping = left || right ? 0.42 : 1
    const dumpNudge = waitingOnBridge && dumpReadiness > 0.72 ? Math.sign(rotation) * 28 : 0
    const nextVelocity = Phaser.Math.Clamp(body.velocity.x + slideVelocity * inputDamping + dumpNudge, -430, 430)
    this.player.setVelocityX(nextVelocity)

    if (tiltDirection !== 0 && dumpReadiness > 0.72 && this.isPlayerNearTiltDropEdge(body, platform.config, tiltDirection)) {
      this.forceTiltBridgeFallThrough(platform, time, tiltDirection)
    }
  }

  private applyFallDamageOnLanding(time: number) {
    if (!this.player || this.airborneStartY === null) return

    const fallDistance = this.player.y - Math.min(this.airborneStartY, this.airbornePeakY)
    const impactVelocity = this.lastAirborneVelocityY
    if (fallDistance < FALL_DAMAGE_DISTANCE && impactVelocity < 780) return

    const heavyFall = fallDistance >= HEAVY_FALL_DAMAGE_DISTANCE || impactVelocity >= 960
    const rawDamage = heavyFall ? 4 : 2
    const galeCap = getShadowRunnerGaleFallDamageCap(this.state, time)
    const damaged = this.damagePlayerFromHazard(
      time,
      undefined,
      galeCap === null ? rawDamage : Math.min(rawDamage, galeCap),
    )
    if (damaged) {
      this.addDustPuff(this.player.x, this.player.y - 18)
      this.cameras.main.shake(heavyFall ? 120 : 76, heavyFall ? 0.0028 : 0.0018)
    }
  }

  private updateTiltPlatformFallThrough(time: number) {
    this.tiltPlatforms.forEach(platform => {
      if (!platform.fallThroughUntil || time < platform.fallThroughUntil) return

      const body = platform.collider?.body as Phaser.Physics.Arcade.StaticBody | undefined
      if (body) {
        body.checkCollision.up = true
      }
      platform.fallThroughUntil = undefined
    })
  }

  private isPlayerNearTiltDropEdge(body: Phaser.Physics.Arcade.Body, platform: ShadowRunnerTiltPlatform, tiltDirection: -1 | 1) {
    const edgeStart = tiltDirection > 0
      ? platform.x + platform.width * 0.68
      : platform.x + platform.width * 0.32

    return tiltDirection > 0
      ? body.center.x >= edgeStart
      : body.center.x <= edgeStart
  }

  private forceTiltBridgeFallThrough(platform: TiltPlatformRuntime, time: number, tiltDirection: -1 | 1) {
    if (!this.player) return

    const body = platform.collider?.body as Phaser.Physics.Arcade.StaticBody | undefined
    if (!body || platform.fallThroughUntil && time < platform.fallThroughUntil) return

    body.checkCollision.up = false
    platform.fallThroughUntil = time + 520
    this.player.setVelocityX(tiltDirection * Math.max(230, platform.config.maxSlideSpeed ?? 220))
    this.player.setVelocityY(Math.max((this.player.body as Phaser.Physics.Arcade.Body).velocity.y, 140))
  }

  private getStandingTiltPlatform(body: Phaser.Physics.Arcade.Body) {
    const footY = body.bottom
    const centerX = body.center.x

    return this.tiltPlatforms.find(platform => {
      const rect = platform.config
      const horizontallyInside = centerX >= rect.x - 8 && centerX <= rect.x + rect.width + 8
      const verticallyAligned = footY >= rect.y - 8 && footY <= rect.y + Math.max(20, rect.height * 0.75)
      return horizontallyInside && verticallyAligned
    })
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

      encounter.enemyIds.forEach(enemyId => {
        const enemyState = this.state.enemies.find(current => current.id === enemyId)
        if (!enemyState || enemyState.activated) return

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
      const active = barrierState.active
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
        enemy.setPosition(Number(enemy.getData('startX') ?? enemyState.patrolLeft), Number(enemy.getData('startY') ?? 380))
        enemy.setVelocity(0, 0)
        enemyState.direction = enemyState.direction === 1 ? -1 : 1
      }

      if (enemyKind === 'tower-archer') {
        this.updateTowerArcher(time, enemy, enemyState)
        return
      }

      if (enemyKind === 'moonlit-captain' && !recentlyHit && this.tryMoonlitCaptainAttack(time, enemy, enemyState)) {
        return
      }

      if (enemyKind === 'gate-pikeman' && !recentlyHit && this.tryGatePikemanThrust(time, enemy, enemyState)) {
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
        const patrolSpeed = this.getEnemyPatrolSpeed(enemyState) * chronoScale
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
      this.cameras.main.flash(90, 196, 221, 255, false)
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
    arrow.setData('spawnedAt', this.time.now)
    arrow.setData('lifetimeMs', lifetimeMs)
    arrow.setData('projectileKind', 'arrow')
    arrow.setData('damage', damage)
    arrow.setData('baseSpeedX', direction * speed)
    arrow.setVelocityX(direction * speed * getShadowRunnerChronoTimeScale(this.state, this.time.now))

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
    candle.setData('spawnedAt', this.time.now)
    candle.setData('lifetimeMs', CANDLE_PROJECTILE_LIFETIME_MS)
    candle.setData('projectileKind', 'candle')
    const enemyConfig = getShadowRunnerLevelEnemies(this.level).find(config => config.id === enemyId)
    candle.setData('damage', enemyConfig ? getShadowRunnerEnemyProjectileDamage(enemyConfig) : 2)
    candle.setData('baseSpeedX', direction * speed)
    candle.setVelocity(
      direction * speed * getShadowRunnerChronoTimeScale(this.state, this.time.now),
      -72,
    )
    candle.setAngularVelocity(direction * 320)

    const body = candle.body as Phaser.Physics.Arcade.Body
    body.allowGravity = true
    body.setGravityY(420)
    body.setSize(26, 14)
    body.setOffset(4, 2)
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
    bomb.setData('spawnedAt', this.time.now)
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

    const reflected = reflectShadowRunnerProjectileWithMirrorWard(this.state, this.time.now)
    if (!reflected) return false

    const currentBaseSpeed = Number(
      projectile.getData('baseSpeedX') ?? projectile.body?.velocity.x ?? 0,
    )
    const reflectedBaseSpeed = currentBaseSpeed === 0
      ? this.state.player.facing * 520
      : -currentBaseSpeed * 1.12
    projectile.setData('reflectedByPlayer', true)
    projectile.setData('baseSpeedX', reflectedBaseSpeed)
    projectile.setData('spawnedAt', this.time.now)
    projectile.setData('lifetimeMs', Math.max(2200, Number(projectile.getData('lifetimeMs') ?? 0)))
    projectile.setTint(0x88ffe2)
    projectile.setFlipX(reflectedBaseSpeed < 0)
    projectile.setVelocityX(reflectedBaseSpeed)
    projectile.setVelocityY(0)
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
    this.cameras.main.shake(42, 0.0012)
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
      this.time.now,
      2,
      this.getEnemyId(enemy),
      { bypassGuard: true },
    )
    if (!damaged) return

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
    const blocked = blockShadowRunnerProjectileWithShield(this.state, this.time.now)
    if (!blocked) return false

    this.playSound('enemy-hit')
    this.addHitFlash(projectile.x, projectile.y)
    this.disableProjectile(projectile)
    this.emitHud(true)
    return true
  }

  private maybeCreateProjectileImpactHazard(projectile: Phaser.Physics.Arcade.Image) {
    const projectileKind = projectile.getData('projectileKind')
    if (projectileKind === 'candle') {
      this.createCandleHazard(projectile.x, projectile.y + 10)
    } else if (projectileKind === 'storm-bomb') {
      this.createStormHazard(
        projectile.x,
        projectile.y + 8,
        Number(projectile.getData('hazardDurationMs') ?? STORM_HAZARD_LIFETIME_MS),
      )
    }
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
    hazard.setData('expiresAt', this.time.now + CANDLE_HAZARD_LIFETIME_MS)
    hazard.setData('damage', 1)
    hazard.setData('hazardKind', 'candle')
    hazard.setImmovable(true)

    const body = hazard.body as Phaser.Physics.Arcade.StaticBody
    body.setSize(22, 38)
    body.setOffset(6, 12)
    body.updateFromGameObject()

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
    hazard.setData('expiresAt', this.time.now + durationMs)
    hazard.setData('damage', 2)
    hazard.setData('hazardKind', 'storm')
    hazard.setImmovable(true)

    const body = hazard.body as Phaser.Physics.Arcade.StaticBody
    body.setSize(58, 26)
    body.setOffset(6, 24)
    body.updateFromGameObject()

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
    this.cameras.main.shake(55, 0.0015)
  }

  private updateCandleHazards(time: number) {
    this.candleHazards?.getChildren().forEach(child => {
      const hazard = child as Phaser.Physics.Arcade.Image
      if (!hazard.active) return

      const expiresAt = Number(hazard.getData('expiresAt') ?? time)
      if (time < expiresAt) return

      hazard.disableBody(true, true)
      hazard.clearTint()
      this.tweens.killTweensOf(hazard)
    })
  }

  private tryJump(onFloor: boolean) {
    if (!this.player) return

    if (onFloor) {
      this.player.setVelocityY(JUMP_VELOCITY)
      this.jumpsUsed = 1
      this.playSound('jump')
      return
    }

    if (this.jumpsUsed < 2) {
      this.player.setVelocityY(DOUBLE_JUMP_VELOCITY)
      this.jumpsUsed = 2
      this.playSound('double-jump')
      this.addDustPuff(this.player.x, this.player.y - 52)
    }
  }

  private tryAttack(time: number) {
    if (time < this.state.player.attackCooldownUntil) return

    this.state.player.attackingUntil = time + 265
    this.state.player.attackCooldownUntil = time + 420
    consumeShadowRunnerSunsteelCharge(this.state, time, 280)
    this.player?.play('runner-attack', true)
    this.playSound('sword-swing')
    this.playSwordSlash()
  }

  private resolveAttackHit(time: number) {
    const player = this.player
    if (!player || time > this.state.player.attackingUntil) {
      this.slashArc?.clear()
      return
    }

    const facing = this.state.player.facing
    const sunsteelStrike = getShadowRunnerSunsteelStrikeProperties(this.state, time)
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
      if (!projectile.active || projectile.getData('projectileKind') !== 'storm-bomb') return false
      const reachX = facing === 1 ? projectile.x - player.x : player.x - projectile.x
      return reachX > -14
        && reachX < 106 + sunsteelStrike.reachBonus
        && Math.abs(projectile.y - slashY) < 76
    }) as Phaser.Physics.Arcade.Image | undefined
    if (bomb && sunsteelStrike.attackDamageBonus > 0) {
      this.disableProjectile(bomb)
      this.playSound('enemy-hit')
      this.addHitFlash(bomb.x, bomb.y)
      this.state.player.score += 40
    }

    const enemy = this.enemies.find(current => {
      const enemyState = this.getEnemyState(current)
      if (!enemyState?.alive) return false

      const reachX = facing === 1 ? current.x - player.x : player.x - current.x
      const vertical = Math.abs(current.y - player.y)
      return reachX > 0 && reachX < 106 + sunsteelStrike.reachBonus && vertical < 74
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
       (boostActive || surgeActive ? 2 : 1) + sunsteelStrike.attackDamageBonus,
      this.getEnemyId(enemy),
      {
        bypassGuard: rearAttack,
        guardDamage: Math.max(boostActive || surgeActive ? 2 : 1, sunsteelStrike.guardDamage),
      },
    )
    if (damaged) {
      if (enemyState) {
        enemyState.attackUntil = time + 160
      }
      this.playSound('enemy-hit')
      enemy.setVelocityX(facing * (boostActive || surgeActive || sunsteelStrike.attackDamageBonus > 0 ? 245 : 190))
      this.addHitFlash(enemy.x, enemy.y - 42)
      if (!enemyState?.alive) {
        this.defeatEnemy(enemy)
      }
    }
  }

  private handlePlayerEnemyOverlap(time: number, enemy: Phaser.Physics.Arcade.Sprite) {
    const player = this.player
    const enemyState = this.getEnemyState(enemy)
    if (!player || !enemyState?.alive || !enemyState.activated) return
    if (time < Number(enemy.getData('harmfulAt') ?? 0)) return

    const body = player.body as Phaser.Physics.Arcade.Body
    const enemyKind = this.getEnemyKind(enemy)
    if (enemyKind === 'gate-pikeman' && enemy.getData('highThrust') && body.height <= 50) {
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
      enemyState.attackUntil = time + 160
      if (damaged) {
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
      enemyState.attackUntil = time + (
        enemyKind === 'barrel-roller'
          ? 340
          : enemyKind === 'lantern-bandit-scout'
            ? 310
            : 280
      )
      enemyState.direction = player.x < enemy.x ? -1 : 1
      this.setEnemyFacing(enemy, enemyState.direction)
      enemy.play(this.getEnemyAnimation(enemyKind, 'attack'), true)
    }
  }

  private damagePlayerFromHazard(time: number, sourceX?: number, amount = 1) {
    const resistedHit = (
      isShadowRunnerBoostActive(this.state, time) && this.state.player.boostGuardCharges > 0
    ) || isShadowRunnerSurgeActive(this.state, time)
    const damaged = damageShadowRunnerPlayer(this.state, time, amount)
    if (!damaged || !this.player) return false

    this.playSound('player-hurt')
    const knockback = sourceX === undefined
      ? (this.state.player.facing === 1 ? -1 : 1)
      : (this.player.x < sourceX ? -1 : 1)
    const knockbackStrength = resistedHit ? 145 : 220 + Math.max(0, amount - 1) * 62
    this.player.setVelocity(knockback * knockbackStrength, resistedHit ? -210 : -290 - Math.max(0, amount - 1) * 28)
    this.player.setTint(resistedHit ? 0xf0d381 : 0xffd0b3)
    this.cameras.main.shake(resistedHit ? 56 : 90, resistedHit ? 0.0014 : 0.0022)

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
    this.emitHud(true)

    if (!hasLivesLeft) {
      this.playSound('route-failed')
      this.player?.setVelocity(0, 0)
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
    if (!this.player || this.fallRespawnPending || this.state.outOfLives) return

    this.fallRespawnPending = true
    const hasLivesLeft = spendShadowRunnerLife(this.state)
    this.emitHud(true)

    this.playSound(hasLivesLeft ? 'life-lost' : 'route-failed')
    this.player.setVelocity(0, 0)
    this.player.setTint(0x6d7380)
    this.addDustPuff(this.player.x, this.level.worldHeight - 20)

    if (!hasLivesLeft) return

    this.time.delayedCall(260, () => {
      this.fallRespawnPending = false
      this.respawnPlayer()
    })
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

    restoreShadowRunnerPlayer(this.state)
    this.state.player.lastDamagedAt = this.time.now
    this.jumpsUsed = 0
    this.fallRespawnPending = false
    this.player.setVelocity(0, 0)
    this.updateEncounterBarriers()
    this.player.setPosition(this.respawnPoint.x, this.respawnPoint.y)
    this.player.clearTint()
    this.playSound('respawn')
    this.addDustPuff(this.player.x, this.player.y - 28)
    this.emitHud(true)
  }

  private collectCoin(coin: Phaser.Physics.Arcade.Sprite) {
    if (coin.getData('collected')) return

    coin.setData('collected', true)
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
    collectShadowRunnerBoost(this.state, this.time.now, boost)
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

  private updateCheckpointProgress() {
    if (!this.player || this.fallRespawnPending || this.state.outOfLives) return

    const checkpoints = this.level.checkpoints ?? []
    const nextCheckpointIndex = this.activeCheckpointIndex + 1
    const checkpoint = checkpoints[nextCheckpointIndex]
    if (!checkpoint || this.player.x < checkpoint.x) return
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    if (checkpoint.triggerWidth !== undefined && this.player.x > checkpoint.x + checkpoint.triggerWidth) return
    if (checkpoint.minY !== undefined && playerBody.center.y < checkpoint.minY) return
    if (checkpoint.maxY !== undefined && playerBody.center.y > checkpoint.maxY) return

    this.activeCheckpointIndex = nextCheckpointIndex
    this.respawnPoint = { x: checkpoint.x, y: checkpoint.y }
    restoreShadowRunnerPlayer(this.state)
    this.state.player.lastDamagedAt = this.time.now
    this.showCheckpointToast(checkpoint.label)
    this.emitHud(true)
  }

  private showCheckpointToast(label: string) {
    if (this.checkpointToast) {
      this.tweens.killTweensOf(this.checkpointToast)
      this.checkpointToast.destroy()
    }

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
    collectShadowRunnerShield(this.state, this.time.now, shield)
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
    collectShadowRunnerChrono(this.state, this.time.now, chrono)
    this.playSound('coin')
    this.addCoinSparkle(chronoSprite.x, chronoSprite.y)
    this.addDustPuff(chronoSprite.x, chronoSprite.y + 18)
    this.cameras.main.flash(110, 70, 225, 255, false)
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
    collectShadowRunnerSurge(this.state, this.time.now, surge)
    this.playSound('coin')
    this.addCoinSparkle(surgeSprite.x, surgeSprite.y)
    this.addDustPuff(surgeSprite.x, surgeSprite.y + 18)
    this.cameras.main.flash(100, 150, 232, 255, false)
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
    collectShadowRunnerMoonShard(this.state, shard, totalMoonShards)
    this.finishSparked = false
    this.playSound('coin')
    this.addCoinSparkle(shardSprite.x, shardSprite.y)
    this.addDustPuff(shardSprite.x, shardSprite.y + 18)
    this.cameras.main.flash(120, 210, 245, 255, false)
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
    collectShadowRunnerWraithlight(this.state, this.time.now, pickup)
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
    this.updateWraithlight(this.time.now)
    this.emitHud(true)
  }

  private collectMirrorWard(sprite: Phaser.Physics.Arcade.Sprite) {
    if (sprite.getData('collected')) return

    const pickup: ShadowRunnerMirrorWardPickup | undefined = this.level.mirrorWardPickups
      ?.find(current => current.id === sprite.name)
    if (!pickup) return

    sprite.setData('collected', true)
    collectShadowRunnerMirrorWard(this.state, this.time.now, pickup)
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
    collectShadowRunnerGaleMantle(this.state, this.time.now, pickup)
    this.playSound('coin')
    this.addCoinSparkle(sprite.x, sprite.y)
    this.addDustPuff(sprite.x, sprite.y + 18)
    this.cameras.main.flash(110, 148, 225, 255, false)
    this.tweens.add({
      targets: sprite,
      scale: 1.62,
      alpha: 0,
      y: sprite.y - 30,
      duration: 235,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.disableBody(true, true),
    })
    this.updateGaleMantleAura(this.time.now)
    this.emitHud(true)
  }

  private collectSunsteelEdge(sprite: Phaser.Physics.Arcade.Sprite) {
    if (sprite.getData('collected')) return

    const pickup: ShadowRunnerSunsteelEdgePickup | undefined = this.level.sunsteelEdgePickups
      ?.find(current => current.id === sprite.name)
    if (!pickup) return

    sprite.setData('collected', true)
    collectShadowRunnerSunsteelEdge(this.state, this.time.now, pickup)
    this.playSound('coin')
    this.addCoinSparkle(sprite.x, sprite.y)
    this.addDustPuff(sprite.x, sprite.y + 18)
    this.cameras.main.flash(110, 255, 196, 72, false)
    this.tweens.add({
      targets: sprite,
      scale: 1.62,
      alpha: 0,
      y: sprite.y - 30,
      duration: 235,
      ease: 'Quad.easeOut',
      onComplete: () => sprite.disableBody(true, true),
    })
    this.updateSunsteelEdgeAura(this.time.now)
    this.emitHud(true)
  }

  private collectObjective(sprite: Phaser.Physics.Arcade.Sprite) {
    if (sprite.getData('collected')) return

    const pickup: ShadowRunnerObjectivePickup | undefined = this.level.objectivePickups
      ?.find(current => current.id === sprite.name)
    if (!pickup) return

    sprite.setData('collected', true)
    collectShadowRunnerObjective(this.state, pickup)
    this.finishSparked = false
    this.playSound('coin')
    this.addCoinSparkle(sprite.x, sprite.y)
    this.addDustPuff(sprite.x, sprite.y + 18)
    this.cameras.main.flash(125, 246, 204, 92, false)
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
      ? isShadowRunnerGaleMantleActive(this.state, this.time.now)
      : pickup.requiredPower === 'sunsteel-edge'
        ? isShadowRunnerSunsteelEdgeActive(this.state, this.time.now)
        : isShadowRunnerWraithlightActive(this.state, this.time.now)
    if (sprite.getData('collected') || !powerActive) return

    sprite.setData('collected', true)
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

    let active = isShadowRunnerWraithlightActive(this.state, time)
    if (!active && this.isPlayerStandingOnSpectralPlatform()) {
      this.state.player.wraithlightActiveUntil = time + 650
      active = true
    }

    this.spectralPlatforms.forEach(platform => {
      platform.visual.setAlpha(active ? 0.94 : 0.2)
      const body = platform.collider?.body as Phaser.Physics.Arcade.StaticBody | undefined
      if (body) body.enable = active
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

  private isPlayerStandingOnSpectralPlatform() {
    if (!this.player) return false

    const body = this.player.body as Phaser.Physics.Arcade.Body
    return this.spectralPlatforms.some(platform => {
      const rect = platform.config
      return body.center.x >= rect.x - 8
        && body.center.x <= rect.x + rect.width + 8
        && body.bottom >= rect.y - 10
        && body.bottom <= rect.y + 18
    })
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

  private updatePowerGatedMastery(requiredPower: 'gale-mantle' | 'sunsteel-edge', active: boolean) {
    this.masteryPickups?.getChildren().forEach(child => {
      const pickup = child as Phaser.Physics.Arcade.Sprite
      if (pickup.getData('collected') || pickup.getData('requiredPower') !== requiredPower) return
      pickup.setAlpha(active ? 1 : 0.16)
      const body = pickup.body as Phaser.Physics.Arcade.StaticBody
      body.enable = active
    })
  }

  private updateHealthBars() {
    this.drawHealthBar(this.playerHealthBar, this.playerHealthFrame, this.player?.x ?? 0, (this.player?.y ?? 0) - 94, this.state.player.health, this.state.player.maxHealth)

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
    if (!this.player || this.state.defeated || this.state.outOfLives || this.fallRespawnPending) return

    const finish = this.level.finish
    const body = this.player.body as Phaser.Physics.Arcade.Body
    const overlapsFinish = isShadowRunnerFinishOverlap(body, finish, { fallRespawnPending: this.fallRespawnPending })

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

      const completion = getShadowRunnerHudState(this.state, this.level.coins.length, this.time.now)
      this.state.defeated = true
      this.state.objective = this.level.completionLine
      this.state.player.score += completion.perfectRoute ? 1200 : completion.fullClear ? 700 : 300
      if (!this.finishSparked) {
        this.finishSparked = true
        this.playSound('level-complete')
        this.addDustPuff(finish.x + finish.width / 2, finish.y + finish.height - 20)
        this.addCoinSparkle(finish.x + finish.width / 2, finish.y + 38)
      }
      this.emitHud(true)
    }
  }

  private emitHud(force = false) {
    const hud = getShadowRunnerHudState(this.state, this.level.coins.length, this.time.now)
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

    if (!this.textures.exists('shadow-runner-coin')) {
      const coin = this.make.graphics({ x: 0, y: 0 })
      coin.fillStyle(0x3a2508, 1)
      coin.fillCircle(14, 14, 14)
      coin.fillStyle(0xf2cc55, 1)
      coin.fillCircle(14, 14, 11)
      coin.fillStyle(0xffec9d, 1)
      coin.fillRect(12, 4, 4, 20)
      coin.generateTexture('shadow-runner-coin', 28, 28)
      coin.destroy()
    }

    if (!this.textures.exists('clockwork-sentry')) {
      const sentry = this.make.graphics({ x: 0, y: 0 })
      sentry.fillStyle(0x111720, 1)
      sentry.fillRect(18, 18, 28, 34)
      sentry.fillStyle(0x66706f, 1)
      sentry.fillRect(14, 14, 36, 24)
      sentry.fillStyle(0x242c31, 1)
      sentry.fillRect(18, 38, 28, 14)
      sentry.fillStyle(0xf0d381, 1)
      sentry.fillCircle(25, 27, 3)
      sentry.fillCircle(39, 27, 3)
      sentry.fillStyle(0x8f6c2d, 1)
      sentry.fillRect(49, 22, 9, 4)
      sentry.fillRect(55, 17, 4, 14)
      sentry.fillStyle(0x495159, 1)
      sentry.fillRect(14, 52, 10, 10)
      sentry.fillRect(40, 52, 10, 10)
      sentry.lineStyle(2, 0x05070a, 1)
      sentry.strokeRect(14, 14, 36, 38)
      sentry.generateTexture('clockwork-sentry', 64, 64)
      sentry.destroy()
    }

    if (!this.textures.exists('barrel-roller')) {
      const barrel = this.make.graphics({ x: 0, y: 0 })
      barrel.fillStyle(0x16120d, 1)
      barrel.fillCircle(32, 34, 22)
      barrel.fillStyle(0x5d4022, 1)
      barrel.fillCircle(32, 34, 18)
      barrel.lineStyle(4, 0xc49a45, 1)
      barrel.strokeCircle(32, 34, 18)
      barrel.lineStyle(3, 0x0a0705, 1)
      barrel.strokeCircle(32, 34, 23)
      barrel.fillStyle(0xe9c96c, 1)
      barrel.fillRect(18, 24, 28, 4)
      barrel.fillRect(18, 40, 28, 4)
      barrel.generateTexture('barrel-roller', 64, 64)
      barrel.destroy()
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

export function createShadowRunnerPhaserGame(options: CreateShadowRunnerGameOptions) {
  return new Phaser.Game({
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
    scene: [
      new ShadowRunnerLevelScene({
        input: options.input,
        levelId: options.levelId,
        onHudChange: options.onHudChange,
        onReady: options.onReady,
        onSoundEvent: options.onSoundEvent,
      }),
    ],
  })
}
