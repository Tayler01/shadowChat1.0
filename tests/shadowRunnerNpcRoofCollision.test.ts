import { createHash } from 'node:crypto'
import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_CONFIGS, getShadowRunnerLevelEnemies, type ShadowRunnerEnemyConfig } from '../src/features/games/shadow-runner/game/levels'
import { SHADOW_RUNNER_ENEMY_RUNTIME } from '../src/features/games/shadow-runner/game/runtimeCatalog'

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
  Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
  Math: { Clamp: jest.requireActual('phaser/src/math/Clamp') },
} }))

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
const StaticGroup = jest.requireActual('phaser/src/physics/arcade/StaticPhysicsGroup')
const World = jest.requireActual('phaser/src/physics/arcade/World')
const worlds: any[] = []
afterEach(() => { worlds.splice(0).forEach(world => world.destroy()) })

// Fingerprints captured before restaging, excluding ONLY the three authorized coordinates.
const cases = [
  { id: 'captain-sentry-outer', x: 1280, left: 1250, right: 1380, stats: '37f9e2c1b40e3ee2a5c3779617dab3a9d3da1fb9663a37be18ea209a53646dc0' },
  { id: 'captain-archer-signal', x: 4280, left: 4280, right: 4280, stats: '506f1971f202c8d985bf3c740ffce76346d750c676a92490e74b39bef7143e8c' },
  { id: 'captain-grenadier-barracks', x: 10280, left: 10240, right: 10360, stats: 'da04c3f95d496edfecd534eaf31c7d5b1724c9eda1eb8a25bcfd973c53909b7a' },
  { id: 'captain-rival-moonwell', x: 13520, left: 13420, right: 13560, stats: '42c2bdf767baee44377ab8909c002b4f090a94d45c9f222fc4cbde277df6af00' },
  { id: 'captain-grenadier-span', x: 15750, left: 15700, right: 15860, stats: '1392f2f7d5348fcaf592efbaab666127a0d23a2ba7f757058b14d78e1f425991' },
  { id: 'relay-caster-01', x: 4460, left: 4380, right: 4600, stats: '92a5e7de88a5b9a73fb1e828586f73933afddd4a3efe62d0fc19285001246090' },
  { id: 'relay-lancer-04', x: 13360, left: 13100, right: 13540, stats: '141e2e4b94371242fcd9f3cde7aa66ca596d375632cbc815faca8f49da3a876b' },
  { id: 'relay-grenadier-02', x: 17400, left: 17380, right: 17440, stats: 'fa07460fd9a1646c4b6d1e4b5e0879991bcc2898293cb1ce1b6dc203eede3042' },
  { id: 'relay-caster-06', x: 22420, left: 22380, right: 22480, stats: '9f7820e378b5623f6899a59086f17dd783879ba1970859a820586ccfe82c1b9e' },
  { id: 'relay-lancer-07', x: 22540, left: 22520, right: 22550, stats: '9ed21298e66e30b5faedf76d21f20071cbe01f3946540b5aaf9c53d1d702e595' },
]
function authored(id: string) {
  const level = SHADOW_RUNNER_LEVEL_CONFIGS[id.startsWith('captain-') ? 'level-9' : 'level-10']
  return { level, config: getShadowRunnerLevelEnemies(level).find(enemy => enemy.id === id)! }
}
type Rect = { id: string; x: number; y: number; width: number; height: number }
const overlaps = (body: any, rect: Rect) => body.right > rect.x + 0.0001 && body.left < rect.x + rect.width - 0.0001
  && body.bottom > rect.y + 0.0001 && body.top < rect.y + rect.height - 0.0001

function sprite(world: any, x: number, y: number, width: number, height: number) {
  const data = new Map<string, unknown>()
  const object: any = {
    x, y, width, height, active: true, angle: 0, scaleX: 1, scaleY: 1, depth: 0,
    displayOriginX: width / 2, displayOriginY: height / 2,
    displayWidth: width, displayHeight: height, frame: { realWidth: width, realHeight: height },
    anims: { currentAnim: null }, resets: 0,
    setName(name: string) { this.name = name; return this },
    setDepth(depth: number) { this.depth = depth; return this },
    setOrigin(a: number, b: number) { this.displayOriginX = width * a; this.displayOriginY = height * b; return this },
    setScale(a: number, b = a) { this.scaleX = a; this.scaleY = b; return this },
    setSize(w: number, h: number) { this.body.setSize(w, h); return this },
    setOffset(a: number, b: number) { this.body.setOffset(a, b); return this },
    setMaxVelocity(a: number, b: number) { this.body.setMaxVelocity(a, b); return this },
    setCollideWorldBounds(value: boolean) { this.body.setCollideWorldBounds(value); return this },
    setDragX(value: number) { this.body.setDragX(value); return this },
    setVelocity(a: number, b: number) { this.body.setVelocity(a, b); return this },
    setVelocityX(a: number) { this.body.setVelocityX(a); return this },
    setVelocityY(a: number) { this.body.setVelocityY(a); return this },
    setX(a: number) { this.x = a; return this },
    setPosition(a: number, b: number) { this.x = a; this.y = b; this.resets += 1; return this },
    setData(key: string, value: unknown) { data.set(key, value); return this },
    getData(key: string) { return data.get(key) },
    setAlpha() { return this }, setTint() { return this }, clearTint() { return this }, setFlipX() { return this },
    play(key: string) { this.anims.currentAnim = { key }; return this },
  }
  object.body = new Body(world, object)
  world.add(object.body)
  return object
}

// Rendering and projectile/damage delivery are spies. Actor creation, collider wiring,
// encounter activation, AI and Arcade separation execute their installed implementations.
function fixture(id: string) {
  const { level, config } = authored(id)
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'),
    input: { current: createShadowRunnerInputState() }, onHudChange: jest.fn(), levelId: level.id })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  scene.sys = { scale: { width: 960, height: 540 } }
  scene.cameras = { main: { scrollX: config.x - 480, width: 960 } }
  const world = new World(scene, { gravity: { x: 0, y: 1640 }, fps: 60, fixedStep: true })
  worlds.push(world)
  const colliders: { actor: any; group: any; collider: any }[] = []
  scene.physics = { world, add: {
    sprite(x: number, y: number, texture: string) {
      const runtime = Object.values(SHADOW_RUNNER_ENEMY_RUNTIME).find(value => value.textureKey === texture)
      return sprite(world, x, y, runtime?.frameWidth ?? runtime?.frameSize ?? 128, runtime?.frameSize ?? 128)
    },
    group: () => ({}), overlap: jest.fn(),
    collider(actor: any, group: any, ...args: any[]) {
      if (!actor.body) return
      const collider = world.addCollider(actor, group, ...args)
      colliders.push({ actor, group, collider })
      return collider
    },
  } }
  const decorative: any = { setDepth() { return this }, setVisible() { return this }, on() { return this } }
  scene.add = { graphics: () => decorative, image: () => decorative, sprite: () => decorative }
  scene.textures = { exists: () => false }
  scene.platforms = new StaticGroup(world, scene)
  scene.crouchGates = new StaticGroup(world, scene)
  scene.encounterBarriers = new StaticGroup(world, scene)
  const rectangle = (rect: Rect, group: any) => {
    const object: any = { name: rect.id, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
      width: rect.width, height: rect.height, displayWidth: rect.width, displayHeight: rect.height,
      scaleX: 1, scaleY: 1, angle: 0, originX: 0.5, originY: 0.5,
      on() { return this }, off() { return this },
      getTopLeft(point: any) { return point.set(this.x - this.width / 2, this.y - this.height / 2) },
    }
    object.body = new StaticBody(world, object)
    world.add(object.body)
    group.add(object)
  }
  level.platforms.forEach(rect => rectangle(rect, scene.platforms))
  level.crouchGates?.forEach(rect => rectangle(rect, scene.crouchGates))
  scene.createActors()
  const enemy = scene.enemies.find((actor: any) => actor.name === id)
  for (const actor of scene.enemies) if (actor !== enemy) actor.body.enable = false
  scene.enemies = [enemy]
  scene.player.body.enable = false
  const state = scene.state.enemies.find((item: any) => item.id === id)
  enemy.body.updateFromGameObject()
  scene.createStormBomb = jest.fn()
  scene.createRelayOrbs = jest.fn()
  scene.createArcherProjectile = jest.fn()
  const setTarget = (x: number, y = 616) => {
    scene.player.x = x; scene.player.y = y; scene.player.body.updateFromGameObject()
  }
  setTarget(-10000, -10000)
  const geometry = [...level.platforms, ...(level.crouchGates ?? [])]
  const trace: any[] = []
  let time = 2000
  const frame = (fps: number) => {
    time += 1000 / fps
    scene.activeTimeMs = time
    world.update(time, 1000 / fps)
    scene.updateEncounterActivations(time)
    scene.updateEnemies(time)
    world.postUpdate()
    trace.push({ time, x: enemy.x, bottom: enemy.body.bottom, left: enemy.body.left, right: enemy.body.right,
      vx: enemy.body.velocity.x, enabled: enemy.body.enable, blockedLeft: enemy.body.blocked.left,
      blockedRight: enemy.body.blocked.right, grounded: enemy.body.blocked.down || enemy.body.touching.down,
      direction: state.direction, attackUntil: state.attackUntil, lastShotAt: state.lastShotAt,
      animation: enemy.anims.currentAnim?.key, overlaps: geometry.filter(rect => overlaps(enemy.body, rect)).map(rect => rect.id) })
  }
  const run = (ms: number, fps: number) => { for (let i = 0; i < Math.round(ms * fps / 1000); i += 1) frame(fps) }
  const activate = () => {
    if (config.encounterId) {
      const encounter = level.encounters!.find(item => item.id === config.encounterId)!
      setTarget(encounter.x + 30)
      scene.updateEncounterActivations(time)
    }
    expect(state.activated).toBe(true)
    expect(enemy.body.enable).toBe(true)
    setTarget(-10000, -10000)
  }
  const positionForControl = (x: number, y = config.y) => {
    enemy.x = x; enemy.y = y
    enemy.body.updateFromGameObject()
    enemy.body.prev.copy(enemy.body.position)
    enemy.body.prevFrame.copy(enemy.body.position)
  }
  const close = () => { world.destroy(); worlds.splice(worlds.indexOf(world), 1) }
  return { scene, world, level, config, enemy, state, geometry, colliders, trace, frame, run, activate, setTarget,
    positionForControl, close }
}

function expectStable(r: ReturnType<typeof fixture>) {
  const enabled = r.trace.filter(sample => sample.enabled)
  expect(enabled.length).toBeGreaterThan(0)
  expect({ id: r.config.id, penetrations: enabled.filter(sample => sample.overlaps.length) })
    .toEqual({ id: r.config.id, penetrations: [] })
  expect(enabled.every(sample => Number.isFinite(sample.x) && Math.abs(sample.bottom - 616) < 0.0001)).toBe(true)
  expect(r.enemy.resets).toBe(0)
  expect(r.state.alive).toBe(true)
}

test('only authorized placement fields change; enemy counts and all ten combat contracts stay intact', () => {
  expect(getShadowRunnerLevelEnemies(SHADOW_RUNNER_LEVEL_CONFIGS['level-9'])).toHaveLength(28)
  expect(getShadowRunnerLevelEnemies(SHADOW_RUNNER_LEVEL_CONFIGS['level-10'])).toHaveLength(36)
  for (const expected of cases) {
    const { config } = authored(expected.id)
    const { x, patrolLeft, patrolRight, ...stats } = config
    expect({ x, patrolLeft, patrolRight }).toEqual({ x: expected.x, patrolLeft: expected.left, patrolRight: expected.right })
    expect(createHash('sha256').update(JSON.stringify(stats)).digest('hex')).toBe(expected.stats)
  }
})

test.each(cases)('$id has supported, nonembedded spawn/patrol and real activation/AI in both directions', ({ id }) => {
  for (const fps of [30, 60]) for (const direction of [-1, 1]) {
    const r = fixture(id)
    const { config, enemy, level } = r
    for (let x = config.patrolLeft; x <= config.patrolRight; x += 1) {
      r.positionForControl(x)
      expect(r.geometry.filter(rect => overlaps(enemy.body, rect))).toEqual([])
      expect(level.platforms.some(rect => Math.abs(rect.y - enemy.body.bottom) < 0.0001
        && enemy.body.left >= rect.x && enemy.body.right <= rect.x + rect.width)).toBe(true)
      if (config.encounterId) {
        const encounter = level.encounters!.find(item => item.id === config.encounterId)!
        expect(enemy.body.left).toBeGreaterThanOrEqual(encounter.x)
        expect(enemy.body.right).toBeLessThanOrEqual(encounter.x + encounter.width)
      }
    }
    r.positionForControl(config.x)
    if (config.encounterId) {
      expect(enemy.body.enable).toBe(false)
      r.run(300, fps)
      expect(enemy.x).toBe(config.x)
      expect(enemy.y).toBe(config.y)
      expect(r.state.activated).toBe(false)
    }
    r.activate()
    r.state.direction = direction
    r.run(4000, fps)
    expectStable(r)
    const patrol = r.trace.filter(sample => sample.enabled)
    if (config.kind !== 'tower-archer') {
      expect(patrol.some(sample => sample.direction === -1)).toBe(true)
      expect(patrol.some(sample => sample.direction === 1)).toBe(true)
    }
    r.setTarget(enemy.x + direction * 120)
    const combatStart = r.trace.length
    r.run(4000, fps)
    expectStable(r)
    if (config.kind !== 'clockwork-sentry') expect(r.state.lastShotAt).toBeGreaterThan(5000)
    if (config.kind !== 'clockwork-sentry') expect(r.trace.slice(combatStart)
      .some(sample => sample.attackUntil > sample.time && sample.direction === direction)).toBe(true)
    if (config.kind === 'storm-grenadier') expect(r.scene.createStormBomb).toHaveBeenCalled()
    if (config.kind === 'prism-caster') expect(r.scene.createRelayOrbs).toHaveBeenCalled()
    if (config.kind === 'tower-archer') expect(r.scene.createArcherProjectile).toHaveBeenCalled()
    r.close()
  }
})

test.each(['relay-lancer-04', 'relay-lancer-07'])('%s has room for the full attack from both outer patrol limits', id => {
  for (const fps of [30, 60]) for (const direction of [-1, 1]) {
    const r = fixture(id)
    r.activate()
    const x = direction < 0 ? r.config.patrolLeft : r.config.patrolRight
    r.positionForControl(x)
    r.setTarget(x + direction * 200)
    r.run(900, fps)
    expectStable(r)
    const firstAttack = r.trace.find(sample => sample.attackUntil > sample.time)!
    const firstStrike = r.trace.find(sample => sample.animation === 'relay-lancer-strike' && sample.vx === direction * 285)!
    expect(firstAttack.attackUntil - firstAttack.lastShotAt).toBeCloseTo(780, 8)
    expect(firstStrike.time - firstAttack.lastShotAt).toBeGreaterThanOrEqual(320)
    expect(firstStrike.time - firstAttack.lastShotAt).toBeLessThan(320 + 1000 / fps + 0.0001)
    expect(r.trace[r.trace.length - 1].time).toBeGreaterThan(firstAttack.attackUntil)
    expect(r.trace.every(sample => r.level.platforms.some(rect => rect.y === 616
      && sample.left >= rect.x && sample.right <= rect.x + rect.width))).toBe(true)
    r.close()
  }
})

test.each([
  { id: 'relay-lancer-04', roofId: 'relay-crouch-choir', strike: 'relay-lancer-strike' },
  { id: 'relay-lancer-07', roofId: 'relay-crouch-last', strike: 'relay-lancer-strike' },
  { id: 'captain-rival-moonwell', roofId: 'captain-crouch-moonwell', strike: 'rival-dash' },
])('$id full-duration charges separate at both roof walls; disabled collider reproduces penetration', ({ id, roofId, strike }) => {
  // Isolated contact controls, not authored spawn/reachability proof: place each real
  // actor eight pixels outside an actual roof, then let its unchanged attack run.
  for (const fps of [30, 60]) for (const direction of [-1, 1]) for (const collisionEnabled of [true, false]) {
    const r = fixture(id)
    r.activate()
    const roof = r.level.crouchGates!.find(rect => rect.id === roofId)!
    const roofCollider = r.colliders.find(item => item.actor === r.enemy && item.group === r.scene.crouchGates)!
    expect(roofCollider).toBeDefined()
    roofCollider.collider.active = collisionEnabled
    const halfWidth = r.enemy.body.width / 2
    const x = direction < 0 ? roof.x + roof.width + halfWidth + 8 : roof.x - halfWidth - 8
    r.positionForControl(x)
    r.setTarget(x + direction * 120)
    r.run(900, fps)
    expect(r.trace.some(sample => sample.animation === strike)).toBe(true)
    if (collisionEnabled) {
      expectStable(r)
      expect(r.trace.some(sample => direction < 0 ? sample.blockedLeft : sample.blockedRight)).toBe(true)
    } else expect(r.trace.some(sample => sample.overlaps.includes(roofId))).toBe(true)
    r.close()
  }
})

test('actual createActors excludes gearwing drones from floor and roof colliders and retains flight gravity policy', () => {
  const config: ShadowRunnerEnemyConfig = getShadowRunnerLevelEnemies(SHADOW_RUNNER_LEVEL_CONFIGS['level-10'])
    .find(enemy => enemy.kind === 'gearwing-drone')!
  const r = fixture(config.id)
  expect(r.colliders.filter(item => item.actor === r.enemy)).toEqual([])
  expect(r.enemy.body.allowGravity).toBe(false)
  r.close()
})

test('Lancer04 next-slab staging is explicit and still requires fresh combat/pacing proof', () => {
  const { level, config } = authored('relay-lancer-04')
  const oldSlab = level.platforms.find(rect => rect.id === 'relay-floor-13')!
  const newSlab = level.platforms.find(rect => rect.id === 'relay-floor-14')!
  expect(config.x).toBeGreaterThan(oldSlab.x + oldSlab.width)
  expect(config.patrolLeft).toBeGreaterThan(newSlab.x)
  expect(config.patrolRight).toBeLessThan(newSlab.x + newSlab.width)
  expect(config.encounterId).toBeUndefined()
})
