import { applyMove, createInitialBoard, getLegalMoves } from '../src/features/games/shadow-checkers/engine/checkers'
import {
  SHADOW_CHECKERS_AI_LEVELS,
  chooseShadowCheckersAiMove,
} from '../src/features/games/shadow-checkers/engine/checkersAi'
import type { CheckersBoardState, CheckersPiece, CheckersPlayer } from '../src/features/games/shadow-checkers/engine/types'

const immediate = async () => undefined

function board(pieces: CheckersPiece[], turn: CheckersPlayer = 'player_one'): CheckersBoardState {
  return {
    pieces, turn, winner: null, loser: null, winReason: null,
    moveNumber: 0, moveHistory: [],
    stats: { player_one: { captures: 0, kings: 0 }, player_two: { captures: 0, kings: 0 } },
  }
}

describe('standalone Shadow Checkers opponent', () => {
  test('offers four increasing, finite difficulty budgets', () => {
    expect(SHADOW_CHECKERS_AI_LEVELS.map(level => level.id)).toEqual([
      'rookie', 'casual', 'challenger', 'master',
    ])
    for (let index = 1; index < SHADOW_CHECKERS_AI_LEVELS.length; index += 1) {
      expect(SHADOW_CHECKERS_AI_LEVELS[index].maxDepth).toBeGreaterThan(SHADOW_CHECKERS_AI_LEVELS[index - 1].maxDepth)
      expect(SHADOW_CHECKERS_AI_LEVELS[index].maxNodes).toBeGreaterThan(SHADOW_CHECKERS_AI_LEVELS[index - 1].maxNodes)
    }
  })

  test.each(SHADOW_CHECKERS_AI_LEVELS)('$label returns a legal, repeatable move without changing the board', async level => {
    const state = createInitialBoard()
    const original = JSON.stringify(state)
    const first = await chooseShadowCheckersAiMove(state, { difficulty: level.id, yieldControl: immediate })
    const again = await chooseShadowCheckersAiMove(state, { difficulty: level.id, yieldControl: immediate })
    expect(first).not.toBeNull()
    expect(first?.move).toEqual(again?.move)
    expect(first?.depth).toBeGreaterThan(0)
    expect(first?.depth).toBeLessThanOrEqual(level.maxDepth)
    expect(first?.nodes).toBeLessThanOrEqual(level.maxNodes)
    expect(getLegalMoves(state).some(move => move.pieceId === first?.move.pieceId
      && JSON.stringify(move.path) === JSON.stringify(first?.move.path))).toBe(true)
    expect(() => applyMove(state, state.turn, first!.move.pieceId, first!.move.path)).not.toThrow()
    expect(JSON.stringify(state)).toBe(original)
  })

  test('takes the full mandatory multi-jump supplied by the rules engine', async () => {
    const state = board([
      { id: 'jumper', owner: 'player_one', row: 5, col: 0, king: false },
      { id: 'bystander', owner: 'player_one', row: 5, col: 4, king: false },
      { id: 'first', owner: 'player_two', row: 4, col: 1, king: false },
      { id: 'second', owner: 'player_two', row: 2, col: 3, king: false },
      { id: 'survivor', owner: 'player_two', row: 0, col: 7, king: false },
    ])
    const choice = await chooseShadowCheckersAiMove(state, { difficulty: 'rookie', yieldControl: immediate })
    expect(choice?.move.pieceId).toBe('jumper')
    expect(choice?.move.path).toEqual([{ row: 5, col: 0 }, { row: 3, col: 2 }, { row: 1, col: 4 }])
    expect(choice?.move.captures).toHaveLength(2)
    expect(applyMove(state, state.turn, choice!.move.pieceId, choice!.move.path).state.stats.player_one.captures).toBe(2)
  })

  test('uses rule-defined crowning and stops a promotion jump', async () => {
    const state = board([
      { id: 'jumper', owner: 'player_one', row: 2, col: 1, king: false },
      { id: 'first', owner: 'player_two', row: 1, col: 2, king: false },
      { id: 'temptation', owner: 'player_two', row: 1, col: 4, king: false },
    ])
    const choice = await chooseShadowCheckersAiMove(state, { difficulty: 'master', yieldControl: immediate })
    expect(choice?.move.path).toEqual([{ row: 2, col: 1 }, { row: 0, col: 3 }])
    expect(choice?.move.crowned).toBe(true)
    expect(choice?.move.captures).toHaveLength(1)
    expect(applyMove(state, state.turn, choice!.move.pieceId, choice!.move.path).state.pieces.find(piece => piece.id === 'jumper')?.king).toBe(true)
  })

  test('prefers an immediate legal win and handles finished or immobile boards', async () => {
    const winning = board([
      { id: 'king', owner: 'player_one', row: 3, col: 2, king: true },
      { id: 'target', owner: 'player_two', row: 2, col: 3, king: false },
    ])
    const choice = await chooseShadowCheckersAiMove(winning, { difficulty: 'casual', yieldControl: immediate })
    expect(choice?.move.captures).toHaveLength(1)
    expect(applyMove(winning, winning.turn, choice!.move.pieceId, choice!.move.path).state.winner).toBe('player_one')
    expect(await chooseShadowCheckersAiMove({ ...winning, winner: 'player_two' }, { yieldControl: immediate })).toBeNull()
    expect(await chooseShadowCheckersAiMove(board([
      { id: 'blocked', owner: 'player_one', row: 0, col: 1, king: false },
      { id: 'other', owner: 'player_two', row: 7, col: 0, king: false },
    ]), { yieldControl: immediate })).toBeNull()
  })

  test('yields between depths and honors cancellation', async () => {
    const state = createInitialBoard()
    const controller = new AbortController()
    let yields = 0
    await expect(chooseShadowCheckersAiMove(state, {
      difficulty: 'master', signal: controller.signal,
      yieldControl: async () => { yields += 1; if (yields === 2) controller.abort() },
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(yields).toBe(2)
    await expect(chooseShadowCheckersAiMove(state, { signal: controller.signal, yieldControl: immediate }))
      .rejects.toMatchObject({ name: 'AbortError' })
  })
})
