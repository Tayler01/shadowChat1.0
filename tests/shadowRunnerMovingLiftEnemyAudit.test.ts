import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_CONFIGS, getShadowRunnerLevelEnemies, type ShadowRunnerLevelConfig, type ShadowRunnerEnemyConfig } from '../src/features/games/shadow-runner/game/levels'
import { SHADOW_RUNNER_ENEMY_RUNTIME } from '../src/features/games/shadow-runner/game/runtimeCatalog'

// StaticGroup's default sprite class is unused; avoid loading renderer/device detection in jsdom.
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
const reports: any[] = []
afterEach(() => { worlds.splice(0).forEach(world => world.destroy()) })
afterAll(() => {
  if (process.env.SHADOW_RUNNER_LIFT_AUDIT === '1') {
    const folder = resolve('output/shadow-runner')
    mkdirSync(folder, { recursive: true })
    writeFileSync(resolve(folder, 'moving-lift-enemy-audit.json'), JSON.stringify({
      scope: 'Installed Arcade World/Body/StaticBody/StaticGroup + actual scene enemy/lift/activation/AI methods. No player combat, input replay, browser, rendering or full-playthrough proof.',
      sourceHashes: Object.fromEntries([
        'createShadowRunnerPhaserGame.ts', 'runtimeCatalog.ts', 'levelNine.ts', 'levelTen.ts',
      ].map(file => [file, createHash('sha256').update(readFileSync(resolve('src/features/games/shadow-runner/game', file))).digest('hex')])),
      reports,
    }, null, 2))
  }
})

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

function enemyBounds(enemy: ShadowRunnerEnemyConfig) {
  const runtime = SHADOW_RUNNER_ENEMY_RUNTIME[enemy.kind]
  const height = runtime.frameSize ?? 128
  const width = runtime.frameWidth ?? height
  const object = sprite({ defaults: {}, add() {} }, enemy.x, enemy.y, width, height)
  object.setOrigin(0.5, 1).setScale(runtime.scale)
    .setSize(runtime.body.width, runtime.body.height).setOffset(runtime.body.offsetX, runtime.body.offsetY)
  object.body.updateFromGameObject()
  return object.body
}

function fixture(level: ShadowRunnerLevelConfig, enemyConfig: ShadowRunnerEnemyConfig) {
  const game = createShadowRunnerPhaserGame({
    parent: document.createElement('div'), input: { current: createShadowRunnerInputState() },
    onHudChange: jest.fn(), levelId: level.id,
  })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  scene.sys = { scale: { width: 960, height: 540 } }
  const world = new World(scene, { gravity: { x: 0, y: 1640 }, fps: 60, fixedStep: true })
  worlds.push(world)
  scene.physics = { world, add: { sprite(x: number, y: number, texture: string) {
    const runtime = Object.values(SHADOW_RUNNER_ENEMY_RUNTIME).find(value => value.textureKey === texture)!
    return sprite(world, x, y, runtime.frameWidth ?? runtime.frameSize ?? 128, runtime.frameSize ?? 128)
  } } }
  const group = new StaticGroup(world, scene)
  const rectangle = (config: { x: number; y: number; width: number; height: number }) => {
    const collider: any = {
      x: config.x + config.width / 2, y: config.y + config.height / 2,
      width: config.width, height: config.height, displayWidth: config.width, displayHeight: config.height,
      scaleX: 1, scaleY: 1, angle: 0, originX: 0.5, originY: 0.5,
      on() { return this }, off() { return this },
      setPosition(x: number, y: number) { this.x = x; this.y = y; return this },
      getTopLeft(point: any) { return point.set(this.x - this.width / 2, this.y - this.height / 2) },
    }
    collider.body = new StaticBody(world, collider)
    expect(collider.body.left).toBe(config.x)
    expect(collider.body.top).toBe(config.y)
    world.add(collider.body)
    group.add(collider)
    return collider
  }
  level.platforms.forEach(rectangle)
  // Match createLevel's static lift rectangle and runtime state; invoke the real motion method below.
  scene.movingPlatforms = (level.movingPlatforms ?? []).map(config => {
    const collider = rectangle(config)
    return {
      config, collider, visual: { setPosition() {} }, visualOffsetY: -10, startX: config.x, startY: config.y,
      endX: config.endX ?? config.x, endY: config.endY, direction: -1, pauseUntil: 0,
      lastX: config.x, lastY: config.y,
    }
  })
  const enemy = scene.createEnemySprite(enemyConfig)
  scene.enemies = [enemy]
  world.addCollider(enemy, group)
  scene.player = sprite(world, -10000, -10000, 128, 128)
  scene.player.setOrigin(0.5, 1).setSize(42, 70).setOffset(43, 58).setScale(0.78)
  scene.player.body.enable = false
  scene.player.body.updateFromGameObject()
  scene.createStormBomb = jest.fn()
  scene.addHitFlash = jest.fn()
  const state = scene.state.enemies.find((item: any) => item.id === enemyConfig.id)
  const trace: any[] = []
  const setTarget = (x: number, y: number) => {
    scene.player.x = x; scene.player.y = y; scene.player.body.updateFromGameObject()
  }
  let time = 0
  const frame = (fps: number) => {
    const delta = 1000 / fps
    time += delta
    scene.activeTimeMs = time
    scene.frameDeltaMs = delta
    world.update(time, delta)
    scene.updateMovingPlatforms(time)
    scene.updateEncounterActivations(time)
    scene.updateEnemies(time)
    world.postUpdate()
    const liftOverlaps = scene.movingPlatforms.filter((lift: any) => world.intersects(enemy.body, lift.collider.body)).map((lift: any) => lift.config.id)
    trace.push({ time, x: enemy.x, y: enemy.y, bottom: enemy.body.bottom, vy: enemy.body.velocity.y,
      enabled: enemy.body.enable, grounded: enemy.body.blocked.down || enemy.body.touching.down,
      embedded: enemy.body.embedded, resets: enemy.resets, liftOverlaps,
      lifts: scene.movingPlatforms.map((lift: any) => ({ id: lift.config.id, y: lift.lastY, direction: lift.direction, pauseUntil: lift.pauseUntil })),
    })
  }
  const run = (ms: number, fps: number) => { for (let i = 0; i < Math.round(ms / 1000 * fps); i += 1) frame(fps) }
  const close = () => { world.destroy(); worlds.splice(worlds.indexOf(world), 1) }
  return { scene, world, enemy, state, trace, frame, run, setTarget, close }
}

function liftCatalog(levels = Object.values(SHADOW_RUNNER_LEVEL_CONFIGS)) {
  return levels.flatMap(level => (level.movingPlatforms ?? []).map(lift => {
    const enemies = getShadowRunnerLevelEnemies(level).filter(enemy => enemy.kind !== 'gearwing-drone').flatMap(enemy => {
      const body = enemyBounds(enemy)
      const vertical = body.bottom > Math.min(lift.y, lift.endY) && body.top < Math.max(lift.y, lift.endY) + lift.height
      const half = body.width / 2
      const patrol = enemy.patrolRight + half > lift.x && enemy.patrolLeft - half < lift.x + lift.width
      if (!vertical || !patrol) return []
      return [{ id: enemy.id, kind: enemy.kind, encounterId: enemy.encounterId ?? null,
        spawnOverlap: body.right > lift.x && body.left < lift.x + lift.width,
        initialOverlap: body.right > lift.x && body.left < lift.x + lift.width && body.bottom > lift.y && body.top < lift.y + lift.height,
        body: { width: body.width, height: body.height, top: body.top, bottom: body.bottom },
      }]
    })
    return { levelId: level.id, lift, enemies }
  }))
}

test.each([30, 60, 120])('fallen enemies recover without carrying the falling frame into the floor (%s fps)', fps => {
  const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
  for (const id of ['captain-stalker-outer', 'captain-stalker-banner', 'captain-pikeman-murder']) {
    const config = getShadowRunnerLevelEnemies(level).find(enemy => enemy.id === id)!
    const r = fixture(level, config)
    Object.assign(r.state, { activated: true, health: 1 })
    r.enemy.body.enable = true
    r.frame(fps)
    r.enemy.y = level.worldHeight + 130
    r.enemy.body.updateFromGameObject()
    r.enemy.setVelocity(184, 920)
    r.frame(fps)
    expect(r.enemy.y).toBeCloseTo(config.y)
    expect(r.enemy.body.velocity.y).toBe(0)
    expect(r.state.health).toBe(1)
    expect(r.state.alive).toBe(true)
    expect(r.enemy.resets).toBe(1)
    r.run(3000, fps)
    expect(r.enemy.resets).toBe(1)
    expect(r.trace.slice(2).every(sample => Math.abs(sample.bottom - config.y) < 0.001)).toBe(true)
    expect(r.state.health).toBe(1)
    r.close()
  }
})

function summarize(r: ReturnType<typeof fixture>, start: number, fps: number) {
  const trace = r.trace.slice(start)
  let overlapRun = 0
  let longestOverlapRun = 0
  for (const sample of trace) {
    overlapRun = sample.liftOverlaps.length ? overlapRun + 1 : 0
    longestOverlapRun = Math.max(longestOverlapRun, overlapRun)
  }
  return {
    minX: Math.min(...trace.map(t => t.x)), maxX: Math.max(...trace.map(t => t.x)),
    minBottom: Math.min(...trace.map(t => t.bottom)), maxBottom: Math.max(...trace.map(t => t.bottom)),
    resets: r.enemy.resets, groundedFrames: trace.filter(t => t.grounded).length,
    embeddedFrames: trace.filter(t => t.embedded).length,
    liftOverlapFrames: trace.filter(t => t.liftOverlaps.length).length,
    longestLiftOverlapMs: longestOverlapRun * 1000 / fps,
    bombsReleased: r.scene.createStormBomb.mock.calls.length, frames: trace.length,
    final: trace[trace.length - 1], samples: trace.filter((_, index) => index % fps === 0),
  }
}

test('catalogs every campaign lift whose authored spawn or patrol intersects its swept collider', () => {
  const catalog = liftCatalog()
  reports.push({ catalog })
  expect(catalog).toHaveLength(13)
  expect(catalog.filter(item => item.levelId === 'level-10')).toHaveLength(8)
  const suspectIds = catalog.filter(item => item.levelId === 'level-10').flatMap(item => item.enemies.filter(enemy => enemy.initialOverlap).map(enemy => enemy.id))
  expect(suspectIds).toEqual(['relay-grenadier-01'])
})

test('explicit pre-restage and pre-shaft geometry still reproduces the original three overlap candidates', () => {
  // Coordinates preserved by output/shadow-runner/moving-lift-enemy-audit.json.
  // This is a historical candidate census, not a current trap or route assertion.
  const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
  const originalShafts: Record<string, number> = {
    'relay-lift-approach': 1220, 'relay-lift-prism': 3260, 'relay-lift-foundry': 7080,
    'relay-lift-choir': 12220, 'relay-lift-glass': 15180, 'relay-lift-crown': 17280,
    'relay-lift-lock': 19280, 'relay-lift-final': 23180,
  }
  const originalNpcs: Record<string, number[]> = {
    'relay-caster-01': [4180, 3980, 4520], 'relay-lancer-04': [12280, 12000, 12680],
    'relay-grenadier-02': [17180, 17000, 17640], 'relay-caster-06': [22180, 22000, 22640],
    'relay-lancer-07': [22580, 22000, 22700],
  }
  const historical: ShadowRunnerLevelConfig = { ...level,
    movingPlatforms: level.movingPlatforms!.map(lift => ({ ...lift, x: originalShafts[lift.id] })),
    enemies: level.enemies!.map(enemy => {
      if (!originalNpcs[enemy.id]) return enemy
      const [x, patrolLeft, patrolRight] = originalNpcs[enemy.id]
      return { ...enemy, x, patrolLeft, patrolRight }
    }),
  }
  const original = liftCatalog([historical]).flatMap(item => item.enemies.filter(enemy => enemy.initialOverlap).map(enemy => enemy.id))
  expect(original).toEqual(['relay-lancer-02', 'relay-grenadier-01', 'relay-lancer-04'])
})

test('all 13 lifts retain their exact speed, endpoints and pause deadline, but report zero static-body motion delta', () => {
  for (const level of Object.values(SHADOW_RUNNER_LEVEL_CONFIGS).filter(level => level.movingPlatforms?.length)) {
    const r = fixture(level, getShadowRunnerLevelEnemies(level)[0])
    r.scene.frameDeltaMs = 1000 / 60
    r.scene.updateMovingPlatforms(1000 / 60)
    for (const lift of r.scene.movingPlatforms) {
      expect(lift.lastY).toBeCloseTo(lift.config.y - lift.config.speed / 60)
      expect(lift.collider.body.top).toBeCloseTo(lift.lastY)
      expect(lift.collider.body.deltaY()).toBe(0)
      expect(lift.collider.body.velocity.y).toBe(0)
    }
    for (const lift of r.scene.movingPlatforms) {
      r.scene.movingPlatforms = [lift]
      let time = 1000 / 60
      while (lift.direction === -1 && time < 10000) {
        time += 1000 / 60
        r.scene.updateMovingPlatforms(time)
      }
      expect(lift.lastY).toBe(lift.config.endY)
      expect(lift.pauseUntil - time).toBeCloseTo(lift.config.pauseMs)
      r.scene.updateMovingPlatforms(lift.pauseUntil - 1)
      expect(lift.lastY).toBe(lift.config.endY)
      r.scene.updateMovingPlatforms(lift.pauseUntil)
      expect(lift.lastY).toBeCloseTo(lift.config.endY + lift.config.speed / 60)
    }
    r.close()
  }
})

test.each([30, 60])('records actual activation, patrol and collision behavior across lift phases (%s fps)', fps => {
  const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
  for (const id of ['relay-lancer-02', 'relay-grenadier-01', 'relay-lancer-04']) {
    const config = getShadowRunnerLevelEnemies(level).find(enemy => enemy.id === id)!
    for (const delay of config.encounterId ? [0, 1500, 3000, 4500, 6000, 10000, 15000] : [0]) {
      const r = fixture(level, config)
      r.run(delay, fps)
      const initiallyActive = r.state.activated
      if (config.encounterId) {
        expect(r.state.activated).toBe(false)
        expect(r.enemy.body.enable).toBe(false)
        expect(r.enemy.y).toBe(config.y)
        const encounter = level.encounters!.find(item => item.id === config.encounterId)!
        r.setTarget(encounter.x + 30, 616)
        r.frame(fps)
        expect(r.state.activated).toBe(true)
      } else expect(initiallyActive).toBe(true)
      r.setTarget(-10000, -10000)
      const start = r.trace.length
      r.run(18000, fps)
      const trace = r.trace.slice(start)
      const result = { scope: 'three flagged spawns, patrol phase sweep', id, fps, delay, initiallyActive, ...summarize(r, start, fps) }
      reports.push(result)
      expect(trace.every(t => Number.isFinite(t.x) && Number.isFinite(t.bottom))).toBe(true)
      expect(r.state.alive).toBe(true)
      expect(result.resets).toBe(0)
      expect(result.minBottom).toBeCloseTo(616)
      expect(result.maxBottom).toBeCloseTo(616)
      expect(result.groundedFrames).toBe(result.frames)
      expect(result.maxX - result.minX).toBeGreaterThan(350)
      r.close()
    }
  }
})

test.each([30, 60])('all intersecting campaign patrols run against moving lifts for four cycles (%s fps)', fps => {
  for (const entry of liftCatalog()) {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS[entry.levelId]
    for (const candidate of entry.enemies) {
      const config = getShadowRunnerLevelEnemies(level).find(enemy => enemy.id === candidate.id)!
      for (const delay of config.encounterId ? [0, 3000] : [0]) {
        const r = fixture(level, config)
        r.run(delay, fps)
        if (config.encounterId) {
          const encounter = level.encounters!.find(item => item.id === config.encounterId)!
          r.setTarget(encounter.x + 30, 616)
          r.frame(fps)
          expect(r.state.activated).toBe(true)
        }
        r.setTarget(-10000, -10000)
        const start = r.trace.length
        const oneCycle = 2 * (Math.hypot((entry.lift.endX ?? entry.lift.x) - entry.lift.x, entry.lift.endY - entry.lift.y) / entry.lift.speed * 1000 + entry.lift.pauseMs)
        r.run(oneCycle * 4 + 1000, fps)
        const result = { scope: 'all campaign lift-intersecting patrols', id: config.id, lift: entry.lift.id, fps, delay, ...summarize(r, start, fps) }
        reports.push(result)
        expect(result.resets).toBe(0)
        expect(result.maxBottom).toBeCloseTo(616)
        expect(result.maxX - result.minX).toBeGreaterThan(100)
        r.close()
      }
    }
  }
})

test.each([30, 60])('the three flagged enemies retain real attack timing through repeated lift passes (%s fps)', fps => {
  const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
  for (const id of ['relay-lancer-02', 'relay-grenadier-01', 'relay-lancer-04']) {
    const config = getShadowRunnerLevelEnemies(level).find(enemy => enemy.id === id)!
    for (const delay of config.encounterId ? [0, 3000, 6000] : [0]) {
      const r = fixture(level, config)
      r.run(delay, fps)
      r.setTarget(config.x - 120, 616)
      r.frame(fps)
      const start = r.trace.length
      r.run(18000, fps)
      const result = { scope: 'fixed nearby attack target; damage/projectiles excluded', id, fps, delay, ...summarize(r, start, fps) }
      reports.push(result)
      expect(r.state.activated).toBe(true)
      expect(r.state.lastShotAt).toBeGreaterThan(delay)
      expect(result.resets).toBe(0)
      expect(result.maxBottom).toBeCloseTo(616)
      if (config.kind === 'storm-grenadier') expect(result.bombsReleased).toBeGreaterThan(1)
      r.close()
    }
  }
})
