import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import {
  blockShadowRunnerProjectileWithShield,
  collectShadowRunnerBoost,
  collectShadowRunnerChrono,
  collectShadowRunnerCoin,
  collectShadowRunnerDawnfireAegis,
  collectShadowRunnerGaleMantle,
  collectShadowRunnerMastery,
  collectShadowRunnerMirrorWard,
  collectShadowRunnerMoonShard,
  collectShadowRunnerObjective,
  collectShadowRunnerShield,
  collectShadowRunnerSunsteelEdge,
  collectShadowRunnerSurge,
  collectShadowRunnerAetherStep,
  collectShadowRunnerWraithlight,
  createInitialShadowRunnerSimulation,
  consumeShadowRunnerSunsteelCharge,
  damageShadowRunnerEnemy,
  damageShadowRunnerPlayer,
  doesShadowRunnerAetherPreventFallDamage,
  getShadowRunnerEncounterBarrierState,
  getShadowRunnerGaleFallDamageCap,
  getShadowRunnerGaleSpeedMultiplier,
  getShadowRunnerAetherExtraAirJumps,
  getShadowRunnerAetherSpeedMultiplier,
  getShadowRunnerDawnfireProperties,
  getShadowRunnerHudState,
  getShadowRunnerSunsteelStrikeProperties,
  getShadowRunnerChronoTimeScale,
  getShadowRunnerSurgeSpeedMultiplier,
  isShadowRunnerGaleMantleActive,
  isShadowRunnerDawnfireAegisActive,
  isShadowRunnerMirrorWardActive,
  isShadowRunnerSunsteelEdgeActive,
  isShadowRunnerSunsteelStrikeActive,
  isShadowRunnerAetherStepActive,
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

  it('applies Gale Mantle healing, duration, speed, fall mitigation, and score', () => {
    const levelNine = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
    const state = createInitialShadowRunnerSimulation(levelNine)
    const galeMantle = levelNine.galeMantlePickups![0]
    state.player.health = 7

    collectShadowRunnerGaleMantle(state, 1000, galeMantle)

    expect(state.player.health).toBe(7 + galeMantle.healthRestore)
    expect(state.player.score).toBe(galeMantle.scoreValue)
    expect(isShadowRunnerGaleMantleActive(state, 1200)).toBe(true)
    expect(getShadowRunnerGaleSpeedMultiplier(state, 1200)).toBe(galeMantle.speedMultiplier)
    expect(getShadowRunnerGaleFallDamageCap(state, 1200)).toBe(galeMantle.fallDamageCap)

    const hud = getShadowRunnerHudState(state, levelNine.coins.length, 1200)
    expect(hud.galeMantleActive).toBe(true)
    expect(hud.galeMantleRemainingMs).toBeGreaterThan(0)
    expect(hud.galeMantleSpeedMultiplier).toBe(galeMantle.speedMultiplier)
    expect(hud.galeMantleFallDamageCap).toBe(galeMantle.fallDamageCap)

    expect(isShadowRunnerGaleMantleActive(state, 20_000)).toBe(false)
    expect(getShadowRunnerGaleSpeedMultiplier(state, 20_000)).toBe(1)
    expect(getShadowRunnerGaleFallDamageCap(state, 20_000)).toBeNull()
  })

  it('uses Sunsteel Edge charges to expose one enhanced strike at a time', () => {
    const levelNine = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
    const state = createInitialShadowRunnerSimulation(levelNine)
    const sunsteelEdge = levelNine.sunsteelEdgePickups![0]
    state.player.health = 8

    collectShadowRunnerSunsteelEdge(state, 1000, sunsteelEdge)

    expect(state.player.health).toBe(8 + sunsteelEdge.healthRestore)
    expect(state.player.score).toBe(sunsteelEdge.scoreValue)
    expect(state.player.sunsteelEdgeCharges).toBe(sunsteelEdge.charges)
    expect(isShadowRunnerSunsteelEdgeActive(state, 1200)).toBe(true)
    expect(consumeShadowRunnerSunsteelCharge(state, 1200, 300)).toBe(true)
    expect(state.player.sunsteelEdgeCharges).toBe(sunsteelEdge.charges - 1)
    expect(isShadowRunnerSunsteelStrikeActive(state, 1400)).toBe(true)
    expect(getShadowRunnerSunsteelStrikeProperties(state, 1400)).toEqual({
      attackDamageBonus: sunsteelEdge.attackDamageBonus,
      guardDamage: sunsteelEdge.guardDamage,
      reachBonus: sunsteelEdge.reachBonus,
    })
    expect(isShadowRunnerSunsteelStrikeActive(state, 1500)).toBe(false)
    expect(getShadowRunnerSunsteelStrikeProperties(state, 1500)).toEqual({
      attackDamageBonus: 0,
      guardDamage: 0,
      reachBonus: 0,
    })

    state.player.sunsteelEdgeCharges = 1
    expect(consumeShadowRunnerSunsteelCharge(state, 1600)).toBe(true)
    expect(state.player.sunsteelEdgeCharges).toBe(0)
    expect(isShadowRunnerSunsteelEdgeActive(state, 1601)).toBe(false)
    expect(isShadowRunnerSunsteelStrikeActive(state, 1601)).toBe(true)
    expect(consumeShadowRunnerSunsteelCharge(state, 1900)).toBe(false)
  })

  it('reports Level 9 ordinary, full, and perfect completion independently', () => {
    const levelNine = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
    const state = createInitialShadowRunnerSimulation(levelNine)

    levelNine.objectivePickups?.forEach(pickup => collectShadowRunnerObjective(state, pickup))
    const requiredEnemy = state.enemies.find(enemy => levelNine.requiredEnemyIds?.includes(enemy.id))
    expect(requiredEnemy).toBeDefined()
    requiredEnemy!.health = 0
    requiredEnemy!.alive = false

    let hud = getShadowRunnerHudState(state, levelNine.coins.length)
    expect(hud.objectiveLabel).toBe('Watchfire Crests')
    expect(hud.objectiveGateOpen).toBe(true)
    expect(hud.fullClear).toBe(false)
    expect(hud.perfectRoute).toBe(false)

    levelNine.masteryPickups?.forEach(pickup => collectShadowRunnerMastery(state, pickup))
    levelNine.coins.forEach(() => collectShadowRunnerCoin(state))
    state.enemies.forEach(enemy => {
      enemy.health = 0
      enemy.alive = false
    })

    hud = getShadowRunnerHudState(state, levelNine.coins.length)
    expect(hud.masteryLabel).toBe("Captain's Orders")
    expect(hud.fullClear).toBe(true)
    expect(hud.perfectRoute).toBe(true)

    spendShadowRunnerLife(state)
    hud = getShadowRunnerHudState(state, levelNine.coins.length)
    expect(hud.fullClear).toBe(true)
    expect(hud.perfectRoute).toBe(false)
  })

  it('keeps Level 9 objectives and defeated enemies sticky after a life loss', () => {
    const levelNine = SHADOW_RUNNER_LEVEL_CONFIGS['level-9']
    const state = createInitialShadowRunnerSimulation(levelNine)
    const crest = levelNine.objectivePickups![0]
    const defeatedEnemy = state.enemies[0]

    collectShadowRunnerObjective(state, crest)
    defeatedEnemy.health = 0
    defeatedEnemy.alive = false
    const scoreBeforeRespawn = state.player.score

    expect(spendShadowRunnerLife(state)).toBe(true)
    expect(state.player.objectiveItems).toBe(1)
    expect(defeatedEnemy.alive).toBe(false)
    expect(defeatedEnemy.health).toBe(0)
    expect(state.player.score).toBe(Math.max(0, scoreBeforeRespawn - 50))
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

  it('keeps a cleared sealed encounter open across a checkpoint respawn', () => {
    const levelEight = SHADOW_RUNNER_LEVEL_CONFIGS['level-8']
    const state = createInitialShadowRunnerSimulation(levelEight)
    const encounter = levelEight.encounters!.find(current => current.id === 'catacomb-encounter-sanctum')!
    const encounterEnemies = state.enemies.filter(enemy => encounter.enemyIds.includes(enemy.id))

    encounterEnemies.forEach(enemy => {
      enemy.activated = true
    })
    expect(getShadowRunnerEncounterBarrierState(state.enemies, encounter.enemyIds)).toEqual({
      active: true,
      cleared: false,
    })

    encounterEnemies.forEach(enemy => {
      enemy.health = 0
      enemy.alive = false
    })
    const cleared = getShadowRunnerEncounterBarrierState(state.enemies, encounter.enemyIds)
    expect(cleared).toEqual({ active: false, cleared: true })

    spendShadowRunnerLife(state)
    encounterEnemies[0].alive = true
    expect(getShadowRunnerEncounterBarrierState(
      state.enemies,
      encounter.enemyIds,
      cleared.cleared,
    )).toEqual({ active: false, cleared: true })
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

  it('applies Dawnfire Aegis offense, resistance, healing, and expiry', () => {
    const levelTen = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
    const state = createInitialShadowRunnerSimulation(levelTen)
    const pickup = levelTen.dawnfireAegisPickups![0]
    state.player.health = 5

    collectShadowRunnerDawnfireAegis(state, 1000, pickup)

    expect(state.player.health).toBe(5 + pickup.healthRestore)
    expect(state.player.score).toBe(pickup.scoreValue)
    expect(isShadowRunnerDawnfireAegisActive(state, 1200)).toBe(true)
    expect(getShadowRunnerDawnfireProperties(state, 1200)).toEqual({
      attackDamageBonus: pickup.attackDamageBonus,
      guardDamage: pickup.guardDamage,
      damageResistanceMultiplier: pickup.damageResistanceMultiplier,
    })
    expect(getShadowRunnerHudState(state, levelTen.coins.length, 1200).dawnfireAegisActive)
      .toBe(true)
    expect(isShadowRunnerDawnfireAegisActive(state, 1001 + pickup.durationMs)).toBe(false)
    expect(getShadowRunnerDawnfireProperties(state, 1001 + pickup.durationMs).damageResistanceMultiplier)
      .toBe(1)
  })

  it('applies Aether Step movement, extra jump, fall protection, healing, and expiry', () => {
    const levelTen = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
    const state = createInitialShadowRunnerSimulation(levelTen)
    const pickup = levelTen.aetherStepPickups![0]
    state.player.health = 7

    collectShadowRunnerAetherStep(state, 2000, pickup)

    expect(state.player.health).toBe(7 + pickup.healthRestore)
    expect(isShadowRunnerAetherStepActive(state, 2200)).toBe(true)
    expect(getShadowRunnerAetherSpeedMultiplier(state, 2200)).toBe(pickup.speedMultiplier)
    expect(getShadowRunnerAetherExtraAirJumps(state, 2200)).toBe(pickup.extraAirJumps)
    expect(doesShadowRunnerAetherPreventFallDamage(state, 2200)).toBe(true)
    const hud = getShadowRunnerHudState(state, levelTen.coins.length, 2200)
    expect(hud.aetherStepActive).toBe(true)
    expect(hud.aetherStepExtraAirJumps).toBe(1)
    expect(hud.aetherStepPreventsFallDamage).toBe(true)

    const expiredAt = 2001 + pickup.durationMs
    expect(isShadowRunnerAetherStepActive(state, expiredAt)).toBe(false)
    expect(getShadowRunnerAetherSpeedMultiplier(state, expiredAt)).toBe(1)
    expect(getShadowRunnerAetherExtraAirJumps(state, expiredAt)).toBe(0)
    expect(doesShadowRunnerAetherPreventFallDamage(state, expiredAt)).toBe(false)
  })

  it('reports Level 10 ordinary, full, and perfect completion independently', () => {
    const levelTen = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
    const state = createInitialShadowRunnerSimulation(levelTen)

    levelTen.objectivePickups?.forEach(pickup => collectShadowRunnerObjective(state, pickup))
    const requiredEnemy = state.enemies.find(enemy => levelTen.requiredEnemyIds?.includes(enemy.id))
    expect(requiredEnemy).toBeDefined()
    requiredEnemy!.health = 0
    requiredEnemy!.alive = false

    let hud = getShadowRunnerHudState(state, levelTen.coins.length)
    expect(hud.objectiveLabel).toBe('Relay Flames')
    expect(hud.objectiveGateOpen).toBe(true)
    expect(hud.fullClear).toBe(false)
    expect(hud.perfectRoute).toBe(false)

    levelTen.masteryPickups?.forEach(pickup => collectShadowRunnerMastery(state, pickup))
    levelTen.coins.forEach(() => collectShadowRunnerCoin(state))
    state.enemies.forEach(enemy => {
      enemy.health = 0
      enemy.alive = false
    })

    hud = getShadowRunnerHudState(state, levelTen.coins.length)
    expect(hud.masteryLabel).toBe('Last Dispatches')
    expect(hud.fullClear).toBe(true)
    expect(hud.perfectRoute).toBe(true)

    spendShadowRunnerLife(state)
    hud = getShadowRunnerHudState(state, levelTen.coins.length)
    expect(hud.fullClear).toBe(true)
    expect(hud.perfectRoute).toBe(false)
  })
})
