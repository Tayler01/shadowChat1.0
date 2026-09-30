import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_TEN as level } from '../src/features/games/shadow-runner/game/levelTen'

jest.mock('phaser', () => ({ __esModule: true, default: {
  Scene: class { events = new (jest.requireActual('eventemitter3'))() },
  Game: class { constructor(public config: { scene: unknown[] }) {} },
  Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
  Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
  Math: { Clamp: jest.requireActual('phaser/src/math/Clamp'),
    Angle: { Between: jest.requireActual('phaser/src/math/angle/Between') } },
} }))
jest.mock('phaser/src/device/CanvasFeatures', () => ({ supportInverseAlpha: true, supportNewBlendModes: true }))

const World = jest.requireActual('phaser/src/physics/arcade/World')
const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
const gate = level.crouchGates!.find(item => item.id === 'relay-crouch-last')!
const caster = level.enemies!.find(item => item.id === 'relay-caster-06')!

function fixture(fps: number, casterX: number, cover = true, facing: 1 | -1 = -1) {
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'),
    input: { current: createShadowRunnerInputState() }, levelId: 'level-10', onHudChange: jest.fn() })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  scene.sys = { events: scene.events, scale: { width: 960, height: 540 } }
  const world = new World(scene, { gravity: { x: 0, y: 0 }, fps, fixedStep: true })
  scene.activeTimeMs = 1000
  scene.tweens = { killTweensOf: jest.fn() }
  const roof = new StaticBody(world)
  roof.setSize(gate.width, gate.height)
  roof.position.set(gate.x, gate.y)
  roof.updateCenter()
  world.add(roof)
  roof.enable = cover
  scene.crouchGates = { getChildren: () => [{ body: roof }] }
  const projectiles: any[] = []
  // The production factory configures the real Arcade body. Only art methods
  // and pool acquisition are substituted; collision and separation are installed Phaser.
  scene.acquireProjectile = (x: number, y: number) => {
    const data = new Map<string, unknown>()
    const orb: any = { x, y, width: 64, height: 64, scaleX: 1, scaleY: 1, angle: 0,
      displayOriginX: 32, displayOriginY: 32, active: true, visible: true,
      setDisplaySize(w: number, h: number) { this.scaleX = w / 64; this.scaleY = h / 64; return this },
      setDepth() { return this }, setAngularVelocity() { return this }, clearTint() { return this },
      setVelocity(x: number, y: number) { this.body.setVelocity(x, y); return this },
      setData(k: string, v: unknown) { data.set(k, v); return this }, getData(k: string) { return data.get(k) },
      disableBody() { this.active = this.visible = this.body.enable = false; return this },
    }
    orb.body = new Body(world, orb)
    world.add(orb.body)
    world.addCollider(orb, roof, () => scene.disableProjectile(orb))
    projectiles.push(orb)
    return orb
  }
  const player = new Body(world)
  player.setSize(32.76, 26.9568)
  player.position.set(gate.x + gate.width / 2 - player.width / 2, 616 - player.height)
  player.updateCenter()
  scene.player = { x: player.center.x, y: 616, body: player }
  scene.getEnemyKind = () => 'prism-caster'
  const fire = (count = 1) => scene.createRelayOrbs({ x: casterX, y: 616 }, count, caster,
    { x: player.center.x, y: player.center.y, facing })
  const run = () => {
    let hits = 0
    for (let frame = 0; frame < fps * 2; frame += 1) {
      scene.activeTimeMs += 1000 / fps
      world.update(scene.activeTimeMs, 1000 / fps)
      for (const orb of projectiles) if (orb.active && world.overlap(orb, player)) {
        hits += 1
        scene.disableProjectile(orb)
      }
      world.postUpdate()
    }
    return hits
  }
  return { scene, world, roof, projectiles, fire, run }
}

describe('Relay caster muzzle clearance with real Arcade collisions', () => {
  test.each([30, 60, 120])('the authored crawl roof blocks close caster fire at %ifps', fps => {
    for (const x of [22379, 22386, 22394, 22420]) {
      const r = fixture(fps, x)
      try {
        r.fire()
        if (x === 22420) expect(r.projectiles).toHaveLength(1)
        expect(r.run()).toBe(0)
      } finally { r.world.destroy() }
    }
  })

  test.each([30, 60, 120])('uncovered targets still take the configured shot at %ifps', fps => {
    const r = fixture(fps, 22386, false)
    try {
      r.fire()
      expect(r.projectiles).toHaveLength(1)
      expect(r.projectiles[0].getData('damage')).toBe(caster.projectileDamage ?? 3)
      expect(Math.hypot(r.projectiles[0].body.velocity.x, r.projectiles[0].body.velocity.y)).toBeCloseTo(510)
      expect(r.run()).toBe(1)
    } finally { r.world.destroy() }
  })

  test('both muzzle directions and multi-orb casts respect solid cover, but disabled cover does not', () => {
    for (const [x, facing] of [[22386, -1], [21994, 1]] as const) {
      const r = fixture(60, x, true, facing)
      try {
        r.fire(3)
        expect(r.projectiles).toHaveLength(0)
        r.roof.checkCollision.none = true
        r.fire(3)
        expect(r.projectiles).toHaveLength(3)
      } finally { r.world.destroy() }
    }
  })

  test('a thin wall within the muzzle reach blocks spawning on its far side', () => {
    const r = fixture(60, 22420)
    try {
      r.roof.setSize(8, gate.height)
      r.roof.position.set(22390, gate.y)
      r.roof.updateCenter()
      r.fire()
      expect(r.projectiles).toHaveLength(0)
    } finally { r.world.destroy() }
  })
})
