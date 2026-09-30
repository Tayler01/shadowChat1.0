export interface MovingPlatformPoint {
  x: number
  y: number
}

export interface MovingPlatformBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export interface MovingPlatformSolid extends MovingPlatformBounds {
  enable: boolean
  checkCollision?: { none: boolean }
}

export interface MovingPlatformRider extends MovingPlatformSolid {
  velocity: MovingPlatformPoint
  blocked: { down: boolean }
  touching: { down: boolean }
}

export interface MovingPlatformCarryPlan {
  delta: MovingPlatformPoint
  riderDelta: MovingPlatformPoint
  supported: boolean
  blocked: boolean
  blocker: MovingPlatformSolid | null
  fraction: number
}

export interface MovingPlatformCarryBody {
  enable: boolean
  position: MovingPlatformPoint
  prev: MovingPlatformPoint
  prevFrame: MovingPlatformPoint
  autoFrame?: MovingPlatformPoint
  updateCenter(): void
}

const CONTACT_TOLERANCE = 0.5
const MIN_FOOT_OVERLAP = 0.01

function finite(...values: number[]) {
  if (values.some(value => !Number.isFinite(value))) throw new RangeError('Moving platform values must be finite')
}

function validateBounds(bounds: MovingPlatformBounds) {
  finite(bounds.left, bounds.right, bounds.top, bounds.bottom)
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
    throw new RangeError('Moving platform bounds must have positive dimensions')
  }
}

/** Matches the runtime's 50ms cap and never overshoots a real path endpoint. */
export function getShadowRunnerMovingPlatformStep(
  current: MovingPlatformPoint,
  target: MovingPlatformPoint,
  speed: number,
  deltaSeconds: number,
): MovingPlatformPoint {
  finite(current.x, current.y, target.x, target.y, speed, deltaSeconds)
  if (speed < 0 || deltaSeconds < 0) throw new RangeError('Moving platform speed and delta cannot be negative')
  const x = target.x - current.x
  const y = target.y - current.y
  const distance = Math.hypot(x, y)
  const travel = speed * Math.min(0.05, deltaSeconds)
  finite(x, y, distance, travel)
  const fraction = distance === 0 ? 0 : Math.min(1, travel / distance)
  return fraction === 0 ? { x: 0, y: 0 } : { x: x * fraction, y: y * fraction }
}

function axisTimes(low: number, high: number, obstacleLow: number, obstacleHigh: number, delta: number) {
  if (delta === 0) return high > obstacleLow && low < obstacleHigh ? [-Infinity, Infinity] : null
  const first = (obstacleLow - high) / delta
  const second = (obstacleHigh - low) / delta
  return [Math.min(first, second), Math.max(first, second)]
}

/** Earliest positive-area overlap, including an inward move from an exact contact. */
function contactFraction(body: MovingPlatformBounds, delta: MovingPlatformPoint, obstacle: MovingPlatformBounds) {
  if (body.right > obstacle.left && body.left < obstacle.right
    && body.bottom > obstacle.top && body.top < obstacle.bottom) return 0
  const x = axisTimes(body.left, body.right, obstacle.left, obstacle.right, delta.x)
  const y = axisTimes(body.top, body.bottom, obstacle.top, obstacle.bottom, delta.y)
  if (!x || !y) return null
  const enter = Math.max(x[0], y[0])
  const leave = Math.min(x[1], y[1])
  return enter >= 0 && enter <= 1 && leave > enter ? Math.max(0, enter) : null
}

/**
 * Call after Arcade separation and player input (so a real jump releases), before
 * moving the lift. Pass current enabled solid bodies, including roofs/barriers;
 * the carrier and rider are excluded by identity. Sweep the actual rider AABB,
 * not sprite bounds. Even a thin obstacle between the endpoints stops travel.
 *
 * Apply ONLY delta to the lift and riderDelta to the rider. A blocker stops the
 * whole path, with no sliding, crushing, depenetration or synthetic grounding.
 * The caller owns endpoint/blocked reversal or pause, and collider refresh.
 */
export function planShadowRunnerMovingPlatformCarry(
  platform: MovingPlatformSolid,
  requestedDelta: MovingPlatformPoint,
  rider: MovingPlatformRider | null,
  solids: readonly MovingPlatformSolid[],
): MovingPlatformCarryPlan {
  finite(requestedDelta.x, requestedDelta.y)
  validateBounds(platform)
  let supported = false
  if (platform.enable && !platform.checkCollision?.none && rider?.enable && !rider.checkCollision?.none) {
    validateBounds(rider)
    finite(rider.velocity.x, rider.velocity.y)
    supported = (rider.blocked.down || rider.touching.down)
      && rider.velocity.y >= 0
      && Math.min(rider.right, platform.right) - Math.max(rider.left, platform.left) > MIN_FOOT_OVERLAP
      && Math.abs(rider.bottom - platform.top) <= CONTACT_TOLERANCE
  }
  let fraction = 1
  let blocker: MovingPlatformSolid | null = null
  if (supported && rider) {
    for (const solid of solids) {
      if (solid === platform || solid === rider || !solid.enable || solid.checkCollision?.none) continue
      validateBounds(solid)
      const contact = contactFraction(rider, requestedDelta, solid)
      if (contact !== null && contact <= fraction) {
        fraction = contact
        blocker = solid
      }
    }
  }
  const delta = fraction === 0 ? { x: 0, y: 0 } : { x: requestedDelta.x * fraction, y: requestedDelta.y * fraction }
  return { delta, riderDelta: supported ? { ...delta } : { x: 0, y: 0 }, supported,
    blocked: blocker !== null, blocker, fraction }
}

/**
 * Translate after planning, before World.postUpdate. Keep existing Arcade motion
 * pending for postUpdate; shifting its history equally prevents a second carry.
 * Never reset the body or overwrite jump velocity, collision flags or dimensions.
 * Sprite coordinates must be in the same world space as the body (no container).
 */
export function applyShadowRunnerMovingPlatformCarry(
  body: MovingPlatformCarryBody,
  sprite: MovingPlatformPoint,
  delta: MovingPlatformPoint,
): boolean {
  if (!body.enable) return false
  const points = [body.position, body.prev, body.prevFrame, sprite]
  if (body.autoFrame) points.push(body.autoFrame)
  finite(delta.x, delta.y, ...points.flatMap(point => [point.x, point.y]))
  for (const point of points) {
    point.x += delta.x
    point.y += delta.y
  }
  body.updateCenter()
  return true
}
