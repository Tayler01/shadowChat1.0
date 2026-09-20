import type { Direction } from '../core/types.ts'

/** First movement pointer owns the pad; taps survive until one eligible tick, holds do not. */
export class IntentBuffer {
  private owner: number | null = null
  private held: Direction | null = null
  private pending: Direction | null = null
  press(pointer: number, direction: Direction | null) {
    if (this.owner !== null && this.owner !== pointer) return false
    this.owner = pointer; this.held = direction; this.pending = direction; return true
  }
  steer(pointer: number, direction: Direction | null) {
    if (this.owner !== pointer) return
    this.held = direction
    if (direction !== null) this.pending = direction
    else this.pending = null
  }
  release(pointer: number) { if (this.owner === pointer) { this.owner = null; this.held = null } }
  take() { const direction = this.pending ?? this.held; this.pending = null; return direction }
  clear() { this.owner = null; this.held = null; this.pending = null }
}

/** A full thumb surface: center stops, diagonals choose a cardinal, captured drags may leave the rim. */
export function padSector(x: number, y: number, previous: Direction | null): Direction | null {
  const ax = Math.abs(x); const ay = Math.abs(y)
  if (Math.max(ax, ay) < 0.16) return null
  const horizontal=x<0?3:1,vertical=y<0?0:2
  if (Math.abs(ax-ay)<0.15&&(previous===horizontal||previous===vertical))return previous
  return ax>ay?horizontal:vertical
}
