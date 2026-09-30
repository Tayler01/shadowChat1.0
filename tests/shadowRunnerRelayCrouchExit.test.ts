import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
const roof = level.crouchGates!.find(gate => gate.id === 'relay-crouch-choir')!
const cover = level.platforms.find(platform => platform.id === 'relay-cover-choir')!
const floor = level.platforms.find(platform => platform.id === 'relay-floor-13')!

function playerBody(x: number, crouching: boolean) {
  const sprite = { x, y: floor.y, angle: 0, width: 128, height: 128, displayWidth: 128, displayHeight: 128,
    displayOriginX: 64, displayOriginY: 128, scaleX: 1, scaleY: 1, frame: { realWidth: 128, realHeight: 128 } }
  const body = new Body({ defaults: {} }, sprite)
  sprite.scaleX = 0.78; sprite.scaleY = 0.78 * (crouching ? 0.72 : 1)
  body.setSize(42, crouching ? 48 : 70)
  body.setOffset(43, crouching ? 80 : 58)
  body.updateFromGameObject()
  return body
}

test('the choir crawl retains a44px lane with an80px exit to stand and jump', () => {
  expect(roof).toMatchObject({ x: 12040, width: 300, y: 446, height: 126 })
  expect(cover).toMatchObject({ x: 12420, width: 152, y: 504, height: 112 })
  expect(floor.y - roof.y - roof.height).toBe(44)
  expect(cover.x - roof.x - roof.width).toBe(80)
  const crouched = playerBody(12200, true)
  expect(crouched.height).toBeCloseTo(26.9568)
  expect(crouched.top).toBeGreaterThan(roof.y + roof.height)
})

test('an actual standing Phaser body fits the full arrival band beyond the choir roof', () => {
  for (const x of [12363, 12375, 12387]) {
    const body = playerBody(x, false)
    expect(body.width).toBeCloseTo(32.76)
    expect(body.height).toBeCloseTo(54.6)
    expect(body.left).toBeGreaterThan(roof.x + roof.width)
    expect(body.right).toBeLessThan(cover.x)
    expect(body.bottom).toBeCloseTo(floor.y)
  }
  const width = playerBody(12375, false).width
  // The original20px gap had no possible center that cleared both solids.
  expect(12360 - (roof.x + roof.width) - width).toBeLessThan(0)
  expect(cover.x - (roof.x + roof.width) - width).toBeGreaterThan(40)
})
