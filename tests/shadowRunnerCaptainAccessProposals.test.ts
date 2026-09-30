import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import { configureShadowRunnerPickupBody } from '../src/features/games/shadow-runner/game/runtimePickupBodies'
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
  Math: { Clamp: jest.requireActual('phaser/src/math/Clamp') },
} }))

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
const StaticGroup = jest.requireActual('phaser/src/physics/arcade/StaticPhysicsGroup')
const World = jest.requireActual('phaser/src/physics/arcade/World')
const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
const halfWidth = 16.38
const standingHeight = 54.6
const worlds: any[] = []
const reports: unknown[] = []
type Rect = { id: string; x: number; y: number; width: number; height: number }
type Step = { id: string; kind: 'move' | 'jump' | 'power' | 'wind-cycle'; x?: number; y?: number; fromY?: number; airJumpDelayMs?: number; riseBeforeMoveY?: number; viaX?: number; crouch?: boolean; power?: string; timeoutMs?: number }
type Plan = { id: string; start: { x: number; y: number }; proposals: Rect[]; steps: Step[]; coinIds?: number[]; order?: number; powerId?: string; movingLiftId?: string; windPhase?: number; powerPosition?: { x: number; y: number }; bobPhase?: number }
const intersects = (x: number, bottom: number, rect: Rect, height = standingHeight) => (
  x + halfWidth > rect.x + 0.0001 && x - halfWidth < rect.x + rect.width - 0.0001
  && bottom > rect.y + 0.0001 && bottom - height < rect.y + rect.height - 0.0001
)
const jump = (id: string, x: number, y: number, fromY: number): Step => ({ id, kind: 'jump', x, y, fromY, airJumpDelayMs: 350 })
const rise = (id: string, x: number, y: number, fromY: number): Step => ({ ...jump(id, x, y, fromY), riseBeforeMoveY: y - 6 })
const move = (id: string, x: number, y: number): Step => ({ id, kind: 'move', x, y })

// Evaluate the actual pure driver functions without importing its browser/CLI entrypoint into Jest.
function readJumpDriver() {
  const path = resolve('scripts/shadow-runner-route-proof.mjs')
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const printer = ts.createPrinter()
  const declarations = source.statements.filter(ts.isFunctionDeclaration)
    .filter(node => ['groundedAt', 'decideStep', 'decideRouteStep', 'demand'].includes(node.name?.text ?? ''))
  expect(declarations).toHaveLength(4)
  const text = declarations.map(node => printer.printNode(ts.EmitHint.Unspecified,
    ts.factory.updateFunctionDeclaration(node, undefined, node.asteriskToken, node.name, node.typeParameters,
      node.parameters, node.type, node.body), source)).join('\n')
  const powers = source.statements.filter(ts.isVariableStatement).find(node => node.declarationList.declarations
    .some(item => ts.isIdentifier(item.name) && item.name.text === 'POWER_READBACK_FIELDS'))!
  const constants = printer.printNode(ts.EmitHint.Unspecified,
    ts.factory.updateVariableStatement(powers, undefined, powers.declarationList), source)
  return runInNewContext(`${constants}\n${text}\n({ decideStep })`).decideStep as (
    step: Step, debug: unknown, memory: Record<string, unknown>, now: number,
  ) => { direction: number; crouch: boolean; jump: boolean; done: boolean }
}
let decideStep: ReturnType<typeof readJumpDriver>
beforeAll(() => { decideStep = readJumpDriver() })

const policyExports: any = {}
runInNewContext(ts.transpileModule(readFileSync(resolve('scripts/shadow-runner-captain-route-policies.mjs'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
}).outputText, { exports: policyExports })
const mastery = policyExports.CAPTAIN_ROUTE_POLICIES.find((policy: any) => policy.mode === 'mastery')
const normal = policyExports.CAPTAIN_ROUTE_POLICIES.find((policy: any) => policy.mode === 'normal')
// Accepted paths read live geometry; the explicit rejected-alternative cases can omit a shelf.
const proposalGeometry: Rect[] = mastery.configProposal.platformAdditions.map(({ id }: Rect) => {
  const actual = level.platforms.find(platform => platform.id === id)
  if (!actual) throw new Error(`Accepted Captain access platform is missing: ${id}`)
  return actual
})
const fixed = [...level.platforms.filter(rect => !proposalGeometry.some(access => access.id === rect.id)), ...(level.crouchGates ?? [])]
const proposedPowers = level.sunsteelEdgePickups!
afterEach(() => { worlds.splice(0).forEach(world => world.destroy()) })
afterAll(() => {
  if (process.env.SHADOW_RUNNER_CAPTAIN_ACCESS_AUDIT === '1') console.log(JSON.stringify({
    scope: 'Integrated live geometry. Installed Arcade, actual player/stance/jump/carry/wind, pickup overlaps/collectors and pure route inputs. Explicit rejected-alternative cases omit a shelf or reposition a power. No browser or full campaign/combat proof. Lift tests start supported, not proof of boarding from arbitrary phases.',
    reports: [...new Set(reports.map((result: any) => result.id))].map(id => {
      const samples = reports.filter((result: any) => result.id === id) as any[]
      const orders = samples.flatMap(result => result.collected ?? []).filter(item => item.id.startsWith('captain-order-'))
      return { id, samples: samples.length, failures: samples.filter(item => !item.complete || item.overlapFrames),
        maxElapsedMs: Math.max(...samples.map(item => item.elapsedMs)),
        minimumOrderMarginMs: orders.length ? Math.min(...orders.map(item => item.remainingMs)) : undefined }
    }),
  }, null, 2))
})

const plans: Plan[] = []
const acceptedShafts = [
  { id: 'captain-lift-signal', x: 2980, centerX: 3055, landingX: 3240, landingY: 300 },
  { id: 'captain-lift-banner-a', x: 6900, centerX: 6975, landingX: 7140, landingY: 320 },
  { id: 'captain-lift-banner-b', x: 7700, centerX: 7810, landingX: 7940, landingY: 240 },
  { id: 'captain-lift-moonwell', x: 12010, centerX: 12085, landingX: 11920, landingY: 300 },
]
// The tested geometry paths come from the candidate, so proposal tests cannot silently drift from its inputs.
for (const [id, first, last, startX, coinIds, order, powerId] of [
  ['order-two-and-under-coin', 'power-captain-sunsteel-barracks', 'mastery-banner-high-return', 9540, [45, 46], 2, 'captain-sunsteel-barracks'],
  ['order-four-and-under-coin', 'mastery-moonwell-step-a', 'mastery-moonwell-recovery-floor', 13040, [65, 66], 4, 'captain-sunsteel-moonwell-order'],
  ['moonwell-high-c', 'mastery-moonwell-east-low', 'mastery-moonwell-east-return-floor', 13720, [67], undefined, undefined],
  ['order-six', 'power-captain-sunsteel-arena', 'mastery-inner-high-b-return', 18300, [87, 88], 6, 'captain-sunsteel-arena'],
] as const) {
  const from = mastery.steps.findIndex((step: any) => step.id === first)
  const to = mastery.steps.findIndex((step: any) => step.id === last)
  const steps = mastery.steps.slice(from, to + 1).map((step: any) =>
    ['collect', 'relic'].includes(step.kind) ? { ...step, kind: 'move' } : step)
  plans.push({ id, start: { x: startX, y: 616 }, proposals: proposalGeometry, steps, coinIds: [...coinIds], order, powerId })
}
for (const proposal of acceptedShafts) {
  const authored = level.movingPlatforms!.find(lift => lift.id === proposal.id)!
  plans.push({ id: proposal.id, start: { x: proposal.centerX, y: authored.y },
    proposals: [...proposalGeometry, authored], movingLiftId: authored.id,
    steps: [move('ride', proposal.centerX, authored.endY), rise('high-ledge', proposal.landingX, proposal.landingY, authored.endY)] })
}

function fixture(plan: Plan, startOffset = 0) {
  const input = { current: createShadowRunnerInputState() }
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'), input,
    onHudChange: jest.fn(), levelId: level.id })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  const powers = proposedPowers.map(pickup => pickup.id === plan.powerId && plan.powerPosition ? { ...pickup, ...plan.powerPosition } : pickup)
  scene.level = { ...level, sunsteelEdgePickups: powers }
  scene.sys = { scale: { width: 960, height: 540 } }
  const world = new World(scene, { gravity: { x: 0, y: 1640 }, fps: 60, fixedStep: true })
  worlds.push(world)
  scene.physics = { world }
  scene.platforms = new StaticGroup(world, scene)
  const geometry = [...fixed, ...plan.proposals]
  const rectangles = geometry.map(config => {
    const object: any = {
      x: config.x + config.width / 2, y: config.y + config.height / 2,
      width: config.width, height: config.height, displayWidth: config.width, displayHeight: config.height,
      scaleX: 1, scaleY: 1, angle: 0, originX: 0.5, originY: 0.5,
      on() { return this }, off() { return this },
      setPosition(x: number, y: number) { this.x = x; this.y = y; return this },
      getTopLeft(point: any) { return point.set(this.x - this.width / 2, this.y - this.height / 2) },
    }
    object.body = new StaticBody(world, object)
    world.add(object.body)
    scene.platforms.add(object)
    return object
  })
  if (plan.movingLiftId) {
    const config = level.movingPlatforms!.find(lift => lift.id === plan.movingLiftId)!
    scene.movingPlatforms = [{ config, collider: rectangles[geometry.findIndex(rect => rect.id === config.id)],
      visual: { setPosition: jest.fn() }, visualOffsetY: 0, startX: config.x, startY: config.y,
      endX: config.x, endY: config.endY, direction: -1, pauseUntil: 0, lastX: config.x, lastY: config.y }]
  }
  const player: any = {
    x: plan.start.x + startOffset, y: plan.start.y, width: 128, height: 128, active: true, angle: 0,
    scaleX: 0.78, scaleY: 0.78, displayOriginX: 64, displayOriginY: 128,
    get displayWidth() { return this.width * this.scaleX },
    get displayHeight() { return this.height * this.scaleY },
    frame: { realWidth: 128, realHeight: 128 }, depth: 0,
    setScale(a: number, b = a) { this.scaleX = a; this.scaleY = b; return this },
    setDepth(depth: number) { this.depth = depth; return this },
    setSize(w: number, h: number) { this.body.setSize(w, h); return this },
    setOffset(a: number, b: number) { this.body.setOffset(a, b); return this },
    setVelocityX(v: number) { this.body.setVelocityX(v); return this },
    setVelocityY(v: number) { this.body.setVelocityY(v); return this },
    setX(x: number) { this.x = x; return this }, setFlipX() { return this },
  }
  const body = new Body(world, player)
  player.body = body
  body.setSize(42, 70).setOffset(43, 58)
  body.setMaxVelocity(360, 940).setDragX(1450)
  body.updateFromGameObject()
  world.add(body)
  scene.player = player
  scene.playSound = jest.fn()
  scene.addDustPuff = jest.fn()
  scene.updateHeroAnimation = jest.fn()
  scene.damagePlayerFromHazard = jest.fn(() => false)
  scene.handlePlayerFellOut = jest.fn()
  scene.addCoinSparkle = jest.fn()
  scene.flashCamera = jest.fn()
  scene.updateSunsteelEdgeAura = jest.fn()
  scene.emitHud = jest.fn()
  scene.tweens = { killTweensOf: jest.fn(), add: ({ onComplete }: any) => onComplete?.() }
  if (plan.windPhase !== undefined) scene.windZones = level.windZones!.map(config => ({ config,
    visual: Object.fromEntries(['clear', 'fillStyle', 'fillRect', 'lineStyle', 'beginPath', 'moveTo', 'lineTo', 'strokePath']
      .map(name => [name, jest.fn()])), telling: false, active: false }))
  world.addCollider(player, scene.platforms)
  const collected: { id: string; time: number; remainingMs: number }[] = []
  const pickups: any[] = []
  const addPickup = (config: { id: string; x: number; y: number }, radius: number, method: string) => {
    const data = new Map<string, unknown>()
    const object: any = { name: config.id, x: config.x, y: config.y, baseY: config.y, active: true,
      amplitude: method === 'collectCoin' ? 8 : method === 'collectSunsteelEdge' ? 12 : 0,
      duration: method === 'collectCoin' ? 900 : 640,
      delay: method === 'collectCoin' ? (Number(config.id.slice(5)) - 1) * 90
        : method === 'collectSunsteelEdge' ? powers.findIndex(pickup => pickup.id === config.id) * 170 : 0,
      width: 48, height: 48, displayWidth: 48, displayHeight: 48, scaleX: 1, scaleY: 1,
      getData(key: string) { return data.get(key) }, setData(key: string, value: unknown) { data.set(key, value); return this },
      setPosition(x: number, y: number) { this.x = x; this.y = y; return this },
      disableBody() { this.body.enable = false; this.active = false },
      getTopLeft(point: any) { return point.set(this.x - this.displayWidth / 2, this.y - this.displayHeight / 2) },
    }
    object.body = new StaticBody(world, object)
    configureShadowRunnerPickupBody(object, radius)
    world.add(object.body)
    world.addOverlap(player, object, () => {
      if (object.getData('collected')) return
      scene[method](object)
      if (object.getData('collected')) collected.push({ id: config.id, time: scene.activeTimeMs,
        remainingMs: scene.state.player.sunsteelEdgeActiveUntil - scene.activeTimeMs })
    })
    pickups.push(object)
  }
  plan.coinIds?.forEach(number => addPickup({ ...level.coins[number - 1], id: `coin-${number}` }, 16, 'collectCoin'))
  if (plan.powerId) addPickup(powers.find(pickup => pickup.id === plan.powerId)!, 19, 'collectSunsteelEdge')
  if (plan.order) addPickup(level.masteryPickups!.find(pickup => pickup.id === `captain-order-${plan.order}`)!, 19, 'collectMastery')
  const trace: any[] = []
  const frame = (time: number, fps: number) => {
    scene.activeTimeMs = time + (plan.windPhase ?? 0)
    scene.frameDeltaMs = 1000 / fps
    for (const pickup of pickups.filter(pickup => pickup.active)) {
      const tweenTime = Math.max(0, time + (plan.bobPhase ?? 0) - pickup.delay)
      pickup.y = pickup.baseY - pickup.amplitude / 2 + pickup.amplitude / 2 * Math.cos(tweenTime / pickup.duration * Math.PI)
      pickup.body.reset()
    }
    world.update(time, 1000 / fps)
    scene.updatePlayer(scene.activeTimeMs)
    scene.updateMovingPlatforms(scene.activeTimeMs)
    scene.updateWindZones(scene.activeTimeMs)
    world.postUpdate()
    trace.push({ time, x: player.x, foot: body.bottom, vy: body.velocity.y, jumps: scene.jumpsUsed,
      blockedUp: body.blocked.up, height: body.height, width: body.width,
      spriteFoot: player.y, liftY: scene.movingPlatforms[0]?.lastY,
      overlaps: geometry.filter(rect => rect.id !== plan.movingLiftId
        && body.right > rect.x + 0.0001 && body.left < rect.x + rect.width - 0.0001
        && body.bottom > rect.y + 0.0001 && body.top < rect.y + rect.height - 0.0001).map(rect => rect.id) })
  }
  return { input, scene, player, body, world, trace, frame, geometry, collected }
}

function execute(plan: Plan, fps: number, sampleMs: number, startOffset = 0) {
  const r = fixture(plan, startOffset)
  if (plan.windPhase === undefined) plan = { ...plan, steps: plan.steps.filter(step => step.kind !== 'wind-cycle') }
  const memories = plan.steps.map(() => ({}))
  let index = 0
  let nextSample = 0
  let time = 0
  r.frame(time, fps)
  const completed: { id: string; time: number }[] = []
  while (index < plan.steps.length && time < plan.steps.length * 3000) {
    if (time >= nextSample) {
      nextSample = time + sampleMs
      const action = decideStep(plan.steps[index], { player: {
        x: r.player.x, bodyBottom: r.body.bottom, velocityY: r.body.velocity.y,
        sunsteelEdgeActive: r.scene.state.player.sunsteelEdgeActiveUntil > r.scene.activeTimeMs && r.scene.state.player.sunsteelEdgeCharges > 0,
      }, windZones: r.scene.windZones.map((zone: any) => ({ id: zone.config.id, direction: zone.config.direction,
        telling: zone.telling, active: zone.active })) }, memories[index], time)
      if (time - Number((memories[index] as Record<string, unknown>).startedAt ?? time) > (plan.steps[index].timeoutMs ?? 12000)) break
      if (action.done) {
        completed.push({ id: plan.steps[index].id, time })
        index += 1
        r.input.current.left = false
        r.input.current.right = false
        r.input.current.crouch = Boolean(plan.steps[index]?.crouch)
        nextSample = time
      } else {
        r.input.current.left = action.direction < 0
        r.input.current.right = action.direction > 0
        r.input.current.crouch = action.crouch
        if (action.jump) r.input.current.jumpPresses += 1
      }
    }
    time += 1000 / fps
    r.frame(time, fps)
    if (r.scene.handlePlayerFellOut.mock.calls.length) break
  }
  const result = { id: plan.id, fps, sampleMs, startOffset, complete: index === plan.steps.length,
    failedStep: plan.steps[index]?.id, elapsedMs: time, completed,
    overlapFrames: r.trace.filter(t => t.overlaps.length).length,
    firstOverlap: r.trace.find(t => t.overlaps.length), minFoot: Math.min(...r.trace.map(t => t.foot)),
    ceilingFrames: r.trace.filter(t => t.blockedUp).length,
    damageCalls: r.scene.damagePlayerFromHazard.mock.calls,
    final: r.trace[r.trace.length - 1], jumpPresses: r.input.current.jumpPresses,
    collected: r.collected,
    maxSyncGap: Math.max(...r.trace.map(frame => Math.abs(frame.spriteFoot - frame.foot))),
    stanceHeights: [...new Set(r.trace.map(frame => Number(frame.height.toFixed(4))))],
  }
  r.world.destroy()
  worlds.splice(worlds.indexOf(r.world), 1)
  return result
}

test('proposed landing bands fit full standing bodies and leave the mandatory crouch roof unchanged', () => {
  for (const plan of plans) {
    const geometry = [...fixed, ...plan.proposals]
    for (const target of [plan.start, ...plan.steps]) {
      if (target.x === undefined || target.y === undefined) continue
      const { x: targetX, y: targetY } = target
      for (const dx of [-18, 0, 18]) {
        const x = targetX + dx
        expect({ plan: plan.id, target, dx, blocked: geometry.filter(rect => intersects(x, targetY, rect)).map(r => r.id) })
          .toEqual({ plan: plan.id, target, dx, blocked: [] })
        expect({ plan: plan.id, target, dx, supported: geometry.some(rect => rect.y === targetY
          && x - halfWidth >= rect.x && x + halfWidth <= rect.x + rect.width)
          || level.movingPlatforms!.some(lift => lift.id === plan.movingLiftId && targetY >= lift.endY && targetY <= lift.y
            && x - halfWidth >= lift.x && x + halfWidth <= lift.x + lift.width) })
          .toEqual({ plan: plan.id, target, dx, supported: true })
      }
    }
  }
  expect(level.crouchGates!.find(roof => roof.id === 'captain-crouch-moonwell')).toMatchObject({ x: 13080, y: 446, width: 280, height: 126 })
})

test.each([30, 60, 120])('Span west-apron fight inputs stay supported outside actual wind (%s fps)', fps => {
  const step = normal.steps.find((item: any) => item.id === 'fight-captain-pikeman-span')
  const wind = level.windZones!.find(zone => zone.id === 'captain-wind-span')!
  const enemy = level.enemies!.find(item => item.id === step.enemyId)!
  // Synthetic enemy observations exercise approach/wait/strike inputs, not combat or survival.
  for (const phase of [0, 650, 1630]) for (const sampleMs of [40, 80]) {
    const r = fixture({ id: 'span-west-apron', start: { x: 13540, y: 616 },
      proposals: proposalGeometry, steps: [], windPhase: phase })
    const memory = {}
    let nextSample = 0
    let attacks = 0
    let jumps = 0
    for (let time = 0; time < 4500; time += 1000 / fps) {
      if (time >= nextSample) {
        nextSample = time + sampleMs
        const action = decideStep(step, { player: { x: r.player.x, y: r.player.y, bodyBottom: r.body.bottom,
          velocityY: r.body.velocity.y }, enemies: [{ id: enemy.id, alive: true,
          x: time < 1500 ? 13791 : enemy.patrolLeft, y: 616 }] }, memory, time) as
          { direction: number; crouch: boolean; jump: boolean; attack: boolean; done: boolean }
        expect(action.done).toBe(false)
        r.input.current.left = action.direction < 0
        r.input.current.right = action.direction > 0
        r.input.current.crouch = action.crouch
        if (action.attack) attacks += 1
        if (action.jump) { jumps += 1; r.input.current.jumpPresses += 1 }
      }
      r.frame(time, fps)
    }
    expect(attacks).toBeGreaterThan(0)
    expect(jumps).toBe(0)
    expect(r.trace.every(frame => frame.x + halfWidth < wind.x && Math.abs(frame.foot - 616) < 0.001)).toBe(true)
    expect(r.trace.filter(frame => frame.overlaps.length)).toEqual([])
    expect(r.player.x).toBeGreaterThanOrEqual(step.minX - 0.000001)
    expect(r.player.x).toBeLessThanOrEqual(step.maxX + 0.000001)
    expect(r.scene.handlePlayerFellOut).not.toHaveBeenCalled()
    expect(r.scene.damagePlayerFromHazard).not.toHaveBeenCalled()
  }
})

test.each([30, 60])('Order4 access also runs across real Moonwell wind phases (%s fps)', fps => {
  const base = plans.find(plan => plan.order === 4)!
  for (const phase of [0, 650, 1610]) for (const sampleMs of [40, 80]) for (const offset of [-12, 0, 12]) {
    const result = execute({ ...base, id: `wind-order-four-${phase}`, windPhase: phase }, fps, sampleMs, offset)
    reports.push(result)
    expect(result).toMatchObject({ complete: true, overlapFrames: 0, damageCalls: [] })
    expect(result.collected.find(item => item.id === 'captain-order-4')?.remainingMs).toBeGreaterThan(5000)
    expect(result.collected.some(item => item.id === 'coin-65')).toBe(true)
    expect(result.maxSyncGap).toBeLessThan(0.0001)
  }
})

test.each([30, 60])('proposed access paths run with real ordinary jumps, sample jitter and no penetration (%s fps)', fps => {
  for (const plan of plans) for (const sampleMs of [40, 80]) for (const startOffset of [-12, 0, 12]) {
    const result = execute(plan, fps, sampleMs, startOffset)
    reports.push(result)
    expect({ id: result.id, sampleMs, startOffset, step: result.failedStep, complete: result.complete,
      overlapFrames: result.overlapFrames, damageCalls: result.damageCalls })
      .toEqual({ id: result.id, sampleMs, startOffset, step: undefined, complete: true, overlapFrames: 0, damageCalls: [] })
    expect(result.maxSyncGap).toBeLessThan(0.0001)
    for (const number of plan.coinIds ?? []) expect(result.collected.some(item => item.id === `coin-${number}`)).toBe(true)
    if (plan.order) {
      const collected = result.collected.find(item => item.id === `captain-order-${plan.order}`)
      expect({ plan: plan.id, sampleMs, startOffset, collected }).toMatchObject({ collected: { id: `captain-order-${plan.order}` } })
      // Keep an explicit observation/implementation reserve beyond the measured local geometry traversal.
      expect(collected!.remainingMs).toBeGreaterThanOrEqual(plan.order === 2 ? 1000 : 4000)
    }
  }
})

test('lift samples use the accepted shafts, never the obsolete relocation proposals', () => {
  for (const shaft of acceptedShafts) {
    expect(level.movingPlatforms!.find(lift => lift.id === shaft.id)!.x).toBe(shaft.x)
  }
})

test('the optional Moonwell Sunsteel grants finite power once without healing or score', () => {
  const r = fixture({ id: 'moonwell-order-power', start: { x: 12820, y: 370 },
    proposals: proposalGeometry, steps: [], powerId: 'captain-sunsteel-moonwell-order' })
  r.scene.state.player.health = 3
  r.scene.state.player.score = 125
  r.frame(100, 60)
  expect(r.collected.map(pickup => pickup.id)).toEqual(['captain-sunsteel-moonwell-order'])
  expect(r.scene.state.player).toMatchObject({ health: 3, score: 125,
    sunsteelEdgeCharges: 6, sunsteelEdgeActiveUntil: 9100 })
  r.frame(200, 60)
  expect(r.collected).toHaveLength(1)
  expect(r.scene.state.player).toMatchObject({ health: 3, score: 125,
    sunsteelEdgeCharges: 6, sunsteelEdgeActiveUntil: 9100 })
})

test.each([30, 60])('proposed shelves preserve the existing normal floor-gap jumps (%s fps)', fps => {
  const proposals = proposalGeometry
  for (const [x, landing] of [[8220, 8420], [12820, 13020]]) {
    const plan: Plan = { id: `normal-gap-${x}`, start: { x, y: 616 }, proposals,
      steps: [jump('normal-landing', landing, 616, 616)] }
    for (const sampleMs of [40, 80]) {
      const result = execute(plan, fps, sampleMs)
      reports.push(result)
      expect({ ...result, completed: undefined }).toMatchObject({ complete: true, overlapFrames: 0, damageCalls: [] })
    }
  }
})

test.each([30, 60])('the real stance keeps the Moonwell roof crouch-only and clears the proposed east aprons (%s fps)', fps => {
  const plan: Plan = { id: 'moonwell-roof-and-aprons', start: { x: 13040, y: 616 }, proposals: proposalGeometry,
    steps: [{ ...move('roof-entry', 13040, 616), crouch: true }, { ...move('roof-through', 13400, 616), crouch: true },
      move('east-aprons', 13720, 616)] }
  const result = execute(plan, fps, 80)
  expect(result).toMatchObject({ complete: true, overlapFrames: 0, damageCalls: [] })
  expect(result.stanceHeights).toEqual(expect.arrayContaining([54.6, 26.9568]))
  expect(result.maxSyncGap).toBeLessThan(0.0001)
})

test('all seven proposal slabs clear actual standing bodies, authored NPC patrol sweeps and bobbing pickup circles', () => {
  const r = fixture({ id: 'proposal-clearance', start: { x: 112, y: 616 }, proposals: proposalGeometry, steps: [] })
  for (const rect of proposalGeometry) {
    expect(rect.y + rect.height).toBeLessThan(616 - standingHeight)
    for (const roof of level.crouchGates!) expect(rect.x >= roof.x + roof.width || rect.x + rect.width <= roof.x
      || rect.y >= roof.y + roof.height || rect.y + rect.height <= roof.y).toBe(true)
  }
  expect(level.enemies).toHaveLength(28)
  for (const enemy of level.enemies!) {
    const runtime = SHADOW_RUNNER_ENEMY_RUNTIME[enemy.kind]
    const width = runtime.frameWidth ?? 128
    const object: any = { x: enemy.x, y: enemy.y, width, height: 128, angle: 0,
      scaleX: runtime.scale, scaleY: runtime.scale, displayOriginX: width / 2, displayOriginY: 128,
      get displayWidth() { return this.width * this.scaleX }, get displayHeight() { return this.height * this.scaleY } }
    const body = new Body(r.world, object)
    body.setSize(runtime.body.width, runtime.body.height).setOffset(runtime.body.offsetX, runtime.body.offsetY)
    for (let x = enemy.patrolLeft; x <= enemy.patrolRight + 1; x += 1) {
      object.x = Math.min(x, enemy.patrolRight)
      body.updateFromGameObject()
      expect(proposalGeometry.filter(rect => body.right > rect.x && body.left < rect.x + rect.width
        && body.bottom > rect.y && body.top < rect.y + rect.height).map(rect => rect.id)).toEqual([])
    }
  }
  const pickups = [...level.coins.map(coin => ({ ...coin, radius: 16 })),
    ...level.masteryPickups!.map(pickup => ({ ...pickup, radius: 19 })),
    ...proposedPowers.map(pickup => ({ ...pickup, radius: 19 }))]
  for (const pickup of pickups) for (const bob of [0, -4, -8]) for (const rect of proposalGeometry) {
    const nearestX = Math.max(rect.x, Math.min(pickup.x, rect.x + rect.width))
    const nearestY = Math.max(rect.y, Math.min(pickup.y + bob, rect.y + rect.height))
    expect({ id: pickup.id, rect: rect.id, clear: Math.hypot(pickup.x - nearestX, pickup.y + bob - nearestY) >= pickup.radius })
      .toEqual({ id: pickup.id, rect: rect.id, clear: true })
  }
})

test.each([30, 60])('ordinary side-turn controls do not establish a Coin45 side-drop route without the new shelf (%s fps)', fps => {
  for (const [startX, viaX] of [[7940, 7860], [8220, 8300]]) {
    const plan: Plan = { id: `unaccepted-coin45-side-turn-${viaX}`, start: { x: startX, y: 240 },
      proposals: proposalGeometry.filter(rect => rect.id !== 'captain-order-two-step'), coinIds: [45],
      steps: [{ ...jump('side-turn', 8032, 616, 240), viaX }] }
    const result = execute(plan, fps, 80)
    expect(result.collected.some(item => item.id === 'coin-45')).toBe(false)
    expect(result.complete).toBe(false)
    expect(result.overlapFrames).toBe(0)
  }
})

test.each([30, 60])('floor13040 cannot reliably reserve Sunsteel across first-pass pickup bob phases (%s fps)', fps => {
  const base = plans.find(plan => plan.order === 4)!
  const firstPass: Step[] = [jump('first-moonwell-gap', 13020, 616, 616),
    { ...move('first-roof-entry', 13040, 616), crouch: true }, { ...move('first-roof-exit', 13400, 616), crouch: true },
    move('first-rival-apron', 13520, 616), move('first-span-coins', 13840, 616),
    { ...move('return-roof-entry', 13400, 616), crouch: true }, { ...move('return-roof-exit', 13040, 616), crouch: true }]
  const early: number[] = []
  for (const phase of [0, 320, 640, 960]) {
    const result = execute({ ...base, id: `floor13040-bob-${phase}`, start: { x: 12820, y: 616 }, bobPhase: phase,
      powerId: 'captain-sunsteel-span', powerPosition: { x: 13040, y: 548 }, steps: [...firstPass, ...base.steps.filter(step => step.kind !== 'power')] }, fps, 80)
    expect(result.complete).toBe(true)
    const pickup = result.collected.find(item => item.id === 'captain-sunsteel-span')!
    const climb = result.completed.find(item => item.id === 'mastery-moonwell-step-a')!
    if (pickup.time < 1500) {
      early.push(phase)
      expect(climb.time - pickup.time).toBeGreaterThan(9000)
      expect(result.collected.some(item => item.id === 'captain-order-4')).toBe(false)
    }
    reports.push({ ...result, alternative: 'floor13040 reservation', pickupToClimbMs: climb.time - pickup.time })
  }
  expect(early.length).toBeGreaterThan(0)
})
