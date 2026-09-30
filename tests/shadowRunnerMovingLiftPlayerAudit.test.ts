import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_CONFIGS, type ShadowRunnerLevelConfig } from '../src/features/games/shadow-runner/game/levels'
import { CAPTAIN_GATE_TERRAIN_CROPS, DAWN_RELAY_TERRAIN_CROPS, SHADOW_RUNNER_TERRAIN_RUNTIME } from '../src/features/games/shadow-runner/game/runtimeCatalog'
import { getShadowRunnerPlatformArtLayout, SHADOW_RUNNER_PLATFORM_CONTACTS } from '../src/features/games/shadow-runner/game/runtimePlatformArt'

jest.mock('phaser/src/physics/arcade/ArcadeSprite', () => class {})
jest.mock('phaser/src/gameobjects/sprite/Sprite', () => class {})
jest.mock('phaser/src/device/CanvasFeatures', () => ({ supportInverseAlpha: true, supportNewBlendModes: true }))
jest.mock('phaser', () => ({ __esModule: true, default: {
  Scene: class { events = new (jest.requireActual('eventemitter3'))() },
  Game: class { constructor(public config: { scene: unknown[] }) {} },
  Physics: { Arcade: { Body: jest.requireActual('phaser/src/physics/arcade/Body') } },
  Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
  Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
  Loader: { Events: jest.requireActual('phaser/src/loader/events') },
  Math: {
    Clamp: jest.requireActual('phaser/src/math/Clamp'),
    Linear: jest.requireActual('phaser/src/math/Linear'),
    Distance: { Between: jest.requireActual('phaser/src/math/distance/DistanceBetween') },
  },
} }))

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
const StaticGroup = jest.requireActual('phaser/src/physics/arcade/StaticPhysicsGroup')
const World = jest.requireActual('phaser/src/physics/arcade/World')
const worlds: any[] = []
const reports: unknown[] = []
const halfWidth = 42 * 0.78 / 2
const standingHeight = 70 * 0.78
const crouchHeight = 48 * 0.78 * 0.72
type Lift = NonNullable<ShadowRunnerLevelConfig['movingPlatforms']>[number]
type Rect = { id: string; x: number; y: number; width: number; height: number }
const catalog = Object.values(SHADOW_RUNNER_LEVEL_CONFIGS).flatMap(level => (
  (level.movingPlatforms ?? []).map(lift => ({ level, lift }))
))
// Explicit pre-relocation geometry: these ceiling controls must not follow live shaft edits.
const legacyCases = {
  prism: { levelId: 'level-10',
    roof: { id: 'relay-high-prism-a', x: 3220, y: 326, width: 380, height: 42 },
    lift: { id: 'relay-lift-prism', x: 3260, y: 568, width: 160, height: 32, endY: 350, speed: 96, pauseMs: 860 } },
  signal: { levelId: 'level-9',
    roof: { id: 'captain-signal-high', x: 3200, y: 300, width: 360, height: 42 },
    lift: { id: 'captain-lift-signal', x: 3180, y: 568, width: 150, height: 32, endY: 350, speed: 88, pauseMs: 950 } },
  final: { levelId: 'level-10',
    roof: { id: 'relay-high-final-a', x: 23120, y: 300, width: 360, height: 42 },
    lift: { id: 'relay-lift-final', x: 23180, y: 568, width: 160, height: 32, endY: 300, speed: 110, pauseMs: 740 } },
} as const
function legacyCase(name: keyof typeof legacyCases) {
  const { levelId, roof, lift } = legacyCases[name]
  const level: ShadowRunnerLevelConfig = { ...SHADOW_RUNNER_LEVEL_CONFIGS[levelId],
    platforms: [roof], crouchGates: [], movingPlatforms: [lift] }
  return { level, lift, roof }
}
const intersects = (a: { left: number; right: number; top: number; bottom: number }, b: Rect) => (
  a.right > b.x + 0.0001 && a.left < b.x + b.width - 0.0001
  && a.bottom > b.y + 0.0001 && a.top < b.y + b.height - 0.0001
)
const fixedGeometry = (level: ShadowRunnerLevelConfig) => [...level.platforms, ...(level.crouchGates ?? [])]
const bounds = (x: number, y: number, height = standingHeight) => ({ left: x - halfWidth, right: x + halfWidth, top: y - height, bottom: y })
const rounded = (n: number) => Number(n.toFixed(4))

afterEach(() => { worlds.splice(0).forEach(world => world.destroy()) })
afterAll(() => {
  if (process.env.SHADOW_RUNNER_PLAYER_LIFT_AUDIT === '1') {
    console.log(JSON.stringify({
      scope: 'Installed Arcade World/Body/StaticBody/StaticGroup and actual updatePlayer, stance, jump and lift methods. Live authored geometry for the 13-lift matrix; explicit isolated pre-relocation geometry for legacy ceiling controls. No enemies, wind, dynamic bridges, browser, input replay or route acceptance. Rendering/audio and damage delivery are spies.',
      reports: reports.map((item: any) => item.case ? {
        ...item,
        final: item.final && { x: item.final.x, foot: item.final.foot, liftY: item.final.liftY, vy: item.final.vy },
        firstBodyOverlap: item.firstBodyOverlap && { time: item.firstBodyOverlap.time, foot: item.firstBodyOverlap.foot,
          liftY: item.firstBodyOverlap.liftY, solids: item.firstBodyOverlap.bodySolids },
        lastCarry: item.lastCarry && { x: item.lastCarry.x, foot: item.lastCarry.foot },
      } : item),
    }, null, 2))
  }
})

function sprite(world: any, x: number, y: number) {
  const object: any = {
    x, y, width: 128, height: 128, active: true, angle: 0, scaleX: 0.78, scaleY: 0.78, depth: 0,
    displayOriginX: 64, displayOriginY: 128, displayWidth: 128, displayHeight: 128,
    frame: { realWidth: 128, realHeight: 128 },
    setScale(a: number, b = a) { this.scaleX = a; this.scaleY = b; return this },
    setDepth(depth: number) { this.depth = depth; return this },
    setSize(w: number, h: number) { this.body.setSize(w, h); return this },
    setOffset(a: number, b: number) { this.body.setOffset(a, b); return this },
    setVelocity(a: number, b: number) { this.body.setVelocity(a, b); return this },
    setVelocityX(a: number) { this.body.setVelocityX(a); return this },
    setVelocityY(a: number) { this.body.setVelocityY(a); return this },
    setX(a: number) { this.x = a; return this },
    setPosition(a: number, b: number) { this.x = a; this.y = b; return this },
    setFlipX() { return this },
  }
  object.body = new Body(world, object)
  object.setSize(42, 70).setOffset(43, 58)
  object.body.setMaxVelocity(360, 940)
  object.body.setDragX(1450)
  object.body.updateFromGameObject()
  world.add(object.body)
  return object
}

function fixture(level: ShadowRunnerLevelConfig, lift: Lift, options: { x?: number; y?: number; direction?: 1 | -1; crouch?: boolean } = {}) {
  const input = { current: createShadowRunnerInputState() }
  const game = createShadowRunnerPhaserGame({
    parent: document.createElement('div'), input, onHudChange: jest.fn(), levelId: level.id,
  })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  scene.sys = { scale: { width: 960, height: 540 } }
  const world = new World(scene, { gravity: { x: 0, y: 1640 }, fps: 60, fixedStep: true })
  worlds.push(world)
  scene.physics = { world }
  scene.platforms = new StaticGroup(world, scene)
  scene.crouchGates = new StaticGroup(world, scene)
  const rectangle = (config: Rect, group: any) => {
    const object: any = {
      name: config.id, x: config.x + config.width / 2, y: config.y + config.height / 2,
      width: config.width, height: config.height, displayWidth: config.width, displayHeight: config.height,
      scaleX: 1, scaleY: 1, angle: 0, originX: 0.5, originY: 0.5,
      on() { return this }, off() { return this },
      setPosition(x: number, y: number) { this.x = x; this.y = y; return this },
      getTopLeft(point: any) { return point.set(this.x - this.width / 2, this.y - this.height / 2) },
    }
    object.body = new StaticBody(world, object)
    world.add(object.body)
    group.add(object)
    expect(object.body.left).toBe(config.x)
    expect(object.body.top).toBe(config.y)
    return object
  }
  level.platforms.forEach(config => rectangle(config, scene.platforms))
  level.crouchGates?.forEach(config => rectangle(config, scene.crouchGates))
  scene.movingPlatforms = (level.movingPlatforms ?? []).map(config => {
    const initialY = config.id === lift.id ? options.y ?? config.y : config.y
    const captain = level.id === 'level-9'
    const frame = captain ? 'captain-lift' : 'relay-lift'
    const crop = (captain ? CAPTAIN_GATE_TERRAIN_CROPS : DAWN_RELAY_TERRAIN_CROPS)[frame]
    const terrain = SHADOW_RUNNER_TERRAIN_RUNTIME[captain ? 'captain' : 'relay']
    const contact = SHADOW_RUNNER_PLATFORM_CONTACTS[terrain.textureKey][`terrain-${frame}`]
    const visualOffsetY = getShadowRunnerPlatformArtLayout(config, crop.height, contact)!.offsetY
    return {
      config, collider: rectangle({ ...config, y: initialY }, scene.platforms),
      visualOffsetY,
      visual: { x: config.x + config.width / 2, y: initialY + config.height / 2 + visualOffsetY,
        setPosition(x: number, y: number) { this.x = x; this.y = y } },
      startX: config.x, startY: config.y, endX: config.endX ?? config.x, endY: config.endY,
      direction: config.id === lift.id ? options.direction ?? -1 : -1, pauseUntil: 0,
      lastX: config.x, lastY: initialY,
    }
  })
  const runtime = scene.movingPlatforms.find((item: any) => item.config.id === lift.id)
  scene.player = sprite(world, options.x ?? lift.x + lift.width / 2, runtime.lastY)
  if (options.crouch) {
    input.current.crouch = true
    scene.setPlayerStance(true)
  }
  const player = scene.player
  const body = player.body
  world.addCollider(player, scene.platforms)
  world.addCollider(player, scene.crouchGates)
  scene.playSound = jest.fn()
  scene.addDustPuff = jest.fn()
  scene.updateHeroAnimation = jest.fn()
  scene.damagePlayerFromHazard = jest.fn(() => false)
  scene.handlePlayerFellOut = jest.fn()
  const trace: any[] = []
  let time = 0
  const frame = (fps: number) => {
    const delta = 1000 / fps
    time += delta
    scene.activeTimeMs = time
    scene.frameDeltaMs = delta
    world.update(time, delta)
    const preCarryY = body.bottom
    scene.updatePlayer(time)
    const preSpriteY = player.y
    const oldLiftY = runtime.lastY
    scene.updateMovingPlatforms(time)
    const carryY = player.y - preSpriteY
    const postCarryBodyY = body.bottom
    world.postUpdate()
    const projected = bounds(player.x, player.y, body.height)
    const fixed = fixedGeometry(level)
    const bodySolids = fixed.filter(solid => intersects(body, solid)).map(solid => solid.id)
    const spriteSolids = fixed.filter(solid => intersects(projected, solid)).map(solid => solid.id)
    const sample = { time, x: player.x, foot: body.bottom, top: body.top, spriteFoot: player.y,
      bodyWidth: body.width, bodyHeight: body.height, vx: body.velocity.x, vy: body.velocity.y,
      grounded: body.blocked.down || body.touching.down, blockedUp: body.blocked.up,
      blockedSide: body.blocked.left || body.blocked.right,
      bodySolids, spriteSolids, carryY, oldLiftY, liftY: runtime.lastY,
      preCarryY, postCarryBodyY, direction: runtime.direction, jumpsUsed: scene.jumpsUsed,
      pauseUntil: runtime.pauseUntil, visualY: runtime.visual.y,
      crouching: scene.crouching, standingBlocked: scene.standingBlocked,
      liftOverlap: world.intersects(body, runtime.collider.body),
    }
    trace.push(sample)
    return sample
  }
  const run = (ms: number, fps: number) => { for (let i = 0; i < Math.round(ms / 1000 * fps); i += 1) frame(fps) }
  const close = () => { world.destroy(); worlds.splice(worlds.indexOf(world), 1) }
  return { scene, world, runtime, player, body, input, trace, frame, run, close }
}

function clearStartX(level: ShadowRunnerLevelConfig, lift: Lift, y = lift.y, height = standingHeight) {
  return [lift.x + lift.width / 2, lift.x + lift.width - 20, lift.x + 20]
    .find(x => !fixedGeometry(level).some(solid => intersects(bounds(x, y, height), solid)))
}

function summary(r: ReturnType<typeof fixture>) {
  return {
    frames: r.trace.length,
    carryFrames: r.trace.filter(t => t.carryY !== 0).length,
    groundedFrames: r.trace.filter(t => t.grounded).length,
    bodyOverlapFrames: r.trace.filter(t => t.bodySolids.length).length,
    spriteOverlapFrames: r.trace.filter(t => t.spriteSolids.length).length,
    firstBodyOverlap: r.trace.find(t => t.bodySolids.length),
    maxSyncGap: rounded(Math.max(...r.trace.map(t => Math.abs(t.spriteFoot - t.foot)))),
    minFoot: rounded(Math.min(...r.trace.map(t => t.foot))),
    final: r.trace[r.trace.length - 1],
  }
}

test('all thirteen authored lifts have a valid full-body ascent staging position, with center obstructions recorded', () => {
  expect(catalog).toHaveLength(13)
  const results = catalog.map(({ level, lift }) => {
    const centerObstructions = fixedGeometry(level).filter(solid => intersects(bounds(lift.x + lift.width / 2, lift.y), solid)).map(solid => solid.id)
    const x = clearStartX(level, lift)
    expect(x).toBeDefined()
    expect(x! - halfWidth).toBeGreaterThanOrEqual(lift.x)
    expect(x! + halfWidth).toBeLessThanOrEqual(lift.x + lift.width)
    return { id: lift.id, x, centerObstructions, speed: lift.speed, pauseMs: lift.pauseMs }
  })
  reports.push({ catalog: results })
})

test.each([30, 60])('all live lifts ascend, reverse and descend without embedding or desynchronizing riders (%s fps)', fps => {
  for (const { level, lift } of catalog) {
    const r = fixture(level, lift, { x: clearStartX(level, lift) })
    const cycleMs = 2 * (lift.y - lift.endY) / lift.speed * 1000 + 2 * lift.pauseMs + 100
    r.run(cycleMs, fps)
    expect(r.trace.every(t => Number.isFinite(t.foot) && Number.isFinite(t.x))).toBe(true)
    expect(r.trace.some(t => t.carryY < 0)).toBe(true)
    expect(r.trace.some(t => t.direction === 1)).toBe(true)
    expect(r.trace.every(t => Math.abs(t.bodyWidth - 32.76) < 0.0001)).toBe(true)
    expect({ id: lift.id, bodyOverlaps: r.trace.filter(t => t.bodySolids.length),
      spriteOverlaps: r.trace.filter(t => t.spriteSolids.length) })
      .toEqual({ id: lift.id, bodyOverlaps: [], spriteOverlaps: [] })
    expect(summary(r).maxSyncGap).toBe(0)
    expect(r.trace.some(t => t.carryY > 0)).toBe(true)
    for (const t of r.trace) {
      expect(t.visualY).toBeCloseTo(t.liftY + lift.height / 2 + r.runtime.visualOffsetY, 8)
      expect(t.liftY).toBeGreaterThanOrEqual(lift.endY - 0.0001)
      expect(t.liftY).toBeLessThanOrEqual(lift.y + 0.0001)
    }
    const paused = r.trace.filter(t => t.time < t.pauseUntil && t.oldLiftY === t.liftY)
    expect(paused.length).toBeGreaterThan(0)
    expect(paused.every(t => t.carryY === 0)).toBe(true)
    reports.push({ case: 'full-cycle', id: lift.id, fps, ...summary(r) })
    r.close()
  }
})

test.each([30, 60])('descending carry synchronizes the actual body and sprite exactly once (%s fps)', fps => {
  for (const { level, lift } of catalog) {
    const y = lift.y - 24
    const x = clearStartX(level, lift, y)
    expect(x).toBeDefined()
    const r = fixture(level, lift, { x, y, direction: 1 })
    r.run(200, fps)
    expect(r.trace.some(t => t.carryY > 0)).toBe(true)
    for (const t of r.trace.filter(t => t.carryY !== 0)) {
      expect(t.postCarryBodyY - t.preCarryY).toBeCloseTo(t.carryY, 8)
      expect(t.spriteFoot).toBeCloseTo(t.foot, 8)
      expect(t.foot).toBeCloseTo(t.liftY, 8)
    }
    reports.push({ case: 'descending', id: lift.id, fps, ...summary(r) })
    r.close()
  }
})

test.each([30, 60])('records roof-blocked edge walks, stops carry after exit, and releases each lift on jump (%s fps)', fps => {
  for (const { level, lift } of catalog) {
    for (const direction of [-1, 1]) {
      const r = fixture(level, lift, { x: clearStartX(level, lift) })
      r.frame(fps)
      r.input.current[direction < 0 ? 'left' : 'right'] = true
      r.run(900, fps)
      const outside = r.trace.filter(t => t.x < lift.x - halfWidth - 6 || t.x > lift.x + lift.width + halfWidth + 6)
      const blockedByAuthoredSolid = r.trace.some(t => t.blockedSide)
      expect(outside.length > 0 || blockedByAuthoredSolid).toBe(true)
      expect(outside.every(t => t.carryY === 0)).toBe(true)
      reports.push({ case: 'edge-walk', id: lift.id, fps, direction, exited: outside.length > 0, blockedByAuthoredSolid,
        lastCarry: [...r.trace].reverse().find(t => t.carryY !== 0), final: r.trace[r.trace.length - 1] })
      r.close()
    }
    const r = fixture(level, lift, { x: clearStartX(level, lift) })
    r.frame(fps)
    r.input.current.jumpPresses += 1
    const t = r.frame(fps)
    expect(t.vy).toBe(-620)
    expect(t.carryY).toBe(0)
    r.run(140, fps)
    expect(r.trace.some(t => t.foot < lift.y - 30)).toBe(true)
    reports.push({ case: 'jump', id: lift.id, fps, ...summary(r) })
    r.close()
  }
})

test.each([30, 60])('legacy Prism shaft reverses and pauses at underside368 without embedding the standing rider (%s fps)', fps => {
  const { level, lift, roof } = legacyCase('prism')
  expect(roof.y + roof.height).toBe(368)
  const r = fixture(level, lift)
  expect(intersects(r.body, roof)).toBe(false)
  r.run(3000, fps)
  const stopped = r.trace.find(t => t.direction === 1)!
  expect(stopped).toBeDefined()
  expect(stopped.grounded).toBe(true)
  expect(stopped.top).toBeCloseTo(368, 8)
  expect(stopped.foot).toBeCloseTo(368 + standingHeight, 8)
  expect(stopped.pauseUntil - stopped.time).toBe(lift.pauseMs)
  expect(r.trace.every(t => t.bodySolids.length === 0 && t.spriteSolids.length === 0)).toBe(true)
  expect(r.trace.some(t => t.carryY > 0)).toBe(true)
  expect(summary(r).maxSyncGap).toBe(0)
  reports.push({ case: 'legacy-prism-ceiling-regression', fps, underside: 368, stopped })
  r.close()
})

test.each([30, 60])('legacy Captain shaft stops below its eight-pixel endpoint gap even for a crouched rider (%s fps)', fps => {
  const { level, lift, roof } = legacyCase('signal')
  expect(lift.endY - (roof.y + roof.height)).toBe(8)
  const r = fixture(level, lift, { crouch: true })
  expect(r.body.height).toBeCloseTo(crouchHeight)
  while (r.runtime.direction === -1 && r.trace.length < 4 * fps) r.frame(fps)
  const t = r.trace[r.trace.length - 1]
  expect(t.direction).toBe(1)
  expect(t.foot).toBeCloseTo(342 + crouchHeight, 8)
  expect(t.top).toBeCloseTo(342, 8)
  expect(t.pauseUntil - t.time).toBe(lift.pauseMs)
  expect(t.bodySolids).toEqual([])
  expect(t.standingBlocked).toBe(true)
  r.input.current.jumpPresses += 1
  const blockedJump = r.frame(fps)
  expect(blockedJump.crouching).toBe(true)
  expect(blockedJump.vy).toBe(0)
  r.run(lift.pauseMs + 1200, fps)
  expect(r.trace.every(sample => !sample.bodySolids.length && !sample.spriteSolids.length)).toBe(true)
  expect(r.trace.some(sample => sample.carryY > 0)).toBe(true)
  reports.push({ case: 'legacy-crouched-ceiling-regression', fps, stopped: t, ...summary(r) })
  r.close()
})

test.each([30, 60])('legacy final shaft cannot carry a non-jumping rider through the ledge (%s fps)', fps => {
  const { level, lift, roof } = legacyCase('final')
  const r = fixture(level, lift)
  expect(intersects(r.body, roof)).toBe(false)
  r.run(4000, fps)
  expect(r.input.current.jumpPresses).toBe(0)
  expect(r.trace.every(t => !t.bodySolids.length && !t.spriteSolids.length)).toBe(true)
  expect(Math.min(...r.trace.map(t => t.top))).toBeCloseTo(roof.y + roof.height, 8)
  expect(r.trace.every(t => t.foot >= roof.y + roof.height + standingHeight - 0.0001)).toBe(true)
  expect(r.trace.some(t => t.carryY > 0)).toBe(true)
  expect(r.body.blocked.down).toBe(true)
  reports.push({ case: 'legacy-final-ledge-no-bypass', fps, ...summary(r) })
  r.close()
})

test.each([30, 60])('stationary-lift control: ordinary double jump hits the same Prism ceiling without penetration (%s fps)', fps => {
  const { level, lift, roof } = legacyCase('prism')
  const r = fixture(level, lift)
  // Negative control only: a held lift isolates Arcade ceiling separation from manual carry.
  r.runtime.pauseUntil = Number.POSITIVE_INFINITY
  r.frame(fps)
  r.input.current.jumpPresses += 1
  r.frame(fps)
  r.run(350, fps)
  r.input.current.jumpPresses += 1
  r.frame(fps)
  r.run(1000, fps)
  expect(r.trace.some(t => t.blockedUp)).toBe(true)
  expect(r.trace.every(t => !t.bodySolids.includes(roof.id))).toBe(true)
  const minTop = Math.min(...r.trace.map(t => t.top))
  expect(minTop).toBeGreaterThanOrEqual(368 - 0.0001)
  // A 30fps render can include the next 60Hz gravity tick after the ceiling hit.
  expect(minTop).toBeLessThanOrEqual(368 + 1640 / (60 * 60) + 0.0001)
  expect(r.trace.every(t => t.carryY === 0)).toBe(true)
  r.close()
})

test('a falling player ten pixels above a lift receives no phantom carry before contact', () => {
  const { level, lift } = legacyCase('prism')
  const r = fixture(level, lift)
  r.player.y -= 10
  r.body.updateFromGameObject()
  const t = r.frame(60)
  expect(t.grounded).toBe(false)
  expect(t.vy).toBeGreaterThan(0)
  expect(t.preCarryY).toBeLessThan(lift.y)
  expect(t.carryY).toBe(0)
  expect(t.postCarryBodyY).toBe(t.preCarryY)
  r.close()
})

test('calibrated lift art matches collider deck and underside; old fixed offset remains a negative control', async () => {
  const source = readFileSync(resolve('src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts'), 'utf8')
  expect(source).toContain('contact && options.displayHeight === undefined')
  expect(source).toContain('displayHeight: contact ? undefined : Math.max(56, platform.height + 28)')
  expect(source).toContain('visualOffsetY: visual.y - platform.y - platform.height / 2')
  expect(source).toContain('nextY + config.height / 2 + runtime.visualOffsetY')
  for (const { level, lift } of catalog.filter((_, index) => index === 0 || index === 5)) {
    const captain = level.id === 'level-9'
    const frame = captain ? 'captain-lift' : 'relay-lift'
    const crop = (captain ? CAPTAIN_GATE_TERRAIN_CROPS : DAWN_RELAY_TERRAIN_CROPS)[frame]
    const terrain = SHADOW_RUNNER_TERRAIN_RUNTIME[captain ? 'captain' : 'relay']
    const contact = SHADOW_RUNNER_PLATFORM_CONTACTS[terrain.textureKey][`terrain-${frame}`]
    const { data, info } = await sharp(resolve('public', terrain.asset!.replace(/^\//, '')))
      .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let occupied = 0
    for (let x = 0; x < info.width; x += 1) if (data[(contact.top * info.width + x) * 4 + 3] >= 128) occupied += 1
    expect(occupied).toBeGreaterThan(0)
    const layout = getShadowRunnerPlatformArtLayout(lift, crop.height, contact)!
    const top = (lift.height - layout.displayHeight) / 2 + layout.offsetY
    const deck = top + contact.top * layout.displayHeight / crop.height
    const underside = top + contact.bottom * layout.displayHeight / crop.height
    expect(deck).toBeCloseTo(0, 8)
    expect(underside).toBeCloseTo(lift.height, 8)
    const oldDisplayHeight = Math.max(56, lift.height + 28)
    const oldGap = (lift.height - oldDisplayHeight) / 2 - 10 + contact.top * oldDisplayHeight / crop.height
    expect(oldGap).toBeCloseTo(captain ? 8.222222222 : 8.086956522, 6)
    reports.push({ case: 'art-contact', frame, crop, authoredDeckRow: contact.top,
      rowOpaquePixels: occupied, ...layout, deckBelowColliderPx: rounded(deck), undersidePx: rounded(underside),
      historicalFixedOffsetGap: rounded(oldGap) })
  }
})
