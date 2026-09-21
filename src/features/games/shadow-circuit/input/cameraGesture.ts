export type CameraView = { heading: number; tilt: number; zoom: number }
export type CameraDelta = { turn?: number; tilt?: number; zoomRatio?: number }
export type Point = { x: number; y: number }
export const DEFAULT_CAMERA: CameraView = { heading: 0, tilt: .64, zoom: 4.5 }
// Avoid the orbit singularity exactly above the target; visually this is overhead.
export const MIN_TILT = .001
export const MAX_TILT = Math.PI / 2
export function moveCamera(view: CameraView, delta: CameraDelta): CameraView {
  return {
    heading: ((view.heading + (delta.turn ?? 0)) % 4 + 4) % 4,
    tilt: Math.max(MIN_TILT, Math.min(MAX_TILT, view.tilt + (delta.tilt ?? 0))),
    zoom: Math.max(2.5, Math.min(6, view.zoom * (delta.zoomRatio ?? 1))),
  }
}

// Pointer membership changes rebase the gesture so lifting either pinch finger
// never causes a jump. The movement pad owns its pointers independently.
export class CameraGesture {
  private points = new Map<number, Point>()
  start(id: number, point: Point) {
    if (this.points.size >= 2 || this.points.has(id)) return false
    this.points.set(id, point)
    return true
  }
  move(id: number, point: Point, width: number, height: number): CameraDelta | null {
    const previous = this.points.get(id)
    if (!previous) return null
    const before = [...this.points.values()]
    this.points.set(id, point)
    if (before.length === 2) {
      const after = [...this.points.values()]
      const oldDistance = Math.hypot(before[0].x-before[1].x, before[0].y-before[1].y)
      const newDistance = Math.hypot(after[0].x-after[1].x, after[0].y-after[1].y)
      return oldDistance < 8 || newDistance < 8 ? null : { zoomRatio: oldDistance / newDistance }
    }
    return { turn: (point.x-previous.x) / Math.max(1,width) * 4,
      tilt: (point.y-previous.y) / Math.max(1,height) * Math.PI / 2 }
  }
  end(id: number) { this.points.delete(id) }
  clear() { this.points.clear() }
}
