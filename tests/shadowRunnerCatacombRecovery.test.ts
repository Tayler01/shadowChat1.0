import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import { SHADOW_RUNNER_ENEMY_RUNTIME } from '../src/features/games/shadow-runner/game/runtimeCatalog'

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
const barrel = level.enemies!.find(enemy => enemy.id === 'catacomb-barrel-recovery')!
const upper = level.platforms.find(platform => platform.id === 'catacomb-pursuit-floor-b')!
const lower = level.platforms.find(platform => platform.id === 'catacomb-recovery-floor')!

function bodyAt(x: number, y: number) {
  const runtime = SHADOW_RUNNER_ENEMY_RUNTIME[barrel.kind]
  const size = runtime.frameSize ?? 128
  const sprite = { x, y, angle: 0, width: size, height: size, displayWidth: size, displayHeight: size,
    displayOriginX: size / 2, displayOriginY: size, scaleX: 1, scaleY: 1,
    frame: { realWidth: size, realHeight: size } }
  const body = new Body({ defaults: {} }, sprite)
  sprite.scaleX = runtime.scale; sprite.scaleY = runtime.scale
  body.setSize(runtime.body.width, runtime.body.height)
  body.setOffset(runtime.body.offsetX, runtime.body.offsetY)
  body.updateFromGameObject()
  return body
}

test('recovery passage fits crouch, not standing, without moving the upper jump target', () => {
  expect(upper).toMatchObject({ x: 10180, y: 616, width: 480, height: 44 })
  expect(lower).toMatchObject({ x: 9700, y: 704, width: 1710 })
  expect(lower.y - (upper.y + upper.height)).toBe(44)
  expect(lower.y - (upper.y + upper.height)).toBeGreaterThan(38)
  expect(lower.y - (upper.y + upper.height)).toBeLessThan(56)
})

test('barrel spawn and full recovery patrol remain outside every static solid', () => {
  expect(barrel).toMatchObject({ x: 10360, y: 704, patrolLeft: 9860, patrolRight: 11120, patrolSpeed: 138, contactDamage: 3 })
  for (let x = barrel.patrolLeft; x <= barrel.patrolRight; x += 10) {
    const spawn = bodyAt(x, barrel.y)
    const settled = bodyAt(x, barrel.y + lower.y - spawn.bottom)
    for (const body of [spawn, settled]) {
      const overlaps = level.platforms.filter(solid => body.left < solid.x + solid.width && body.right > solid.x
        && body.top < solid.y + solid.height && body.bottom > solid.y + 0.0001)
      expect(overlaps.map(solid => solid.id)).toEqual([])
      expect(body.left).toBeGreaterThan(lower.x)
      expect(body.right).toBeLessThan(lower.x + lower.width)
    }
    expect(settled.bottom).toBeCloseTo(lower.y)
  }
  const original = bodyAt(barrel.x, barrel.y)
  expect(Math.min(original.bottom, upper.y + 76) - Math.max(original.top, upper.y)).toBeCloseTo(20.48)
})
