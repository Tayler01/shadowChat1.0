import type {
  ShadowRunnerBoostPickup,
  ShadowRunnerChronoPickup,
  ShadowRunnerEnemyConfig,
  ShadowRunnerEnemyKind,
  ShadowRunnerLevelConfig,
  ShadowRunnerShieldPickup,
} from './levels'

export interface ShadowRunnerHudState {
  lives: number
  maxLives: number
  health: number
  maxHealth: number
  enemyHealth: number
  enemyMaxHealth: number
  levelId: string
  levelTitle: string
  levelSubtitle: string
  completionLine: string
  coins: number
  totalCoins: number
  score: number
  boostActive: boolean
  boostRemainingMs: number
  boostGuardCharges: number
  shieldActive: boolean
  shieldRemainingMs: number
  shieldGuardCharges: number
  chronoActive: boolean
  chronoRemainingMs: number
  chronoTimeScale: number
  enemiesDefeated: number
  totalEnemies: number
  objective: string
  defeated: boolean
  outOfLives: boolean
}

export interface ShadowRunnerEnemyState {
  id: string
  kind: ShadowRunnerEnemyKind
  health: number
  maxHealth: number
  alive: boolean
  direction: 1 | -1
  patrolLeft: number
  patrolRight: number
  patrolSpeed?: number
  lastShotAt: number
  lastDamagedAt: number
  attackUntil: number
}

export interface ShadowRunnerSimulationState {
  player: {
    lives: number
    maxLives: number
    health: number
    maxHealth: number
    coins: number
    score: number
    facing: 1 | -1
    attackingUntil: number
    attackCooldownUntil: number
    boostActiveUntil: number
    boostGuardCharges: number
    shieldActiveUntil: number
    shieldGuardCharges: number
    chronoActiveUntil: number
    chronoTimeScale: number
    lastDamagedAt: number
  }
  enemy: ShadowRunnerEnemyState
  enemies: ShadowRunnerEnemyState[]
  level: {
    id: string
    title: string
    subtitle: string
    completionLine: string
  }
  objective: string
  defeated: boolean
  outOfLives: boolean
}

export const SHADOW_RUNNER_MAX_HEALTH = 12

function createEnemyState(enemy: ShadowRunnerEnemyConfig): ShadowRunnerEnemyState {
  return {
    id: enemy.id,
    kind: enemy.kind,
    health: enemy.health,
    maxHealth: enemy.maxHealth,
    alive: true,
    direction: enemy.direction,
    patrolLeft: enemy.patrolLeft,
    patrolRight: enemy.patrolRight,
    patrolSpeed: enemy.patrolSpeed,
    lastShotAt: 0,
    lastDamagedAt: Number.NEGATIVE_INFINITY,
    attackUntil: 0,
  }
}

function createEmptyEnemyState(): ShadowRunnerEnemyState {
  return {
    id: 'none',
    kind: 'clockwork-sentry',
    health: 0,
    maxHealth: 0,
    alive: false,
    direction: -1,
    patrolLeft: 0,
    patrolRight: 0,
    lastShotAt: 0,
    lastDamagedAt: Number.NEGATIVE_INFINITY,
    attackUntil: 0,
  }
}

export function createInitialShadowRunnerSimulation(
  level: ShadowRunnerLevelConfig,
): ShadowRunnerSimulationState {
  const enemies = level.enemies ?? (level.enemy ? [level.enemy] : [])
  const enemyStates = enemies.map(createEnemyState)
  const primaryEnemy = enemyStates[0] ?? createEmptyEnemyState()

  return {
    player: {
      lives: 3,
      maxLives: 3,
      health: SHADOW_RUNNER_MAX_HEALTH,
      maxHealth: SHADOW_RUNNER_MAX_HEALTH,
      coins: 0,
      score: 0,
      facing: 1,
      attackingUntil: 0,
      attackCooldownUntil: 0,
      boostActiveUntil: 0,
      boostGuardCharges: 0,
      shieldActiveUntil: 0,
      shieldGuardCharges: 0,
      chronoActiveUntil: 0,
      chronoTimeScale: 1,
      lastDamagedAt: Number.NEGATIVE_INFINITY,
    },
    enemy: primaryEnemy,
    enemies: enemyStates,
    level: {
      id: level.id,
      title: level.title,
      subtitle: level.subtitle,
      completionLine: level.completionLine,
    },
    objective: level.objective,
    defeated: false,
    outOfLives: false,
  }
}

export function getShadowRunnerHudState(
  state: ShadowRunnerSimulationState,
  totalCoins: number,
  time = 0,
): ShadowRunnerHudState {
  const activeEnemy = state.enemies.find(enemy => enemy.alive) ?? state.enemies[0] ?? state.enemy
  const rawBoostRemainingMs = Math.max(0, state.player.boostActiveUntil - time)
  const boostRemainingMs = rawBoostRemainingMs > 0
    ? Math.ceil(rawBoostRemainingMs / 1000) * 1000
    : 0
  const rawShieldRemainingMs = Math.max(0, state.player.shieldActiveUntil - time)
  const shieldRemainingMs = rawShieldRemainingMs > 0
    ? Math.ceil(rawShieldRemainingMs / 1000) * 1000
    : 0
  const rawChronoRemainingMs = Math.max(0, state.player.chronoActiveUntil - time)
  const chronoRemainingMs = rawChronoRemainingMs > 0
    ? Math.ceil(rawChronoRemainingMs / 1000) * 1000
    : 0
  const totalEnemies = state.enemies.length
  const enemiesDefeated = state.enemies.filter(enemy => !enemy.alive).length

  return {
    lives: state.player.lives,
    maxLives: state.player.maxLives,
    health: state.player.health,
    maxHealth: state.player.maxHealth,
    enemyHealth: activeEnemy?.alive ? activeEnemy.health : 0,
    enemyMaxHealth: activeEnemy?.maxHealth ?? 0,
    levelId: state.level.id,
    levelTitle: state.level.title,
    levelSubtitle: state.level.subtitle,
    completionLine: state.level.completionLine,
    coins: state.player.coins,
    totalCoins,
    score: state.player.score,
    boostActive: boostRemainingMs > 0,
    boostRemainingMs,
    boostGuardCharges: state.player.boostGuardCharges,
    shieldActive: shieldRemainingMs > 0,
    shieldRemainingMs,
    shieldGuardCharges: state.player.shieldGuardCharges,
    chronoActive: chronoRemainingMs > 0,
    chronoRemainingMs,
    chronoTimeScale: chronoRemainingMs > 0 ? state.player.chronoTimeScale : 1,
    enemiesDefeated,
    totalEnemies,
    objective: state.objective,
    defeated: state.defeated,
    outOfLives: state.outOfLives,
  }
}

export function isShadowRunnerBoostActive(state: ShadowRunnerSimulationState, time: number) {
  return state.player.boostActiveUntil > time
}

export function isShadowRunnerShieldActive(state: ShadowRunnerSimulationState, time: number) {
  return state.player.shieldActiveUntil > time
}

export function isShadowRunnerChronoActive(state: ShadowRunnerSimulationState, time: number) {
  return state.player.chronoActiveUntil > time
}

export function getShadowRunnerChronoTimeScale(state: ShadowRunnerSimulationState, time: number) {
  return isShadowRunnerChronoActive(state, time)
    ? Math.min(1, Math.max(0.35, state.player.chronoTimeScale))
    : 1
}

export function blockShadowRunnerProjectileWithShield(state: ShadowRunnerSimulationState, time: number) {
  if (!isShadowRunnerShieldActive(state, time) || state.player.shieldGuardCharges <= 0) return false

  state.player.shieldGuardCharges -= 1
  state.player.score += 10
  return true
}

export function damageShadowRunnerPlayer(state: ShadowRunnerSimulationState, time: number, amount = 1) {
  if (time - state.player.lastDamagedAt < 820) return false

  state.player.lastDamagedAt = time
  if (isShadowRunnerBoostActive(state, time) && state.player.boostGuardCharges > 0) {
    state.player.boostGuardCharges -= 1
    state.player.score = Math.max(0, state.player.score - 5)
    return true
  }

  const damageAmount = Math.max(1, Math.floor(amount))
  state.player.health = Math.max(0, state.player.health - damageAmount)
  state.player.score = Math.max(0, state.player.score - (isShadowRunnerBoostActive(state, time) ? 8 : 15) * damageAmount)
  return true
}

export function restoreShadowRunnerPlayer(state: ShadowRunnerSimulationState) {
  state.player.health = state.player.maxHealth
}

export function spendShadowRunnerLife(state: ShadowRunnerSimulationState) {
  state.player.lives = Math.max(0, state.player.lives - 1)
  state.player.score = Math.max(0, state.player.score - 50)

  if (state.player.lives <= 0) {
    state.outOfLives = true
    state.objective = 'Route failed'
  }

  return state.player.lives > 0
}

export function damageShadowRunnerEnemy(
  state: ShadowRunnerSimulationState,
  time: number,
  amount: number,
  enemyId?: string,
) {
  const enemy = enemyId
    ? state.enemies.find(current => current.id === enemyId)
    : state.enemies.find(current => current.alive)

  if (!enemy?.alive || time - enemy.lastDamagedAt < 220) return false

  enemy.lastDamagedAt = time
  enemy.health = Math.max(0, enemy.health - amount)
  state.player.score += amount === 1 ? 50 : 75

  if (enemy.health <= 0) {
    enemy.alive = false
    state.player.score += 150
    if (!state.enemies.some(current => current.alive)) {
      state.objective = 'Gate path clear'
    }
  }

  return true
}

export function collectShadowRunnerCoin(state: ShadowRunnerSimulationState) {
  state.player.coins += 1
  state.player.score += 25
}

export function collectShadowRunnerBoost(
  state: ShadowRunnerSimulationState,
  time: number,
  boost: ShadowRunnerBoostPickup,
) {
  state.player.score += boost.scoreValue ?? 125
  state.player.health = state.player.maxHealth
  state.player.boostActiveUntil = Math.max(state.player.boostActiveUntil, time) + (boost.durationMs ?? 8000)
  state.player.boostGuardCharges = Math.max(state.player.boostGuardCharges, boost.guardCharges ?? 2)
}

export function collectShadowRunnerShield(
  state: ShadowRunnerSimulationState,
  time: number,
  shield: ShadowRunnerShieldPickup,
) {
  state.player.score += shield.scoreValue ?? 90
  state.player.shieldActiveUntil = Math.max(state.player.shieldActiveUntil, time) + (shield.durationMs ?? 9000)
  state.player.shieldGuardCharges = Math.max(state.player.shieldGuardCharges, shield.guardCharges ?? 4)
}

export function collectShadowRunnerChrono(
  state: ShadowRunnerSimulationState,
  time: number,
  chrono: ShadowRunnerChronoPickup,
) {
  const alreadyActive = isShadowRunnerChronoActive(state, time)
  state.player.score += chrono.scoreValue ?? 150
  state.player.health = Math.min(
    state.player.maxHealth,
    state.player.health + (chrono.healthRestore ?? 3),
  )
  state.player.chronoActiveUntil = Math.max(state.player.chronoActiveUntil, time) + (chrono.durationMs ?? 9000)
  state.player.chronoTimeScale = alreadyActive
    ? Math.min(state.player.chronoTimeScale, chrono.timeScale ?? 0.58)
    : chrono.timeScale ?? 0.58
}
