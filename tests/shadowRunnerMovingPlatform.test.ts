import {
  applyShadowRunnerMovingPlatformCarry as applyCarry,
  getShadowRunnerMovingPlatformStep as getStep,
  planShadowRunnerMovingPlatformCarry as planCarry,
  type MovingPlatformBounds,
  type MovingPlatformPoint,
  type MovingPlatformRider,
  type MovingPlatformSolid,
} from '../src/features/games/shadow-runner/game/runtimeMovingPlatform'
import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
const World = jest.requireActual('phaser/src/physics/arcade/World')
const WIDTH = 42 * 0.78
const HEIGHT = { standing: 70 * 0.78, crouched: 48 * 0.78 * 0.72 }
const worlds: any[] = []
const solid = (left: number, top: number, width: number, height: number): MovingPlatformSolid => (
  { left, right: left + width, top, bottom: top + height, enable: true }
)
const platform = solid(50, 200, 100, 20)
const rider = (overrides: Partial<MovingPlatformRider> = {}): MovingPlatformRider => ({
  ...solid(100 - WIDTH / 2, 200 - HEIGHT.standing, WIDTH, HEIGHT.standing),
  velocity: { x: 0, y: 0 }, blocked: { down: true }, touching: { down: false }, ...overrides,
})
const overlaps = (a: MovingPlatformBounds, b: MovingPlatformBounds) => (
  a.left < b.right - 1e-8 && a.right > b.left + 1e-8
  && a.top < b.bottom - 1e-8 && a.bottom > b.top + 1e-8
)
const translated = (a: MovingPlatformBounds, d: MovingPlatformPoint) => ({
  left: a.left + d.x, right: a.right + d.x, top: a.top + d.y, bottom: a.bottom + d.y,
})

afterEach(() => { worlds.splice(0).forEach(world => world.destroy()) })

test.each([30, 60])('bounded steps preserve authored speed at %s fps without endpoint overshoot', fps => {
  expect(getStep({ x: 0, y: 200 }, { x: 0, y: 0 }, 120, 1 / fps)).toEqual({ x: 0, y: -120 / fps })
  expect(getStep({ x: 0, y: 0 }, { x: 0, y: 200 }, 120, 1 / fps)).toEqual({ x: 0, y: 120 / fps })
  expect(getStep({ x: 0, y: 0 }, { x: 1, y: 1 }, 120, 1 / fps)).toEqual({ x: 1, y: 1 })
  const diagonal = getStep({ x: 0, y: 0 }, { x: 100, y: 100 }, 120, 1 / fps)
  expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(120 / fps)
})

test('long frames cap at50ms; zero motion and invalid inputs do not invent travel', () => {
  expect(getStep({ x: 0, y: 200 }, { x: 0, y: 0 }, 100, 2)).toEqual({ x: 0, y: -5 })
  expect(getStep({ x: 4, y: 8 }, { x: 4, y: 8 }, 100, 1)).toEqual({ x: 0, y: 0 })
  expect(getStep({ x: 0, y: 0 }, { x: 10, y: 10 }, 100, 0)).toEqual({ x: 0, y: 0 })
  for (const bad of [-1, NaN, Infinity]) {
    expect(() => getStep({ x: 0, y: 0 }, { x: 10, y: 10 }, bad, 1 / 60)).toThrow(RangeError)
    expect(() => getStep({ x: 0, y: 0 }, { x: 10, y: 10 }, 100, bad)).toThrow(RangeError)
  }
})

test('support uses actual foot overlap, grounded contact and at most0.5px separation', () => {
  const carry = (body: MovingPlatformRider) => planCarry(platform, { x: 2, y: -2 }, body, [platform])
  expect(carry(rider()).supported).toBe(true)
  expect(carry(rider({ left: platform.right - 1, right: platform.right + WIDTH - 1 })).supported).toBe(true)
  expect(carry(rider({ left: platform.left - WIDTH + 1, right: platform.left + 1 })).supported).toBe(true)
  for (const body of [
    rider({ left: platform.right, right: platform.right + WIDTH }),
    rider({ left: platform.left - WIDTH, right: platform.left }),
    rider({ top: 140, bottom: platform.top - 10, velocity: { x: 0, y: 50 } }),
    rider({ bottom: platform.top + 0.51 }),
    rider({ bottom: platform.top - 0.51 }),
    rider({ velocity: { x: 0, y: -1 } }),
    rider({ blocked: { down: false }, touching: { down: false } }),
    rider({ enable: false }),
  ]) {
    const plan = carry(body)
    expect(plan.supported).toBe(false)
    expect(plan.riderDelta).toEqual({ x: 0, y: 0 })
    expect(plan.delta).toEqual({ x: 2, y: -2 })
  }
  expect(carry(rider({ bottom: platform.top - 0.5 })).supported).toBe(true)
  expect(carry(rider({ bottom: platform.top + 0.5 })).supported).toBe(true)
  expect(carry(rider({ blocked: { down: false }, touching: { down: true } })).supported).toBe(true)
})

test.each(['standing', 'crouched'] as const)('full actual %s AABB stops both lift and rider at a thin ceiling', stance => {
  const body = rider({ top: 200 - HEIGHT[stance] })
  const roof = solid(0, body.top - 2, 300, 1)
  const plan = planCarry(platform, { x: 0, y: -20 }, body, [platform, roof])
  expect(plan.supported).toBe(true)
  expect(plan.blocked).toBe(true)
  expect(plan.blocker).toBe(roof)
  expect(plan.delta.y).toBeCloseTo(-1)
  expect(plan.riderDelta).toEqual(plan.delta)
  expect(overlaps(translated(body, plan.delta), roof)).toBe(false)
  expect(body.bottom).toBe(200)
  expect(platform.top).toBe(200)
})

test('ceiling detection covers the rider overhang, not only sprite center or lift width', () => {
  const body = rider({ left: 145, right: 145 + WIDTH })
  const roof = solid(165, body.top - 8, 2, 1)
  const plan = planCarry(platform, { x: 0, y: -16 }, body, [roof])
  expect(plan.supported).toBe(true)
  expect(plan.blocker).toBe(roof)
  expect(plan.delta.y).toBeCloseTo(-7)
})

test.each([
  { delta: { x: 100, y: 0 }, obstacle: solid(130, 140, 1, 80), axis: 'x', distance: 130 - (100 + WIDTH / 2) },
  { delta: { x: -100, y: 0 }, obstacle: solid(60, 140, 1, 80), axis: 'x', distance: 61 - (100 - WIDTH / 2) },
  { delta: { x: 0, y: 100 }, obstacle: solid(0, 220, 300, 1), axis: 'y', distance: 20 },
] as const)('sweeps side and downward obstacles even when the final AABB would miss them ($axis/$distance)', ({ delta, obstacle, axis, distance }) => {
  const plan = planCarry(platform, delta, rider(), [obstacle])
  expect(plan.blocker).toBe(obstacle)
  expect(plan.delta[axis]).toBeCloseTo(distance)
  expect(overlaps(translated(rider(), plan.delta), obstacle)).toBe(false)
})

test('diagonal contact clamps the whole path without sliding; nearest solid wins regardless of order', () => {
  const body = rider()
  const near = solid(0, body.top - 11, 300, 1)
  const far = solid(0, body.top - 31, 300, 1)
  for (const solids of [[near, far], [far, near]]) {
    const plan = planCarry(platform, { x: 40, y: -40 }, body, solids)
    expect(plan.blocker).toBe(near)
    expect(plan.delta).toEqual({ x: 10, y: -10 })
    expect(plan.fraction).toBe(0.25)
  }
})

test('touching permits parallel or away motion, but inward motion and initial penetration report blocked', () => {
  const body = rider()
  const roof = solid(0, body.top - 20, 300, 20)
  expect(planCarry(platform, { x: 2, y: 0 }, body, [roof]).blocked).toBe(false)
  expect(planCarry(platform, { x: 0, y: 2 }, body, [roof]).blocked).toBe(false)
  expect(planCarry(platform, { x: 0, y: -2 }, body, [roof]).fraction).toBe(0)
  const embedded = solid(0, body.top - 20, 300, 21)
  const stopped = planCarry(platform, { x: 5, y: 5 }, body, [embedded])
  expect(stopped.blocked).toBe(true)
  expect(stopped.delta).toEqual({ x: 0, y: 0 })
  expect(body.top).toBe(200 - HEIGHT.standing)
})

test('disabled/non-colliding bodies, the exact carrier and the rider are ignored', () => {
  const body = rider()
  const roof = solid(0, body.top - 2, 300, 1)
  const plan = planCarry(platform, { x: 0, y: -10 }, body, [platform, body,
    { ...roof, enable: false }, { ...roof, checkCollision: { none: true } }])
  expect(plan.blocked).toBe(false)
  expect(plan.delta.y).toBe(-10)
  expect(planCarry(platform, { x: 0, y: -10 }, null, [roof]).supported).toBe(false)
  expect(planCarry({ ...platform, enable: false }, { x: 0, y: -10 }, body, [roof]).supported).toBe(false)
  expect(() => planCarry(platform, { x: NaN, y: 0 }, body, [])).toThrow(RangeError)
  expect(() => planCarry(platform, { x: 1, y: 0 }, body, [{ ...roof, right: roof.left }])).toThrow(RangeError)
})

type Rect = { x: number; y: number; width: number; height: number }

// Real installed Arcade integration. Only the sprite's rendering surface is inert.
function fixture(lift: Rect, obstacles: Rect[] = [], options: { crouched?: boolean; x?: number } = {}) {
  const world = new World({ sys: { scale: { width: 960, height: 760 } } },
    { gravity: { x: 0, y: 1640 }, fps: 60, fixedStep: true })
  worlds.push(world)
  const rectangle = (rect: Rect) => {
    const object: any = {
      x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height,
      displayWidth: rect.width, displayHeight: rect.height, scaleX: 1, scaleY: 1, angle: 0,
      originX: 0.5, originY: 0.5,
      getTopLeft(point: any) { return point.set(this.x - this.width / 2, this.y - this.height / 2) },
    }
    object.body = new StaticBody(world, object)
    world.add(object.body)
    expect(object.body.left).toBe(rect.x)
    expect(object.body.top).toBe(rect.y)
    return object
  }
  const carrier = rectangle(lift)
  const fixed = obstacles.map(rectangle)
  const sprite: any = {
    x: options.x ?? lift.x + lift.width / 2, y: lift.y, width: 128, height: 128,
    active: true, angle: 0, scaleX: 0.78, scaleY: 0.78 * (options.crouched ? 0.72 : 1),
    displayOriginX: 64, displayOriginY: 128, frame: { realWidth: 128, realHeight: 128 },
    get displayWidth() { return this.width * this.scaleX },
    get displayHeight() { return this.height * this.scaleY },
  }
  const body = new Body(world, sprite)
  sprite.body = body
  body.setSize(42, options.crouched ? 48 : 70)
  body.setOffset(43, options.crouched ? 80 : 58)
  body.updateFromGameObject()
  world.add(body)
  const solids = [carrier.body, ...fixed.map(object => object.body)]
  world.addCollider(body, solids)
  let time = 0
  const frame = (target: MovingPlatformPoint, speed: number, fps: number, afterPhysics?: () => void) => {
    const dt = 1000 / fps
    time += dt
    world.update(time, dt)
    afterPhysics?.()
    const oldFoot = body.bottom
    const oldSprite = { x: sprite.x, y: sprite.y }
    const step = getStep({ x: carrier.body.left, y: carrier.body.top }, target, speed, 1 / fps)
    const plan = planCarry(carrier.body, step, body, solids)
    applyCarry(body, sprite, plan.riderDelta)
    carrier.x += plan.delta.x
    carrier.y += plan.delta.y
    carrier.body.updateFromGameObject()
    expect(body.bottom).toBeCloseTo(oldFoot + plan.riderDelta.y, 8)
    expect(sprite.x).toBeCloseTo(oldSprite.x + plan.riderDelta.x, 8)
    expect(sprite.y).toBeCloseTo(oldSprite.y + plan.riderDelta.y, 8)
    expect(body.center.y).toBeCloseTo(body.top + body.halfHeight, 8)
    world.postUpdate()
    expect(sprite.y).toBeCloseTo(body.bottom, 8)
    expect(sprite.x).toBeCloseTo((body.left + body.right) / 2, 8)
    return plan
  }
  return { world, carrier, body, sprite, solids, fixed, frame }
}

test.each([30, 60])('installed Arcade carries ascent/descent/pause without stale body or doubled postUpdate at%s fps', fps => {
  const r = fixture({ x: 50, y: 300, width: 150, height: 32 })
  for (let i = 0; i < fps; i += 1) {
    const plan = r.frame({ x: 50, y: 200 }, 60, fps)
    expect(plan.supported).toBe(true)
    expect(plan.blocked).toBe(false)
    expect(r.body.bottom).toBeCloseTo(r.carrier.body.top, 8)
  }
  expect(r.body.bottom).toBeCloseTo(240, 8)
  for (let i = 0; i < fps; i += 1) r.frame({ x: 50, y: 300 }, 60, fps)
  expect(r.body.bottom).toBeCloseTo(300, 8)
  for (let i = 0; i < 3; i += 1) {
    expect(r.frame({ x: 50, y: 300 }, 60, fps).delta).toEqual({ x: 0, y: 0 })
    expect(r.body.bottom).toBeCloseTo(300, 8)
  }
})

test.each([30, 60])('installed Arcade ceiling contact blocks a whole lift, then permits reversal at%s fps', fps => {
  for (const crouched of [false, true]) {
    const r = fixture({ x: 50, y: 568, width: 160, height: 32 },
      [{ x: 0, y: 326, width: 300, height: 42 }], { crouched })
    let blocked = false
    for (let i = 0; i < 3 * fps; i += 1) {
      const plan = r.frame({ x: 50, y: 350 }, 96, fps)
      blocked ||= plan.blocked
      expect(r.fixed.some(object => overlaps(r.body, object.body))).toBe(false)
      expect(r.body.bottom).toBeCloseTo(r.carrier.body.top, 7)
    }
    expect(blocked).toBe(true)
    expect(r.body.top).toBeCloseTo(368, 6)
    expect(r.body.height).toBeCloseTo(crouched ? HEIGHT.crouched : HEIGHT.standing, 8)
    expect(r.frame({ x: 50, y: 568 }, 96, fps).blocked).toBe(false)
    expect(r.body.top).toBeGreaterThan(368)
  }
})

test.each([30, 60])('installed Arcade preserves pending walking motion and releases on real jump/end at%s fps', fps => {
  const r = fixture({ x: 50, y: 300, width: 150, height: 32 })
  r.body.setVelocityX(60)
  const start = r.sprite.x
  const plan = r.frame({ x: 100, y: 300 }, 30, fps)
  expect(plan.supported).toBe(true)
  expect(r.sprite.x - start).toBeCloseTo(90 / fps, 6)
  expect(r.body.velocity.x).toBe(60)
  const jump = r.frame({ x: 100, y: 200 }, 60, fps, () => r.body.setVelocityY(-620))
  expect(jump.supported).toBe(false)
  expect(jump.riderDelta).toEqual({ x: 0, y: 0 })
  expect(r.body.velocity.y).toBe(-620)
  for (const direction of [-1, 1]) {
    const edge = fixture({ x: 50, y: 300, width: 100, height: 32 })
    edge.body.setVelocityX(direction * 260)
    let released = false
    for (let i = 0; i < fps; i += 1) {
      const carry = edge.frame({ x: 50, y: 200 }, 20, fps)
      const outside = edge.body.right <= edge.carrier.body.left || edge.body.left >= edge.carrier.body.right
      if (outside) {
        expect(carry.supported).toBe(false)
        expect(carry.riderDelta).toEqual({ x: 0, y: 0 })
        released = true
      }
    }
    expect(released).toBe(true)
  }
})

test('installed Arcade falling near a lift is not carried before contact', () => {
  const r = fixture({ x: 50, y: 300, width: 100, height: 32 })
  r.sprite.y -= 10
  r.body.updateFromGameObject()
  const plan = r.frame({ x: 50, y: 200 }, 96, 60)
  expect(plan.supported).toBe(false)
  expect(r.body.bottom).toBeLessThan(r.carrier.body.top)
  expect(r.body.velocity.y).toBeGreaterThan(0)
})

test('translation preserves real body history, dimensions and velocity and ignores a disabled body', () => {
  const r = fixture({ x: 50, y: 300, width: 100, height: 32 }, [], { crouched: true })
  r.body.setVelocity(17, -620)
  const initial = { position: { ...r.body.position }, prev: { ...r.body.prev }, prevFrame: { ...r.body.prevFrame }, autoFrame: { ...r.body.autoFrame } }
  expect(applyCarry(r.body, r.sprite, { x: 3, y: -4 })).toBe(true)
  for (const key of ['position', 'prev', 'prevFrame', 'autoFrame'] as const) {
    expect(r.body[key].x).toBeCloseTo(initial[key].x + 3)
    expect(r.body[key].y).toBeCloseTo(initial[key].y - 4)
  }
  expect(r.body.width).toBeCloseTo(WIDTH)
  expect(r.body.height).toBeCloseTo(HEIGHT.crouched)
  expect(r.body.velocity.x).toBe(17)
  expect(r.body.velocity.y).toBe(-620)
  const x = r.body.x
  r.body.enable = false
  expect(applyCarry(r.body, r.sprite, { x: 100, y: 100 })).toBe(false)
  expect(r.body.x).toBe(x)
  r.body.enable = true
  expect(() => applyCarry(r.body, r.sprite, { x: NaN, y: 0 })).toThrow(RangeError)
  expect(r.body.x).toBe(x)
})

test.each([30, 60])('all authored lift shafts stop safely or reach the endpoint with installed Arcade at%s fps', fps => {
  const catalog = Object.values(SHADOW_RUNNER_LEVEL_CONFIGS).flatMap(level => (
    (level.movingPlatforms ?? []).map(lift => ({ level, lift }))
  ))
  expect(catalog).toHaveLength(13)
  for (const { level, lift } of catalog) {
    const fixed = [...level.platforms, ...(level.crouchGates ?? [])]
    const x = [lift.x + lift.width / 2, lift.x + lift.width - 20, lift.x + 20].find(x => (
      !fixed.some(rect => overlaps(solid(x - WIDTH / 2, lift.y - HEIGHT.standing, WIDTH, HEIGHT.standing),
        solid(rect.x, rect.y, rect.width, rect.height)))
    ))
    expect(x).toBeDefined()
    const r = fixture(lift, fixed, { x })
    const target = { x: lift.endX ?? lift.x, y: lift.endY }
    const frames = Math.ceil(Math.hypot(target.x - lift.x, target.y - lift.y) / lift.speed * fps) + 2
    let blocked = false
    for (let i = 0; i < frames; i += 1) {
      const plan = r.frame(target, lift.speed, fps)
      expect(r.fixed.some(object => overlaps(r.body, object.body))).toBe(false)
      if (plan.blocked) { blocked = true; break }
    }
    if (!blocked) expect(r.carrier.body.top).toBeCloseTo(lift.endY, 6)
  }
})
