import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_NINE as level } from '../src/features/games/shadow-runner/game/levelNine'
import { collectShadowRunnerShield, blockShadowRunnerProjectileWithShield, createInitialShadowRunnerSimulation,
  damageShadowRunnerPlayer, isShadowRunnerShieldActive } from '../src/features/games/shadow-runner/game/simulation'

jest.mock('phaser', () => ({ __esModule: true, default: {
  Scene: class { events = new (jest.requireActual('eventemitter3'))() },
  Game: class { constructor(public config: { scene: unknown[] }) {} },
  Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
  Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
  Loader: { Events: jest.requireActual('phaser/src/loader/events') },
} }))

const shield = level.shieldPickups!.find(pickup => pickup.id === 'captain-shield-murder-bridge')!

test('the Span ward is fully reachable before entering its exposed volley corridor', () => {
  const ward = level.shieldPickups!.find(pickup => pickup.id === 'captain-shield-span')!
  const corridor = level.arrowVolleys!.find(volley => volley.id === 'captain-volley-span-head')!
  const floor = level.platforms.find(platform => platform.id === 'captain-moonwell-exit')!
  expect(ward).toEqual({ id: 'captain-shield-span', x: 13540, y: 558, durationMs: 10000, guardCharges: 5, scoreValue: 130 })
  expect(ward.x + 16.38 + 12).toBeLessThan(corridor.x)
  expect(ward.x - 16.38 - 12).toBeGreaterThan(floor.x)
  expect(ward.x + 16.38 + 12).toBeLessThan(floor.x + floor.width)
  for (let y = ward.y - 9; y <= ward.y; y++) {
    expect(y + 16).toBeGreaterThan(616 - 54.6)
    for (const solid of [...level.platforms, ...level.crouchGates!]) {
      expect(ward.x + 16 > solid.x && ward.x - 16 < solid.x + solid.width
        && y + 16 > solid.y && y - 16 < solid.y + solid.height).toBe(false)
    }
  }
})

test('the bridge ward is visible and collectable on supported floor throughout its bob', () => {
  expect(shield).toEqual({ id: 'captain-shield-murder-bridge', x: 5600, y: 558, durationMs: 9000, guardCharges: 4, scoreValue: 0 })
  const floor = level.platforms.find(platform => platform.id === 'captain-murder-hall')!
  expect(shield.x - 16.38 - 12).toBeGreaterThan(floor.x)
  expect(shield.x + 16.38 + 12).toBeLessThan(floor.x + floor.width)
  for (let y = shield.y - 9; y <= shield.y; y++) {
    expect(y + 16).toBeGreaterThan(616 - 54.6)
    expect(y - 16).toBeLessThan(616)
    for (const solid of [...level.platforms, ...level.crouchGates!]) {
      const overlap = shield.x + 16 > solid.x && shield.x - 16 < solid.x + solid.width
        && y + 16 > solid.y && y - 16 < solid.y + solid.height
      expect(overlap).toBe(false)
    }
  }
  expect(level.coins).toHaveLength(90)
  expect(level.enemies).toHaveLength(28)
  expect(level.objectivePickups).toHaveLength(4)
  expect(level.masteryPickups).toHaveLength(6)
})

test('the new ward is finite, gives no healing or pickup score, and blocks only four fresh projectiles', () => {
  const state = createInitialShadowRunnerSimulation(level)
  state.player.health = 5
  collectShadowRunnerShield(state, 1000, shield)
  expect(state.player.health).toBe(5)
  expect(state.player.score).toBe(0)
  for (let index = 0; index < 4; index++) expect(blockShadowRunnerProjectileWithShield(state, 1100 + index)).toBe(true)
  expect(blockShadowRunnerProjectileWithShield(state, 1200)).toBe(false)
  expect(state.player.shieldGuardCharges).toBe(0)
  expect(state.player.score).toBe(40) // Existing block rewards are not pickup points.
  expect(isShadowRunnerShieldActive(state, 10000)).toBe(false)
})

test('unused guard cannot block after expiry and damage without projectile interception still hurts', () => {
  const state = createInitialShadowRunnerSimulation(level)
  state.player.health = 5
  collectShadowRunnerShield(state, 1000, shield)
  expect(damageShadowRunnerPlayer(state, 1200, 3)).toBe(true)
  expect(state.player.health).toBe(2)
  expect(state.player.shieldGuardCharges).toBe(4)
  expect(blockShadowRunnerProjectileWithShield(state, 10000)).toBe(false)
})

test('earlier protection retains the existing max-charge and duration-stacking rules', () => {
  const state = createInitialShadowRunnerSimulation(level)
  collectShadowRunnerShield(state, 1000, level.shieldPickups![0])
  collectShadowRunnerShield(state, 2000, shield)
  expect(state.player.shieldActiveUntil).toBe(20000)
  expect(state.player.shieldGuardCharges).toBe(5)
  expect(state.player.score).toBe(120)
  const expired = createInitialShadowRunnerSimulation(level)
  collectShadowRunnerShield(expired, 1000, level.shieldPickups![0])
  collectShadowRunnerShield(expired, 12000, shield)
  expect(expired.player.shieldActiveUntil).toBe(21000)
  expect(expired.player.shieldGuardCharges).toBe(5)
})

test('actual scene collection applies once even before the fade disables its body', () => {
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'),
    input: { current: createShadowRunnerInputState() }, levelId: 'level-9', onHudChange: jest.fn() })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  scene.activeTimeMs = 1000
  scene.state.player.health = 5
  const data = new Map()
  const sprite = { name: shield.id, x: shield.x, y: shield.y,
    getData: (key: string) => data.get(key), setData: (key: string, value: unknown) => data.set(key, value), disableBody: jest.fn() }
  scene.tweens = { killTweensOf: jest.fn(), add: jest.fn() }
  for (const method of ['playSound', 'addCoinSparkle', 'addDustPuff', 'emitHud']) scene[method] = jest.fn()
  scene.collectShield(sprite)
  scene.activeTimeMs = 1100
  scene.collectShield(sprite)
  expect(scene.state.player.shieldActiveUntil).toBe(10000)
  expect(scene.state.player.health).toBe(5)
  expect(scene.state.player.score).toBe(0)
  expect(scene.tweens.add).toHaveBeenCalledTimes(1)
  scene.tweens.add.mock.calls[0][0].onComplete()
  expect(sprite.disableBody).toHaveBeenCalledWith(true, true)
})
