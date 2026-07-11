import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import {
  blockShadowRunnerProjectileWithShield,
  collectShadowRunnerBoost,
  collectShadowRunnerChrono,
  collectShadowRunnerCoin,
  collectShadowRunnerShield,
  createInitialShadowRunnerSimulation,
  damageShadowRunnerEnemy,
  damageShadowRunnerPlayer,
  getShadowRunnerHudState,
  getShadowRunnerChronoTimeScale,
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
