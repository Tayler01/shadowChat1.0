import { SHADOW_RUNNER_LEVEL_CONFIGS, getShadowRunnerLevelEnemies } from '../src/features/games/shadow-runner/game/levels'
import { SHADOW_RUNNER_ENEMY_RUNTIME } from '../src/features/games/shadow-runner/game/runtimeCatalog'

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-7']
const stalker = getShadowRunnerLevelEnemies(level).find(enemy => enemy.id === 'causeway-stalker-b')!
const floor = level.platforms.find(platform => platform.id === 'causeway-high-recovery-a')!

function stalkerBody(x: number, y: number) {
  const runtime = SHADOW_RUNNER_ENEMY_RUNTIME[stalker.kind]
  const frameSize = runtime.frameSize ?? 128
  const sprite = {
    x, y, angle: 0, width: frameSize, height: frameSize,
    displayWidth: frameSize, displayHeight: frameSize,
    displayOriginX: frameSize / 2, displayOriginY: frameSize,
    scaleX: 1, scaleY: 1, frame: { realWidth: frameSize, realHeight: frameSize },
  }
  const body = new Body({ defaults: {} }, sprite)
  // Match createEnemySprite: bottom origin, runtime scale, body size, then offset.
  sprite.scaleX = runtime.scale
  sprite.scaleY = runtime.scale
  body.setSize(runtime.body.width, runtime.body.height)
  body.setOffset(runtime.body.offsetX, runtime.body.offsetY)
  body.updateFromGameObject()
  return body
}

test('causeway stalker B keeps its saved patrol/combat contract with only its grounded spawn corrected', () => {
  expect(stalker).toEqual({
    id: 'causeway-stalker-b', kind: 'moon-stalker', x: 4680, y: 604,
    health: 5, maxHealth: 5, patrolLeft: 4480, patrolRight: 5100, direction: 1,
    patrolSpeed: 182, attackRange: 470, attackCooldownMs: 1040, contactDamage: 3,
  })
  expect(floor).toMatchObject({ x: 4370, y: 604, width: 900, height: 64 })
  expect(stalker.y).toBe(floor.y)
})

test('installed Phaser body feet meet continuous support at spawn and both patrol limits', () => {
  for (const x of [stalker.patrolLeft, stalker.x, stalker.patrolRight]) {
    const body = stalkerBody(x, stalker.y)
    expect(body.width).toBeCloseTo(42 * 0.62)
    expect(body.height).toBeCloseTo(66 * 0.62)
    expect(body.bottom).toBeCloseTo(floor.y)
    expect(body.top).toBeLessThan(floor.y)
    expect(body.left).toBeGreaterThan(floor.x)
    expect(body.right).toBeLessThan(floor.x + floor.width)
    const overlappingSolids = [...level.platforms, ...level.tiltPlatforms, ...(level.crouchGates ?? [])]
      .filter(solid => body.right > solid.x && body.left < solid.x + solid.width
        && body.bottom > solid.y + 0.0001 && body.top < solid.y + solid.height)
    expect(overlappingSolids).toEqual([])
  }
})

test('the original y616 spawn embeds the actual Phaser body 12px into the y604 floor', () => {
  const original = stalkerBody(stalker.x, 616)
  expect(original.bottom - floor.y).toBeCloseTo(12)
  expect(original.top).toBeLessThan(floor.y)
  expect(original.bottom).toBeLessThan(floor.y + floor.height)
  expect(original.left).toBeGreaterThan(floor.x)
  expect(original.right).toBeLessThan(floor.x + floor.width)
})
