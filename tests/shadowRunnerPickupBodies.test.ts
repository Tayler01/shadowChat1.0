import type Phaser from 'phaser'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { configureShadowRunnerPickupBody, syncShadowRunnerPickupBody } from '../src/features/games/shadow-runner/game/runtimePickupBodies'

const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')

function pickup(frameSize: number, scale: number, x = 740, y = 548) {
  const world = { defaults: {}, staticTree: { remove: jest.fn(), insert: jest.fn() } }
  const sprite = {
    x, y, originX: 0.5, originY: 0.5, displayWidth: frameSize, displayHeight: frameSize,
    active: true, collected: false, body: null as any,
    getData() { return this.collected },
    setPosition(nx: number, ny: number) { this.x = nx; this.y = ny },
    getTopLeft(point: { set: (x: number, y: number) => void }) { point.set(this.x - this.displayWidth / 2, this.y - this.displayHeight / 2) },
  }
  const body = new StaticBody(world, sprite)
  sprite.body = body
  sprite.displayWidth *= scale
  sprite.displayHeight *= scale
  return { sprite, body, world, typed: sprite as unknown as Phaser.Physics.Arcade.Sprite }
}

test.each([[48, .74, 16], [86, 42 / 86, 16], [64, .82, 18], [64, .9, 18], [64, .92, 18], [64, .96, 18], [64, .98, 19], [64, 1.02, 19], [64, 1.04, 19]])(
  'frame %s at scale %s retains a centered authored %spx circle', (frame, scale, radius) => {
    const { typed, body } = pickup(frame, scale)
    configureShadowRunnerPickupBody(typed, radius)
    expect([body.center.x, body.center.y]).toEqual([740, 548])
    expect([body.isCircle, body.radius, body.width, body.height]).toEqual([true, radius, radius * 2, radius * 2])
  },
)

test('reproduces the unreachable low coin and fixes it using installed Phaser StaticBody', () => {
  const { typed, body } = pickup(48, .74)
  body.setCircle(16, 8, 8)
  const crouchedTop = 584 - 26.9568
  expect(body.bottom).toBeLessThan(crouchedTop)
  configureShadowRunnerPickupBody(typed, 16)
  expect(body.bottom).toBeGreaterThan(crouchedTop)
})

test('visible bobbing follows the sprite without replacing the circle with frame dimensions', () => {
  const { typed, sprite, body } = pickup(86, 42 / 86, 6218, 460)
  configureShadowRunnerPickupBody(typed, 16)
  for (const y of [460, 456, 451, 455, 460]) {
    sprite.y = y
    syncShadowRunnerPickupBody(typed, 6000, 960)
    expect([body.center.x, body.center.y, body.radius, body.width]).toEqual([6218, y, 16, 32])
  }
})

test('offscreen, collected and disabled pickups avoid static-tree churn and never reenable themselves', () => {
  const { typed, sprite, body, world } = pickup(48, .74)
  configureShadowRunnerPickupBody(typed, 16)
  world.staticTree.insert.mockClear()
  syncShadowRunnerPickupBody(typed, 2000, 960)
  sprite.collected = true
  syncShadowRunnerPickupBody(typed, 0, 960)
  sprite.collected = false
  body.enable = false
  syncShadowRunnerPickupBody(typed, 0, 960)
  expect(world.staticTree.insert).not.toHaveBeenCalled()
  expect(body.enable).toBe(false)
})

test('all fourteen runtime pickup kinds use the shared circle setup and all thirteen bobbing kinds sync', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts'), 'utf8')
  expect(source.match(/configureShadowRunnerPickupBody\(/g)).toHaveLength(14)
  expect(source.match(/onUpdate: \(\) => syncShadowRunnerPickupBody\(/g)).toHaveLength(13)
  expect(source).not.toMatch(/\w+\.setCircle\(/)
})
