import type { ShadowRunnerCheckpoint, ShadowRunnerEncounterConfig, ShadowRunnerRelayBeamZone } from './levels'
import { getShadowRunnerEncounterBarrierState, type ShadowRunnerEnemyState } from './simulation'

export interface ShadowRunnerBodyBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export function advanceShadowRunnerActiveTime(time: number, delta: number) {
  return time + (Number.isFinite(delta) ? Math.max(0, delta) : 0)
}

export function getShadowRunnerLandingDamage(takeoffY: number | null, landingY: number) {
  if (takeoffY === null) return 0
  const netDrop = landingY - takeoffY
  return netDrop >= 500 ? 4 : netDrop >= 330 ? 2 : 0
}

export function findShadowRunnerCheckpoint(
  checkpoints: readonly ShadowRunnerCheckpoint[],
  currentIndex: number,
  point: { x: number; y: number },
) {
  let activatedIndex = currentIndex
  for (let index = currentIndex + 1; index < checkpoints.length; index += 1) {
    const checkpoint = checkpoints[index]
    if (
      point.x >= checkpoint.x
      && point.x <= checkpoint.x + (checkpoint.triggerWidth ?? 160)
      && point.y >= (checkpoint.minY ?? checkpoint.y - 120)
      && point.y <= (checkpoint.maxY ?? checkpoint.y + 24)
    ) activatedIndex = index
  }
  return activatedIndex
}

export function getShadowRunnerEncounterRecoveryIds(
  encounters: readonly ShadowRunnerEncounterConfig[],
  enemies: ShadowRunnerEnemyState[],
  clearedIds: ReadonlySet<string>,
  spawn: { x: number; y: number },
) {
  return encounters.filter(encounter => {
    if (!encounter.sealed) return false
    const state = getShadowRunnerEncounterBarrierState(enemies, encounter.enemyIds, clearedIds.has(encounter.id))
    const inside = spawn.x >= encounter.x
      && spawn.x <= encounter.x + encounter.width - 66
      && spawn.y >= encounter.y
      && spawn.y <= encounter.y + encounter.height
    return state.active && !inside
  }).map(encounter => encounter.id)
}

export function isShadowRunnerEncounterReentered(
  body: ShadowRunnerBodyBounds,
  encounter: ShadowRunnerEncounterConfig,
) {
  // The 30px barriers are centered 34px before each encounter boundary.
  return body.left >= encounter.x - 19
    && body.right <= encounter.x + encounter.width - 49
    && body.bottom > encounter.y
    && body.top < encounter.y + encounter.height
}

export function canShadowRunnerStand(
  body: ShadowRunnerBodyBounds,
  standingHeight: number,
  obstacles: readonly ShadowRunnerBodyBounds[],
) {
  const top = body.bottom - standingHeight
  return !obstacles.some(obstacle => (
    body.right > obstacle.left + 0.01
    && body.left < obstacle.right - 0.01
    && body.bottom > obstacle.top + 0.01
    && top < obstacle.bottom - 0.01
  ))
}

export function shouldShadowRunnerCrouch(
  requested: boolean,
  grounded: boolean,
  wasCrouching: boolean,
  standingClear: boolean,
) {
  return (requested && grounded) || (wasCrouching && !standingClear)
}

export function canShadowRunnerSwordHit(
  enemy: Pick<ShadowRunnerEnemyState, 'id' | 'alive' | 'activated'> | undefined,
  hitIds: ReadonlySet<string>,
) {
  return Boolean(enemy?.alive && enemy.activated && !hitIds.has(enemy.id))
}

export function getShadowRunnerBeamCycle(
  time: number,
  zone: Pick<ShadowRunnerRelayBeamZone, 'cadenceMs' | 'tellDurationMs' | 'activeDurationMs' | 'delayMs'>,
  activatedAt?: number,
) {
  // A newly armed arena always starts at the beginning of its warning.
  const elapsed = activatedAt === undefined
    ? time + (zone.delayMs ?? 0)
    : Math.max(0, time - activatedAt)
  const cycleIndex = Math.floor(elapsed / zone.cadenceMs)
  const cycle = elapsed % zone.cadenceMs
  const state = cycle < zone.tellDurationMs
    ? 'telling'
    : cycle < zone.tellDurationMs + zone.activeDurationMs
      ? 'active'
      : 'idle'
  return { cycleIndex, state } as const
}

export interface ShadowRunnerSpectralGrace {
  poweredSupportId: string | null
  platformId: string | null
  until: number
}

export function createShadowRunnerSpectralGrace(): ShadowRunnerSpectralGrace {
  return { poweredSupportId: null, platformId: null, until: 0 }
}

export function updateShadowRunnerSpectralGrace(
  previous: ShadowRunnerSpectralGrace,
  powerActive: boolean,
  powerDeadline: number,
  time: number,
  supportedPlatformId: string | null,
): ShadowRunnerSpectralGrace {
  if (powerActive) {
    return { poweredSupportId: supportedPlatformId, platformId: null, until: 0 }
  }
  const platformId = previous.platformId ?? previous.poweredSupportId
  const until = previous.platformId === null ? powerDeadline + 650 : previous.until
  if (platformId !== null && platformId === supportedPlatformId && time < until) {
    return { poweredSupportId: null, platformId, until }
  }
  return createShadowRunnerSpectralGrace()
}

export function getShadowRunnerReflectedVelocity(baseSpeedX: number, facing: 1 | -1) {
  return { x: baseSpeedX === 0 ? facing * 520 : -baseSpeedX * 1.12, y: 0 }
}

export const SHADOW_RUNNER_HAZARD_HITBOXES = {
  candle: { width: 22, height: 38, offsetX: 6, offsetY: 12 },
  storm: { width: 58, height: 26, offsetX: 6, offsetY: 12 },
} as const
