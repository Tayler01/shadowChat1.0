export type Direction = 0 | 1 | 2 | 3 // North, East, South, West (not the DAT byte order).
export type ActorKind = 'player' | 'block' | 'bug' | 'fireball' | 'ball' | 'tank' | 'glider' | 'teeth' | 'walker' | 'blob' | 'paramecium'
export type Actor = { id: number; kind: ActorKind; cell: number; previous: number; direction: Direction; readyAt: number; alive: boolean }
export type Link = { button: number; target: number }
export type CircuitLevel = {
  id: string; campaignId: string; contentHash: string; title: string; number: number; hint: string; password: string
  width: number; height: number; top: number[]; bottom: number[]; actors: Actor[]
  requiredChips: number; timeLimit: number; traps: Link[]; clones: Link[]
  source: 'authored' | 'imported'; warnings: string[]
}
export type CircuitEvent = { type: 'move' | 'bump' | 'chip' | 'key' | 'boot' | 'door' | 'push' | 'button' | 'teleport' | 'death' | 'win'; cell: number; detail?: string }
export type AssistOptions = { timerOff: boolean; undo: boolean; pocketKeys: boolean }
export const CLEAN_ASSISTS: AssistOptions = { timerOff: false, undo: false, pocketKeys: false }
export type CircuitState = {
  schemaVersion: 1; rulesetVersion: 'shadow-grid-v0'; levelId: string; contentHash: string
  tick: number; elapsed: number; started: boolean; outcome: 'playing' | 'won' | 'dead'; reason: string
  top: number[]; bottom: number[]; actors: Actor[]; rng: number; nextActorId: number
  chips: number; keys: number[]; boots: boolean[]; moves: number; assisted: boolean; assists: AssistOptions
  events: CircuitEvent[]
}
export const DIRECTIONS: readonly Direction[] = [0, 1, 2, 3]
export const DELTAS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const
export const left = (d: Direction) => ((d + 3) % 4) as Direction
export const right = (d: Direction) => ((d + 1) % 4) as Direction
export const reverse = (d: Direction) => ((d + 2) % 4) as Direction
export const screenDirection = (d: Direction, quarterTurns: number) => ((d + quarterTurns) % 4) as Direction
export const TICK_MS = 50
export const MOVE_TICKS = 4
export const ENEMY_KINDS: readonly ActorKind[] = ['bug', 'fireball', 'ball', 'tank', 'glider', 'teeth', 'walker', 'blob', 'paramecium']
