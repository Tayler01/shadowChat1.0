import { applyMove, getLegalMoves, opponentOf } from './checkers'
import type { CheckersBoardState, CheckersMove, CheckersPiece, CheckersPlayer } from './types'

export const SHADOW_CHECKERS_AI_LEVELS = [
  { id: 'rookie', label: 'Rookie', maxDepth: 1, maxNodes: 64 },
  { id: 'casual', label: 'Casual', maxDepth: 2, maxNodes: 320 },
  { id: 'challenger', label: 'Challenger', maxDepth: 4, maxNodes: 1600 },
  { id: 'master', label: 'Master', maxDepth: 6, maxNodes: 5000 },
] as const

export type ShadowCheckersAiDifficulty = (typeof SHADOW_CHECKERS_AI_LEVELS)[number]['id']

export interface ShadowCheckersAiOptions {
  difficulty?: ShadowCheckersAiDifficulty
  signal?: AbortSignal
  /** Lets a worker or host app supply its own scheduler. Defaults to one event-loop yield per depth. */
  yieldControl?: () => Promise<void>
}

export interface ShadowCheckersAiChoice {
  move: CheckersMove
  difficulty: ShadowCheckersAiDifficulty
  depth: number
  nodes: number
  score: number
}

const WIN_SCORE = 100_000
const NODE_LIMIT = Symbol('Shadow Checkers AI node limit')
const yieldToMainThread = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function abortIfRequested(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('Shadow Checkers AI search cancelled')
  error.name = 'AbortError'
  throw error
}

function moveKey(move: CheckersMove): string {
  return `${move.pieceId}:${move.path.map(square => `${square.row}${square.col}`).join('-')}`
}

function orderedMoves(state: CheckersBoardState, player: CheckersPlayer): CheckersMove[] {
  return getLegalMoves(state, player).sort((left, right) => {
    const leftPriority = left.captures.length * 100 + (left.crowned ? 25 : 0)
    const rightPriority = right.captures.length * 100 + (right.crowned ? 25 : 0)
    if (leftPriority !== rightPriority) return rightPriority - leftPriority
    const leftKey = moveKey(left)
    const rightKey = moveKey(right)
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })
}

function pieceValue(piece: CheckersPiece): number {
  if (piece.king) return 175 + Math.round((3.5 - Math.abs(piece.col - 3.5)) * 3)
  const progress = piece.owner === 'player_one' ? 7 - piece.row : piece.row
  const center = 3.5 - Math.abs(piece.col - 3.5)
  return 100 + progress * 4 + Math.round(center * 2)
}

function evaluate(state: CheckersBoardState, player: CheckersPlayer): number {
  let value = 0
  for (const piece of state.pieces) value += (piece.owner === player ? 1 : -1) * pieceValue(piece)
  return value
}

interface SearchContext {
  nodes: number
  maxNodes: number
  signal?: AbortSignal
}

function negamax(
  state: CheckersBoardState,
  player: CheckersPlayer,
  depth: number,
  alpha: number,
  beta: number,
  context: SearchContext,
): number {
  abortIfRequested(context.signal)
  if (context.nodes >= context.maxNodes) throw NODE_LIMIT
  context.nodes += 1
  if (state.winner) return state.winner === player ? WIN_SCORE + depth : -WIN_SCORE - depth
  if (depth === 0) return evaluate(state, player)

  const legal = orderedMoves(state, player)
  if (legal.length === 0) return -WIN_SCORE - depth
  let best = -Infinity
  for (const move of legal) {
    const next = applyMove(state, player, move.pieceId, move.path).state
    const score = -negamax(next, opponentOf(player), depth - 1, -beta, -alpha, context)
    if (score > best) best = score
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }
  return best
}

/**
 * Picks a legal move for the side to move. This does not change the supplied board.
 * Search is deterministic for a board and difficulty: depth and node limits, not
 * wall-clock timing, bound work on phones. The promise yields before and between
 * completed depths so a caller can paint its thinking state or cancel the turn.
 */
export async function chooseShadowCheckersAiMove(
  state: CheckersBoardState,
  options: ShadowCheckersAiOptions = {},
): Promise<ShadowCheckersAiChoice | null> {
  const difficulty = options.difficulty ?? 'casual'
  const level = SHADOW_CHECKERS_AI_LEVELS.find(candidate => candidate.id === difficulty)
  if (!level) throw new Error(`Unknown Shadow Checkers AI difficulty: ${difficulty}`)
  abortIfRequested(options.signal)
  if (state.winner) return null

  const player = state.turn
  const legal = orderedMoves(state, player)
  if (legal.length === 0) return null
  const context: SearchContext = { nodes: 0, maxNodes: level.maxNodes, signal: options.signal }
  let choice: ShadowCheckersAiChoice = {
    move: legal[0], difficulty, depth: 0, nodes: 0, score: evaluate(state, player),
  }
  const yieldControl = options.yieldControl ?? yieldToMainThread

  for (let depth = 1; depth <= level.maxDepth; depth += 1) {
    await yieldControl()
    abortIfRequested(options.signal)
    let bestMove = legal[0]
    let bestScore = -Infinity
    let alpha = -Infinity
    try {
      for (const move of legal) {
        abortIfRequested(options.signal)
        const next = applyMove(state, player, move.pieceId, move.path).state
        const score = -negamax(next, opponentOf(player), depth - 1, -Infinity, -alpha, context)
        if (score > bestScore) {
          bestScore = score
          bestMove = move
        }
        if (score > alpha) alpha = score
      }
    } catch (error) {
      if (error === NODE_LIMIT) break
      throw error
    }
    choice = { move: bestMove, difficulty, depth, nodes: context.nodes, score: bestScore }
  }
  abortIfRequested(options.signal)
  return { ...choice, nodes: context.nodes }
}
