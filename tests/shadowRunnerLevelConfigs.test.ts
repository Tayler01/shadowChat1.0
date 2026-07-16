import {
  SHADOW_RUNNER_CAMPAIGN_LEVELS,
  SHADOW_RUNNER_LEVEL_CONFIGS,
  getShadowRunnerEnemyContactDamage,
  getShadowRunnerEnemyProjectileDamage,
  getShadowRunnerLevelEnemies,
  isShadowRunnerFinishOverlap,
} from '../src/features/games/shadow-runner/game/levels'
import { SHADOW_RUNNER_ASSETS } from '../src/features/games/shadow-runner/assets/manifest'

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
    expect(levelFive.platforms.some(platform =>
      platform.terrainSet === 'candleBright' || platform.terrainSet === 'candleShelf')).toBe(true)
    expect(levelFive.crouchGates?.length).toBeGreaterThanOrEqual(3)
    expect(levelFive.tiltPlatforms.length).toBeGreaterThanOrEqual(levelFour.tiltPlatforms.length)
    expect(levelFive.shieldPickups?.length).toBeGreaterThanOrEqual(3)
    expect(levelFive.arrowVolleys?.length).toBe(6)
    expect(levelFiveEnemies).toHaveLength(10)
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

  it('ships Clockmaker Yard as a longer, slightly harder playable Level 6 route', () => {
    const levelFive = SHADOW_RUNNER_LEVEL_CONFIGS['level-5']
    const levelSix = SHADOW_RUNNER_LEVEL_CONFIGS['level-6']
    const levelSixEnemies = getShadowRunnerLevelEnemies(levelSix)
    const campaignLevelSix = SHADOW_RUNNER_CAMPAIGN_LEVELS.find(level => level.id === 'level-6')

    expect(levelSix.title).toBe('Clockmaker Yard')
    expect(levelSix.campaignLevel).toBe(6)
    expect(levelSix.worldWidth).toBeGreaterThan(levelFive.worldWidth)
    expect(levelSix.worldWidth).toBeLessThan(levelFive.worldWidth * 1.25)
    expect(levelSix.coins.length).toBeGreaterThan(levelFive.coins.length)
    expect(levelSix.tiltPlatforms.length).toBeGreaterThan(levelFive.tiltPlatforms.length)
    expect(levelSix.checkpoints).toHaveLength(5)
    expect(levelSix.chronoPickups).toHaveLength(3)
    expect(levelSixEnemies).toHaveLength(12)
    expect(levelSixEnemies.filter(enemy => enemy.kind === 'lantern-bandit-scout')).toHaveLength(4)
    expect(new Set(levelSixEnemies.map(getShadowRunnerEnemyContactDamage)).size).toBeGreaterThan(1)
    expect(levelSixEnemies.filter(enemy => enemy.projectileSpeed).map(getShadowRunnerEnemyProjectileDamage))
      .toEqual(expect.arrayContaining([2, 3]))
    expect(levelSix.platforms.filter(platform => platform.terrainSet === 'clock').length)
      .toBeGreaterThanOrEqual(20)
    expect(campaignLevelSix?.playableLevelId).toBe('level-6')
    expect(campaignLevelSix?.mechanicPreview).toContain('Chrono Lantern')
    expect(SHADOW_RUNNER_ASSETS.levels.clockmakerYardBackground).toContain('clockmaker-yard-background.webp')
    expect(SHADOW_RUNNER_ASSETS.levels.clockmakerYardProps).toContain('clockmaker-yard-props-v1-transparent.png')
    expect(SHADOW_RUNNER_ASSETS.levels.chronoLanternStrip).toContain('chrono-lantern-4f-64.png')
  })

  it('ships Moonlit Causeway as the longer and hardest playable Level 7 route', () => {
    const levelSix = SHADOW_RUNNER_LEVEL_CONFIGS['level-6']
    const levelSeven = SHADOW_RUNNER_LEVEL_CONFIGS['level-7']
    const levelSevenEnemies = getShadowRunnerLevelEnemies(levelSeven)
    const enemyKinds = new Set(levelSevenEnemies.map(enemy => enemy.kind))
    const campaignLevelSeven = SHADOW_RUNNER_CAMPAIGN_LEVELS.find(level => level.id === 'level-7')

    expect(levelSeven.title).toBe('Moonlit Causeway')
    expect(levelSeven.campaignLevel).toBe(7)
    expect(levelSeven.worldWidth).toBeGreaterThan(levelSix.worldWidth)
    expect(levelSeven.coins.length).toBeGreaterThan(levelSix.coins.length)
    expect(levelSeven.tiltPlatforms.length).toBeGreaterThan(levelSix.tiltPlatforms.length)
    expect(levelSeven.checkpoints).toHaveLength(6)
    expect(levelSeven.moonShardPickups).toHaveLength(3)
    expect(levelSeven.surgePickups).toHaveLength(3)
    expect(levelSeven.arrowVolleys).toHaveLength(8)
    expect(levelSevenEnemies).toHaveLength(15)
    expect([...enemyKinds]).toEqual(expect.arrayContaining([
      'clockwork-sentry',
      'lantern-bandit-scout',
      'barrel-roller',
      'tower-archer',
      'candle-jester',
      'moon-stalker',
    ]))
    expect(levelSevenEnemies.filter(enemy => enemy.kind === 'moon-stalker')).toHaveLength(4)
    expect(new Set(levelSevenEnemies.map(getShadowRunnerEnemyContactDamage)).size).toBeGreaterThan(2)
    expect(levelSeven.platforms.filter(platform => platform.terrainSet === 'moon').length)
      .toBeGreaterThanOrEqual(24)
    expect(campaignLevelSeven?.playableLevelId).toBe('level-7')
    expect(campaignLevelSeven?.mechanicPreview).toContain('Shadow Surge')
    expect(SHADOW_RUNNER_ASSETS.levels.moonlitCausewayBackground).toContain('moonlit-causeway-background.webp')
    expect(SHADOW_RUNNER_ASSETS.levels.moonlitCausewayProps).toContain('moonlit-causeway-props-v1-transparent.png')
    expect(SHADOW_RUNNER_ASSETS.enemies.moonStalkerStrip).toContain('moon-stalker-v1-5f-128.png')
    expect(SHADOW_RUNNER_ASSETS.levels.shadowSurgeSigilStrip).toContain('shadow-surge-sigil-4f-64.png')
    expect(SHADOW_RUNNER_ASSETS.levels.moonShardRelicStrip).toContain('moon-shard-relic-4f-64.png')
  })

  it('adds safe recovery checkpoints to every long campaign route', () => {
    const expectedMinimums = new Map([
      ['level-1', 1],
      ['level-2', 1],
      ['level-3', 2],
      ['level-4', 3],
      ['level-5', 4],
      ['level-6', 5],
      ['level-7', 6],
    ])

    expectedMinimums.forEach((minimum, levelId) => {
      const level = SHADOW_RUNNER_LEVEL_CONFIGS[levelId as keyof typeof SHADOW_RUNNER_LEVEL_CONFIGS]
      expect(level.checkpoints?.length).toBeGreaterThanOrEqual(minimum)
      level.checkpoints?.forEach(checkpoint => {
        const supportingPlatform = level.platforms.find(platform => (
          checkpoint.x >= platform.x + 20
          && checkpoint.x <= platform.x + platform.width - 20
          && Math.abs(checkpoint.y - platform.y) <= 2
        ))
        expect(supportingPlatform?.id).toBeTruthy()
      })
    })
  })

  it('keeps Level 5 through Level 7 patrol routes on their supporting platforms', () => {
    ;(['level-5', 'level-6', 'level-7'] as const).forEach(levelId => {
      const level = SHADOW_RUNNER_LEVEL_CONFIGS[levelId]
      const movingEnemies = getShadowRunnerLevelEnemies(level)
        .filter(enemy => (enemy.patrolSpeed ?? 1) > 0)

      movingEnemies.forEach(enemy => {
        const supportingPlatform = level.platforms.find(platform => (
          enemy.x >= platform.x
          && enemy.x <= platform.x + platform.width
          && Math.abs(enemy.y - platform.y) <= 80
        ))

        expect(supportingPlatform?.id).toBeTruthy()
        expect(enemy.patrolLeft).toBeGreaterThanOrEqual((supportingPlatform?.x ?? 0) + 20)
        expect(enemy.patrolRight).toBeLessThanOrEqual(
          (supportingPlatform?.x ?? 0) + (supportingPlatform?.width ?? 0) - 20,
        )
      })
    })
  })

  it('provides landing room before Level 5 low-clearance cover', () => {
    const levelFive = SHADOW_RUNNER_LEVEL_CONFIGS['level-5']
    const platformById = new Map(levelFive.platforms.map(platform => [platform.id, platform]))
    const gateById = new Map(levelFive.crouchGates?.map(gate => [gate.id, gate]))

    const firstPocket = platformById.get('fair-volley-pocket-low')!
    const firstCover = gateById.get('fair-volley-low-cover-a')!
    const secondPocket = platformById.get('fair-gauntlet-pocket-low')!
    const secondCover = gateById.get('fair-gauntlet-low-cover-a')!

    expect(firstCover.x - firstPocket.x).toBeGreaterThanOrEqual(90)
    expect(secondCover.x - secondPocket.x).toBeGreaterThanOrEqual(90)
  })

  it('uses a dedicated readable Candle Fair terrain treatment for Level 5 platforms', () => {
    const levelFive = SHADOW_RUNNER_LEVEL_CONFIGS['level-5']
    const readablePlatforms = levelFive.platforms.filter(platform =>
      platform.terrainSet === 'candleBright' || platform.terrainSet === 'candleShelf')

    expect(SHADOW_RUNNER_ASSETS.levels.candleFairTerrainReadable).toContain('candle-fair-terrain-v2-transparent.png')
    expect(readablePlatforms.length).toBeGreaterThanOrEqual(24)
    expect(levelFive.platforms.some(platform => platform.id === 'fair-bridge-landing-chip')).toBe(true)
  })

  it('makes Level 5 tilt bridges meaningful without removing recovery landings', () => {
    const levelFive = SHADOW_RUNNER_LEVEL_CONFIGS['level-5']
    const platformById = new Map(levelFive.platforms.map(platform => [platform.id, platform]))
    const tiltById = new Map(levelFive.tiltPlatforms.map(platform => [platform.id, platform]))
    const firstLaunch = platformById.get('fair-sentry-rubble')!
    const firstChip = platformById.get('fair-bridge-landing-chip')!
    const firstLanding = platformById.get('fair-bridge-entry')!
    const firstTilt = tiltById.get('fair-tilt-bridge-a')!
    const finalLaunch = platformById.get('fair-gauntlet-archer-perch')!
    const finalLanding = platformById.get('fair-final-entry')!
    const finalTilt = tiltById.get('fair-final-tilt')!

    expect(firstChip.x - (firstLaunch.x + firstLaunch.width)).toBeGreaterThanOrEqual(290)
    expect(firstChip.width).toBeLessThanOrEqual(112)
    expect(firstLanding.x - (firstLaunch.x + firstLaunch.width)).toBeGreaterThanOrEqual(410)
    expect(firstLanding.x - (firstTilt.x + firstTilt.width)).toBeLessThanOrEqual(240)
    expect(finalLanding.x - (finalLaunch.x + finalLaunch.width)).toBeGreaterThanOrEqual(360)
    expect(finalLanding.x - (finalTilt.x + finalTilt.width)).toBeLessThanOrEqual(220)
  })

  it('requires real finish overlap and blocks falling completions', () => {
    const finish = SHADOW_RUNNER_LEVEL_CONFIGS['level-5'].finish

    expect(isShadowRunnerFinishOverlap({
      left: finish.x + 4,
      right: finish.x + 48,
      top: finish.y + 22,
      bottom: finish.y + finish.height - 12,
    }, finish)).toBe(true)

    expect(isShadowRunnerFinishOverlap({
      left: finish.x + 4,
      right: finish.x + 48,
      top: finish.y + finish.height + 44,
      bottom: finish.y + finish.height + 96,
    }, finish)).toBe(false)

    expect(isShadowRunnerFinishOverlap({
      left: finish.x + 4,
      right: finish.x + 48,
      top: finish.y + 22,
      bottom: finish.y + finish.height - 12,
    }, finish, { fallRespawnPending: true })).toBe(false)
  })
})
