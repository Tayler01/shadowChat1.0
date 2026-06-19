import {
  SHADOW_RUNNER_CAMPAIGN_LEVELS,
  SHADOW_RUNNER_LEVEL_CONFIGS,
  getShadowRunnerLevelEnemies,
} from '../src/features/games/shadow-runner/game/levels'

describe('Shadow Runner level configuration contract', () => {
  it('ships Candle Fair Ruins as the longer and harder playable Level 5 route', () => {
    const levelFour = SHADOW_RUNNER_LEVEL_CONFIGS['level-4']
    const levelFive = SHADOW_RUNNER_LEVEL_CONFIGS['level-5']
    const levelFiveEnemies = getShadowRunnerLevelEnemies(levelFive)
    const enemyKinds = new Set(levelFiveEnemies.map(enemy => enemy.kind))
    const campaignLevelFive = SHADOW_RUNNER_CAMPAIGN_LEVELS.find(level => level.id === 'level-5')

    expect(levelFive.title).toBe('Candle Fair Ruins')
    expect(levelFive.campaignLevel).toBe(5)
    expect(levelFive.worldWidth).toBeGreaterThan(levelFour.worldWidth)
    expect(levelFive.coins.length).toBeGreaterThan(levelFour.coins.length)
    expect(levelFive.platforms.some(platform => platform.terrainSet === 'candle')).toBe(true)
    expect(levelFive.crouchGates?.length).toBeGreaterThanOrEqual(3)
    expect(levelFive.tiltPlatforms.length).toBeGreaterThanOrEqual(levelFour.tiltPlatforms.length)
    expect(levelFive.shieldPickups?.length).toBeGreaterThanOrEqual(3)
    expect(levelFive.arrowVolleys?.length).toBeGreaterThanOrEqual(8)
    expect(levelFiveEnemies).toHaveLength(12)
    expect([...enemyKinds]).toEqual(expect.arrayContaining([
      'clockwork-sentry',
      'barrel-roller',
      'scroll-thief',
      'tower-archer',
      'candle-jester',
    ]))
    expect(levelFiveEnemies.filter(enemy => enemy.kind === 'candle-jester')).toHaveLength(3)
    expect(campaignLevelFive?.playableLevelId).toBe('level-5')
    expect(campaignLevelFive?.mechanicPreview).toContain('Shielded archer volleys')
  })
})
