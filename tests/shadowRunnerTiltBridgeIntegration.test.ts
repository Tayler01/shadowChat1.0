import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import { DEFAULT_TILT_BRIDGE_DECK, getTiltBridgeContact, updateTiltBridgeGeometry } from '../src/features/games/shadow-runner/game/runtimeTiltBridge'

jest.mock('phaser', () => {
  const Events = jest.requireActual('eventemitter3')
  return { __esModule: true, default: {
    Scene: class { events = new Events() },
    Game: class { constructor(public config: { scene: unknown[] }) {} },
    Physics: { Arcade: { Body: jest.requireActual('phaser/src/physics/arcade/Body') } },
    Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
    Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
    Loader: { Events: jest.requireActual('phaser/src/loader/events') },
    Input: { Keyboard: { JustDown: () => false } },
    Math: { Clamp: (n: number, a: number, b: number) => Math.max(a, Math.min(b, n)) },
  } }
})
jest.mock('phaser/src/physics/arcade/Factory', () => class {})
jest.mock('phaser/src/physics/arcade/ArcadeSprite', () => class {})
jest.mock('phaser/src/gameobjects/sprite/Sprite', () => class {})
jest.mock('phaser/src/device/CanvasFeatures', () => ({ supportInverseAlpha: true, supportNewBlendModes: true }))

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const World = jest.requireActual('phaser/src/physics/arcade/World')
const Systems = jest.requireActual('phaser/src/scene/Systems')
const ArcadePhysics = jest.requireActual('phaser/src/physics/arcade/ArcadePhysics')
const PhysicsGroup = jest.requireActual('phaser/src/physics/arcade/PhysicsGroup')

function image(x: number, y: number, texture = '', frame?: string) {
  const data = new Map<string, unknown>()
  return {
    x, y, texture, frame, rotation: 0, originX: 0.5, originY: 0.5, displayWidth: 0, displayHeight: 0,
    setOrigin(a: number, b: number) { this.originX = a; this.originY = b; return this },
    setDisplaySize(w: number, h: number) { this.displayWidth = w; this.displayHeight = h; return this },
    setDepth() { return this }, setRotation(r: number) { this.rotation = r; return this },
    setData(k: string, v: unknown) { data.set(k, v); return this }, getData(k: string) { return data.get(k) },
  }
}

function playerSprite(world: any) {
  const player: any = {
    x: 400, y: 400, active: true, width: 128, height: 128, angle: 0,
    scaleX: 0.78, scaleY: 0.78, displayOriginX: 64, displayOriginY: 128,
    setVelocity(x: number, y: number) { this.body.setVelocity(x, y); return this },
    setVelocityX(x: number) { this.body.setVelocityX(x); return this },
    setVelocityY(y: number) { this.body.setVelocityY(y); return this },
    setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this },
    setSize(w: number, h: number) { this.body.setSize(w, h); return this },
    setOffset(x: number, y: number) { this.body.setOffset(x, y); return this },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this },
    setX(x: number) { this.x = x; return this },
    enableBody(_reset: boolean, x: number, y: number) {
      this.setPosition(x, y); this.body.updateFromGameObject(); this.body.enable = true; return this
    },
    setFlipX() { return this }, clearTint() { return this },
  }
  player.body = new Body(world, player)
  player.body.setSize(42, 70).setOffset(43, 58).setMaxVelocity(360, 940).setDragX(1450)
  world.add(player.body)
  return player
}

// Actual scene bridge/input/stance/jump/lifecycle methods, actual installed Arcade
// World/Body/colliders. Only rendering, audio and unrelated encounters are stubbed.
function runtime(options: { rotation?: number; moving?: boolean; slideForce?: number; startX?: number; custom?: boolean; projectiles?: boolean } = {}) {
  const input = { current: createShadowRunnerInputState() }
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'), input, onHudChange: jest.fn(), levelId: 'level-9' })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  scene.sys = {
    settings: { key: 'ShadowRunnerLevelScene', active: true, status: 5 }, events: scene.events,
    getStatus: Systems.prototype.getStatus, isActive: Systems.prototype.isActive,
    isPaused: Systems.prototype.isPaused, pause: Systems.prototype.pause, resume: Systems.prototype.resume,
    scale: { width: 960, height: 540 },
  }
  const world = new World(scene, { gravity: { x: 0, y: 1640 }, fps: 60, fixedStep: true })
  scene.physics = { world }
  scene.add = { image: jest.fn(image) }
  scene.textures = {
    exists: (key: string) => options.custom || key === 'shadow-runner-tilt-bridge',
    get: () => ({ has: () => Boolean(options.custom) }),
    getFrame: () => options.custom ? { width: 960, height: 182 } : { width: 256, height: 80 },
  }
  scene.cameras = { main: {
    scrollX: 0, scrollY: 0, width: 960, height: 540, zoom: 1,
    centerOn(x: number, y: number) { this.scrollX = x - 480; this.scrollY = y - 270 },
  } }
  scene.player = playerSprite(world)
  scene.enemies = []
  if (options.projectiles) scene.archerProjectiles = new PhysicsGroup(world, scene, [], { allowGravity: false })
  scene.gameplayPaused = false
  scene.sceneReady = true
  scene.level = { ...scene.level, worldWidth: 100000, worldHeight: 10000 }
  scene.activeTimeMs = 1000
  for (const key of ['playSound', 'addDustPuff', 'emitHud', 'updateHeroAnimation', 'resolveAttackHit', 'applyFallDamageOnLanding', 'updateEncounterBarriers']) scene[key] = jest.fn()
  const config = {
    id: 'test-bridge', visualId: 'captain-counterweight-bridge', terrainSet: 'captain',
    x: 260, y: 400, width: 280, height: 18, wobbleRotation: 0.255, wobbleDurationMs: 1150,
    slideForce: options.slideForce ?? 0, maxSlideSpeed: 220,
  }
  scene.createTiltPlatform(config, 0)
  const bridge = scene.tiltPlatforms[0]
  if (!options.moving) bridge.startRotation = bridge.endRotation = options.rotation ?? 0.255
  bridge.pose.rotation = bridge.startRotation
  bridge.visual.setRotation(bridge.startRotation)
  updateTiltBridgeGeometry(bridge.geometry, bridge.pose)
  updateTiltBridgeGeometry(bridge.nextGeometry, bridge.pose)
  const body = scene.player.body
  const setFeet = (x: number, y: number) => {
    scene.player.setPosition(x, y)
    body.updateFromGameObject()
    body.prev.copy(body.position)
    body.prevFrame.copy(body.position)
  }
  const startX = options.startX ?? 400
  const contact = getTiltBridgeContact(bridge.geometry, { left: startX - 16.38, right: startX + 16.38 })!
  setFeet(startX, contact.slice.y)
  let hits = 0
  const addCollider = world.addCollider.bind(world)
  jest.spyOn(world, 'addCollider').mockImplementation((a, b, cb: any, process: any) => addCollider(a, b, (...args: any[]) => {
    hits += 1
    cb?.(...args)
  }, process))
  scene.startTiltBridgePhysics()
  const trace: { x: number; bottom: number; vy: number; grounded: boolean; eligible: boolean; hits: number; error: number | null; rotation: number }[] = []
  world.on('worldstep', () => {
    const surface = getTiltBridgeContact(bridge.geometry, body)
    trace.push({ x: body.x, bottom: body.bottom, vy: body.velocity.y,
      grounded: Boolean(scene.tiltActors[0]?.support), eligible: Boolean(surface), hits,
      error: surface ? Math.abs(body.bottom - surface.surfaceY) : null, rotation: bridge.visual.rotation })
    hits = 0
  })
  const frame = (fps = 60) => {
    if (!world.isPaused) scene.activeTimeMs += 1000 / fps
    world.update(scene.activeTimeMs, 1000 / fps)
    if (!world.isPaused && !scene.respawnPending) scene.updatePlayer(scene.activeTimeMs)
    world.postUpdate()
  }
  const run = (seconds: number, fps = 60) => { for (let i = 0; i < Math.round(seconds * fps); i += 1) frame(fps) }
  const close = () => { scene.events.emit('shutdown'); world.destroy() }
  return { scene, game, world, body, bridge, input, trace, frame, run, setFeet, close }
}

describe('integrated tilt bridges through the real scene and Arcade', () => {
  test('a real projectile group hits a bare bridge body without reversing callback ownership', () => {
    const r = runtime({ rotation: 0, projectiles: true })
    try {
      const projectile = playerSprite(r.world)
      projectile.body.setSize(8, 8).setOffset(60, 120)
      projectile.setPosition(480, 392)
      projectile.body.updateFromGameObject()
      projectile.body.prev.copy(projectile.body.position)
      projectile.body.prevFrame.copy(projectile.body.position)
      projectile.on = () => projectile
      projectile.off = () => projectile
      r.scene.archerProjectiles.add(projectile)
      projectile.body.setVelocity(0, 180)
      r.scene.maybeCreateProjectileImpactHazard = jest.fn()
      r.scene.disableProjectile = jest.fn((item: any) => { item.body.enable = false })
      expect(() => r.run(0.2)).not.toThrow()
      expect(r.scene.maybeCreateProjectileImpactHazard).toHaveBeenCalledWith(projectile, expect.objectContaining({ isBody: true }))
      expect(r.bridge.bodies).toContain(r.scene.maybeCreateProjectileImpactHazard.mock.calls[0][1])
      expect(r.scene.disableProjectile).toHaveBeenCalledTimes(1)
      expect(r.scene.disableProjectile).toHaveBeenCalledWith(projectile)
      expect(projectile.body.enable).toBe(false)
      expect(r.bridge.bodies.every((body: any) => body.enable)).toBe(true)
    } finally { r.close() }
  })
  test('an actual bomb impact receives the contacted bridge surface for floor-fire placement', () => {
    const r = runtime({ rotation: 0, projectiles: true })
    try {
      const projectile = playerSprite(r.world)
      projectile.body.setSize(8, 8).setOffset(60, 120)
      projectile.setPosition(480, 392)
      projectile.body.updateFromGameObject()
      projectile.body.prev.copy(projectile.body.position)
      projectile.body.prevFrame.copy(projectile.body.position)
      projectile.on = projectile.off = () => projectile
      projectile.getData = (key: string) => key === 'projectileKind' ? 'storm-bomb' : undefined
      r.scene.archerProjectiles.add(projectile)
      projectile.body.setVelocity(0, 180)
      const setData = jest.fn()
      r.scene.createStormHazard = jest.fn(() => ({ setData }))
      r.scene.disableProjectile = (item: any) => { item.body.enable = false }
      r.run(0.2)
      expect(r.scene.createStormHazard).toHaveBeenCalledTimes(1)
      const support = setData.mock.calls[0][1]
      expect(r.bridge.bodies).toContain(support.body)
      expect(r.scene.createStormHazard.mock.calls[0][1]).toBeCloseTo(support.body.top - 19)
    } finally { r.close() }
  })
  test.each([30, 60])('holds the actual rotated art line at both former forced-fall thresholds (%s fps)', fps => {
    for (const startX of [260 + 280 * 0.32, 260 + 280 * 0.68]) {
      const r = runtime({ startX })
      r.run(3, fps)
      expect(r.trace.every(t => t.grounded && t.hits === 1)).toBe(true)
      expect(Math.max(...r.trace.map(t => t.error!))).toBeLessThan(0.505)
      expect(r.bridge.bodies.every((b: any) => b.checkCollision.up && !b.checkCollision.down && !b.checkCollision.left && !b.checkCollision.right)).toBe(true)
      r.close()
    }
  })

  test.each([30, 60])('walks and crouches across every slice in both directions without a stuck edge (%s fps)', fps => {
    for (const direction of [-1, 1]) for (const crouch of [false, true]) {
      const r = runtime({ startX: direction > 0 ? 320 : 480 })
      r.frame(fps)
      r.input.current[direction > 0 ? 'right' : 'left'] = true
      r.input.current.crouch = crouch
      r.scene.updatePlayer(r.scene.activeTimeMs)
      r.run(3, fps)
      const firstFall = r.trace.find(t => !t.grounded)!
      expect(firstFall).toBeDefined()
      expect(firstFall.eligible).toBe(false)
      expect(r.trace.filter(t => t.eligible).every(t => t.grounded && t.hits === 1)).toBe(true)
      expect(Math.abs(r.body.x - 400)).toBeGreaterThan(180)
      expect(r.body.drag.x).toBe(0)
      expect(r.body.acceleration.x).toBe(0)
      expect(r.body.maxVelocity.x).toBe(360)
      r.input.current.left = false
      r.input.current.right = false
      r.scene.updatePlayer(r.scene.activeTimeMs)
      expect(r.body.drag.x).toBe(1450)
      r.close()
    }
  })

  test.each([30, 60])('does not retain bridge grounding on the substep that walks off an end (%s fps)', fps => {
    const r = runtime({ startX: 510 })
    r.frame(fps)
    r.input.current.right = true
    r.scene.updatePlayer(r.scene.activeTimeMs)
    for (let i = 0; i < fps && r.scene.tiltActors[0].support; i += 1) r.frame(fps)
    expect(r.scene.tiltActors[0].support).toBeNull()
    expect(r.scene.wasOnFloor).toBe(false)
    expect(r.body.touching.down).toBe(false)
    r.close()
  })

  test.each([30, 60])('slides to a literal end using physics, without disabling any top (%s fps)', fps => {
    const r = runtime({ slideForce: 1640 })
    r.run(3, fps)
    const fall = r.trace.find(t => !t.grounded)!
    expect(fall.eligible).toBe(false)
    expect(r.trace.filter(t => t.eligible).every(t => t.grounded && t.hits === 1)).toBe(true)
    expect(r.bridge.bodies.every((b: any) => b.checkCollision.up)).toBe(true)
    r.close()
  })

  test.each([30, 60])('jumps from standing/crouch, passes up through the deck, and re-lands (%s fps)', fps => {
    for (const crouch of [false, true]) {
      const r = runtime()
      r.frame(fps)
      r.input.current.crouch = crouch
      r.scene.updatePlayer(r.scene.activeTimeMs)
      expect(r.body.height).toBeCloseTo(crouch ? 26.9568 : 54.6)
      r.input.current.jumpPresses += 1
      r.scene.updatePlayer(r.scene.activeTimeMs)
      expect(r.scene.tiltActors[0].support).toBeNull()
      expect(r.body.velocity.y).toBe(-620)
      r.run(0.3, fps)
      expect(r.scene.tiltActors[0].support).toBeNull()
      r.run(0.9, fps)
      expect(r.scene.tiltActors[0].support).toBe(r.bridge)
      expect(r.scene.jumpsUsed).toBe(0)
      r.close()
    }
  })

  test.each([30, 60])('does not catch an underside or an already-below descending actor (%s fps)', fps => {
    for (const vy of [-400, 200]) {
      const r = runtime()
      r.setFeet(400, 425)
      r.body.setVelocityY(vy)
      r.run(0.1, fps)
      expect(r.trace.every(t => !t.grounded && t.hits === 0)).toBe(true)
      r.close()
    }
  })

  test.each([30, 60])('clears support for respawn/teleport and freezes physics while paused (%s fps)', fps => {
    const r = runtime({ moving: true })
    r.run(0.5, fps)
    expect(r.scene.tiltActors[0].support).toBe(r.bridge)
    const before = { clock: r.scene.tiltClockMs, x: r.body.x, y: r.body.y, rotation: r.bridge.visual.rotation }
    r.game.setPaused(true)
    r.run(20, fps)
    expect({ clock: r.scene.tiltClockMs, x: r.body.x, y: r.body.y, rotation: r.bridge.visual.rotation }).toEqual(before)
    r.game.setPaused(false)
    r.run(0.5, fps)
    expect(r.trace.every(t => t.grounded && t.hits === 1)).toBe(true)
    r.scene.suspendPlayerForRespawn()
    expect(r.body.enable).toBe(false)
    expect(r.scene.tiltActors[0].support).toBeNull()
    r.run(0.2, fps)
    expect(r.scene.tiltActors[0].support).toBeNull()
    r.scene.respawnPoint = { x: 400, y: 250 }
    r.scene.respawnPlayer()
    expect(r.body.enable).toBe(true)
    expect(r.body.velocity.y).toBe(0)
    expect(r.scene.tiltActors[0].support).toBeNull()
    r.run(1, fps)
    expect(r.scene.tiltActors[0].support).toBe(r.bridge)
    r.scene.teleportPlayerForQa(400, 200)
    expect(r.scene.tiltActors[0].support).toBeNull()
    r.close()
  })

  test.each([{ moving: true }, { slideForce: 1640 }, { rotation: -0.255 }])('has identical 60Hz contact traces at 30/60 render fps for %j', options => {
    const a = runtime(options)
    const b = runtime(options)
    a.run(2, 60)
    b.run(2, 30)
    expect(b.trace).toHaveLength(a.trace.length)
    b.trace.forEach((tick, index) => {
      const other = a.trace[index]
      expect(tick.grounded).toBe(other.grounded)
      expect(tick.hits).toBe(other.hits)
      expect(tick.eligible).toBe(other.eligible)
      expect(tick.x).toBeCloseTo(other.x, 8)
      expect(tick.bottom).toBeCloseTo(other.bottom, 8)
      expect(tick.vy).toBeCloseTo(other.vy, 8)
      expect(tick.rotation).toBe(other.rotation)
    })
    a.close()
    b.close()
  })

  test.each(['walk', 'crouch', 'jump'] as const)('matches 30/60 fps through integrated %s controls on a rocking bridge', action => {
    const traces = [60, 30].map(fps => {
      const r = runtime({ moving: true, startX: 340 })
      r.run(2 / 60, fps)
      if (action === 'jump') r.input.current.jumpPresses += 1
      else r.input.current.right = true
      if (action === 'crouch') r.input.current.crouch = true
      r.scene.updatePlayer(r.scene.activeTimeMs)
      r.run(action === 'jump' ? 1.2 : 0.5, fps)
      const trace = r.trace
      r.close()
      return trace
    })
    expect(traces[1]).toHaveLength(traces[0].length)
    traces[1].forEach((tick, index) => {
      expect(tick.grounded).toBe(traces[0][index].grounded)
      expect(tick.hits).toBe(traces[0][index].hits)
      expect(tick.x).toBeCloseTo(traces[0][index].x, 8)
      expect(tick.bottom).toBeCloseTo(traces[0][index].bottom, 8)
    })
  })

  test.each([30, 60])('preserves a native static floor when stepping off the bridge onto it (%s fps)', fps => {
    const r = runtime({ rotation: 0, startX: 500 })
    const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
    const floor = new StaticBody(r.world)
    floor.setSize(400, 40)
    floor.position.set(540, 400)
    floor.updateCenter()
    r.world.add(floor)
    r.world.addCollider(r.body, floor)
    r.frame(fps)
    r.input.current.right = true
    r.scene.updatePlayer(r.scene.activeTimeMs)
    r.run(0.5, fps)
    expect(r.scene.tiltActors[0].support).toBeNull()
    expect(r.body.blocked.down).toBe(true)
    expect(r.scene.wasOnFloor).toBe(true)
    expect(r.body.bottom).toBeCloseTo(400, 8)
    r.close()
  })

  test('calibrates default padded art and known atlas deck rows to the collision pivot', () => {
    const r = runtime()
    expect(r.bridge.visual.originX).toBe((54 + 228) / 2 / 256)
    expect(r.bridge.visual.originY).toBe(DEFAULT_TILT_BRIDGE_DECK.top / 80)
    expect(r.bridge.visual.displayWidth * (228 - 54) / 256).toBeCloseTo(280)
    expect(r.bridge.visual.y).toBe(r.bridge.config.y)
    expect(r.bridge.visual.getData('platformCollider')).toBeUndefined()
    r.close()
    const c = runtime({ custom: true })
    expect(c.bridge.visual.originY).toBe(147 / 182)
    expect(c.bridge.visual.y).toBe(400)
    c.close()
  })

  test.each(['shutdown', 'destroy'])('bounds active bodies and removes bridge bodies/colliders/listeners on %s', event => {
    const r = runtime()
    for (let i = 1; i < 40; i += 1) r.scene.createTiltPlatform({ ...r.bridge.config, id: `far-${i}`, x: i * 2000 }, i)
    r.scene.prepareTiltBridgeStep()
    expect(r.scene.tiltBodies).toHaveLength(70)
    const oldBodies = [...r.bridge.bodies]
    const buffers = [r.bridge.geometry, r.bridge.nextGeometry]
    r.run(1)
    expect(buffers).toContain(r.bridge.geometry)
    expect(buffers).toContain(r.bridge.nextGeometry)
    r.scene.teleportPlayerForQa(8100, 400)
    r.setFeet(8100, 400)
    r.scene.prepareTiltBridgeStep()
    expect(r.scene.tiltBodies.length).toBeLessThanOrEqual(512)
    expect(r.bridge.bodies).toHaveLength(0)
    expect(oldBodies.every(body => !r.world.bodies.contains(body))).toBe(true)
    const actors = [...r.scene.tiltActors]
    r.scene.events.emit(event)
    expect(r.scene.tiltBodies).toHaveLength(0)
    expect(r.world.pendingDestroy.size).toBe(0)
    expect(r.scene.tiltPlatforms).toHaveLength(0)
    expect(actors.every(actor => !actor.collider.active)).toBe(true)
    expect(r.scene.tiltCleanup).toBeUndefined()
    expect(r.scene.events.listenerCount('shutdown')).toBe(0)
    expect(r.scene.events.listenerCount('destroy')).toBe(0)
    expect(r.world.listenerCount('worldstep')).toBe(1) // The test's trace collector only.
    r.scene.events.emit(event)
    r.world.destroy()
  })

  test('cleanup remains safe after Arcade has shut down first, and supports a scene restart', () => {
    const r = runtime()
    r.frame()
    r.world.shutdown()
    expect(() => r.scene.events.emit('shutdown')).not.toThrow()
    expect(r.scene.tiltActors).toHaveLength(0)
    expect(r.scene.tiltBodies).toHaveLength(0)
    r.scene.createTiltPlatform(r.bridge.config, 0)
    r.world.add(r.body)
    r.scene.startTiltBridgePhysics()
    expect(r.world.listenerCount('worldstep')).toBe(1)
    expect(r.scene.tiltBodies).toHaveLength(70)
    r.close()
  })

  test.each(['shutdown', 'destroy'])('cleanup survives the actual Arcade plugin %s nulling its world first', event => {
    const r = runtime()
    r.run(0.2)
    const actor = r.scene.tiltActors[0]
    expect(actor.support).toBe(r.bridge)
    expect(actor.controlled).toBe(true)
    const caps = [...r.scene.tiltBodies]
    const cleanup = r.scene.tiltCleanup
    Object.assign(r.scene.physics, { scene: r.scene, systems: r.scene.sys,
      add: { destroy: jest.fn() }, shutdown: ArcadePhysics.prototype.shutdown })
    ArcadePhysics.prototype[event].call(r.scene.physics)
    expect(r.scene.physics.world).toBeNull()
    expect(() => r.scene.events.emit(event)).not.toThrow()
    expect(() => cleanup()).not.toThrow()
    expect(r.scene.tiltBodies).toHaveLength(0)
    expect(r.scene.tiltActors).toHaveLength(0)
    expect(r.scene.tiltPlatforms).toHaveLength(0)
    expect(caps.every(body => !body.enable && !r.world.bodies.contains(body))).toBe(true)
    expect(actor.collider.world).toBeNull()
    expect(actor.support).toBeNull()
    expect(actor.controlled).toBe(false)
    expect(r.body.drag.x).toBe(1450)
    expect(r.body.acceleration.x).toBe(0)
    expect(r.scene.tiltCleanup).toBeUndefined()
    expect(r.world.pendingDestroy.size).toBe(0)
    expect(r.world.listenerCount('worldstep')).toBe(0)
    expect(r.scene.events.listenerCount('shutdown')).toBe(0)
    expect(r.scene.events.listenerCount('destroy')).toBe(0)
  })

  test('every authored bridge fits the active-body budget across its camera/player neighborhoods', () => {
    const r = runtime()
    for (const level of Object.values(SHADOW_RUNNER_LEVEL_CONFIGS)) {
      r.scene.tiltCleanup?.()
      level.tiltPlatforms.forEach((config, index) => r.scene.createTiltPlatform(config, index))
      if (!level.tiltPlatforms.length) continue
      r.scene.startTiltBridgePhysics()
      for (const bridge of r.scene.tiltPlatforms) {
        const { x, y, width } = bridge.config
        r.setFeet(x + width / 2, y)
        r.scene.cameras.main.centerOn(x + width / 2, y)
        r.scene.prepareTiltBridgeStep()
        expect(bridge.bodies).toHaveLength(Math.ceil(width / 4))
        expect(r.scene.tiltBodies.length).toBeLessThanOrEqual(512)
        for (const visible of r.scene.tiltPlatforms) {
          if (r.scene.isTiltBridgeNear(visible, false)) expect(visible.bodies.length).toBeGreaterThan(0)
        }
      }
    }
    r.close()
  })
})

describe('read-only bridge QA snapshot', () => {
  const qaWindow = window as Window & {
    __shadowRunnerDebug?: () => { tiltBridges: {
      totalBridgeCount: number
      activeBodyCount: number
      bridges: Array<{
        id: string; visualRotation: number; left: { x: number; y: number }; right: { x: number; y: number }
        maxSurfaceError: number; activeBodyCount: number
      }>
      playerSupport: { bridgeId: string; surfaceY: number } | null
    } }
    __shadowRunnerQa?: object
  }
  const register = (r: ReturnType<typeof runtime>) => {
    r.scene.children = { length: 1 }
    r.scene.tweens = { getTweens: () => [] }
    r.scene.registerQaDebugSnapshot()
  }
  beforeEach(() => window.history.replaceState(null, '', '/?localPreview=shadow-runner'))
  afterEach(() => {
    delete qaWindow.__shadowRunnerDebug
    delete qaWindow.__shadowRunnerQa
    window.history.replaceState(null, '', '/')
  })

  test.each([30, 60])('reports detached, precise geometry and only confirmed support at %s fps', fps => {
    const r = runtime({ moving: true })
    register(r)
    const read = () => qaWindow.__shadowRunnerDebug!().tiltBridges
    expect(read().playerSupport).toBeNull()
    r.run(0.5, fps)
    const snapshot = read()
    const bridge = snapshot.bridges[0]
    expect(Object.keys(snapshot).sort()).toEqual(['activeBodyCount', 'bridges', 'playerSupport', 'totalBridgeCount'])
    expect(Object.keys(bridge).sort()).toEqual(['activeBodyCount', 'id', 'left', 'maxSurfaceError', 'right', 'visualRotation'])
    expect(snapshot.totalBridgeCount).toBe(1)
    expect(snapshot.activeBodyCount).toBe(70)
    expect(bridge.activeBodyCount).toBe(70)
    expect(bridge.id).toBe(r.bridge.config.id)
    expect(bridge.visualRotation).toBe(r.bridge.visual.rotation)
    expect(bridge.left.x).toBeCloseTo(r.bridge.geometry.left.x, 10)
    expect(bridge.left.y).toBeCloseTo(r.bridge.geometry.left.y, 10)
    expect(bridge.right.x).toBeCloseTo(r.bridge.geometry.right.x, 10)
    expect(bridge.right.y).toBeCloseTo(r.bridge.geometry.right.y, 10)
    expect(bridge.maxSurfaceError).toBeCloseTo(r.bridge.geometry.maxSurfaceError, 10)
    expect(snapshot.playerSupport?.bridgeId).toBe(r.bridge.config.id)
    expect(snapshot.playerSupport?.surfaceY).toBeCloseTo(r.body.bottom, 10)
    const nextBuffer = JSON.stringify(r.bridge.nextGeometry)
    bridge.left.x = -9999
    snapshot.playerSupport!.surfaceY = -9999
    expect(read().bridges[0].left.x).not.toBe(-9999)
    expect(read().playerSupport?.surfaceY).toBeCloseTo(r.body.bottom, 10)
    expect(JSON.stringify(r.bridge.nextGeometry)).toBe(nextBuffer)
    r.input.current.jumpPresses += 1
    r.scene.updatePlayer(r.scene.activeTimeMs)
    expect(read().playerSupport).toBeNull()
    r.run(1, fps)
    expect(read().playerSupport).not.toBeNull()
    r.scene.suspendPlayerForRespawn()
    expect(read().playerSupport).toBeNull()
    r.close()
    expect(qaWindow.__shadowRunnerDebug).toBeUndefined()
  })

  test('bounds output without serializing caps and reports inactive art rather than stale cached geometry', () => {
    const r = runtime({ moving: true })
    for (let i = 1; i < 40; i += 1) r.scene.createTiltPlatform({ ...r.bridge.config, id: `far-${i}`, x: i * 2000 }, i)
    const farBridge = r.scene.tiltPlatforms[1]
    const staleGeometry = JSON.stringify(farBridge.geometry)
    r.run(0.5)
    register(r)
    const snapshot = qaWindow.__shadowRunnerDebug!().tiltBridges
    expect(snapshot.totalBridgeCount).toBe(40)
    expect(snapshot.bridges).toHaveLength(16)
    expect(snapshot.activeBodyCount).toBe(70)
    const far = snapshot.bridges[1]
    expect(far.activeBodyCount).toBe(0)
    expect(far.visualRotation).toBe(farBridge.visual.rotation)
    expect(far.left.y).toBeCloseTo(farBridge.config.y - 140 * Math.sin(far.visualRotation), 10)
    expect(far.left.y).not.toBeCloseTo(farBridge.geometry.left.y, 3)
    expect(JSON.stringify(farBridge.geometry)).toBe(staleGeometry)
    expect(JSON.stringify(snapshot)).not.toMatch(/"(slices|bodies|nextGeometry)"/)
    r.close()
  })

  test('keeps existing local QA gating and mutation-hook keys unchanged', () => {
    window.history.replaceState(null, '', '/')
    const ordinary = runtime()
    register(ordinary)
    expect(qaWindow.__shadowRunnerDebug).toBeUndefined()
    expect(qaWindow.__shadowRunnerQa).toBeUndefined()
    ordinary.close()
    window.history.replaceState(null, '', '/?localPreview=shadow-runner')
    const qa = runtime()
    register(qa)
    expect(Object.keys(qaWindow.__shadowRunnerQa!).sort()).toEqual([
      'collect', 'damage', 'damageEnemy', 'defeatEnemy', 'fireAtPlayer', 'move', 'restore', 'stormAtPlayer', 'teleport',
    ])
    qa.close()
  })
})
