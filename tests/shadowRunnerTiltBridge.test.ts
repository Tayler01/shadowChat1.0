import type Phaser from 'phaser'
import {
  createTiltBridgeGeometry,
  updateTiltBridgeGeometry,
  getTiltBridgeContactIndex,
  getTiltBridgeContact,
  getTiltBridgeDownhillAcceleration,
  getTiltBridgeSliceVelocity,
  getTiltBridgeSupportVelocityY,
  sampleTiltBridgeSurface,
  type TiltBridgeContact,
  type TiltBridgePose,
} from '../src/features/games/shadow-runner/game/runtimeTiltBridge'

const ArcadeWorld = jest.requireActual('phaser/src/physics/arcade/World') as typeof Phaser.Physics.Arcade.World
const ArcadeBody = jest.requireActual('phaser/src/physics/arcade/Body') as typeof Phaser.Physics.Arcade.Body
const pose = (rotation = 0, length = 172): TiltBridgePose => ({
  pivotX: 0, pivotY: 2, length, deckOffsetY: -2, rotation,
})
const footWidth = 42 * 0.78
const physicsDelta = 1 / 60

describe('tilt bridge pure geometry', () => {
  it('reuses every geometry allocation and preserves the allocating helper results', () => {
    const geometry = createTiltBridgeGeometry(pose(0, 280))
    const slices = [...geometry.slices]
    const endpoints = [geometry.left, geometry.right]
    for (const rotation of [-0.255, -0.05, 0, 0.08, 0.255]) {
      const expected = createTiltBridgeGeometry(pose(rotation, 280))
      updateTiltBridgeGeometry(geometry, pose(rotation, 280))
      expect(geometry.left).toBe(endpoints[0])
      expect(geometry.right).toBe(endpoints[1])
      geometry.slices.forEach((slice, index) => {
        expect(slice).toBe(slices[index])
        expect(slice.x).toBeCloseTo(expected.slices[index].x, 10)
        expect(slice.y).toBeCloseTo(expected.slices[index].y, 10)
        expect(slice.width).toBeCloseTo(expected.slices[index].width, 10)
      })
      for (let x = -180; x <= 180; x += 0.5) {
        expect(getTiltBridgeContactIndex(geometry, x, x + footWidth))
          .toBe(getTiltBridgeContact(geometry, { left: x, right: x + footWidth })?.slice.index ?? -1)
      }
    }
  })

  it('reproduces the authored flat-top baseline around the actual visual pivot', () => {
    const geometry = createTiltBridgeGeometry(pose())
    expect(geometry.left).toEqual({ x: -86, y: 0 })
    expect(geometry.right).toEqual({ x: 86, y: 0 })
    expect(geometry.slices).toHaveLength(43)
    expect(geometry.slices.every(slice => slice.y === 0)).toBe(true)
    expect(geometry.maxSurfaceError).toBe(0)
  })

  it('quantifies the Causeway flat-collider mismatch without inferring an alpha-art baseline', () => {
    const geometry = createTiltBridgeGeometry(pose(0.255))
    expect(geometry.right.y).toBeCloseTo(21.75777855117936, 10)
    expect(geometry.left.y).toBeCloseTo(-21.628431733933663, 10)
    expect(geometry.right.x - 172 * 0.18).toBeCloseTo(52.76353424648625, 10)
  })

  it.each([-0.255, -0.134, -0.05, 0, 0.05, 0.134, 0.255])(
    'has no gaps, overhanging ends or more than 0.505px surface error at %s radians', rotation => {
      const geometry = createTiltBridgeGeometry(pose(rotation, 280))
      expect(geometry.slices).toHaveLength(70)
      expect(geometry.slices[0].x).toBe(geometry.left.x)
      const last = geometry.slices[geometry.slices.length - 1]
      expect(last.x + last.width).toBeCloseTo(geometry.right.x, 12)
      for (const [index, slice] of geometry.slices.entries()) {
        if (index > 0) {
          const previous = geometry.slices[index - 1]
          expect(slice.x).toBeCloseTo(previous.x + previous.width, 12)
        }
        for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
          const surfaceY = sampleTiltBridgeSurface(geometry, slice.x + slice.width * fraction)!
          expect(Math.abs(slice.y - surfaceY)).toBeLessThanOrEqual(geometry.maxSurfaceError + 1e-10)
        }
      }
      expect(geometry.maxSurfaceError).toBeLessThan(0.505)
    },
  )

  it.each([-0.255, 0, 0.255])('retains mid-deck support through the old 32/68 percent dump lines at %s', rotation => {
    const geometry = createTiltBridgeGeometry(pose(rotation, 280))
    for (const fraction of [0.32, 0.5, 0.68]) {
      const centerX = (fraction - 0.5) * 280
      const contact = getTiltBridgeContact(geometry, { left: centerX - footWidth / 2, right: centerX + footWidth / 2 })
      expect(contact).not.toBeNull()
      expect(Math.abs(contact!.slice.y - contact!.surfaceY)).toBeLessThanOrEqual(geometry.maxSurfaceError + 1e-10)
    }
  })

  it('drops contact only when the trailing foot edge clears the literal rotated end', () => {
    const geometry = createTiltBridgeGeometry(pose(0.255))
    expect(getTiltBridgeContact(geometry, { left: geometry.right.x - 0.001, right: geometry.right.x + footWidth })).not.toBeNull()
    expect(getTiltBridgeContact(geometry, { left: geometry.right.x, right: geometry.right.x + footWidth })).toBeNull()
    expect(getTiltBridgeContact(geometry, { left: geometry.left.x - footWidth, right: geometry.left.x + 0.001 })).not.toBeNull()
    expect(getTiltBridgeContact(geometry, { left: geometry.left.x - footWidth, right: geometry.left.x })).toBeNull()
    expect(sampleTiltBridgeSurface(geometry, geometry.left.x - 0.001)).toBeNull()
    expect(sampleTiltBridgeSurface(geometry, geometry.right.x + 0.001)).toBeNull()
  })

  it('uses the uphill foot, and selects one collider across slice boundaries', () => {
    for (const rotation of [-0.255, 0.255]) {
      const geometry = createTiltBridgeGeometry(pose(rotation))
      for (let center = -50; center <= 50; center += 0.25) {
        const left = center - footWidth / 2
        const right = center + footWidth / 2
        const contact = getTiltBridgeContact(geometry, { left, right })!
        expect(contact.surfaceX).toBe(rotation > 0 ? left : right)
        expect(geometry.slices.includes(contact.slice)).toBe(true)
        expect(Math.abs(contact.surfaceY - contact.slice.y)).toBeLessThan(0.505)
      }
    }
  })

  it('has identical foot geometry for standing and crouching', () => {
    const geometry = createTiltBridgeGeometry(pose(0.255))
    const standing = { left: -footWidth / 2, right: footWidth / 2, top: -54.6, bottom: 0 }
    const crouching = { ...standing, top: -26.9568 }
    expect(getTiltBridgeContact(geometry, standing)).toEqual(getTiltBridgeContact(geometry, crouching))
  })

  it('derives timestep-correct platform velocity without accumulating a render-rate impulse', () => {
    const finalPositions: number[][] = []
    for (const fps of [30, 60]) {
      let previous = createTiltBridgeGeometry(pose(-0.05))
      let x = previous.slices[30].x
      let y = previous.slices[30].y
      for (let tick = 1; tick <= fps; tick += 1) {
        const next = createTiltBridgeGeometry(pose(-0.05 + 0.305 * tick / fps))
        const velocity = getTiltBridgeSliceVelocity(previous.slices[30], next.slices[30], 1 / fps)
        x += velocity.x / fps
        y += velocity.y / fps
        previous = next
      }
      finalPositions.push([x, y])
    }
    expect(finalPositions[0][0]).toBeCloseTo(finalPositions[1][0], 12)
    expect(finalPositions[0][1]).toBeCloseTo(finalPositions[1][1], 12)
    expect(getTiltBridgeDownhillAcceleration(0, 1640)).toBe(0)
    expect(getTiltBridgeDownhillAcceleration(-0.255, 1640)).toBe(-getTiltBridgeDownhillAcceleration(0.255, 1640))
  })

  it('rejects invalid and unbounded geometry instead of allocating or silently flattening it', () => {
    for (const invalid of [{ length: 0 }, { length: Infinity }, { rotation: Math.PI / 2 }, { pivotX: NaN }]) {
      expect(() => createTiltBridgeGeometry({ ...pose(), ...invalid })).toThrow(RangeError)
    }
    expect(() => createTiltBridgeGeometry(pose(), { maxSliceLength: 0 })).toThrow(RangeError)
    expect(() => createTiltBridgeGeometry(pose(), { maxSliceLength: 0.01 })).toThrow(RangeError)
    expect(() => createTiltBridgeGeometry(pose(), { thickness: -1 })).toThrow(RangeError)
    const geometry = createTiltBridgeGeometry(pose())
    expect(getTiltBridgeContact(geometry, { left: 5, right: 5 })).toBeNull()
    expect(() => getTiltBridgeSliceVelocity(geometry.slices[0], geometry.slices[1], physicsDelta)).toThrow(RangeError)
    expect(() => getTiltBridgeSliceVelocity(geometry.slices[0], geometry.slices[0], 0)).toThrow(RangeError)
    const contact = getTiltBridgeContact(geometry, { left: -10, right: 10 })!
    expect(() => getTiltBridgeSupportVelocityY(contact, contact, 0, 0)).toThrow(RangeError)
    expect(() => sampleTiltBridgeSurface(geometry, NaN)).toThrow(RangeError)
    expect(() => getTiltBridgeDownhillAcceleration(Infinity, 1640)).toThrow(RangeError)
  })
})

// Source-only fixture using the installed Arcade World/Body/collider implementation.
// No renderer, custom separation, direct player position correction or runtime edits.
function simulate(options: {
  fps?: number
  seconds?: number
  rotation?: number
  rotate?: boolean
  walk?: number
  slip?: boolean
  crouch?: boolean
  jumpAt?: number
  startX?: number
} = {}) {
  const { fps = 60, seconds = 1, rotation = 0.255, rotate = false, walk = 0, slip = false, crouch = false } = options
  const world = new ArcadeWorld({ sys: { scale: { width: 960, height: 640 } } } as Phaser.Scene, { gravity: { x: 0, y: 1640 } })
  const poseAt = (time: number) => pose(rotate ? 0.255 * Math.sin(time * Math.PI) : rotation, 280)
  let geometry = createTiltBridgeGeometry(poseAt(0))
  const slices = geometry.slices.map(slice => {
    const body = new ArcadeBody(world)
    body.setSize(slice.width, slice.height, false)
    body.position.set(slice.x, slice.y)
    body.updateCenter()
    body.setAllowGravity(false)
    body.setImmovable(true)
    body.setFrictionX(1)
    body.checkCollision.left = false
    body.checkCollision.right = false
    body.checkCollision.down = false
    world.add(body)
    return body
  })
  const player = new ArcadeBody(world)
  const height = crouch ? 48 * 0.78 * 0.72 : 70 * 0.78
  player.setSize(footWidth, height, false)
  player.setMaxVelocity(430, 940)
  const startX = options.startX ?? (walk > 0 ? -80 : walk < 0 ? 80 : 0)
  const initialContact = getTiltBridgeContact(geometry, { left: startX - footWidth / 2, right: startX + footWidth / 2 })!
  player.position.set(startX - footWidth / 2, initialContact.slice.y - height)
  player.updateCenter()
  world.add(player)

  let step = 0
  let grounded = true
  let collisions = 0
  let takeoff = false
  let selectedContact: TiltBridgeContact | null | undefined
  let confirmedContact: TiltBridgeContact | null = initialContact
  let nextGeometry = geometry
  const trace: { step: number; x: number; bottom: number; vy: number; grounded: boolean; eligible: boolean; surfaceError: number | null; hits: number }[] = []
  world.addCollider(player, slices, () => { collisions += 1 }, (_player, candidate) => {
    const platform = candidate as Phaser.Physics.Arcade.Body
    if (takeoff || player.deltaY() <= platform.deltaY()
      || player.prev.y + player.height > platform.prev.y + world.OVERLAP_BIAS) return false
    if (selectedContact === undefined) {
      selectedContact = getTiltBridgeContact(nextGeometry, player)
    }
    return selectedContact !== null && candidate === slices[selectedContact.slice.index]
  })

  const prepareStep = () => {
    const time = step * physicsDelta
    nextGeometry = createTiltBridgeGeometry(poseAt(time + physicsDelta))
    slices.forEach((body, index) => {
      const target = nextGeometry.slices[index]
      const velocity = getTiltBridgeSliceVelocity(geometry.slices[index], target, physicsDelta)
      body.setSize(target.width, target.height, false)
      body.setVelocity(velocity.x, velocity.y)
    })
    takeoff = options.jumpAt !== undefined && step === options.jumpAt
    if (!slip) player.setVelocityX(walk)
    player.setAccelerationX(slip && grounded ? getTiltBridgeDownhillAcceleration(poseAt(time).rotation, 1640) : 0)
    if (takeoff) {
      player.setVelocityY(-600)
      grounded = false
    }
    const previous = confirmedContact
    const nextVelocityX = Math.max(-430, Math.min(430, player.velocity.x + player.acceleration.x * physicsDelta))
    const next = getTiltBridgeContact(nextGeometry, {
      left: player.left + nextVelocityX * physicsDelta,
      right: player.right + nextVelocityX * physicsDelta,
    })
    if (grounded && previous && next && !takeoff) {
      player.setVelocityY(getTiltBridgeSupportVelocityY(previous, next, slices[next.slice.index].velocity.y, physicsDelta))
    }
    collisions = 0
    selectedContact = undefined
  }
  world.on('worldstep', () => {
    step += 1
    grounded = collisions > 0
    confirmedContact = grounded ? selectedContact ?? null : null
    geometry = nextGeometry
    const contact = getTiltBridgeContact(geometry, player)
    trace.push({
      step, x: player.center.x, bottom: player.bottom, vy: player.velocity.y,
      grounded, eligible: contact !== null, hits: collisions,
      surfaceError: contact ? Math.abs(player.bottom - contact.surfaceY) : null,
    })
    prepareStep()
  })
  prepareStep()
  for (let frame = 0; frame < Math.round(fps * seconds); frame += 1) {
    world.update(frame * 1000 / fps, 1000 / fps)
    world.postUpdate()
  }
  const result = { trace, finalX: player.center.x, finalY: player.bottom, finalVelocityX: player.velocity.x }
  world.destroy()
  return result
}

describe('installed Phaser Arcade source-only contact proof', () => {
  it('quantifies the existing per-render velocity reset with native 60Hz drag at 30/60 render fps', () => {
    const distances: number[] = []
    for (const fps of [60, 30]) {
      const world = new ArcadeWorld({ sys: { scale: { width: 960, height: 640 } } } as Phaser.Scene, {})
      const body = new ArcadeBody(world)
      body.setDragX(1450)
      world.add(body)
      for (let frame = 0; frame < fps; frame += 1) {
        body.setVelocityX(238)
        world.update(frame * 1000 / fps, 1000 / fps)
        world.postUpdate()
      }
      distances.push(body.x)
      world.destroy()
    }
    expect(distances[0]).toBeCloseTo(238 - 1450 / 60, 8)
    expect(distances[1]).toBeCloseTo(201.75, 8)
    expect(distances[0] - distances[1]).toBeCloseTo(12.08333333333333, 8)
  })

  it.each([-0.255, 0, 0.255])('rests on a %s radian deck without mid-deck fallthrough', rotation => {
    const result = simulate({ rotation, seconds: 2 })
    expect(result.trace).toHaveLength(120)
    expect(result.trace.every(frame => frame.grounded && frame.hits === 1)).toBe(true)
    expect(Math.max(...result.trace.map(frame => frame.surfaceError!))).toBeLessThan(0.505)
  })

  it.each([
    [-0.255, 260, false], [0.255, 260, false], [-0.255, -260, false], [0.255, -260, false],
    [-0.255, 112, true], [0.255, 112, true], [-0.255, -112, true], [0.255, -112, true],
    [-0.255, 430, false], [0.255, -430, false],
  ] as const)('walks/crouches over every seam and falls only beyond an end (%s, %s, %s)', (rotation, walk, crouch) => {
    const result = simulate({ rotation, walk, crouch, seconds: 3 })
    const supported = result.trace.filter(frame => frame.eligible)
    expect(supported.length).toBeGreaterThan(10)
    expect(supported.every(frame => frame.grounded && frame.hits === 1)).toBe(true)
    expect(Math.max(...supported.map(frame => frame.surfaceError!))).toBeLessThan(0.505)
    const firstFall = result.trace.find(frame => !frame.grounded)!
    expect(firstFall.eligible).toBe(false)
    expect(Math.abs(result.finalX)).toBeGreaterThan(200)
    expect(result.finalY).toBeGreaterThan(100)
  })

  it('uses the real native carry while the deck rotates and never carries twice', () => {
    const result = simulate({ rotate: true, seconds: 2, startX: 65 })
    expect(result.trace.every(frame => frame.grounded && frame.hits === 1)).toBe(true)
    expect(Math.max(...result.trace.map(frame => frame.surfaceError!))).toBeLessThan(0.7)
    expect(Math.max(...result.trace.map(frame => Math.abs(frame.bottom)))).toBeGreaterThan(10)
    expect(Math.abs(result.finalX - 65)).toBeLessThan(1)
  })

  it.each([-100, -16.38, 0, 16.38, 100])('keeps one contact through rocking slice boundaries at foot center %s', startX => {
    const result = simulate({ rotate: true, seconds: 4, startX, fps: 30 })
    expect(result.trace.filter(frame => !frame.grounded || frame.hits !== 1)).toEqual([])
    expect(Math.max(...result.trace.map(frame => frame.surfaceError!))).toBeLessThan(0.7)
  })

  it('leaves support immediately on jump and lets Arcade handle the airborne arc and re-landing', () => {
    const result = simulate({ jumpAt: 10, seconds: 2 })
    expect(result.trace[10].grounded).toBe(false)
    expect(result.trace[10].vy).toBeLessThan(-500)
    expect(result.trace.slice(10, 40).every(frame => !frame.grounded)).toBe(true)
    expect(result.trace[result.trace.length - 1].grounded).toBe(true)
  })

  it.each([-200, 200])('does not ground an actor below the top or catch its underside at vy=%s', velocityY => {
    const world = new ArcadeWorld({ sys: { scale: { width: 960, height: 640 } } } as Phaser.Scene, {})
    const geometry = createTiltBridgeGeometry(pose(0.255))
    const player = new ArcadeBody(world)
    player.setSize(footWidth, 54.6, false)
    player.position.set(-footWidth / 2, 20)
    player.setVelocityY(velocityY)
    world.add(player)
    const slice = getTiltBridgeContact(geometry, player)!.slice
    if (velocityY > 0) player.position.y = slice.y - 20
    const support = new ArcadeBody(world)
    support.setSize(slice.width, slice.height, false)
    support.position.set(slice.x, slice.y)
    support.setImmovable(true)
    support.checkCollision.left = false
    support.checkCollision.right = false
    support.checkCollision.down = false
    world.add(support)
    const collide = jest.fn()
    world.addCollider(player, support, collide, () => player.deltaY() > support.deltaY()
      && player.prev.y + player.height <= support.prev.y + world.OVERLAP_BIAS)
    for (let frame = 0; frame < 45; frame += 1) world.update(frame * 1000 / 60, 1000 / 60)
    expect(collide).not.toHaveBeenCalled()
    if (velocityY < 0) expect(player.bottom).toBeLessThan(slice.y)
    else expect(player.bottom).toBeGreaterThan(slice.y + slice.height)
    expect(player.velocity.y).toBe(velocityY)
    world.destroy()
  })

  it.each([{ rotate: true }, { walk: 260 }, { walk: -112, crouch: true }, { slip: true }, { jumpAt: 10 }, { rotate: true, jumpAt: 10, crouch: true }])(
    'produces the same physics trace at 30/60 render fps for %j', options => {
      const at60 = simulate({ ...options, fps: 60, seconds: 2 })
      const at30 = simulate({ ...options, fps: 30, seconds: 2 })
      expect(at30.trace).toHaveLength(120)
      expect(at30.trace).toEqual(at60.trace)
    },
  )

  it('slides downhill through Arcade acceleration and exits the literal end without disabling collision', () => {
    const result = simulate({ slip: true, seconds: 2 })
    expect(result.finalVelocityX).toBeGreaterThan(200)
    const firstFall = result.trace.find(frame => !frame.grounded)!
    expect(firstFall.eligible).toBe(false)
    expect(result.finalX).toBeGreaterThan(200)
    expect(result.finalY).toBeGreaterThan(100)
  })
})
