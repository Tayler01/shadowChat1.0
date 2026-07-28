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

  it('ships Captain Gate as the longest playable Stormwatch Siege route', () => {
    const levelEight = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const levelNine = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
    const enemies = getShadowRunnerLevelEnemies(levelNine)
    const enemyKinds = new Set(enemies.map(enemy => enemy.kind))
    const campaignLevel = SHADOW_RUNNER_CAMPAIGN_LEVELS.find(level => level.id === 'level-9')

    expect(levelNine.title).toBe('Captain Gate')
    expect(levelNine.subtitle).toBe('The Stormwatch Siege')
    expect(levelNine.campaignLevel).toBe(9)
    expect(levelNine.worldWidth).toBe(20400)
    expect(levelNine.worldWidth).toBeGreaterThan(levelEight.worldWidth * 1.25)
    expect(levelNine.checkpoints).toHaveLength(9)
    expect(levelNine.coins).toHaveLength(90)
    expect(levelNine.tiltPlatforms).toHaveLength(7)
    expect(levelNine.movingPlatforms).toHaveLength(5)
    expect(levelNine.crouchGates).toHaveLength(6)
    expect(levelNine.windZones).toHaveLength(6)
    expect(levelNine.arrowVolleys).toHaveLength(12)
    expect(levelNine.objectivePickups).toHaveLength(4)
    expect(levelNine.masteryPickups).toHaveLength(6)
    expect(levelNine.galeMantlePickups).toHaveLength(4)
    expect(levelNine.sunsteelEdgePickups).toHaveLength(4)
    expect(enemies).toHaveLength(28)
    expect([...enemyKinds]).toEqual(expect.arrayContaining([
      'gate-pikeman',
      'storm-grenadier',
      'moonlit-captain',
      'tower-archer',
      'candle-jester',
      'moon-stalker',
    ]))
    expect(enemies.filter(enemy => enemy.kind === 'gate-pikeman')).toHaveLength(7)
    expect(enemies.filter(enemy => enemy.kind === 'storm-grenadier')).toHaveLength(6)
    expect(enemies.filter(enemy => enemy.kind === 'moonlit-captain')).toHaveLength(1)
    expect(levelNine.requiredEnemyIds).toEqual(['captain-moonlit-final'])
    expect(campaignLevel?.playableLevelId).toBe('level-9')
    expect(campaignLevel?.difficultyLabel).toBe('Stormwatch Siege')
    expect(campaignLevel?.mechanicPreview).toContain('Gale Mantle')
    expect(campaignLevel?.thumbnail).toContain('captain-gate-thumbnail-320x180.webp')
    expect(campaignLevel?.locationButton).toContain('level-9-captain-gate-location-button-v2.webp')
  })

  it('ships Dawn Relay Spire as the complete playable campaign finale', () => {
    const levelNine = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
    const levelTen = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
    const enemies = getShadowRunnerLevelEnemies(levelTen)
    const enemyKinds = new Set(enemies.map(enemy => enemy.kind))
    const campaignLevel = SHADOW_RUNNER_CAMPAIGN_LEVELS.find(level => level.id === 'level-10')
    const sovereign = enemies.find(enemy => enemy.id === 'sentry-sovereign')

    expect(levelTen.title).toBe('Dawn Relay Spire')
    expect(levelTen.subtitle).toBe('The Last Light')
    expect(levelTen.campaignLevel).toBe(10)
    expect(levelTen.worldWidth).toBe(26400)
    expect(levelTen.worldWidth).toBeGreaterThan(levelNine.worldWidth * 1.28)
    expect(levelTen.checkpoints).toHaveLength(10)
    expect(levelTen.coins).toHaveLength(122)
    expect(levelTen.tiltPlatforms).toHaveLength(4)
    expect(levelTen.movingPlatforms).toHaveLength(8)
    expect(levelTen.phasePlatforms).toHaveLength(7)
    expect(levelTen.crouchGates).toHaveLength(6)
    expect(levelTen.relayBeamZones).toHaveLength(7)
    expect(levelTen.objectivePickups).toHaveLength(5)
    expect(levelTen.masteryPickups).toHaveLength(8)
    expect(levelTen.dawnfireAegisPickups).toHaveLength(5)
    expect(levelTen.aetherStepPickups).toHaveLength(6)
    expect(enemies).toHaveLength(36)
    expect([...enemyKinds]).toEqual(expect.arrayContaining([
      'relay-lancer',
      'prism-caster',
      'gearwing-drone',
      'sentry-sovereign',
      'tower-archer',
      'storm-grenadier',
    ]))
    expect(sovereign?.health).toBe(24)
    expect(sovereign?.guard).toBe(6)
    expect(sovereign?.bossPhases?.map(phase => phase.id)).toEqual([
      'iron-decree',
      'lockstorm',
      'crownfall',
      'last-light',
    ])
    expect(levelTen.requiredEnemyIds).toEqual(['sentry-sovereign'])
    expect(levelTen.encounters?.filter(encounter => encounter.sealed).map(encounter => encounter.id))
      .toEqual(['relay-encounter-crown'])
    expect(levelTen.encounters?.find(encounter => encounter.id === 'relay-encounter-crown')?.enemyIds)
      .toEqual(['sentry-sovereign'])
    expect(levelTen.finale?.beats).toHaveLength(4)
    expect(levelTen.finale?.finalLine).toBe('The Last Runner delivered the dawn.')
    expect(campaignLevel?.playableLevelId).toBe('level-10')
    expect(campaignLevel?.difficultyLabel).toBe('Sovereign Trial')
    expect(campaignLevel?.mechanicPreview).toContain('Dawnfire Aegis')
    expect(campaignLevel?.thumbnail).toContain('dawn-relay-spire-thumbnail-320x180.webp')
    expect(campaignLevel?.locationButton).toContain('level-10-dawn-relay-spire-location-button-v2.webp')
  })

  it('keeps Dawn Relay Spire geometry bounded, unique, supported, and fair', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
    const enemies = getShadowRunnerLevelEnemies(level)
    const rects = [
      ...level.platforms,
      ...level.tiltPlatforms,
      ...(level.movingPlatforms ?? []),
      ...(level.phasePlatforms ?? []),
      ...(level.crouchGates ?? []),
      ...(level.windZones ?? []),
      ...(level.relayBeamZones ?? []),
      ...level.spikes,
      ...(level.arrowVolleys ?? []),
      ...(level.encounters ?? []),
      level.finish,
    ]
    const points = [
      level.playerStart,
      ...(level.checkpoints ?? []),
      ...level.coins,
      ...(level.boosts ?? []),
      ...(level.shieldPickups ?? []),
      ...(level.chronoPickups ?? []),
      ...(level.surgePickups ?? []),
      ...(level.mirrorWardPickups ?? []),
      ...(level.galeMantlePickups ?? []),
      ...(level.sunsteelEdgePickups ?? []),
      ...(level.dawnfireAegisPickups ?? []),
      ...(level.aetherStepPickups ?? []),
      ...(level.objectivePickups ?? []),
      ...(level.masteryPickups ?? []),
      ...enemies,
    ]
    const ids = [...rects, ...points].map(item => item.id)

    expect(new Set(ids).size).toBe(ids.length)
    rects.forEach(rect => {
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(level.worldWidth)
      expect(rect.y + rect.height).toBeLessThanOrEqual(level.worldHeight)
    })
    points.forEach(point => {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(level.worldWidth)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(level.worldHeight)
    })

    const floorPlatforms = level.platforms
      .filter(platform => /^relay-(floor-\d+|boss-floor|finish-floor)$/.test(platform.id))
      .sort((left, right) => left.x - right.x)
    floorPlatforms.forEach((platform, index) => {
      if (index === 0) return
      const previous = floorPlatforms[index - 1]
      const gap = platform.x - (previous.x + previous.width)
      expect(gap).toBeGreaterThanOrEqual(0)
      expect(gap).toBeLessThanOrEqual(220)
    })

    level.checkpoints?.forEach(checkpoint => {
      const support = floorPlatforms.find(platform => (
        checkpoint.x >= platform.x + 20
        && checkpoint.x <= platform.x + platform.width - 20
        && Math.abs(checkpoint.y - platform.y) <= 2
      ))
      expect(support?.id).toBeTruthy()
    })

    level.crouchGates?.forEach(gate => {
      expect(616 - (gate.y + gate.height)).toBeGreaterThanOrEqual(60)
      const lowCoins = level.coins.filter(coin => (
        coin.x >= gate.x + 10
        && coin.x <= gate.x + gate.width - 10
        && coin.y >= 580
        && coin.y <= 602
      ))
      expect(lowCoins.length).toBeGreaterThanOrEqual(2)

      const suffix = gate.id.replace('relay-crouch-', '')
      const index = ['approach', 'prism', 'foundry', 'choir', 'crown', 'last'].indexOf(suffix) + 1
      const cap = level.platforms.find(platform => platform.id === `relay-crouch-cap-${String(index).padStart(2, '0')}`)
      const step = level.platforms.find(platform => platform.id === `relay-crouch-step-${String(index).padStart(2, '0')}`)
      const topCoins = level.coins.filter(coin => (
        cap
        && coin.x >= cap.x
        && coin.x <= cap.x + cap.width
        && coin.y < cap.y
        && cap.y - coin.y <= 120
      ))

      expect(cap?.y).toBeLessThanOrEqual(240)
      expect((cap?.y ?? 0) + (cap?.height ?? 0)).toBe(gate.y)
      expect(cap?.x).toBeLessThanOrEqual(gate.x)
      expect((cap?.x ?? 0) + (cap?.width ?? 0)).toBeGreaterThanOrEqual(gate.x + gate.width)
      expect(step?.x).toBeGreaterThan(gate.x + gate.width)
      expect(step?.y).toBeLessThan(616)
      expect(topCoins.length).toBeGreaterThanOrEqual(1)
    })

    const solidRects = [
      ...level.platforms,
      ...(level.crouchGates ?? []),
    ]
    const collectibles = [
      ...level.coins,
      ...(level.boosts ?? []),
      ...(level.shieldPickups ?? []),
      ...(level.chronoPickups ?? []),
      ...(level.surgePickups ?? []),
      ...(level.mirrorWardPickups ?? []),
      ...(level.galeMantlePickups ?? []),
      ...(level.sunsteelEdgePickups ?? []),
      ...(level.dawnfireAegisPickups ?? []),
      ...(level.aetherStepPickups ?? []),
      ...(level.objectivePickups ?? []),
      ...(level.masteryPickups ?? []),
    ]
    collectibles.forEach(collectible => {
      const containingRect = solidRects.find(rect => (
        collectible.x > rect.x
        && collectible.x < rect.x + rect.width
        && collectible.y > rect.y
        && collectible.y < rect.y + rect.height
      ))
      expect(containingRect?.id).toBeUndefined()
    })

    level.phasePlatforms?.forEach(platform => {
      expect(platform.solidDurationMs).toBeGreaterThanOrEqual(1400)
      expect(platform.warningDurationMs).toBeGreaterThanOrEqual(600)
      expect(platform.intangibleDurationMs).toBeLessThan(platform.solidDurationMs)
    })

    level.relayBeamZones?.forEach(zone => {
      expect(zone.lanes.length).toBeGreaterThan(0)
      expect(zone.tellDurationMs).toBeGreaterThanOrEqual(700)
      expect(zone.tellDurationMs + zone.activeDurationMs).toBeLessThan(zone.cadenceMs)
      expect(zone.lanes.every(lane => lane >= zone.y && lane <= zone.y + zone.height)).toBe(true)
    })
  })

  it('places every Last Dispatch on support after a fresh matching power opportunity', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
    const supports = [
      ...level.platforms,
      ...(level.movingPlatforms ?? []),
      ...(level.phasePlatforms ?? []),
    ]

    level.masteryPickups?.forEach(dispatch => {
      const support = supports.find(platform => (
        dispatch.x >= platform.x + 16
        && dispatch.x <= platform.x + platform.width - 16
        && dispatch.y <= platform.y
        && platform.y - dispatch.y <= 64
      ))
      const enablingPickup = dispatch.requiredPower === 'dawnfire-aegis'
        ? level.dawnfireAegisPickups?.find(pickup => (
            pickup.x < dispatch.x
            && dispatch.x - pickup.x <= 1400
          ))
        : level.aetherStepPickups?.find(pickup => (
            pickup.x < dispatch.x
            && dispatch.x - pickup.x <= 1400
          ))

      expect(dispatch.requiredPower).toMatch(/^(dawnfire-aegis|aether-step)$/)
      expect(support?.id).toBeTruthy()
      expect(enablingPickup?.id).toBeTruthy()
    })

    const dispatchRoutes = [
      ['last-dispatch-2', 'relay-crouch-step-02', 'relay-crouch-cap-02'],
      ['last-dispatch-4', 'relay-dispatch-step-04a', 'relay-dispatch-step-04b', 'relay-high-beam-b'],
      ['last-dispatch-6', 'relay-dispatch-step-06', 'relay-high-crown-a'],
      ['last-dispatch-8', 'relay-crouch-step-06', 'relay-crouch-cap-06', 'relay-high-ascent-b'],
    ]
    dispatchRoutes.forEach(([dispatchId, ...routeIds]) => {
      const dispatch = level.masteryPickups?.find(candidate => candidate.id === dispatchId)
      const route = routeIds.map(routeId => level.platforms.find(platform => platform.id === routeId))
      expect(dispatch).toBeTruthy()
      expect(route.every(platform => Boolean(platform))).toBe(true)
      expect(route[0]?.y).toBeGreaterThanOrEqual(420)

      route.forEach((platform, index) => {
        if (!platform || index === route.length - 1) return
        const next = route[index + 1]!
        const horizontalGap = Math.max(
          0,
          next.x - (platform.x + platform.width),
          platform.x - (next.x + next.width),
        )
        expect(platform.y - next.y).toBeLessThanOrEqual(200)
        expect(horizontalGap).toBeLessThanOrEqual(220)
      })
      const finalSupport = route[route.length - 1]!
      expect(finalSupport.y - (dispatch?.y ?? 0)).toBeLessThanOrEqual(64)
    })
  })

  it('keeps the Captain Gate main route continuous and every checkpoint on stable support', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
    const routeIds = [
      'captain-start-floor',
      'captain-outer-floor',
      'captain-tilt-outer',
      'captain-outer-exit',
      'captain-signal-floor-a',
      'captain-tilt-signal',
      'captain-signal-floor-b',
      'captain-signal-crest-floor',
      'captain-murder-entry',
      'captain-murder-hall',
      'captain-tilt-murder',
      'captain-murder-exit',
      'captain-banner-entry',
      'captain-tilt-banner',
      'captain-banner-mid',
      'captain-banner-exit',
      'captain-barracks-entry',
      'captain-barracks-post',
      'captain-barracks-exit',
      'captain-moonwell-entry',
      'captain-tilt-moonwell',
      'captain-moonwell-mid',
      'captain-moonwell-exit',
      'captain-span-entry',
      'captain-span-mid',
      'captain-tilt-span',
      'captain-span-exit',
      'captain-inner-entry',
      'captain-tilt-inner',
      'captain-inner-watch',
      'captain-inner-crest',
      'captain-final-prep',
      'captain-boss-floor',
      'captain-finish-floor',
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
      expect(gap).toBeGreaterThanOrEqual(0)
      expect(gap).toBeLessThanOrEqual(150)
      expect(Math.abs(rect.y - previous.y)).toBeLessThanOrEqual(12)
    })

    level.checkpoints?.forEach((checkpoint, index) => {
      const support = level.platforms.find(platform => (
        checkpoint.x >= platform.x + 20
        && checkpoint.x <= platform.x + platform.width - 20
        && Math.abs(checkpoint.y - platform.y) <= 2
      ))

      expect(support?.width).toBeGreaterThanOrEqual(420)
      expect(checkpoint.triggerWidth).toBeGreaterThan(0)
      expect(checkpoint.minY).toBeLessThan(checkpoint.maxY ?? 0)
      if (index > 0) {
        expect(checkpoint.x).toBeGreaterThan(level.checkpoints?.[index - 1].x ?? 0)
      }
    })

    const checkpointGaps = (level.checkpoints ?? [])
      .slice(1, -1)
      .map((checkpoint, index) => checkpoint.x - (level.checkpoints?.[index].x ?? 0))
    checkpointGaps.forEach(gap => {
      expect(gap).toBeGreaterThanOrEqual(2100)
      expect(gap).toBeLessThanOrEqual(2400)
    })
    const checkpoints = level.checkpoints ?? []
    expect((checkpoints[checkpoints.length - 1]?.x ?? 0) - (checkpoints[checkpoints.length - 2]?.x ?? 0))
      .toBeLessThanOrEqual(700)
  })

  it('keeps Captain Gate IDs unique and authored geometry inside world bounds', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
    const rects = [
      ...level.platforms,
      ...level.tiltPlatforms,
      ...(level.movingPlatforms ?? []),
      ...(level.crouchGates ?? []),
      ...(level.windZones ?? []),
      ...level.spikes,
      ...(level.arrowVolleys ?? []),
      ...(level.encounters ?? []),
      level.finish,
    ]
    const points = [
      level.playerStart,
      ...(level.checkpoints ?? []),
      ...level.coins,
      ...(level.boosts ?? []),
      ...(level.shieldPickups ?? []),
      ...(level.chronoPickups ?? []),
      ...(level.surgePickups ?? []),
      ...(level.wraithlightPickups ?? []),
      ...(level.mirrorWardPickups ?? []),
      ...(level.galeMantlePickups ?? []),
      ...(level.sunsteelEdgePickups ?? []),
      ...(level.objectivePickups ?? []),
      ...(level.masteryPickups ?? []),
      ...getShadowRunnerLevelEnemies(level),
    ]
    const ids = [...rects, ...points].map(item => item.id)

    expect(new Set(ids).size).toBe(ids.length)
    rects.forEach(rect => {
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(level.worldWidth)
      expect(rect.y + rect.height).toBeLessThanOrEqual(level.worldHeight)
    })
    points.forEach(point => {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(level.worldWidth)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(level.worldHeight)
    })
  })

  it('authors fair crouch, lift, wind, recovery, objective, and mastery geometry for Captain Gate', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
    const supports = [...level.platforms, ...(level.movingPlatforms ?? [])]

    level.crouchGates?.forEach(gate => {
      expect(616 - (gate.y + gate.height)).toBeGreaterThanOrEqual(60)
      const lowCoins = level.coins.filter(coin => (
        coin.x >= gate.x + 16
        && coin.x <= gate.x + gate.width - 16
        && coin.y >= 592
        && coin.y <= 604
      ))
      expect(lowCoins).toHaveLength(3)
    })

    level.windZones?.forEach(zone => {
      expect(zone.force).toBeGreaterThan(0)
      expect(zone.tellDurationMs).toBeGreaterThanOrEqual(650)
      expect(zone.tellDurationMs + zone.activeDurationMs).toBeLessThan(zone.cadenceMs)
      expect(zone.crouchForceMultiplier).toBeLessThanOrEqual(0.25)
      expect(level.checkpoints?.some(checkpoint => (
        checkpoint.x >= zone.x
        && checkpoint.x <= zone.x + zone.width
      ))).toBe(false)
    })

    level.movingPlatforms?.forEach(lift => {
      expect(lift.endY).toBeLessThan(lift.y)
      expect(lift.speed).toBeGreaterThan(0)
      expect(lift.pauseMs).toBeGreaterThanOrEqual(800)
      expect(getShadowRunnerLevelEnemies(level).some(enemy => (
        enemy.x >= lift.x
        && enemy.x <= lift.x + lift.width
      ))).toBe(false)
    })

    const recoveryBasins = level.platforms.filter(platform =>
      /^captain-recovery-(banner|moonwell|span)$/.test(platform.id))
    expect(recoveryBasins).toHaveLength(3)
    recoveryBasins.forEach((basin, index) => {
      expect(basin.y).toBe(700)
      expect(basin.width).toBeLessThanOrEqual(950)
      if (index > 0) {
        expect(basin.x).toBeGreaterThan(
          recoveryBasins[index - 1].x + recoveryBasins[index - 1].width,
        )
      }
    })

    level.objectivePickups?.forEach(crest => {
      const support = level.platforms.find(platform => (
        crest.x >= platform.x + 16
        && crest.x <= platform.x + platform.width - 16
        && crest.y <= platform.y
        && platform.y - crest.y <= 80
      ))
      expect(support?.id).toBeTruthy()
    })

    level.masteryPickups?.forEach(order => {
      const support = supports.find(platform => (
        order.x >= platform.x + 16
        && order.x <= platform.x + platform.width - 16
        && order.y <= platform.y
        && platform.y - order.y <= 64
      ))
      const enablingPickup = order.requiredPower === 'gale-mantle'
        ? level.galeMantlePickups?.find(pickup => pickup.x < order.x)
        : level.sunsteelEdgePickups?.find(pickup => pickup.x < order.x)

      expect(order.requiredPower).toMatch(/^(gale-mantle|sunsteel-edge)$/)
      expect(support?.id).toBeTruthy()
      expect(enablingPickup?.id).toBeTruthy()
    })
  })

  it('assigns Captain Gate enemies to bounded encounters and keeps normal completion optional-item free', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
    const enemies = getShadowRunnerLevelEnemies(level)
    const assignedIds = level.encounters?.flatMap(encounter => encounter.enemyIds) ?? []
    const captain = enemies.find(enemy => enemy.id === 'captain-moonlit-final')

    expect(new Set(assignedIds).size).toBe(assignedIds.length)
    expect(new Set(assignedIds)).toEqual(new Set(enemies.map(enemy => enemy.id)))
    level.encounters?.forEach(encounter => {
      expect(encounter.enemyIds.length).toBeLessThanOrEqual(3)
    })
    enemies.forEach(enemy => {
      const support = level.platforms.find(platform => (
        enemy.x >= platform.x + 20
        && enemy.x <= platform.x + platform.width - 20
        && Math.abs(enemy.y - platform.y) <= 80
      ))
      expect(level.encounters?.some(encounter => encounter.id === enemy.encounterId)).toBe(true)
      expect(enemy.patrolLeft).toBeGreaterThanOrEqual((support?.x ?? 0) + 20)
      expect(enemy.patrolRight).toBeLessThanOrEqual(
        (support?.x ?? 0) + (support?.width ?? 0) - 20,
      )
    })

    expect(level.encounters?.filter(encounter => encounter.sealed)).toHaveLength(3)
    expect(captain?.kind).toBe('moonlit-captain')
    expect(captain?.bossPhases?.map(phase => phase.healthAtOrBelow)).toEqual([15, 10, 5])
    expect(captain?.bossPhases?.map(phase => phase.chargeCount)).toEqual([0, 1, 2])
    expect(level.requiredEnemyIds).toEqual([captain?.id])
    expect(level.finishRequirementText).toEqual({
      missingObjectives: 'Recover all four Watchfire Crests',
      missingRequiredEnemies: 'Defeat the Moonlit Captain',
      missingObjectivesAndEnemies: 'Recover all four Watchfire Crests and defeat the Moonlit Captain',
    })
    expect(JSON.stringify(level.finishRequirementText)).not.toMatch(/coin|order/i)
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
      ['level-9', 9],
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

  it('keeps Level 5 through Level 9 patrol routes on their supporting platforms', () => {
    ;(['level-5', 'level-6', 'level-7', 'level-8', 'level-9'] as const).forEach(levelId => {
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
