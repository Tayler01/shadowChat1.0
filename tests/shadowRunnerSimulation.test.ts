import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import {
  blockShadowRunnerProjectileWithShield,
  collectShadowRunnerBoost,
  collectShadowRunnerChrono,
  collectShadowRunnerCoin,
  collectShadowRunnerMastery,
  collectShadowRunnerMirrorWard,
  collectShadowRunnerMoonShard,
  collectShadowRunnerObjective,
  collectShadowRunnerShield,
  collectShadowRunnerSurge,
  collectShadowRunnerWraithlight,
  createInitialShadowRunnerSimulation,
  damageShadowRunnerEnemy,
  damageShadowRunnerPlayer,
  getShadowRunnerHudState,
  getShadowRunnerChronoTimeScale,
  getShadowRunnerSurgeSpeedMultiplier,
  isShadowRunnerMirrorWardActive,
  isShadowRunnerWraithlightActive,
  reflectShadowRunnerProjectileWithMirrorWard,
  spendShadowRunnerLife,
} from '../src/features/games/shadow-runner/game/simulation'

describe('Shadow Runner simulation', () => {
  const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-6']

  it('accepts the first real player and enemy hit immediately', () => {
    const state = createInitialShadowRunnerSimulation(level)

    expect(damageShadowRunnerPlayer(state, 20)).toBe(true)
    expect(state.player.health).toBe(11)
    expect(damageShadowRunnerEnemy(state, 20, 1, state.enemies[0].id)).toBe(true)
    expect(state.enemies[0].health).toBe(state.enemies[0].maxHealth - 1)
  })

  it('applies damage immunity windows without hiding health from the HUD', () => {
    const state = createInitialShadowRunnerSimulation(level)

    expect(damageShadowRunnerPlayer(state, 1000)).toBe(true)
    expect(damageShadowRunnerPlayer(state, 1500)).toBe(false)
    expect(damageShadowRunnerPlayer(state, 1820)).toBe(true)

    const hud = getShadowRunnerHudState(state, level.coins.length, 1820)
    expect(hud.health).toBe(10)
    expect(hud.maxHealth).toBe(12)
    expect(hud.lives).toBe(3)
  })

  it('supports differentiated damage on the expanded health scale', () => {
    const state = createInitialShadowRunnerSimulation(level)

    expect(damageShadowRunnerPlayer(state, 1000, 4)).toBe(true)
    expect(state.player.health).toBe(8)
    expect(damageShadowRunnerPlayer(state, 1820, 2)).toBe(true)
    expect(state.player.health).toBe(6)
  })

  it('uses boost and shield guard charges before health', () => {
    const state = createInitialShadowRunnerSimulation(level)
    const boost = level.boosts![0]
    const shield = level.shieldPickups![0]

    collectShadowRunnerBoost(state, 1000, boost)
    expect(damageShadowRunnerPlayer(state, 2000)).toBe(true)
    expect(state.player.health).toBe(12)
    expect(state.player.boostGuardCharges).toBe((boost.guardCharges ?? 2) - 1)

    collectShadowRunnerShield(state, 2100, shield)
    expect(blockShadowRunnerProjectileWithShield(state, 2200)).toBe(true)
    expect(state.player.shieldGuardCharges).toBe((shield.guardCharges ?? 4) - 1)
  })

  it('applies the Chrono Lantern heal and temporary time scale', () => {
    const state = createInitialShadowRunnerSimulation(level)
    const chrono = level.chronoPickups![0]
    state.player.health = 5

    collectShadowRunnerChrono(state, 1000, chrono)

    expect(state.player.health).toBe(9)
    expect(getShadowRunnerChronoTimeScale(state, 1200)).toBe(chrono.timeScale)
    const hud = getShadowRunnerHudState(state, level.coins.length, 1200)
    expect(hud.chronoActive).toBe(true)
    expect(hud.chronoRemainingMs).toBeGreaterThan(0)
    expect(getShadowRunnerChronoTimeScale(state, 20_000)).toBe(1)
  })

  it('applies Shadow Surge healing, speed, guard charges, and damage resistance', () => {
    const levelSeven = SHADOW_RUNNER_LEVEL_CONFIGS['level-7']
    const state = createInitialShadowRunnerSimulation(levelSeven)
    const surge = levelSeven.surgePickups![0]
    state.player.health = 5

    collectShadowRunnerSurge(state, 1000, surge)

    expect(state.player.health).toBe(10)
    expect(getShadowRunnerSurgeSpeedMultiplier(state, 1200)).toBe(surge.speedMultiplier)
    expect(damageShadowRunnerPlayer(state, 2000, 4)).toBe(true)
    expect(state.player.health).toBe(8)
    expect(state.player.surgeGuardCharges).toBe((surge.guardCharges ?? 3) - 1)

    const hud = getShadowRunnerHudState(state, levelSeven.coins.length, 2000)
    expect(hud.surgeActive).toBe(true)
    expect(hud.surgeRemainingMs).toBeGreaterThan(0)
  })

  it('tracks Moon Shards as required route goals separate from coins', () => {
    const levelSeven = SHADOW_RUNNER_LEVEL_CONFIGS['level-7']
    const state = createInitialShadowRunnerSimulation(levelSeven)
    const [firstShard, secondShard, thirdShard] = levelSeven.moonShardPickups!

    collectShadowRunnerMoonShard(state, firstShard, levelSeven.moonShardPickups!.length)
    collectShadowRunnerMoonShard(state, secondShard, levelSeven.moonShardPickups!.length)
    let hud = getShadowRunnerHudState(state, levelSeven.coins.length)
    expect(hud.moonShards).toBe(2)
    expect(hud.totalMoonShards).toBe(3)
    expect(hud.moonShardGateOpen).toBe(false)
    expect(state.player.coins).toBe(0)

    collectShadowRunnerMoonShard(state, thirdShard, levelSeven.moonShardPickups!.length)
    hud = getShadowRunnerHudState(state, levelSeven.coins.length)
    expect(hud.moonShardGateOpen).toBe(true)
    expect(state.objective).toBe('Moon relay open')
  })

  it('applies Wraithlight healing and Mirror Ward reflection charges', () => {
    const levelEight = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const state = createInitialShadowRunnerSimulation(levelEight)
    const wraithlight = levelEight.wraithlightPickups![0]
    const mirrorWard = levelEight.mirrorWardPickups![0]
    state.player.health = 7

    collectShadowRunnerWraithlight(state, 1000, wraithlight)
    expect(state.player.health).toBe(9)
    expect(isShadowRunnerWraithlightActive(state, 1200)).toBe(true)
    expect(isShadowRunnerWraithlightActive(state, 20_000)).toBe(false)

    collectShadowRunnerMirrorWard(state, 2000, mirrorWard)
    expect(isShadowRunnerMirrorWardActive(state, 2200)).toBe(true)
    expect(reflectShadowRunnerProjectileWithMirrorWard(state, 2200)).toBe(true)
    expect(state.player.mirrorWardCharges).toBe((mirrorWard.reflectionCharges ?? 5) - 1)

    state.player.mirrorWardCharges = 0
    expect(reflectShadowRunnerProjectileWithMirrorWard(state, 2300)).toBe(false)
  })

  it('tracks Relay Seals, Courier Caches, full clears, and perfect routes separately', () => {
    const levelEight = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const state = createInitialShadowRunnerSimulation(levelEight)

    levelEight.objectivePickups?.forEach(pickup => collectShadowRunnerObjective(state, pickup))
    levelEight.masteryPickups?.forEach(pickup => collectShadowRunnerMastery(state, pickup))
    levelEight.coins.forEach(() => collectShadowRunnerCoin(state))
    state.enemies.forEach(enemy => {
      enemy.health = 0
      enemy.alive = false
    })

    let hud = getShadowRunnerHudState(state, levelEight.coins.length)
    expect(hud.objectiveItems).toBe(3)
    expect(hud.objectiveGateOpen).toBe(true)
    expect(hud.masteryItems).toBe(5)
    expect(hud.fullClear).toBe(true)
    expect(hud.perfectRoute).toBe(true)

    spendShadowRunnerLife(state)
    hud = getShadowRunnerHudState(state, levelEight.coins.length)
    expect(hud.fullClear).toBe(true)
    expect(hud.perfectRoute).toBe(false)
  })

  it('breaks Crypt Warden guard before frontal damage and allows bypass attacks', () => {
    const levelEight = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const state = createInitialShadowRunnerSimulation(levelEight)
    const warden = state.enemies.find(enemy => enemy.kind === 'crypt-warden')!

    expect(warden.guard).toBeGreaterThan(0)
    const startingHealth = warden.health
    expect(damageShadowRunnerEnemy(state, 1000, 1, warden.id)).toBe(true)
    expect(warden.health).toBe(startingHealth)
    expect(warden.guard).toBe(warden.maxGuard - 1)

    expect(damageShadowRunnerEnemy(
      state,
      1240,
      2,
      warden.id,
      { bypassGuard: true },
    )).toBe(true)
    expect(warden.health).toBe(startingHealth - 2)
  })

  it('starts encounter-owned Level 8 enemies asleep without changing older routes', () => {
    const levelEight = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const levelSix = SHADOW_RUNNER_LEVEL_CONFIGS['level-6']

    expect(createInitialShadowRunnerSimulation(levelEight).enemies.every(enemy => !enemy.activated)).toBe(true)
    expect(createInitialShadowRunnerSimulation(levelSix).enemies.every(enemy => enemy.activated)).toBe(true)
  })

  it('spends one HUD heart per lost life while keeping health separate', () => {
    const state = createInitialShadowRunnerSimulation(level)

    expect(spendShadowRunnerLife(state)).toBe(true)
    const hud = getShadowRunnerHudState(state, level.coins.length)

    expect(hud.lives).toBe(2)
    expect(hud.maxLives).toBe(3)
    expect(hud.health).toBe(12)
    expect(hud.maxHealth).toBe(12)
  })

  it('tracks score, enemy clears, and the final life consistently', () => {
    const state = createInitialShadowRunnerSimulation(level)
    const target = state.enemies[0]

    collectShadowRunnerCoin(state)
    expect(state.player.coins).toBe(1)
    expect(state.player.score).toBe(25)

    for (let hit = 0; hit < target.maxHealth; hit += 1) {
      damageShadowRunnerEnemy(state, 1000 + hit * 240, 1, target.id)
    }
    expect(target.alive).toBe(false)

    expect(spendShadowRunnerLife(state)).toBe(true)
    expect(spendShadowRunnerLife(state)).toBe(true)
    expect(spendShadowRunnerLife(state)).toBe(false)
    expect(state.outOfLives).toBe(true)
    expect(state.objective).toBe('Route failed')
  })
})
