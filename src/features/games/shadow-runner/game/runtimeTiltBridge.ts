export interface TiltBridgePose {
  pivotX: number
  pivotY: number
  length: number
  /** Authored walkable line relative to the visual pivot, not the texture bounds. */
  deckOffsetY: number
  /** Radians, positive clockwise in Phaser's screen coordinates. */
  rotation: number
}

interface Point {
  x: number
  y: number
}

export interface TiltBridgeSlice {
  index: number
  x: number
  y: number
  width: number
  height: number
}

export interface TiltBridgeGeometry {
  left: Point
  right: Point
  slope: number
  maxSurfaceError: number
  slices: TiltBridgeSlice[]
}

export interface TiltBridgeFootprint {
  left: number
  right: number
}

export interface TiltBridgeContact {
  slice: TiltBridgeSlice
  /** Highest point of the real deck under an axis-aligned pair of feet. */
  surfaceX: number
  surfaceY: number
}

function finite(...values: number[]) {
  if (values.some(value => !Number.isFinite(value))) throw new RangeError('Tilt bridge values must be finite')
}

/** Geometry only. Phaser Arcade must own integration, overlap and separation. */
export function createTiltBridgeGeometry(
  pose: TiltBridgePose,
  options: { maxSliceLength?: number; thickness?: number } = {},
): TiltBridgeGeometry {
  const { pivotX, pivotY, length, deckOffsetY, rotation } = pose
  const { maxSliceLength = 4, thickness = 12 } = options
  finite(pivotX, pivotY, length, deckOffsetY, rotation, maxSliceLength, thickness)
  if (length <= 0 || maxSliceLength <= 0 || thickness <= 0 || Math.abs(rotation) >= Math.PI / 2) {
    throw new RangeError('Tilt bridge requires positive dimensions and a nonvertical deck')
  }
  const count = Math.ceil(length / maxSliceLength)
  if (count > 512) throw new RangeError('Tilt bridge exceeds the 512-slice geometry budget')

  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const pointAt = (localX: number): Point => ({
    x: pivotX + localX * cos - deckOffsetY * sin,
    y: pivotY + localX * sin + deckOffsetY * cos,
  })
  const left = pointAt(-length / 2)
  const right = pointAt(length / 2)
  const slices = Array.from({ length: count }, (_, index) => {
    const start = pointAt(-length / 2 + length * index / count)
    const end = pointAt(-length / 2 + length * (index + 1) / count)
    return {
      index,
      x: start.x,
      y: (start.y + end.y) / 2,
      width: end.x - start.x,
      height: thickness,
    }
  })
  return { left, right, slope: sin / cos, maxSurfaceError: Math.abs(sin) * length / count / 2, slices }
}

/** Reuses a fixed-size geometry buffer; the runtime keeps current/next buffers. */
export function updateTiltBridgeGeometry(geometry: TiltBridgeGeometry, pose: TiltBridgePose): void {
  const cos = Math.cos(pose.rotation)
  const sin = Math.sin(pose.rotation)
  const count = geometry.slices.length
  const leftX = pose.pivotX - pose.length / 2 * cos - pose.deckOffsetY * sin
  const leftY = pose.pivotY - pose.length / 2 * sin + pose.deckOffsetY * cos
  geometry.left.x = leftX
  geometry.left.y = leftY
  geometry.right.x = leftX + pose.length * cos
  geometry.right.y = leftY + pose.length * sin
  geometry.slope = sin / cos
  geometry.maxSurfaceError = Math.abs(sin) * pose.length / count / 2
  for (let index = 0; index < count; index += 1) {
    const slice = geometry.slices[index]
    slice.x = leftX + pose.length * index / count * cos
    slice.y = leftY + pose.length * (index + 0.5) / count * sin
    slice.width = leftX + pose.length * (index + 1) / count * cos - slice.x
  }
}

/** Allocation-free counterpart of getTiltBridgeContact for physics callbacks. */
export function getTiltBridgeContactIndex(geometry: TiltBridgeGeometry, footLeft: number, footRight: number): number {
  const left = Math.max(footLeft, geometry.left.x)
  const right = Math.min(footRight, geometry.right.x)
  if (right <= left) return -1
  let selected = -1
  for (const slice of geometry.slices) {
    if (slice.x < right && slice.x + slice.width > left
      && (selected < 0 || slice.y < geometry.slices[selected].y)) selected = slice.index
  }
  return selected
}

// The default 256x80 bitmap has transparent margins. The stone deck starts at
// row 35 (not the texture top); its load-bearing span excludes the bevel ends.
export const DEFAULT_TILT_BRIDGE_DECK = { left: 54, right: 228, top: 35 } as const

/** Returns null outside the literal rotated deck. Never extends or clamps an end. */
export function sampleTiltBridgeSurface(geometry: TiltBridgeGeometry, worldX: number): number | null {
  finite(worldX)
  if (worldX < geometry.left.x || worldX > geometry.right.x) return null
  return geometry.left.y + (worldX - geometry.left.x) * geometry.slope
}

/**
 * Chooses ONE top-only Arcade collider to avoid summing platform carry across
 * several overlapping slices. Lock this choice per actor/bridge/physics step,
 * before separation moves the actor. Horizontal eligibility is not grounding:
 * retain contact only after an Arcade TOP collision; bypass it on jump/takeoff.
 * A process callback must require player.deltaY() > platform.deltaY(), matching
 * Arcade GetOverlapY, and previous feet no lower than previous top + overlap bias.
 * An embedded overlap can otherwise fire a callback without top separation.
 */
export function getTiltBridgeContact(
  geometry: TiltBridgeGeometry,
  footprint: TiltBridgeFootprint,
): TiltBridgeContact | null {
  finite(footprint.left, footprint.right)
  const left = Math.max(footprint.left, geometry.left.x)
  const right = Math.min(footprint.right, geometry.right.x)
  if (right <= left) return null

  let slice: TiltBridgeSlice | null = null
  for (const candidate of geometry.slices) {
    if (candidate.x < right && candidate.x + candidate.width > left
      && (!slice || candidate.y < slice.y)) slice = candidate
  }
  if (!slice) return null
  const surfaceX = geometry.slope >= 0 ? left : right
  return { slice, surfaceX, surfaceY: sampleTiltBridgeSurface(geometry, surfaceX)! }
}

/** Feed these px/s values to an immovable, gravity-free dynamic Arcade body. */
export function getTiltBridgeSliceVelocity(previous: TiltBridgeSlice, next: TiltBridgeSlice, deltaSeconds: number): Point {
  finite(deltaSeconds, previous.x, previous.y, next.x, next.y)
  if (deltaSeconds <= 0 || previous.index !== next.index) {
    throw new RangeError('Tilt bridge motion requires matching slices and a positive physics delta')
  }
  return { x: (next.x - previous.x) / deltaSeconds, y: (next.y - previous.y) / deltaSeconds }
}

/**
 * Only for a previously confirmed support, never a jump or airborne landing.
 * Keep the previous collision's contact: native carry may have moved the feet
 * across a slice boundary since then. Next uses predicted feet for ONE step.
 * Descending steps need a following velocity; Arcade supplies gravity and the
 * actual separation. Uphill steps stay within Arcade's overlap bias instead of
 * receiving an upward velocity that would be treated as an underside collision.
 */
export function getTiltBridgeSupportVelocityY(
  previous: TiltBridgeContact,
  next: TiltBridgeContact,
  carrierVelocityY: number,
  deltaSeconds: number,
): number {
  finite(carrierVelocityY, deltaSeconds, previous.slice.y, next.slice.y)
  if (deltaSeconds <= 0) throw new RangeError('Tilt bridge support requires a positive physics delta')
  return Math.max(carrierVelocityY, (next.slice.y - previous.slice.y) / deltaSeconds)
}

/** Horizontal component of gravity projected along the deck; Arcade integrates it. */
export function getTiltBridgeDownhillAcceleration(rotation: number, gravityY: number): number {
  finite(rotation, gravityY)
  if (Math.abs(rotation) >= Math.PI / 2) throw new RangeError('Tilt bridge requires a nonvertical deck')
  return gravityY * Math.sin(rotation) * Math.cos(rotation)
}
