export type CheckersPlayer = 'player_one' | 'player_two'
export type CheckersOpponent = CheckersPlayer
export type CheckersWinReason = 'all_pieces_captured' | 'no_legal_moves' | 'resignation'

export interface CheckersPosition {
  row: number
  col: number
}

export interface CheckersPiece {
  id: string
  owner: CheckersPlayer
  row: number
  col: number
  king: boolean
}

export interface CheckersMove {
  pieceId: string
  path: CheckersPosition[]
  captures: CheckersPosition[]
  crowned: boolean
  notation: string
}

export interface CheckersMoveRecord extends CheckersMove {
  player: CheckersPlayer
  moveNumber: number
  createdAt?: string
}

export interface CheckersStats {
  player_one: {
    captures: number
    kings: number
  }
  player_two: {
    captures: number
    kings: number
  }
}

export interface CheckersBoardState {
  pieces: CheckersPiece[]
  turn: CheckersPlayer
  winner: CheckersPlayer | null
  loser: CheckersPlayer | null
  winReason: CheckersWinReason | null
  moveNumber: number
  moveHistory: CheckersMoveRecord[]
  stats: CheckersStats
}

export interface ApplyMoveResult {
  state: CheckersBoardState
  move: CheckersMoveRecord
}

export interface SerializedCheckersBoard {
  pieces: CheckersPiece[]
  turn: CheckersPlayer
  winner?: CheckersPlayer | null
  loser?: CheckersPlayer | null
  winReason?: CheckersWinReason | null
  moveNumber?: number
  moveHistory?: CheckersMoveRecord[]
  stats?: CheckersStats
}
