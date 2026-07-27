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

  it('ships Courier Catacombs as the longest playable route with a complete new mechanic set', () => {
    const levelSeven = SHADOW_RUNNER_LEVEL_CONFIGS['level-7']
    const levelEight = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const enemies = getShadowRunnerLevelEnemies(levelEight)
    const enemyKinds = new Set(enemies.map(enemy => enemy.kind))
    const campaignLevel = SHADOW_RUNNER_CAMPAIGN_LEVELS.find(level => level.id === 'level-8')

    expect(levelEight.title).toBe('Courier Catacombs')
    expect(levelEight.campaignLevel).toBe(8)
    expect(levelEight.worldWidth).toBeGreaterThan(levelSeven.worldWidth * 1.27)
    expect(levelEight.coins).toHaveLength(72)
    expect(levelEight.checkpoints).toHaveLength(8)
    expect(levelEight.tiltPlatforms).toHaveLength(6)
    expect(levelEight.crouchGates).toHaveLength(5)
    expect(levelEight.arrowVolleys).toHaveLength(10)
    expect(levelEight.objectivePickups).toHaveLength(3)
    expect(levelEight.masteryPickups).toHaveLength(5)
    expect(levelEight.wraithlightPickups).toHaveLength(4)
    expect(levelEight.mirrorWardPickups).toHaveLength(3)
    expect(levelEight.spectralPlatforms).toHaveLength(6)
    expect(enemies).toHaveLength(22)
    expect([...enemyKinds]).toEqual(expect.arrayContaining([
      'tomb-lurker',
      'crypt-warden',
      'rival-courier',
      'tower-archer',
      'candle-jester',
      'moon-stalker',
    ]))
    expect(levelEight.requiredEnemyIds).toEqual(['catacomb-rival-final'])
    expect(enemies.some(enemy => enemy.id === levelEight.requiredEnemyIds?.[0])).toBe(true)
    expect(campaignLevel?.playableLevelId).toBe('level-8')
    expect(campaignLevel?.mechanicPreview).toContain('Mirror Ward')
    expect(SHADOW_RUNNER_ASSETS.levels.courierCatacombsBackground).toContain('courier-catacombs-background.webp')
    expect(SHADOW_RUNNER_ASSETS.levels.courierCatacombsProps).toContain('courier-catacombs-terrain-props-v1-transparent.png')
    expect(SHADOW_RUNNER_ASSETS.enemies.cryptWardenStrip).toContain('crypt-warden-v1-6f-128.png')
  })

  it('keeps every Courier Catacombs main-route gap recoverable and every branch checkpoint bounded', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const routeIds = [
      'catacomb-start-floor',
      'catacomb-descent-floor-a',
      'catacomb-tilt-descent',
      'catacomb-descent-floor-b',
      'catacomb-names-floor',
      'catacomb-crawl-floor-a',
      'catacomb-first-seal-floor',
      'catacomb-vault-floor-a',
      'catacomb-vault-floor-b',
      'catacomb-tilt-vault',
      'catacomb-vault-exit',
      'catacomb-ossuary-floor-a',
      'catacomb-crawl-floor-b',
      'catacomb-ossuary-floor-b',
      'catacomb-second-seal-floor',
      'catacomb-pursuit-floor-a',
      'catacomb-tilt-pursuit-a',
      'catacomb-pursuit-floor-b',
      'catacomb-tilt-pursuit-b',
      'catacomb-pursuit-exit',
      'catacomb-crawl-floor-c',
      'catacomb-tilt-echo',
      'catacomb-crawl-floor-d',
      'catacomb-echo-exit',
      'catacomb-sanctum-floor-a',
      'catacomb-sanctum-floor-b',
      'catacomb-tilt-sanctum',
      'catacomb-relay-floor',
    ]
    const routeRects = routeIds.map(id => (
      level.platforms.find(platform => platform.id === id)
      ?? level.tiltPlatforms.find(platform => platform.id === id)
    )!)

    routeRects.forEach((rect, index) => {
      expect(rect?.id).toBe(routeIds[index])
      if (index === 0) return

      const previous = routeRects[index - 1]
      const gap = rect.x - (previous.x + previous.width)
      const hasRecovery = level.platforms.some(platform => (
        platform.id.includes('recovery')
        && platform.x < rect.x
        && platform.x + platform.width > previous.x + previous.width
      ))
      expect(gap <= 260 || hasRecovery).toBe(true)
    })

    level.checkpoints?.forEach(checkpoint => {
      expect(checkpoint.triggerWidth).toBeGreaterThan(0)
      expect(checkpoint.minY).toBeLessThan(checkpoint.maxY ?? 0)
      const support = level.platforms.find(platform => (
        checkpoint.x >= platform.x + 20
        && checkpoint.x <= platform.x + platform.width - 20
        && Math.abs(checkpoint.y - platform.y) <= 2
      ))
      expect(support?.width).toBeGreaterThanOrEqual(320)
    })
  })

  it('places reachable crouch coins and Wraithlight caches on authored support', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const supports = [...level.platforms, ...(level.spectralPlatforms ?? [])]
    const toeStep = level.platforms.find(platform => platform.id === 'catacomb-fork-toe-step')

    expect(toeStep).toMatchObject({ hidden: true, width: 42, height: 12, y: 548 })
    level.crouchGates?.forEach(gate => {
      expect(616 - (gate.y + gate.height)).toBe(54)
      const crouchCoins = level.coins.filter(coin => (
        coin.x >= gate.x + 16
        && coin.x <= gate.x + gate.width - 16
        && coin.y >= 592
        && coin.y <= 604
      ))
      expect(crouchCoins.length).toBeGreaterThanOrEqual(2)
    })

    level.masteryPickups?.forEach(cache => {
      const support = supports.find(platform => (
        cache.x >= platform.x + 16
        && cache.x <= platform.x + platform.width - 16
        && cache.y <= platform.y
        && platform.y - cache.y <= 64
      ))
      expect(support?.id).toBeTruthy()
    })
  })

  it('assigns every Courier Catacombs enemy to exactly one sleeping encounter', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const enemies = getShadowRunnerLevelEnemies(level)
    const assignedIds = level.encounters?.flatMap(encounter => encounter.enemyIds) ?? []

    expect(new Set(assignedIds).size).toBe(assignedIds.length)
    expect(new Set(assignedIds)).toEqual(new Set(enemies.map(enemy => enemy.id)))
    enemies.forEach(enemy => {
      expect(level.encounters?.some(encounter => encounter.id === enemy.encounterId)).toBe(true)
    })
  })

  it('keeps Moonlit Causeway crawl pickups and recovery chips reachable', () => {
    const levelSeven = SHADOW_RUNNER_LEVEL_CONFIGS['level-7']
    const platformById = new Map(levelSeven.platforms.map(platform => [platform.id, platform]))
    const spikeById = new Map(levelSeven.spikes.map(spike => [spike.id, spike]))
    const coinById = new Map(levelSeven.coins.map(coin => [coin.id, coin]))
    const shardById = new Map(levelSeven.moonShardPickups?.map(shard => [shard.id, shard]) ?? [])
    const chronoById = new Map(levelSeven.chronoPickups?.map(chrono => [chrono.id, chrono]) ?? [])

    ;([
      ['causeway-mid-gap-chip', 'causeway-gap-f'],
      ['causeway-moon-gauntlet-chip', 'causeway-gap-k'],
      ['causeway-final-gap-chip', 'causeway-gap-l'],
    ] as const).forEach(([chipId, gapId]) => {
      const chip = platformById.get(chipId)!
      const gap = spikeById.get(gapId)!

      expect(chip.x).toBeGreaterThan(gap.x)
      expect(chip.x + chip.width).toBeLessThan(gap.x + gap.width)
      expect(chip.width).toBeGreaterThanOrEqual(100)
      expect(chip.width).toBeLessThanOrEqual(170)
      expect(chip.y).toBeLessThan(616)
    })

    const highRecovery = platformById.get('causeway-high-recovery-a')!
    const shardCheckpoint = levelSeven.checkpoints?.find(checkpoint => checkpoint.id === 'causeway-shard-climb')

    expect(highRecovery.y).toBe(604)
    expect(highRecovery.height).toBeLessThanOrEqual(64)
    expect(shardCheckpoint?.y).toBe(highRecovery.y)
    expect(chronoById.get('chrono-causeway-climb')?.x).toBeGreaterThanOrEqual(highRecovery.x + 80)
    expect(chronoById.get('chrono-causeway-climb')?.y).toBeGreaterThanOrEqual(568)

    ;([
      'coin-11', 'coin-12', 'coin-13',
      'coin-27', 'coin-28', 'coin-29', 'coin-30',
      'coin-40', 'coin-41', 'coin-42',
      'coin-50', 'coin-51', 'coin-52',
    ] as const).forEach(coinId => {
      expect(coinById.get(coinId)?.y).toBeGreaterThanOrEqual(596)
    })
    expect(shardById.get('moon-shard-crawl-route')?.y).toBeGreaterThanOrEqual(596)
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
      ['level-8', 8],
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

  it('keeps Level 5 through Level 8 patrol routes on their supporting platforms', () => {
    ;(['level-5', 'level-6', 'level-7', 'level-8'] as const).forEach(levelId => {
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
