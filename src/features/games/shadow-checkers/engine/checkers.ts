import type {
  ApplyMoveResult,
  CheckersBoardState,
  CheckersMove,
  CheckersMoveRecord,
  CheckersPiece,
  CheckersPlayer,
  CheckersPosition,
  CheckersStats,
  CheckersWinReason,
  SerializedCheckersBoard,
} from './types'

const BOARD_SIZE = 8
const MAX_HISTORY = 5

const emptyStats = (): CheckersStats => ({
  player_one: { captures: 0, kings: 0 },
  player_two: { captures: 0, kings: 0 },
})

export function opponentOf(player: CheckersPlayer): CheckersPlayer {
  return player === 'player_one' ? 'player_two' : 'player_one'
}

export function isPlayableSquare(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE && (row + col) % 2 === 1
}

export function createInitialBoard(): CheckersBoardState {
  const pieces: CheckersPiece[] = []

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (isPlayableSquare(row, col)) {
        pieces.push({ id: `p2-${row}-${col}`, owner: 'player_two', row, col, king: false })
      }
    }
  }

  for (let row = 5; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (isPlayableSquare(row, col)) {
        pieces.push({ id: `p1-${row}-${col}`, owner: 'player_one', row, col, king: false })
      }
    }
  }

  return {
    pieces,
    turn: 'player_one',
    winner: null,
    loser: null,
    winReason: null,
    moveNumber: 0,
    moveHistory: [],
    stats: emptyStats(),
  }
}

export function serializeBoard(state: CheckersBoardState): SerializedCheckersBoard {
  return {
    pieces: state.pieces.map(piece => ({ ...piece })),
    turn: state.turn,
    winner: state.winner,
    loser: state.loser,
    winReason: state.winReason,
    moveNumber: state.moveNumber,
    moveHistory: state.moveHistory.map(move => ({ ...move, path: move.path.map(pos => ({ ...pos })), captures: move.captures.map(pos => ({ ...pos })) })),
    stats: {
      player_one: { ...state.stats.player_one },
      player_two: { ...state.stats.player_two },
    },
  }
}

export function deserializeBoard(input: SerializedCheckersBoard): CheckersBoardState {
  return {
    pieces: Array.isArray(input.pieces) ? input.pieces.map(piece => ({ ...piece })) : [],
    turn: input.turn === 'player_two' ? 'player_two' : 'player_one',
    winner: input.winner ?? null,
    loser: input.loser ?? null,
    winReason: input.winReason ?? null,
    moveNumber: input.moveNumber ?? 0,
    moveHistory: Array.isArray(input.moveHistory) ? input.moveHistory.map(move => ({
      ...move,
      path: move.path.map(pos => ({ ...pos })),
      captures: move.captures.map(pos => ({ ...pos })),
    })) : [],
    stats: input.stats ?? emptyStats(),
  }
}

export function getLegalMoves(state: CheckersBoardState, player: CheckersPlayer = state.turn, pieceId?: string): CheckersMove[] {
  if (state.winner) return []

  const pieces = state.pieces.filter(piece => piece.owner === player && (!pieceId || piece.id === pieceId))
  const captures = pieces.flatMap(piece => getLegalCaptures(state, piece))
  if (captures.length > 0) return captures

  return pieces.flatMap(piece => getSimpleMoves(state, piece))
}

export function getLegalCaptures(state: CheckersBoardState, pieceOrId: CheckersPiece | string): CheckersMove[] {
  const piece = typeof pieceOrId === 'string'
    ? state.pieces.find(candidate => candidate.id === pieceOrId)
    : pieceOrId
  if (!piece) return []

  return buildCaptureSequences(state.pieces, piece, [{ row: piece.row, col: piece.col }], [], false)
    .map(path => createMove(piece.id, path.path, path.captures, path.crowned))
}

export function hasMandatoryCapture(state: CheckersBoardState, player: CheckersPlayer = state.turn): boolean {
  return state.pieces.some(piece => piece.owner === player && getLegalCaptures(state, piece).length > 0)
}

export function validateMove(state: CheckersBoardState, player: CheckersPlayer, pieceId: string, path: CheckersPosition[]): CheckersMove {
  if (state.winner) {
    throw new Error('Match is already complete')
  }
  if (state.turn !== player) {
    throw new Error('Not your turn')
  }
  if (path.length < 2) {
    throw new Error('Move must include a start and destination')
  }

  const piece = state.pieces.find(candidate => candidate.id === pieceId)
  if (!piece || piece.owner !== player) {
    throw new Error('Piece is not available')
  }
  if (piece.row !== path[0].row || piece.col !== path[0].col) {
    throw new Error('Move starts from the wrong square')
  }

  const captureRequired = hasMandatoryCapture(state, player)
  const legalMoves = captureRequired ? getLegalCaptures(state, pieceId) : getLegalMoves(state, player, pieceId)
  const matched = legalMoves.find(move => samePath(move.path, path))
  if (!matched) {
    if (captureRequired) {
      throw new Error('Capture required')
    }
    throw new Error('Illegal move')
  }

  return matched
}

export function applyMove(state: CheckersBoardState, player: CheckersPlayer, pieceId: string, path: CheckersPosition[]): ApplyMoveResult {
  const move = validateMove(state, player, pieceId, path)
  const nextPieces = state.pieces
    .filter(piece => !move.captures.some(capture => capture.row === piece.row && capture.col === piece.col))
    .map(piece => {
      if (piece.id !== pieceId) return { ...piece }
      const destination = move.path[move.path.length - 1]
      return {
        ...piece,
        row: destination.row,
        col: destination.col,
        king: piece.king || move.crowned,
      }
    })

  const nextPlayer = opponentOf(player)
  const nextStats = cloneStats(state.stats)
  nextStats[player].captures += move.captures.length
  if (move.crowned) nextStats[player].kings += 1

  let winner: CheckersPlayer | null = null
  let loser: CheckersPlayer | null = null
  let winReason: CheckersWinReason | null = null
  const nextStateBase: CheckersBoardState = {
    ...state,
    pieces: nextPieces,
    turn: nextPlayer,
    moveNumber: state.moveNumber + 1,
    stats: nextStats,
  }
  const detected = detectWinner(nextStateBase, nextPlayer)
  if (detected) {
    winner = detected.winner
    loser = detected.loser
    winReason = detected.reason
  }

  const record: CheckersMoveRecord = {
    ...move,
    player,
    moveNumber: state.moveNumber + 1,
    createdAt: new Date().toISOString(),
  }

  const nextState: CheckersBoardState = {
    ...nextStateBase,
    winner,
    loser,
    winReason,
    moveHistory: [...state.moveHistory, record].slice(-MAX_HISTORY),
  }

  return { state: nextState, move: record }
}

export function crownPieceIfNeeded(piece: CheckersPiece): CheckersPiece {
  if (piece.king) return piece
  if ((piece.owner === 'player_one' && piece.row === 0) || (piece.owner === 'player_two' && piece.row === 7)) {
    return { ...piece, king: true }
  }
  return piece
}

export function detectWinner(
  state: CheckersBoardState,
  playerToMove: CheckersPlayer = state.turn
): { winner: CheckersPlayer; loser: CheckersPlayer; reason: CheckersWinReason } | null {
  const playerOnePieces = state.pieces.filter(piece => piece.owner === 'player_one')
  const playerTwoPieces = state.pieces.filter(piece => piece.owner === 'player_two')

  if (playerOnePieces.length === 0) {
    return { winner: 'player_two', loser: 'player_one', reason: 'all_pieces_captured' }
  }
  if (playerTwoPieces.length === 0) {
    return { winner: 'player_one', loser: 'player_two', reason: 'all_pieces_captured' }
  }

  if (getLegalMoves(state, playerToMove).length === 0) {
    return { winner: opponentOf(playerToMove), loser: playerToMove, reason: 'no_legal_moves' }
  }

  return null
}

export function resign(state: CheckersBoardState, player: CheckersPlayer): CheckersBoardState {
  const winner = opponentOf(player)
  return {
    ...state,
    winner,
    loser: player,
    winReason: 'resignation',
  }
}

export function getLastFiveMoves(state: CheckersBoardState): CheckersMoveRecord[] {
  return state.moveHistory.slice(-MAX_HISTORY)
}

export function getMoveNotation(move: CheckersMove | CheckersMoveRecord): string {
  return move.notation
}

export function calculateStats(state: CheckersBoardState): CheckersStats {
  return cloneStats(state.stats)
}

function getSimpleMoves(state: CheckersBoardState, piece: CheckersPiece): CheckersMove[] {
  return movementDirections(piece)
    .map(([rowDelta, colDelta]) => ({ row: piece.row + rowDelta, col: piece.col + colDelta }))
    .filter(destination => isPlayableSquare(destination.row, destination.col))
    .filter(destination => !pieceAt(state.pieces, destination.row, destination.col))
    .map(destination => createMove(piece.id, [{ row: piece.row, col: piece.col }, destination], [], shouldCrown(piece, destination.row)))
}

function buildCaptureSequences(
  pieces: CheckersPiece[],
  piece: CheckersPiece,
  path: CheckersPosition[],
  captures: CheckersPosition[],
  alreadyCrowned: boolean
): Array<{ path: CheckersPosition[]; captures: CheckersPosition[]; crowned: boolean }> {
  const options = captureOptions(pieces, piece)
  if (options.length === 0) {
    return captures.length > 0 ? [{ path, captures, crowned: alreadyCrowned }] : []
  }

  const sequences: Array<{ path: CheckersPosition[]; captures: CheckersPosition[]; crowned: boolean }> = []

  for (const option of options) {
    const landsOnKingRow = shouldCrown(piece, option.destination.row)
    const crowned = alreadyCrowned || landsOnKingRow
    const nextPiece = {
      ...piece,
      row: option.destination.row,
      col: option.destination.col,
      king: piece.king || crowned,
    }
    const nextPieces = pieces
      .filter(candidate => candidate.id !== option.captured.id)
      .map(candidate => candidate.id === piece.id ? nextPiece : candidate)

    const nextPath = [...path, option.destination]
    const nextCaptures = [...captures, { row: option.captured.row, col: option.captured.col }]

    if (!piece.king && landsOnKingRow) {
      sequences.push({ path: nextPath, captures: nextCaptures, crowned })
      continue
    }

    sequences.push(...buildCaptureSequences(nextPieces, nextPiece, nextPath, nextCaptures, crowned))
  }

  return sequences
}

function captureOptions(pieces: CheckersPiece[], piece: CheckersPiece) {
  return movementDirections(piece)
    .map(([rowDelta, colDelta]) => {
      const middle = { row: piece.row + rowDelta, col: piece.col + colDelta }
      const destination = { row: piece.row + rowDelta * 2, col: piece.col + colDelta * 2 }
      const captured = pieceAt(pieces, middle.row, middle.col)
      return { middle, destination, captured }
    })
    .filter(option => isPlayableSquare(option.destination.row, option.destination.col))
    .filter(option => option.captured && option.captured.owner !== piece.owner)
    .filter(option => !pieceAt(pieces, option.destination.row, option.destination.col))
    .map(option => ({
      destination: option.destination,
      captured: option.captured as CheckersPiece,
    }))
}

function movementDirections(piece: CheckersPiece): Array<[number, number]> {
  if (piece.king) {
    return [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  }
  const rowDelta = piece.owner === 'player_one' ? -1 : 1
  return [[rowDelta, -1], [rowDelta, 1]]
}

function shouldCrown(piece: CheckersPiece, row: number): boolean {
  return !piece.king && ((piece.owner === 'player_one' && row === 0) || (piece.owner === 'player_two' && row === 7))
}

function createMove(pieceId: string, path: CheckersPosition[], captures: CheckersPosition[], crowned: boolean): CheckersMove {
  return {
    pieceId,
    path,
    captures,
    crowned,
    notation: [
      path.map(positionLabel).join(captures.length > 0 ? 'x' : '-'),
      captures.length > 0 ? `${captures.length} capture${captures.length === 1 ? '' : 's'}` : 'moved',
      crowned ? 'crowned' : null,
    ].filter(Boolean).join(' • '),
  }
}

function pieceAt(pieces: CheckersPiece[], row: number, col: number): CheckersPiece | undefined {
  return pieces.find(piece => piece.row === row && piece.col === col)
}

function samePath(left: CheckersPosition[], right: CheckersPosition[]): boolean {
  return left.length === right.length && left.every((position, index) => (
    position.row === right[index].row && position.col === right[index].col
  ))
}

function positionLabel(position: CheckersPosition): string {
  return `${String.fromCharCode(65 + position.col)}${BOARD_SIZE - position.row}`
}

function cloneStats(stats: CheckersStats): CheckersStats {
  return {
    player_one: { ...stats.player_one },
    player_two: { ...stats.player_two },
  }
}
