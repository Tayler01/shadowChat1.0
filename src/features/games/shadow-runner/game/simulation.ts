export interface ShadowRunnerHudState {
  lives: number
  maxLives: number
  health: number
  maxHealth: number
  enemyHealth: number
  enemyMaxHealth: number
  coins: number
  totalCoins: number
  score: number
  objective: string
  defeated: boolean
  outOfLives: boolean
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
    lastDamagedAt: number
  }
  enemy: {
    health: number
    maxHealth: number
    alive: boolean
    direction: 1 | -1
    patrolLeft: number
    patrolRight: number
    lastDamagedAt: number
  }
  objective: string
  defeated: boolean
  outOfLives: boolean
}

export function createInitialShadowRunnerSimulation(): ShadowRunnerSimulationState {
  return {
    player: {
      lives: 3,
      maxLives: 3,
      health: 3,
      maxHealth: 3,
      coins: 0,
      score: 0,
      facing: 1,
      attackingUntil: 0,
      attackCooldownUntil: 0,
      lastDamagedAt: 0,
    },
    enemy: {
      health: 3,
      maxHealth: 3,
      alive: true,
      direction: -1,
      patrolLeft: 1240,
      patrolRight: 1600,
      lastDamagedAt: 0,
    },
    objective: 'Reach the east gate',
    defeated: false,
    outOfLives: false,
  }
}

export function getShadowRunnerHudState(
  state: ShadowRunnerSimulationState,
  totalCoins: number,
): ShadowRunnerHudState {
  return {
    lives: state.player.lives,
    maxLives: state.player.maxLives,
    health: state.player.health,
    maxHealth: state.player.maxHealth,
    enemyHealth: state.enemy.alive ? state.enemy.health : 0,
    enemyMaxHealth: state.enemy.maxHealth,
    coins: state.player.coins,
    totalCoins,
    score: state.player.score,
    objective: state.objective,
    defeated: state.defeated,
    outOfLives: state.outOfLives,
  }
}

export function damageShadowRunnerPlayer(state: ShadowRunnerSimulationState, time: number) {
  if (time - state.player.lastDamagedAt < 820) return false

  state.player.lastDamagedAt = time
  state.player.health = Math.max(0, state.player.health - 1)
  state.player.score = Math.max(0, state.player.score - 15)
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

export function damageClockworkSentry(state: ShadowRunnerSimulationState, time: number, amount: number) {
  if (!state.enemy.alive || time - state.enemy.lastDamagedAt < 220) return false

  state.enemy.lastDamagedAt = time
  state.enemy.health = Math.max(0, state.enemy.health - amount)
  state.player.score += amount === 1 ? 50 : 75

  if (state.enemy.health <= 0) {
    state.enemy.alive = false
    state.player.score += 150
    state.objective = 'Gate path clear'
  }

  return true
}

export function collectShadowRunnerCoin(state: ShadowRunnerSimulationState) {
  state.player.coins += 1
  state.player.score += 25
}
