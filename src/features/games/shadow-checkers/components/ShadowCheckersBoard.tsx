import { Crown } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { CheckersBoardState, CheckersMove, CheckersPiece, CheckersPlayer, CheckersPosition } from '../engine/types'

interface ShadowCheckersBoardProps {
  state: CheckersBoardState
  viewerSlot?: CheckersPlayer | 'spectator'
  selectedPieceId?: string | null
  legalMoves: CheckersMove[]
  helperMoves?: CheckersMove[]
  onSelectPiece?: (piece: CheckersPiece) => void
  onSelectMove?: (move: CheckersMove) => void
  disabled?: boolean
  showHints?: boolean
}

export function ShadowCheckersBoard({
  state,
  viewerSlot = 'spectator',
  selectedPieceId,
  legalMoves,
  helperMoves = [],
  onSelectPiece,
  onSelectMove,
  disabled = false,
  showHints = true,
}: ShadowCheckersBoardProps) {
  const flipped = viewerSlot === 'player_two'
  const squares = Array.from({ length: 64 }, (_, index) => {
    const visualRow = Math.floor(index / 8)
    const visualCol = index % 8
    const row = flipped ? 7 - visualRow : visualRow
    const col = flipped ? 7 - visualCol : visualCol
    return { row, col, visualRow, visualCol, playable: (row + col) % 2 === 1 }
  })

  const legalByDestination = new Map<string, CheckersMove>()
  legalMoves.forEach(move => {
    const destination = move.path[move.path.length - 1]
    legalByDestination.set(squareKey(destination), move)
  })
  const helperSquares = new Set<string>()
  helperMoves.forEach(move => {
    helperSquares.add(squareKey(move.path[0]))
    helperSquares.add(squareKey(move.path[move.path.length - 1]))
  })

  return (
    <div className="relative mx-auto w-full max-w-[min(94vw,42rem)] [perspective:1100px]">
      <div className="absolute -inset-x-5 bottom-[-7%] h-[20%] rounded-full bg-black/70 blur-2xl" />
      <div className="relative aspect-square rounded-[1.25rem] border border-[#d7aa46]/45 bg-[#050505] p-[3.2%] shadow-[0_34px_80px_rgba(0,0,0,0.72),inset_0_0_0_1px_rgba(255,239,184,0.08)] [transform:rotateX(10deg)]">
        <div className="grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-[0.9rem] border border-black/70">
          {squares.map(square => {
            const piece = state.pieces.find(candidate => candidate.row === square.row && candidate.col === square.col)
            const legalMove = legalByDestination.get(squareKey(square))
            const selected = piece?.id === selectedPieceId
            const helper = helperSquares.has(squareKey(square))

            return (
              <button
                key={`${square.row}-${square.col}`}
                type="button"
                disabled={disabled || (!piece && !legalMove)}
                onClick={() => {
                  if (legalMove) {
                    onSelectMove?.(legalMove)
                    return
                  }
                  if (piece) onSelectPiece?.(piece)
                }}
                className={cn(
                  'relative min-h-0 touch-manipulation overflow-visible focus:outline-none focus:ring-2 focus:ring-[#f0d381]/70',
                  square.playable
                    ? 'bg-[radial-gradient(circle_at_50%_35%,rgba(80,65,38,0.92),rgba(24,18,12,0.98))]'
                    : 'bg-[linear-gradient(135deg,#06080b,#12151a)]',
                  legalMove && showHints && 'after:absolute after:left-1/2 after:top-1/2 after:h-5 after:w-5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border after:border-[#f6e0a2]/70 after:bg-[#d7aa46]/40 after:shadow-[0_0_24px_rgba(215,170,70,0.75)]',
                  helper && 'shadow-[inset_0_0_0_3px_rgba(229,83,83,0.65)]'
                )}
                aria-label={piece ? `${piece.owner} piece` : legalMove ? 'Move here' : 'Board square'}
              >
                {piece && (
                  <span
                    className={cn(
                      'absolute left-1/2 top-1/2 flex h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-bold transition-transform duration-200',
                      'shadow-[0_14px_22px_rgba(0,0,0,0.62),inset_0_5px_10px_rgba(255,255,255,0.18),inset_0_-8px_14px_rgba(0,0,0,0.55)]',
                      piece.owner === 'player_one'
                        ? 'border-[#fff0b7]/80 bg-[radial-gradient(circle_at_35%_24%,#fff0b7,#d2a042_42%,#6e4212_100%)] text-[#120c05]'
                        : 'border-[#9fb1c6]/65 bg-[radial-gradient(circle_at_35%_24%,#44505e,#11151b_55%,#030405_100%)] text-[#f2f5f9]',
                      selected && 'scale-110 ring-4 ring-[#f0d381]/55',
                      disabled && 'opacity-70'
                    )}
                  >
                    <span className="absolute inset-[16%] rounded-full border border-black/35" />
                    {piece.king && (
                      <span className="relative z-10 flex h-[54%] w-[54%] items-center justify-center rounded-full border border-[#fff2bd]/70 bg-black/28">
                        <Crown className="h-[58%] w-[58%]" />
                      </span>
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function squareKey(position: CheckersPosition) {
  return `${position.row}:${position.col}`
}
