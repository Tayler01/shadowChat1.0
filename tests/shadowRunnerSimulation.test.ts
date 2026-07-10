import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import {
  blockShadowRunnerProjectileWithShield,
  collectShadowRunnerBoost,
  collectShadowRunnerCoin,
  collectShadowRunnerShield,
  createInitialShadowRunnerSimulation,
  damageShadowRunnerEnemy,
  damageShadowRunnerPlayer,
  getShadowRunnerHudState,
  spendShadowRunnerLife,
} from '../src/features/games/shadow-runner/game/simulation'

describe('Shadow Runner simulation', () => {
  const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-5']

  it('accepts the first real player and enemy hit immediately', () => {
    const state = createInitialShadowRunnerSimulation(level)

    expect(damageShadowRunnerPlayer(state, 20)).toBe(true)
    expect(state.player.health).toBe(2)
    expect(damageShadowRunnerEnemy(state, 20, 1, state.enemies[0].id)).toBe(true)
    expect(state.enemies[0].health).toBe(state.enemies[0].maxHealth - 1)
  })

  it('applies damage immunity windows without hiding health from the HUD', () => {
    const state = createInitialShadowRunnerSimulation(level)

    expect(damageShadowRunnerPlayer(state, 1000)).toBe(true)
    expect(damageShadowRunnerPlayer(state, 1500)).toBe(false)
    expect(damageShadowRunnerPlayer(state, 1820)).toBe(true)

    const hud = getShadowRunnerHudState(state, level.coins.length, 1820)
    expect(hud.health).toBe(1)
    expect(hud.lives).toBe(3)
  })

  it('uses boost and shield guard charges before health', () => {
    const state = createInitialShadowRunnerSimulation(level)
    const boost = level.boosts![0]
    const shield = level.shieldPickups![0]

    collectShadowRunnerBoost(state, 1000, boost)
    expect(damageShadowRunnerPlayer(state, 2000)).toBe(true)
    expect(state.player.health).toBe(3)
    expect(state.player.boostGuardCharges).toBe((boost.guardCharges ?? 2) - 1)

    collectShadowRunnerShield(state, 2100, shield)
    expect(blockShadowRunnerProjectileWithShield(state, 2200)).toBe(true)
    expect(state.player.shieldGuardCharges).toBe((shield.guardCharges ?? 4) - 1)
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
