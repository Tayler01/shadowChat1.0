import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState, setShadowRunnerAction } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_CONFIGS, getShadowRunnerLevelEnemies, type ShadowRunnerLevelConfig } from '../src/features/games/shadow-runner/game/levels'
import { SHADOW_RUNNER_ENEMY_RUNTIME } from '../src/features/games/shadow-runner/game/runtimeCatalog'
import {
  blockShadowRunnerProjectileWithShield, collectShadowRunnerAetherStep, collectShadowRunnerBoost,
  collectShadowRunnerChrono, collectShadowRunnerDawnfireAegis, collectShadowRunnerGaleMantle,
  collectShadowRunnerMirrorWard, collectShadowRunnerShield, collectShadowRunnerSunsteelEdge,
  collectShadowRunnerSurge, collectShadowRunnerWraithlight, consumeShadowRunnerSunsteelCharge,
  damageShadowRunnerEnemy, getShadowRunnerHudState, getShadowRunnerSurgeSpeedMultiplier,
  reflectShadowRunnerProjectileWithMirrorWard, type ShadowRunnerSimulationState,
} from '../src/features/games/shadow-runner/game/simulation'

jest.mock('phaser/src/physics/arcade/ArcadeSprite', () => class {})
jest.mock('phaser/src/gameobjects/sprite/Sprite', () => class {})
jest.mock('phaser/src/device/CanvasFeatures', () => ({ supportInverseAlpha: true, supportNewBlendModes: true }))
jest.mock('phaser', () => ({ __esModule: true, default: {
  Scene: class { events = new (jest.requireActual('eventemitter3'))() },
  Game: class { constructor(public config: { scene: unknown[] }) {} },
  Physics: { Arcade: { Body: jest.requireActual('phaser/src/physics/arcade/Body') } },
  GameObjects: { Image: class {}, TileSprite: class {} },
  Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
  Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
  Loader: { Events: jest.requireActual('phaser/src/loader/events') },
  Math: { Clamp: jest.requireActual('phaser/src/math/Clamp') },
} }))

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
const StaticGroup = jest.requireActual('phaser/src/physics/arcade/StaticPhysicsGroup')
const World = jest.requireActual('phaser/src/physics/arcade/World')
const Enable = jest.requireActual('phaser/src/physics/arcade/components/Enable')
const levels = Object.values(SHADOW_RUNNER_LEVEL_CONFIGS)
const worlds: any[] = []
afterEach(() => { worlds.splice(0).forEach(world => world.destroy()) })

type Rect = { x: number; y: number; width: number; height: number }
const overlaps = (body: any, rect: Rect) => body.right > rect.x + 0.0001 && body.left < rect.x + rect.width - 0.0001
  && body.bottom > rect.y + 0.0001 && body.top < rect.y + rect.height - 0.0001

function actor(world: any, x: number, y: number, width = 128, height = 128) {
  const data = new Map<string, unknown>()
  const object: any = {
    x, y, width, height, active: true, visible: true, angle: 0, scaleX: 1, scaleY: 1,
    displayOriginX: width / 2, displayOriginY: height / 2,
    displayWidth: width, displayHeight: height, frame: { realWidth: width, realHeight: height },
    anims: { currentAnim: null },
    setName(name: string) { this.name = name; return this },
    setOrigin(a: number, b = a) { this.displayOriginX = width * a; this.displayOriginY = height * b; return this },
    setScale(a: number, b = a) { this.scaleX = a; this.scaleY = b; return this },
    setSize(w: number, h: number) { this.body.setSize(w, h); return this },
    setOffset(a: number, b: number) { this.body.setOffset(a, b); return this },
    setMaxVelocity(a: number, b: number) { this.body.setMaxVelocity(a, b); return this },
    setCollideWorldBounds(value: boolean) { this.body.setCollideWorldBounds(value); return this },
    setVelocity(a: number, b: number) { this.body.setVelocity(a, b); return this },
    setVelocityX(a: number) { this.body.setVelocityX(a); return this },
    setVelocityY(a: number) { this.body.setVelocityY(a); return this },
    setPosition(a: number, b: number) { this.x = a; this.y = b; return this },
    setX(a: number) { this.x = a; return this },
    getTopLeft(point: any) { return point.set(this.x - this.displayOriginX * this.scaleX, this.y - this.displayOriginY * this.scaleY) },
    setData(key: string, value: unknown) { data.set(key, value); return this },
    getData(key: string) { return data.get(key) },
    setActive(active: boolean) { this.active = active; return this },
    setVisible(visible: boolean) { this.visible = visible; return this },
    setDepth() { return this }, setAlpha() { return this }, setTint() { return this },
    clearTint() { return this }, setFlipX() { return this }, setFrame() { return this },
    play(key: string) { this.anims.currentAnim = { key }; return this },
    enableBody: Enable.enableBody, disableBody: Enable.disableBody,
  }
  object.body = new Body(world, object)
  world.add(object.body)
  return object
}

// Real actor/body reset, checkpoint activation, death, collection and barrier methods.
// Rendering/audio are stubs; a deterministic timer queue retains production delays.
// No enemy AI, moving/spectral support, damage overlaps, browser or route replay.
function fixture(level: ShadowRunnerLevelConfig) {
  const input = { current: createShadowRunnerInputState() }
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'), input, onHudChange: jest.fn(), levelId: level.id })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  scene.gameplayPaused = false
  scene.sys = { scale: { width: 960, height: 540 } }
  const world = new World(scene, { gravity: { x: 0, y: 1640 }, fps: 60, fixedStep: true })
  worlds.push(world)
  scene.physics = { world, add: { sprite(x: number, y: number, texture: string) {
    const runtime = Object.values(SHADOW_RUNNER_ENEMY_RUNTIME).find(value => value.textureKey === texture)!
    return actor(world, x, y, runtime.frameWidth ?? runtime.frameSize ?? 128, runtime.frameSize ?? 128)
  } } }
  scene.platforms = new StaticGroup(world, scene)
  scene.crouchGates = new StaticGroup(world, scene)
  scene.encounterBarriers = new StaticGroup(world, scene)
  const rectangle = (x: number, y: number, width: number, height: number) => {
    const data = new Map<string, unknown>()
    const object: any = { x, y, width, height, displayWidth: width, displayHeight: height,
      scaleX: 1, scaleY: 1, angle: 0, originX: 0.5, originY: 0.5, active: true,
      on() { return this }, off() { return this }, setDepth() { return this }, setRotation() { return this },
      setOrigin() { return this }, setAlpha() { return this }, setVisible() { return this }, clearTint() { return this },
      setActive(active: boolean) { this.active = active; return this },
      enableBody: Enable.enableBody, disableBody: Enable.disableBody,
      setData(key: string, value: unknown) { data.set(key, value); return this },
      getData(key: string) { return data.get(key) },
      getTopLeft(point: any) { return point.set(this.x - this.width / 2, this.y - this.height / 2) },
    }
    object.body = new StaticBody(world, object)
    world.add(object.body)
    return object
  }
  const addRect = (rect: Rect, group: any) => group.add(rectangle(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height))
  level.platforms.forEach(rect => addRect(rect, scene.platforms))
  level.crouchGates?.forEach(rect => addRect(rect, scene.crouchGates))
  scene.add = { rectangle, tileSprite: rectangle }
  scene.textures = { exists: () => false }
  scene.tweens = { killTweensOf: jest.fn(), add: jest.fn((options: any) => { options.onComplete?.(); return {} }) }
  const timers: { at: number; run: () => void }[] = []
  scene.activeTimeMs = 10000
  scene.time = { delayedCall: (delay: number, callback: (...args: any[]) => void, args: any[] = [], context?: any) => {
    timers.push({ at: scene.activeTimeMs + delay, run: () => callback.apply(context, args) })
  } }
  for (const key of ['playSound', 'addDustPuff', 'addCoinSparkle', 'addHitFlash', 'shakeCamera', 'flashCamera',
    'emitHud', 'showCheckpointToast', 'updateHeroAnimation']) scene[key] = jest.fn()
  scene.player = actor(world, level.playerStart.x, level.playerStart.y)
    .setOrigin(0.5, 1).setScale(0.78).setSize(42, 70).setOffset(43, 58)
  scene.player.body.setMaxVelocity(360, 940).setDragX(1450)
  scene.player.body.updateFromGameObject()
  scene.enemies = getShadowRunnerLevelEnemies(level).map(config => scene.createEnemySprite(config))
  // Enemies remain real bodies, but the sidecar advances only the player's physics.
  scene.enemies.forEach((enemy: any) => world.remove(enemy.body))
  for (const encounter of level.encounters?.filter(item => item.sealed) ?? []) {
    scene.createEncounterBarrier(encounter, encounter.x - 34)
    scene.createEncounterBarrier(encounter, encounter.x + encounter.width - 34)
  }
  world.addCollider(scene.player, scene.platforms)
  world.addCollider(scene.player, scene.crouchGates)
  world.addCollider(scene.player, scene.encounterBarriers)
  const place = (x: number, y: number) => {
    scene.player.setPosition(x, y)
    const body = scene.player.body
    body.updateFromGameObject()
    body.prev.copy(body.position); body.prevFrame.copy(body.position); body.autoFrame.copy(body.position)
  }
  const penetrations: { time: number; solids: Rect[] }[] = []
  const frame = (fps = 60) => {
    const delta = 1000 / fps
    scene.activeTimeMs += delta
    for (const timer of [...timers]) if (timer.at <= scene.activeTimeMs) {
      timers.splice(timers.indexOf(timer), 1); timer.run()
    }
    world.update(scene.activeTimeMs, delta)
    if (!scene.respawnPending && !scene.state.outOfLives) {
      scene.updatePlayer(scene.activeTimeMs)
      scene.updateArcherProjectiles(scene.activeTimeMs)
      scene.updateCandleHazards(scene.activeTimeMs)
    }
    world.postUpdate()
    if (scene.player.body.enable) {
      const solids = scene.getSolidBodies().map((body: any) => ({ x: body.left, y: body.top, width: body.width, height: body.height }))
        .filter((rect: Rect) => overlaps(scene.player.body, rect))
      if (solids.length) penetrations.push({ time: scene.activeTimeMs, solids })
    }
  }
  const run = (ms: number, fps = 60) => { for (let i = 0; i < Math.round(ms * fps / 1000); i += 1) frame(fps) }
  const checkpoint = (index: number) => {
    const point = level.checkpoints![index]
    // Enter the window, not its floating-point boundary; the saved spawn remains exact.
    place(point.x + 1, point.y)
    scene.updateCheckpointProgress()
    expect(scene.activeCheckpointIndex).toBe(index)
    expect(scene.respawnPoint).toEqual({ x: point.x, y: point.y })
  }
  const die = (kind: 'fall' | 'health' = 'fall') => {
    const lives = scene.state.player.lives
    if (kind === 'fall') scene.handlePlayerFellOut()
    else scene.damagePlayerFromHazard(scene.activeTimeMs + 1000, scene.player.x - 100, scene.state.player.maxHealth + 1)
    expect(scene.state.player.lives).toBe(lives - 1)
    expect(scene.respawnPending).toBe(true)
    expect(scene.player.body.enable).toBe(false)
    expect(scene.player.body.velocity.length()).toBe(0)
  }
  const kill = (id: string) => {
    const state = scene.state.enemies.find((enemy: any) => enemy.id === id)
    state.activated = true
    damageShadowRunnerEnemy(scene.state, scene.activeTimeMs + 1000, state.health, id, { bypassGuard: true })
    expect(state.alive).toBe(false)
    scene.defeatEnemy(scene.enemies.find((enemy: any) => enemy.name === id))
  }
  const pickup = (config: { id: string; x: number; y: number }) => {
    const object = actor(world, config.x, config.y).setName(config.id).setData('collected', false)
    object.body.setAllowGravity(false)
    return object
  }
  const close = () => { world.destroy(); worlds.splice(worlds.indexOf(world), 1) }
  return { scene, world, input, frame, run, checkpoint, place, die, kill, pickup, rectangle, timers, penetrations, close }
}

function liveResources(r: ReturnType<typeof fixture>, level: ShadowRunnerLevelConfig) {
  const projectile = r.pickup({ id: 'audit-in-flight-bomb', x: level.playerStart.x + 60, y: level.playerStart.y - 30 })
    .setData('spawnedAt', r.scene.activeTimeMs).setData('lifetimeMs', 2600)
    .setData('projectileKind', 'storm-bomb').setData('baseSpeedX', 0)
  const warning = { destroy: jest.fn() }
  projectile.setData('warningMarker', warning)
  const hazard = r.rectangle(level.playerStart.x + 60, level.playerStart.y, 70, 38)
    .setData('expiresAt', r.scene.activeTimeMs + 1250).setData('hazardKind', 'storm')
  r.scene.archerProjectiles = { getChildren: () => [projectile] }
  r.scene.candleHazards = new StaticGroup(r.world, r.scene)
  r.scene.candleHazards.add(hazard)
  return { projectile, warning, hazard }
}

const durable = (scene: any) => scene.state.enemies.map((enemy: any) => ({
  id: enemy.id, health: enemy.health, guard: enemy.guard, alive: enemy.alive,
}))
const geometry = (level: ShadowRunnerLevelConfig) => [...level.platforms, ...(level.crouchGates ?? [])]
const recoveryPoints = levels.flatMap(level => [
  { level, index: -1, point: level.playerStart },
  ...(level.checkpoints ?? []).map((point, index) => ({ level, point, index })),
])

test('campaign census covers eleven starts, fifty-one checkpoints, six sealed encounters and every mandatory pickup route', () => {
  expect(levels).toHaveLength(11)
  expect(recoveryPoints).toHaveLength(62)
  expect(levels.flatMap(level => level.encounters?.filter(item => item.sealed) ?? [])).toHaveLength(6)
  expect(levels.filter(level => level.objectivePickups?.length || level.moonShardPickups?.length).map(level => level.id))
    .toEqual(['level-7', 'level-8', 'level-9', 'level-10'])
})

test.each(levels)('$id restores control and finite lives at every actual checkpoint/start, from either prior stance', level => {
  const failures: unknown[] = []
  for (const entry of recoveryPoints.filter(item => item.level.id === level.id)) for (const wasCrouched of [false, true]) {
    const r = fixture(level)
    if (entry.index >= 0) r.checkpoint(entry.index)
    r.place(level.playerStart.x, level.playerStart.y)
    r.scene.setPlayerStance(wasCrouched)
    const enemyId = r.scene.state.enemies[0].id
    r.kill(enemyId)
    r.scene.collectCoin(r.pickup(level.coins[0]))
    const before = durable(r.scene)
    r.die(entry.index % 2 === 0 ? 'health' : 'fall')
    r.run(500)
    const body = r.scene.player.body
    const penetrating = geometry(level).filter(rect => overlaps(body, rect)).map(rect => rect.id)
    const support = level.platforms.some(rect => Math.abs(body.bottom - rect.y) < 0.001
      && body.left >= rect.x && body.right <= rect.x + rect.width)
    if (penetrating.length || !support || r.penetrations.length) failures.push({ point: entry.point.id, wasCrouched,
      body: { x: body.center.x, top: body.top, bottom: body.bottom, height: body.height }, penetrating, support,
      penetrationFrames: r.penetrations.length })
    expect(r.scene.respawnPending).toBe(false)
    expect(body.enable).toBe(true)
    expect(r.scene.state.player.lives).toBe(2)
    expect(r.scene.state.player.checkpointRespawns).toBe(1)
    expect(r.scene.state.player.health).toBe(r.scene.state.player.maxHealth)
    expect(r.scene.state.player.coins).toBe(1)
    expect(durable(r.scene)).toEqual(before)
    expect(r.scene.enemies.find((enemy: any) => enemy.name === enemyId).body.enable).toBe(false)
    const x = r.scene.player.x
    r.input.current.right = true
    r.run(80)
    expect(r.scene.player.x).toBeGreaterThan(x)
    r.close()
  }
  expect(failures).toEqual([])
})

test.each(levels)('$id exhausts the same three lives without checkpoint health restoration granting extra lives', level => {
  const r = fixture(level)
  for (const lives of [2, 1, 0]) {
    r.die()
    r.run(500)
    expect(r.scene.state.player.lives).toBe(lives)
    expect(r.scene.state.player.checkpointRespawns).toBe(3 - lives)
    if (lives > 0) {
      r.checkpoint(0)
      expect(r.scene.state.player.lives).toBe(lives)
    }
  }
  expect(r.scene.state.outOfLives).toBe(true)
  expect(r.scene.player.body.enable).toBe(false)
  expect(r.timers).toHaveLength(0)
  r.scene.respawnPlayer()
  expect(r.scene.player.body.enable).toBe(false)
  expect(r.scene.state.player.lives).toBe(0)
  r.close()
})

const seals = levels.flatMap(level => (level.encounters ?? []).filter(encounter => encounter.sealed)
  .map(encounter => ({ level, encounter })))
test.each(seals)('$encounter.id preserves partial kills and never relocks a cleared encounter across nearby checkpoints', ({ level, encounter }) => {
  const checkpoints = level.checkpoints ?? []
  const candidates = [
    [...checkpoints].reverse().find(point => point.x < encounter.x),
    checkpoints.find(point => point.x >= encounter.x && point.x < encounter.x + encounter.width),
    checkpoints.find(point => point.x >= encounter.x + encounter.width),
  ].filter((point): point is NonNullable<typeof point> => Boolean(point))
  for (const point of candidates) for (const phase of ['unstarted', 'partial', 'cleared']) {
    const r = fixture(level)
    r.checkpoint(checkpoints.indexOf(point))
    const members = r.scene.state.enemies.filter((enemy: any) => encounter.enemyIds.includes(enemy.id))
    if (phase !== 'unstarted') {
      r.place(encounter.x + 80, 616)
      r.scene.updateEncounterActivations(r.scene.activeTimeMs)
      if (phase === 'partial' && members.length > 1) r.kill(members[0].id)
      if (phase === 'cleared') members.forEach((enemy: any) => r.kill(enemy.id))
    }
    r.scene.updateEncounterBarriers()
    const before = durable(r.scene)
    r.die()
    r.run(500)
    expect(durable(r.scene)).toEqual(before)
    const barriers = r.scene.encounterBarrierRuntimes.filter((barrier: any) => barrier.encounterId === encounter.id)
    expect(barriers).toHaveLength(2)
    const inside = point.x >= encounter.x && point.x <= encounter.x + encounter.width
    const expectedActive = phase === 'partial' && inside
    expect(barriers.every((barrier: any) => barrier.active === expectedActive && barrier.collider.body.enable === expectedActive)).toBe(true)
    r.place(encounter.x + 80, 616)
    r.scene.updateEncounterActivations(r.scene.activeTimeMs)
    r.scene.updateEncounterBarriers()
    expect(barriers.every((barrier: any) => barrier.active === (phase !== 'cleared'))).toBe(true)
    if (phase === 'cleared') expect(r.scene.clearedEncounterIds.has(encounter.id)).toBe(true)
    for (const enemy of members.filter((item: any) => !item.alive)) {
      expect(r.scene.enemies.find((actor: any) => actor.name === enemy.id).body.enable).toBe(false)
    }
    r.close()
  }
})

test.each(levels.filter(level => level.objectivePickups?.length || level.moonShardPickups?.length))(
  '$id retains collected mandatory items without collecting the remaining ones or reopening their bodies', level => {
    for (const phase of ['none', 'partial', 'all']) {
      const r = fixture(level)
      const isObjective = Boolean(level.objectivePickups?.length)
      const configs = isObjective ? level.objectivePickups! : level.moonShardPickups!
      const items = configs.map(config => r.pickup(config))
      const count = phase === 'all' ? items.length : phase === 'none' ? 0 : Math.max(1, items.length - 1)
      for (const item of items.slice(0, count)) r.scene[isObjective ? 'collectObjective' : 'collectMoonShard'](item)
      const field = isObjective ? 'objectiveItems' : 'moonShards'
      const before = r.scene.state.player[field]
      r.checkpoint(level.checkpoints!.length - 1)
      r.die()
      r.run(500)
      expect(r.scene.state.player[field]).toBe(before)
      expect(before).toBe(count)
      for (const [index, item] of items.entries()) {
        expect(item.getData('collected')).toBe(index < count)
        expect(item.body.enable).toBe(index >= count)
      }
      // Isolate the mandatory-pickup gate from the independently tested kill requirement.
      for (const id of level.requiredEnemyIds ?? []) r.kill(id)
      r.place(level.finish.x + level.finish.width / 2, level.finish.y + level.finish.height)
      if (level.finishInteraction === 'ignite-relay') {
        r.run(100)
        expect(r.scene.player.body.blocked.down || r.scene.player.body.touching.down).toBe(true)
        expect(Math.abs(r.scene.player.body.velocity.y)).toBeLessThanOrEqual(24)
      }
      r.scene.checkFinish()
      if (level.finishInteraction === 'ignite-relay' && phase === 'all') {
        expect(r.scene.deliveryState).toBe('ready')
        expect(r.scene.state.defeated).toBe(false)
        expect(r.scene.state.player.masteryItems).toBe(0)
        setShadowRunnerAction(r.input.current, 'attack', false)
        setShadowRunnerAction(r.input.current, 'attack', true)
        r.scene.updatePlayer(r.scene.activeTimeMs)
        r.scene.checkFinish()
        expect(r.scene.deliveryState).toBe('igniting')
        expect(r.scene.state.defeated).toBe(false)
        setShadowRunnerAction(r.input.current, 'attack', false)
        r.scene.activeTimeMs += 1399
        r.scene.updateRelayDelivery()
        expect(r.scene.state.defeated).toBe(false)
        r.scene.activeTimeMs += 1
        r.scene.updateRelayDelivery()
        expect(r.scene.deliveryState).toBe('delivered')
        expect(r.scene.state.player.masteryItems).toBe(0)
      }
      expect(r.scene.state.defeated).toBe(phase === 'all')
      r.close()
    }
  },
)

const powerBudget = (state: ShadowRunnerSimulationState) => Object.fromEntries(Object.entries(state.player)
  .filter(([key]) => /^(boost|shield|chrono|surge|wraithlight|mirrorWard|galeMantle|sunsteel|dawnfire|aether)/.test(key)))

test.each(levels)('$id retains finite power deadlines and spent charges through death without refreshing them', level => {
  const r = fixture(level)
  const state: ShadowRunnerSimulationState = r.scene.state
  const time = r.scene.activeTimeMs
  // Use one actual authored pickup of each available family, not invented power defaults.
  if (level.boosts?.[0]) collectShadowRunnerBoost(state, time, level.boosts[0])
  if (level.shieldPickups?.[0]) collectShadowRunnerShield(state, time, level.shieldPickups[0])
  if (level.chronoPickups?.[0]) collectShadowRunnerChrono(state, time, level.chronoPickups[0])
  if (level.surgePickups?.[0]) collectShadowRunnerSurge(state, time, level.surgePickups[0])
  if (level.wraithlightPickups?.[0]) collectShadowRunnerWraithlight(state, time, level.wraithlightPickups[0])
  if (level.mirrorWardPickups?.[0]) collectShadowRunnerMirrorWard(state, time, level.mirrorWardPickups[0])
  if (level.galeMantlePickups?.[0]) collectShadowRunnerGaleMantle(state, time, level.galeMantlePickups[0])
  if (level.sunsteelEdgePickups?.[0]) collectShadowRunnerSunsteelEdge(state, time, level.sunsteelEdgePickups[0])
  if (level.dawnfireAegisPickups?.[0]) collectShadowRunnerDawnfireAegis(state, time, level.dawnfireAegisPickups[0])
  if (level.aetherStepPickups?.[0]) collectShadowRunnerAetherStep(state, time, level.aetherStepPickups[0])
  blockShadowRunnerProjectileWithShield(state, time)
  reflectShadowRunnerProjectileWithMirrorWard(state, time)
  consumeShadowRunnerSunsteelCharge(state, time)
  const budget = powerBudget(state)
  const beforeHud = getShadowRunnerHudState(state, level.coins.length, time)
  r.run(1200)
  for (const remainingLives of [2, 1]) {
    r.die()
    r.run(500)
    expect(state.player.lives).toBe(remainingLives)
    expect(powerBudget(state)).toEqual(budget)
    const hud = getShadowRunnerHudState(state, level.coins.length, r.scene.activeTimeMs)
    for (const [key, before] of Object.entries(beforeHud)) if (key.endsWith('RemainingMs')) {
      expect(hud[key as keyof typeof hud]).toBe(Math.max(0,
        Math.ceil((Number(budget[key.replace('RemainingMs', 'ActiveUntil')]) - r.scene.activeTimeMs) / 1000) * 1000))
      if (Number(before) > 0) expect(hud[key as keyof typeof hud]).toBeLessThan(Number(before))
    }
  }
  const lastDeadline = Math.max(...Object.entries(budget).filter(([key]) => key.endsWith('Until')).map(([, value]) => Number(value)))
  r.run(Math.max(0, lastDeadline - r.scene.activeTimeMs) + 100)
  const expired = getShadowRunnerHudState(state, level.coins.length, r.scene.activeTimeMs)
  for (const [key, value] of Object.entries(expired)) {
    if (key.endsWith('Active')) expect({ key, value }).toEqual({ key, value: false })
    if (key.endsWith('RemainingMs')) expect({ key, value }).toEqual({ key, value: 0 })
  }
  expect(expired).toMatchObject({ chronoTimeScale: 1, galeMantleSpeedMultiplier: 1, galeMantleFallDamageCap: null,
    sunsteelStrike: { attackDamageBonus: 0, guardDamage: 0, reachBonus: 0 },
    dawnfireAegis: { attackDamageBonus: 0, guardDamage: 0, damageResistanceMultiplier: 1 },
    aetherStepSpeedMultiplier: 1, aetherStepExtraAirJumps: 0, aetherStepPreventsFallDamage: false })
  expect(getShadowRunnerSurgeSpeedMultiplier(state, r.scene.activeTimeMs)).toBe(1)
  expect(powerBudget(state)).toEqual(budget)
  r.close()
})

test('death clears volatile projectiles/hazards before control resumes on every route', () => {
  const retained: unknown[] = []
  for (const level of levels) {
    const r = fixture(level)
    const { projectile, warning, hazard } = liveResources(r, level)
    r.die()
    r.run(500)
    if (projectile.body.enable || hazard.body.enable || !warning.destroy.mock.calls.length) retained.push({
      level: level.id, projectileEnabled: projectile.body.enable,
      hazardEnabled: hazard.body.enable, warningDestroyed: warning.destroy.mock.calls.length > 0 })
    r.close()
  }
  expect(retained).toEqual([])
})

test('resource fixture honors ordinary production expiry independently of the death-cleanup contract', () => {
  const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
  const r = fixture(level)
  const { projectile, warning, hazard } = liveResources(r, level)
  r.run(500)
  expect(projectile.body.enable).toBe(true)
  expect(hazard.body.enable).toBe(true)
  expect(warning.destroy).not.toHaveBeenCalled()
  r.run(900)
  expect(hazard.body.enable).toBe(false)
  expect(projectile.body.enable).toBe(true)
  r.run(1400)
  expect(projectile.body.enable).toBe(false)
  expect(warning.destroy).toHaveBeenCalledTimes(1)
  expect(projectile.getData('warningMarker')).toBeUndefined()
  r.run(100)
  expect(warning.destroy).toHaveBeenCalledTimes(1)
  r.close()
})
