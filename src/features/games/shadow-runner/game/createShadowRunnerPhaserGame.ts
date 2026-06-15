import Phaser from 'phaser'
import type { ShadowRunnerSoundEvent } from '../audio'
import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import type { ShadowRunnerInputRef } from './input'
import {
  getShadowRunnerLevelConfig,
  getShadowRunnerLevelEnemies,
  type ShadowRunnerBoostPickup,
  type ShadowRunnerEnemyConfig,
  type ShadowRunnerEnemyKind,
  type ShadowRunnerLevelConfig,
  type ShadowRunnerPlayableLevelId,
  type ShadowRunnerTiltPlatform,
} from './levels'
import {
  collectShadowRunnerBoost,
  collectShadowRunnerCoin,
  createInitialShadowRunnerSimulation,
  damageShadowRunnerEnemy,
  damageShadowRunnerPlayer,
  getShadowRunnerHudState,
  isShadowRunnerBoostActive,
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
const SENTRY_SCALE = 0.68
const BARREL_SCALE = 0.58
const SCROLL_THIEF_SCALE = 0.62
const TOWER_ARCHER_SCALE = 0.66
const PLAYER_SPEED = 260
const SENTRY_PATROL_SPEED = 82
const BARREL_PATROL_SPEED = 132
const SCROLL_THIEF_PATROL_SPEED = 168
const CRAWL_SPEED = 112
const JUMP_VELOCITY = -620
const DOUBLE_JUMP_VELOCITY = -560
const GRAVITY_Y = 1640
const TILT_ACTIVE_ROTATION = 0.025
const TILT_DUMP_ROTATION = 0.105
const ARCHER_PROJECTILE_LIFETIME_MS = 2600

interface TextureCrop {
  x: number
  y: number
  width: number
  height: number
}

interface ShadowRunnerDebugSnapshot {
  levelId: ShadowRunnerPlayableLevelId
  player?: {
    x: number
    y: number
    velocityX: number
    velocityY: number
    health: number
    lives: number
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
  }>
}

type ShadowRunnerDebugWindow = Window & typeof globalThis & {
  __shadowRunnerDebug?: () => ShadowRunnerDebugSnapshot
}

interface PlatformVisualOptions {
  texture?: string
  frame?: string | number
  useImage?: boolean
  displayWidth?: number
  displayHeight?: number
  visualOffsetY?: number
  depth?: number
}

type PlatformVisual = Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite

interface TiltPlatformRuntime {
  config: ShadowRunnerTiltPlatform
  visual: PlatformVisual
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

const TERRAIN_FRAME_PREFIX = 'terrain-'

function getTerrainFrameKey(platformId: string) {
  return `${TERRAIN_FRAME_PREFIX}${platformId}`
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
  const visual = options.useImage || options.frame !== undefined
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
  private crouchGates?: Phaser.Physics.Arcade.StaticGroup
  private archerProjectiles?: Phaser.Physics.Arcade.Group
  private player?: Phaser.Physics.Arcade.Sprite
  private enemies: Phaser.Physics.Arcade.Sprite[] = []
  private tiltPlatforms: TiltPlatformRuntime[] = []
  private boostAura?: Phaser.GameObjects.Sprite
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
  private lastHudSignature = ''
  private activeTiltPlatformId: string | null = null
  private activeTiltStartedAt = 0

  constructor(options: Omit<CreateShadowRunnerGameOptions, 'parent'>) {
    super('ShadowRunnerLevelScene')
    this.controls = options.input
    this.level = getShadowRunnerLevelConfig(options.levelId ?? 'tutorial')
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
    this.load.image('shadow-runner-terrain-atlas', SHADOW_RUNNER_ASSETS.level.terrainAtlas)
    this.load.image('shadow-runner-ivy-terrain-atlas', SHADOW_RUNNER_ASSETS.levels.ivyViaductTerrainHazards)
    this.load.image('shadow-runner-bell-terrain-atlas', SHADOW_RUNNER_ASSETS.levels.bellTowerPropsHazards)
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
    this.boostAura = undefined
    this.wasOnFloor = false
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
    this.updateEnemies(time)
    this.updateArcherProjectiles(time)
    this.updateBoostAura(time)
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
    this.crouchGates = this.physics.add.staticGroup()

    this.level.platforms.forEach(platform => {
      const frameKey = getTerrainFrameKey(platform.visualId ?? platform.id)
      const terrainTexture = platform.terrainSet === 'bell'
        ? 'shadow-runner-bell-terrain-atlas'
        : platform.terrainSet === 'ivy'
          ? 'shadow-runner-ivy-terrain-atlas'
          : 'shadow-runner-terrain-atlas'
      const hasTerrainFrame = this.textures.exists(terrainTexture)
        && this.textures.get(terrainTexture).has(frameKey)

      addStaticPlatform(this, this.platforms!, platform, hasTerrainFrame
        ? { texture: terrainTexture, frame: frameKey, useImage: true }
        : { texture: 'shadow-runner-stone' })
    })

    this.level.crouchGates?.forEach(gate => {
      this.createCrouchGate(gate)
    })

    this.level.tiltPlatforms.forEach((platform, index) => {
      const hasTiltAsset = this.textures.exists('shadow-runner-tilt-bridge')
      const wobbleRotation = platform.wobbleRotation ?? 0.08
      const sprite = addStaticPlatform(this, this.platforms!, platform, hasTiltAsset
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
      this.tiltPlatforms.push({ config: platform, visual: sprite })
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

    this.level.spikes.forEach(spike => {
      addStaticPlatform(this, this.spikes!, spike, { texture: 'shadow-runner-spike-row' })
    })

    this.level.coins.forEach((coin, index) => {
      const coinSprite = this.coins!.create(coin.x, coin.y, 'shadow-runner-coin') as Phaser.Physics.Arcade.Sprite
      coinSprite.setName(coin.id)
      coinSprite.setScale(0.74)
      coinSprite.setCircle(16, 8, 8)
      coinSprite.setImmovable(true)
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
    if (this.textures.exists('shadow-runner-east-gate')) {
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

  private createCrouchGate(gate: NonNullable<ShadowRunnerLevelConfig['crouchGates']>[number]) {
    const visualX = gate.x + gate.width / 2
    const terrainTexture = 'shadow-runner-bell-terrain-atlas'
    const slabFrame = getTerrainFrameKey('bell-wide-ledge')
    const blockFrame = getTerrainFrameKey('bell-small-block')
    const shelfFrame = getTerrainFrameKey('bell-scroll-shelf')
    const hasBellTerrain = this.textures.exists(terrainTexture)
      && this.textures.get(terrainTexture).has(slabFrame)
      && this.textures.get(terrainTexture).has(blockFrame)
      && this.textures.get(terrainTexture).has(shelfFrame)

    if (hasBellTerrain) {
      const slab = this.add.image(visualX, gate.y + gate.height / 2 - 4, terrainTexture, slabFrame)
      slab.setDisplaySize(gate.width + 34, 58)
      slab.setDepth(7)

      const leftBlock = this.add.image(gate.x + 34, gate.y - 28, terrainTexture, blockFrame)
      leftBlock.setDisplaySize(64, 112)
      leftBlock.setDepth(6)

      const rightBlock = this.add.image(gate.x + gate.width - 34, gate.y - 28, terrainTexture, blockFrame)
      rightBlock.setDisplaySize(64, 112)
      rightBlock.setDepth(6)

      const archiveStack = this.add.image(visualX, gate.y - 82, terrainTexture, shelfFrame)
      archiveStack.setDisplaySize(Math.min(148, gate.width * 0.54), 122)
      archiveStack.setDepth(8)
    } else {
      this.add.rectangle(visualX, gate.y + gate.height / 2 - 4, gate.width + 34, 58, 0x1b2130, 0.74)
      this.add.rectangle(visualX, gate.y - 76, Math.min(148, gate.width * 0.54), 104, 0x2f261a, 0.82)
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
    this.player.setCollideWorldBounds(true)
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

    getShadowRunnerLevelEnemies(this.level).forEach(enemyStart => {
      const enemy = this.createEnemySprite(enemyStart)
      this.enemies.push(enemy)
      this.enemyHealthBars.push(this.add.graphics())
      this.enemyHealthFrames.push(this.add.image(0, 0, 'shadow-runner-health-frame'))
    })

    this.archerProjectiles = this.physics.add.group({
      allowGravity: false,
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
    this.enemies.forEach(enemy => {
      this.physics.add.collider(enemy, this.platforms!)
      this.physics.add.overlap(this.player!, enemy, () => this.handlePlayerEnemyOverlap(this.time.now, enemy))
    })
    this.physics.add.collider(this.archerProjectiles, this.platforms!, projectile => {
      this.disableProjectile(projectile as Phaser.Physics.Arcade.Image)
    })
    this.physics.add.collider(this.archerProjectiles, this.crouchGates!, projectile => {
      this.disableProjectile(projectile as Phaser.Physics.Arcade.Image)
    })
    this.physics.add.overlap(this.player, this.archerProjectiles, (_player, projectile) => {
      const arrow = projectile as Phaser.Physics.Arcade.Image
      this.disableProjectile(arrow)
      this.damagePlayerFromHazard(this.time.now, arrow.x)
    })
    this.physics.add.overlap(this.player, this.spikes!, () => this.damagePlayerFromHazard(this.time.now))
    this.physics.add.overlap(this.player, this.coins!, (_player, coin) => {
      this.collectCoin(coin as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.boostPickups!, (_player, boost) => {
      this.collectBoost(boost as Phaser.Physics.Arcade.Sprite)
    })
  }

  private createEnemySprite(enemyStart: ShadowRunnerEnemyConfig) {
    const enemyTexture = enemyStart.kind === 'barrel-roller'
      ? 'barrel-roller'
      : enemyStart.kind === 'scroll-thief'
        ? 'scroll-thief'
        : enemyStart.kind === 'tower-archer'
          ? 'tower-archer'
          : 'clockwork-sentry'
    const enemy = this.physics.add.sprite(enemyStart.x, enemyStart.y, enemyTexture)
    enemy.setName(enemyStart.id)
    enemy.setData('enemyId', enemyStart.id)
    enemy.setData('enemyKind', enemyStart.kind)
    enemy.setData('startX', enemyStart.x)
    enemy.setData('startY', enemyStart.y)
    enemy.setOrigin(0.5, 1)
    enemy.setCollideWorldBounds(false)
    if (enemyStart.kind === 'barrel-roller') {
      enemy.setScale(BARREL_SCALE)
      enemy.setSize(58, 48)
      enemy.setOffset(35, 72)
      enemy.setMaxVelocity(196, 920)
      enemy.play('barrel-roll')
    } else if (enemyStart.kind === 'scroll-thief') {
      enemy.setScale(SCROLL_THIEF_SCALE)
      enemy.setSize(44, 62)
      enemy.setOffset(42, 66)
      enemy.setMaxVelocity(224, 920)
      enemy.play('scroll-walk')
    } else if (enemyStart.kind === 'tower-archer') {
      enemy.setScale(TOWER_ARCHER_SCALE)
      enemy.setSize(44, 70)
      enemy.setOffset(42, 58)
      enemy.setMaxVelocity(0, 920)
      enemy.play('archer-ready')
    } else {
      enemy.setScale(SENTRY_SCALE)
      enemy.setSize(50, 70)
      enemy.setOffset(39, 58)
      enemy.setMaxVelocity(128, 920)
      enemy.play('sentry-walk')
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
        this.teleportPlayerForQa(finish.x - 90, finish.y + finish.height)
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
        player: this.player
          ? {
              x: Math.round(this.player.x),
              y: Math.round(this.player.y),
              velocityX: Math.round(playerBody?.velocity.x ?? 0),
              velocityY: Math.round(playerBody?.velocity.y ?? 0),
              health: this.state.player.health,
              lives: this.state.player.lives,
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
          }
        }),
      }
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (debugWindow.__shadowRunnerDebug) {
        delete debugWindow.__shadowRunnerDebug
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
    return enemyState.patrolSpeed
      ?? (enemyState.kind === 'barrel-roller'
        ? BARREL_PATROL_SPEED
        : enemyState.kind === 'scroll-thief'
          ? SCROLL_THIEF_PATROL_SPEED
          : enemyState.kind === 'tower-archer'
            ? 0
            : SENTRY_PATROL_SPEED)
  }

  private getEnemyAnimation(enemyKind: ShadowRunnerEnemyKind, state: 'walk' | 'attack' | 'hit' | 'defeated') {
    if (enemyKind === 'barrel-roller') {
      return state === 'walk'
        ? 'barrel-roll'
        : state === 'attack'
          ? 'barrel-impact'
          : state === 'hit'
            ? 'barrel-hit'
            : 'barrel-defeated'
    }

    if (enemyKind === 'scroll-thief') {
      return state === 'walk'
        ? 'scroll-walk'
        : state === 'attack'
          ? 'scroll-attack'
          : state === 'hit'
            ? 'scroll-hit'
            : 'scroll-defeated'
    }

    if (enemyKind === 'tower-archer') {
      return state === 'walk'
        ? 'archer-ready'
        : state === 'attack'
          ? 'archer-shoot'
          : state === 'hit'
            ? 'archer-hit'
            : 'archer-defeated'
    }

    return state === 'walk'
      ? 'sentry-walk'
      : state === 'attack'
        ? 'sentry-attack'
        : state === 'hit'
          ? 'sentry-hit'
          : 'sentry-defeated'
  }

  private setEnemyFacing(enemy: Phaser.Physics.Arcade.Sprite, direction: 1 | -1) {
    const enemyKind = this.getEnemyKind(enemy)
    enemy.setFlipX(enemyKind === 'barrel-roller' ? direction < 0 : direction > 0)
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

    if (onFloor && body.velocity.y >= 0) {
      this.jumpsUsed = 0
      if (!this.wasOnFloor && time > 320) {
        this.playSound('land')
        this.addDustPuff(player.x, player.y - 22)
      }
    }

    if (left !== right) {
      const direction = right ? 1 : -1
      this.state.player.facing = direction
      player.setFlipX(direction < 0)
      player.setVelocityX((crouching ? CRAWL_SPEED : PLAYER_SPEED) * direction)
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
      this.damagePlayerFromHazard(time)
    }

    this.updateHeroAnimation(time, left || right, onFloor, crouching)
    this.wasOnFloor = onFloor
  }

  private applyTiltPlatformInfluence(time: number, left: boolean, right: boolean, onFloor: boolean) {
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
    const slideForce = platform.config.slideForce ?? 860
    const maxSlideSpeed = platform.config.maxSlideSpeed ?? 110
    const platformId = platform.config.id
    const strongTilt = Math.abs(rotation) >= TILT_DUMP_ROTATION

    if (this.activeTiltPlatformId !== platformId || !strongTilt) {
      this.activeTiltPlatformId = platformId
      this.activeTiltStartedAt = strongTilt ? time : 0
    }

    const tiltHoldMs = strongTilt && this.activeTiltStartedAt > 0 ? time - this.activeTiltStartedAt : 0
    const dumpReadiness = Phaser.Math.Clamp((tiltHoldMs - 420) / 920, 0, 1)
    const waitingOnBridge = !left && !right
    const slideMultiplier = strongTilt && waitingOnBridge ? 1.24 + dumpReadiness * 1.45 : 1
    const slideLimit = maxSlideSpeed + (waitingOnBridge ? dumpReadiness * 120 : dumpReadiness * 42)
    const slideVelocity = Phaser.Math.Clamp(rotation * slideForce * slideMultiplier, -slideLimit, slideLimit)

    if (Math.abs(slideVelocity) < 5 || Math.abs(rotation) < TILT_ACTIVE_ROTATION) return

    const inputDamping = left || right ? 0.42 : 1
    const dumpNudge = waitingOnBridge && dumpReadiness > 0.72 ? Math.sign(rotation) * 28 : 0
    const nextVelocity = Phaser.Math.Clamp(body.velocity.x + slideVelocity * inputDamping + dumpNudge, -430, 430)
    this.player.setVelocityX(nextVelocity)
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

  private updateEnemies(time: number) {
    this.enemies.forEach(enemy => {
      const enemyState = this.getEnemyState(enemy)
      if (!enemyState?.alive) return
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

      if (recentlyHit) {
        enemy.setVelocityX(body.velocity.x * 0.78)
      } else if (time < enemyState.attackUntil) {
        enemy.setVelocityX(0)
      } else {
        const direction = enemyState.direction
        const patrolSpeed = this.getEnemyPatrolSpeed(enemyState)
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
    const canShoot = dx <= range && dy <= 180 && time - enemyState.lastShotAt >= cooldown

    if (canShoot) {
      enemyState.lastShotAt = time
      enemyState.attackUntil = time + 360
      enemy.play(this.getEnemyAnimation('tower-archer', 'attack'), true)
      this.createArcherProjectile(enemy, enemyState.direction, projectileSpeed)
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

  private createArcherProjectile(enemy: Phaser.Physics.Arcade.Sprite, direction: 1 | -1, speed: number) {
    if (!this.archerProjectiles) return

    const arrowFrame = getTerrainFrameKey('bell-arrow')
    const hasAtlasArrow = this.textures.exists('shadow-runner-bell-terrain-atlas')
      && this.textures.get('shadow-runner-bell-terrain-atlas').has(arrowFrame)
    const projectile = hasAtlasArrow
      ? this.archerProjectiles.create(enemy.x + direction * 42, enemy.y - 56, 'shadow-runner-bell-terrain-atlas', arrowFrame)
      : this.archerProjectiles.create(enemy.x + direction * 42, enemy.y - 56, 'shadow-runner-arrow')

    const arrow = projectile as Phaser.Physics.Arcade.Image
    arrow.setDepth(19)
    arrow.setDisplaySize(72, 16)
    arrow.setFlipX(direction < 0)
    arrow.setData('spawnedAt', this.time.now)
    arrow.setVelocityX(direction * speed)

    const body = arrow.body as Phaser.Physics.Arcade.Body
    body.allowGravity = false
    body.setSize(54, 10)
    body.setOffset(9, 3)
  }

  private updateArcherProjectiles(time: number) {
    this.archerProjectiles?.getChildren().forEach(child => {
      const projectile = child as Phaser.Physics.Arcade.Image
      if (!projectile.active) return

      const spawnedAt = Number(projectile.getData('spawnedAt') ?? time)
      const expired = time - spawnedAt > ARCHER_PROJECTILE_LIFETIME_MS
      const outsideWorld = projectile.x < -80 || projectile.x > this.level.worldWidth + 80

      if (expired || outsideWorld) {
        this.disableProjectile(projectile)
      }
    })
  }

  private disableProjectile(projectile: Phaser.Physics.Arcade.Image) {
    projectile.disableBody(true, true)
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
    const slashX = player.x + facing * 48
    const slashY = player.y - 46

    this.slashArc?.clear()
    if (!this.slashSprite?.visible) {
      this.slashArc?.lineStyle(5, 0xf0d381, 0.94)
      this.slashArc?.arc(slashX, slashY, 34, facing === 1 ? -0.9 : 2.2, facing === 1 ? 0.9 : 4.05)
      this.slashArc?.strokePath()
    }

    const enemy = this.enemies.find(current => {
      const enemyState = this.getEnemyState(current)
      if (!enemyState?.alive) return false

      const reachX = facing === 1 ? current.x - player.x : player.x - current.x
      const vertical = Math.abs(current.y - player.y)
      return reachX > 0 && reachX < 106 && vertical < 74
    })
    if (!enemy) return

    const enemyState = this.getEnemyState(enemy)
    const boostActive = isShadowRunnerBoostActive(this.state, time)
    const damaged = damageShadowRunnerEnemy(this.state, time, boostActive ? 2 : 1, this.getEnemyId(enemy))
    if (damaged) {
      if (enemyState) {
        enemyState.attackUntil = time + 160
      }
      this.playSound('enemy-hit')
      enemy.setVelocityX(facing * (boostActive ? 245 : 190))
      this.addHitFlash(enemy.x, enemy.y - 42)
      if (!enemyState?.alive) {
        this.defeatEnemy(enemy)
      }
    }
  }

  private handlePlayerEnemyOverlap(time: number, enemy: Phaser.Physics.Arcade.Sprite) {
    const player = this.player
    const enemyState = this.getEnemyState(enemy)
    if (!player || !enemyState?.alive) return

    const body = player.body as Phaser.Physics.Arcade.Body
    const isStomp = body.velocity.y > 130 && player.y < enemy.y - 24

    if (isStomp) {
      const stompDamage = isShadowRunnerBoostActive(this.state, time) ? 3 : 2
      const damaged = damageShadowRunnerEnemy(this.state, time, stompDamage, this.getEnemyId(enemy))
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

    const damaged = this.damagePlayerFromHazard(time, enemy.x)
    if (damaged) {
      const enemyKind = this.getEnemyKind(enemy)
      enemyState.attackUntil = time + (enemyKind === 'barrel-roller' ? 340 : 280)
      enemyState.direction = player.x < enemy.x ? -1 : 1
      this.setEnemyFacing(enemy, enemyState.direction)
      enemy.play(this.getEnemyAnimation(enemyKind, 'attack'), true)
    }
  }

  private damagePlayerFromHazard(time: number, sourceX?: number) {
    const resistedHit = isShadowRunnerBoostActive(this.state, time) && this.state.player.boostGuardCharges > 0
    const damaged = damageShadowRunnerPlayer(this.state, time)
    if (!damaged || !this.player) return false

    this.playSound('player-hurt')
    const knockback = sourceX === undefined
      ? (this.state.player.facing === 1 ? -1 : 1)
      : (this.player.x < sourceX ? -1 : 1)
    const knockbackStrength = resistedHit ? 145 : 220
    this.player.setVelocity(knockback * knockbackStrength, resistedHit ? -210 : -290)
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

  private respawnPlayer() {
    if (!this.player || this.state.outOfLives) return

    restoreShadowRunnerPlayer(this.state)
    this.jumpsUsed = 0
    this.player.setVelocity(0, 0)
    this.player.setPosition(this.level.playerStart.x, this.level.playerStart.y)
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

  private updateHealthBars() {
    this.drawHealthBar(this.playerHealthBar, this.playerHealthFrame, this.player?.x ?? 0, (this.player?.y ?? 0) - 94, this.state.player.health, this.state.player.maxHealth)

    this.enemies.forEach((enemy, index) => {
      const enemyState = this.getEnemyState(enemy)
      const healthBar = this.enemyHealthBars[index]
      const healthFrame = this.enemyHealthFrames[index]

      if (enemyState?.alive) {
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
    if (!this.player || this.state.defeated || this.state.outOfLives) return

    const finish = this.level.finish
    if (this.player.x > finish.x && this.player.y > finish.y - 8) {
      this.state.defeated = true
      this.state.objective = this.level.completionLine
      this.state.player.score += 300
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
