import {
  SHADOW_RUNNER_LEVEL_CONFIGS,
  getShadowRunnerLevelEnemies,
  type ShadowRunnerLevelConfig,
} from '../src/features/games/shadow-runner/game/levels'
import {
  getShadowRunnerLevelPickups,
  validateShadowRunnerLevelGeometry,
} from '../src/features/games/shadow-runner/game/levelValidation'

// World-space body sizes from the current Phaser stance contract, not sprite art.
const STANCE = { standingHeight: 70 * 0.78, crouchedHeight: 48 * 0.78 * 0.72 }
const BODY_WIDTH = 42 * 0.78

function copyLevel(): ShadowRunnerLevelConfig {
  return JSON.parse(JSON.stringify(SHADOW_RUNNER_LEVEL_CONFIGS['level-9']))
}

describe('Shadow Runner initial geometry repairs', () => {
  it.each(Object.values(SHADOW_RUNNER_LEVEL_CONFIGS))('$id has no embedded pickups, invalid IDs/bounds or broken underpasses', level => {
    expect(validateShadowRunnerLevelGeometry(level, STANCE)).toEqual([])
  })

  it.each([
    ['level-8', 16200, 72, 22, 91, 8, 3, 5],
    ['level-9', 20400, 90, 28, 141, 9, 4, 6],
    ['level-10', 26400, 122, 36, 198, 11, 5, 8],
  ] as const)('%s preserves length, rewards, combat and checkpoint budgets', (id, width, coins, enemies, hp, checkpoints, objectives, mastery) => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS[id]
    expect(level.worldWidth).toBe(width)
    expect(level.coins).toHaveLength(coins)
    expect(getShadowRunnerLevelEnemies(level)).toHaveLength(enemies)
    expect(getShadowRunnerLevelEnemies(level).reduce((sum, enemy) => sum + enemy.health, 0)).toBe(hp)
    expect(level.checkpoints).toHaveLength(checkpoints)
    expect(level.objectivePickups).toHaveLength(objectives)
    expect(level.masteryPickups).toHaveLength(mastery)
  })

  it('moves both ossuary coins above the visible cover and keeps a permanent exit step', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const cover = level.platforms.find(platform => platform.id === 'catacomb-ossuary-cover-a')!
    const exit = level.platforms.find(platform => platform.id === 'catacomb-ossuary-step-a')!
    const coins = level.coins.filter(coin => /catacomb-coin-ossuary-low-[34]$/.test(coin.id))
    expect(coins).toEqual([
      { id: 'catacomb-coin-ossuary-low-3', x: 6884, y: 446 },
      { id: 'catacomb-coin-ossuary-low-4', x: 6976, y: 446 },
    ])
    expect(cover.hidden).not.toBe(true)
    expect(cover.visualId).toBeTruthy()
    expect(616 - cover.y).toBeLessThanOrEqual(120)
    for (const coin of coins) {
      expect(coin.x - 18).toBeGreaterThan(cover.x)
      expect(coin.x + 18).toBeLessThan(cover.x + cover.width)
      expect(coin.y + 18).toBeLessThan(cover.y)
    }
    expect(exit.x - (cover.x + cover.width)).toBeLessThanOrEqual(40)
    expect(Math.abs(exit.y - cover.y)).toBeLessThanOrEqual(20)
    expect(exit.hidden).not.toBe(true)
  })

  it('places the Echo Wraithlight before the crawl roof, without changing its budget', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const pickup = level.wraithlightPickups!.find(pickup => pickup.id === 'catacomb-wraithlight-echo')!
    const gate = level.crouchGates!.find(gate => gate.id === 'catacomb-crawl-gate-d')!
    expect(pickup).toMatchObject({ x: 11800, y: 546, durationMs: 12500, scoreValue: 200 })
    expect(pickup.x + 32).toBeLessThan(gate.x)
  })

  it('clears both sides of the Vault chain launch across normal and mastery arrival bands', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const overhead = level.platforms.find(platform => platform.id === 'catacomb-vault-return-a')!
    const destination = level.platforms.find(platform => platform.id === 'catacomb-vault-return-b')!
    const coin = level.coins.find(item => item.id === 'catacomb-coin-vault-high-4')!
    for (const launchX of [5552, 5558]) {
      expect(launchX - 18 - BODY_WIDTH / 2).toBeGreaterThan(overhead.x + overhead.width)
      expect(launchX + 18 + BODY_WIDTH / 2).toBeLessThan(destination.x)
    }
    expect(coin.x - 18).toBeGreaterThan(overhead.x)
    expect(coin.x + 18).toBeLessThan(overhead.x + overhead.width)
    // The former190px shelf left only7.24px of full-body vertical launch space.
    expect(destination.x - (overhead.x + 190) - BODY_WIDTH).toBeCloseTo(7.24)
    expect(destination.x - (overhead.x + overhead.width) - BODY_WIDTH).toBeGreaterThan(60)
    expect(overhead.hidden).not.toBe(true)
  })

  it('gives Order 5 visible permanent stairs with unpowered ascent and staged return budgets', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
    const ids = ['captain-span-entry', 'captain-span-step-a', 'captain-span-step-b', 'captain-span-high']
    const route = ids.map(id => level.platforms.find(platform => platform.id === id)!)
    const order = level.masteryPickups!.find(pickup => pickup.id === 'captain-order-5')!
    const gale = level.galeMantlePickups!.find(pickup => pickup.id === 'captain-gale-inner')!
    const maxDoubleRise = (620 ** 2 + 560 ** 2) / (2 * 1640)

    // These deliberately generous landing areas and small height deltas are design
    // budgets, not a simulation of wind, arrows, collisions or actual input travel.
    route.forEach((platform, index) => {
      expect(platform.hidden).not.toBe(true)
      expect(platform.visualId).toBeTruthy()
      expect(platform.width).toBeGreaterThanOrEqual(BODY_WIDTH + 100)
      if (index === 0) return
      const previous = route[index - 1]
      const rise = previous.y - platform.y
      expect(rise).toBeGreaterThan(0)
      expect(rise).toBeLessThanOrEqual(120)
      expect(rise).toBeLessThan(maxDoubleRise - 80)
      expect(platform.x - (previous.x + previous.width)).toBeLessThanOrEqual(0)
      // A retreat to the preceding step/floor stays below high-fall damage height.
      expect(rise).toBeLessThan(330)
    })
    // Launch left of the shelf's side, without jumping into its underside.
    expect(route[3].x - route[2].x).toBeGreaterThan(BODY_WIDTH + 60)
    expect(route[2].y - (route[3].y + route[3].height)).toBeGreaterThan(STANCE.standingHeight)
    expect(order).toMatchObject({ x: 14580, y: 226, requiredPower: 'gale-mantle', scoreValue: 575 })
    expect(gale).toMatchObject({ x: 14060, y: 548, durationMs: 10000, scoreValue: 240 })
    expect(gale.x).toBeLessThan(route[1].x - BODY_WIDTH)
    expect(order.x - gale.x).toBeLessThan(600)
    expect(level.galeMantlePickups).toHaveLength(4)
    expect(level.galeMantlePickups!.reduce((sum, pickup) => sum + (pickup.scoreValue ?? 0), 0)).toBe(900)
  })

  it.each(['level-9', 'level-10'] as const)('%s requires crouch and fits the full low-coin bob envelope', id => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS[id]
    expect(level.crouchGates).toHaveLength(6)
    for (const gate of level.crouchGates!) {
      expect(gate.y).toBe(446)
      expect(gate.y + gate.height).toBe(572)
      expect(616 - (gate.y + gate.height)).toBeGreaterThan(STANCE.crouchedHeight + 12)
      expect(616 - (gate.y + gate.height)).toBeLessThan(STANCE.standingHeight - 8)
      const lowCoins = level.coins.filter(coin => coin.x > gate.x && coin.x < gate.x + gate.width && coin.y > 572)
      expect(lowCoins.length).toBeGreaterThanOrEqual(2)
      for (const coin of lowCoins) {
        // 36px display envelope plus the existing 8px upward bob.
        expect(coin.y - 18 - 8).toBeGreaterThanOrEqual(gate.y + gate.height)
        expect(coin.y + 18).toBeLessThanOrEqual(616)
        expect(coin.y).toBeGreaterThan(616 - STANCE.crouchedHeight)
      }
    }
  })

  it('preserves all six finale cap-to-roof top contacts for the art pipeline', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
    level.crouchGates!.forEach((gate, index) => {
      const cap = level.platforms.find(platform => platform.id === `relay-crouch-cap-${String(index + 1).padStart(2, '0')}`)!
      expect(cap.x).toBe(gate.x)
      expect(cap.width).toBe(gate.width)
      expect(cap.y + cap.height).toBe(gate.y)
      expect(gate.visualOffsetY ?? 0).toBe(0)
      expect(gate.visualHeight ?? gate.height).toBe(gate.height)
    })
  })

  it('keeps relocated Captain roof coins visible throughout their bob, and the crest outside the roof', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
    const solids = [...level.platforms, ...level.crouchGates!]
    const roofCoins = level.coins.filter(coin => /-main-/.test(coin.id) && coin.y >= 392 && coin.y <= 398)
    expect(roofCoins).toHaveLength(12)
    for (const coin of roofCoins) {
      expect(solids.filter(solid => coin.x + 18 > solid.x && coin.x - 18 < solid.x + solid.width
        && coin.y + 18 > solid.y && coin.y - 26 < solid.y + solid.height)).toEqual([])
    }
    expect(level.objectivePickups![0]).toMatchObject({
      id: 'captain-watchfire-crest-1', x: 4320, y: 548, scoreValue: 375,
    })
  })
})

describe('Shadow Runner geometry validation rejects regressions', () => {
  it('detects the original embedded ossuary coins', () => {
    const original = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const level = { ...original, coins: original.coins.map(coin => (
      /catacomb-coin-ossuary-low-[34]$/.test(coin.id) ? { ...coin, y: 548 } : coin
    )) }
    expect(validateShadowRunnerLevelGeometry(level, STANCE)).toEqual(expect.arrayContaining([
      { code: 'embedded-pickup', entityId: 'catacomb-coin-ossuary-low-3', relatedId: 'catacomb-ossuary-cover-a' },
      { code: 'embedded-pickup', entityId: 'catacomb-coin-ossuary-low-4', relatedId: 'catacomb-ossuary-cover-a' },
    ]))
  })

  it.each([62, STANCE.standingHeight, STANCE.crouchedHeight, 20])('rejects %s px underpass clearance', clearance => {
    const level = copyLevel()
    const gate = level.crouchGates![0]
    gate.height = 616 - gate.y - clearance
    expect(validateShadowRunnerLevelGeometry(level, STANCE)).toContainEqual({
      code: 'invalid-underpass-clearance', entityId: gate.id,
    })
  })

  it('requires a continuous supporting floor under the whole tunnel', () => {
    const level = copyLevel()
    level.platforms.find(platform => platform.id === 'captain-outer-floor')!.width = 300
    expect(validateShadowRunnerLevelGeometry(level, STANCE)).toContainEqual({
      code: 'unsupported-underpass', entityId: 'captain-crouch-outer',
    })
  })

  it.each(['', 'bad id', ' bad-id', 'bad-id ', 'Bad-ID', 'bad--id'])('rejects invalid entity ID %j', id => {
    const level = copyLevel()
    level.coins[0].id = id
    expect(validateShadowRunnerLevelGeometry(level, STANCE)).toContainEqual({ code: 'invalid-id', entityId: id })
  })

  it('rejects duplicate IDs across pickup and platform collections', () => {
    const level = copyLevel()
    level.coins[0].id = level.platforms[0].id
    expect(validateShadowRunnerLevelGeometry(level, STANCE)).toContainEqual({
      code: 'duplicate-id', entityId: level.coins[0].id,
    })
  })

  it('rejects unknown mandatory enemies and duplicate encounter references', () => {
    const level = copyLevel()
    level.requiredEnemyIds!.push('missing-boss')
    const encounter = level.encounters![0]
    encounter.enemyIds.push(encounter.enemyIds[0])
    expect(validateShadowRunnerLevelGeometry(level, STANCE)).toEqual(expect.arrayContaining([
      { code: 'invalid-reference', entityId: level.id, relatedId: 'missing-boss' },
      { code: 'invalid-reference', entityId: encounter.id, relatedId: encounter.enemyIds[0] },
    ]))
  })

  it('checks every configured power, objective and mastery pickup collection', () => {
    const level = copyLevel()
    const gate = level.crouchGates![0]
    for (const pickup of getShadowRunnerLevelPickups(level)) {
      pickup.x = gate.x + 100
      pickup.y = gate.y + 50
    }
    const embedded = validateShadowRunnerLevelGeometry(level, STANCE).filter(issue => issue.code === 'embedded-pickup')
    expect(embedded).toHaveLength(getShadowRunnerLevelPickups(level).length)
  })

  it('rejects non-finite positions, nonpositive dimensions and out-of-world lift endpoints', () => {
    const level = copyLevel()
    level.coins[0].x = NaN
    level.platforms[0].height = 0
    level.movingPlatforms![0].endY = level.worldHeight
    expect(validateShadowRunnerLevelGeometry(level, STANCE)).toEqual(expect.arrayContaining([
      { code: 'invalid-bounds', entityId: level.coins[0].id },
      { code: 'invalid-bounds', entityId: level.platforms[0].id },
      { code: 'invalid-bounds', entityId: level.movingPlatforms![0].id },
    ]))
  })

  it('rejects invalid stance metrics instead of silently accepting clearance', () => {
    expect(() => validateShadowRunnerLevelGeometry(copyLevel(), { standingHeight: NaN, crouchedHeight: 27 }))
      .toThrow(RangeError)
    expect(() => validateShadowRunnerLevelGeometry(copyLevel(), { standingHeight: 27, crouchedHeight: 27 }))
      .toThrow(RangeError)
  })
})
