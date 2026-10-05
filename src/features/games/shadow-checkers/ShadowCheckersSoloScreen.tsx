import React from 'react'
import { Accessibility, Eye, HelpCircle, Loader2, LogOut, MoreHorizontal, Music, RotateCcw, Volume2, VolumeX, X } from 'lucide-react'
import { useComfortPreferences } from '../../../hooks/useComfortPreferences'
import { useDialogAccessibility } from '../../../hooks/useDialogAccessibility'
import { useLandscapeGate } from '../shared/useLandscapeGate'
import { SHADOW_CHECKERS_ASSETS } from './assets/manifest'
import { ShadowCheckersUnityBoard, type ShadowCheckersBoardControls } from './components/ShadowCheckersUnityBoard'
import { applyMove, createInitialBoard, getLegalMoves, hasMandatoryCapture, resign } from './engine/checkers'
import { type ShadowCheckersAiDifficulty, SHADOW_CHECKERS_AI_LEVELS } from './engine/checkersAi'
import { chooseShadowCheckersAiMoveAsync, disposeSharedShadowCheckersAiClient } from './engine/checkersAiClient'
import type { CheckersBoardState, CheckersMove, CheckersPiece } from './engine/types'

interface ShadowCheckersSoloScreenProps {
  difficulty: ShadowCheckersAiDifficulty
  onLeaveMode: () => void
  musicPlaying?: boolean
  musicEnabled?: boolean
  masterSoundEnabled?: boolean
  audioBlocked?: boolean
  onToggleMasterSound?: () => void
  onToggleMusic?: () => void
}

function sameMove(left: CheckersMove, right: CheckersMove) {
  return left.pieceId === right.pieceId && left.path.length === right.path.length && left.path.every((square, index) => square.row === right.path[index].row && square.col === right.path[index].col)
}

function formatReason(reason: CheckersBoardState['winReason']) {
  if (reason === 'all_pieces_captured') return 'All pieces captured'
  if (reason === 'no_legal_moves') return 'No legal moves remain'
  if (reason === 'resignation') return 'Game conceded'
  return 'Game complete'
}

export function ShadowCheckersSoloScreen({
  difficulty,
  onLeaveMode,
  musicPlaying = false,
  musicEnabled = false,
  masterSoundEnabled = true,
  audioBlocked = false,
  onToggleMasterSound,
  onToggleMusic,
}: ShadowCheckersSoloScreenProps) {
  const rotateGate = useLandscapeGate()
  const { effectivePreferences, updatePreferences } = useComfortPreferences()
  const [state, setState] = React.useState(createInitialBoard)
  const [round, setRound] = React.useState(1)
  const [selectedPieceId, setSelectedPieceId] = React.useState<string | null>(null)
  const [helperMoves, setHelperMoves] = React.useState<CheckersMove[]>([])
  const [presentedBoard, setPresentedBoard] = React.useState<CheckersBoardState | null>(null)
  const [aiThinking, setAiThinking] = React.useState(false)
  const [aiError, setAiError] = React.useState<string | null>(null)
  const [aiRetryNonce, setAiRetryNonce] = React.useState(0)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [showHints, setShowHints] = React.useState(true)
  const [showLastMove, setShowLastMove] = React.useState(true)
  const [resultDismissed, setResultDismissed] = React.useState(false)
  const boardControls = React.useRef<ShadowCheckersBoardControls>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const resultDismissRef = React.useRef<HTMLButtonElement>(null)
  const stateRef = React.useRef(state)
  const requestRef = React.useRef<{ controller: AbortController; generation: number } | null>(null)
  const generationRef = React.useRef(0)
  const startedForMove = React.useRef<number | null>(null)
  stateRef.current = state

  const level = SHADOW_CHECKERS_AI_LEVELS.find(candidate => candidate.id === difficulty) ?? SHADOW_CHECKERS_AI_LEVELS[1]
  const humanTurn = state.turn === 'player_one' && !state.winner
  const legalMoves = React.useMemo(() => humanTurn && !aiThinking ? getLegalMoves(state, 'player_one', selectedPieceId ?? undefined) : [], [aiThinking, humanTurn, selectedPieceId, state])
  const highlightedMove = showLastMove ? state.moveHistory[state.moveHistory.length - 1] ?? null : null
  const showResult = Boolean(state.winner && presentedBoard === state && !resultDismissed)
  const resultDialogRef = useDialogAccessibility<HTMLElement>({
    open: showResult,
    onClose: () => setResultDismissed(true),
    initialFocusRef: resultDismissRef,
  })

  const cancelSearch = React.useCallback(() => {
    generationRef.current += 1
    requestRef.current?.controller.abort()
    requestRef.current = null
    startedForMove.current = null
    setAiThinking(false)
  }, [])

  React.useEffect(() => () => {
    requestRef.current?.controller.abort()
    disposeSharedShadowCheckersAiClient()
  }, [])

  const resetGame = React.useCallback(() => {
    cancelSearch()
    setState(createInitialBoard())
    setRound(value => value + 1)
    setSelectedPieceId(null)
    setHelperMoves([])
    setPresentedBoard(null)
    setAiError(null)
    setResultDismissed(false)
    setMenuOpen(false)
  }, [cancelSearch])

  const leaveMode = React.useCallback(() => {
    cancelSearch()
    disposeSharedShadowCheckersAiClient()
    onLeaveMode()
  }, [cancelSearch, onLeaveMode])

  React.useEffect(() => {
    if (rotateGate) cancelSearch()
  }, [cancelSearch, rotateGate])

  React.useEffect(() => {
    if (rotateGate || state.winner || state.turn !== 'player_two' || presentedBoard !== state || startedForMove.current === state.moveNumber) return
    startedForMove.current = state.moveNumber
    const controller = new AbortController()
    const generation = ++generationRef.current
    requestRef.current = { controller, generation }
    setAiThinking(true)
    setAiError(null)

    void chooseShadowCheckersAiMoveAsync(state, { difficulty, signal: controller.signal }).then(choice => {
      if (controller.signal.aborted || generation !== generationRef.current || stateRef.current !== state) return
      const legal = getLegalMoves(state, 'player_two')
      const selected = choice && legal.find(move => sameMove(move, choice.move))
      if (!selected) throw new Error('The computer could not find a legal move.')
      const next = applyMove(state, 'player_two', selected.pieceId, selected.path).state
      requestRef.current = null
      setAiThinking(false)
      setPresentedBoard(null)
      setState(next)
    }).catch(error => {
      if (controller.signal.aborted || generation !== generationRef.current) return
      requestRef.current = null
      startedForMove.current = null
      setAiThinking(false)
      setAiError(error instanceof Error ? error.message : 'The computer move failed.')
    })
  }, [aiRetryNonce, difficulty, presentedBoard, rotateGate, state])

  const selectPiece = (piece: CheckersPiece) => {
    if (!humanTurn || aiThinking || piece.owner !== 'player_one') return
    const moves = getLegalMoves(state, 'player_one', piece.id)
    if (!moves.length) {
      setHelperMoves(hasMandatoryCapture(state, 'player_one') ? getLegalMoves(state, 'player_one').filter(move => move.captures.length > 0) : [])
      return
    }
    setSelectedPieceId(piece.id)
    setHelperMoves([])
  }

  const selectMove = (move: CheckersMove) => {
    if (!humanTurn || aiThinking) return
    const legal = getLegalMoves(state, 'player_one', move.pieceId).find(candidate => sameMove(candidate, move))
    if (!legal) return
    cancelSearch()
    const next = applyMove(state, 'player_one', legal.pieceId, legal.path).state
    setSelectedPieceId(null)
    setHelperMoves([])
    setPresentedBoard(null)
    setResultDismissed(false)
    setState(next)
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-black pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-[#f6e0a2]">
      <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <section className="relative min-h-0 flex-1 overflow-hidden">
          <ShadowCheckersUnityBoard
            key={round}
            ref={boardControls}
            fill
            paused={rotateGate}
            masterSoundEnabled={masterSoundEnabled}
            state={state}
            viewerSlot="player_one"
            selectedPieceId={selectedPieceId}
            legalMoves={legalMoves}
            helperMoves={helperMoves}
            highlightedMove={highlightedMove}
            onSelectPiece={selectPiece}
            onSelectMove={selectMove}
            onInvalidDestination={() => setHelperMoves(hasMandatoryCapture(state, 'player_one') ? getLegalMoves(state, 'player_one').filter(move => move.captures.length > 0) : legalMoves)}
            onPresentationComplete={setPresentedBoard}
            disabled={rotateGate || aiThinking || !humanTurn || Boolean(state.winner)}
            showHints={showHints}
            boardSkin="cinematic"
          />

          <div className="pointer-events-none absolute left-1/2 top-[max(.45rem,env(safe-area-inset-top))] z-30 -translate-x-1/2">
            <p role="status" aria-live="polite" className="rounded-full border border-[#b9934c]/35 bg-black/76 px-3 py-1.5 text-xs text-[#f0d381] shadow-lg backdrop-blur-sm">
              {state.winner ? 'Game complete' : aiThinking ? <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />{level.label} is thinking</> : humanTurn ? 'Your move · Silver' : 'Computer move · Black'}
            </p>
          </div>

          <div ref={menuRef} className="absolute right-[max(.4rem,env(safe-area-inset-right))] top-[max(.3rem,env(safe-area-inset-top))] z-[60]" onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { event.stopPropagation(); setMenuOpen(false); menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus() } }}>
            <button type="button" aria-label="Open solo game menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)} className="flex h-11 w-11 items-center justify-center text-[#f0d381] drop-shadow-[0_2px_3px_#000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381]"><MoreHorizontal className="h-5 w-5" /></button>
            {menuOpen && <>
              <button type="button" tabIndex={-1} aria-label="Close solo game menu" className="fixed inset-0 z-[90] cursor-default bg-transparent" onClick={() => { setMenuOpen(false); menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus() }} />
              <div role="region" aria-label="Solo game menu" className="absolute right-0 top-[calc(100%+.35rem)] z-[95] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-[#b9934c]/35 bg-black/95 py-1.5 text-sm shadow-2xl" style={{ maxHeight: 'calc(100dvh - 4rem)' }}>
                <p className="px-3 py-2 font-serif text-base tracking-[.1em] text-[#f0d381]">Solo · {level.label}</p>
                <button type="button" onClick={leaveMode} className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-white/[.08]"><LogOut className="h-4 w-4 text-[#f0d381]" />Choose game mode</button>
                <button type="button" onClick={resetGame} className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-white/[.08]"><RotateCcw className="h-4 w-4 text-[#f0d381]" />Restart game</button>
                <button type="button" onClick={() => { boardControls.current?.openCameraHelp(); setMenuOpen(false) }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-white/[.08]"><HelpCircle className="h-4 w-4 text-[#f0d381]" />Camera help</button>
                <button type="button" onClick={() => { boardControls.current?.toggleAccessibleBoard(); setMenuOpen(false) }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-white/[.08]"><Accessibility className="h-4 w-4 text-[#f0d381]" />Toggle accessible board</button>
                <button type="button" aria-pressed={masterSoundEnabled} onClick={onToggleMasterSound} className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-white/[.08]">{masterSoundEnabled ? <Volume2 className="h-4 w-4 text-[#f0d381]" /> : <VolumeX className="h-4 w-4 text-[#f0d381]" />}Master Sound: {masterSoundEnabled ? 'On' : 'Off'}</button>
                <button type="button" aria-pressed={effectivePreferences.gameSfx} onClick={() => updatePreferences({ gameSfx: !effectivePreferences.gameSfx })} className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-white/[.08]"><Volume2 className="h-4 w-4 text-[#f0d381]" />Piece Sounds: {effectivePreferences.gameSfx ? 'On' : 'Off'}</button>
                <button type="button" aria-pressed={musicEnabled} onClick={onToggleMusic} className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-white/[.08]"><Music className="h-4 w-4 text-[#f0d381]" />Music: {musicEnabled ? 'On' : 'Off'}{musicPlaying && masterSoundEnabled ? ' · Playing' : ''}</button>
                <button type="button" aria-pressed={showLastMove} onClick={() => setShowLastMove(value => !value)} className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-white/[.08]"><Eye className="h-4 w-4 text-[#f0d381]" />Last Move: {showLastMove ? 'Shown' : 'Hidden'}</button>
                <button type="button" aria-pressed={showHints} onClick={() => setShowHints(value => !value)} className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-white/[.08]"><Eye className="h-4 w-4 text-[#f0d381]" />Move Hints: {showHints ? 'On' : 'Off'}</button>
                {!state.winner && <button type="button" onClick={() => { cancelSearch(); setState(current => resign(current, 'player_one')); setPresentedBoard(null); setMenuOpen(false) }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-red-100 hover:bg-red-950/45"><X className="h-4 w-4" />Concede game</button>}
              </div>
            </>}
          </div>

          {aiError && <div role="alert" className="absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-red-300/35 bg-red-950/92 px-3 py-2 text-xs text-red-100"><span>{aiError}</span><button type="button" onClick={() => { startedForMove.current = null; setAiError(null); setAiRetryNonce(value => value + 1) }} className="min-h-11 font-semibold text-[#f0d381]">Retry</button></div>}

          {showResult && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-[2px]">
            <section ref={resultDialogRef} role="dialog" aria-modal="true" aria-label="Solo game result" className="relative grid w-full max-w-2xl grid-cols-[1fr_1.1fr] overflow-hidden rounded-[1.1rem] border border-[#f0d381]/35 bg-black shadow-[0_28px_80px_rgba(0,0,0,.8)]">
              <img src={state.winner === 'player_one' ? SHADOW_CHECKERS_ASSETS.victory : SHADOW_CHECKERS_ASSETS.defeat} alt="" className="h-full min-h-44 w-full object-cover" />
              <div className="flex flex-col justify-center p-4 text-center">
                <button ref={resultDismissRef} type="button" aria-label="Dismiss result" onClick={() => setResultDismissed(true)} className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center text-[#f0d381]"><X className="h-5 w-5" /></button>
                <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#b9a16f]">Solo · {level.label}</p>
                <h2 className="mt-1 font-serif text-2xl text-[#f6e0a2]">{state.winner === 'player_one' ? 'Victory' : 'Defeat'}</h2>
                <p className="mt-1 text-sm text-[#d9c79f]">{formatReason(state.winReason)} · {state.moveNumber} moves</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={resetGame} className="min-h-11 rounded-lg border border-[#f0d381]/60 bg-[#d7aa46] px-3 text-sm font-bold text-[#120d08]">Play again</button>
                  <button type="button" onClick={leaveMode} className="min-h-11 rounded-lg border border-[#b9934c]/35 px-3 text-sm text-[#f0d381]">Choose mode</button>
                </div>
              </div>
            </section>
          </div>}
        </section>
      </main>

      {rotateGate && <div className="absolute inset-0 z-[150] flex flex-col items-center justify-center gap-3 bg-black p-8 text-center" role="dialog" aria-modal="true" aria-label="Rotate phone to play"><img src={SHADOW_CHECKERS_ASSETS.logo} alt="Shadow Checkers" className="h-16 max-w-[min(60vw,22rem)] object-contain" /><p className="font-serif text-2xl text-[#f0d381]">Rotate your phone</p><p className="text-sm text-[#d9c79f]">Your solo game is paused until the study is sideways.</p></div>}
      {audioBlocked && <div className="pointer-events-none absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full border border-[#b9934c]/35 bg-black/85 px-3 py-2 text-xs text-[#d9c79f]">Open the menu and tap Music to start the soundtrack.</div>}
    </div>
  )
}
