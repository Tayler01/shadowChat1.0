import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'

jest.mock('phaser', () => ({ __esModule: true, default: {
  Scene: class { events = new (jest.requireActual('eventemitter3'))() },
  Game: class { constructor(public config: { scene: unknown[] }) {} },
  Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
  Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
  Math: { Clamp: (n: number, a: number, b: number) => Math.max(a, Math.min(b, n)) },
} }))
jest.mock('phaser/src/device/CanvasFeatures', () => ({ supportInverseAlpha: true, supportNewBlendModes: true }))

const World = jest.requireActual('phaser/src/physics/arcade/World')
const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')

function sprite(x: number, y: number) {
  const data = new Map<string, unknown>()
  const item: any = { x, y, width: 64, height: 64, scaleX: 1, scaleY: 1, angle: 0,
    displayOriginX: 32, displayOriginY: 32, originX: 0.5, originY: 0.5,
    displayWidth: 64, displayHeight: 64, active: true, visible: true,
    setPosition(a: number, b: number) { this.x = a; this.y = b; return this },
    getTopLeft(v: any) { return v.set(this.x - this.displayWidth / 2, this.y - this.displayHeight / 2) },
    setDisplaySize(w: number, h: number) { this.displayWidth = w; this.displayHeight = h; this.scaleX = w / this.width; this.scaleY = h / this.height; return this },
    setScale(a: number, b = a) { this.scaleX = a; this.scaleY = b; return this },
    setData(k: string, v: unknown) { data.set(k, v); return this }, getData(k: string) { return data.get(k) },
    setTexture() { return this }, setAlpha() { return this }, setDepth() { return this },
    setTint() { return this }, clearTint() { return this }, setImmovable() { return this },
    disableBody() { this.body.enable = this.active = this.visible = false; return this },
    enableBody(_reset: boolean, a: number, b: number) { this.x = a; this.y = b; this.body.enable = this.active = this.visible = true; return this },
  }
  return item
}

function runtime(fps: number, kind = 'storm-bomb', side = 'floor', speed = 900) {
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'),
    input: { current: createShadowRunnerInputState() }, levelId: 'level-9', onHudChange: jest.fn() })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  scene.sys = { events: scene.events, scale: { width: 960, height: 540 } }
  const world = new World(scene, { gravity: { x: 0, y: 0 }, fps, fixedStep: true })
  const hazards: any[] = []
  scene.physics = { world }
  scene.activeTimeMs = 1000
  scene.tweens = { add: jest.fn(), killTweensOf: jest.fn() }
  scene.shakeCamera = jest.fn()
  scene.candleHazards = {
    getChildren: () => hazards, getFirstDead: () => hazards.find(item => !item.active),
    create(x: number, y: number) {
      const item = sprite(x, y)
      item.body = new StaticBody(world, item)
      world.add(item.body)
      hazards.push(item)
      return item
    },
  }
  const surface = new StaticBody(world)
  surface.setSize(200, 24)
  surface.position.set(200, 300)
  surface.updateCenter()
  world.add(surface)
  const projectile = sprite(side === 'wall' ? 100 : 300, side === 'ceiling' ? 420 : side === 'wall' ? 312 : 200)
  if (kind === 'candle') Object.assign(projectile, { width: 34, height: 18, displayOriginX: 17, displayOriginY: 9 })
  projectile.setDisplaySize(kind === 'candle' ? 34 : 46, kind === 'candle' ? 18 : 46)
    .setData('projectileKind', kind).setData('hazardDurationMs', 1250)
  projectile.body = new Body(world, projectile)
  if (kind === 'candle') projectile.body.setSize(26, 14).setOffset(4, 2)
  else projectile.body.setSize(30, 30).setOffset(17, 17)
  world.add(projectile.body)
  projectile.body.setVelocity(side === 'wall' ? speed : 0, side === 'wall' ? 0 : side === 'ceiling' ? -speed : speed)
  const contacts: any[] = []
  world.addCollider(projectile, surface, () => {
    contacts.push({ kind, speed, spriteY: projectile.y, bodyBottom: projectile.body.bottom,
      bodyTop: projectile.body.top, previousBottom: projectile.body.prev.y + projectile.body.height,
      centerY: projectile.body.center.y, surfaceY: surface.top, touching: { ...projectile.body.touching } })
    scene.maybeCreateProjectileImpactHazard(projectile, surface)
    projectile.body.enable = false
  })
  const frame = () => {
    scene.activeTimeMs += 1000 / fps
    world.update(scene.activeTimeMs, 1000 / fps)
    scene.updateCandleHazards(scene.activeTimeMs)
    world.postUpdate()
  }
  const impact = () => { for (let i = 0; i < fps && !contacts.length; i += 1) frame() }
  return { scene, world, surface, projectile, hazards, contacts, frame, impact, close: () => world.destroy() }
}

describe('actual Arcade projectile impacts and persistent floor hazards', () => {
  test.each([30, 60, 120])('candle and storm fire sit above the contacted floor at %ifps', fps => {
    for (const kind of ['candle', 'storm-bomb']) for (const speed of [300, 900]) {
      const r = runtime(fps, kind, 'floor', speed)
      try {
        r.impact()
        expect(r.contacts).toHaveLength(1)
        expect(r.contacts[0].touching.down).toBe(true)
        const fire = r.hazards[0]
        expect(fire).toBeDefined()
        expect(fire.y + fire.displayHeight / 2).toBeCloseTo(300)
        expect(fire.body.top).toBeGreaterThanOrEqual(fire.y - fire.displayHeight / 2)
        expect(fire.body.bottom).toBeLessThanOrEqual(300)
        expect(fire.body.top).toBeLessThan(290)
        const player = new Body(r.world)
        player.position.set(fire.x - 16, 273)
        player.setSize(32, 27)
        player.updateCenter()
        expect(r.world.overlap(player, fire.body)).toBe(true)
      } finally { r.close() }
    }
  })

  test.each(['wall', 'ceiling'])('%s impacts do not leave floating floor fire', side => {
    for (const kind of ['candle', 'storm-bomb']) {
      const r = runtime(60, kind, side)
      try {
        r.impact()
        expect(r.contacts).toHaveLength(1)
        expect(r.hazards.length).toBe(0)
      } finally { r.close() }
    }
  })

  test('fire follows its support without resizing its collision body and expires when support disappears', () => {
    const r = runtime(60)
    try {
      r.impact()
      const fire = r.hazards[0]
      const original = { x: fire.body.x, y: fire.body.y, centerX: fire.body.center.x, centerY: fire.body.center.y }
      // A visual pulse must not resize or displace the damaging rectangle.
      fire.displayWidth *= 1.12
      fire.displayHeight *= 0.88
      r.surface.x += 37
      r.surface.y -= 23
      r.surface.updateCenter()
      r.scene.updateCandleHazards(r.scene.activeTimeMs + 16)
      expect(fire.body.x).toBeCloseTo(original.x + 37)
      expect(fire.body.y).toBeCloseTo(original.y - 23)
      expect(fire.body.center.x).toBeCloseTo(original.centerX + 37)
      expect(fire.body.center.y).toBeCloseTo(original.centerY - 23)
      expect([fire.body.width, fire.body.height]).toEqual([58, 26])
      expect(r.world.staticTree.search({ minX: fire.body.left, minY: fire.body.top,
        maxX: fire.body.right, maxY: fire.body.bottom })).toContain(fire.body)
      r.surface.enable = false
      r.scene.updateCandleHazards(r.scene.activeTimeMs + 32)
      expect(fire.active).toBe(false)
      expect(fire.body.enable).toBe(false)
      expect(fire.getData('impactSupport')).toBeUndefined()
    } finally { r.close() }
  })

  test('expiry and pooled candle reuse replace the support and preserve the new deadline', () => {
    const r = runtime(60)
    try {
      r.impact()
      const fire = r.hazards[0]
      const expiresAt = fire.getData('expiresAt')
      r.scene.updateCandleHazards(expiresAt - 1)
      expect(fire.active).toBe(true)
      r.scene.updateCandleHazards(expiresAt)
      expect(fire.active).toBe(false)
      expect(fire.getData('impactSupport')).toBeUndefined()
      const next = new StaticBody(r.world)
      next.setSize(200, 24)
      next.position.set(500, 420)
      next.updateCenter()
      r.world.add(next)
      r.projectile.setData('projectileKind', 'candle')
      r.projectile.body.reset(600, 320)
      r.projectile.body.enable = true
      r.projectile.body.setVelocity(0, 300)
      r.scene.activeTimeMs = expiresAt + 100
      r.world.addCollider(r.projectile, next, () => {
        r.scene.maybeCreateProjectileImpactHazard(r.projectile, next)
        r.projectile.body.enable = false
      })
      for (let i = 0; i < 60 && !fire.active; i += 1) r.frame()
      expect(fire.active).toBe(true)
      expect(r.hazards.length).toBe(1)
      expect(fire.getData('impactSupport').body === next).toBe(true)
      expect([fire.body.width, fire.body.height]).toEqual([22, 38])
      expect(fire.y + fire.displayHeight / 2).toBeCloseTo(420)
      const deadline = fire.getData('expiresAt')
      const x = fire.body.x
      r.surface.x += 500
      r.surface.updateCenter()
      r.scene.updateCandleHazards(r.scene.activeTimeMs + 16)
      expect(fire.body.x).toBe(x)
      expect(fire.getData('expiresAt')).toBe(deadline)
      next.checkCollision.none = true
      r.scene.updateCandleHazards(r.scene.activeTimeMs + 32)
      expect(fire.active).toBe(false)
    } finally { r.close() }
  })

  test('arrow impacts never create a floor hazard', () => {
    const r = runtime(60, 'arrow')
    try { r.impact(); expect(r.contacts.length).toBe(1); expect(r.hazards.length).toBe(0) }
    finally { r.close() }
  })
})
