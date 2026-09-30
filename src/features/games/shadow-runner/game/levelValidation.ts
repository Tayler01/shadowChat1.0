import type { ShadowRunnerLevelConfig, ShadowRunnerRect } from './levels'

export interface ShadowRunnerGeometryIssue {
  code: 'invalid-id' | 'duplicate-id' | 'invalid-reference' | 'invalid-bounds'
    | 'embedded-pickup' | 'unsupported-underpass' | 'invalid-underpass-clearance'
  entityId: string
  relatedId?: string
}

export interface ShadowRunnerStanceHeights {
  standingHeight: number
  crouchedHeight: number
}

export function getShadowRunnerLevelPickups(level: ShadowRunnerLevelConfig) {
  return [
    ...level.coins,
    ...(level.boosts ?? []),
    ...(level.shieldPickups ?? []),
    ...(level.chronoPickups ?? []),
    ...(level.surgePickups ?? []),
    ...(level.moonShardPickups ?? []),
    ...(level.objectivePickups ?? []),
    ...(level.masteryPickups ?? []),
    ...(level.wraithlightPickups ?? []),
    ...(level.mirrorWardPickups ?? []),
    ...(level.galeMantlePickups ?? []),
    ...(level.sunsteelEdgePickups ?? []),
    ...(level.dawnfireAegisPickups ?? []),
    ...(level.aetherStepPickups ?? []),
  ]
}

function containsPoint(rect: ShadowRunnerRect, point: { x: number, y: number }) {
  return point.x > rect.x && point.x < rect.x + rect.width
    && point.y > rect.y && point.y < rect.y + rect.height
}

// Authored static checks only: moving/conditional surfaces, hazards and input timing
// still require real-physics replay. Passing this validator is not a route proof.
export function validateShadowRunnerLevelGeometry(
  level: ShadowRunnerLevelConfig,
  stance: ShadowRunnerStanceHeights,
): ShadowRunnerGeometryIssue[] {
  if (!Number.isFinite(stance.crouchedHeight) || !Number.isFinite(stance.standingHeight)
    || stance.crouchedHeight <= 0 || stance.standingHeight <= stance.crouchedHeight) {
    throw new RangeError('Geometry validation requires positive, ordered stance heights')
  }

  const issues: ShadowRunnerGeometryIssue[] = []
  const pickups = getShadowRunnerLevelPickups(level)
  const enemies = level.enemies?.length ? level.enemies : level.enemy ? [level.enemy] : []
  const solids = [...level.platforms, ...(level.crouchGates ?? [])]
  const rects = [
    ...solids,
    ...level.tiltPlatforms,
    ...(level.movingPlatforms ?? []),
    ...(level.spectralPlatforms ?? []),
    ...(level.phasePlatforms ?? []),
    ...level.spikes,
    ...(level.windZones ?? []),
    ...(level.relayBeamZones ?? []),
    ...(level.arrowVolleys ?? []),
    ...(level.encounters ?? []),
    level.finish,
  ]
  const points = [level.playerStart, ...(level.checkpoints ?? []), ...pickups, ...enemies]
  const seen = new Set<string>()
  const checkId = ({ id }: { id: string }) => {
    if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      issues.push({ code: 'invalid-id', entityId: id })
    }
    if (seen.has(id)) issues.push({ code: 'duplicate-id', entityId: id })
    seen.add(id)
  }
  ;[level, ...rects, ...points, ...enemies.flatMap(enemy => enemy.bossPhases ?? [])]
    .forEach(checkId)

  if (!Number.isFinite(level.worldWidth) || level.worldWidth <= 0
    || !Number.isFinite(level.worldHeight) || level.worldHeight <= 0) {
    issues.push({ code: 'invalid-bounds', entityId: level.id })
  }
  for (const point of [...rects, ...points]) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
      || point.x < 0 || point.x > level.worldWidth || point.y < 0 || point.y > level.worldHeight) {
      issues.push({ code: 'invalid-bounds', entityId: point.id })
    }
  }
  for (const rect of rects) {
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)
      || rect.width <= 0 || rect.height <= 0
      || rect.x + rect.width > level.worldWidth || rect.y + rect.height > level.worldHeight) {
      issues.push({ code: 'invalid-bounds', entityId: rect.id })
    }
  }
  for (const lift of level.movingPlatforms ?? []) {
    if (!Number.isFinite(lift.endY) || !Number.isFinite(lift.endX ?? lift.x)
      || lift.endY < 0 || lift.endY + lift.height > level.worldHeight
      || (lift.endX ?? lift.x) < 0 || (lift.endX ?? lift.x) + lift.width > level.worldWidth) {
      issues.push({ code: 'invalid-bounds', entityId: lift.id })
    }
  }

  const enemyIds = new Set(enemies.map(enemy => enemy.id))
  const encounterIds = new Set(level.encounters?.map(encounter => encounter.id))
  const checkReferences = (entityId: string, ids: string[], validIds: Set<string>) => {
    const references = new Set<string>()
    for (const id of ids) {
      if (!validIds.has(id) || references.has(id)) {
        issues.push({ code: 'invalid-reference', entityId, relatedId: id })
      }
      references.add(id)
    }
  }
  checkReferences(level.id, level.requiredEnemyIds ?? [], enemyIds)
  for (const encounter of level.encounters ?? []) {
    checkReferences(encounter.id, encounter.enemyIds, enemyIds)
  }
  for (const enemy of enemies) {
    if (enemy.encounterId !== undefined) {
      checkReferences(enemy.id, [enemy.encounterId], encounterIds)
    }
  }

  for (const pickup of pickups) {
    for (const solid of solids) {
      if (containsPoint(solid, pickup)) {
        issues.push({ code: 'embedded-pickup', entityId: pickup.id, relatedId: solid.id })
      }
    }
  }

  for (const gate of level.crouchGates ?? []) {
    const underside = gate.y + gate.height
    const below = level.platforms
      .filter(platform => platform.y >= underside
        && platform.x < gate.x + gate.width && platform.x + platform.width > gate.x)
      .sort((a, b) => a.y - b.y || a.x - b.x)
    const floorY = below[0]?.y
    let coveredTo = gate.x
    for (const platform of below.filter(platform => platform.y === floorY)) {
      if (platform.x > coveredTo) break
      coveredTo = Math.max(coveredTo, platform.x + platform.width)
    }
    if (floorY === undefined || coveredTo < gate.x + gate.width) {
      issues.push({ code: 'unsupported-underpass', entityId: gate.id })
    } else if (floorY - underside <= stance.crouchedHeight
      || floorY - underside >= stance.standingHeight) {
      issues.push({ code: 'invalid-underpass-clearance', entityId: gate.id })
    }
  }
  return issues
}
