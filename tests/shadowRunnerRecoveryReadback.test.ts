import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import { restoreShadowRunnerPlayer, spendShadowRunnerLife } from '../src/features/games/shadow-runner/game/simulation'

jest.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class { events = new (jest.requireActual('eventemitter3'))() },
    Game: class { constructor(public config: { scene: unknown[] }) {} },
    Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
    Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
  },
}))

const families = [
  ['boostPickups', 'boosts', 'collectBoost'],
  ['shieldPickups', 'shieldPickups', 'collectShield'],
  ['chronoPickups', 'chronoPickups', 'collectChrono'],
  ['surgePickups', 'surgePickups', 'collectSurge'],
  ['wraithlightPickups', 'wraithlightPickups', 'collectWraithlight'],
  ['mirrorWardPickups', 'mirrorWardPickups', 'collectMirrorWard'],
  ['galeMantlePickups', 'galeMantlePickups', 'collectGaleMantle'],
  ['sunsteelEdgePickups', 'sunsteelEdgePickups', 'collectSunsteelEdge'],
  ['dawnfireAegisPickups', 'dawnfireAegisPickups', 'collectDawnfireAegis'],
  ['aetherStepPickups', 'aetherStepPickups', 'collectAetherStep'],
] as const

type Snapshot = {
  collectedPowerIds: string[]
  movingPlatforms: Array<{ id: string; x: number; y: number; direction: number; paused: boolean; pauseRemainingMs: number }>
  player: { lives: number; checkpointRespawns: number; shieldActive: boolean }
}
const debugWindow = window as Window & { __shadowRunnerDebug?: () => Snapshot; __shadowRunnerQa?: unknown }

function sprite(name: string, collected: unknown = false) {
  const data = new Map<string, unknown>([['collected', collected]])
  return {
    name, x: 0, y: 0, active: true, visible: true, body: { enable: true },
    getData: jest.fn((key: string) => data.get(key)),
    setData(key: string, value: unknown) { data.set(key, value); return this },
    disableBody() { this.active = false; this.visible = false; this.body.enable = false; return this },
  }
}

function runtime(levelId: keyof typeof SHADOW_RUNNER_LEVEL_CONFIGS = 'level-10') {
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'),
    input: { current: createShadowRunnerInputState() }, levelId, onHudChange: jest.fn() })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  const completions: Array<() => void> = []
  scene.children = { length: 0 }
  scene.tweens = { getTweens: () => [], killTweensOf: jest.fn(),
    add: ({ onComplete }: { onComplete: () => void }) => completions.push(onComplete) }
  scene.textures = { exists: () => false }
  scene.player = { x: 112, y: 616 }
  for (const method of ['playSound', 'addCoinSparkle', 'addDustPuff', 'flashCamera', 'emitHud',
    'updateWraithlight', 'updateGaleMantleAura', 'updateSunsteelEdgeAura', 'updateDawnfireAegisAura',
    'updateAetherStepAura']) scene[method] = jest.fn()
  scene.registerQaDebugSnapshot()
  return { scene, completions, read: () => debugWindow.__shadowRunnerDebug!() }
}

beforeEach(() => { window.history.replaceState(null, '', '/?localPreview=shadow-runner') })
afterEach(() => {
  delete debugWindow.__shadowRunnerDebug
  delete debugWindow.__shadowRunnerQa
  window.history.replaceState(null, '', '/')
})

test('lift pause readback follows active time, expires to zero and cannot mutate the live timer', () => {
  const { scene, read } = runtime()
  const lift = { config: { id: 'relay-lift-choir' }, lastX: 11700, lastY: 310, direction: 1, pauseUntil: 1820 }
  scene.movingPlatforms = [lift]
  scene.activeTimeMs = 1000
  const first = read().movingPlatforms[0]
  expect(first).toMatchObject({ id: lift.config.id, paused: true, pauseRemainingMs: 820 })
  first.pauseRemainingMs = 5000
  expect(read().movingPlatforms[0].pauseRemainingMs).toBe(820)
  expect(lift.pauseUntil).toBe(1820)
  scene.activeTimeMs = 1170
  expect(read().movingPlatforms[0].pauseRemainingMs).toBe(650)
  scene.activeTimeMs = 1900
  expect(read().movingPlatforms[0]).toMatchObject({ paused: false, pauseRemainingMs: 0 })
})

test('reads all ten groups using strict collected flags and nonempty names, including disabled sprites', () => {
  const { scene, read } = runtime()
  const expected: string[] = []
  for (const [index, [group]] of families.entries()) {
    const collected = sprite(`collected-${group}`, true)
    if (index % 2 === 0) collected.disableBody()
    expected.push(collected.name)
    const children = [collected, sprite(`uncollected-${group}`), sprite('', true),
      sprite(`truthy-${group}`, 1), sprite(`string-${group}`, 'true'),
      sprite(`disabled-uncollected-${group}`).disableBody()]
    for (const item of children) { Object.freeze(item.body); Object.freeze(item) }
    scene[group] = { getChildren: () => Object.freeze(children) }
  }
  scene.moonShardPickups = { getChildren: () => [sprite('not-a-power', true)] }
  scene.objectivePickups = scene.moonShardPickups
  scene.masteryPickups = scene.moonShardPickups
  const first = read()
  expect(first.collectedPowerIds).toEqual(expected)
  expect(JSON.parse(JSON.stringify(first)).collectedPowerIds).toEqual(expected)
  first.collectedPowerIds[0] = 'mutated'
  first.collectedPowerIds.pop()
  expect(read().collectedPowerIds).toEqual(expected)
  expect(read().collectedPowerIds).not.toBe(read().collectedPowerIds)
})

test('returns a fresh empty array for absent or empty groups and reads collection changes afresh', () => {
  const { scene, read } = runtime()
  expect(read().collectedPowerIds).toEqual([])
  scene.boostPickups = { getChildren: () => [] }
  const item = sprite('changing')
  scene.shieldPickups = { getChildren: () => [item] }
  const before = read().collectedPowerIds
  item.setData('collected', true).disableBody()
  expect(read().collectedPowerIds).toEqual(['changing'])
  expect(before).toEqual([])
  item.setData('collected', false)
  expect(read().collectedPowerIds).toEqual([])
})

test.each(families)('%s records actual collection before and after the disabling tween', (group, configKey, handler) => {
  const level = Object.values(SHADOW_RUNNER_LEVEL_CONFIGS).find(candidate => candidate[configKey]?.length)
  expect(level).toBeDefined()
  const pickup = level![configKey]![0]
  const { scene, read, completions } = runtime(level!.id)
  const item = sprite(pickup.id)
  scene[group] = { getChildren: () => [item] }
  expect(read().collectedPowerIds).toEqual([])
  scene[handler](item)
  expect(item.getData('collected')).toBe(true)
  expect(item.active).toBe(true)
  expect(read().collectedPowerIds).toEqual([pickup.id])
  completions.forEach(complete => complete())
  expect(item.active).toBe(false)
  expect(item.body.enable).toBe(false)
  expect(read().collectedPowerIds).toEqual([pickup.id])
  const stateAfterCollection = JSON.stringify(scene.state)
  scene[handler](item)
  expect(JSON.stringify(scene.state)).toBe(stateAfterCollection)
  expect(completions).toHaveLength(1)
  scene.activeTimeMs = 1_000_000
  expect(read().collectedPowerIds).toEqual([pickup.id])
  if (group === 'shieldPickups') expect(read().player.shieldActive).toBe(false)
})

test('reads the numeric simulation respawn count without inferring it from health, checkpoint or pending state', () => {
  const { scene, read } = runtime()
  expect(read().player.checkpointRespawns).toBe(0)
  scene.activeCheckpointIndex = 0
  restoreShadowRunnerPlayer(scene.state)
  expect(read().player.checkpointRespawns).toBe(0)
  const initial = read()
  for (let count = 1; count <= 3; count += 1) {
    spendShadowRunnerLife(scene.state)
    scene.respawnPending = true
    expect(read().player.checkpointRespawns).toBe(count)
    scene.respawnPending = false
    restoreShadowRunnerPlayer(scene.state)
    const stateBeforeRead = JSON.stringify(scene.state)
    const snapshot = read()
    expect(snapshot.player.checkpointRespawns).toBe(count)
    expect(snapshot.player.lives).toBe(initial.player.lives - count)
    snapshot.player.checkpointRespawns = 999
    expect(read().player.checkpointRespawns).toBe(count)
    expect(JSON.stringify(scene.state)).toBe(stateBeforeRead)
  }
  expect(initial.player.checkpointRespawns).toBe(0)
})
