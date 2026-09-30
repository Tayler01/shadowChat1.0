import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
const World = jest.requireActual('phaser/src/physics/arcade/World')
const WIDTH = 42 * 0.78
const HEIGHT = { standing: 70 * 0.78, crouched: 48 * 0.78 * 0.72 }
const passages = Object.values(SHADOW_RUNNER_LEVEL_CONFIGS).flatMap(level =>
  (level.crouchGates ?? []).map(gate => {
    const below = level.platforms.filter(floor => floor.y >= gate.y + gate.height
      && floor.x < gate.x + gate.width && floor.x + floor.width > gate.x)
    return { id: `${level.id}/${gate.id}`, width: gate.width, height: gate.height,
      clearance: Math.min(...below.map(floor => floor.y)) - gate.y - gate.height }
  }))

// Installed Arcade separation with authored roof dimensions/clearance and actual
// stance sizes. The flat test apron isolates clearance, not whole-level traversal.
function crossPassage(passage: { width: number; height: number; clearance: number }, crouched: boolean, direction: number, fps: number) {
  const world = new World({ sys: { scale: { width: 960, height: 760 } } },
    { gravity: { x: 0, y: 1640 }, fps: 60, fixedStep: true })
  const left = 200, right = left + passage.width, floorY = 616
  const solids = [
    { x: left - 160, y: floorY, width: passage.width + 320, height: 80 },
    { x: left, y: floorY - passage.clearance - passage.height, width: passage.width, height: passage.height },
  ].map(rect => {
    const body = new StaticBody(world)
    body.setSize(rect.width, rect.height, false)
    body.position.set(rect.x, rect.y)
    body.updateCenter()
    world.add(body)
    return body
  })
  const body = new Body(world)
  body.setSize(WIDTH, crouched ? HEIGHT.crouched : HEIGHT.standing, false)
  const start = direction > 0 ? left - 80 : right + 80
  body.position.set(start - WIDTH / 2, floorY - body.height)
  body.updateCenter()
  world.add(body)
  world.addCollider(body, solids)
  const speed = crouched ? 112 : 260
  try {
    const frames = Math.ceil((passage.width + 200) / speed * fps)
    for (let frame = 0; frame < frames; frame += 1) {
      body.setVelocityX(direction * speed)
      world.update(frame * 1000 / fps, 1000 / fps)
      world.postUpdate()
    }
    return { x: body.x + WIDTH / 2, bottom: body.bottom, left: body.left, right: body.right,
      crossed: direction > 0 ? body.left > right : body.right < left }
  } finally { world.destroy() }
}

describe('actual standing and crouched passage separation', () => {
  test.each(passages)('$id blocks upright entry but passes crouched in both directions at30/60fps', passage => {
    expect(Number.isFinite(passage.clearance)).toBe(true)
    expect(passage.clearance).toBeGreaterThan(HEIGHT.crouched)
    expect(passage.clearance).toBeLessThan(HEIGHT.standing)
    for (const fps of [30, 60]) for (const direction of [-1, 1]) {
      const standing = crossPassage(passage, false, direction, fps)
      expect(standing.crossed).toBe(false)
      expect(direction > 0 ? standing.right : standing.left).toBeCloseTo(direction > 0 ? 200 : 200 + passage.width, 5)
      expect(standing.bottom).toBeCloseTo(616, 5)
      const crouched = crossPassage(passage, true, direction, fps)
      expect(crouched.crossed).toBe(true)
      expect(crouched.bottom).toBeCloseTo(616, 5)
    }
  })

  test('negative control exposes an oversized upright-passable clearance', () => {
    for (const direction of [-1, 1]) {
      expect(crossPassage({ width: 300, height: 100, clearance: HEIGHT.standing + 8 }, false, direction, 60).crossed).toBe(true)
    }
  })
})
