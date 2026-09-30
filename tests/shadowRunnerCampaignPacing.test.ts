import { getShadowRunnerEnemyContactDamage, getShadowRunnerLevelEnemies, SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import { getShadowRunnerRuntimeManifest } from '../src/features/games/shadow-runner/game/runtimeCatalog'

describe('Opening campaign encounter progression', () => {
  test('the tutorial isolates a forgiving one-hit duel and East Gate reinforces sentries', () => {
    const training = getShadowRunnerLevelEnemies(SHADOW_RUNNER_LEVEL_CONFIGS.tutorial)
    expect(training).toHaveLength(1)
    expect(training[0]).toMatchObject({ health: 1, patrolSpeed: 0, contactDamage: 1 })
    expect(getShadowRunnerLevelEnemies(SHADOW_RUNNER_LEVEL_CONFIGS['level-1']).every(enemy => enemy.kind === 'clockwork-sentry')).toBe(true)
  })

  test('Market introduces a gentler scout on a wide checkpoint landing without changing reward identities', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-2']
    const enemies = getShadowRunnerLevelEnemies(level)
    expect(enemies.map(enemy => enemy.id)).toEqual(['market-roof-sentry-a', 'market-roof-sentry-b', 'market-gate-sentry'])
    expect(enemies.map(enemy => enemy.kind)).toEqual(['clockwork-sentry', 'lantern-bandit-scout', 'clockwork-sentry'])
    const scout = enemies[1]
    expect(scout).toMatchObject({ health: 3, maxHealth: 3, patrolSpeed: 112, contactDamage: 1 })
    expect(getShadowRunnerEnemyContactDamage(scout)).toBe(1)
    const floor = level.platforms.find(platform => platform.id === 'market-roof-b')!
    expect(floor.width).toBeGreaterThanOrEqual(450)
    expect(scout.patrolLeft).toBeGreaterThan(floor.x)
    expect(scout.patrolRight).toBeLessThan(floor.x + floor.width)
    expect(level.checkpoints?.[0].x).toBeLessThan(scout.x)
    expect(level.coins).toHaveLength(12)
    expect(getShadowRunnerRuntimeManifest(level).filter(asset => asset.key === 'lantern-bandit-scout')).toHaveLength(1)
  })
})
