import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_TEN } from '../src/features/games/shadow-runner/game/levelTen'
import { SHADOW_RUNNER_ENEMY_RUNTIME } from '../src/features/games/shadow-runner/game/runtimeCatalog'

jest.mock('phaser', () => ({ __esModule: true, default: {
  Scene: class { events = new (jest.requireActual('eventemitter3'))() },
  Game: class { constructor(public config: { scene: unknown[] }) {} },
  Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
  Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
  Loader: { Events: jest.requireActual('phaser/src/loader/events') },
  Math: { Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)) },
  Geom: {
    Line: jest.requireActual('phaser/src/geom/line/Line'),
    Rectangle: jest.requireActual('phaser/src/geom/rectangle/Rectangle'),
    Intersects: { LineToRectangle: jest.requireActual('phaser/src/geom/intersects/LineToRectangle') },
  },
} }))

const drones = SHADOW_RUNNER_LEVEL_TEN.enemies!.filter(enemy => enemy.kind === 'gearwing-drone')

function fixture(config = drones[0]) {
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'),
    input: { current: createShadowRunnerInputState() }, levelId: 'level-10', onHudChange: jest.fn() })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  scene.player = { x: config.x, y: 616 }
  scene.setEnemyFacing = jest.fn()
  const state = scene.state.enemies.find((enemy: { id: string }) => enemy.id === config.id)
  Object.assign(state, { attackUntil: 0, lastShotAt: 0, direction: -1 })
  const data = new Map<string, unknown>([['startY', config.y], ['hoverPhase', 0]])
  const sprite = {
    x: config.x, y: config.y!, vx: 0, vy: 0,
    getData: (key: string) => data.get(key),
    setData: (key: string, value: unknown) => data.set(key, value),
    setVelocity(x: number, y: number) { this.vx = x; this.vy = y },
    play: jest.fn(), setTint: jest.fn(), clearTint: jest.fn(),
  }
  return { scene, sprite, state, update: (time: number) => scene.updateGearwingDrone(time, sprite, state) }
}

describe('Gearwing territorial dive recovery', () => {
  test('the Foundry stalled-fight trace closes distance instead of repeating unreachable dives', () => {
    const { scene, sprite, state, update } = fixture()
    Object.assign(sprite, { x: 6134, y: 365 })
    scene.player.x = 6403
    update(60000)
    expect(state.attackUntil).toBe(0)
    expect(sprite.play).toHaveBeenLastCalledWith('gearwing-drone-flight', true)
  })

  test.each([30, 60, 120])('patrol reaches a viable dive window at %ifps without extending attack travel', fps => {
    const { scene, sprite, state, update } = fixture()
    Object.assign(sprite, { x: 6134, y: 365 })
    state.direction = 1
    scene.player.x = 6403
    let started = false
    for (let frame = 0; frame < 600; frame += 1) {
      update(60000 + frame * 1000 / fps)
      if (state.attackUntil > 60000 + frame * 1000 / fps) {
        expect(Math.abs(sprite.x - scene.player.x)).toBeLessThanOrEqual(225 * 0.58 + 42)
        started = true
        break
      }
      sprite.x += sprite.vx / fps
      sprite.y += sprite.vy / fps
    }
    expect(started).toBe(true)
    expect(state.attackUntil - state.lastShotAt).toBe(880)
    update(state.lastShotAt + 300)
    expect([Math.abs(sprite.vx), sprite.vy]).toEqual([225, 310])
  })

  test.each(drones)('$id does not start a dive at a player outside its authored patrol', config => {
    for (const side of [-1, 1]) {
      const { scene, sprite, state, update } = fixture(config)
      sprite.x = side < 0 ? config.patrolLeft + 1 : config.patrolRight - 1
      scene.player.x = side < 0 ? config.patrolLeft - 100 : config.patrolRight + 100
      update(5000)
      expect(state.attackUntil).toBe(0)
      expect(sprite.play).toHaveBeenLastCalledWith('gearwing-drone-flight', true)
    }
  })

  test('the phase-boarding trace cannot pull the Foundry drone into another dive west of its patrol', () => {
    const { scene, sprite, state, update } = fixture()
    Object.assign(sprite, { x: 5885, y: 396 })
    scene.player.x = 5730
    update(51000)
    expect(state.attackUntil).toBe(0)
    expect(state.direction).toBe(1)
    expect(sprite.vx).toBeGreaterThan(0)
  })

  test('an overshot drone returns inward immediately, even if the player is back inside', () => {
    for (const side of [-1, 1]) {
      const { scene, sprite, state, update } = fixture()
      sprite.x = side < 0 ? state.patrolLeft - 90 : state.patrolRight + 90
      scene.player.x = side < 0 ? state.patrolLeft + 30 : state.patrolRight - 30
      state.direction = side
      update(5000)
      expect(state.attackUntil).toBe(0)
      expect(Math.sign(sprite.vx)).toBe(-side)
    }
  })

  test('recovery must regain flight height before another tell, without changing dive speed or duration', () => {
    const { scene, sprite, state, update } = fixture()
    sprite.y = 540
    scene.player.x = sprite.x - 100
    update(5000)
    expect(state.attackUntil).toBe(0)
    expect(sprite.vy).toBeLessThan(0)
    sprite.y = drones[0].y!
    update(5100)
    expect(state.attackUntil).toBe(5980)
    expect(state.lastShotAt).toBe(5100)
    expect(sprite.play).toHaveBeenLastCalledWith('gearwing-drone-tell', true)
    update(5399)
    expect([sprite.vx, sprite.vy]).toEqual([0, 0])
    update(5400)
    expect([sprite.vx, sprite.vy]).toEqual([-225, 310])
    expect(sprite.play).toHaveBeenLastCalledWith('gearwing-drone-dive', true)
  })
})

const Body = jest.requireActual('phaser/src/physics/arcade/Body')

function actor(id: string, x: number, y: number, drone = false) {
  const art = SHADOW_RUNNER_ENEMY_RUNTIME['gearwing-drone']
  const data = new Map<string, unknown>([['enemyId', id], ['enemyKind', drone ? 'gearwing-drone' : 'player'],
    ['startX', x], ['startY', y], ['hoverPhase', 0], ['droneAttackUntil', 0]])
  const sprite: any = {
    x, y, active: true, width: drone ? 256 : 128, height: drone ? 192 : 128,
    scaleX: drone ? art.scale : 0.78, scaleY: drone ? art.scale : 0.78,
    displayOriginX: drone ? 128 : 64, displayOriginY: drone ? 192 : 128,
    getData: (key: string) => data.get(key),
    setData(key: string, value: unknown) { data.set(key, value); return this },
    setPosition(x: number, y: number) { this.x = x; this.y = y; this.body.updateFromGameObject(); return this },
    setVelocity(x: number, y: number) { this.body.velocity.set(x, y); return this },
    setVelocityX(x: number) { this.body.velocity.x = x; return this },
    setVelocityY(y: number) { this.body.velocity.y = y; return this },
    enableBody(_reset: boolean, x: number, y: number) { this.setPosition(x, y); this.body.enable = true; return this },
    setFlipX: jest.fn(), play: jest.fn(), setTint: jest.fn(), clearTint: jest.fn(),
  }
  sprite.body = new Body({ defaults: {}, bounds: {} }, sprite)
  sprite.body.setSize(drone ? art.body.width : 42, drone ? art.body.height : 70)
  sprite.body.setOffset(drone ? art.body.offsetX : 43, drone ? art.body.offsetY : 58)
  sprite.body.updateFromGameObject()
  return sprite
}

function combatFixture(config: typeof drones[number]) {
  const { scene, state } = fixture(config)
  const sprite = actor(config.id, config.x, config.y!, true)
  Object.assign(state, { activated: true })
  scene.player = actor('player', config.x + 100, 616)
  scene.enemies = [sprite]
  scene.gameplayPaused = false
  scene.time = { delayedCall: jest.fn() }
  for (const method of ['playSound', 'playSwordSlash', 'addHitFlash', 'addDustPuff', 'shakeCamera', 'emitHud']) {
    scene[method] = jest.fn()
  }
  const update = (time: number) => { scene.activeTimeMs = time; scene.updateEnemies(time) }
  const react = (kind: string, time: number) => {
    scene.activeTimeMs = time
    scene.player.setPosition(sprite.x - 50, sprite.y)
    scene.player.setVelocity(0, 0)
    if (kind === 'sword') {
      scene.state.player.facing = 1
      scene.tryAttack(time)
      scene.resolveAttackHit(time)
    } else if (kind === 'reflected') {
      const projectile = { active: true, getData: (key: string) => key === 'reflectedByPlayer' ? true : 1 }
      scene.disableProjectile = jest.fn()
      scene.handleReflectedProjectileEnemyHit(sprite, projectile)
    } else {
      if (kind === 'stomp') {
        scene.player.setPosition(sprite.x, sprite.y - 30)
        scene.player.setVelocityY(150)
      }
      scene.handlePlayerEnemyOverlap(time, sprite)
    }
  }
  return { scene, state, sprite, update, react }
}

describe.each(drones)('$id production reaction ownership', config => {
  test.each(['sword', 'stomp', 'contact', 'reflected'])('%s never starts or resumes a dive in hover, tell, or dive', kind => {
    for (const phase of ['hover', 'tell', 'dive']) {
      const f = combatFixture(config)
      if (phase !== 'hover') f.update(5000)
      const time = phase === 'dive' ? 5500 : 5100
      if (phase === 'dive') f.update(time)
      const lastShotAt = f.state.lastShotAt
      const hp = f.state.health
      f.react(kind, time)
      expect(f.state.health).toBe(hp - (kind === 'contact' ? 0 : kind === 'sword' ? 1 : 2))
      expect(f.sprite.getData('droneAttackUntil')).toBe(0)
      expect(f.state.lastShotAt).toBe(lastShotAt)
      expect(f.state.attackUntil).toBe(time + (kind === 'contact' ? 280 : 160))
      const reactionAnimation = kind === 'contact' ? 'gearwing-drone-flight' : 'gearwing-drone-hit'
      expect(f.sprite.play).toHaveBeenLastCalledWith(reactionAnimation, true)
      const knockbackX = f.sprite.body.velocity.x
      f.update(time + 1)
      expect(f.sprite.body.velocity.x).toBe(knockbackX)
      expect(f.sprite.body.velocity.y).toBe(0)
      expect(f.sprite.getData('droneAttackUntil')).toBe(0)
      f.update(f.state.attackUntil - 1)
      expect(f.sprite.play).toHaveBeenLastCalledWith(reactionAnimation, true)
      f.scene.player.setPosition(config.patrolLeft - 100, 616)
      f.sprite.setPosition(config.x, config.y! + 150)
      f.update(f.state.attackUntil)
      expect(f.sprite.body.velocity.y).toBeLessThan(0)
      expect(f.sprite.play).toHaveBeenLastCalledWith('gearwing-drone-flight', true)
    }
  })

  test.each(['sword', 'reflected'])('cooldown-rejected %s preserves the live tell/dive and its animation', kind => {
    for (const time of [5100, 5500]) {
      const f = combatFixture(config)
      f.update(5000)
      f.update(time)
      f.state.lastDamagedAt = time - 10
      const velocity = [f.sprite.body.velocity.x, f.sprite.body.velocity.y]
      const animation = time === 5100 ? 'gearwing-drone-tell' : 'gearwing-drone-dive'
      f.sprite.play.mockClear()
      f.react(kind, time)
      expect(f.state.health).toBe(4)
      expect(f.state.lastDamagedAt).toBe(time - 10)
      expect(f.state.lastShotAt).toBe(5000)
      expect(f.state.attackUntil).toBe(5880)
      expect(f.sprite.getData('droneAttackUntil')).toBe(5880)
      expect([f.sprite.body.velocity.x, f.sprite.body.velocity.y]).toEqual(velocity)
      expect(f.sprite.play).not.toHaveBeenCalled()
      if (kind === 'reflected') expect(f.scene.disableProjectile).not.toHaveBeenCalled()
      f.update(time + 1)
      expect(f.sprite.getData('droneAttackUntil')).toBe(5880)
      expect([f.sprite.body.velocity.x, f.sprite.body.velocity.y]).toEqual(velocity)
      expect(f.sprite.play).toHaveBeenLastCalledWith(animation, true)
    }
  })

  test('stomp bounce cancels even when enemy damage is on cooldown; invulnerable contact does not cancel', () => {
    const f = combatFixture(config)
    f.update(5000)
    f.state.lastDamagedAt = 5090
    f.react('stomp', 5100)
    expect(f.state.health).toBe(4)
    expect(f.scene.player.body.velocity.y).toBe(-390)
    expect(f.sprite.getData('droneAttackUntil')).toBe(0)
    const g = combatFixture(config)
    g.update(5000)
    g.scene.state.player.lastDamagedAt = 5090
    g.react('contact', 5100)
    expect(g.sprite.getData('droneAttackUntil')).toBe(5880)
    expect(g.state.attackUntil).toBe(5880)
  })

  test.each(['sword', 'stomp', 'reflected'])('lethal %s clears ownership and leaves a disabled corpse', kind => {
    const f = combatFixture(config)
    f.update(5000)
    f.state.health = 1
    f.react(kind, 5400)
    expect(f.state.alive).toBe(false)
    expect(f.sprite.body.enable).toBe(false)
    expect(f.sprite.getData('droneAttackUntil')).toBe(0)
    expect(f.state.attackUntil).toBe(0)
    f.update(5500)
    expect(f.sprite.body.velocity.x).toBe(0)
    expect(f.sprite.body.velocity.y).toBe(0)
    expect(f.sprite.play).toHaveBeenLastCalledWith('gearwing-drone-defeated', true)
    expect(f.sprite.play).not.toHaveBeenCalledWith('gearwing-drone-hit', true)
  })

  test('falling reset drops attack history but retains health, activation and cooldown', () => {
    const f = combatFixture(config)
    f.update(5000)
    f.update(5400)
    f.state.health = 3
    f.sprite.setPosition(config.x + 200, f.scene.level.worldHeight + 111)
    f.update(5401)
    expect([f.sprite.x, f.sprite.y]).toEqual([config.x, config.y])
    expect([f.state.health, f.state.activated, f.state.lastShotAt]).toEqual([3, true, 5000])
    expect(f.state.attackUntil).toBe(0)
    expect(f.sprite.getData('droneAttackUntil')).toBe(0)
    expect(f.sprite.play).toHaveBeenLastCalledWith('gearwing-drone-flight', true)
  })

  test.each(['tell', 'dive', 'fall', 'last-life'])('player death during %s stops velocity and cannot resume the old attack', phase => {
    const f = combatFixture(config)
    f.update(5000)
    const time = phase === 'tell' ? 5100 : 5400
    f.update(time)
    f.scene.state.player.health = 1
    if (phase === 'last-life') f.scene.state.player.lives = 1
    if (phase === 'fall') f.scene.handlePlayerFellOut()
    else f.react('contact', time)
    expect(f.scene.respawnPending).toBe(true)
    expect(f.sprite.getData('droneAttackUntil')).toBe(0)
    expect([f.sprite.body.velocity.x, f.sprite.body.velocity.y]).toEqual([0, 0])
    f.scene.activeTimeMs = time + 260
    f.scene.respawnPlayer()
    if (phase === 'last-life') {
      expect(f.scene.state.outOfLives).toBe(true)
      expect(f.scene.respawnPending).toBe(true)
      expect(f.scene.player.body.enable).toBe(false)
      expect(f.sprite.getData('droneAttackUntil')).toBe(0)
      return
    }
    expect(f.scene.respawnPending).toBe(false)
    expect(f.scene.player.body.enable).toBe(true)
    expect([f.state.health, f.state.activated, f.state.lastShotAt]).toEqual([4, true, 5000])
    f.update(time + 281)
    expect(f.sprite.getData('droneAttackUntil')).toBe(0)
    expect(f.sprite.play).toHaveBeenLastCalledWith('gearwing-drone-flight', true)
  })

  test('sprite creation resets attack ownership and retains encounter activation rules', () => {
    const f = combatFixture(config)
    f.state.activated = !config.encounterId
    f.sprite.setData('droneAttackUntil', 9000)
    for (const method of ['setDepth', 'setName', 'setOrigin', 'setCollideWorldBounds', 'setScale',
      'setSize', 'setOffset', 'setMaxVelocity', 'setAlpha']) f.sprite[method] = jest.fn().mockReturnThis()
    f.scene.physics = { add: { sprite: jest.fn(() => f.sprite) } }
    expect(f.scene.createEnemySprite(config)).toBe(f.sprite)
    expect(f.sprite.getData('droneAttackUntil')).toBe(0)
    expect(f.sprite.body.allowGravity).toBe(false)
    expect(f.sprite.body.enable).toBe(!config.encounterId)
    expect(f.state.activated).toBe(!config.encounterId)
  })

  test('a cancelled attack rearms only with a fresh full tell and the original dive duration', () => {
    const f = combatFixture(config)
    f.update(5000)
    f.react('stomp', 5100)
    f.scene.player.setPosition(config.x + 100, 616)
    f.update(6549)
    expect(f.sprite.getData('droneAttackUntil')).toBe(0)
    f.update(6550)
    expect(f.state.lastShotAt).toBe(6550)
    expect(f.sprite.getData('droneAttackUntil')).toBe(7430)
    f.update(6849)
    expect([f.sprite.body.velocity.x, f.sprite.body.velocity.y]).toEqual([0, 0])
    f.update(6850)
    expect([f.sprite.body.velocity.x, f.sprite.body.velocity.y]).toEqual([225, 310])
    f.update(7429)
    expect(f.sprite.body.velocity.y).toBe(310)
    f.update(7430)
    expect(f.sprite.getData('droneAttackUntil')).toBe(0)
    expect(f.sprite.play).toHaveBeenLastCalledWith('gearwing-drone-flight', true)
  })
})
