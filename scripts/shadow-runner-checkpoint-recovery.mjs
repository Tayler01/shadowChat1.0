function requireEvidence(condition, message) {
  if (!condition) throw new Error(`Checkpoint recovery: ${message}`)
}

export function validateCheckpointRecovery(policy) {
  requireEvidence((policy.mode ?? 'normal') === 'normal', 'only normal routes may recover')
  requireEvidence(Array.isArray(policy.recoveryPoints) && policy.recoveryPoints.length > 0
    && policy.recoveryPoints.length <= 32, 'authored recovery points are required')
  const ids = new Set()
  for (const point of policy.recoveryPoints) {
    requireEvidence(point && Object.keys(point).length === 4
      && ['checkpointId', 'stepId', 'x', 'y'].every(key => Object.hasOwn(point, key))
      && typeof point.checkpointId === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(point.checkpointId)
      && !ids.has(point.checkpointId) && Number.isFinite(point.x) && point.x >= 0
      && point.x <= policy.worldWidth && Number.isFinite(point.y) && point.y > 0
      && policy.steps.some(step => step.id === point.stepId && step.kind !== 'finish'), 'invalid recovery point')
    ids.add(point.checkpointId)
  }
  return policy
}

function readEvidence(debug) {
  const player = debug.player
  requireEvidence(player && typeof debug.respawnPending === 'boolean'
    && Number.isSafeInteger(player.lives) && player.lives >= 0 && player.lives <= 3
    && Number.isSafeInteger(player.checkpointRespawns) && player.checkpointRespawns >= 0
    && Number.isFinite(player.health) && player.health >= 0 && player.health <= 12,
  'missing or invalid life/respawn readback')
  const counters = Object.fromEntries(['coins', 'moonShards', 'objectiveItems', 'masteryItems'].map(key => {
    requireEvidence(Number.isSafeInteger(player[key]) && player[key] >= 0, `missing counter ${key}`)
    return [key, player[key]]
  }))
  requireEvidence(Array.isArray(debug.collectedPowerIds) && debug.collectedPowerIds.every(id => typeof id === 'string' && id.length > 0)
    && new Set(debug.collectedPowerIds).size === debug.collectedPowerIds.length, 'missing collected power identities')
  requireEvidence(Array.isArray(debug.enemies) && debug.enemies.every(enemy => typeof enemy.id === 'string'
    && typeof enemy.alive === 'boolean' && Number.isFinite(enemy.health) && enemy.health >= 0)
    && new Set(debug.enemies.map(enemy => enemy.id)).size === debug.enemies.length, 'missing enemy state')
  return { lives: player.lives, respawns: player.checkpointRespawns, checkpointId: debug.checkpointId ?? null,
    counters, powers: [...debug.collectedPowerIds], enemies: debug.enemies.map(({ id, alive, health }) => ({ id, alive, health })) }
}

export function createCheckpointRecovery(policy, debug) {
  validateCheckpointRecovery(policy)
  const previous = readEvidence(debug)
  requireEvidence(previous.lives === 3 && previous.respawns === 0 && !debug.respawnPending
    && previous.checkpointId === null && debug.player.health > 0 && previous.powers.length === 0 && previous.enemies.every(enemy => enemy.alive)
    && Object.values(previous.counters).every(value => value === 0), 'attempt must begin with untouched lives and rewards')
  return { previous, pending: null, recovered: 0, consumedAtDeath: new Set(), earnedAtDeath: {}, lastAt: 0 }
}

// This tracker receives detached observations only, never a page or game-state reference.
export function observeCheckpointRecovery(policy, tracker, debug, index, now) {
  requireEvidence(Number.isSafeInteger(index) && index >= 0 && index < policy.steps.length
    && Number.isFinite(now) && now >= tracker.lastAt, 'invalid route index or observation time')
  tracker.lastAt = now
  const current = readEvidence(debug)
  const previous = tracker.previous
  const checkpointIndex = current.checkpointId === null ? -1 : policy.recoveryPoints.findIndex(point => point.checkpointId === current.checkpointId)
  const previousCheckpointIndex = previous.checkpointId === null ? -1 : policy.recoveryPoints.findIndex(point => point.checkpointId === previous.checkpointId)
  requireEvidence((current.checkpointId === null || checkpointIndex >= 0) && checkpointIndex >= previousCheckpointIndex,
    'checkpoint disappeared, regressed or is unknown')
  const lost = previous.lives - current.lives
  requireEvidence(lost === 0 || lost === 1, 'lives increased or multiple losses were unobserved')
  requireEvidence(current.respawns - previous.respawns === lost, 'life loss and respawn count disagree')
  for (const [key, count] of Object.entries(previous.counters)) {
    requireEvidence(current.counters[key] >= count, `${key} reset during recovery`)
  }
  requireEvidence(previous.powers.every(id => current.powers.includes(id)), 'collected power state reset')
  requireEvidence(current.enemies.length === previous.enemies.length && previous.enemies.every(enemy => {
    const next = current.enemies.find(item => item.id === enemy.id)
    return next && (enemy.alive || !next.alive) && next.health <= enemy.health
  }), 'enemy catalog changed or defeated enemies revived')
  if (current.lives === 0) throw new Error('Natural lives exhausted; no restoration or retry performed')

  if (lost) {
    requireEvidence(!tracker.pending && tracker.recovered < 2, 'another life lost before recovery completed')
    const point = current.checkpointId === null
      ? { ...policy.start, stepId: policy.steps[0].id, checkpointId: null }
      : policy.recoveryPoints.find(item => item.checkpointId === current.checkpointId)
    requireEvidence(point, `unknown checkpoint ${current.checkpointId}`)
    const restartIndex = policy.steps.findIndex(step => step.id === point.stepId)
    requireEvidence(restartIndex >= 0 && restartIndex <= index, 'resume would skip uncompleted route steps')
    tracker.pending = { point, restartIndex, fromStep: policy.steps[index].id, startedAt: now,
      enemies: current.enemies, lives: current.lives }
    current.powers.forEach(id => tracker.consumedAtDeath.add(id))
    tracker.earnedAtDeath = { ...current.counters }
  }
  tracker.previous = current
  if (!tracker.pending) {
    requireEvidence(!debug.respawnPending && debug.player.health > 0, 'respawn without a witnessed life loss')
    return { kind: 'continue' }
  }
  const pending = tracker.pending
  requireEvidence(now - pending.startedAt <= 3000, 'respawn did not finish within its bounded wait')
  requireEvidence(current.checkpointId === pending.point.checkpointId, 'checkpoint changed during respawn')
  requireEvidence(pending.enemies.every(enemy => current.enemies.find(item => item.id === enemy.id).health <= enemy.health),
    'enemy health restored during respawn')
  if (debug.respawnPending) return { kind: 'wait', started: Boolean(lost) }
  const player = debug.player
  requireEvidence(player.health > 0 && Math.abs(player.x - pending.point.x) <= 32
    && Math.abs(player.bodyBottom - pending.point.y) <= 12 && Math.abs(player.velocityY) <= 24,
  'player did not return to the observed authored checkpoint')
  tracker.pending = null
  tracker.recovered += 1
  return { kind: 'resume', index: pending.restartIndex, event: { kind: 'checkpoint-recovery',
    checkpointId: pending.point.checkpointId, fromStep: pending.fromStep, toStep: pending.point.stepId,
    lives: current.lives, respawns: current.respawns, consumedPowerIds: [...tracker.consumedAtDeath] } }
}

export function stepAfterCheckpointRecovery(step, tracker) {
  if (step.kind === 'relic' && step.recoverySkipIfEarned === true && tracker?.recovered
    && !tracker.pending && tracker.earnedAtDeath[step.counter] >= step.minCount) {
    // Only an explicitly optional revisit may be omitted; traversal anchors remain intact.
    return { id: step.id, kind: 'wait', durationMs: 0 }
  }
  if (step.kind !== 'power' || !tracker?.recovered || !tracker.consumedAtDeath.has(step.pickupId)) return step
  // Revisit the route position, not a spent pickup or an invented renewed buff.
  return { id: step.id, kind: 'move', x: step.x, y: step.y,
    ...(step.crouch === undefined ? {} : { crouch: step.crouch }),
    ...(step.braceWindZoneId === undefined ? {} : { braceWindZoneId: step.braceWindZoneId }),
    ...(step.beamDodge === undefined ? {} : { beamDodge: step.beamDodge }),
    ...(step.arrowDodge === undefined ? {} : { arrowDodge: step.arrowDodge }),
    ...(step.timeoutMs === undefined ? {} : { timeoutMs: step.timeoutMs }) }
}
