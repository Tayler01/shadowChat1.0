import {
  SHADOW_RUNNER_CAMPAIGN_LEVELS,
  SHADOW_RUNNER_LEVEL_CONFIGS,
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
