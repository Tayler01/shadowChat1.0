import { SHADOW_RUNNER_ASSETS } from '../src/features/games/shadow-runner/assets/manifest'
import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_CONFIGS, SHADOW_RUNNER_TUTORIAL_LEVEL, getShadowRunnerLevelEnemies, type ShadowRunnerRect } from '../src/features/games/shadow-runner/game/levels'
import { validateShadowRunnerLevelGeometry } from '../src/features/games/shadow-runner/game/levelValidation'
import { getShadowRunnerRuntimeManifest } from '../src/features/games/shadow-runner/game/runtimeCatalog'
import { canShadowRunnerStand, findShadowRunnerCheckpoint, getShadowRunnerLandingDamage } from '../src/features/games/shadow-runner/game/runtimeReliability'
import { collectShadowRunnerCoin, createInitialShadowRunnerSimulation, damageShadowRunnerEnemy, getShadowRunnerHudState, spendShadowRunnerLife } from '../src/features/games/shadow-runner/game/simulation'
import { SHADOW_RUNNER_TUTORIAL_LEVEL as extractedTutorial } from '../src/features/games/shadow-runner/game/tutorial'

jest.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    Game: class { constructor(public config: { scene: unknown[] }) {} },
    Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
  },
}))

const level = SHADOW_RUNNER_TUTORIAL_LEVEL
const STANCE = { standingHeight: 70 * 0.78, crouchedHeight: 48 * 0.78 * 0.72 }
const BODY_WIDTH = 42 * 0.78
const SINGLE_RISE = 620 ** 2 / (2 * 1640)
const DOUBLE_RISE = (620 ** 2 + 560 ** 2) / (2 * 1640)
const rect = (id: string) => level.platforms.find(platform => platform.id === id)!
const bounds = (platform: ShadowRunnerRect) => ({ left: platform.x, right: platform.x + platform.width, top: platform.y, bottom: platform.y + platform.height })
const roof = rect('courtyard-crawl-roof')
const floorY = rect('courtyard-floor').y

describe('Tutorial courtyard authored geometry (not input-driven route proof)', () => {
  test('extraction keeps the tutorial identity, base art and existing public export', () => {
    expect(extractedTutorial).toBe(level)
    expect(SHADOW_RUNNER_LEVEL_CONFIGS.tutorial).toBe(level)
    expect(level).toMatchObject({ id: 'tutorial', title: 'Tutorial Run', subtitle: 'Learn The Route', worldWidth: 2760, worldHeight: 540, playerStart: { id: 'start', x: 112, y: 404 }, backgroundAsset: SHADOW_RUNNER_ASSETS.rebuild.eastGateMoonriseBackground })
    expect(level.campaignLevel).toBeUndefined()
    expect(validateShadowRunnerLevelGeometry(level, STANCE)).toEqual([])
  })

  test('continuous sheltered floor has no deadly pits and uses bounded reusable textures', () => {
    const floor = level.platforms.filter(platform => platform.y === floorY).sort((a, b) => a.x - b.x)
    let right = 0
    for (const platform of floor) {
      expect(platform.x).toBe(right)
      expect(platform.y + platform.height).toBe(level.worldHeight)
      expect(platform.width).toBe(920)
      expect(platform.hidden).not.toBe(true)
      right = platform.x + platform.width
    }
    expect(right).toBe(level.worldWidth)
    expect(level.spikes).toEqual([])
    expect(level.tiltPlatforms).toEqual([])
    for (const platforms of [level.movingPlatforms, level.spectralPlatforms, level.phasePlatforms]) expect(platforms ?? []).toEqual([])
    expect(level.platforms.every(platform => !platform.hidden && (platform.terrainSet ?? 'stone') === 'stone')).toBe(true)
  })

  test('visible ascents require a jump then a double jump, with broad landings and safe returns', () => {
    const first = rect('courtyard-jump-step')
    const second = rect('courtyard-double-step')
    const recovery = rect('courtyard-recovery-step')
    expect(floorY - first.y).toBe(88)
    expect(floorY - first.y).toBeLessThan(SINGLE_RISE - 20)
    expect(first.y - second.y).toBe(160)
    expect(first.y - second.y).toBeGreaterThan(SINGLE_RISE + 25)
    expect(first.y - second.y).toBeLessThan(DOUBLE_RISE - 40)
    expect(floorY - second.y).toBeGreaterThan(DOUBLE_RISE)
    expect(second.x - (first.x + first.width)).toBe(60)
    expect(recovery.x).toBe(second.x + second.width)
    for (const platform of [first, second, recovery]) {
      expect(platform.width).toBeGreaterThan(BODY_WIDTH + 160)
      expect(platform.y + platform.height).toBe(level.worldHeight)
      expect(getShadowRunnerLandingDamage(platform.y, floorY)).toBe(0)
    }
    expect(getShadowRunnerLandingDamage(second.y, recovery.y)).toBe(0)
  })

  test('the mandatory silver roof has an actual 44px passage, with no reachable route over it', () => {
    expect(floorY - (roof.y + roof.height)).toBe(44)
    expect(roof.height).toBe(340)
    expect(floorY - roof.y).toBeGreaterThan(DOUBLE_RISE + 100)
    const recovery = rect('courtyard-recovery-step')
    expect(recovery.y - roof.y).toBeGreaterThan(DOUBLE_RISE + 30)
    // Conservative same-height flight bound; the higher roof needs even less flight time.
    const maxUnpoweredAirTravel = 260 * 2 * (620 + 560) / 1640
    const highStep = rect('courtyard-double-step')
    expect(roof.x - (highStep.x + highStep.width)).toBeGreaterThan(maxUnpoweredAirTravel + BODY_WIDTH)
    const crawlBody = { left: roof.x + 100, right: roof.x + 100 + BODY_WIDTH, top: floorY - STANCE.crouchedHeight, bottom: floorY }
    expect(crawlBody.top).toBeGreaterThan(roof.y + roof.height)
    expect(canShadowRunnerStand(crawlBody, STANCE.standingHeight, level.platforms.map(bounds))).toBe(false)
    for (const x of [roof.x - BODY_WIDTH - 1, roof.x + roof.width + 1]) {
      expect(canShadowRunnerStand({ ...crawlBody, left: x, right: x + BODY_WIDTH }, STANCE.standingHeight, level.platforms.map(bounds))).toBe(true)
    }
    // Use the existing underpass validator without changing the runtime's silver-art classification.
    const underpassView = { ...level, platforms: level.platforms.filter(platform => platform !== roof), crouchGates: [roof] }
    expect(validateShadowRunnerLevelGeometry(underpassView, STANCE)).toEqual([])
    for (const height of [310, 360]) {
      expect(validateShadowRunnerLevelGeometry({ ...underpassView, crouchGates: [{ ...roof, height }] }, STANCE))
        .toContainEqual({ code: 'invalid-underpass-clearance', entityId: roof.id })
    }
  })

  test('all four original coin IDs and 25-point values survive, including a visible crawl reward', () => {
    expect(level.coins.map(coin => coin.id)).toEqual(['coin-1', 'coin-2', 'coin-3', 'coin-4'])
    const state = createInitialShadowRunnerSimulation(level)
    level.coins.forEach(() => collectShadowRunnerCoin(state))
    expect(state.player.coins).toBe(4)
    expect(state.player.score).toBe(100)
    const lowCoin = level.coins[2]
    expect(lowCoin.x).toBeGreaterThan(roof.x + 40)
    expect(lowCoin.x).toBeLessThan(roof.x + roof.width - 40)
    for (const coin of level.coins) {
      const visualEnvelope = { left: coin.x - 18, right: coin.x + 18, top: coin.y - 18 - 8, bottom: coin.y + 18 }
      for (const solid of level.platforms.map(bounds)) {
        const overlaps = visualEnvelope.right > solid.left && visualEnvelope.left < solid.right && visualEnvelope.bottom > solid.top && visualEnvelope.top < solid.bottom
        expect({ coin: coin.id, overlaps }).toEqual({ coin: coin.id, overlaps: false })
      }
    }
  })

  test('the checkpoint is safely beyond crouch and before stationary one-hit combat', () => {
    expect(level.checkpoints).toHaveLength(1)
    const checkpoint = level.checkpoints![0]
    const enemies = getShadowRunnerLevelEnemies(level)
    expect(enemies).toHaveLength(1)
    expect(enemies[0]).toMatchObject({ id: 'courtyard-training-sentry', kind: 'clockwork-sentry', health: 1, maxHealth: 1, patrolSpeed: 0, contactDamage: 1 })
    expect(level.requiredEnemyIds).toEqual([enemies[0].id])
    expect(checkpoint.x).toBeGreaterThan(roof.x + roof.width + 100)
    expect(checkpoint.x + checkpoint.triggerWidth!).toBeLessThan(enemies[0].patrolLeft - 80)
    expect(findShadowRunnerCheckpoint(level.checkpoints!, -1, { x: checkpoint.x + 20, y: floorY })).toBe(0)
    expect(findShadowRunnerCheckpoint(level.checkpoints!, -1, { x: checkpoint.x + 20, y: 300 })).toBe(-1)
    expect(canShadowRunnerStand({ left: checkpoint.x - BODY_WIDTH / 2, right: checkpoint.x + BODY_WIDTH / 2, top: checkpoint.y - STANCE.standingHeight, bottom: checkpoint.y }, STANCE.standingHeight, level.platforms.map(bounds))).toBe(true)
    expect(level.finish.x).toBeGreaterThan(enemies[0].patrolRight + 200)
    expect(level.finish.y + level.finish.height).toBe(floorY)
  })

  test('training completion uses the existing required-enemy gate without making coins mandatory', () => {
    const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'), input: { current: createShadowRunnerInputState() }, levelId: 'tutorial', onHudChange: jest.fn() })
    const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
    scene.gameplayPaused = false
    scene.player = { body: { left: level.finish.x + 10, right: level.finish.x + 10 + BODY_WIDTH, top: floorY - STANCE.standingHeight, bottom: floorY } }
    for (const method of ['emitHud', 'showCheckpointToast', 'addHitFlash', 'addDustPuff', 'addCoinSparkle', 'playSound']) scene[method] = jest.fn()
    scene.checkFinish()
    expect(scene.state.defeated).toBe(false)
    expect(scene.state.objective).toBe('Defeat the training sentry')
    expect(damageShadowRunnerEnemy(scene.state, 1000, 1, level.requiredEnemyIds![0])).toBe(true)
    expect(scene.state.enemies[0].alive).toBe(false)
    expect(scene.state.player.coins).toBe(0)
    scene.checkFinish()
    expect(scene.state.defeated).toBe(true)
  })

  test('existing full-clear and deathless distinction remain earned, with no power dependencies', () => {
    const state = createInitialShadowRunnerSimulation(level)
    level.coins.forEach(() => collectShadowRunnerCoin(state))
    expect(getShadowRunnerHudState(state, 4, 1000).fullClear).toBe(false)
    damageShadowRunnerEnemy(state, 1000, 1, level.requiredEnemyIds![0])
    expect(getShadowRunnerHudState(state, 4, 1000)).toMatchObject({ fullClear: true, perfectRoute: true })
    spendShadowRunnerLife(state)
    expect(state.enemies[0].alive).toBe(false)
    expect(getShadowRunnerHudState(state, 4, 1000)).toMatchObject({ fullClear: true, perfectRoute: false })
    for (const pickups of [level.boosts, level.shieldPickups, level.chronoPickups, level.surgePickups, level.wraithlightPickups, level.mirrorWardPickups, level.galeMantlePickups, level.sunsteelEdgePickups, level.dawnfireAegisPickups, level.aetherStepPickups, level.objectivePickups, level.moonShardPickups, level.masteryPickups]) expect(pickups ?? []).toEqual([])
    const keys = getShadowRunnerRuntimeManifest(level).map(asset => asset.key)
    expect(keys).toContain('shadow-runner-silver-courier-walkway')
    expect(keys).toContain('clockwork-sentry')
    for (const key of ['shadow-runner-bell-terrain-atlas', 'shadow-runner-spike-row', 'shadow-runner-tilt-bridge']) expect(keys).not.toContain(key)
  })
})
