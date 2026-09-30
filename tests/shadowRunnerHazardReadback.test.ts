import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'

jest.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class { events = new (jest.requireActual('eventemitter3'))() },
    Game: class { constructor(public config: { scene: unknown[] }) {} },
    Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
    Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
  },
}))

const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
type FloorHazard = { kind: 'candle' | 'storm'; left: number; right: number; top: number; bottom: number }
type VisibleArrow = Omit<FloorHazard, 'kind'> & { velocityX: number; velocityY: number }
const qaWindow = window as Window & {
  __shadowRunnerDebug?: () => { floorHazards: FloorHazard[]; stormWarnings: Omit<FloorHazard, 'kind'>[];
    visibleArrows: VisibleArrow[]; player?: { bodyLeft: number; bodyRight: number } }
  __shadowRunnerQa?: unknown
}

function hazard(kind = 'candle', left = 150.25, top = 240.5) {
  const body = new StaticBody({ defaults: {} })
  body.position.set(left, top)
  body.width = 18.5
  body.height = 28.25
  return {
    active: true, visible: true, alpha: 1, cameraFilter: 0, body,
    // Deliberately unlike the collision body: never infer bounds from the artwork.
    x: -1000, y: -1000, displayWidth: 900, displayHeight: 900,
    kind,
    getData: jest.fn(function (this: { kind: string }, key: string) {
      if (key !== 'hazardKind') throw new Error(`Unexpected hazard read: ${key}`)
      return this.kind
    }),
  }
}

function runtime(hazards: ReturnType<typeof hazard>[] = []) {
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'),
    input: { current: createShadowRunnerInputState() }, levelId: 'level-9', onHudChange: jest.fn() })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  scene.children = { length: 0 }
  scene.tweens = { getTweens: () => [] }
  scene.textures = { exists: () => false }
  scene.cameras = { main: { id: 1, visible: true, alpha: 1,
    worldView: { left: 100, right: 400, top: 200, bottom: 500 } } }
  scene.candleHazards = {
    getChildren: () => hazards,
    countActive: () => hazards.filter(item => item.active).length,
    getLength: () => hazards.length,
  }
  scene.registerQaDebugSnapshot()
  return { scene, read: () => qaWindow.__shadowRunnerDebug!().floorHazards,
    warnings: () => qaWindow.__shadowRunnerDebug!().stormWarnings }
}

function warningRuntime() {
  const context = runtime()
  const bounds = { left: 150, right: 222, top: 240, bottom: 260 }
  const marker = { active: true, visible: true, alpha: 0.2, cameraFilter: 0, getBounds: jest.fn(() => bounds) }
  const projectile = { active: true, body: { enable: true }, kind: 'storm-bomb', marker: marker as typeof marker | null,
    getData(key: string) { return key === 'projectileKind' ? this.kind : key === 'warningMarker' ? this.marker : undefined } }
  context.scene.archerProjectiles = { getChildren: () => [projectile], countActive: () => Number(projectile.active), getLength: () => 1 }
  return { ...context, bounds, marker, projectile }
}

function arrowRuntime() {
  const context = runtime()
  const arrow: any = hazard('arrow')
  arrow.body.velocity = { x: -620, y: 0 }
  arrow.reflected = false
  arrow.getData = jest.fn((key: string) => key === 'projectileKind' ? arrow.kind : arrow.reflected)
  context.scene.archerProjectiles = { getChildren: () => [arrow], countActive: () => Number(arrow.active), getLength: () => 1 }
  return { ...context, arrow, arrows: () => qaWindow.__shadowRunnerDebug!().visibleArrows }
}

beforeEach(() => { window.history.replaceState(null, '', '/?localPreview=shadow-runner') })
afterEach(() => {
  delete qaWindow.__shadowRunnerDebug
  delete qaWindow.__shadowRunnerQa
  window.history.replaceState(null, '', '/')
})

test('visible arrow readback is detached, current collision geometry and velocity, not an emitter schedule', () => {
  const { arrow, arrows } = arrowRuntime()
  const first = arrows()
  expect(first).toEqual([{ left: 150.25, right: 168.75, top: 240.5, bottom: 268.75, velocityX: -620, velocityY: 0 }])
  first[0].left = -1
  expect(arrows()[0].left).toBe(150.25)
  arrow.body.velocity.x = -310
  arrow.body.position.x = 350
  expect(arrows()[0]).toMatchObject({ left: 350, velocityX: -310 })
  expect(arrow.getData.mock.calls.every(([key]: [string]) => ['projectileKind', 'reflectedByPlayer'].includes(key))).toBe(true)
})

test('arrow defense observes exact current player horizontal bounds without rounding or retained body references', () => {
  const { scene } = runtime()
  const body = { left: 183.62, right: 216.38, top: 561.4, bottom: 616, height: 54.6, velocity: { x: 0, y: 0 } }
  scene.player = { x: 200, y: 616, body }
  const first = qaWindow.__shadowRunnerDebug!().player!
  expect(first).toMatchObject({ bodyLeft: 183.62, bodyRight: 216.38 })
  body.left = 193.62
  body.right = 226.38
  expect(qaWindow.__shadowRunnerDebug!().player).toMatchObject({ bodyLeft: 193.62, bodyRight: 226.38 })
  expect(first).toMatchObject({ bodyLeft: 183.62, bodyRight: 216.38 })
})

test.each(['inactive', 'disabled', 'hidden', 'transparent', 'filtered', 'offscreen', 'empty', 'invalid',
  'invalid-velocity', 'missing-body', 'other-kind', 'reflected', 'hidden-camera', 'absent-camera'])(
  'excludes %s arrows from input-only observations', reason => {
    const { arrow, arrows, scene } = arrowRuntime()
    if (reason === 'inactive') arrow.active = false
    if (reason === 'disabled') arrow.body.enable = false
    if (reason === 'hidden') arrow.visible = false
    if (reason === 'transparent') arrow.alpha = 0
    if (reason === 'filtered') arrow.cameraFilter = 1
    if (reason === 'offscreen') arrow.body.position.x = 400
    if (reason === 'empty') arrow.body.width = 0
    if (reason === 'invalid') arrow.body.position.y = NaN
    if (reason === 'invalid-velocity') arrow.body.velocity.x = Infinity
    if (reason === 'missing-body') arrow.body = null
    if (reason === 'other-kind') arrow.kind = 'relay-orb'
    if (reason === 'reflected') arrow.reflected = true
    if (reason === 'hidden-camera') scene.cameras.main.visible = false
    if (reason === 'absent-camera') scene.cameras.main = undefined
    expect(arrows()).toEqual([])
  },
)

test('publishes only kind and exact installed Arcade collision bounds as detached JSON values', () => {
  const candle = hazard()
  const storm = hazard('storm', 300.75, 450.125)
  const { read } = runtime([candle, storm])
  Object.freeze(candle.body.position)
  Object.freeze(candle.body)
  Object.freeze(candle)
  const snapshot = read()
  expect(snapshot).toEqual([
    { kind: 'candle', left: 150.25, right: 168.75, top: 240.5, bottom: 268.75 },
    { kind: 'storm', left: 300.75, right: 319.25, top: 450.125, bottom: 478.375 },
  ])
  expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  snapshot[0].left = -999
  snapshot.pop()
  expect(read()).toHaveLength(2)
  expect(read()[0].left).toBe(150.25)
  expect(candle.getData.mock.calls.every(([key]) => key === 'hazardKind')).toBe(true)
})

test.each(['inactive', 'disabled', 'invisible', 'transparent', 'camera-filtered', 'missing-body', 'unknown-kind'])(
  'excludes %s pool entries', reason => {
    const item = hazard()
    if (reason === 'inactive') item.active = false
    if (reason === 'disabled') item.body.enable = false
    if (reason === 'invisible') item.visible = false
    if (reason === 'transparent') item.alpha = 0
    if (reason === 'camera-filtered') item.cameraFilter = 1
    if (reason === 'missing-body') item.body = null
    if (reason === 'unknown-kind') item.kind = 'future-hazard'
    expect(runtime([item]).read()).toEqual([])
  },
)

test.each([
  ['left', 81.5, 240], ['right', 400, 240], ['above', 150, 171.75], ['below', 150, 500],
  ['far-away', 9000, 9000],
])('excludes off-camera bodies including edge-only contact: %s', (_side, left, top) => {
  expect(runtime([hazard('candle', Number(left), Number(top))]).read()).toEqual([])
})

test('includes partially visible bodies without clipping and follows the current camera view', () => {
  const { scene, read } = runtime([hazard('storm', 90, 190)])
  expect(read()).toEqual([{ kind: 'storm', left: 90, right: 108.5, top: 190, bottom: 218.25 }])
  scene.cameras.main.worldView = { left: 3000, right: 3300, top: 200, bottom: 500 }
  expect(read()).toEqual([])
})

test.each(['absent', 'hidden', 'transparent'])('returns no hazards with an %s camera', state => {
  const { scene, read } = runtime([hazard()])
  if (state === 'absent') scene.cameras = undefined
  if (state === 'hidden') scene.cameras.main.visible = false
  if (state === 'transparent') scene.cameras.main.alpha = 0
  expect(read()).toEqual([])
})

test('reads current pooled kind/body after disable and reuse without caching or refreshing geometry', () => {
  const item = hazard()
  const { read } = runtime([item])
  const old = read()
  item.active = false
  item.visible = false
  item.body.enable = false
  expect(read()).toEqual([])
  item.kind = 'storm'
  item.body.position.set(350.5, 460.25)
  item.body.width = 34
  item.body.height = 20
  item.active = true
  item.visible = true
  item.body.enable = true
  expect(read()).toEqual([{ kind: 'storm', left: 350.5, right: 384.5, top: 460.25, bottom: 480.25 }])
  expect(old[0]).toEqual({ kind: 'candle', left: 150.25, right: 168.75, top: 240.5, bottom: 268.75 })
})

test('handles absent/empty pools and rejects non-serializable or empty collision rectangles', () => {
  const { scene, read } = runtime()
  expect(read()).toEqual([])
  scene.candleHazards = undefined
  expect(read()).toEqual([])
  const invalid = hazard()
  invalid.body.position.x = NaN
  const empty = hazard()
  empty.body.width = 0
  expect(runtime([invalid, empty]).read()).toEqual([])
})

test('warning readback uses only current visible marker geometry and stays detached across reuse', () => {
  const { warnings, read, bounds, projectile, marker } = warningRuntime()
  const first = warnings()
  expect(first).toEqual([{ left: 150, right: 222, top: 240, bottom: 260 }])
  expect(read()).toEqual([])
  first[0].left = -999
  expect(bounds.left).toBe(150)
  projectile.active = false
  expect(warnings()).toEqual([])
  expect(marker.getBounds).toHaveBeenCalledTimes(2)
  projectile.active = true
  bounds.left = 300
  bounds.right = 350
  expect(warnings()).toEqual([{ left: 300, right: 350, top: 240, bottom: 260 }])
  expect(marker.getBounds).toHaveBeenCalledTimes(3)
})

test.each(['inactive-projectile', 'disabled-projectile', 'other-projectile', 'missing-marker', 'inactive-marker',
  'hidden-marker', 'transparent-marker', 'filtered-marker', 'offscreen', 'empty', 'invalid', 'hidden-camera', 'absent-camera'])(
  'excludes %s grenade warnings', reason => {
    const { warnings, projectile, marker, scene, bounds } = warningRuntime()
    if (reason === 'inactive-projectile') projectile.active = false
    if (reason === 'disabled-projectile') projectile.body.enable = false
    if (reason === 'other-projectile') projectile.kind = 'arrow'
    if (reason === 'missing-marker') projectile.marker = null
    if (reason === 'inactive-marker') marker.active = false
    if (reason === 'hidden-marker') marker.visible = false
    if (reason === 'transparent-marker') marker.alpha = 0
    if (reason === 'filtered-marker') marker.cameraFilter = 1
    if (reason === 'offscreen') { bounds.left = 400; bounds.right = 472 }
    if (reason === 'empty') bounds.right = bounds.left
    if (reason === 'invalid') bounds.top = NaN
    if (reason === 'hidden-camera') scene.cameras.main.visible = false
    if (reason === 'absent-camera') scene.cameras = undefined
    expect(warnings()).toEqual([])
  },
)
