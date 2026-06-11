import Phaser from 'phaser'
import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import { SHADOW_RUNNER_LEVEL_ONE } from './levelOne'
import type { ShadowRunnerInputRef } from './input'
import {
  collectShadowRunnerCoin,
  createInitialShadowRunnerSimulation,
  damageClockworkSentry,
  damageShadowRunnerPlayer,
  getShadowRunnerHudState,
  restoreShadowRunnerPlayer,
  spendShadowRunnerLife,
  type ShadowRunnerHudState,
  type ShadowRunnerSimulationState,
} from './simulation'

interface CreateShadowRunnerGameOptions {
  parent: HTMLElement
  input: ShadowRunnerInputRef
  onHudChange: (state: ShadowRunnerHudState) => void
  onReady?: () => void
}

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys

const GAME_WIDTH = 960
const GAME_HEIGHT = 540
const HERO_SCALE = 0.78
const SENTRY_SCALE = 0.68
const PLAYER_SPEED = 260
const SENTRY_PATROL_SPEED = 82
const CROUCH_SPEED = 128
const JUMP_VELOCITY = -620
const DOUBLE_JUMP_VELOCITY = -560
const GRAVITY_Y = 1640

interface TextureCrop {
  x: number
  y: number
  width: number
  height: number
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

const TERRAIN_CROPS: Record<string, TextureCrop> = {
  'west-walkway': { x: 48, y: 113, width: 368, height: 162 },
  'broken-step-a': { x: 463, y: 113, width: 340, height: 162 },
  'broken-step-b': { x: 864, y: 106, width: 351, height: 194 },
  'center-walkway': { x: 48, y: 113, width: 368, height: 162 },
  'east-ledge': { x: 864, y: 106, width: 351, height: 194 },
  'upper-coin-shelf': { x: 493, y: 368, width: 258, height: 178 },
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
) {
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
  private readonly onHudChange: (state: ShadowRunnerHudState) => void
  private readonly onReady?: () => void

  private state: ShadowRunnerSimulationState = createInitialShadowRunnerSimulation()
  private cursors?: CursorKeys
  private keys?: Record<'a' | 'd' | 'w' | 'space' | 'z' | 'j' | 'shift' | 's', Phaser.Input.Keyboard.Key>
  private platforms?: Phaser.Physics.Arcade.StaticGroup
  private spikes?: Phaser.Physics.Arcade.StaticGroup
  private coins?: Phaser.Physics.Arcade.StaticGroup
  private player?: Phaser.Physics.Arcade.Sprite
  private enemy?: Phaser.Physics.Arcade.Sprite
  private playerHealthBar?: Phaser.GameObjects.Graphics
  private enemyHealthBar?: Phaser.GameObjects.Graphics
  private playerHealthFrame?: Phaser.GameObjects.Image
  private enemyHealthFrame?: Phaser.GameObjects.Image
  private slashArc?: Phaser.GameObjects.Graphics
  private slashSprite?: Phaser.GameObjects.Sprite
  private readonly qaEnabled = isShadowRunnerLocalQaEnabled()
  private lastJumpPresses = 0
  private lastAttackPresses = 0
  private jumpsUsed = 0
  private wasOnFloor = false
  private enemyAttackUntil = 0
  private finishSparked = false
  private lastHudSignature = ''

  constructor(options: Omit<CreateShadowRunnerGameOptions, 'parent'>) {
    super('ShadowRunnerLevelScene')
    this.controls = options.input
    this.onHudChange = options.onHudChange
    this.onReady = options.onReady
  }

  preload() {
    this.load.image('shadow-runner-bg', SHADOW_RUNNER_ASSETS.home.background)
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
    this.load.image('shadow-runner-terrain-atlas', SHADOW_RUNNER_ASSETS.level.terrainAtlas)
    this.load.image('shadow-runner-tilt-bridge', SHADOW_RUNNER_ASSETS.level.tiltBridge256)
    this.load.spritesheet('shadow-runner-coin', SHADOW_RUNNER_ASSETS.level.coinStrip48, {
      frameWidth: 48,
      frameHeight: 48,
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
    this.state = createInitialShadowRunnerSimulation()
    this.wasOnFloor = false
    this.enemyAttackUntil = 0
    this.finishSparked = false
    this.physics.world.setBounds(0, 0, SHADOW_RUNNER_LEVEL_ONE.worldWidth, SHADOW_RUNNER_LEVEL_ONE.worldHeight)
    this.createTextures()
    this.registerTerrainFrames()
    this.createBackground()
    this.createAnimations()
    this.createLevel()
    this.createActors()
    this.createInput()

    this.cameras.main.setBounds(0, 0, SHADOW_RUNNER_LEVEL_ONE.worldWidth, SHADOW_RUNNER_LEVEL_ONE.worldHeight)
    this.cameras.main.startFollow(this.player!, true, 0.12, 0.12, -110, 52)
    this.cameras.main.setDeadzone(190, 92)

    this.emitHud(true)
    this.onReady?.()
  }

  update(time: number) {
    if (!this.player) return

    this.updatePlayer(time)
    this.updateEnemy(time)
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
      key: 'coin-spin',
      frames: this.anims.generateFrameNumbers('shadow-runner-coin', { start: 0, end: 7 }),
      frameRate: 10,
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

    SHADOW_RUNNER_LEVEL_ONE.platforms.forEach(platform => {
      const frameKey = getTerrainFrameKey(platform.id)
      const hasTerrainFrame = this.textures.exists('shadow-runner-terrain-atlas')
        && this.textures.get('shadow-runner-terrain-atlas').has(frameKey)

      addStaticPlatform(this, this.platforms!, platform, hasTerrainFrame
        ? { texture: 'shadow-runner-terrain-atlas', frame: frameKey, useImage: true }
        : { texture: 'shadow-runner-stone' })
    })

    SHADOW_RUNNER_LEVEL_ONE.tiltPlatforms.forEach((platform, index) => {
      const hasTiltAsset = this.textures.exists('shadow-runner-tilt-bridge')
      const sprite = addStaticPlatform(this, this.platforms!, platform, hasTiltAsset
        ? {
            texture: 'shadow-runner-tilt-bridge',
            useImage: true,
            displayWidth: platform.width + 18,
            displayHeight: 58,
            visualOffsetY: 16,
            depth: 4,
          }
        : { texture: 'shadow-runner-tilt-stone' })
      sprite.setData('tilt-platform', true)
      sprite.setData('baseRotation', index % 2 === 0 ? -0.05 : 0.05)
      this.tweens.add({
        targets: sprite,
        rotation: index % 2 === 0 ? 0.08 : -0.08,
        duration: 1150,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      })
    })

    SHADOW_RUNNER_LEVEL_ONE.spikes.forEach(spike => {
      addStaticPlatform(this, this.spikes!, spike, { texture: 'shadow-runner-spike-row' })
    })

    SHADOW_RUNNER_LEVEL_ONE.coins.forEach(coin => {
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
        delay: SHADOW_RUNNER_LEVEL_ONE.coins.indexOf(coin) * 90,
        ease: 'Sine.inOut',
      })
    })

    const finish = SHADOW_RUNNER_LEVEL_ONE.finish
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

  private createActors() {
    const start = SHADOW_RUNNER_LEVEL_ONE.playerStart
    this.player = this.physics.add.sprite(start.x, start.y, 'shadow-runner-idle')
    this.player.setOrigin(0.5, 1)
    this.player.setScale(HERO_SCALE)
    this.player.setCollideWorldBounds(true)
    this.player.setMaxVelocity(360, 940)
    this.player.setDragX(1450)
    this.player.setSize(42, 70)
    this.player.setOffset(43, 58)
    this.player.play('runner-idle')

    const enemyStart = SHADOW_RUNNER_LEVEL_ONE.enemyStart
    this.enemy = this.physics.add.sprite(enemyStart.x, enemyStart.y, 'clockwork-sentry')
    this.enemy.setOrigin(0.5, 1)
    this.enemy.setScale(SENTRY_SCALE)
    this.enemy.setSize(50, 70)
    this.enemy.setOffset(39, 58)
    this.enemy.setCollideWorldBounds(false)
    this.enemy.setMaxVelocity(105, 920)
    this.enemy.play('sentry-walk')

    this.playerHealthBar = this.add.graphics()
    this.enemyHealthBar = this.add.graphics()
    this.playerHealthFrame = this.add.image(0, 0, 'shadow-runner-health-frame')
    this.enemyHealthFrame = this.add.image(0, 0, 'shadow-runner-health-frame')
    this.slashArc = this.add.graphics()
    this.slashSprite = this.add.sprite(0, 0, 'shadow-runner-sword-slash')
    this.slashSprite.setVisible(false)
    this.slashSprite.setDepth(30)
    this.slashSprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.slashSprite?.setVisible(false)
    })

    this.physics.add.collider(this.player, this.platforms!)
    this.physics.add.collider(this.enemy, this.platforms!)
    this.physics.add.overlap(this.player, this.enemy, () => this.handlePlayerEnemyOverlap(this.time.now))
    this.physics.add.overlap(this.player, this.spikes!, () => this.damagePlayerFromHazard(this.time.now))
    this.physics.add.overlap(this.player, this.coins!, (_player, coin) => {
      this.collectCoin(coin as Phaser.Physics.Arcade.Sprite)
    })
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
        this.teleportPlayerForQa(SHADOW_RUNNER_LEVEL_ONE.enemyStart.x - 120, SHADOW_RUNNER_LEVEL_ONE.enemyStart.y)
      } else if (event.code === 'Digit3') {
        const finish = SHADOW_RUNNER_LEVEL_ONE.finish
        this.teleportPlayerForQa(finish.x - 90, finish.y + finish.height)
      } else if (event.code === 'KeyH') {
        this.damagePlayerFromHazard(this.time.now)
      } else if (event.code === 'KeyK') {
        this.damageEnemyForQa()
      }
    })
  }

  private teleportPlayerForQa(x: number, y: number) {
    if (!this.player) return

    this.player.setVelocity(0, 0)
    this.player.setPosition(x, y)
    this.cameras.main.centerOn(x, y - 80)
  }

  private damageEnemyForQa() {
    const enemy = this.enemy
    if (!enemy || !this.state.enemy.alive) return

    const damaged = damageClockworkSentry(this.state, this.time.now, 1)
    if (!damaged) return

    this.addHitFlash(enemy.x, enemy.y - 42)
    if (!this.state.enemy.alive) {
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
        this.addDustPuff(player.x, player.y - 22)
      }
    }

    if (left !== right) {
      const direction = right ? 1 : -1
      this.state.player.facing = direction
      player.setFlipX(direction < 0)
      player.setVelocityX((crouch ? CROUCH_SPEED : PLAYER_SPEED) * direction)
    } else {
      player.setVelocityX(0)
    }

    if (crouch && onFloor) {
      player.setSize(42, 50)
      player.setOffset(43, 78)
    } else {
      player.setSize(42, 70)
      player.setOffset(43, 58)
    }

    if (jumpPress) {
      this.tryJump(onFloor)
    }

    if (attackPress) {
      this.tryAttack(time)
    }

    this.resolveAttackHit(time)

    if (player.y > SHADOW_RUNNER_LEVEL_ONE.worldHeight + 90) {
      this.damagePlayerFromHazard(time)
    }

    this.updateHeroAnimation(time, left || right, onFloor)
    this.wasOnFloor = onFloor
  }

  private updateEnemy(time: number) {
    const enemy = this.enemy
    if (!enemy || !this.state.enemy.alive) return

    if (time < this.enemyAttackUntil) {
      enemy.setVelocityX(0)
    } else {
      const direction = this.state.enemy.direction
      enemy.setVelocityX(direction * SENTRY_PATROL_SPEED)
      enemy.setFlipX(direction > 0)

      if (direction < 0 && enemy.x <= this.state.enemy.patrolLeft) {
        enemy.setX(this.state.enemy.patrolLeft)
        this.state.enemy.direction = 1
        enemy.setVelocityX(SENTRY_PATROL_SPEED)
        enemy.setFlipX(true)
      } else if (direction > 0 && enemy.x >= this.state.enemy.patrolRight) {
        enemy.setX(this.state.enemy.patrolRight)
        this.state.enemy.direction = -1
        enemy.setVelocityX(-SENTRY_PATROL_SPEED)
        enemy.setFlipX(false)
      }
    }

    if (time - this.state.enemy.lastDamagedAt < 180) {
      enemy.play('sentry-hit', true)
      enemy.setTint(0xffe08a)
    } else if (time < this.enemyAttackUntil) {
      enemy.clearTint()
      if (enemy.anims.currentAnim?.key !== 'sentry-attack') {
        enemy.play('sentry-attack', true)
      }
    } else {
      enemy.clearTint()
      if (enemy.anims.currentAnim?.key !== 'sentry-walk') {
        enemy.play('sentry-walk', true)
      }
    }
  }

  private tryJump(onFloor: boolean) {
    if (!this.player) return

    if (onFloor) {
      this.player.setVelocityY(JUMP_VELOCITY)
      this.jumpsUsed = 1
      return
    }

    if (this.jumpsUsed < 2) {
      this.player.setVelocityY(DOUBLE_JUMP_VELOCITY)
      this.jumpsUsed = 2
      this.addDustPuff(this.player.x, this.player.y - 52)
    }
  }

  private tryAttack(time: number) {
    if (time < this.state.player.attackCooldownUntil) return

    this.state.player.attackingUntil = time + 265
    this.state.player.attackCooldownUntil = time + 420
    this.player?.play('runner-attack', true)
    this.playSwordSlash()
  }

  private resolveAttackHit(time: number) {
    const player = this.player
    const enemy = this.enemy
    if (!player || !enemy || !this.state.enemy.alive || time > this.state.player.attackingUntil) {
      this.slashArc?.clear()
      return
    }

    const facing = this.state.player.facing
    const reachX = facing === 1 ? enemy.x - player.x : player.x - enemy.x
    const vertical = Math.abs(enemy.y - player.y)
    const slashX = player.x + facing * 48
    const slashY = player.y - 46

    this.slashArc?.clear()
    if (!this.slashSprite?.visible) {
      this.slashArc?.lineStyle(5, 0xf0d381, 0.94)
      this.slashArc?.arc(slashX, slashY, 34, facing === 1 ? -0.9 : 2.2, facing === 1 ? 0.9 : 4.05)
      this.slashArc?.strokePath()
    }

    if (reachX > 0 && reachX < 106 && vertical < 74) {
      const damaged = damageClockworkSentry(this.state, time, 1)
      if (damaged) {
        enemy.setVelocityX(facing * 190)
        this.addHitFlash(enemy.x, enemy.y - 42)
        if (!this.state.enemy.alive) {
          this.defeatEnemy(enemy)
        }
      }
    }
  }

  private handlePlayerEnemyOverlap(time: number) {
    const player = this.player
    const enemy = this.enemy
    if (!player || !enemy || !this.state.enemy.alive) return

    const body = player.body as Phaser.Physics.Arcade.Body
    const isStomp = body.velocity.y > 130 && player.y < enemy.y - 24

    if (isStomp) {
      const damaged = damageClockworkSentry(this.state, time, 2)
      player.setVelocityY(-390)
      if (damaged) {
        this.addHitFlash(enemy.x, enemy.y - 42)
      }
      if (!this.state.enemy.alive) {
        this.defeatEnemy(enemy)
      }
      return
    }

    const damaged = this.damagePlayerFromHazard(time, enemy.x)
    if (damaged) {
      this.enemyAttackUntil = time + 280
      this.state.enemy.direction = player.x < enemy.x ? -1 : 1
      enemy.setFlipX(this.state.enemy.direction > 0)
      enemy.play('sentry-attack', true)
    }
  }

  private damagePlayerFromHazard(time: number, sourceX?: number) {
    const damaged = damageShadowRunnerPlayer(this.state, time)
    if (!damaged || !this.player) return false

    const knockback = sourceX === undefined
      ? (this.state.player.facing === 1 ? -220 : 220)
      : (this.player.x < sourceX ? -220 : 220)
    this.player.setVelocity(knockback, -290)
    this.player.setTint(0xffd0b3)

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
      this.player?.setVelocity(0, 0)
      this.player?.setTint(0x6d7380)
      this.addDustPuff(this.player?.x ?? 0, (this.player?.y ?? 0) - 28)
      return
    }

    this.time.delayedCall(260, () => {
      this.respawnPlayer()
    })
  }

  private respawnPlayer() {
    if (!this.player || this.state.outOfLives) return

    restoreShadowRunnerPlayer(this.state)
    this.jumpsUsed = 0
    this.player.setVelocity(0, 0)
    this.player.setPosition(SHADOW_RUNNER_LEVEL_ONE.playerStart.x, SHADOW_RUNNER_LEVEL_ONE.playerStart.y)
    this.player.clearTint()
    this.addDustPuff(this.player.x, this.player.y - 28)
    this.emitHud(true)
  }

  private collectCoin(coin: Phaser.Physics.Arcade.Sprite) {
    if (coin.getData('collected')) return

    coin.setData('collected', true)
    collectShadowRunnerCoin(this.state)
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

  private defeatEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    const body = enemy.body as Phaser.Physics.Arcade.Body
    body.enable = false
    enemy.setVelocity(0, 0)
    enemy.clearTint()
    enemy.play('sentry-defeated', true)
    this.addDustPuff(enemy.x, enemy.y - 28)
  }

  private updateHeroAnimation(time: number, moving: boolean, onFloor: boolean) {
    if (!this.player) return

    if (time < this.state.player.attackingUntil) return

    if (!onFloor) {
      if (this.player.anims.currentAnim?.key !== 'runner-jump') {
        this.player.play('runner-jump', true)
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

  private updateHealthBars() {
    this.drawHealthBar(this.playerHealthBar, this.playerHealthFrame, this.player?.x ?? 0, (this.player?.y ?? 0) - 94, this.state.player.health, this.state.player.maxHealth)

    if (this.enemy && this.state.enemy.alive) {
      this.drawHealthBar(this.enemyHealthBar, this.enemyHealthFrame, this.enemy.x, this.enemy.y - 74, this.state.enemy.health, this.state.enemy.maxHealth)
    } else {
      this.enemyHealthBar?.clear()
      this.enemyHealthFrame?.setVisible(false)
    }
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
    const ratio = Phaser.Math.Clamp(health / maxHealth, 0, 1)

    frame?.setVisible(true)
    frame?.setPosition(x, y)
    frame?.setDisplaySize(74, 18)
    frame?.setDepth(32)

    graphics.clear()
    graphics.setDepth(33)
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

    const finish = SHADOW_RUNNER_LEVEL_ONE.finish
    if (this.player.x > finish.x && this.player.y > finish.y - 8) {
      this.state.defeated = true
      this.state.objective = 'Gate reached'
      this.state.player.score += 300
      if (!this.finishSparked) {
        this.finishSparked = true
        this.addDustPuff(finish.x + finish.width / 2, finish.y + finish.height - 20)
        this.addCoinSparkle(finish.x + finish.width / 2, finish.y + 38)
      }
      this.emitHud(true)
    }
  }

  private emitHud(force = false) {
    const hud = getShadowRunnerHudState(this.state, SHADOW_RUNNER_LEVEL_ONE.coins.length)
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
  }

  private registerTerrainFrames() {
    if (!this.textures.exists('shadow-runner-terrain-atlas')) return

    const terrainTexture = this.textures.get('shadow-runner-terrain-atlas')

    Object.entries(TERRAIN_CROPS).forEach(([platformId, crop]) => {
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
        onHudChange: options.onHudChange,
        onReady: options.onReady,
      }),
    ],
  })
}
