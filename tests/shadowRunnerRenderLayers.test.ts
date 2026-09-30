import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'

jest.mock('phaser', () => ({ __esModule: true, default: {
  Scene: class { events = new (jest.requireActual('eventemitter3'))() },
  Game: class { constructor(public config: { scene: unknown[] }) {} },
  Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
  Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
  Loader: { Events: jest.requireActual('phaser/src/loader/events') },
  Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
} }))

function fixture(levelId: 'level-8' | 'level-9' | 'level-10') {
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'),
    input: { current: createShadowRunnerInputState() }, onHudChange: jest.fn(), levelId })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  const created: any[] = []
  const object = (_x?: number, _y?: number, texture?: string) => {
    const data = new Map<string, unknown>()
    const item: any = { depth: 0, texture, body: { setAllowGravity() {} },
      setDepth(depth: number) { this.depth = depth; return this },
      setData(key: string, value: unknown) { data.set(key, value); return this },
      getData(key: string) { return data.get(key) },
    }
    for (const method of ['setOrigin', 'setScale', 'setCollideWorldBounds', 'setMaxVelocity',
      'setDragX', 'setSize', 'setOffset', 'play', 'setVisible', 'setAlpha', 'on',
      'setName', 'setFlipX', 'setVelocity', 'setDisplaySize', 'destroy']) {
      item[method] = function () { return this }
    }
    created.push(item)
    return item
  }
  scene.add = { sprite: object, image: object, graphics: object, circle: object }
  scene.physics = { add: { sprite: object, group: () => ({}), collider: jest.fn(), overlap: jest.fn() } }
  scene.textures = { exists: () => true }
  scene.tweens = { add: jest.fn() }
  return { scene, created }
}

test.each(['level-8', 'level-9', 'level-10'] as const)('%s actor factories keep bodies visible above terrain composites', levelId => {
  const { scene } = fixture(levelId)
  scene.createActors()
  expect(scene.player.depth).toBe(11)
  expect(scene.enemies.length).toBeGreaterThan(20)
  expect(scene.enemies.every((enemy: any) => enemy.depth === 10)).toBe(true)
  expect(scene.slashArc.depth).toBe(30)
  expect(scene.slashSprite.depth).toBe(30)
  expect(scene.boostAura.depth).toBeGreaterThan(scene.player.depth)
})

test('hit, coin and both dust paths remain visible above actors', () => {
  const { scene, created } = fixture('level-9')
  scene.addHitFlash(10, 20)
  expect(created[created.length - 1].depth).toBe(30)
  scene.addCoinSparkle(10, 20)
  expect(created[created.length - 1].depth).toBe(18)
  scene.addDustPuff(10, 20)
  expect(created[created.length - 1].depth).toBe(18)
  scene.textures.exists = () => false
  scene.addDustPuff(10, 20)
  expect(created[created.length - 1].depth).toBe(18)
})
