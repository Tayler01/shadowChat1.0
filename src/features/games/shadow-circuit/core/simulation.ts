import { CLEAN_ASSISTS, DELTAS, DIRECTIONS, ENEMY_KINDS, MOVE_TICKS, left, reverse, right, type Actor, type AssistOptions, type CircuitLevel, type CircuitState, type Direction } from './types.ts'

export function createState(level: CircuitLevel, seed = 0x53484457, assists: AssistOptions = CLEAN_ASSISTS): CircuitState {
  return {
    schemaVersion: 1, rulesetVersion: 'shadow-grid-v0', levelId: level.id, contentHash: level.contentHash,
    tick: 0, elapsed: 0, started: false, outcome: 'playing', reason: '', top: [...level.top], bottom: [...level.bottom],
    actors: level.actors.map(a => ({ ...a, previous: a.cell, readyAt: 0, alive: true })), rng: seed >>> 0 || 1,
    nextActorId: Math.max(...level.actors.map(a => a.id)) + 1, chips: level.requiredChips,
    keys: assists.pocketKeys ? [99, 99, 1, 99] : [0, 0, 0, 0], boots: Array(4).fill(assists.pocketKeys), moves: 0,
    assisted: Object.values(assists).some(Boolean), assists: { ...assists }, events: [],
  }
}

export const cloneState = (state: CircuitState): CircuitState => ({
  ...state, top: [...state.top], bottom: [...state.bottom], actors: state.actors.map(a => ({ ...a })),
  keys: [...state.keys], boots: [...state.boots], assists: { ...state.assists }, events: state.events.map(e => ({ ...e })),
})
export const playerOf = (state: CircuitState) => state.actors.find(a => a.kind === 'player')!
const actorAt = (state: CircuitState, cell: number, except = -1) => state.actors.find(a => a.alive && a.cell === cell && a.id !== except)
const consumeTile = (state: CircuitState, cell: number) => { state.top[cell] = state.bottom[cell]; state.bottom[cell] = 0 }
const event = (state: CircuitState, type: CircuitState['events'][number]['type'], cell: number, detail?: string) => { state.events.push({ type, cell, detail }) }

function random(state: CircuitState) {
  let x = state.rng
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5
  state.rng = x >>> 0
  return state.rng
}

export function neighbor(level: CircuitLevel, cell: number, direction: Direction): number {
  const [dx, dy] = DELTAS[direction]
  const x = cell % level.width + dx; const y = Math.floor(cell / level.width) + dy
  return x < 0 || y < 0 || x >= level.width || y >= level.height ? -1 : y * level.width + x
}

// Thin walls and ice corners restrict edges even with skates. Corner names describe blocked edges.
function blockedEdges(tile: number): readonly Direction[] {
  switch (tile) {
    case 6: return [0]
    case 7: return [3]
    case 8: return [2]
    case 9: return [1]
    case 0x30: return [2, 1]
    case 0x1a: return [2, 1]
    case 0x1b: return [2, 3]
    case 0x1c: return [0, 3]
    case 0x1d: return [0, 1]
    default: return []
  }
}

function trapOpen(level: CircuitLevel, state: CircuitState, cell: number) {
  return level.traps.some(link => link.target === cell && Boolean(actorAt(state, link.button)))
}

export function canEnter(level: CircuitLevel, state: CircuitState, actor: Actor, direction: Direction, ignoreOccupancy = false): boolean {
  const destination = neighbor(level, actor.cell, direction)
  if (destination < 0) return false
  const tile = state.top[destination]
  if (blockedEdges(state.top[actor.cell]).includes(direction) || blockedEdges(tile).includes(reverse(direction))) return false
  if ([1, 5, 0x1f, 0x25, 0x2c, 0x31].includes(tile)) return false
  if (tile >= 0x16 && tile <= 0x19 && (actor.kind !== 'player' || state.keys[tile - 0x16] <= 0)) return false
  if (tile === 0x22 && (actor.kind !== 'player' || state.chips > 0)) return false
  if (actor.kind !== 'player') {
    if ([2, 0xb, 0x15, 0x1e, 0x2e, 0x2f].includes(tile)) return false
    if (tile === 0x2d && !['block', 'teeth'].includes(actor.kind)) return false
    // MS keys are acting floors for blocks and monsters; they remain for Chip.
    // Boots are walls to monsters, but blocks can cover them in MS.
    if (tile >= 0x68 && tile <= 0x6b && actor.kind !== 'block') return false
    if (tile === 4 && !['block', 'fireball'].includes(actor.kind)) return false
  }
  if (!ignoreOccupancy) {
    const occupant = actorAt(state, destination, actor.id)
    if (occupant?.kind === 'block') return false
    if (occupant && actor.kind !== 'player' && occupant.kind !== 'player') return false
  }
  return true
}

function die(state: CircuitState, actor: Actor, reason: string) {
  actor.alive = false
  if (actor.kind === 'player' && state.outcome === 'playing') {
    state.outcome = 'dead'; state.reason = reason; event(state, 'death', actor.cell, reason)
  }
}

function forcedDirection(state: CircuitState, actor: Actor): Direction | null {
  const tile = state.top[actor.cell]
  const isPlayer = actor.kind === 'player'
  if ((tile === 0x0c || (tile >= 0x1a && tile <= 0x1d)) && !(isPlayer && state.boots[2])) {
    const walls = blockedEdges(tile)
    if (walls.includes(actor.direction)) {
      const choices = DIRECTIONS.filter(d => !walls.includes(d) && d !== reverse(actor.direction))
      return choices[0] ?? reverse(actor.direction)
    }
    return actor.direction
  }
  if (!(isPlayer && state.boots[3])) {
    if (tile === 0xd) return 2
    if (tile === 0x12) return 0
    if (tile === 0x13) return 1
    if (tile === 0x14) return 3
    if (tile === 0x32) return (random(state) % 4) as Direction
  }
  return null
}

function trigger(level: CircuitLevel, state: CircuitState, actor: Actor, recursion: number) {
  if (recursion > 16 || state.outcome !== 'playing') return
  const cell = actor.cell; const tile = state.top[cell]
  if (tile === 0x23) {
    state.top = state.top.map(t => t === 0x25 ? 0x26 : t === 0x26 ? 0x25 : t)
    event(state, 'button', cell, 'toggle')
  } else if (tile === 0x28) {
    for (const tank of state.actors) if (tank.alive && tank.kind === 'tank') tank.direction = reverse(tank.direction)
    event(state, 'button', cell, 'tank')
  } else if (tile === 0x24) {
    for (const link of level.clones.filter(l => l.button === cell)) {
      const template = actorAt(state, link.target)
      if (!template || template.kind === 'player' || state.actors.filter(a => a.alive).length >= 1024) continue
      const copy = { ...template, id: state.nextActorId++, previous: template.cell, readyAt: state.tick + MOVE_TICKS }
      if (!canEnter(level, state, copy, copy.direction)) continue
      state.actors.push(copy)
      moveActor(level, state, copy, copy.direction, recursion + 1, true)
    }
    event(state, 'button', cell, 'clone')
  }
}

function resolveCell(level: CircuitLevel, state: CircuitState, actor: Actor, recursion: number, allowTeleport = true) {
  const cell = actor.cell; const tile = state.top[cell]
  if (actor.kind === 'player') {
    if (tile === 2) { state.chips = Math.max(0, state.chips - 1); consumeTile(state, cell); event(state, 'chip', cell) }
    else if (tile >= 0x64 && tile <= 0x67) { state.keys[tile - 0x64]++; consumeTile(state, cell); event(state, 'key', cell) }
    else if (tile >= 0x68 && tile <= 0x6b) { state.boots[tile - 0x68] = true; consumeTile(state, cell); event(state, 'boot', cell) }
    else if (tile >= 0x16 && tile <= 0x19) { if (tile !== 0x18) state.keys[tile - 0x16]--; consumeTile(state, cell); event(state, 'door', cell) }
    else if ([0xb, 0x1e, 0x22].includes(tile)) consumeTile(state, cell)
    else if (tile === 0x21) state.boots.fill(false)
  }
  const hazard = state.top[cell]
  if (hazard === 3 && actor.kind === 'block') { actor.alive = false; state.top[cell] = 0xb; state.bottom[cell] = 0; return }
  if (hazard === 3 && actor.kind !== 'glider' && !(actor.kind === 'player' && state.boots[0])) { die(state, actor, 'Water requires flippers.'); return }
  if (hazard === 4 && !['fireball', 'block'].includes(actor.kind) && !(actor.kind === 'player' && state.boots[1])) { die(state, actor, 'Fire requires fire boots.'); return }
  if (hazard === 0x2a) { consumeTile(state, cell); die(state, actor, 'A bomb was triggered.'); return }
  const other = actorAt(state, cell, actor.id)
  if (other && (actor.kind === 'player' || other.kind === 'player')) {
    die(state, actor.kind === 'player' ? actor : other, `Caught by ${actor.kind === 'player' ? other.kind : actor.kind}.`); return
  }
  if (hazard === 0x15 && actor.kind === 'player') { state.outcome = 'won'; event(state, 'win', cell); return }
  if (hazard === 0x29 && allowTeleport) {
    const portals = state.top.flatMap((t, i) => t === 0x29 ? [i] : []).sort((a, b) => b - a)
    const candidates = [...portals.filter(p => p < cell), ...portals.filter(p => p >= cell)]
    for (const portal of candidates) {
      const probe = { ...actor, cell: portal }
      if (actorAt(state, portal, actor.id) || !canEnter(level, state, probe, actor.direction)) continue
      actor.cell = neighbor(level, portal, actor.direction)
      event(state, 'teleport', actor.cell)
      resolveCell(level, state, actor, recursion + 1, false)
      return
    }
  }
  trigger(level, state, actor, recursion)
}

function moveActor(level: CircuitLevel, state: CircuitState, actor: Actor, direction: Direction, recursion = 0, releasedClone = false): boolean {
  if (recursion > 16 || !actor.alive || state.outcome !== 'playing') return false
  if (!releasedClone && (state.top[actor.cell] === 0x31 || (state.top[actor.cell] === 0x2b && !trapOpen(level, state, actor.cell)))) return false
  const destination = neighbor(level, actor.cell, direction)
  if (destination < 0) return false
  const occupant = actorAt(state, destination, actor.id)
  if (occupant?.kind === 'block' && actor.kind === 'player') {
    if (!canEnter(level, state, actor, direction, true) || !moveActor(level, state, occupant, direction, recursion + 1)) return false
    event(state, 'push', destination)
  }
  if (!canEnter(level, state, actor, direction)) {
    if (actor.kind === 'player' && [0x1f, 0x2c].includes(state.top[destination])) state.top[destination] = 1
    return false
  }
  const origin = actor.cell
  actor.previous = origin; actor.cell = destination; actor.direction = direction
  actor.readyAt = state.tick + (['teeth', 'blob'].includes(actor.kind) ? MOVE_TICKS * 2 : MOVE_TICKS)
  if (state.top[origin] === 0x2e && actor.kind === 'player') state.top[origin] = 1
  if (actor.kind === 'player') { state.moves++; state.started = true; event(state, 'move', destination) }
  resolveCell(level, state, actor, recursion)
  return true
}

export function enemyChoices(state: CircuitState, actor: Actor, level: CircuitLevel): Direction[] {
  const d = actor.direction
  switch (actor.kind) {
    case 'bug': return [left(d), d, right(d), reverse(d)]
    case 'paramecium': return [right(d), d, left(d), reverse(d)]
    case 'fireball': return [d, right(d), left(d), reverse(d)]
    case 'glider': return [d, left(d), right(d), reverse(d)]
    case 'ball': return [d, reverse(d)]
    case 'tank': return [d]
    case 'walker': return canEnter(level, state, actor, d) ? [d] : [(random(state) % 4) as Direction]
    case 'blob': return [(random(state) % 4) as Direction]
    case 'teeth': {
      const player = playerOf(state)
      const dx = player.cell % level.width - actor.cell % level.width
      const dy = Math.floor(player.cell / level.width) - Math.floor(actor.cell / level.width)
      const horizontal: Direction = dx < 0 ? 3 : 1; const vertical: Direction = dy < 0 ? 0 : 2
      return Math.abs(dy) >= Math.abs(dx) ? [vertical, horizontal] : [horizontal, vertical]
    }
    default: return []
  }
}

/** One logical tick. Inputs are intents; the renderer cannot change this schedule. */
export function step(level: CircuitLevel, previous: CircuitState, intent: Direction | null): CircuitState {
  if (previous.outcome !== 'playing') return previous
  const state = cloneState(previous); state.events = []
  const player = playerOf(state)
  if (!state.started && intent === null) return state
  if (state.tick >= player.readyAt) {
    const forced = forcedDirection(state, player)
    const direction = forced ?? intent
    if (direction !== null) {
      player.direction = direction
      if (!moveActor(level, state, player, direction)) {
        if (forced !== null && (state.top[player.cell] === 0xc || (state.top[player.cell] >= 0x1a && state.top[player.cell] <= 0x1d))) {
          moveActor(level, state, player, reverse(direction))
        }
        player.readyAt = state.tick + MOVE_TICKS
        event(state, 'bump', player.cell)
      }
    }
  }
  if (!state.started) { state.tick++; return state }
  for (const actor of [...state.actors]) {
    if (!actor.alive || actor.kind === 'player' || state.tick < actor.readyAt || state.outcome !== 'playing') continue
    const forced = forcedDirection(state, actor)
    const choices = forced === null ? enemyChoices(state, actor, level) : [forced]
    for (const direction of choices) if (moveActor(level, state, actor, direction)) break
    actor.readyAt = state.tick + (['teeth', 'blob'].includes(actor.kind) ? MOVE_TICKS * 2 : MOVE_TICKS)
  }
  state.tick++; state.elapsed++
  if (level.timeLimit > 0 && !state.assists.timerOff && state.elapsed >= level.timeLimit * 20 && state.outcome === 'playing') die(state, player, 'Time ran out.')
  return state
}

export function snapshot(state: CircuitState): string { return JSON.stringify({ ...state, events: [] }) }

export function restore(level: CircuitLevel, text: string): CircuitState {
  if (text.length > 512_000) throw new Error('Checkpoint exceeds the supported size.')
  const s = JSON.parse(text) as CircuitState
  const cells = level.width * level.height
  const uint = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max
  const ints = (values: unknown, length: number, max: number): values is number[] => Array.isArray(values) && values.length === length && values.every(v => Number.isInteger(v) && v >= 0 && v <= max)
  if (!s || typeof s !== 'object' || s.schemaVersion !== 1 || s.rulesetVersion !== 'shadow-grid-v0' || s.levelId !== level.id || s.contentHash !== level.contentHash
    || !ints(s.top, cells, 111) || !ints(s.bottom, cells, 111) || !ints(s.keys, 4, 9999)
    || !Array.isArray(s.boots) || s.boots.length !== 4 || !s.boots.every(b => typeof b === 'boolean')
    || !Array.isArray(s.actors) || s.actors.length < 1 || s.actors.length > 1024
    || s.actors.some(a => !a || !['player','block',...ENEMY_KINDS].includes(a.kind) || !uint(a.cell,cells-1) || !uint(a.previous,cells-1) || !DIRECTIONS.includes(a.direction) || !uint(a.id) || !uint(a.readyAt) || typeof a.alive !== 'boolean')
    || s.actors.filter(a => a.kind === 'player').length !== 1 || new Set(s.actors.map(a => a.id)).size !== s.actors.length
    || !uint(s.tick) || !uint(s.elapsed,s.tick) || !uint(s.moves)
    || !uint(s.rng,0xffffffff) || s.rng===0 || !uint(s.nextActorId) || s.actors.some(a=>a.id>=s.nextActorId) || !uint(s.chips,level.requiredChips)
    || !['playing', 'won', 'dead'].includes(s.outcome) || typeof s.assisted !== 'boolean' || typeof s.started !== 'boolean'
    || typeof s.reason !== 'string' || s.reason.length>1024
    || !s.assists || ['timerOff','undo','pocketKeys'].some(key=>typeof s.assists[key as keyof AssistOptions] !== 'boolean')
    || (s.outcome==='playing' && !playerOf(s).alive)) throw new Error('Checkpoint is incompatible or damaged.')
  s.events = []
  s.assisted = s.assisted || Object.values(s.assists).some(Boolean)
  return s
}
