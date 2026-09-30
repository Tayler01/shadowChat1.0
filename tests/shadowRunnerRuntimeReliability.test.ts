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
} from '../src/features/games/shadow-runner/game/runtimeReliability'
import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_CONFIGS, type ShadowRunnerCheckpoint } from '../src/features/games/shadow-runner/game/levels'
import { createInitialShadowRunnerSimulation, spendShadowRunnerLife } from '../src/features/games/shadow-runner/game/simulation'

jest.mock('phaser', () => {
  const Events = jest.requireActual('eventemitter3')
  return {
    __esModule: true,
    default: {
      Scene: class { events = new Events() },
      Game: class { constructor(public config: { scene: unknown[] }) {} },
      Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
      Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
      Loader: { Events: jest.requireActual('phaser/src/loader/events') },
      Input: { Keyboard: { JustDown: () => false } },
      Geom: {
        Line: jest.requireActual('phaser/src/geom/line/Line'),
        Rectangle: jest.requireActual('phaser/src/geom/rectangle/Rectangle'),
        Intersects: { LineToRectangle: jest.requireActual('phaser/src/geom/intersects/LineToRectangle') },
      },
      Math: { Clamp: (n: number, a: number, b: number) => Math.max(a, Math.min(b, n)) },
    },
  }
})

const level8 = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
const level9 = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
const level10 = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']

describe('Shadow Runner pure runtime reliability rules', () => {
  test('active time follows frame deltas, never the wall-clock pause interval', () => {
    let activeTime = advanceShadowRunnerActiveTime(1000, 16)
    const deadline = activeTime + 11000
    // No scene frame is emitted during the 20-second pause.
    activeTime = advanceShadowRunnerActiveTime(activeTime, 16)
    expect(deadline - activeTime).toBe(10984)
    expect(advanceShadowRunnerActiveTime(activeTime, -1)).toBe(activeTime)
    expect(advanceShadowRunnerActiveTime(activeTime, Number.NaN)).toBe(activeTime)
  })

  test.each([0, 100, 212.8, 329, -200])('landing after net drop %s does not hurt', drop => {
    expect(getShadowRunnerLandingDamage(616, 616 + drop)).toBe(0)
  })
  test.each([[330, 2], [499, 2], [500, 4], [850, 4]])('net drop %s deals %s damage', (drop, damage) => {
    expect(getShadowRunnerLandingDamage(200, 200 + drop)).toBe(damage)
  })
  test('a spawn without a takeoff does not create fall damage', () => {
    expect(getShadowRunnerLandingDamage(null, 900)).toBe(0)
  })

  test('checkpoint requires both authored windows and does not credit an overshoot', () => {
    expect(findShadowRunnerCheckpoint(level8.checkpoints!, -1, { x: 2140, y: 250 })).toBe(-1)
    expect(findShadowRunnerCheckpoint(level8.checkpoints!, -1, { x: 2140, y: 590 })).toBe(-1)
    expect(findShadowRunnerCheckpoint(level8.checkpoints!, -1, { x: 1900, y: 590 })).toBe(0)
  })
  test('a bypassed earlier checkpoint never blocks a later valid checkpoint', () => {
    const checkpoints: ShadowRunnerCheckpoint[] = [
      { id: 'a', label: 'A', x: 100, y: 600, triggerWidth: 800, minY: 500, maxY: 650 },
      { id: 'b', label: 'B', x: 500, y: 300, triggerWidth: 100, minY: 200, maxY: 350 },
    ]
    expect(findShadowRunnerCheckpoint(checkpoints, -1, { x: 550, y: 280 })).toBe(1)
    expect(findShadowRunnerCheckpoint(checkpoints, 1, { x: 120, y: 580 })).toBe(1)
  })
  test('legacy checkpoint defaults are spatially bounded, including below-map bypasses', () => {
    const checkpoints = [{ id: 'legacy', label: 'Legacy', x: 100, y: 400 }]
    expect(findShadowRunnerCheckpoint(checkpoints, -1, { x: 110, y: 375 })).toBe(0)
    expect(findShadowRunnerCheckpoint(checkpoints, -1, { x: 110, y: 900 })).toBe(-1)
    expect(findShadowRunnerCheckpoint(checkpoints, -1, { x: 900, y: 375 })).toBe(-1)
  })

  test.each(['level-8', 'level-9', 'level-10'] as const)('%s recovery preserves kills and reopens unfinished arenas', levelId => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS[levelId]
    for (const encounter of level.encounters!.filter(e => e.sealed)) {
      const state = createInitialShadowRunnerSimulation(level)
      const members = state.enemies.filter(e => encounter.enemyIds.includes(e.id))
      members.forEach(e => { e.activated = true })
      if (members.length > 1) { members[0].alive = false; members[0].health = 0 }
      const before = JSON.stringify(members)
      spendShadowRunnerLife(state)
      expect(getShadowRunnerEncounterRecoveryIds(level.encounters!, state.enemies, new Set(), { x: encounter.x - 200, y: 590 }))
        .toContain(encounter.id)
      expect(JSON.stringify(members)).toBe(before)
      members.forEach(e => { e.alive = false; e.health = 0 })
      expect(getShadowRunnerEncounterRecoveryIds(level.encounters!, state.enemies, new Set([encounter.id]), { x: 0, y: 590 }))
        .not.toContain(encounter.id)
    }
  })
  test('re-entry requires crossing the actual barrier from either side', () => {
    const encounter = level9.encounters!.find(e => e.id === 'captain-encounter-barracks-seal')!
    const body = { left: encounter.x + 20, right: encounter.x + 52, top: 560, bottom: 616 }
    expect(isShadowRunnerEncounterReentered(body, encounter)).toBe(true)
    expect(isShadowRunnerEncounterReentered({ ...body, left: encounter.x - 30 }, encounter)).toBe(false)
    expect(isShadowRunnerEncounterReentered({ ...body, right: encounter.x + encounter.width - 20 }, encounter)).toBe(false)
  })

  test('a 44px passage fits crouch but refuses standing; floor contact is not a ceiling', () => {
    const body = { left: 120, right: 152.76, top: 589.0432, bottom: 616 }
    const roof = { left: 100, right: 300, top: 446, bottom: 572 }
    const floor = { left: 0, right: 400, top: 616, bottom: 800 }
    expect(canShadowRunnerStand(body, 54.6, [roof, floor])).toBe(false)
    expect(canShadowRunnerStand(body, 26.9568, [roof, floor])).toBe(true)
    expect(canShadowRunnerStand(body, 54.6, [floor])).toBe(true)
  })
  test('blocked stance persists on release, jump, and lost ground contact', () => {
    expect(shouldShadowRunnerCrouch(false, true, true, false)).toBe(true)
    expect(shouldShadowRunnerCrouch(false, false, true, false)).toBe(true)
    expect(shouldShadowRunnerCrouch(false, false, true, true)).toBe(false)
    expect(shouldShadowRunnerCrouch(true, false, false, true)).toBe(false)
  })

  test('sword excludes sleeping, killed, missing, and already-hit targets', () => {
    const enemy = { id: 'enemy', alive: true, activated: true }
    expect(canShadowRunnerSwordHit(enemy, new Set())).toBe(true)
    expect(canShadowRunnerSwordHit({ ...enemy, activated: false }, new Set())).toBe(false)
    expect(canShadowRunnerSwordHit({ ...enemy, alive: false }, new Set())).toBe(false)
    expect(canShadowRunnerSwordHit(enemy, new Set(['enemy']))).toBe(false)
    expect(canShadowRunnerSwordHit(undefined, new Set())).toBe(false)
  })
  test('Sovereign beams always grant the entire warning after arming or rearming', () => {
    const zone = level10.relayBeamZones!.find(z => z.id === 'relay-beam-arena')!
    for (const activatedAt of [1000, 60000]) {
      expect(getShadowRunnerBeamCycle(activatedAt, zone, activatedAt).state).toBe('telling')
      expect(getShadowRunnerBeamCycle(activatedAt + 849, zone, activatedAt).state).toBe('telling')
      expect(getShadowRunnerBeamCycle(activatedAt + 850, zone, activatedAt).state).toBe('active')
    }
    expect(getShadowRunnerBeamCycle(0, zone).state).toBe('active')
  })

  test('spectral proximity cannot grant an uncollected power or grace', () => {
    expect(updateShadowRunnerSpectralGrace(createShadowRunnerSpectralGrace(), false, 0, 1000, 'bridge'))
      .toEqual(createShadowRunnerSpectralGrace())
  })
  test('expiry grace is support-specific, finite, and cannot renew itself', () => {
    let grace = updateShadowRunnerSpectralGrace(createShadowRunnerSpectralGrace(), true, 2000, 1990, 'bridge')
    grace = updateShadowRunnerSpectralGrace(grace, false, 2000, 2000, 'bridge')
    expect(grace).toEqual({ poweredSupportId: null, platformId: 'bridge', until: 2650 })
    grace = updateShadowRunnerSpectralGrace(grace, false, 2000, 2649, 'bridge')
    expect(grace.until).toBe(2650)
    expect(updateShadowRunnerSpectralGrace(grace, false, 2000, 2650, 'bridge')).toEqual(createShadowRunnerSpectralGrace())
    expect(updateShadowRunnerSpectralGrace(grace, false, 2000, 2050, 'other')).toEqual(createShadowRunnerSpectralGrace())
    expect(updateShadowRunnerSpectralGrace(grace, false, 2000, 2050, null)).toEqual(createShadowRunnerSpectralGrace())
  })
  test('reflection defines both velocity components', () => {
    expect(getShadowRunnerReflectedVelocity(200, 1).x).toBeCloseTo(-224)
    expect(getShadowRunnerReflectedVelocity(200, 1).y).toBe(0)
    expect(getShadowRunnerReflectedVelocity(0, -1)).toEqual({ x: -520, y: 0 })
  })
})

// Only rendering is stubbed; collision-body APIs below are the installed Phaser implementation.
function actor(id = '', x = 100, y = 616) {
  const Body = jest.requireActual('phaser/src/physics/arcade/Body')
  const data = new Map<string, unknown>([['enemyId', id]])
  const sprite: any = {
    x, y, active: true, width: 128, height: 128, angle: 0,
    scaleX: 0.78, scaleY: 0.78, displayOriginX: 64, displayOriginY: 128,
    getData: (key: string) => data.get(key),
    setData(key: string, value: unknown) { data.set(key, value); return this },
    setVelocity(x: number, y: number) { this.body.velocity.set(x, y); return this },
    setVelocityX(x: number) { this.body.velocity.x = x; return this },
    setVelocityY(y: number) { this.body.velocity.y = y; return this },
    setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this },
    setSize(w: number, h: number) { this.body.setSize(w, h); return this },
    setOffset(x: number, y: number) { this.body.setOffset(x, y); return this },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this },
    enableBody(_reset: boolean, x: number, y: number) { this.setPosition(x, y); this.body.updateFromGameObject(); this.body.enable = true; return this },
    setFlipX() { return this }, play() { return this }, setTint() { return this },
    clearTint() { return this }, setAngularVelocity() { return this }, setFrame() { return this },
    setGravityY(y: number) { this.body.setGravityY(y); return this },
    setAlpha() { return this }, setAngle() { return this }, setTexture() { return this },
  }
  sprite.body = new Body({ defaults: {}, bounds: {} }, sprite)
  sprite.body.setSize(42, 70)
  sprite.body.setOffset(43, 58)
  sprite.body.updateFromGameObject()
  sprite.body.prev.copy(sprite.body.position)
  sprite.body.prevFrame.copy(sprite.body.position)
  sprite.body.blocked.down = true
  return sprite
}

function runtime(levelId: 'level-8' | 'level-9' | 'level-10' = 'level-9', options: { startPaused?: boolean } = {}) {
  const onReady = jest.fn()
  const onLoadError = jest.fn()
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'), input: { current: createShadowRunnerInputState() }, levelId, onHudChange: jest.fn(), onReady, onLoadError, ...options })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  const Systems = jest.requireActual('phaser/src/scene/Systems')
  scene.sys = {
    settings: { key: 'ShadowRunnerLevelScene', active: true, status: 5 },
    events: scene.events,
    getStatus: Systems.prototype.getStatus, isActive: Systems.prototype.isActive,
    isPaused: Systems.prototype.isPaused, pause: Systems.prototype.pause, resume: Systems.prototype.resume,
  }
  scene.physics = { world: {
    isPaused: false, setBounds: jest.fn(),
    pause() { this.isPaused = true }, resume() { this.isPaused = false },
  } }
  scene.cameras = { main: {
    setBounds: jest.fn(), startFollow: jest.fn(), setDeadzone: jest.fn(),
    shake: jest.fn(), flash: jest.fn(), shakeEffect: { reset: jest.fn() }, flashEffect: { reset: jest.fn() },
  } }
  scene.player = actor()
  scene.activeTimeMs = 1000
  scene.time = { now: 500000, delayedCall: jest.fn() }
  scene.tweens = { killTweensOf: jest.fn(), add: jest.fn() }
  for (const key of ['playSound', 'playSwordSlash', 'addHitFlash', 'addDustPuff', 'shakeCamera', 'showCheckpointToast', 'flashCamera', 'emitHud', 'defeatEnemy', 'updateHeroAnimation']) scene[key] = jest.fn()
  return { scene, game, onReady, onLoadError }
}

function stubSceneConstruction(scene: any) {
  for (const key of ['createTextures', 'registerTerrainFrames', 'createBackground', 'createAnimations', 'createLevel', 'createCheckpointWayposts', 'createStoryLandmarks', 'createActors', 'createInput', 'registerQaDebugSnapshot']) scene[key] = jest.fn()
}

function bootScene(scene: any) {
  const SceneManager = jest.requireActual('phaser/src/scene/SceneManager')
  SceneManager.prototype.create.call({}, scene)
}

function stubLoader(scene: any) {
  const Events = jest.requireActual('eventemitter3')
  scene.load = new Events()
  scene.load.image = (key: string) => scene.load.emit('addfile', key, 'image')
  scene.load.spritesheet = (key: string) => scene.load.emit('addfile', key, 'spritesheet')
  scene.textures = { exists: () => true, get: () => ({ has: () => true }) }
}

describe('Shadow Runner scene integration regressions', () => {
  test('the scene clock advances before physics and detaches on shutdown; ready is scene-owned', () => {
    const { scene, game, onReady } = runtime()
    stubSceneConstruction(scene)
    expect(onReady).not.toHaveBeenCalled()
    bootScene(scene)
    expect(onReady).toHaveBeenCalledTimes(1)
    game.setPaused(false)
    scene.events.emit('preupdate', 500000, 16)
    expect(scene.activeTimeMs).toBe(16)
    game.setPaused(true)
    scene.events.emit('preupdate', 520000, 20000)
    expect(scene.activeTimeMs).toBe(16)
    game.setPaused(false)
    scene.events.emit('preupdate', 520000, 16)
    expect(scene.activeTimeMs).toBe(32)
    scene.events.emit('shutdown')
    scene.events.emit('preupdate', 530000, 16)
    expect(scene.activeTimeMs).toBe(32)
    expect(scene.events.listenerCount('preupdate')).toBe(0)
  })

  test('briefing readiness is already paused, including a leftover loading-frame update', () => {
    const { scene, game, onReady } = runtime()
    stubSceneConstruction(scene)
    const updatePlayer = jest.spyOn(scene, 'updatePlayer')
    onReady.mockImplementation(() => {
      expect(scene.sys.isPaused()).toBe(true)
      expect(scene.physics.world.isPaused).toBe(true)
    })
    bootScene(scene)
    scene.update()
    scene.events.emit('preupdate', 20000, 20000)
    expect(scene.activeTimeMs).toBe(0)
    expect(updatePlayer).not.toHaveBeenCalled()
    expect(scene.state.player.health).toBe(12)
    const World = jest.requireActual('phaser/src/physics/arcade/World')
    expect(() => World.prototype.update.call(scene.physics.world, 20000, 20000)).not.toThrow()
    game.setPaused(true)
    game.setPaused(true)
    expect(scene.sys.isPaused()).toBe(true)
    game.setPaused(false)
    expect(scene.sys.isActive()).toBe(true)
    expect(scene.physics.world.isPaused).toBe(false)
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  test('a pause requested during loading wins over an explicit unpaused start', () => {
    const { scene, game } = runtime('level-9', { startPaused: false })
    stubSceneConstruction(scene)
    game.setPaused(true)
    bootScene(scene)
    expect(scene.sys.isPaused()).toBe(true)
    const other = runtime('level-9', { startPaused: false })
    stubSceneConstruction(other.scene)
    bootScene(other.scene)
    expect(other.scene.sys.isActive()).toBe(true)
    expect(other.scene.physics.world.isPaused).toBe(false)
  })

  test('live motion changes stop current camera effects and affect subsequent effects', () => {
    const { scene, game } = runtime()
    stubSceneConstruction(scene)
    delete scene.shakeCamera
    delete scene.flashCamera
    game.setReducedMotion(true)
    expect(scene.cameras.main.shakeEffect.reset).toHaveBeenCalledTimes(1)
    expect(scene.cameras.main.flashEffect.reset).toHaveBeenCalledTimes(1)
    bootScene(scene)
    scene.shakeCamera(90, 0.002)
    scene.flashCamera(100, 255, 255, 255)
    expect(scene.cameras.main.shake).not.toHaveBeenCalled()
    expect(scene.cameras.main.flash).not.toHaveBeenCalled()
    game.setReducedMotion(false)
    scene.shakeCamera(90, 0.002)
    scene.flashCamera(100, 255, 255, 255)
    expect(scene.cameras.main.shake).toHaveBeenCalledTimes(1)
    expect(scene.cameras.main.flash).toHaveBeenCalledTimes(1)
    scene.events.emit('shutdown')
    game.setReducedMotion(true)
    expect(scene.cameras.main.shakeEffect.reset).toHaveBeenCalledTimes(1)
  })

  test('network failures report the asset once and cannot become a playable ready scene', () => {
    const { scene, game, onReady, onLoadError } = runtime()
    stubSceneConstruction(scene)
    stubLoader(scene)
    scene.preload()
    scene.load.emit('loaderror', { key: 'shadow-runner-run' })
    scene.load.emit('loaderror', { key: 'shadow-runner-attack' })
    expect(onLoadError).toHaveBeenCalledTimes(1)
    expect(onLoadError.mock.calls[0][0].message).toContain('shadow-runner-run')
    scene.load.emit('complete')
    bootScene(scene)
    game.setPaused(false)
    expect(scene.createActors).not.toHaveBeenCalled()
    expect(onReady).not.toHaveBeenCalled()
    expect(scene.sys.isPaused()).toBe(true)
    expect(scene.physics.world.isPaused).toBe(true)
  })

  test.each(['missing-texture', 'empty-spritesheet'])('decode failure (%s) is caught without a network-error event', failure => {
    const { scene, onReady, onLoadError } = runtime()
    stubSceneConstruction(scene)
    stubLoader(scene)
    scene.preload()
    if (failure === 'missing-texture') scene.textures.exists = (key: string) => key !== 'shadow-runner-run'
    else scene.textures.get = (key: string) => ({ has: () => key !== 'shadow-runner-run' })
    scene.load.emit('complete')
    bootScene(scene)
    expect(onLoadError).toHaveBeenCalledTimes(1)
    expect(onLoadError.mock.calls[0][0].message).toBe('Shadow Runner asset could not be decoded: shadow-runner-run')
    expect(onReady).not.toHaveBeenCalled()
  })

  test('scene construction failures use the same error path without emitting readiness', () => {
    const { scene, onReady, onLoadError } = runtime()
    stubSceneConstruction(scene)
    scene.createActors.mockImplementation(() => { throw new Error('Unable to construct actor') })
    bootScene(scene)
    expect(onLoadError.mock.calls[0][0].message).toBe('Unable to construct actor')
    expect(onReady).not.toHaveBeenCalled()
    expect(scene.physics.world.isPaused).toBe(true)
  })

  test.each(['shutdown', 'destroy'])('loading cleanup on %s removes observers and ignores late callbacks', event => {
    const { scene, onReady, onLoadError } = runtime()
    stubSceneConstruction(scene)
    stubLoader(scene)
    scene.preload()
    scene.events.emit(event)
    expect(scene.load.listenerCount('addfile')).toBe(0)
    expect(scene.load.listenerCount('loaderror')).toBe(0)
    expect(scene.load.listenerCount('complete')).toBe(0)
    scene.load.emit('loaderror', { key: 'shadow-runner-run' })
    scene.load.emit('complete')
    bootScene(scene)
    expect(onLoadError).not.toHaveBeenCalled()
    expect(onReady).not.toHaveBeenCalled()
    const retry = runtime()
    stubSceneConstruction(retry.scene)
    stubLoader(retry.scene)
    retry.scene.preload()
    retry.scene.load.emit('complete')
    bootScene(retry.scene)
    expect(retry.onReady).toHaveBeenCalledTimes(1)
    expect(retry.onLoadError).not.toHaveBeenCalled()
  })

  test('live sealed encounter recovery preserves enemy state, opens, then reseals after re-entry', () => {
    const { scene } = runtime()
    const encounter = level9.encounters!.find(e => e.id === 'captain-encounter-barracks-seal')!
    const members = scene.state.enemies.filter((e: { id: string }) => encounter.enemyIds.includes(e.id))
    members.forEach((e: { activated: boolean }) => { e.activated = true })
    members[0].alive = false
    members[0].health = 0
    const before = JSON.stringify(members)
    const barrier = { encounterId: encounter.id, enemyIds: encounter.enemyIds, active: true, collider: { body: { enable: true, updateFromGameObject: jest.fn() }, setActive: jest.fn() }, visual: { setVisible: jest.fn(), setAlpha: jest.fn() } }
    scene.encounterBarrierRuntimes = [barrier]
    scene.respawnPoint = { x: 8800, y: 616 }
    scene.respawnPlayer()
    expect(barrier.active).toBe(false)
    expect(barrier.collider.body.enable).toBe(false)
    expect(JSON.stringify(members)).toBe(before)
    scene.player.setPosition(9200, 616)
    scene.player.body.updateFromGameObject()
    scene.updateEncounterActivations(scene.activeTimeMs)
    scene.updateEncounterBarriers()
    expect(barrier.active).toBe(true)
    expect(JSON.stringify(members)).toBe(before)
  })

  test('stance resize preserves feet and post-physics displacement with real Phaser bodies', () => {
    const { scene } = runtime()
    const body = scene.player.body
    body.position.y += 5
    body.updateCenter()
    const feet = body.bottom
    scene.setPlayerStance(true)
    expect(body.height).toBeCloseTo(26.9568)
    expect(body.bottom).toBeCloseTo(feet)
    expect(body.position.y - body.prevFrame.y).toBeCloseTo(5)
    scene.setPlayerStance(false)
    expect(body.height).toBeCloseTo(54.6)
    expect(body.bottom).toBeCloseTo(feet)
    expect(body.position.y - body.prevFrame.y).toBeCloseTo(5)
  })
  test('jump/release beneath the rebuilt 44px gate stays crouched, then stands outside', () => {
    const { scene } = runtime()
    scene.setPlayerStance(true)
    const roof = { left: 80, right: 200, top: 446, bottom: 572 }
    scene.getSolidBodies = () => [roof]
    scene.controls.current.jumpPresses += 1
    scene.updatePlayer(1000)
    expect(scene.crouching).toBe(true)
    expect(scene.standingBlocked).toBe(true)
    expect(scene.player.body.velocity.y).toBe(0)
    scene.getSolidBodies = () => []
    scene.updatePlayer(1016)
    expect(scene.crouching).toBe(false)
    expect(scene.standingBlocked).toBe(false)
  })
  test('same-floor double-jump landing is safe but a genuine 500px drop still hurts', () => {
    const { scene } = runtime()
    scene.airborneStartY = 616
    scene.applyFallDamageOnLanding(1000)
    expect(scene.state.player.health).toBe(12)
    scene.airborneStartY = 116
    scene.applyFallDamageOnLanding(1000)
    expect(scene.state.player.health).toBe(8)
  })
  test.each([false, true])('one sword swing hits health/guard once (guard=%s)', guarded => {
    const { scene } = runtime()
    const enemy = scene.state.enemies[0]
    enemy.activated = true
    enemy.health = 10
    enemy.guard = guarded ? 4 : 0
    scene.enemies = [actor(enemy.id, 180, 616)]
    scene.tryAttack(1000)
    scene.resolveAttackHit(1000)
    scene.resolveAttackHit(1233)
    expect(enemy.health).toBe(guarded ? 10 : 9)
    expect(enemy.guard).toBe(guarded ? 3 : 0)
    scene.tryAttack(1420)
    scene.resolveAttackHit(1420)
    expect(enemy.health).toBe(guarded ? 10 : 8)
    expect(enemy.guard).toBe(guarded ? 2 : 0)
    expect(scene.attackId).toBe(2)
  })
  test.each([-1, 1])('sword covers close body overlap without reaching behind the runner (facing=%s)', facing => {
    for (const crouching of [false, true]) for (const reach of [-15, -13, 0, 13, 105, 106]) {
      const { scene } = runtime()
      scene.state.player.facing = facing
      scene.setPlayerStance(crouching)
      const enemy = scene.state.enemies[0]
      Object.assign(enemy, { activated: true, health: 10, guard: 0 })
      scene.enemies = [actor(enemy.id, scene.player.x + facing * reach, 616)]
      scene.tryAttack(1000)
      scene.resolveAttackHit(1000)
      scene.resolveAttackHit(1233)
      expect(enemy.health).toBe(reach > -14 && reach < 106 ? 9 : 10)
    }
  })
  test('sleeping enemies and targets behind solid walls do not take melee damage', () => {
    const { scene } = runtime('level-8')
    const enemy = scene.state.enemies[0]
    enemy.guard = 0
    const health = enemy.health
    scene.enemies = [actor(enemy.id, 180, 616)]
    scene.tryAttack(1000)
    scene.resolveAttackHit(1000)
    expect(enemy.health).toBe(health)
    enemy.activated = true
    scene.getSolidBodies = () => [{ left: 140, top: 400, width: 20, height: 216 }]
    scene.resolveAttackHit(1016)
    expect(enemy.health).toBe(health)
  })
  test.each([
    ['sunsteel', false], ['sunsteel', true], ['dawnfire', false], ['dawnfire', true],
  ] as const)('%s hits each enemy once per swing (guard=%s)', (power, guarded) => {
    const { scene } = runtime()
    Object.assign(scene.state.player, power === 'sunsteel' ? {
      sunsteelEdgeActiveUntil: 9000, sunsteelEdgeCharges: 2,
      sunsteelAttackDamageBonus: 2, sunsteelGuardDamage: 3,
    } : {
      dawnfireAegisActiveUntil: 9000, dawnfireAttackDamageBonus: 2, dawnfireGuardDamage: 3,
    })
    const enemy = scene.state.enemies[0]
    Object.assign(enemy, { activated: true, health: 10, guard: guarded ? 6 : 0 })
    scene.enemies = [actor(enemy.id, 180, 616)]
    scene.tryAttack(1000)
    scene.resolveAttackHit(1000)
    scene.resolveAttackHit(1233)
    expect(enemy.health).toBe(guarded ? 10 : 7)
    expect(enemy.guard).toBe(guarded ? 3 : 0)
    if (power === 'sunsteel') expect(scene.state.player.sunsteelEdgeCharges).toBe(1)
  })
  test('an empowered swing destroys at most one orb, and resets for the next swing', () => {
    const { scene } = runtime()
    Object.assign(scene.state.player, { dawnfireAegisActiveUntil: 9000, dawnfireAttackDamageBonus: 2 })
    const projectiles = [actor('', 148, 570), actor('', 148, 570)]
    projectiles.forEach(projectile => projectile.setData('projectileKind', 'relay-orb'))
    scene.archerProjectiles = { getChildren: () => projectiles }
    scene.disableProjectile = jest.fn(projectile => { projectile.active = false })
    scene.tryAttack(1000)
    scene.resolveAttackHit(1000)
    scene.resolveAttackHit(1233)
    expect(scene.disableProjectile).toHaveBeenCalledTimes(1)
    scene.tryAttack(1420)
    scene.resolveAttackHit(1420)
    expect(scene.disableProjectile).toHaveBeenCalledTimes(2)
  })
  test('Sovereign phase/sweep transitions rearm a complete warning before damage', () => {
    const { scene } = runtime('level-10')
    const bossState = scene.state.enemies.find((enemy: { id: string }) => enemy.id === 'sentry-sovereign')
    bossState.activated = true
    const boss = actor(bossState.id)
    boss.setData('enemyKind', 'sentry-sovereign').setData('bossPhaseId', 'iron-decree')
    scene.enemies = [boss]
    scene.player.setPosition(25000, 580)
    scene.player.body.updateFromGameObject()
    const beam = {
      config: level10.relayBeamZones!.find(zone => zone.id === 'relay-beam-arena'),
      state: 'idle', activatedAt: null, lastGuardedCycle: -1,
      visual: { clear: jest.fn(), lineStyle: jest.fn() },
    }
    scene.relayBeamZones = [beam]
    scene.drawRelayBeamLane = jest.fn()
    scene.isPlayerInRelayBeamCover = () => false
    scene.damagePlayerFromHazard = jest.fn()
    scene.updateRelayBeamZones(1000)
    expect(beam.activatedAt).toBeNull()
    boss.setData('bossPhaseId', 'relay-storm')
    scene.updateRelayBeamZones(1000)
    scene.updateRelayBeamZones(1849)
    expect(beam.state).toBe('telling')
    expect(scene.damagePlayerFromHazard).not.toHaveBeenCalled()
    scene.updateRelayBeamZones(1850)
    expect(beam.state).toBe('active')
    expect(scene.damagePlayerFromHazard).toHaveBeenCalledTimes(1)
    beam.lastGuardedCycle = 0
    boss.setData('sovereignAttackType', 'sweep')
    bossState.attackUntil = 5000
    boss.setData('sovereignAttackUntil', 5000)
    scene.updateRelayBeamZones(2000)
    expect(beam.state).toBe('idle')
    expect(beam.lastGuardedCycle).toBe(-1)
    scene.updateRelayBeamZones(5000)
    scene.updateRelayBeamZones(5849)
    expect(beam.state).toBe('telling')
    expect(scene.damagePlayerFromHazard).toHaveBeenCalledTimes(1)
    scene.updateRelayBeamZones(5850)
    expect(scene.damagePlayerFromHazard).toHaveBeenCalledTimes(2)
  })
  test('Wraithlight grace keeps only prior support, never extends power or unlocks caches', () => {
    const { scene } = runtime('level-8')
    scene.wraithlightAura = Object.fromEntries(
      ['setVisible', 'clear', 'lineStyle', 'strokeCircle', 'fillStyle', 'fillCircle'].map(key => [key, jest.fn()]),
    )
    const support = { config: { id: 'support', x: 80, y: 616, width: 100 }, collider: { body: { enable: false } }, visual: { setAlpha: jest.fn() } }
    const other = { config: { id: 'other', x: 200, y: 616, width: 100 }, collider: { body: { enable: false } }, visual: { setAlpha: jest.fn() } }
    scene.spectralPlatforms = [support, other]
    const cache = actor()
    cache.setData('requiredPower', 'wraithlight')
    scene.masteryPickups = { getChildren: () => [cache] }
    scene.updateWraithlight(1000)
    expect(support.collider.body.enable).toBe(false)
    expect(scene.state.player.wraithlightActiveUntil).toBe(0)
    scene.state.player.wraithlightActiveUntil = 2000
    scene.updateWraithlight(1000)
    expect(other.collider.body.enable).toBe(true)
    expect(cache.body.enable).toBe(true)
    scene.updateWraithlight(1990)
    scene.updateWraithlight(2000)
    expect(support.collider.body.enable).toBe(true)
    expect(other.collider.body.enable).toBe(false)
    expect(cache.body.enable).toBe(false)
    expect(scene.wraithlightAura.setVisible).toHaveBeenLastCalledWith(false)
    expect(scene.state.player.wraithlightActiveUntil).toBe(2000)
    expect(scene.spectralGrace.until).toBe(2650)
    scene.updateWraithlight(2649)
    expect(support.collider.body.enable).toBe(true)
    scene.updateWraithlight(2650)
    expect(support.collider.body.enable).toBe(false)
    scene.updateWraithlight(2651)
    expect(scene.spectralGrace).toEqual(createShadowRunnerSpectralGrace())
    expect(scene.state.player.wraithlightActiveUntil).toBe(2000)
  })
  test('reflected angled orb stays horizontal and Chrono-scaled on its next update', () => {
    const { scene } = runtime()
    scene.state.player.mirrorWardActiveUntil = 9000
    scene.state.player.mirrorWardCharges = 2
    scene.state.player.chronoActiveUntil = 9000
    scene.state.player.chronoTimeScale = 0.5
    const projectile = actor()
    projectile.setData('projectileKind', 'relay-orb').setData('baseSpeedX', 200).setData('baseSpeedY', 180)
    scene.archerProjectiles = { getChildren: () => [projectile] }
    expect(scene.tryReflectProjectileWithMirrorWard(projectile)).toBe(true)
    expect(projectile.body.velocity.x).toBeCloseTo(-112)
    scene.updateArcherProjectiles(1016)
    expect(projectile.body.velocity.x).toBeCloseTo(-112)
    expect(projectile.body.velocity.y).toBe(0)
    expect(projectile.getData('baseSpeedY')).toBe(0)
    scene.archerProjectiles = { getFirstDead: () => projectile }
    projectile.setData('baseSpeedY', 180)
    scene.acquireProjectile(150, 300, 'arrow')
    expect(projectile.getData('baseSpeedY')).toBe(0)
    expect(projectile.getData('reflectedByPlayer')).toBe(false)
    expect(projectile.body.velocity.y).toBe(0)
  })
  test('custom static hitboxes survive candle/storm/candle pool reuse without offset drift', () => {
    const { scene } = runtime()
    const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
    const world = { defaults: {}, staticTree: { remove: jest.fn(), insert: jest.fn() } }
    const sprite = { x: 100, y: 100, originX: 0.5, originY: 0.5, displayWidth: 34, displayHeight: 52, getTopLeft(v: { set: (x: number, y: number) => void }) { v.set(this.x - this.displayWidth / 2, this.y - this.displayHeight / 2) } }
    const body = new StaticBody(world, sprite)
    for (const kind of ['candle', 'storm', 'candle'] as const) {
      sprite.displayWidth = kind === 'candle' ? 34 : 70
      sprite.displayHeight = kind === 'candle' ? 52 : 38
      scene.setHazardHitbox(body, kind)
      const expected = SHADOW_RUNNER_HAZARD_HITBOXES[kind]
      expect(body.width).toBe(expected.width)
      expect(body.height).toBe(expected.height)
      expect(body.left).toBe(100 - sprite.displayWidth / 2 + expected.offsetX)
      expect(body.top).toBe(100 - sprite.displayHeight / 2 + expected.offsetY)
    }
  })
})
