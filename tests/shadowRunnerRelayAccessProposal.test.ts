import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState, setShadowRunnerAction } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_TEN } from '../src/features/games/shadow-runner/game/levelTen'
import { getShadowRunnerLandingDamage } from '../src/features/games/shadow-runner/game/runtimeReliability'
import type { ShadowRunnerRect } from '../src/features/games/shadow-runner/game/levels'

// Accepted authored contract. Fixtures clone live config; these values never patch it.
export const RELAY_ACCESS_PROPOSAL = {
  status: 'accepted live-geometry contract; isolated physics, not input-only campaign proof',
  preserve: '122 coins / 36 enemies / 5 Relay Flames / 8 power-locked Dispatches',
  movedSteps: [
    { id: 'relay-crouch-step-01', x: 1540, y: 480, width: 128 },
    { id: 'relay-crouch-step-02', x: 4484, y: 360, width: 128 },
    { id: 'relay-crouch-step-03', x: 6564, y: 466, width: 128 },
    { id: 'relay-crouch-step-04', x: 12524, y: 388, width: 128 },
    { id: 'relay-crouch-step-05', x: 17604, y: 332, width: 128 },
    { id: 'relay-crouch-step-06', x: 22532, y: 328, width: 144 },
    { id: 'relay-dispatch-step-04b', x: 8980, y: 326, width: 136 },
  ],
  addedSteps: [
    { id: 'relay-access-approach-b', x: 1920, y: 430, width: 116 },
    { id: 'relay-access-prism-a', x: 3624, y: 472, width: 128 },
    { id: 'relay-access-prism-b-lower', x: 4640, y: 492, width: 128 },
    { id: 'relay-access-foundry-b-upper', x: 7424, y: 344, width: 128 },
    { id: 'relay-access-foundry-b-lower', x: 7576, y: 480, width: 120 },
    { id: 'relay-access-beam-a', x: 8564, y: 464, width: 128 },
    { id: 'relay-access-choir-a', x: 11504, y: 468, width: 128 },
    { id: 'relay-access-glass-a', x: 14504, y: 452, width: 128 },
    { id: 'relay-recovery-glass-b', x: 14968, y: 360, width: 128 },
    { id: 'relay-access-lock-a', x: 18604, y: 468, width: 128 },
    { id: 'relay-access-lock-b-upper', x: 19604, y: 344, width: 128 },
    { id: 'relay-access-lock-b-lower', x: 19504, y: 488, width: 100 },
    { id: 'relay-access-ascent-a', x: 21596, y: 458, width: 112 },
    { id: 'relay-access-ascent-b-lower', x: 22700, y: 520, width: 192 },
    { id: 'relay-access-final-a', x: 23504, y: 458, width: 128 },
  ],
  liftX: {
    'relay-lift-approach': 1716,
    'relay-lift-prism': 3800,
    'relay-lift-choir': 11700,
    'relay-lift-glass': 14760,
    'relay-lift-crown': 16780,
    'relay-lift-lock': 18780,
    'relay-lift-final': 23700,
  } as Record<string, number>,
  powerX: {
    'relay-aether-approach': 1400,
    'relay-dawnfire-prism': 4400,
    'relay-dawnfire-ascent': 22400,
  } as Record<string, number>,
} as const

export function createRelayAccessProposal() {
  return { ...SHADOW_RUNNER_LEVEL_TEN,
    platforms: SHADOW_RUNNER_LEVEL_TEN.platforms.map(p => ({ ...p })),
    movingPlatforms: SHADOW_RUNNER_LEVEL_TEN.movingPlatforms?.map(p => ({ ...p })),
    aetherStepPickups: SHADOW_RUNNER_LEVEL_TEN.aetherStepPickups?.map(p => ({ ...p })),
    dawnfireAegisPickups: SHADOW_RUNNER_LEVEL_TEN.dawnfireAegisPickups?.map(p => ({ ...p })),
  }
}

export type RoutePoint = { x: number; y: number; kind: 'jump' | 'walk' | 'drop'; moveAtY?: number; crouch?: boolean; singleJump?: boolean }
export type AccessRoute = {
  id: string; start: { x: number; y: number }; points: RoutePoint[]; returnPoints: RoutePoint[]
  parkedLift?: string
  movingLifts?: boolean
  intangiblePhases?: boolean
}
// Start horizontal input after the head clears the target's lower face; side contact is legal.
const jump = (x: number, y: number, moveAtY = y + 40): RoutePoint => ({ kind: 'jump', x, y, moveAtY })
const walk = (x: number, y: number): RoutePoint => ({ kind: 'walk', x, y })
const drop = (x: number, y: number): RoutePoint => ({ kind: 'drop', x, y })
const crawl = (x: number): RoutePoint => ({ kind: 'walk', x, y: 616, crouch: true })

export const RELAY_ACCESS_ROUTES: AccessRoute[] = [
  { id: 'approach-a', start: { x: 1504, y: 616 }, points: [jump(1580, 480), jump(1460, 340), walk(1392, 340), jump(1290, 240)], returnPoints: [drop(1450, 340), drop(1590, 480), drop(1490, 616)] },
  { id: 'approach-b', start: { x: 2076, y: 616 }, points: [jump(1980, 430), walk(2004, 430), jump(2090, 246), walk(2240, 246)], returnPoints: [walk(2080, 246), drop(1980, 430), drop(2076, 616)] },
  { id: 'prism-a', start: { x: 3588, y: 616 }, points: [jump(3664, 472), jump(3540, 326), walk(3400, 326)], returnPoints: [walk(3540, 326), drop(3664, 472), drop(3550, 616)] },
  { id: 'prism-b', start: { x: 4580, y: 616 }, points: [jump(4684, 492), jump(4540, 360), jump(4410, 224), walk(4260, 224)], returnPoints: [walk(4410, 224), drop(4540, 360), drop(4684, 492), drop(4580, 616)] },
  { id: 'foundry-a', start: { x: 6504, y: 616 }, points: [jump(6604, 466), jump(6500, 316), walk(6380, 316), jump(6260, 240)], returnPoints: [drop(6450, 316), walk(6500, 316), drop(6604, 466), drop(6504, 616)] },
  { id: 'foundry-b', start: { x: 7516, y: 616 }, points: [jump(7624, 480), jump(7480, 344), jump(7336, 206), walk(7160, 206)], returnPoints: [walk(7336, 206), drop(7480, 344), drop(7624, 480), drop(7516, 616)] },
  { id: 'beam-a', start: { x: 8504, y: 616 }, points: [jump(8604, 464), jump(8480, 310), walk(8320, 310)], returnPoints: [walk(8480, 310), drop(8604, 464), drop(8504, 616)] },
  { id: 'beam-b', start: { x: 8960, y: 616 }, points: [jump(8860, 450), walk(8876, 450), jump(9028, 326), walk(9076, 326), jump(9180, 210), walk(9260, 210)], returnPoints: [walk(9180, 210), drop(9076, 326), drop(8876, 450), drop(8958, 616)] },
  { id: 'choir-a', start: { x: 11468, y: 616 }, points: [jump(11544, 468), jump(11424, 320), walk(11280, 320)], returnPoints: [walk(11424, 320), drop(11544, 468), drop(11444, 616)] },
  { id: 'choir-b', start: { x: 12380, y: 616 }, points: [jump(12468, 504), jump(12580, 388), jump(12450, 226), walk(12280, 226)], returnPoints: [walk(12450, 226), drop(12580, 388), drop(12468, 504), drop(12380, 616)] },
  { id: 'glass-a', start: { x: 14444, y: 616 }, points: [jump(14544, 452), jump(14424, 290), walk(14280, 290)], returnPoints: [walk(14424, 290), drop(14544, 452), drop(14444, 616)] },
  { id: 'glass-b', start: { x: 14880, y: 290 }, parkedLift: 'relay-lift-glass', points: [drop(15048, 360), jump(15200, 196)], returnPoints: [drop(15048, 360), drop(15144, 616)] },
  { id: 'crown-a', start: { x: 15992, y: 616 }, points: [jump(16092, 450), walk(16180, 450), jump(16280, 300), walk(16380, 300)], returnPoints: [walk(16280, 300), drop(16180, 450), drop(15998, 616)] },
  { id: 'crown-b', start: { x: 17440, y: 616 }, points: [jump(17566, 504), jump(17650, 332), jump(17524, 190), walk(17320, 190)], returnPoints: [walk(17524, 190), drop(17650, 332), drop(17566, 504), drop(17670, 616)] },
  { id: 'lock-a', start: { x: 18568, y: 616 }, points: [jump(18644, 468), jump(18524, 320), walk(18380, 320)], returnPoints: [walk(18524, 320), drop(18644, 468), drop(18544, 616)] },
  { id: 'lock-b', start: { x: 19452, y: 616 }, points: [jump(19552, 488), jump(19664, 344, 410), jump(19524, 214), walk(19320, 214)], returnPoints: [walk(19524, 214), drop(19664, 344), drop(19552, 488), drop(19452, 616)] },
  { id: 'ascent-a', start: { x: 21512, y: 616 }, points: [jump(21640, 458), jump(21524, 300), walk(21380, 300)], returnPoints: [walk(21524, 300), drop(21640, 458), drop(21512, 616)] },
  { id: 'ascent-b', start: { x: 22656, y: 616 }, points: [jump(22750, 520), jump(22632, 328), jump(22524, 184), walk(22380, 184)], returnPoints: [walk(22524, 184), drop(22632, 328), drop(22750, 520), drop(22632, 616)] },
  { id: 'final-a', start: { x: 23444, y: 616 }, points: [jump(23544, 458), jump(23424, 300), walk(23220, 300)], returnPoints: [walk(23424, 300), drop(23544, 458), drop(23444, 616)] },
]

export const fixedProposalGeometry = (): ShadowRunnerRect[] => {
  const level = createRelayAccessProposal()
  // Always-solid phase rectangles stress adjacent head clearance; no route rests on them.
  return [...level.platforms, ...(level.crouchGates ?? []), ...(level.phasePlatforms ?? [])]
}

// Clear optional encounters before consuming the original single-use power; visit its Dispatch first.
const dispatchApproaches = [
  { route: 'approach-b', power: 'relay-aether-approach', dispatch: 'last-dispatch-1', points: [walk(1020, 616), crawl(1364), walk(1648, 616), drop(1810, 674), walk(1860, 674), { ...jump(2076, 616, 674), singleJump: true }] },
  { route: 'prism-b', power: 'relay-dawnfire-prism', dispatch: 'last-dispatch-2', points: [walk(4020, 616), crawl(4364), walk(4580, 616)] },
  { route: 'foundry-b', power: 'relay-aether-foundry', dispatch: 'last-dispatch-3', points: [walk(7516, 616)] },
  { route: 'beam-b', power: 'relay-dawnfire-beam', dispatch: 'last-dispatch-4', points: [walk(8960, 616)] },
  { route: 'choir-b', power: 'relay-aether-choir', dispatch: 'last-dispatch-5', points: [walk(12020, 616), crawl(12364)] },
  { route: 'crown-a', power: 'relay-dawnfire-crown', dispatch: 'last-dispatch-6', points: [walk(15992, 616)] },
  { route: 'lock-b', power: 'relay-aether-lock', dispatch: 'last-dispatch-7', points: [walk(19452, 616)] },
  { route: 'ascent-b', power: 'relay-dawnfire-ascent', dispatch: 'last-dispatch-8', points: [walk(22020, 616), crawl(22364), walk(22656, 616)] },
]

const restagedApproaches: Record<string, RoutePoint[]> = {
  'last-dispatch-1': [walk(1648, 616), drop(1810, 674), walk(1860, 674), { ...jump(2076, 616, 674), singleJump: true }],
  'last-dispatch-2': [walk(4580, 616)],
  'last-dispatch-8': [walk(22656, 616)],
}
const originalPickupX: Record<string, number> = {
  'relay-aether-approach': 940, 'relay-dawnfire-prism': 3940, 'relay-dawnfire-ascent': 21940,
}

const liftExitRoutes: AccessRoute[] = [
  { id: 'approach-lift-exit', parkedLift: 'relay-lift-approach', start: { x: 1736, y: 370 }, points: [jump(1460, 340, 370)], returnPoints: [] },
  { id: 'prism-lift-exit', parkedLift: 'relay-lift-prism', start: { x: 3820, y: 350 }, points: [jump(3540, 326, 350)], returnPoints: [] },
  { id: 'choir-lift-exit', parkedLift: 'relay-lift-choir', start: { x: 11720, y: 310 }, points: [jump(11424, 320, 310)], returnPoints: [] },
  { id: 'crown-lift-exit', parkedLift: 'relay-lift-crown', start: { x: 16800, y: 300 }, points: [jump(16524, 300, 300)], returnPoints: [] },
  { id: 'lock-lift-exit', parkedLift: 'relay-lift-lock', start: { x: 18800, y: 280 }, points: [jump(18524, 320, 280)], returnPoints: [] },
  { id: 'final-lift-exit', parkedLift: 'relay-lift-final', start: { x: 23720, y: 300 }, points: [jump(23424, 300, 300)], returnPoints: [] },
]

const movingLiftRoutes = [
  { id: 'relay-lift-approach', start: { x: 1680, y: 616 }, boardX: 1736, exit: [jump(1460, 340, 370)] },
  { id: 'relay-lift-prism', start: { x: 4000, y: 616 }, boardX: 3820, exit: [jump(3540, 326, 350)] },
  { id: 'relay-lift-foundry', start: { x: 7280, y: 616 }, boardX: 7200, exit: [drop(7280, 616)] },
  { id: 'relay-lift-choir', start: { x: 11660, y: 616 }, boardX: 11720, exit: [jump(11424, 320, 310)] },
  { id: 'relay-lift-glass', start: { x: 14960, y: 616 }, boardX: 14880, exit: [drop(15048, 360), jump(15200, 196)] },
  { id: 'relay-lift-crown', start: { x: 16980, y: 616 }, boardX: 16800, exit: [jump(16524, 300, 300)] },
  { id: 'relay-lift-lock', start: { x: 18980, y: 616 }, boardX: 18800, exit: [jump(18524, 320, 280)] },
  { id: 'relay-lift-final', start: { x: 23660, y: 616 }, boardX: 23720, exit: [jump(23424, 300, 300)] },
]

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
    Clamp: jest.requireActual('phaser/src/math/Clamp'), Linear: jest.requireActual('phaser/src/math/Linear'),
    Distance: { Between: jest.requireActual('phaser/src/math/distance/DistanceBetween') },
  },
} }))

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
const StaticGroup = jest.requireActual('phaser/src/physics/arcade/StaticPhysicsGroup')
const World = jest.requireActual('phaser/src/physics/arcade/World')
const worlds: any[] = []
const reports: unknown[] = []
const width = 32.76
const height = 54.6
const overlap = (a: any, p: { x: number; y: number; width: number; height: number }) => (
  a.right > p.x + 0.001 && a.left < p.x + p.width - 0.001
  && a.bottom > p.y + 0.001 && a.top < p.y + p.height - 0.001
)

afterEach(() => { worlds.splice(0).forEach(world => world.destroy()) })
afterAll(() => {
  if (process.env.SHADOW_RUNNER_ACCESS_REPORT !== '1') return
  const directory = resolve('output/shadow-runner')
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, 'relay-live-access.json'), JSON.stringify({
    scope: 'LIVE authored geometry. Installed Arcade + actual updatePlayer/stance/jump. No browser, enemies, wind, beam damage or pickup callbacks. No powers are activated even for timing budgets. Parked endpoint and moving carry tests are labeled separately. Not campaign acceptance.',
    movingContactCriterion: 'Fixed-solid and carried-body penetration is rejected. An airborne foot contact created after Arcade separation may be at most one lift movement step deep and must be absent on the next physics separation pass. Floating-point contact noise below0.001px is ignored.',
    sourceHashes: Object.fromEntries([
      'src/features/games/shadow-runner/game/levelTen.ts',
      'src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts',
      'src/features/games/shadow-runner/game/runtimeMovingPlatform.ts',
      'tests/shadowRunnerRelayAccessProposal.test.ts',
    ].map(path => [path, createHash('sha256').update(readFileSync(resolve(path))).digest('hex')])),
    proposal: RELAY_ACCESS_PROPOSAL,
    routes: RELAY_ACCESS_ROUTES,
    parkedLiftExits: liftExitRoutes,
    movingLiftRoutes,
    unresolved: [
      'Real-key campaign proof remains required for all122 coins/all36 enemies/five Flames/eight Dispatches. This is not that proof.',
      'Moving-lift tests use actual runtime carry/input with all eight lifts active, but only sampled starts/cadences. Foundry top exits down to its road; use the east stairs for the high shelf.',
      'Approach recovery-to-road jump must wait until the relocated lift is overhead-clear; Foundry road also crosses a lift shaft. Timing budgets exclude phase wait and carry.',
      'All optional encounters should be cleared before collecting a timed Dispatch power; avoiding accidental collection and real combat/power readback need replay.',
      'The retained phase-coin routes, wind/beam pressure, NPC roof/spawn repairs, rescue/checkpoint recovery and rendered deck alignment remain separate acceptance work.',
    ],
    reports,
  }, null, 2))
})

function fixture(route: AccessRoute, fps: number, startOffset = 0, omittedGeometryIds: string[] = []) {
  const level = createRelayAccessProposal()
  const input = { current: createShadowRunnerInputState() }
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'), input, onHudChange: jest.fn(), levelId: 'level-10' })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  scene.level = level
  scene.sys = { scale: { width: 960, height: 540 } }
  const world = new World(scene, { gravity: { x: 0, y: 1640 }, fps: 60, fixedStep: true })
  worlds.push(world)
  scene.physics = { world }
  scene.platforms = new StaticGroup(world, scene)
  scene.crouchGates = new StaticGroup(world, scene)
  const solids = fixedProposalGeometry().filter(p => !omittedGeometryIds.includes(p.id)
    && (!route.intangiblePhases || !level.phasePlatforms?.some(phase => phase.id === p.id)))
  if (route.parkedLift) {
    const lift = level.movingPlatforms!.find(p => p.id === route.parkedLift)!
    solids.push({ ...lift, y: lift.endY })
  }
  const rectangle = (p: ShadowRunnerRect) => {
    const object: any = {
      name: p.id, x: p.x + p.width / 2, y: p.y + p.height / 2,
      width: p.width, height: p.height, displayWidth: p.width, displayHeight: p.height,
      scaleX: 1, scaleY: 1, angle: 0, originX: 0.5, originY: 0.5,
      on() { return this }, off() { return this },
      setPosition(x: number, y: number) { this.x = x; this.y = y; return this },
      getTopLeft(point: any) { return point.set(this.x - this.width / 2, this.y - this.height / 2) },
    }
    object.body = new StaticBody(world, object)
    world.add(object.body)
    scene.platforms.add(object)
    return object
  }
  solids.forEach(rectangle)
  if (route.movingLifts) {
    scene.movingPlatforms = level.movingPlatforms!.map(config => ({
      config, collider: rectangle(config),
      visualOffsetY: 0,
      visual: { x: config.x + config.width / 2, y: config.y + config.height / 2,
        setPosition(x: number, y: number) { this.x = x; this.y = y } },
      startX: config.x, startY: config.y, endX: config.endX ?? config.x, endY: config.endY,
      direction: -1, pauseUntil: 0, lastX: config.x, lastY: config.y,
    }))
  }
  const player: any = {
    x: route.start.x + startOffset, y: route.start.y, width: 128, height: 128, active: true, angle: 0,
    scaleX: 0.78, scaleY: 0.78, displayOriginX: 64, displayOriginY: 128, displayWidth: 128, displayHeight: 128,
    frame: { realWidth: 128, realHeight: 128 },
    setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this },
    setSize(x: number, y: number) { this.body.setSize(x, y); return this },
    setOffset(x: number, y: number) { this.body.setOffset(x, y); return this },
    setVelocity(x: number, y: number) { this.body.setVelocity(x, y); return this },
    setVelocityX(x: number) { this.body.setVelocityX(x); return this },
    setVelocityY(y: number) { this.body.setVelocityY(y); return this },
    setX(x: number) { this.x = x; return this },
    setFlipX() { return this },
  }
  const body = new Body(world, player)
  player.body = body
  player.setSize(42, 70).setOffset(43, 58)
  body.setMaxVelocity(360, 940)
  body.setDragX(1450)
  body.updateFromGameObject()
  world.add(body)
  scene.player = player
  world.addCollider(player, scene.platforms)
  scene.playSound = jest.fn()
  scene.addDustPuff = jest.fn()
  scene.updateHeroAnimation = jest.fn()
  scene.damagePlayerFromHazard = jest.fn(() => false)
  scene.handlePlayerFellOut = jest.fn()
  const trace: any[] = []
  let time = 0
  const frame = () => {
    const delta = 1000 / fps
    time += delta
    scene.activeTimeMs = time
    scene.frameDeltaMs = delta
    world.update(time, delta)
    scene.updatePlayer(time)
    const preCarryY = body.bottom
    const preMoveLiftOverlaps = route.movingLifts ? scene.movingPlatforms.filter((lift: any) => (
      overlap(body, { x: lift.lastX, y: lift.lastY, width: lift.config.width, height: lift.config.height })
    )).map((lift: any) => lift.config.id) : []
    if (route.movingLifts) scene.updateMovingPlatforms(time)
    const carryY = body.bottom - preCarryY
    world.postUpdate()
    const sample = {
      time, x: player.x, y: body.bottom, top: body.top, left: body.left, right: body.right, vy: body.velocity.y,
      vx: body.velocity.x, inputDirection: Number(input.current.right) - Number(input.current.left),
      grounded: body.blocked.down || body.touching.down, blockedUp: body.blocked.up,
      overlaps: solids.filter(p => overlap(body, p)).map(p => p.id),
      carryY, syncGap: player.y - body.bottom, preMoveLiftOverlaps,
      lifts: route.movingLifts ? scene.movingPlatforms.map((lift: any) => ({
        id: lift.config.id, y: lift.lastY, direction: lift.direction, pauseUntil: lift.pauseUntil,
        overlaps: overlap(body, { x: lift.lastX, y: lift.lastY, width: lift.config.width, height: lift.config.height }),
        footDepth: body.bottom - lift.lastY, maximumStep: lift.config.speed / fps,
      })) : undefined,
    }
    trace.push(sample)
    return sample
  }
  frame()
  frame()
  expect(body.width).toBeCloseTo(width)
  expect(body.height).toBeCloseTo(height)
  expect(trace[trace.length - 1].overlaps).toEqual([])
  expect(trace[trace.length - 1].grounded).toBe(true)
  return { scene, input, body, player, frame, trace, fps, get time() { return time } }
}

describe('Lock visible-arrow defense', () => {
  const path = resolve('scripts/shadow-runner-route-proof.mjs')
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const printer = ts.createPrinter()
  const functions = source.statements.filter(ts.isFunctionDeclaration)
    .filter(node => ['demand', 'groundedAt', 'decideStep', 'decideRouteStep', 'avoidVisibleArrows'].includes(node.name?.text ?? ''))
    .map(node => printer.printNode(ts.EmitHint.Unspecified, ts.factory.updateFunctionDeclaration(node, undefined,
      node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, node.body), source)).join('\n')
  const decide = runInNewContext(`${functions}\n({ decideStep })`).decideStep

  function cross(fps: number, sampleMs: number, phase: number, defend = true, west = false) {
    const r = fixture({ id: 'lock-arrows', start: { x: west ? 18992 : 19970, y: 616 }, points: [], returnPoints: [] }, fps)
    const arrows: any[] = []
    const hits: any[] = []
    const jumps: number[] = []
    const decisions: any[] = []
    r.scene.textures = { exists: () => true, get: () => ({ has: () => true }) }
    r.scene.tweens = { killTweensOf() {} }
    r.scene.archerProjectiles = { getChildren: () => arrows }
    r.scene.arrowVolleys = SHADOW_RUNNER_LEVEL_TEN.arrowVolleys!
      .filter(volley => volley.id.startsWith('relay-volley-lock-')).map(config => ({ config, armed: true,
        nextShotAt: ((config.delayMs! - phase) % config.intervalMs! + config.intervalMs!) % config.intervalMs! }))
    r.scene.acquireProjectile = (x: number, y: number) => {
      const data = new Map<string, unknown>()
      // Actual bell-arrow atlas frame and production arrow factory/body settings.
      const arrow: any = { x, y, width: 176, height: 30, scaleX: 1, scaleY: 1, angle: 0,
        displayOriginX: 88, displayOriginY: 15, active: true,
        setDisplaySize(w: number, h: number) { this.scaleX = w / 176; this.scaleY = h / 30; return this },
        setDepth() { return this }, setFlipX() { return this }, clearTint() { return this },
        setVelocityX(v: number) { this.body.setVelocityX(v); return this },
        setData(k: string, v: unknown) { data.set(k, v); return this }, getData(k: string) { return data.get(k) },
        disableBody() { this.active = this.body.enable = false; return this },
      }
      arrow.body = new Body(r.scene.physics.world, arrow)
      r.scene.physics.world.add(arrow.body)
      r.scene.physics.world.addCollider(arrow, r.scene.platforms, () => r.scene.disableProjectile(arrow))
      r.scene.physics.world.addOverlap(r.player, arrow, () => {
        if (arrow.active) {
          hits.push({ time: r.time, x: r.player.x, y: r.body.bottom, arrowY: arrow.body.center.y })
          r.scene.disableProjectile(arrow)
        }
      })
      arrows.push(arrow)
      return arrow
    }
    const step = { id: 'lock-exit', kind: 'move', x: west ? 19452 : 20670, y: 616,
      ...(defend ? { arrowDodge: { minX: west ? 18940 : 19960, maxX: west ? 19480 : 20700, groundY: 616 } } : {}) }
    const memory = {}
    let nextSample = 0
    let completed = false
    while (r.time < 16000) {
      r.scene.updateArrowVolleys(r.time)
      r.scene.updateArcherProjectiles(r.time)
      if (r.time >= nextSample) {
        nextSample = r.time + sampleMs
        const visibleArrows = arrows.filter(arrow => arrow.active && arrow.body.right > r.player.x - 320
          && arrow.body.left < r.player.x + 320).map(({ body }) => ({ left: body.left, right: body.right,
          top: body.top, bottom: body.bottom, velocityX: body.velocity.x, velocityY: body.velocity.y }))
        const action = decide(step, { activeTimeMs: r.time, visibleArrows, player: {
          x: r.player.x, y: r.player.y, bodyTop: r.body.top, bodyBottom: r.body.bottom,
          bodyLeft: r.body.left, bodyRight: r.body.right, velocityY: r.body.velocity.y,
        } }, memory, r.time)
        decisions.push({ time: r.time, x: r.player.x, y: r.body.bottom, action, arrows: visibleArrows })
        if (action.done) { completed = true; break }
        setShadowRunnerAction(r.input.current, 'left', action.direction < 0)
        setShadowRunnerAction(r.input.current, 'right', action.direction > 0)
        setShadowRunnerAction(r.input.current, 'crouch', action.crouch)
        if (action.jump) { r.input.current.jumpPresses += 1; jumps.push(r.time) }
      }
      r.frame()
    }
    const result = { completed, hits, jumps, x: r.player.x, y: r.body.bottom, time: r.time,
      beforeHits: decisions.filter(d => hits.some(hit => hit.time - d.time >= 0 && hit.time - d.time < 700)),
      dirty: r.trace.filter(frame => frame.overlaps.length || frame.blockedUp),
      falls: r.scene.handlePlayerFellOut.mock.calls.length }
    r.scene.physics.world.destroy()
    worlds.splice(worlds.indexOf(r.scene.physics.world), 1)
    return result
  }

  test.each([30, 60, 120])('ordinary inputs avoid both real volley lanes at %ifps', fps => {
    for (const sampleMs of [80, 100, 150]) for (const phase of [0, 500, 1100]) for (const west of [false, true]) {
      const result = cross(fps, sampleMs, phase, true, west)
      if (!result.completed || result.hits.length || result.dirty.length || result.falls) {
        throw new Error(`Lock defense failed ${JSON.stringify({ fps, sampleMs, phase, west, ...result })}`)
      }
      if (!west) expect(result.jumps.length).toBeGreaterThan(0)
    }
  }, 60000)

  test('walking the same corridor without timed defense is hit', () => {
    expect(cross(60, 80, 0, false).hits.length).toBeGreaterThan(0)
  })
})

describe('Crown observed-beam defense', () => {
  const path = resolve('scripts/shadow-runner-route-proof.mjs')
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const printer = ts.createPrinter()
  const declarations = source.statements.filter(ts.isFunctionDeclaration)
    .filter(node => ['demand', 'groundedAt', 'decideStep', 'decideRouteStep'].includes(node.name?.text ?? ''))
  const functions = declarations.map(node => printer.printNode(ts.EmitHint.Unspecified,
    ts.factory.updateFunctionDeclaration(node, undefined, node.asteriskToken, node.name, node.typeParameters,
      node.parameters, node.type, node.body), source)).join('\n')
  const decide = runInNewContext(`${functions}\n({ decideStep })`).decideStep as
    (step: any, debug: unknown, memory: Record<string, any>, now: number) => any
  const step = { id: 'crown-defense', kind: 'beam-cycle', x: 18040, y: 616, beamDodge: {
    highId: 'relay-beam-crown-high', lowId: 'relay-beam-crown-low', minX: 16800, maxX: 18700, maxJumpX: 18560, groundY: 616,
  } }

  function run(fps: number, sampleMs: number, phase: number, defend = true, transit = false) {
    const r = fixture({ id: 'crown-beam-defense', start: { x: transit ? 18440 : 18040, y: 616 }, points: [], returnPoints: [] }, fps)
    const command = transit ? { ...step, kind: 'move', x: 18680 } : step
    r.scene.relayBeamZones = SHADOW_RUNNER_LEVEL_TEN.relayBeamZones!
      .filter(zone => zone.id.startsWith('relay-beam-crown-')).map(config => ({
        config, state: 'idle', activatedAt: null, lastGuardedCycle: -1, visual: { clear() {}, lineStyle() {} },
      }))
    r.scene.drawRelayBeamLane = jest.fn()
    const start = r.time
    const memory = {}
    const jumpEvents: any[] = []
    const hits: any[] = []
    let nextSample = 0
    let completed = false
    let retreats = 0
    while (r.time - start < 22000) {
      const time = phase + r.time - start
      const hitCount = r.scene.damagePlayerFromHazard.mock.calls.length
      r.scene.updateRelayBeamZones(time)
      if (r.scene.damagePlayerFromHazard.mock.calls.length > hitCount) hits.push({ time, foot: r.body.bottom,
        vy: r.body.velocity.y, jumps: r.scene.jumpsUsed })
      if (defend && time >= nextSample) {
        nextSample = time + sampleMs
        const action = decide(command, { activeTimeMs: time, player: { x: r.player.x, y: r.player.y,
          bodyBottom: r.body.bottom, velocityY: r.body.velocity.y },
        relayBeamZones: r.scene.relayBeamZones.map((zone: any) => ({ id: zone.config.id, state: zone.state })) }, memory, time)
        if (transit && action.done) { completed = true; break }
        if (action.direction < 0 && r.player.x > step.beamDodge.maxJumpX) retreats += 1
        setShadowRunnerAction(r.input.current, 'left', action.direction < 0)
        setShadowRunnerAction(r.input.current, 'right', action.direction > 0)
        setShadowRunnerAction(r.input.current, 'crouch', action.crouch)
        if (action.jump) {
          jumpEvents.push({ time, foot: r.body.bottom, jumps: r.scene.jumpsUsed })
          r.input.current.jumpPresses += 1
        }
      }
      // Keep observing for eight complete pulses; this is defense, not route completion.
      r.frame()
    }
    const result = { fps, sampleMs, phase, hits, jumpEvents, completed, retreats,
      jumps: r.input.current.jumpPresses, dirty: r.trace.filter(s => s.overlaps.length || s.blockedUp),
      falls: r.scene.handlePlayerFellOut.mock.calls, finalY: r.body.bottom }
    r.scene.physics.world.destroy()
    worlds.splice(worlds.indexOf(r.scene.physics.world), 1)
    return result
  }

  test.each([30, 60, 120])('double-jump defense spans repeated alternating pulses at %ifps', fps => {
    for (const phase of [760, 1000, 1400]) for (const sampleMs of [40, 80, 120, 160, 200]) {
      const result = run(fps, sampleMs, phase)
      if (result.hits.length) throw new Error(`Crown dodge failed ${JSON.stringify(result)}`)
      expect(result).toMatchObject({ hits: [], dirty: [], falls: [] })
      expect(result.jumps).toBeGreaterThanOrEqual(14)
    }
  })

  test('standing still is hit by the real low pulse without the defensive inputs', () => {
    expect(run(60, 80, 1000, false).hits.length).toBeGreaterThan(0)
  })

  test.each([30, 60, 120])('Flame approach uses clear headroom instead of landing on its overhead step at %ifps', fps => {
    let retreats = 0
    for (const phase of [760, 1000, 1400]) for (const sampleMs of [40, 80, 120, 160, 200]) {
      const result = run(fps, sampleMs, phase, true, true)
      if (result.hits.length || result.dirty.length || !result.completed) throw new Error(`Crown approach failed ${JSON.stringify(result)}`)
      expect(result).toMatchObject({ completed: true, hits: [], dirty: [], falls: [], finalY: 616 })
      retreats += result.retreats
    }
    expect(retreats).toBeGreaterThan(0)
  })
})

test.each([30, 60, 120])('held movement retains authored speed instead of losing it to braking at %ifps', fps => {
  for (const direction of [-1, 1]) for (const crouch of [false, true]) {
    const r = fixture({ id: 'held-speed', start: { x: 300, y: 616 }, points: [], returnPoints: [] }, fps)
    const action = direction > 0 ? 'right' : 'left'
    setShadowRunnerAction(r.input.current, action, true)
    setShadowRunnerAction(r.input.current, 'crouch', crouch)
    r.frame()
    const x = r.player.x
    for (let i = 0; i < fps / 2; i += 1) r.frame()
    expect(r.player.x - x).toBeCloseTo(direction * (crouch ? 112 : 260) / 2, 4)
    setShadowRunnerAction(r.input.current, action, false)
    r.frame()
    expect(r.body.drag.x).toBe(1450)
    expect(r.body.velocity.x).toBe(0)
  }
})

function assertCleanMovingFrame(r: ReturnType<typeof fixture>, sample: any, allowCrouch = false) {
  // A moved StaticBody can meet an airborne foot after Arcade's separation pass.
  // Bound that contact to one lift step and require separation on the next physics pass.
  const invalidLiftOverlap = sample.lifts.some((lift: any) => lift.overlaps
    && (sample.grounded || lift.footDepth < 0 || lift.footDepth > lift.maximumStep + 0.001))
  if (sample.overlaps.length || sample.blockedUp || invalidLiftOverlap || sample.preMoveLiftOverlaps.length
    || Math.abs(sample.syncGap) > 0.001 || sample.y > 700) {
    throw new Error(`Moving-lift collision/sync failure ${JSON.stringify(sample)}`)
  }
  expect(r.body.width).toBeCloseTo(width)
  expect(r.body.height).toBeCloseTo(allowCrouch && r.scene.crouching ? 48 * 0.78 * 0.72 : height)
  expect(r.scene.damagePlayerFromHazard).not.toHaveBeenCalled()
  expect(r.scene.handlePlayerFellOut).not.toHaveBeenCalled()
}

function boardMovingLift(r: ReturnType<typeof fixture>, id: string, x: number) {
  const lift = r.scene.movingPlatforms.find((item: any) => item.config.id === id)
  const start = r.time
  let second = false
  let stable = 0
  r.input.current.jumpPresses += 1
  while (r.time - start < 3000) {
    const nextX = r.player.x + r.body.velocity.x / r.fps
    r.input.current.left = nextX > x + 8
    r.input.current.right = nextX < x - 8
    if (!second && r.time - start >= 350) {
      r.input.current.jumpPresses += 1
      second = true
    }
    const sample = r.frame()
    assertCleanMovingFrame(r, sample)
    if (sample.grounded && Math.abs(sample.y - lift.lastY) < 0.01 && Math.abs(sample.x - x) <= 12) stable += 1
    else stable = 0
    if (stable >= 6) {
      r.input.current.left = false
      r.input.current.right = false
      return { ms: r.time - start, liftY: lift.lastY }
    }
  }
  throw new Error(`Did not board ${id}: ${JSON.stringify(r.trace[r.trace.length - 1])}`)
}

function traverse(r: ReturnType<typeof fixture>, point: RoutePoint, secondDelay: number) {
  const startTime = r.time
  const startY = r.body.bottom
  let second = false
  let released = point.kind !== 'jump' || point.moveAtY === undefined || startY <= point.moveAtY
  let stable = 0
  const startIndex = r.trace.length
  if (point.kind === 'jump') r.input.current.jumpPresses += 1
  while (r.time - startTime < 7000) {
    if (r.body.bottom <= (point.moveAtY ?? Infinity)) released = true
    const dx = point.x - (r.player.x + r.body.velocity.x / r.fps)
    r.input.current.left = released && dx < -8
    r.input.current.right = released && dx > 8
    r.input.current.crouch = point.crouch ?? false
    if (point.kind === 'jump' && !point.singleJump && !second && r.time - startTime >= secondDelay) {
      r.input.current.jumpPresses += 1
      second = true
    }
    const sample = r.frame()
    if (sample.overlaps.length) throw new Error(`Embedded ${JSON.stringify({ point, sample })}`)
    if (sample.blockedUp) throw new Error(`Ceiling contact ${JSON.stringify({ point, sample })}`)
    if (sample.y > 700) break
    if (Math.abs(sample.x - point.x) <= 12 && Math.abs(sample.y - point.y) < 0.1 && sample.grounded) stable += 1
    else stable = 0
    if (stable >= 6) {
      if (getShadowRunnerLandingDamage(startY, point.y) !== 0) throw new Error(`Unsafe net fall ${startY} -> ${point.y}`)
      return { ms: r.time - startTime, minY: Math.min(...r.trace.slice(startIndex).map(s => s.y)), startY, targetY: point.y }
    }
  }
  throw new Error(`Miss ${JSON.stringify({ point, startY, secondDelay, final: r.trace[r.trace.length - 1], minY: Math.min(...r.trace.slice(startIndex).map(s => s.y)) })}`)
}

test('authored movement speed also permits the formerly short early Foundry air jump at 30fps', () => {
  const early = fixture({ id: 'foundry-east-early', start: { x: 7658, y: 480 },
    points: [], returnPoints: [], intangiblePhases: true }, 30)
  expect(() => traverse(early, jump(7950, 616, 414), 150)).not.toThrow()
})

test.each([30, 60, 120])('Foundry east crossing keeps enough airtime without relying on a solid phase bridge at %ifps', fps => {
  const route: AccessRoute = { id: 'foundry-east-no-phase', start: { x: 7658, y: 480 },
    points: [], returnPoints: [], intangiblePhases: true }
  const point = jump(7950, 616, 414)
  const delayed = fixture(route, fps)
  expect(() => traverse(delayed, point, 350)).not.toThrow()
})

test.each([30, 60, 120])('Lock phase approach uses the lower ledge above both volleys at %ifps', fps => {
  const route: AccessRoute = { id: 'lock-volley-refuge', start: { x: 19452, y: 616 }, points: [], returnPoints: [] }
  const r = fixture(route, fps)
  traverse(r, jump(19552, 488, 528), 350)
  const volleys = SHADOW_RUNNER_LEVEL_TEN.arrowVolleys!.filter(v => v.id.startsWith('relay-volley-lock-'))
  expect(volleys).toHaveLength(2)
  expect(volleys.every(v => v.laneY - 10 > r.body.bottom)).toBe(true)
  const crossing = traverse(r, jump(19856, 440, 410), 350)
  const phase = SHADOW_RUNNER_LEVEL_TEN.phasePlatforms!.find(p => p.id === 'relay-phase-06')!
  expect(crossing.ms).toBeLessThan(phase.solidDurationMs + phase.warningDurationMs - 250)
  traverse(r, walk(19970, 616), 350)
})

test.each([30, 60, 120])('Crown exit has enough jump reach from its safe waiting band at %ifps', fps => {
  for (const offset of [-16, 0, 16]) {
    const r = fixture({ id: 'crown-exit-headroom', start: { x: 18536 + offset, y: 616 }, points: [], returnPoints: [] }, fps)
    traverse(r, jump(18644, 468, 508), 350)
    expect(r.scene.damagePlayerFromHazard).not.toHaveBeenCalled()
    expect(r.scene.handlePlayerFellOut).not.toHaveBeenCalled()
  }
})

test('live geometry matches the accepted coordinate contract without fixture changes or duplicate additions', () => {
  const level = createRelayAccessProposal()
  expect(level).toEqual(SHADOW_RUNNER_LEVEL_TEN)
  expect(level).not.toBe(SHADOW_RUNNER_LEVEL_TEN)
  const { platforms, movingPlatforms } = level
  expect(platforms).not.toBe(SHADOW_RUNNER_LEVEL_TEN.platforms)
  expect([level.coins.length, level.enemies?.length, level.objectivePickups?.length, level.masteryPickups?.length]).toEqual([122, 36, 5, 8])
  expect(platforms).toHaveLength(88)
  expect(new Set(platforms.map(p => p.id)).size).toBe(platforms.length)
  for (const contract of RELAY_ACCESS_PROPOSAL.addedSteps) {
    expect(platforms.find(p => p.id === contract.id)).toEqual({ ...contract, height: 24, visualId: 'relay-recovery-stair', terrainSet: 'relay' })
  }
  for (const contract of RELAY_ACCESS_PROPOSAL.movedSteps) {
    expect(platforms.find(p => p.id === contract.id)).toMatchObject({ ...contract, height: contract.id === 'relay-dispatch-step-04b' ? 38 : 18, terrainSet: 'relay' })
  }
  expect(movingPlatforms).toHaveLength(8)
  const liftParameters = [[370, 92, 900], [350, 96, 860], [320, 100, 840], [310, 102, 820], [290, 104, 800], [300, 106, 780], [280, 108, 760], [300, 110, 740]]
  for (const [i, lift] of movingPlatforms!.entries()) {
    expect(lift).toMatchObject({ x: RELAY_ACCESS_PROPOSAL.liftX[lift.id] ?? 7080, y: 568, width: 160, height: 32,
      endY: liftParameters[i][0], speed: liftParameters[i][1], pauseMs: liftParameters[i][2] })
  }
  const powers = [...level.aetherStepPickups!, ...level.dawnfireAegisPickups!]
  for (const [id, x] of Object.entries(RELAY_ACCESS_PROPOSAL.powerX)) {
    expect(powers.find(p => p.id === id)).toMatchObject({ x, y: 548, durationMs: id === 'relay-aether-approach' ? 12000 : id === 'relay-dawnfire-prism' ? 11000 : 11500 })
  }
  expect(RELAY_ACCESS_ROUTES.map(r => `relay-high-${r.id}`).sort()).toEqual(platforms.filter(p => p.id.startsWith('relay-high-')).map(p => p.id).sort())
})

test('entire relocated shaft clears fixed solids with standing body, +/-18px rider band and 6px safety margin', () => {
  const level = createRelayAccessProposal()
  for (const lift of level.movingPlatforms!) {
    const swept = {
      left: lift.x - width / 2 - 18 - 6, right: lift.x + lift.width + width / 2 + 18 + 6,
      top: lift.endY - height - 6, bottom: lift.y,
    }
    const intersections = fixedProposalGeometry().filter(p => overlap(swept, p)).map(p => p.id)
    expect({ id: lift.id, intersections }).toEqual({ id: lift.id, intersections: [] })
  }
})

test('new and relocated steps do not touch any coin or power/relic pickup, including eight pixels of bob', () => {
  const level = createRelayAccessProposal()
  const pickups = Object.entries(level).flatMap(([key, value]) => (
    key === 'coins' || key.endsWith('Pickups') ? (value as { id: string; x: number; y: number }[]).map(p => ({ ...p, radius: key === 'coins' ? 16 : 24 })) : []
  ))
  const changed = level.platforms.filter(p => [...RELAY_ACCESS_PROPOSAL.addedSteps, ...RELAY_ACCESS_PROPOSAL.movedSteps].some(c => c.id === p.id))
  const hits = changed.flatMap(p => pickups.filter(c => {
    const dx = c.x - Math.max(p.x, Math.min(c.x, p.x + p.width))
    const dy = c.y - Math.max(p.y - 8, Math.min(c.y, p.y + p.height + 8))
    return dx * dx + dy * dy < c.radius * c.radius
  }).map(c => `${p.id}:${c.id}`))
  expect(hits).toEqual([])
})

test('new ledges preserve standing headroom on the lower road and stable full-body target bands', () => {
  const level = createRelayAccessProposal()
  const changed = level.platforms.filter(p => [...RELAY_ACCESS_PROPOSAL.addedSteps, ...RELAY_ACCESS_PROPOSAL.movedSteps].some(c => c.id === p.id))
  expect(Math.max(...changed.map(p => p.y + p.height))).toBeLessThanOrEqual(616 - height - 6)
  for (const route of RELAY_ACCESS_ROUTES) {
    for (const point of [...route.points, ...route.returnPoints]) {
      for (const offset of [-12, 0, 12]) {
        const body = { left: point.x + offset - width / 2, right: point.x + offset + width / 2, top: point.y - height, bottom: point.y }
        expect(fixedProposalGeometry().filter(p => overlap(body, p))).toEqual([])
        expect(level.platforms.some(p => p.y === point.y && p.x <= body.left && p.x + p.width >= body.right)).toBe(true)
      }
    }
  }
})

test.each(dispatchApproaches.filter(a => restagedApproaches[a.dispatch]))('$dispatch live restaging improves the original pickup timing reserve', approach => {
  const power = [...SHADOW_RUNNER_LEVEL_TEN.aetherStepPickups!, ...SHADOW_RUNNER_LEVEL_TEN.dawnfireAegisPickups!].find(p => p.id === approach.power)!
  const route = RELAY_ACCESS_ROUTES.find(r => r.id === approach.route)!
  const r = fixture({ ...route, start: { x: originalPickupX[power.id], y: 616 } }, 30)
  const start = r.time
  for (const point of [...approach.points, ...route.points]) traverse(r, point, 320)
  const spare = power.durationMs - (r.time - start)
  const restaged = fixture({ ...route, start: { x: power.x, y: 616 } }, 30)
  const restagedStart = restaged.time
  for (const point of [...restagedApproaches[approach.dispatch], ...route.points]) traverse(restaged, point, 320)
  const restagedSpare = power.durationMs - (restaged.time - restagedStart)
  // Held-speed correction changes old absolute timings; compare both paths on the same physics.
  expect(restagedSpare).toBeGreaterThan(spare)
  expect(restagedSpare).toBeGreaterThanOrEqual(2000)
  reports.push({ originalTiming: approach.dispatch, fps: 30, delay: 320, elapsedMs: Math.round(r.time - start),
    spareMs: Math.round(spare), restagedSpareMs: Math.round(restagedSpare) })
})

describe.each([30, 60])('installed Arcade live-geometry trajectories at %s render fps', fps => {
  test.each(RELAY_ACCESS_ROUTES)('$id unpowered access and recovery', route => {
    const results = []
    for (const offset of [-12, 0, 12]) {
      for (const delay of [320, 350, 380]) {
        const r = fixture(route, fps, offset)
        try {
          const access = route.points.map(p => traverse(r, p, delay))
          const recovery = route.returnPoints.map(p => traverse(r, p, delay))
          expect(r.scene.damagePlayerFromHazard).not.toHaveBeenCalled()
          expect(r.scene.handlePlayerFellOut).not.toHaveBeenCalled()
          results.push({ offset, delay, accessMs: access.reduce((s, p) => s + p.ms, 0), recoveryMs: recovery.reduce((s, p) => s + p.ms, 0),
            minAscentApexMargin: Math.min(...access.filter(p => p.startY > p.targetY).map(p => p.targetY - p.minY)),
            maxRecoveryDrop: Math.max(...recovery.map(p => p.targetY - p.startY)),
          })
        } finally {
          r.scene.physics.world.destroy()
          worlds.splice(worlds.indexOf(r.scene.physics.world), 1)
        }
      }
    }
    reports.push({ id: route.id, fps, results })
  })

  test.each(liftExitRoutes)('$id has a useful unpowered exit from its live parked top endpoint', route => {
    const r = fixture(route, fps)
    traverse(r, route.points[0], 350)
  })

  test.each(dispatchApproaches)('$dispatch live pickup-to-cache movement budget', approach => {
    const level = createRelayAccessProposal()
    const power = [...level.aetherStepPickups!, ...level.dawnfireAegisPickups!].find(p => p.id === approach.power)!
    const dispatch = level.masteryPickups!.find(p => p.id === approach.dispatch)!
    const route = RELAY_ACCESS_ROUTES.find(r => r.id === approach.route)!
    const results = []
    for (const delay of [320, 350, 380]) {
      const r = fixture({ ...route, start: { x: power.x, y: 616 } }, fps)
      const start = r.time
      for (const point of [...(restagedApproaches[approach.dispatch] ?? approach.points), ...route.points]) traverse(r, point, delay)
      const elapsed = r.time - start
      expect(Math.abs(r.player.x - dispatch.x)).toBeLessThanOrEqual(12)
      expect(r.body.top).toBeLessThan(dispatch.y + 16)
      expect(r.body.bottom).toBeGreaterThan(dispatch.y - 16)
      // This is a movement budget, not injected power. Retain at least two seconds before combat/wind/lift costs.
      if (power.durationMs - elapsed < 2000) throw new Error(`Power margin ${dispatch.id} fps${fps} delay${delay} elapsed${Math.round(elapsed)} spare${Math.round(power.durationMs - elapsed)}`)
      results.push({ delay, elapsedMs: Math.round(elapsed), spareMs: Math.round(power.durationMs - elapsed) })
      r.scene.physics.world.destroy()
      worlds.splice(worlds.indexOf(r.scene.physics.world), 1)
    }
    reports.push({ dispatch: dispatch.id, fps, results })
  })

  test('coin100 remains collectible from an ordinary double hop after its old lift is relocated', () => {
    const coin = SHADOW_RUNNER_LEVEL_TEN.coins.find(p => p.id === 'relay-coins-high-08-1')!
    const r = fixture({ id: 'coin100-ground-hop', start: { x: coin.x, y: 616 }, points: [], returnPoints: [] }, fps)
    traverse(r, jump(coin.x, 616, 616), 350)
    for (const bob of [-8, 0, 8]) {
      expect(r.trace.some(sample => {
        const dx = coin.x - Math.max(sample.left, Math.min(coin.x, sample.right))
        const dy = coin.y + bob - Math.max(sample.top, Math.min(coin.y + bob, sample.y))
        return dx * dx + dy * dy < 16 * 16
      })).toBe(true)
    }
  })

  test.each(movingLiftRoutes)('$id input boarding, full carried cycle and intended exit', route => {
    const r = fixture({ ...route, movingLifts: true, points: [], returnPoints: [] }, fps)
    try {
      const lift = r.scene.movingPlatforms.find((item: any) => item.config.id === route.id)
      const boarded = boardMovingLift(r, route.id, route.boardX)
      const rideStart = r.time
      const cycleBudget = 2 * (lift.config.y - lift.endY) / lift.config.speed * 1000 + 2 * lift.config.pauseMs + 2000
      let firstTop = false
      let bottom = false
      let secondTop = false
      while (r.time - rideStart < cycleBudget) {
        const sample = r.frame()
        assertCleanMovingFrame(r, sample)
        expect(sample.grounded).toBe(true)
        expect(sample.vy).toBe(0)
        expect(sample.y).toBeCloseTo(lift.lastY, 5)
        if (lift.lastY === lift.endY && !firstTop) firstTop = true
        if (firstTop && lift.lastY === lift.config.y) bottom = true
        if (bottom && lift.lastY === lift.endY) { secondTop = true; break }
      }
      expect({ firstTop, bottom, secondTop }).toEqual({ firstTop: true, bottom: true, secondTop: true })
      const rideMs = r.time - rideStart
      for (const point of route.exit) traverse(r, point, 350)
      for (const sample of r.trace) assertCleanMovingFrame(r, sample)
      expect(r.trace.some(s => s.carryY < 0)).toBe(true)
      expect(r.trace.some(s => s.carryY > 0)).toBe(true)
      reports.push({ movingLift: route.id, fps, status: 'pass', boarded, rideMs,
        jumpPresses: r.input.current.jumpPresses,
        final: { x: r.player.x, y: r.body.bottom }, maxSyncGap: Math.max(...r.trace.map(s => Math.abs(s.syncGap))),
        airborneContactFrames: r.trace.filter(s => s.lifts.some((lift: any) => lift.overlaps)).length,
        maxAirborneFootOverlap: Math.max(0, ...r.trace.flatMap(s => s.lifts.filter((lift: any) => lift.overlaps).map((lift: any) => lift.footDepth))),
      })
    } catch (error) {
      reports.push({ movingLift: route.id, fps, status: 'fail', error: String(error), trace: r.trace })
      throw error
    }
  })
})

describe('Choir gap12 ordinary-input sidecar', () => {
  const driverPath = resolve('scripts/shadow-runner-route-proof.mjs')
  const driverSource = ts.createSourceFile(driverPath, readFileSync(driverPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const printer = ts.createPrinter()
  const declarations = driverSource.statements.filter(ts.isFunctionDeclaration)
    .filter(node => ['crossingWindowReady', 'demand', 'groundedAt', 'decideStep', 'decideRouteStep'].includes(node.name?.text ?? ''))
  const functions = declarations.map(node => printer.printNode(ts.EmitHint.Unspecified,
    ts.factory.updateFunctionDeclaration(node, undefined, node.asteriskToken, node.name, node.typeParameters,
      node.parameters, node.type, node.body), driverSource)).join('\n')
  const decide = runInNewContext(`${functions}\n({ decideStep })`).decideStep as
    (step: any, debug: unknown, memory: Record<string, any>, now: number) => any
  const policyExports: any = {}
  runInNewContext(ts.transpileModule(readFileSync(resolve('scripts/shadow-runner-relay-route-policies.mjs'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: policyExports })
  const crossing = policyExports.RELAY_ROUTE_POLICIES[0].steps.find((step: any) => step.id === 'gap-12-landing')
  // Reuse the installed Arcade/player fixture. Advance time naturally; no lift parking,
  // body teleport, power activation, phase support, or replacement jump velocities.
  function choir(fps: number, offset = 0) {
    const r = fixture({ id: 'choir-gap12', start: { x: 11670, y: 616 },
      points: [], returnPoints: [], movingLifts: true, intangiblePhases: true }, fps, offset)
    r.scene.relayBeamZones = SHADOW_RUNNER_LEVEL_TEN.relayBeamZones!
      .filter(zone => zone.id.startsWith('relay-beam-choir-')).map(config => ({
        config, state: 'idle', activatedAt: null, lastGuardedCycle: -1,
        visual: { clear() {}, lineStyle() {} },
      }))
    r.scene.drawRelayBeamLane = jest.fn()
    const lift = r.scene.movingPlatforms.find((item: any) => item.config.id === 'relay-lift-choir')
    const frame = (beams = true) => {
      const sample = r.frame()
      if (beams) r.scene.updateRelayBeamZones(r.time)
      return sample
    }
    return { r, lift, frame }
  }

  test.each([30, 60, 120])('descending underside alone cancels upward motion at %ifps', fps => {
    const { r, frame } = choir(fps)
    while (r.time < 3200) frame(false)
    const start = r.time
    r.input.current.right = true
    r.input.current.jumpPresses += 1
    let second = false
    while (r.time - start < 1600 && r.body.bottom < 740) {
      if (!second && r.time - start >= 350) {
        r.input.current.jumpPresses += 1
        second = true
      }
      frame(false)
    }
    expect(r.trace.some(sample => sample.time > start && sample.blockedUp && sample.vy >= 0)).toBe(true)
    expect(r.scene.damagePlayerFromHazard).not.toHaveBeenCalled()
    // Contact does not guarantee a miss: this no-knockback control lands at 60/120fps.
    expect(r.body.bottom).toBeGreaterThanOrEqual(616)
  })

  test('an active 448 beam independently reaches the old crossing before underside cancellation', () => {
    const { r, frame } = choir(60)
    for (const beam of r.scene.relayBeamZones) beam.config = { ...beam.config, x: 11800, width: 1600 }
    while (r.time < 3000) frame()
    const start = r.time
    r.input.current.right = true
    r.input.current.jumpPresses += 1
    let second = false
    let firstHit = Infinity
    let firstCeiling = Infinity
    while (r.time - start < 1300) {
      if (!second && r.time - start >= 350) {
        r.input.current.jumpPresses += 1
        second = true
      }
      const sample = frame()
      if (r.scene.damagePlayerFromHazard.mock.calls.length && firstHit === Infinity) firstHit = r.time
      if (sample.blockedUp && firstCeiling === Infinity) firstCeiling = r.time
    }
    expect(Number.isFinite(firstCeiling)).toBe(true)
    expect(firstHit).toBeLessThan(firstCeiling)
    expect(r.scene.damagePlayerFromHazard).toHaveBeenCalledWith(expect.any(Number), undefined, 3)
  })

  test.each([30, 60, 120])('gated crossing rejects beam hits and dirty contacts at %ifps', fps => {
    const results: Array<{ waitMs: number; crossingMs: number }> = []
    for (const arrivalMs of [0, 1950, 3900, 5850, 30000, 90000, 180000]) {
      for (const [offset, sampleMs] of [[-8, 80], [0, 90], [8, 100]]) {
        const { r, lift, frame } = choir(fps, offset)
        while (r.time < arrivalMs) frame()
        assertCleanMovingFrame(r, r.trace[r.trace.length - 1])
        const arrival = r.time
        const memory: Record<string, any> = {}
        let lastObservation = -Infinity
        let done = false
        let stable = 0
        while (r.time - arrival < crossing.timeoutMs) {
          if (r.time - lastObservation >= sampleMs) {
            lastObservation = r.time
            const action = decide(crossing, { activeTimeMs: r.time, player: {
              x: r.player.x, bodyBottom: r.body.bottom, velocityY: r.body.velocity.y,
              crouching: r.scene.crouching,
            }, movingPlatforms: [{
              id: lift.config.id, y: Math.round(lift.lastY), direction: lift.direction,
              paused: r.time < lift.pauseUntil,
              pauseRemainingMs: Math.max(0, lift.pauseUntil - r.time),
            }] }, memory, r.time)
            setShadowRunnerAction(r.input.current, 'left', action.direction < 0)
            setShadowRunnerAction(r.input.current, 'right', action.direction > 0)
            setShadowRunnerAction(r.input.current, 'crouch', action.crouch)
            if (action.jump) {
              setShadowRunnerAction(r.input.current, 'jump', true)
              setShadowRunnerAction(r.input.current, 'jump', false)
            }
            done ||= action.done
          }
          const sample = frame()
          assertCleanMovingFrame(r, sample, true)
          if (done && sample.grounded && Math.abs(sample.y - 616) < 0.01 && Math.abs(sample.x - crossing.x) <= 18) stable += 1
          else stable = 0
          if (stable >= 6) break
        }
        if (stable < 6) throw new Error(`Sampled Choir crossing failed ${JSON.stringify({ fps, arrivalMs, offset, sampleMs,
          elapsedMs: r.time - arrival, memory, final: r.trace[r.trace.length - 1] })}`)
        expect(r.input.current.jumpPresses).toBe(2)
        results.push({ waitMs: Math.round(memory.jumpAt - arrival), crossingMs: Math.round(r.time - memory.jumpAt) })
        r.scene.physics.world.destroy()
        worlds.splice(worlds.indexOf(r.scene.physics.world), 1)
      }
    }
    reports.push({ id: 'choir-gap12-gated', fps, cases: results.length,
      maxWaitMs: Math.max(...results.map(result => result.waitMs)),
      maxCrossingMs: Math.max(...results.map(result => result.crossingMs)) })
  }, 120000)
})

describe('Ascent gap22 sampled-input wind sidecar', () => {
  const driverPath = resolve('scripts/shadow-runner-route-proof.mjs')
  const source = ts.createSourceFile(driverPath, readFileSync(driverPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const printer = ts.createPrinter()
  const functions = source.statements.filter(ts.isFunctionDeclaration)
    .filter(node => ['crossingWindowReady', 'demand', 'groundedAt', 'decideStep', 'decideRouteStep'].includes(node.name?.text ?? ''))
    .map(node => printer.printNode(ts.EmitHint.Unspecified,
      ts.factory.updateFunctionDeclaration(node, undefined, node.asteriskToken, node.name, node.typeParameters,
        node.parameters, node.type, node.body), source)).join('\n')
  const powerFields = source.statements.filter(ts.isVariableStatement)
    .find(node => node.declarationList.declarations.some(declaration => declaration.name.getText(source) === 'POWER_READBACK_FIELDS'))!
  const fields = printer.printNode(ts.EmitHint.Unspecified,
    ts.factory.updateVariableStatement(powerFields, undefined, powerFields.declarationList), source)
  const decide = runInNewContext(`${fields}\n${functions}\n({ decideStep })`).decideStep as
    (step: any, debug: unknown, memory: Record<string, any>, now: number) => any
  const windId = 'relay-wind-ascent'
  const wait = (id: string, x: number, y: number) => ({ id, kind: 'wind-cycle', zoneId: windId,
    x, y, crouch: true, timeoutMs: 5000 })
  // Frozen failing policy from the Android trace, independent of concurrent parent edits.
  const oldStep = { id: 'gap-22-step', kind: 'jump', x: 21640, y: 458, fromY: 616,
    airJumpDelayMs: 350, riseBeforeMoveY: 498 }
  const candidate = [
    wait('ascent-ground-calm', 21512, 616),
    { ...oldStep, riseBeforeMoveY: 520, airJumpDelayMs: 250, crouch: true },
    { id: 'ascent-step-brace', kind: 'move', x: 21696, y: 458, crouch: true, braceWindZoneId: windId },
    { id: 'ascent-phase-sync', kind: 'phase-cycle', platformId: 'relay-phase-07', windZoneId: windId,
      x: 21696, y: 458, crouch: true, timeoutMs: 5000 },
    wait('ascent-step-calm', 21696, 458),
    { id: 'gap-22-landing', kind: 'jump', x: 21940, y: 616, fromY: 458, crouch: true, crouchOnLanding: true },
    { id: 'ascent-power-brace', kind: 'move', x: 21992, y: 616, crouch: true, braceWindZoneId: windId },
    wait('ascent-power-calm', 21992, 616),
    { id: 'power-relay-aether-ascent', kind: 'power', pickupId: 'relay-aether-ascent',
      power: 'aether-step', x: 21992, y: 616 },
  ]
  const requestedCandidate = [candidate[0], oldStep,
    { ...candidate[2], x: 21680 }, wait('ascent-step-calm', 21680, 458),
    { id: 'gap-22-landing', kind: 'jump', x: 21940, y: 616, fromY: 458 },
    ...candidate.slice(6),
  ]

  const refuge = { id: 'relay-recovery-ascent-gap', x: 21776, y: 600, width: 96, height: 24 }
  function ascent(fps: number, offset: number, recoveryLedge = false, omitRefuge = false, foundry = false, lateAscent = false, startOverride?: number) {
    const startX = startOverride ?? (lateAscent ? 22656 : foundry ? 6504 : recoveryLedge ? 21704 : 21512)
    const localWindId = foundry ? 'relay-wind-foundry' : windId
    expect(SHADOW_RUNNER_LEVEL_TEN.platforms.find(p => p.id === refuge.id)).toMatchObject(refuge)
    // Historical rejection diagnostics and the removal control omit only the new refuge.
    const r = fixture({ id: 'ascent-gap22', start: { x: startX, y: 616 },
      points: [], returnPoints: [], movingLifts: true }, fps, offset, recoveryLedge && !omitRefuge ? [] : [refuge.id])
    const visual = { clear() {}, fillStyle() {}, fillRect() {}, lineStyle() {}, beginPath() {},
      moveTo() {}, lineTo() {}, strokePath() {} }
    r.scene.windZones = SHADOW_RUNNER_LEVEL_TEN.windZones!.map(config => ({
      config, active: false, telling: false, visual,
    }))
    const phaser = jest.requireMock('phaser').default
    phaser.GameObjects ??= { Image: class {}, TileSprite: class {} }
    r.scene.phasePlatforms = SHADOW_RUNNER_LEVEL_TEN.phasePlatforms!.map(config => ({
      config, state: undefined, collider: r.scene.platforms.getChildren().find((object: any) => object.name === config.id),
      visual: { setAlpha() {} },
    }))
    // Match production ordering: Arcade, player, moving geometry, wind, postUpdate.
    const moving = r.scene.updateMovingPlatforms.bind(r.scene)
    r.scene.updateMovingPlatforms = (time: number) => {
      moving(time)
      r.scene.updatePhasePlatforms(time)
      r.scene.updateWindZones(time)
    }
    r.scene.updatePhasePlatforms(r.time)
    r.scene.updateWindZones(r.time)
    const health = r.scene.state.player.health
    const pickupConfig = SHADOW_RUNNER_LEVEL_TEN.aetherStepPickups!.find(p => p.id === (foundry ? 'relay-aether-foundry' : 'relay-aether-ascent'))!
    const data: Record<string, unknown> = { collected: false }
    const pickup: any = {
      name: pickupConfig.id, x: pickupConfig.x, y: pickupConfig.y, active: true,
      width: 38, height: 38, displayWidth: 38, displayHeight: 38, scaleX: 1, scaleY: 1,
      originX: 0.5, originY: 0.5, angle: 0,
      setPosition(x: number, y: number) { this.x = x; this.y = y; return this },
      getTopLeft(point: any) { return point.set(this.x - 19, this.y - 19) },
      getData(key: string) { return data[key] },
      setData(key: string, value: unknown) { data[key] = value; return this },
      disableBody() { this.body.enable = false; this.active = false },
    }
    pickup.body = new StaticBody(r.scene.physics.world, pickup)
    pickup.body.setCircle(19)
    pickup.body.reset()
    expect(pickup.body.isCircle).toBe(true)
    expect(pickup.body.radius).toBe(19)
    expect(pickup.body.width).toBe(38)
    expect(pickup.body.center.x).toBe(pickupConfig.x)
    expect(pickup.body.center.y).toBe(pickupConfig.y)
    r.scene.physics.world.add(pickup.body)
    let collectedAt: number | undefined
    r.scene.tweens = { killTweensOf() {}, add(config: any) { config.onComplete?.() } }
    r.scene.addCoinSparkle = jest.fn()
    r.scene.flashCamera = jest.fn()
    r.scene.updateAetherStepAura = jest.fn()
    r.scene.emitHud = jest.fn()
    r.scene.physics.world.addOverlap(r.player, pickup, () => {
      if (!pickup.getData('collected')) {
        collectedAt = r.time
        r.scene.collectAetherStep(pickup)
      }
    })
    const frame = () => {
      // The authored 670ms sine/yoyo bob; only visual collaborators are replaced.
      const index = SHADOW_RUNNER_LEVEL_TEN.aetherStepPickups!.findIndex(p => p.id === pickupConfig.id)
      const elapsed = Math.max(0, r.time - index * 180)
      pickup.y = pickupConfig.y - 13 * (1 - Math.cos(Math.PI * elapsed / 670)) / 2
      if (pickup.active) pickup.body.reset()
      const sample = r.frame()
      return { ...sample, overlaps: r.scene.platforms.getChildren().filter((object: any) => object.body.enable
        && overlap(r.body, { x: object.body.left, y: object.body.top, width: object.body.width, height: object.body.height }))
        .map((object: any) => object.name),
      phase: r.scene.phasePlatforms.find((item: any) => item.config.id === 'relay-phase-07').state }
    }
    const debug = () => ({ activeTimeMs: r.time, floorHazards: [], stormWarnings: [],
      player: { x: r.player.x, y: r.player.y, bodyBottom: r.body.bottom, bodyTop: r.body.top,
        velocityY: r.body.velocity.y, crouching: r.scene.crouching,
        aetherStepActive: r.scene.state.player.aetherStepActiveUntil > r.time },
      collectedPowerIds: pickup.getData('collected') ? [pickupConfig.id] : [],
      phasePlatforms: r.scene.phasePlatforms.map((item: any) => ({ id: item.config.id, state: item.state })),
      windZones: r.scene.windZones.map((zone: any) => ({ id: zone.config.id, active: zone.active, telling: zone.telling, direction: zone.config.direction })),
    })
    const apply = (action: any) => {
      setShadowRunnerAction(r.input.current, 'left', action.direction < 0)
      setShadowRunnerAction(r.input.current, 'right', action.direction > 0)
      setShadowRunnerAction(r.input.current, 'crouch', action.crouch)
      if (action.jump) {
        setShadowRunnerAction(r.input.current, 'jump', true)
        setShadowRunnerAction(r.input.current, 'jump', false)
      }
    }
    return { r, frame, debug, apply, health, startX, localWindId, get collectedAt() { return collectedAt } }
  }

  function runAscent(steps: any[], fps: number, sampleMs: number, arrivalMs: number, offset = 0, recoveryLedge = false, omitRefuge = false, foundry = false, lateAscent = false, startOverride?: number) {
    const run = ascent(fps, offset, recoveryLedge, omitRefuge, foundry, lateAscent, startOverride)
    const { r, frame, debug, apply } = run
    const warmMemory = {}
    let observedAt = -Infinity
    while (r.time < arrivalMs) {
      if (r.time - observedAt >= sampleMs) {
        observedAt = r.time
        apply(decide({ ...wait('arrival-anchor', run.startX, 616), zoneId: run.localWindId }, debug(), warmMemory, r.time))
      }
      frame()
    }
    const startedAt = r.time
    let stepIndex = 0
    let memory: Record<string, any> = {}
    const completions: any[] = []
    const jumps: any[] = []
    const samples: any[] = []
    let deadline: string | undefined
    observedAt = -Infinity
    while (stepIndex < steps.length && r.body.bottom < 740) {
      const step = steps[stepIndex]
      if (r.time - observedAt >= sampleMs) {
        observedAt = r.time
        const before = debug()
        const action = decide(step, before, memory, r.time)
        // Same per-step bound as the real driver; waiting never extends it.
        if (r.time - memory.startedAt > (step.timeoutMs ?? 12000)) { deadline = step.id; break }
        if (action.jump) jumps.push({ step: step.id, time: r.time, x: r.player.x, y: r.body.bottom,
          crouching: r.scene.crouching, grounded: r.body.blocked.down || r.body.touching.down,
          phase: r.time % 2100, power: before.player.aetherStepActive })
        if (action.done) {
          // Match RealInputDriver.finishStep: release movement at the boundary.
          apply({ direction: 0, crouch: Boolean(steps[stepIndex + 1]?.crouch) })
          completions.push({ id: step.id, time: r.time, x: r.player.x, y: r.body.bottom,
            crouching: r.scene.crouching, grounded: r.body.blocked.down || r.body.touching.down,
            wind: before.windZones.find((zone: any) => zone.id === run.localWindId), jumps: jumps.length })
          stepIndex += 1
          memory = {}
        } else apply(action)
      }
      const sample = frame()
      samples.push({ ...sample, step: step.id, crouching: r.scene.crouching,
        windActive: r.scene.windZones.find((zone: any) => zone.config.id === run.localWindId).active })
    }
    const result = { completed: stepIndex === steps.length, step: steps[stepIndex]?.id,
      fps, sampleMs, arrivalMs, offset, elapsed: r.time - startedAt, completions, jumps, samples,
      final: samples[samples.length - 1], deadline, collectedAt: run.collectedAt, health: r.scene.state.player.health,
      initialHealth: run.health, hazardCalls: r.scene.damagePlayerFromHazard.mock.calls.length,
      fallCalls: r.scene.handlePlayerFellOut.mock.calls.length }
    r.scene.physics.world.destroy()
    worlds.splice(worlds.indexOf(r.scene.physics.world), 1)
    return result
  }

  test.each([30, 60, 120])('recorded warning launch fails with real wind at %ifps', fps => {
    for (const sampleMs of [80, 90, 100]) {
      const result = runAscent([oldStep], fps, sampleMs, 538)
      expect(result.completed).toBe(false)
      expect(result.jumps[0].phase).toBeGreaterThanOrEqual(538)
      expect(result.jumps[0].phase).toBeLessThan(620)
      expect(Math.min(...result.samples.map(sample => sample.x))).toBeLessThan(21380)
      expect(result.samples.some(sample => sample.windActive && !sample.grounded)).toBe(true)
    }
  })

  const arrivals = [0, 300, 538, 900, 1590, 1630, 2090, 30000, 90000]
  function clean(result: ReturnType<typeof runAscent>) {
    return result.completed && result.hazardCalls === 0 && result.fallCalls === 0
      && result.samples.every(sample => sample.overlaps.length === 0 && !sample.blockedUp
        && sample.y < 700 && Math.abs(sample.syncGap) < 0.001)
  }

  const policyModule = { exports: {} as { RELAY_ROUTE_POLICIES: { steps: any[] }[] } }
  runInNewContext(ts.transpileModule(readFileSync(resolve('scripts/shadow-runner-relay-route-policies.mjs'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, policyModule)
  const normalSteps = policyModule.exports.RELAY_ROUTE_POLICIES[0].steps
  const refugeRoute = normalSteps.slice(normalSteps.findIndex(step => step.id === 'ascent-floor-calm'),
    normalSteps.findIndex(step => step.id === 'power-relay-aether-ascent') + 1)

  const lateCandidate = normalSteps.slice(normalSteps.findIndex(step => step.id === 'late-ascent-ground-calm'),
    normalSteps.findIndex(step => step.id === 'gap-23-landing') + 1)

  test('recorded early-step takeoff overshoot strikes the underside without losing health', () => {
    const step = normalSteps.find(step => step.id === 'gap-04-step')
    const result = runAscent([step], 60, 100, 0, 0, false, false, false, false, 3608)
    expect(result.completed).toBe(false)
    expect(result.samples.some(sample => sample.blockedUp)).toBe(true)
    expect(result.health).toBe(result.initialHealth)
    expect(result.fallCalls).toBe(0)
  })

  test.each([30, 60, 120])('earlier Prism takeoff tolerates observed arrival overshoot at %ifps', fps => {
    expect(normalSteps.find(step => step.id === 'gap-04-takeoff').x).toBe(3568)
    const steps = normalSteps.slice(normalSteps.findIndex(step => step.id === 'gap-04-step'),
      normalSteps.findIndex(step => step.id === 'gap-04-landing') + 1)
    for (const sampleMs of [80, 100, 150]) for (const offset of [-12, 0, 12, 20, 24]) {
      const result = runAscent(steps, fps, sampleMs, 0, offset, false, false, false, false, 3568)
      if (!clean(result)) throw new Error(`Prism takeoff failed ${JSON.stringify({ fps, sampleMs, offset,
        step: result.step, deadline: result.deadline, final: { x: result.final.x, y: result.final.y },
        badFrames: result.samples.filter(s => s.overlaps.length || s.blockedUp).slice(0, 2) })}`)
      expect(result.health).toBe(result.initialHealth)
      expect(result.collectedAt).toBeUndefined()
      expect(result.jumps.every(item => !item.power)).toBe(true)
    }
  })

  test.each([30, 60, 120])('Foundry east accepts a supported 16px fresh-calm launch band at %ifps', fps => {
    const steps = normalSteps.slice(normalSteps.findIndex(step => step.id === 'foundry-east-stair-wind-cycle'),
      normalSteps.findIndex(step => step.id === 'gap-08-landing') + 1)
    for (const sampleMs of [80, 100, 150]) for (const arrivalMs of [0, 900, 30000]) for (const offset of [-16, -8, 0, 8, 16]) {
      const result = runAscent(steps, fps, sampleMs, arrivalMs, offset, false, false, true, false, 7516)
      if (!clean(result)) throw new Error(`Foundry east band failed ${JSON.stringify({ fps, sampleMs, arrivalMs, offset,
        step: result.step, deadline: result.deadline, final: { x: result.final.x, y: result.final.y },
        jumps: result.jumps, completions: result.completions,
        badFrames: result.samples.filter(s => s.overlaps.length || s.blockedUp).slice(0, 2) })}`)
      expect(result.health).toBe(result.initialHealth)
      expect(result.collectedAt).toBeUndefined()
      expect(result.jumps.every(item => !item.power)).toBe(true)
    }
  }, 60000)

  test.each([30, 60, 120])('late Ascent policy crosses with one ordinary jump and a supported drop at %ifps', fps => {
    for (const sampleMs of [80, 100, 120, 150, 180]) for (const arrivalMs of [0, 538, 1590, 2090, 30000]) for (const offset of [-8, 0, 8]) {
      const result = runAscent(lateCandidate, fps, sampleMs, arrivalMs, offset, false, false, false, true)
      if (!clean(result)) throw new Error(`Late Ascent policy failed ${JSON.stringify({ fps, sampleMs, arrivalMs, offset,
        step: result.step, deadline: result.deadline, final: { x: result.final.x, y: result.final.y },
        jumps: result.jumps, completions: result.completions,
        badFrames: result.samples.filter(s => s.overlaps.length || s.blockedUp).slice(0, 2) })}`)
      expect(result.collectedAt).toBeUndefined()
      expect(result.jumps.every(item => !item.power)).toBe(true)
      expect(result.jumps).toHaveLength(1)
    }
  }, 60000)

  test.each([30, 60, 120])('recovery refuge carries the complete crossing at %ifps', fps => {
    for (const sampleMs of [80, 90, 100, 150, 180]) {
      for (const arrivalMs of arrivals) {
        for (const offset of [-8, 0, 8]) {
          const result = runAscent(refugeRoute, fps, sampleMs, arrivalMs, offset, true)
          const { samples, ...summary } = result
          if (!clean(result)) throw new Error(`Refuge crossing failed ${JSON.stringify({ ...summary,
            badFrames: samples.filter(sample => sample.overlaps.length || sample.blockedUp).slice(0, 2) })}`)
          expect(result.collectedAt).toBeDefined()
          expect(result.health).toBe(result.initialHealth)
          expect(result.jumps).toHaveLength(2)
          expect(result.collectedAt).toBeLessThanOrEqual(result.completions.find(item => item.id === 'gap-22-landing').time)
          expect(result.jumps.filter(item => item.step === 'gap-22-step')).toHaveLength(1)
          expect(result.jumps.filter(item => item.step === 'gap-22-landing')).toHaveLength(1)
          expect(result.jumps.filter(item => item.step !== 'power-relay-aether-ascent').every(item => !item.power)).toBe(true)
          expect(result.completions.find(item => item.id === 'gap-22-step').grounded).toBe(true)
        }
      }
    }
  }, 120000)

  test.each([30, 60, 120])('recovery refuge route fails without its support at %ifps', fps => {
    const result = runAscent(refugeRoute, fps, 90, 0, 0, true, true)
    expect(result.completed).toBe(false)
    expect(result.step).toBe('gap-22-step')
    expect(result.final.y).toBeGreaterThan(700)
    expect(result.collectedAt).toBeUndefined()
  })

  test.each([30, 60, 120])('Foundry crossing uses the live wind policy and natural pickup at %ifps', fps => {
    const steps = normalSteps.slice(normalSteps.findIndex(step => step.id === 'foundry-stair-wind-cycle'),
      normalSteps.findIndex(step => step.id === 'power-relay-aether-foundry') + 1)
    for (const sampleMs of [80, 100, 150]) {
      for (const arrivalMs of [0, 900, 30000]) {
        for (const offset of [-8, 0, 8]) {
          const result = runAscent(steps, fps, sampleMs, arrivalMs, offset, false, false, true)
          const { samples } = result
          if (!clean(result)) throw new Error(`Foundry crossing failed ${JSON.stringify({ fps, sampleMs, arrivalMs, offset,
            step: result.step, deadline: result.deadline, jumps: result.jumps, completions: result.completions,
            final: { x: result.final.x, y: result.final.y },
            calmStarts: samples.filter((sample, i) => i > 0 && samples[i - 1].windActive && !sample.windActive)
              .map(sample => ({ time: sample.time, x: sample.x, y: sample.y })),
            firstCalmFrames: samples.filter(sample => sample.time >= 1450 && sample.time <= 1700)
              .map(sample => ({ time: sample.time, x: sample.x, vx: sample.vx, direction: sample.inputDirection, crouch: sample.crouching })),
            badFrames: samples.filter(sample => sample.overlaps.length || sample.blockedUp)
              .slice(0, 2).map(sample => ({ x: sample.x, y: sample.y, overlaps: sample.overlaps, head: sample.blockedUp })) })}`)
          expect(result.collectedAt).toBeDefined()
          expect(result.health).toBe(result.initialHealth)
        }
      }
    }
  }, 120000)

  test.each([30, 60, 120])('requested fresh-calm proposal is not a bounded route at %ifps', fps => {
    const result = runAscent(requestedCandidate, fps, 90, 0, -8)
    expect(result.completed).toBe(false)
    expect(['gap-22-step', 'ascent-step-calm', 'gap-22-landing']).toContain(result.step)
    expect(result.deadline === result.step || result.final.y > 700).toBe(true)
  })

  test.each([30, 60, 120])('adjusted first leg lands cleanly whenever the bounded wind gate opens at %ifps', fps => {
    let cases = 0
    let maxElapsed = 0
    const gateFailures: any[] = []
    for (const sampleMs of [80, 90, 100]) {
      for (const arrivalMs of arrivals) {
        for (const offset of [-8, 0, 8]) {
          const result = runAscent(candidate.slice(0, 2), fps, sampleMs, arrivalMs, offset)
          const { samples, ...summary } = result
          if (!result.completed) {
            // A fresh calm can be consumed while outside the driver's 8px anchor.
            // This is a gate failure, never successful crossing evidence.
            expect(result.deadline).toBe('ascent-ground-calm')
            expect(result.jumps).toHaveLength(0)
            gateFailures.push({ sampleMs, arrivalMs, offset })
            continue
          }
          if (!clean(result)) throw new Error(`First-leg proof failed ${JSON.stringify(summary)}`)
          expect(result.health).toBe(result.initialHealth)
          expect(result.jumps).toHaveLength(2)
          expect(result.jumps.every(item => !item.power)).toBe(true)
          const gate = result.completions[0]
          expect(gate.crouching && gate.grounded).toBe(true)
          expect(gate.wind).toMatchObject({ active: false, telling: false })
          const landing = result.completions[result.completions.length - 1]
          expect(landing.grounded).toBe(true)
          expect(landing.y).toBeCloseTo(458)
          expect(Math.abs(landing.x - 21640)).toBeLessThanOrEqual(18)
          expect(result.collectedAt).toBeUndefined()
          cases += 1
          maxElapsed = Math.max(maxElapsed, result.elapsed)
        }
      }
    }
    expect(cases).toBeGreaterThan(0)
    console.info(`Ascent first leg ${fps}fps: ${cases}/81 clean landings; ${gateFailures.length} gate timeouts; max successful elapsed ${Math.ceil(maxElapsed)}ms; first timeout ${JSON.stringify(gateFailures[0])}`)
  }, 120000)

  test.each([30, 60, 120])('phase-sync plus next calm is rejected as a reliable two-leg route at %ifps', fps => {
    const results: any[] = []
    for (const sampleMs of [80, 90, 100]) {
      for (const arrivalMs of [0, 30000, 90000]) {
        for (const offset of [-8, 0, 8]) {
          const result = runAscent(candidate, fps, sampleMs, arrivalMs, offset)
          const strictPass = clean(result) && result.jumps.filter(item => item.step === 'gap-22-landing').length === 1
          if (strictPass) {
            const landing = result.completions.find(item => item.id === 'gap-22-landing')
            expect(landing.grounded).toBe(true)
            expect(landing.y).toBeCloseTo(616)
            // The bobbing pickup can overlap the falling body before grounded readback.
            expect(result.collectedAt).toBeGreaterThan(result.jumps.find(item => item.step === 'gap-22-landing').time)
            expect(result.collectedAt).toBeLessThanOrEqual(result.completions[result.completions.length - 1].time)
            expect(result.completions[result.completions.length - 1].id).toBe('power-relay-aether-ascent')
          }
          results.push({ sampleMs, arrivalMs, offset, strictPass, completed: result.completed,
            step: result.step, deadline: result.deadline, elapsed: Math.ceil(result.elapsed),
            ceilingFrames: result.samples.filter(sample => sample.blockedUp).length,
            penetrationFrames: result.samples.filter(sample => sample.overlaps.length).length,
            final: { x: Math.round(result.final.x), y: Math.round(result.final.y) },
            collected: result.collectedAt !== undefined })
        }
      }
    }
    expect(results.some(result => !result.strictPass)).toBe(true)
    console.info(`Ascent full sequence ${fps}fps: ${JSON.stringify({ cases: results.length,
      cleanPasses: results.filter(result => result.strictPass).length,
      collected: results.filter(result => result.collected).length,
      deadlines: results.filter(result => result.deadline).length,
      examples: [0, 30000, 90000].map(arrival => results.find(result => result.arrivalMs === arrival && !result.strictPass)) })}`)
  }, 120000)
})
