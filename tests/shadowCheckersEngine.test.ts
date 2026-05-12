import {
  applyMove,
  createInitialBoard,
  detectWinner,
  getLegalMoves,
  hasMandatoryCapture,
  resign,
  validateMove,
} from '../src/features/games/shadow-checkers/engine/checkers'
import type { CheckersBoardState, CheckersPiece } from '../src/features/games/shadow-checkers/engine/types'

function board(pieces: CheckersPiece[], turn: CheckersBoardState['turn'] = 'player_one'): CheckersBoardState {
  return {
    pieces,
    turn,
    winner: null,
    loser: null,
    winReason: null,
    moveNumber: 0,
    moveHistory: [],
    stats: {
      player_one: { captures: 0, kings: 0 },
      player_two: { captures: 0, kings: 0 },
    },
  }
}

describe('Shadow Checkers engine', () => {
  it('creates an initial board with 12 pieces for each player', () => {
    const state = createInitialBoard()

    expect(state.pieces.filter(piece => piece.owner === 'player_one')).toHaveLength(12)
    expect(state.pieces.filter(piece => piece.owner === 'player_two')).toHaveLength(12)
    expect(state.turn).toBe('player_one')
  })

  it('regular pieces move forward only', () => {
    const state = board([{ id: 'p1', owner: 'player_one', row: 5, col: 0, king: false }])

    expect(getLegalMoves(state, 'player_one').map(move => move.path[move.path.length - 1])).toEqual([{ row: 4, col: 1 }])
    expect(() => validateMove(state, 'player_one', 'p1', [{ row: 5, col: 0 }, { row: 6, col: 1 }])).toThrow('Illegal move')
  })

  it('kings can move backward', () => {
    const state = board([{ id: 'p1', owner: 'player_one', row: 3, col: 2, king: true }])

    expect(getLegalMoves(state, 'player_one').map(move => move.path[move.path.length - 1])).toEqual(
      expect.arrayContaining([{ row: 4, col: 1 }, { row: 4, col: 3 }])
    )
  })

  it('applies a basic capture and removes the jumped piece', () => {
    const state = board([
      { id: 'p1', owner: 'player_one', row: 5, col: 0, king: false },
      { id: 'p2', owner: 'player_two', row: 4, col: 1, king: false },
    ])

    const result = applyMove(state, 'player_one', 'p1', [{ row: 5, col: 0 }, { row: 3, col: 2 }])

    expect(result.state.pieces).toEqual([{ id: 'p1', owner: 'player_one', row: 3, col: 2, king: false }])
    expect(result.move.captures).toHaveLength(1)
    expect(result.state.stats.player_one.captures).toBe(1)
  })

  it('mandatory capture blocks a normal move', () => {
    const state = board([
      { id: 'p1', owner: 'player_one', row: 5, col: 0, king: false },
      { id: 'p1b', owner: 'player_one', row: 5, col: 4, king: false },
      { id: 'p2', owner: 'player_two', row: 4, col: 1, king: false },
    ])

    expect(hasMandatoryCapture(state, 'player_one')).toBe(true)
    expect(() => validateMove(state, 'player_one', 'p1b', [{ row: 5, col: 4 }, { row: 4, col: 3 }])).toThrow('Capture required')
  })

  it('requires the full multi-jump path', () => {
    const state = board([
      { id: 'p1', owner: 'player_one', row: 5, col: 0, king: false },
      { id: 'p2a', owner: 'player_two', row: 4, col: 1, king: false },
      { id: 'p2b', owner: 'player_two', row: 2, col: 3, king: false },
    ])

    expect(() => applyMove(state, 'player_one', 'p1', [{ row: 5, col: 0 }, { row: 3, col: 2 }])).toThrow('Capture required')

    const result = applyMove(state, 'player_one', 'p1', [
      { row: 5, col: 0 },
      { row: 3, col: 2 },
      { row: 1, col: 4 },
    ])

    expect(result.move.captures).toHaveLength(2)
    expect(result.state.pieces).toHaveLength(1)
  })

  it('crowns on the far row and promotion ends a jump', () => {
    const state = board([
      { id: 'p1', owner: 'player_one', row: 2, col: 1, king: false },
      { id: 'p2a', owner: 'player_two', row: 1, col: 2, king: false },
      { id: 'p2b', owner: 'player_two', row: 1, col: 4, king: false },
    ])

    const result = applyMove(state, 'player_one', 'p1', [{ row: 2, col: 1 }, { row: 0, col: 3 }])

    expect(result.state.pieces.find(piece => piece.id === 'p1')?.king).toBe(true)
    expect(result.move.crowned).toBe(true)
    expect(result.move.captures).toHaveLength(1)
  })

  it('detects no legal moves as a loss', () => {
    const state = board([
      { id: 'p1', owner: 'player_one', row: 7, col: 0, king: false },
      { id: 'p2-block', owner: 'player_two', row: 6, col: 1, king: false },
      { id: 'p2-landing-block', owner: 'player_two', row: 5, col: 2, king: false },
      { id: 'p2-safe', owner: 'player_two', row: 0, col: 1, king: false },
    ], 'player_one')

    expect(detectWinner(state, 'player_one')).toEqual({
      winner: 'player_two',
      loser: 'player_one',
      reason: 'no_legal_moves',
    })
  })

  it('detects all pieces captured as a loss', () => {
    const state = board([{ id: 'p1', owner: 'player_one', row: 5, col: 0, king: false }])

    expect(detectWinner(state, 'player_two')).toEqual({
      winner: 'player_one',
      loser: 'player_two',
      reason: 'all_pieces_captured',
    })
  })

  it('resignation awards the opponent win', () => {
    const state = createInitialBoard()
    const resigned = resign(state, 'player_one')

    expect(resigned.winner).toBe('player_two')
    expect(resigned.loser).toBe('player_one')
    expect(resigned.winReason).toBe('resignation')
  })

  it('alternates turns and tracks the last five moves', () => {
    let state = board([
      { id: 'p1', owner: 'player_one', row: 5, col: 0, king: false },
      { id: 'p2', owner: 'player_two', row: 2, col: 1, king: false },
    ])

    const first = applyMove(state, 'player_one', 'p1', [{ row: 5, col: 0 }, { row: 4, col: 1 }])
    state = first.state
    expect(state.turn).toBe('player_two')

    const second = applyMove(state, 'player_two', 'p2', [{ row: 2, col: 1 }, { row: 3, col: 0 }])
    expect(second.state.turn).toBe('player_one')
    expect(second.state.moveHistory).toHaveLength(2)
    expect(second.state.moveHistory[1].moveNumber).toBe(2)
  })
})
