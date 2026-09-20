import { TICK_MS } from './types.ts'

/** Foreground monotonic frame accumulator. Large stalls require intentional resume. */
export class SimulationClock {
  private last: number | null = null
  private accumulator = 0
  reset() { this.last = null; this.accumulator = 0 }
  advance(now: number): { ticks: number; stalled: boolean } {
    if (this.last === null) { this.last = now; return { ticks: 0, stalled: false } }
    const elapsed = now - this.last; this.last = now
    if (elapsed > 250 || elapsed < 0) { this.reset(); return { ticks: 0, stalled: true } }
    this.accumulator += elapsed
    const ticks = Math.floor((this.accumulator + 0.00001) / TICK_MS)
    this.accumulator = Math.max(0, this.accumulator - ticks * TICK_MS)
    return { ticks, stalled: false }
  }
}
