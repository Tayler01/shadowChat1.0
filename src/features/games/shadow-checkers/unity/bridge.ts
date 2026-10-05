import type { ShadowCheckersBoardProps } from '../components/ShadowCheckersBoard'
import type { CheckersPosition } from '../engine/types'

export const UNITY_BRIDGE_VERSION = 1
export const UNITY_FRAME_URL = '/games/shadow-checkers/unity/frame.html'

export function makeUnitySnapshot(props: ShadowCheckersBoardProps, revision: string, reducedMotion: boolean, highContrast: boolean, soundEnabled = false, ambienceEnabled = false) {
  return {
    version: UNITY_BRIDGE_VERSION, revision, pieces: props.state.pieces, soundEnabled, ambienceEnabled,
    viewerSlot: props.viewerSlot ?? 'spectator', selectedPieceId: props.selectedPieceId ?? '',
    destinations: props.legalMoves.map(move => move.path[move.path.length - 1]),
    helpers: (props.helperMoves ?? []).flatMap(move => [move.path[0], ...move.captures, move.path[move.path.length - 1]]),
    lastPath: props.highlightedMove?.path ?? [], lastCaptures: props.highlightedMove?.captures ?? [],
    lastMove: props.state.moveHistory[props.state.moveHistory.length - 1] ?? null,
    disabled: Boolean(props.disabled), showHints: props.showHints !== false, reducedMotion, highContrast,
    boardSkin: props.boardSkin ?? 'classic', winner: props.state.winner ?? '',
  }
}

export function parseSquareEvent(data: unknown, revision: string): CheckersPosition | null {
  if (!data || typeof data !== 'object') return null
  const event = data as Record<string, unknown>
  if (event.version !== UNITY_BRIDGE_VERSION || event.type !== 'square' || event.revision !== revision) return null
  const { row, col } = event
  if (typeof row !== 'number' || typeof col !== 'number' || !Number.isInteger(row) || !Number.isInteger(col)) return null
  if (row < 0 || row > 7 || col < 0 || col > 7) return null
  return { row, col }
}

export function chooseSquare(props: ShadowCheckersBoardProps, position: CheckersPosition): 'move' | 'piece' | 'invalid' | 'ignored' {
  if (props.disabled || props.state.winner || props.viewerSlot === 'spectator') return 'ignored'
  const move = props.legalMoves.find(candidate => {
    const end = candidate.path[candidate.path.length - 1]
    return end.row === position.row && end.col === position.col
  })
  if (move) return props.onSelectMove?.(move) === false ? 'ignored' : 'move'
  const piece = props.state.pieces.find(candidate => candidate.row === position.row && candidate.col === position.col)
  if (piece) { props.onSelectPiece?.(piece); return 'piece' }
  if (props.selectedPieceId && (position.row + position.col) % 2 === 1) {
    props.onInvalidDestination?.(position)
    return 'invalid'
  }
  return 'ignored'
}
