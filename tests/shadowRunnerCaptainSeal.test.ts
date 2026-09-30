import { createHash } from 'node:crypto'
import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_CONFIGS, type ShadowRunnerEnemyConfig } from '../src/features/games/shadow-runner/game/levels'
import { SHADOW_RUNNER_ENEMY_RUNTIME } from '../src/features/games/shadow-runner/game/runtimeCatalog'

jest.mock('phaser', () => {
  const Events = jest.requireActual('eventemitter3')
  class Visual {
    data = new Map<string, unknown>()
    scaleX = 1; scaleY = 1; angle = 0; rotation = 0; active = true
    originX = 0.5; originY = 0.5
    displayWidth: number; displayHeight: number
    constructor(public x: number, public y: number, public width = 64, public height = 64) {
      this.displayWidth = width; this.displayHeight = height
    }
    get displayOriginX() { return this.width * this.originX }
    get displayOriginY() { return this.height * this.originY }
    setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this }
    setDisplaySize(width: number, height: number) { this.displayWidth = width; this.displayHeight = height; return this }
    setDepth() { return this }
    setAlpha() { return this }
    setVisible() { return this }
    setActive(active: boolean) { this.active = active; return this }
    setRotation(rotation: number) { this.rotation = rotation; return this }
    setData(key: string, value: unknown) { this.data.set(key, value); return this }
    getData(key: string) { return this.data.get(key) }
    getTopLeft(point: { set: (x: number, y: number) => unknown }) {
      return point.set(this.x - this.displayWidth * this.originX, this.y - this.displayHeight * this.originY)
    }
  }
  return { __esModule: true, default: {
    Scene: class { events = new Events() },
    Game: class { constructor(public config: { scene: unknown[] }) {} },
    GameObjects: { Image: Visual, TileSprite: class {} },
    Physics: { Arcade: { Body: jest.requireActual('phaser/src/physics/arcade/Body') } },
    Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
    Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
    Loader: { Events: jest.requireActual('phaser/src/loader/events') },
  } }
})

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
const World = jest.requireActual('phaser/src/physics/arcade/World')
const Visual = jest.requireMock('phaser').default.GameObjects.Image
const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
const encounter = level.encounters!.find(item => item.id === 'captain-encounter-barracks-seal')!
const exitFloor = level.platforms.find(item => item.id === 'captain-barracks-exit')!
const heroScale = 0.78
const halfWidth = 42 * heroScale / 2
const playerHeight = (crouch: boolean) => (crouch ? 48 * 0.72 : 70) * heroScale
const worlds: any[] = []

afterEach(() => { worlds.splice(0).forEach(world => world.destroy()) })

// Actual scene barrier construction/state + installed Arcade World/Body/StaticBody
// and collision separation. Rendering/tweens are stubbed; no browser or combat AI replay.
function fixture(width = encounter.width) {
  const game = createShadowRunnerPhaserGame({
    parent: document.createElement('div'), input: { current: createShadowRunnerInputState() },
    onHudChange: jest.fn(), levelId: 'level-9',
  })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  scene.sys = { scale: { width: 960, height: 540 } }
  const world = new World(scene, { gravity: { x: 0, y: 1640 }, fps: 60, fixedStep: true })
  worlds.push(world)
  const config = { ...encounter, width }
  scene.add = {
    image: (x: number, y: number) => new Visual(x, y),
    rectangle: (x: number, y: number, w: number, h: number) => new Visual(x, y, w, h),
  }
  scene.textures = { exists: () => true, get: () => ({ has: () => true }) }
  scene.tweens = { add: jest.fn() }
  scene.encounterBarriers = {
    add(object: any) {
      object.body = new StaticBody(world, object)
      world.add(object.body)
    },
  }
  scene.createEncounterBarrier(config, config.x - 34)
  scene.createEncounterBarrier(config, config.x + config.width - 34)
  const barriers = scene.encounterBarrierRuntimes.map((runtime: any) => runtime.collider.body)
  scene.state.enemies.forEach((enemy: any) => {
    if (config.enemyIds.includes(enemy.id)) enemy.activated = true
  })
  scene.updateEncounterBarriers()
  const floors = [...level.platforms, ...(level.crouchGates ?? [])].map(rect => {
    const body = new StaticBody(world)
    body.setSize(rect.width, rect.height, false)
    body.position.set(rect.x, rect.y)
    body.updateCenter()
    world.add(body)
    return body
  })
  function playerAt(x: number, crouch = false) {
    const body = new Body(world)
    const height = playerHeight(crouch)
    body.setSize(halfWidth * 2, height, false)
    body.setMaxVelocity(360, 940)
    body.position.set(x - halfWidth, 616 - height)
    body.updateCenter()
    world.add(body)
    world.addCollider(body, floors)
    world.addCollider(body, barriers)
    return body
  }
  function advance(seconds: number, fps: number, action: (time: number) => void) {
    for (let frame = 0; frame < Math.round(seconds * fps); frame += 1) {
      action(frame / fps)
      world.update(frame * 1000 / fps, 1000 / fps)
      world.postUpdate()
    }
  }
  return { scene, world, barriers, playerAt, advance }
}

function enemyBodyAt(enemy: ShadowRunnerEnemyConfig, x: number) {
  const runtime = SHADOW_RUNNER_ENEMY_RUNTIME[enemy.kind]
  const size = runtime.frameSize ?? 128
  const width = runtime.frameWidth ?? size
  const sprite = {
    x, y: enemy.y, angle: 0, width, height: size, displayWidth: width, displayHeight: size,
    displayOriginX: width / 2, displayOriginY: size, scaleX: runtime.scale, scaleY: runtime.scale,
    frame: { realWidth: width, realHeight: size },
  }
  const body = new Body({ defaults: {} }, sprite)
  body.setSize(runtime.body.width, runtime.body.height).setOffset(runtime.body.offsetX, runtime.body.offsetY)
  body.updateFromGameObject()
  return body
}

test.each([false, true])('clearance uses the full scaled player physics dimensions, offsets and feet (crouch %s)', crouch => {
  // Include the runtime's vertical crouch squash, body offsets and bottom-origin frame.
  const sprite = {
    x: 11000, y: 616, angle: 0, width: 128, height: 128, displayWidth: 128, displayHeight: 128,
    displayOriginX: 64, displayOriginY: 128, scaleX: heroScale, scaleY: heroScale * (crouch ? 0.72 : 1),
    frame: { realWidth: 128, realHeight: 128 },
  }
  const body = new Body({ defaults: {} }, sprite)
  body.setSize(42, crouch ? 48 : 70).setOffset(43, crouch ? 80 : 58)
  body.updateFromGameObject()
  expect(body.width).toBeCloseTo(32.76)
  expect(body.height).toBeCloseTo(crouch ? 26.9568 : 54.6)
  expect(body.left).toBeCloseTo(sprite.x - halfWidth)
  expect(body.right).toBeCloseTo(sprite.x + halfWidth)
  expect(body.bottom).toBeCloseTo(616)
  expect(body.offset.x).toBe(43)
  expect(body.offset.y).toBe(crouch ? 80 : 58)
})

test('original catalog hash survives only the explicit seal, shaft, NPC, access and ward changes', () => {
  const accessIds = new Set([
    'captain-order-two-step', 'captain-moonwell-step-a', 'captain-moonwell-step-b',
    'captain-moonwell-coin65-recovery', 'captain-moonwell-east-low', 'captain-moonwell-east-high',
    'captain-inner-order-step',
  ])
  expect(level.platforms.filter(platform => accessIds.has(platform.id))).toHaveLength(7)
  const npcPlacements: Record<string, { before: number[]; after: number[] }> = {
    'captain-sentry-outer': { before: [1040, 900, 1320], after: [1280, 1250, 1380] },
    'captain-archer-signal': { before: [4100, 4100, 4100], after: [4280, 4280, 4280] },
    'captain-grenadier-barracks': { before: [10000, 9880, 10340], after: [10280, 10240, 10360] },
    'captain-rival-moonwell': { before: [13300, 13100, 13540], after: [13520, 13420, 13560] },
    'captain-grenadier-span': { before: [15520, 15360, 15780], after: [15750, 15700, 15860] },
  }
  const shafts: Record<string, { before: number; after: number }> = {
    'captain-lift-signal': { before: 3180, after: 2980 },
    'captain-lift-banner-a': { before: 7160, after: 6900 },
    'captain-lift-banner-b': { before: 8000, after: 7700 },
    'captain-lift-moonwell': { before: 11700, after: 12010 },
  }
  const before = {
    ...level,
    platforms: level.platforms.filter(platform => !accessIds.has(platform.id)),
    shieldPickups: level.shieldPickups!.filter(pickup => {
      if (pickup.id !== 'captain-shield-murder-bridge') return true
      expect(pickup).toEqual({ id: pickup.id, x: 5600, y: 558, durationMs: 9000, guardCharges: 4, scoreValue: 0 })
      return false
    }).map(pickup => {
      if (pickup.id !== 'captain-shield-span') return pickup
      expect(pickup).toEqual({ id: pickup.id, x: 13540, y: 558, durationMs: 10000, guardCharges: 5, scoreValue: 130 })
      return { ...pickup, x: 13760, y: 548 }
    }),
    sunsteelEdgePickups: level.sunsteelEdgePickups!.filter(pickup => pickup.id !== 'captain-sunsteel-moonwell-order'),
    tiltPlatforms: level.tiltPlatforms!.map(bridge => {
      if (bridge.id !== 'captain-tilt-moonwell') return bridge
      expect(bridge.width).toBe(290)
      return { ...bridge, width: 260 }
    }),
    encounters: level.encounters!.map(item => item.id === encounter.id ? { ...item, width: 1500 } : item),
    enemies: level.enemies!.map(enemy => {
      const placement = npcPlacements[enemy.id]
      if (!placement) return enemy
      expect([enemy.x, enemy.patrolLeft, enemy.patrolRight]).toEqual(placement.after)
      const [x, patrolLeft, patrolRight] = placement.before
      return { ...enemy, x, patrolLeft, patrolRight }
    }),
    movingPlatforms: level.movingPlatforms!.map(lift => {
      const shaft = shafts[lift.id]
      if (!shaft) return lift
      expect(lift.x).toBe(shaft.after)
      return { ...lift, x: shaft.before }
    }),
  }
  const structural = Object.fromEntries(Object.entries(before).filter(([key]) => ![
    'backgroundAsset', 'subtitle', 'objective', 'introLine', 'completionLine',
  ].includes(key)))
  expect(createHash('sha256').update(JSON.stringify(structural)).digest('hex'))
    .toBe('ebe7eee40c5d64ff7559cb1bae041430a9a3d4fb18068c6983e4a7e1251405a7')
  expect(encounter).toMatchObject({ x: 9100, y: 180, width: 2200, height: 550, sealed: true })
})

test('recovered wide grenadier frames keep the body centered, including the full supported right patrol limit', () => {
  const enemy = level.enemies!.find(item => item.id === 'captain-grenadier-barracks')!
  const runtime = SHADOW_RUNNER_ENEMY_RUNTIME[enemy.kind]
  expect(runtime.frameWidth).toBe(256)
  expect(runtime.frameSize ?? 128).toBe(128)
  const body = enemyBodyAt(enemy, enemy.patrolRight)
  expect((body.left + body.right) / 2).toBeCloseTo(enemy.patrolRight)
  expect(body.center.x).toBeCloseTo(body.left + Math.floor(body.width / 2))
  const floor = level.platforms.find(rect => rect.y === 616 && body.left >= rect.x && body.right <= rect.x + rect.width)!
  expect(floor).toBeDefined()
  // The former square-frame fixture shifted the body right by 64 source pixels.
  const oldRight = body.right + (runtime.frameWidth! - (runtime.frameSize ?? 128)) / 2 * runtime.scale
  expect(oldRight).toBeGreaterThan(floor.x + floor.width)
})

test('actual scene barrier moves 700px from the 11px overlap lip onto a broad existing floor', () => {
  const before = fixture(1500).barriers[1]
  const after = fixture().barriers[1]
  expect({ x: before.x, right: before.right, top: before.top, bottom: before.bottom })
    .toEqual({ x: 10551, right: 10581, top: 180, bottom: 722 })
  expect({ x: after.x, right: after.right, top: after.top, bottom: after.bottom })
    .toEqual({ x: 11251, right: 11281, top: 180, bottom: 722 })
  const overlapOnlyBefore = before.left - halfWidth - (exitFloor.x - halfWidth)
  const fullySupportedBefore = before.left - halfWidth - (exitFloor.x + halfWidth)
  const fullySupportedAfter = after.left - halfWidth - (exitFloor.x + halfWidth)
  expect(overlapOnlyBefore).toBe(11)
  expect(fullySupportedBefore).toBeCloseTo(-21.76)
  expect(fullySupportedAfter).toBeCloseTo(678.24)
  expect(after.left).toBeGreaterThan(exitFloor.x)
  expect(after.right).toBeLessThan(exitFloor.x + exitFloor.width)
})

test('every required spawn and full patrol body is contained between the physical barriers', () => {
  const { barriers } = fixture()
  for (const id of encounter.enemyIds) {
    const enemy = level.enemies!.find(item => item.id === id)!
    for (const x of [enemy.x, enemy.patrolLeft, enemy.patrolRight]) {
      const body = enemyBodyAt(enemy, x)
      expect(body.left).toBeGreaterThan(barriers[0].right + 40)
      expect(body.right).toBeLessThan(barriers[1].left - 40)
      expect(body.top).toBeGreaterThan(barriers[1].top)
      expect(body.bottom).toBeLessThan(barriers[1].bottom)
      expect(level.platforms.some(rect => rect.y === 616 && body.left >= rect.x && body.right <= rect.x + rect.width)).toBe(true)
    }
  }
  const warden = level.enemies!.find(enemy => enemy.id === 'captain-warden-barracks')!
  const previousExit = fixture(1500).barriers[1]
  expect(enemyBodyAt(warden, warden.patrolLeft).left - previousExit.right).toBeCloseTo(14.7)
  expect(barriers[1].left - enemyBodyAt(warden, warden.patrolRight).right).toBeCloseTo(146.7)
})

test('both barrier footprints have continuous permanent floor for 240px on either side, with no new coin or route gaps', () => {
  const { barriers } = fixture()
  for (const barrier of barriers) {
    for (let x = barrier.left - 240; x <= barrier.right + 240; x += 1) {
      expect(level.platforms.some(rect => !rect.hidden && rect.y === 616 && x >= rect.x && x <= rect.x + rect.width)).toBe(true)
    }
  }
  for (const coin of level.coins.filter(coin => coin.x >= 10540 && coin.x <= 11300)) {
    expect(coin.y).toBe(548)
    expect(coin.x + 18).toBeLessThan(barriers[1].left)
  }
})

test.each([false, true])('both sides of both barriers leave 80px of full-body clearance, not a center-only exit slot (crouch %s)', crouch => {
  const { barriers } = fixture()
  const solids = [...level.platforms, ...(level.crouchGates ?? [])]
  const top = 616 - playerHeight(crouch)
  for (const barrier of barriers) {
    for (const direction of [-1, 1]) {
      const edge = direction < 0 ? barrier.left : barrier.right
      // The entire swept body fits within the clear band, including at the barrier face.
      for (const distance of [halfWidth, 40, 80 - halfWidth]) {
        const center = edge + direction * distance
        const left = center - halfWidth
        const right = center + halfWidth
        expect(solids.some(rect => left < rect.x + rect.width && right > rect.x
          && top < rect.y + rect.height && 616 > rect.y)).toBe(false)
        for (const footX of [left, center, right]) {
          expect(level.platforms.some(rect => !rect.hidden && rect.y === 616
            && footX >= rect.x && footX <= rect.x + rect.width)).toBe(true)
        }
      }
    }
  }
})

test.each([30, 60])('the exact 26.9568px crouch body traverses the 44px barracks tunnel and exits with room to stand (%s fps)', fps => {
  const r = fixture()
  const roof = level.crouchGates!.find(rect => rect.id === 'captain-crouch-barracks')!
  const body = r.playerAt(roof.x - 80, true)
  r.advance(3, fps, () => { body.setVelocityX(body.left < roof.x + roof.width + 40 ? 162 : 0) })
  expect(body.height).toBeCloseTo(26.9568)
  expect(616 - roof.y - roof.height - body.height).toBeCloseTo(17.0432)
  expect(body.left).toBeGreaterThanOrEqual(roof.x + roof.width + 40)
  expect(body.bottom).toBeCloseTo(616)
  expect(body.blocked.right).toBe(false)
  body.setSize(halfWidth * 2, playerHeight(false), false)
  body.position.y = 616 - body.height
  body.updateCenter()
  r.advance(0.2, fps, () => { body.setVelocityX(0) })
  expect(body.height).toBeCloseTo(54.6)
  expect(body.bottom).toBeCloseTo(616)
  expect(body.blocked.up).toBe(false)
})

test.each([30, 60])('ordinary delayed double jump lands fully on the warden floor and settles (%s fps)', fps => {
  const r = fixture()
  const body = r.playerAt(10380)
  let secondJump = false
  let crossedGap = false
  r.advance(2, fps, time => {
    body.setVelocityX(body.center.x < 10600 ? 260 : 0)
    if (time === 0) body.setVelocityY(-620)
    else if (!secondJump && time >= 0.35) { body.setVelocityY(-560); secondJump = true }
    if (body.left > 10420 && body.right < 10540) crossedGap = true
  })
  expect(crossedGap).toBe(true)
  expect(body.center.x).toBeGreaterThanOrEqual(10600)
  expect(body.center.x).toBeLessThan(10610)
  expect(body.left).toBeGreaterThan(exitFloor.x + 40)
  expect(body.bottom).toBeCloseTo(616)
  expect(body.blocked.down || body.touching.down).toBe(true)
  expect(body.blocked.right).toBe(false)
})

test.each([30, 60].flatMap(fps => [-1, 1].flatMap(direction => [
  { fps, direction, crouch: false, jump: false },
  { fps, direction, crouch: true, jump: false },
  { fps, direction, crouch: false, jump: true },
])))('active seal blocks bypass at both ends ($fps fps, direction $direction, crouch $crouch, jump $jump)', ({ fps, direction, crouch, jump }) => {
  const r = fixture()
  const body = r.playerAt(direction > 0 ? 11140 : 9200, crouch)
  const barrier = r.barriers[direction > 0 ? 1 : 0]
  let secondJump = false
  let crossedBarrier = false
  r.advance(2.5, fps, time => {
    crossedBarrier ||= direction > 0 ? body.right > barrier.left + 0.001 : body.left < barrier.right - 0.001
    body.setVelocityX(260 * direction)
    if (jump && time === 0) body.setVelocityY(-620)
    else if (jump && !secondJump && time >= 0.35) { body.setVelocityY(-560); secondJump = true }
  })
  expect(crossedBarrier).toBe(false)
  expect(direction > 0 ? body.right : body.left).toBeCloseTo(direction > 0 ? barrier.left : barrier.right)
  expect(body.bottom).toBeCloseTo(616)
  expect(direction > 0 ? body.blocked.right : body.blocked.left).toBe(true)
})

test.each([30, 60])('seal stays closed until all its enemies die, then crossing the floor seam works (%s fps)', fps => {
  const r = fixture()
  for (const id of encounter.enemyIds.slice(0, -1)) r.scene.state.enemies.find((enemy: any) => enemy.id === id).alive = false
  r.scene.updateEncounterBarriers()
  expect(r.barriers.every((body: any) => body.enable)).toBe(true)
  r.scene.state.enemies.find((enemy: any) => enemy.id === 'captain-warden-barracks').alive = false
  r.scene.updateEncounterBarriers()
  expect(r.barriers.every((body: any) => !body.enable)).toBe(true)
  expect(r.scene.clearedEncounterIds.has(encounter.id)).toBe(true)
  const body = r.playerAt(11140)
  r.advance(2, fps, () => { body.setVelocityX(260) })
  expect(body.center.x).toBeGreaterThan(11500)
  expect(body.bottom).toBeCloseTo(616)
  expect(body.blocked.right).toBe(false)
  expect(r.scene.state.enemies.find((enemy: any) => enemy.id === 'captain-archer-barracks').alive).toBe(true)
})
