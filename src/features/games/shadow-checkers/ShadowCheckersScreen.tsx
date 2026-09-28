import React from 'react'
import './shadow-checkers-ui.css'
import { useLandscapeGate } from '../shared/useLandscapeGate'
import { Accessibility, ArrowLeft, Crown, Eye, HelpCircle, Loader2, MessageSquare, MoreHorizontal, Music, Plus, Shield, Swords, Trophy, Users, Volume2, VolumeX, X } from 'lucide-react'
import { CheckersNotice, type CheckersNoticeMessage } from './components/CheckersNotice'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { useAuth } from '../../../hooks/useAuth'
import { useAdminAccess } from '../../../hooks/useAdminAccess'
import { useDialogAccessibility } from '../../../hooks/useDialogAccessibility'
import { useComfortPreferences } from '../../../hooks/useComfortPreferences'
import { cn } from '../../../lib/utils'
import { shouldShowLegacyAchievementBadges } from '../../../lib/achievementBadges'
import type { ShadowCheckersMatch } from '../../../lib/supabase'
import { SHADOW_CHECKERS_ASSETS, SHADOW_CHECKERS_CHARACTERS, getShadowCheckersCharacter } from './assets/manifest'
import { ShadowCheckersUnityBoard, type ShadowCheckersBoardControls } from './components/ShadowCheckersUnityBoard'
import { CheckersCrownBadge } from './components/CheckersCrownBadge'
import { ShadowCheckersInvitePicker } from './components/ShadowCheckersInvitations'
import { deserializeBoard, getLegalMoves, hasMandatoryCapture } from './engine/checkers'
import type { CheckersBoardState, CheckersMove, CheckersPiece, CheckersPlayer } from './engine/types'
import { useShadowCheckers } from './hooks/useShadowCheckers'

interface ShadowCheckersScreenProps {
  onExit?: () => void
  initialMatchId?: string
  onMatchRoute?: (action: 'push-item' | 'replace-item' | 'close-item', matchId?: string) => void
  musicPlaying?: boolean
  musicEnabled?: boolean
  masterSoundEnabled?: boolean
  onToggleMasterSound?: () => void
  audioBlocked?: boolean
  onToggleMusic?: () => void
  unreadMatchCounts?: Record<string, number>
}

function CheckersButton({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-[0.65rem] border px-4 py-2 text-sm font-semibold transition-[border-color,box-shadow,color,background,opacity,transform] duration-200 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'border-[#f0d381]/60 bg-[linear-gradient(180deg,#e7c873,#8d5c19)] text-[#120d08] shadow-[0_16px_35px_rgba(215,170,70,0.28)] hover:-translate-y-0.5',
        variant === 'secondary' && 'border-[#b9934c]/40 bg-black/45 text-[#f1d58d] hover:border-[#f0d381]/60 hover:bg-[#2a2114]/70',
        variant === 'ghost' && 'border-transparent bg-transparent text-[#d9c79f] hover:border-[#b9934c]/30 hover:bg-white/5',
        variant === 'danger' && 'border-red-300/35 bg-red-950/35 text-red-100 hover:bg-red-900/45',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

function displayName(user?: { display_name?: string | null; username?: string | null } | null, fallback = 'Shadow player') {
  return user?.display_name || user?.username || fallback
}

function isPlayer(match: ShadowCheckersMatch | null, userId?: string | null) {
  return Boolean(match && userId && (match.player_one_id === userId || match.player_two_id === userId))
}

function playerSlot(match: ShadowCheckersMatch | null, userId?: string | null): CheckersPlayer | 'spectator' {
  if (!match || !userId) return 'spectator'
  if (match.player_one_id === userId) return 'player_one'
  if (match.player_two_id === userId) return 'player_two'
  return 'spectator'
}

function formatWinReason(reason?: string | null) {
  if (reason === 'all_pieces_captured') return 'All pieces captured'
  if (reason === 'no_legal_moves') return 'No legal moves'
  if (reason === 'resignation') return 'Resignation'
  return 'Match complete'
}

function formatPieceCount(count: number) {
  return `${count} ${count === 1 ? 'piece' : 'pieces'}`
}

function isMandatoryJumpError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /capture required|multi-jump|required jump|mandatory jump|move banned|not permitted|row-level security|violates row-level/i.test(message)
}

function formatCheckersActionError(error: unknown, fallback = 'Shadow Checkers action failed') {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (isMandatoryJumpError(error)) return 'Mandatory jump available. You have to take the jump.'
  if (/not your turn/i.test(message)) return 'It is not your turn yet.'
  if (/illegal move|invalid move/i.test(message)) return 'That move is not legal.'
  return message || fallback
}

type ShadowCheckersBoardSkin = 'classic' | 'cinematic'

function normalizeBoardSkin(value?: string | null): ShadowCheckersBoardSkin {
  return value === 'cinematic' ? 'cinematic' : 'classic'
}

export function ShadowCheckersScreen({
  onExit,
  initialMatchId,
  onMatchRoute,
  musicPlaying = false,
  musicEnabled = false,
  masterSoundEnabled = true,
  onToggleMasterSound,
  audioBlocked = false,
  onToggleMusic,
  unreadMatchCounts = {},
}: ShadowCheckersScreenProps) {
  const rotateGate = useLandscapeGate()
  const [notice, setNotice] = React.useState<CheckersNoticeMessage | null>(null)
  const noticeSequence = React.useRef(0)
  const dismissNotice = React.useCallback(() => setNotice(null), [])
  const notify = (tone: CheckersNoticeMessage['tone'], message: string) => setNotice({ id: ++noticeSequence.current, tone, message })
  const gameRoot = React.useRef<HTMLDivElement>(null)
  const [matchChatOpen, setMatchChatOpen] = React.useState(false)
  const [chatFeedVisible, setChatFeedVisible] = React.useState(true)
  const [chatSending, setChatSending] = React.useState(false)
  const [chatError, setChatError] = React.useState<string | null>(null)
  const [lobbyTab, setLobbyTab] = React.useState<'tables' | 'fame' | 'players'>('tables')
  const [lobbyPage, setLobbyPage] = React.useState(0)
  const [famePage, setFamePage] = React.useState(0)
  const chatInputRef = React.useRef<HTMLInputElement>(null)
  const boardControls = React.useRef<ShadowCheckersBoardControls>(null)
  const { effectivePreferences, updatePreferences } = useComfortPreferences()
  const orientationLocked = React.useRef(false)
  const orientationSession = React.useRef(0)
  const requestLandscape = React.useCallback(async (gesture = false) => {
    const session = orientationSession.current
    const orientation = window.screen.orientation as ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> }
    if (gesture && !document.fullscreenElement && gameRoot.current?.requestFullscreen) {
      await gameRoot.current.requestFullscreen().catch(() => {})
    }
    if (orientation?.lock) {
      try {
        if (session !== orientationSession.current) return
        await orientation.lock('landscape')
        if (session !== orientationSession.current) orientation.unlock?.()
        else orientationLocked.current = true
      } catch { /* iPhone/browser policy: the rotate gate remains authoritative. */ }
    }
  }, [])
  React.useEffect(() => {
    const session = orientationSession.current
    void requestLandscape()
    return () => { orientationSession.current = session + 1; if (orientationLocked.current) window.screen.orientation?.unlock?.(); orientationLocked.current = false }
  }, [requestLandscape])
  const { user } = useAuth()
  const { isAdmin } = useAdminAccess()
  const [selectedCharacter, setSelectedCharacter] = React.useState(SHADOW_CHECKERS_CHARACTERS[0].key)
  const [selectedBoardSkin, setSelectedBoardSkin] = React.useState<ShadowCheckersBoardSkin>('classic')
  const [boardModalOpen, setBoardModalOpen] = React.useState(false)
  const [characterModal, setCharacterModal] = React.useState<null | { mode: 'create' } | { mode: 'join'; sessionId: string; takenCharacter?: string | null }>(null)
  const [selectedPieceId, setSelectedPieceId] = React.useState<string | null>(null)
  const [showHints, setShowHints] = React.useState(true)
  const [showLastMove, setShowLastMove] = React.useState(true)
  const [helperMoves, setHelperMoves] = React.useState<CheckersMove[]>([])
  const [rulesOpen, setRulesOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [chatDraft, setChatDraft] = React.useState('')
  const [dismissedResultMatchId, setDismissedResultMatchId] = React.useState<string | null>(null)
  const [presentedBoard, setPresentedBoard] = React.useState<CheckersBoardState | null>(null)
  const [showYourTurnBanner, setShowYourTurnBanner] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement | null>(null)
  const [confirmation, setConfirmation] = React.useState<null | { kind: 'resign' | 'cancel'; matchId: string; adminRemoval?: boolean }>(null)
  const [confirmPending, setConfirmPending] = React.useState(false)
  const [confirmError, setConfirmError] = React.useState<string | null>(null)
  const confirmInFlight = React.useRef(false)
  const confirmationId = React.useId()
  const confirmationRef = useDialogAccessibility<HTMLDivElement>({
    open: Boolean(confirmation),
    dismissible: !confirmPending,
    onClose: () => setConfirmation(null),
  })
  const handleAutoSelectMatch = React.useCallback((matchId: string, routeMode: 'push' | 'replace') => {
    if (matchId === initialMatchId) return
    onMatchRoute?.(routeMode === 'replace' ? 'replace-item' : 'push-item', matchId)
  }, [initialMatchId, onMatchRoute])
  const {
    sessions,
    matches,
    activeMatch,
    queue,
    moves,
    chat,
    leaderboard,
    selectedMatchId,
    loading,
    busy,
    error,
    actions,
  } = useShadowCheckers(initialMatchId, handleAutoSelectMatch)

  const state = React.useMemo(() => (
    activeMatch ? deserializeBoard(activeMatch.board_state as any) : null
  ), [activeMatch])
  const viewerSlot = playerSlot(activeMatch, user?.id)
  const activePlayer = viewerSlot !== 'spectator'
  const myTurn = Boolean(activeMatch && state && activePlayer && activeMatch.current_turn_user_id === user?.id && activeMatch.status === 'active')
  const currentTurnSlot: CheckersPlayer | null =
    activeMatch?.current_turn_user_id === activeMatch?.player_one_id
      ? 'player_one'
      : activeMatch?.current_turn_user_id === activeMatch?.player_two_id
        ? 'player_two'
        : null
  const legalMoves = React.useMemo(() => {
    if (!state || !myTurn || !selectedPieceId) return []
    return getLegalMoves(state, viewerSlot as CheckersPlayer, selectedPieceId)
  }, [myTurn, selectedPieceId, state, viewerSlot])
  const mandatoryMoves = React.useMemo(() => {
    if (!state || !myTurn || viewerSlot === 'spectator' || !hasMandatoryCapture(state, viewerSlot)) return []
    return getLegalMoves(state, viewerSlot).filter(move => move.captures.length > 0)
  }, [myTurn, state, viewerSlot])
  const highlightedLastMove = React.useMemo(() => {
    if (!showLastMove) return null
    const visibleMoves = viewerSlot === 'spectator'
      ? moves
      : moves.filter(move => move.player_slot !== viewerSlot)
    const move = visibleMoves[visibleMoves.length - 1]
    return move ? { path: move.path, captures: move.captures } : null
  }, [moves, showLastMove, viewerSlot])
  const openMatches = React.useMemo(() => matches.filter(match => match.status === 'waiting'), [matches])
  const activeMatches = React.useMemo(() => matches.filter(match => match.status === 'active'), [matches])
  const lobbyMatches = React.useMemo(() => [...openMatches, ...activeMatches], [openMatches, activeMatches])
  const lobbyPageCount = Math.max(1, lobbyMatches.length)
  const visibleLobbyMatches = lobbyMatches.slice(Math.min(lobbyPage, lobbyPageCount - 1), Math.min(lobbyPage, lobbyPageCount - 1) + 1)
  const famePageCount = Math.max(1, leaderboard.length)
  const visibleLeaders = leaderboard.slice(Math.min(famePage, famePageCount - 1), Math.min(famePage, famePageCount - 1) + 1)
  const myMatch = React.useMemo(() => matches.find(match => isPlayer(match, user?.id)) ?? null, [matches, user?.id])
  const activeBoardSkin = activeMatch ? normalizeBoardSkin(activeMatch.board_skin) : selectedBoardSkin

  React.useEffect(() => {
    setSelectedPieceId(null)
    setHelperMoves([])
  }, [activeMatch?.id, activeMatch?.move_count])

  React.useEffect(() => {
    setDismissedResultMatchId(null)
  }, [activeMatch?.id])

  React.useEffect(() => {
    setHelperMoves(mandatoryMoves)
  }, [mandatoryMoves])

  React.useEffect(() => {
    if (!myTurn || state?.winner) {
      setShowYourTurnBanner(false)
      return
    }

    setShowYourTurnBanner(true)
    const timeout = window.setTimeout(() => setShowYourTurnBanner(false), 1500)

    return () => window.clearTimeout(timeout)
  }, [activeMatch?.id, activeMatch?.current_turn_user_id, myTurn, state?.winner])

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  React.useEffect(() => {
    setMenuOpen(false)
  }, [selectedMatchId])

  React.useEffect(() => {
    if (!characterModal) return
    const taken = characterModal.mode === 'join' ? characterModal.takenCharacter : null
    if (taken === selectedCharacter) {
      const firstOpenCharacter = SHADOW_CHECKERS_CHARACTERS.find(character => character.key !== taken)
      if (firstOpenCharacter) setSelectedCharacter(firstOpenCharacter.key)
    }
  }, [characterModal, selectedCharacter])

  const guarded = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      notify('success', success)
    } catch (err) {
      notify('error', formatCheckersActionError(err))
    }
  }

  const handleSelectMatch = (matchId: string | null) => {
    actions.selectMatch(matchId)
    onMatchRoute?.(matchId ? 'push-item' : 'close-item', matchId ?? undefined)
  }

  const confirmMatchAction = async () => {
    if (!confirmation || confirmInFlight.current) return
    confirmInFlight.current = true
    setConfirmPending(true)
    setConfirmError(null)
    try {
      if (confirmation.kind === 'resign') await actions.resign(confirmation.matchId)
      else await actions.cancel(confirmation.matchId)
      setConfirmation(null)
      notify('success', confirmation.kind === 'resign' ? 'Resigned' : 'Match removed')
    } catch (error) {
      setConfirmError(formatCheckersActionError(error))
    } finally {
      confirmInFlight.current = false
      setConfirmPending(false)
    }
  }

  const handleSelectPiece = (piece: CheckersPiece) => {
    if (!state || !myTurn || viewerSlot === 'spectator') return
    if (piece.owner !== viewerSlot) {
      notify('error', 'Choose one of your pieces')
      return
    }

    const pieceMoves = getLegalMoves(state, viewerSlot, piece.id)
    if (pieceMoves.length === 0) {
      if (hasMandatoryCapture(state, viewerSlot)) {
        const captureMoves = getLegalMoves(state, viewerSlot).filter(move => move.captures.length > 0)
        setHelperMoves(captureMoves)
        notify('error', 'Mandatory jump available')
      } else {
        notify('error', 'That piece has no legal moves')
      }
      return
    }

    setSelectedPieceId(piece.id)
    setHelperMoves(mandatoryMoves)
  }

  const handleInvalidDestination = () => {
    if (!state || !myTurn || viewerSlot === 'spectator') return
    const captureMoves = getLegalMoves(state, viewerSlot).filter(move => move.captures.length > 0)
    if (captureMoves.length > 0) {
      setHelperMoves(captureMoves)
      notify('error', 'Mandatory jump available. You have to take the jump.')
      return
    }
    notify('error', 'That move is not legal')
  }

  const handleSelectMove = (move: CheckersMove) => {
    if (!activeMatch || !myTurn) return
    void (async () => {
      try {
        await actions.submitMove(activeMatch.id, move.pieceId, move.path)
        notify('success', 'Your move is played')
      } catch (err) {
        if (isMandatoryJumpError(err) && state && viewerSlot !== 'spectator') {
          const captureMoves = getLegalMoves(state, viewerSlot).filter(candidate => candidate.captures.length > 0)
          setHelperMoves(captureMoves)
        }
        notify('error', formatCheckersActionError(err, 'That move is not legal.'))
      }
    })()
  }

  const handlePostChat = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!activeMatch || chatSending) return
    const body = chatDraft.trim().slice(0, 120)
    if (!body) return
    setChatSending(true)
    setChatError(null)
    try {
      await actions.postChat(activeMatch.id, body)
      setChatDraft('')
      setMatchChatOpen(false)
      chatInputRef.current?.blur()
    } catch (error) {
      setChatError(formatCheckersActionError(error, 'Message was not sent. Try again.'))
      chatInputRef.current?.focus()
    } finally {
      setChatSending(false)
    }
  }

  const handleConfirmCharacter = () => {
    if (!characterModal) return
    const currentModal = characterModal
    setCharacterModal(null)
    if (currentModal.mode === 'create') {
      void guarded(() => actions.create(selectedCharacter, selectedBoardSkin), 'Match created')
      return
    }
    void guarded(() => actions.join(currentModal.sessionId, selectedCharacter), 'Joined match')
  }

  const handleSelectBoardForCreate = (boardSkin: ShadowCheckersBoardSkin) => {
    setSelectedBoardSkin(boardSkin)
    setBoardModalOpen(false)
    setCharacterModal({ mode: 'create' })
  }

  const renderRulesDialog = () => {
    if (!rulesOpen) return null
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/74 px-3 py-[calc(env(safe-area-inset-top)_+_0.85rem)] backdrop-blur-sm" onMouseDown={() => setRulesOpen(false)}>
        <section
          role="dialog"
          aria-modal="true"
          className="max-h-[min(88vh,42rem)] w-full max-w-lg overflow-y-auto rounded-[1.1rem] border border-[#d7aa46]/35 bg-[linear-gradient(180deg,rgba(20,18,14,0.98),rgba(0,0,0,0.98))] p-4 text-[#f6e0a2] shadow-[0_26px_90px_rgba(0,0,0,0.72)]"
          onMouseDown={event => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b9a16f]">How to play</p>
              <h2 className="mt-1 text-2xl font-semibold">Shadow Checkers</h2>
            </div>
            <button type="button" aria-label="Close rules" onClick={() => setRulesOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full text-[#f0d381] hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4 space-y-3 text-sm leading-6 text-[#d9c79f]">
            <p>Shadow Checkers uses standard American checkers rules on an 8x8 board. Only dark squares are playable.</p>
            <p>Regular pieces move and capture diagonally forward. Crowned pieces move and capture diagonally forward or backward.</p>
            <p>Captures are mandatory. If a jump creates another jump for the same piece, the multi-jump must continue. Promotion ends that move.</p>
            <p>You win when your opponent has no pieces, no legal moves, or resigns. There is no timer, undo, or AI opponent. Music is optional.</p>
            <p>Active players can toggle legal hints. Spectators can watch and use temporary match chat, but cannot move pieces.</p>
          </div>
        </section>
      </div>
    )
  }

  const renderCharacterPicker = (takenCharacter?: string | null) => (
    <div className="checkers-character-picker rounded-[1rem] border border-[#b9934c]/24 bg-black/42 p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#f0d381]">Choose character</p>
      <div className="grid grid-cols-4 gap-2">
        {SHADOW_CHECKERS_CHARACTERS.map(character => {
          const taken = character.key === takenCharacter
          return (
            <button
              key={character.key}
              type="button"
              disabled={taken}
              aria-pressed={selectedCharacter === character.key}
              onClick={() => setSelectedCharacter(character.key)}
              className={cn(
                'rounded-[0.85rem] border bg-black/55 p-1 text-left transition-[border-color,transform,opacity] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50 disabled:opacity-35',
                selectedCharacter === character.key ? 'border-[#f0d381]/70' : 'border-white/10'
              )}
            >
              <img src={character.portrait} alt="" className="aspect-square w-full rounded-[0.65rem] object-cover" loading="lazy" />
              <span className="mt-1 block truncate px-1 text-[10px] font-semibold text-[#f6e0a2]">{character.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const renderClassicBoardSample = () => (
    <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-[0.7rem] border border-[#d7aa46]/24 bg-black/70 p-1 shadow-inner">
      {Array.from({ length: 64 }).map((_, index) => {
        const row = Math.floor(index / 8)
        const col = index % 8
        const dark = (row + col) % 2 === 1
        return (
          <span
            key={index}
            className={dark ? 'bg-[linear-gradient(135deg,#14110d,#000000)]' : 'bg-[linear-gradient(135deg,#a66f25,#e0bd6f)]'}
          />
        )
      })}
    </div>
  )

  const renderBoardChoiceDialog = () => {
    if (!boardModalOpen) return null
    const options: Array<{ key: ShadowCheckersBoardSkin; title: string; detail: string }> = [
      { key: 'cinematic', title: 'Cinematic', detail: 'Generated medieval board' },
      { key: 'classic', title: 'Classic', detail: 'Clean tactical board' },
    ]

    return (
      <div className="checkers-picker-overlay fixed inset-0 z-[90] flex items-center justify-center bg-black/74 px-3 py-[calc(env(safe-area-inset-top)_+_0.85rem)] backdrop-blur-sm" onMouseDown={() => setBoardModalOpen(false)}>
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Choose board"
          className="checkers-board-dialog w-full max-w-lg rounded-[1.1rem] border border-[#d7aa46]/35 bg-[linear-gradient(180deg,rgba(20,18,14,0.98),rgba(0,0,0,0.98))] p-4 text-[#f6e0a2] shadow-[0_26px_90px_rgba(0,0,0,0.72)]"
          onMouseDown={event => event.stopPropagation()}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b9a16f]">Create public match</p>
              <h2 className="mt-1 text-2xl font-semibold">Choose Board</h2>
            </div>
            <button type="button" aria-label="Close board picker" onClick={() => setBoardModalOpen(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#f0d381] hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map(option => (
              <button
                key={option.key}
                type="button"
                onClick={() => handleSelectBoardForCreate(option.key)}
                className="checkers-board-choice rounded-[1rem] border border-[#b9934c]/28 bg-black/48 p-3 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[#f0d381]/58 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/45"
              >
                {option.key === 'cinematic' ? (
                  <img src={SHADOW_CHECKERS_ASSETS.boardCinematic} alt="" className="aspect-square w-full rounded-[0.7rem] object-contain" loading="eager" />
                ) : renderClassicBoardSample()}
                <span className="mt-3 block text-sm font-semibold text-[#f6e0a2]">{option.title}</span>
                <span className="mt-1 block text-xs text-[#b9a16f]">{option.detail}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const renderCharacterDialog = () => {
    if (!characterModal) return null
    const takenCharacter = characterModal.mode === 'join' ? characterModal.takenCharacter : null

    return (
      <div className="checkers-picker-overlay fixed inset-0 z-[90] flex items-center justify-center bg-black/74 px-3 py-[calc(env(safe-area-inset-top)_+_0.85rem)] backdrop-blur-sm" onMouseDown={() => setCharacterModal(null)}>
        <section
          role="dialog"
          aria-modal="true"
          aria-label={characterModal.mode === 'create' ? 'Create public match' : 'Join match'}
          className="checkers-character-dialog w-full max-w-md rounded-[1.1rem] border border-[#d7aa46]/35 bg-[linear-gradient(180deg,rgba(20,18,14,0.98),rgba(0,0,0,0.98))] p-4 text-[#f6e0a2] shadow-[0_26px_90px_rgba(0,0,0,0.72)]"
          onMouseDown={event => event.stopPropagation()}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b9a16f]">Choose character</p>
              <h2 className="mt-1 text-2xl font-semibold">{characterModal.mode === 'create' ? 'Create Public Match' : 'Join Match'}</h2>
            </div>
            <button type="button" aria-label="Close character picker" onClick={() => setCharacterModal(null)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#f0d381] hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
          {renderCharacterPicker(takenCharacter)}
          <div className="mt-4 flex justify-end gap-2">
            <CheckersButton variant="ghost" onClick={() => setCharacterModal(null)}>
              Cancel
            </CheckersButton>
            <CheckersButton loading={busy === 'create' || busy === 'join'} onClick={handleConfirmCharacter}>
              {characterModal.mode === 'create' ? 'Create Match' : 'Join Match'}
            </CheckersButton>
          </div>
        </section>
      </div>
    )
  }

  const renderHeaderMenu = () => {
    const hasActiveBoard = Boolean(activeMatch && state)
    const canResign = Boolean(activeMatch && activePlayer && activeMatch.status === 'active' && !state?.winner)
    const canContinueFromResult = Boolean(activeMatch && state?.winner && activePlayer)

    return (
      <div ref={menuRef} className="relative shrink-0" onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { event.stopPropagation(); setMenuOpen(false); menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus() } }}>
        <button
          type="button"
          aria-label="Open Shadow Checkers menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(value => !value)}
          className="relative z-[96] flex h-11 w-11 items-center justify-center border-0 bg-transparent text-[#f0d381] drop-shadow-[0_2px_3px_#000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381]"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
        {menuOpen && (
          <>
          <button type="button" tabIndex={-1} aria-label="Close Shadow Checkers menu" className="fixed inset-0 z-[90] cursor-default border-0 bg-transparent p-0" onClick={() => { setMenuOpen(false); menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus() }} />
          <div role="region" aria-label="Shadow Checkers menu" className="absolute right-0 top-[calc(100%+0.45rem)] z-[95] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-[0.95rem] border border-[#b9934c]/32 bg-[linear-gradient(180deg,rgba(23,21,17,0.98),rgba(0,0,0,0.98))] py-1.5 text-sm text-[#f6e0a2] shadow-[0_22px_70px_rgba(0,0,0,0.72)] backdrop-blur-md" style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 4rem)' }}>
            <p className="px-3 py-2 font-serif text-base tracking-[.12em] text-[#f0d381]">Shadow Checkers</p>
            {activeMatch && state && <section aria-label="Players at this table" className="mx-2 mb-1.5 space-y-2 border-b border-[#b9934c]/25 pb-2">
              <PlayerChip name={displayName(activeMatch.player_one, 'Player one')} characterKey={activeMatch.player_one_character_key} showCharacterName crown={shouldShowLegacyAchievementBadges(activeMatch.player_one) && activeMatch.player_one?.checkers_crown} detail={`Silver · ${formatPieceCount(state.pieces.filter(piece => piece.owner === 'player_one').length)}`} activeTurn={!state.winner && currentTurnSlot === 'player_one'} turnFlash={showYourTurnBanner && myTurn && viewerSlot === 'player_one'} />
              <PlayerChip name={displayName(activeMatch.player_two, 'Open seat')} characterKey={activeMatch.player_two_character_key} showCharacterName crown={shouldShowLegacyAchievementBadges(activeMatch.player_two) && activeMatch.player_two?.checkers_crown} detail={`Black · ${formatPieceCount(state.pieces.filter(piece => piece.owner === 'player_two').length)}`} muted={!activeMatch.player_two} activeTurn={!state.winner && currentTurnSlot === 'player_two'} turnFlash={showYourTurnBanner && myTurn && viewerSlot === 'player_two'} />
            </section>}
            <button
              type="button"
              onClick={() => { if (selectedMatchId) handleSelectMatch(null); else onExit?.(); setMenuOpen(false) }}
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.08]"
            ><ArrowLeft className="h-4 w-4 text-[#f0d381]" />{selectedMatchId ? 'Back to Shadow Checkers lobby' : 'Exit to entertainment'}</button>
            <button
              type="button"
              onClick={() => {
                setRulesOpen(true)
                setMenuOpen(false)
              }}
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.08]"
            >
              <HelpCircle className="h-4 w-4 text-[#f0d381]" />
              Rules
            </button>
            {hasActiveBoard && <button type="button" onClick={() => { boardControls.current?.openCameraHelp(); setMenuOpen(false) }} className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.08]"><HelpCircle className="h-4 w-4 text-[#f0d381]" />Camera help</button>}
            {hasActiveBoard && <button type="button" onClick={() => { boardControls.current?.toggleAccessibleBoard(); setMenuOpen(false) }} className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.08]"><Accessibility className="h-4 w-4 text-[#f0d381]" />Toggle accessible board</button>}
            <button type="button" aria-pressed={masterSoundEnabled} onClick={onToggleMasterSound} className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.08]">{masterSoundEnabled ? <Volume2 className="h-4 w-4 text-[#f0d381]" /> : <VolumeX className="h-4 w-4 text-[#f0d381]" />}Master Sound: {masterSoundEnabled ? 'On' : 'Off'}</button>
            <button type="button" aria-pressed={effectivePreferences.gameSfx} onClick={() => updatePreferences({ gameSfx: !effectivePreferences.gameSfx })} className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.08]"><Volume2 className="h-4 w-4 text-[#f0d381]" />Piece Sounds: {effectivePreferences.gameSfx ? 'On' : 'Off'}</button>
            {hasActiveBoard && <button type="button" aria-pressed={chatFeedVisible} onClick={() => setChatFeedVisible(value => !value)} className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.08]"><MessageSquare className="h-4 w-4 text-[#f0d381]" />Chat Feed: {chatFeedVisible ? 'Shown' : 'Hidden'}</button>}
            <button
              type="button"
              onClick={() => {
                onToggleMusic?.()
                setMenuOpen(false)
              }}
              aria-pressed={musicEnabled}
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.08]"
            >
              <Music className="h-4 w-4 text-[#f0d381]" />
              Music: {musicEnabled ? 'On' : 'Off'}{musicPlaying && masterSoundEnabled ? ' · Playing' : ''}{audioBlocked && musicEnabled ? ' · Tap to retry' : ''}
            </button>
            {hasActiveBoard && (
              <button
                type="button"
                onClick={() => setShowLastMove(value => !value)}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.08]"
              >
                <Eye className="h-4 w-4 text-[#f0d381]" />
                {showLastMove ? 'Hide Last Move' : 'Show Last Move'}
              </button>
            )}
            {hasActiveBoard && activePlayer && (
              <button
                type="button"
                onClick={() => setShowHints(value => !value)}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.08]"
              >
                <Shield className="h-4 w-4 text-[#f0d381]" />
                {showHints ? 'Hide Hints' : 'Show Hints'}
              </button>
            )}
            {canResign && activeMatch && (
              <button
                type="button"
                onClick={() => {
                  menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
                  setMenuOpen(false)
                  setConfirmError(null)
                  setConfirmation({ kind: 'resign', matchId: activeMatch.id })
                }}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left text-red-100 hover:bg-red-950/35"
              >
                <X className="h-4 w-4 text-red-200" />
                Resign
              </button>
            )}
            {canContinueFromResult && activeMatch && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  if (state?.winner === viewerSlot && queue.length > 0) {
                    void guarded(() => actions.nextChallenger(activeMatch.id), 'Next challenger seated')
                  } else {
                    void guarded(() => actions.rematch(activeMatch.id), 'Rematch started')
                  }
                }}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.08]"
              >
                <Swords className="h-4 w-4 text-[#f0d381]" />
                {state?.winner === viewerSlot && queue.length > 0 ? 'Next Challenger' : 'Rematch'}
              </button>
            )}
          </div>
          </>
        )}
      </div>
    )
  }

  const renderLobbyCard = (match: ShadowCheckersMatch) => {
    const session = sessions.find(candidate => candidate.id === match.session_id)
    const currentUserIsPlayer = isPlayer(match, user?.id)
    const canJoin = match.status === 'waiting' && !currentUserIsPlayer
    const canQueue = match.status === 'active' && !currentUserIsPlayer
    const isCreator = match.player_one_id === user?.id
    const canCancel = (isCreator && match.status === 'waiting') || (isAdmin && (match.status === 'waiting' || match.status === 'active'))
    const unreadCount = unreadMatchCounts[match.id] ?? 0

    return (
      <article
        key={match.id}
        data-checkers-match-id={match.id}
        data-checkers-session-id={session?.id}
        className="rounded-[1rem] border border-[#b9934c]/25 bg-black/58 p-2 shadow-[0_18px_45px_rgba(0,0,0,0.35)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="checkers-lobby-card-title text-sm font-semibold text-[#f6e0a2]">
              {match.status === 'waiting' ? 'Waiting for challenger' : 'Active match'}
            </p>
            <p className="checkers-lobby-card-names mt-1 text-xs text-[#b9a16f]">
              {displayName(match.player_one, 'Creator')} vs {match.player_two ? displayName(match.player_two) : 'Open seat'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {unreadCount > 0 && (
              <span
                className="rounded-full border border-[#f4d985]/55 bg-[#d7aa46]/16 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#f4d985]"
                aria-label={`${unreadCount} unread ${unreadCount === 1 ? 'update' : 'updates'} for this match`}
                data-testid={`checkers-unread-${match.id}`}
              >
                {unreadCount > 99 ? '99+' : unreadCount} new
              </span>
            )}
            <span className="rounded-full border border-[#d7aa46]/30 bg-[#d7aa46]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#f0d381]">
              {match.status}
            </span>
          </div>
        </div>
        <div className="checkers-lobby-card-players mt-1 grid grid-cols-2 gap-1">
          <PlayerChip compact name={displayName(match.player_one, 'Creator')} characterKey={match.player_one_character_key} crown={shouldShowLegacyAchievementBadges(match.player_one) && match.player_one?.checkers_crown} />
          <PlayerChip compact name={match.player_two ? displayName(match.player_two) : 'Open seat'} characterKey={match.player_two_character_key} crown={shouldShowLegacyAchievementBadges(match.player_two) && match.player_two?.checkers_crown} muted={!match.player_two} />
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {currentUserIsPlayer && (
            <CheckersButton onClick={() => handleSelectMatch(match.id)}>
              <Swords className="mr-2 h-4 w-4" />
              Continue
            </CheckersButton>
          )}
          {canJoin && session && (
            <CheckersButton loading={busy === 'join'} onClick={() => setCharacterModal({ mode: 'join', sessionId: session.id, takenCharacter: match.player_one_character_key })}>
              <Users className="mr-2 h-4 w-4" />
              Join
            </CheckersButton>
          )}
          {match.status === 'active' && (
            <CheckersButton variant="secondary" onClick={() => handleSelectMatch(match.id)}>
              <Eye className="mr-2 h-4 w-4" />
              {currentUserIsPlayer ? 'Open' : 'Spectate'}
            </CheckersButton>
          )}
          {canQueue && session && (
            <CheckersButton variant="secondary" loading={busy === 'queue'} onClick={() => void guarded(() => actions.queue(session.id, selectedCharacter), 'Joined queue')}>
              <Shield className="mr-2 h-4 w-4" />
              Queue
            </CheckersButton>
          )}
          {canCancel && (
            <CheckersButton
              variant="danger"
              loading={busy === 'cancel'}
              onClick={() => { setConfirmError(null); setConfirmation({ kind: 'cancel', matchId: match.id, adminRemoval: isAdmin && !isCreator }) }}
            >
              {isAdmin && !isCreator ? 'Delete Match' : 'Cancel'}
            </CheckersButton>
          )}
        </div>
      </article>
    )
  }

  const renderLobby = () => (
    <main className="shadow-checkers-lobby relative z-10 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-2">
      <div className="flex min-h-0 items-center gap-2 pr-[3rem]">
        <img src={SHADOW_CHECKERS_ASSETS.logo} alt="Shadow Checkers" className="h-[clamp(2.4rem,14vh,5.5rem)] w-[min(20vw,9rem)] shrink-0 object-contain" />
        <div className="flex min-w-0 flex-wrap gap-2">
          <CheckersButton aria-label="Create Public Match" loading={busy === 'create'} onClick={() => setBoardModalOpen(true)}><Plus className="mr-1 h-4 w-4" />Create Match</CheckersButton>
          {myMatch && <CheckersButton aria-label="Continue Current Match" variant="secondary" onClick={() => handleSelectMatch(myMatch.id)}><Swords className="mr-1 h-4 w-4" />Continue Match</CheckersButton>}
        </div>
      </div>
      <div role="tablist" aria-label="Shadow Checkers lobby" className="flex shrink-0 gap-2">
        {([['tables', 'Tables'], ['fame', 'Hall of Fame'], ['players', 'Players']] as const).map(([tab, label]) => <button key={tab} type="button" role="tab" aria-selected={lobbyTab === tab} onClick={() => setLobbyTab(tab)} className={cn('min-h-11 rounded-lg border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381]', lobbyTab === tab ? 'border-[#f0d381] bg-[#d7aa46]/20 text-[#f0d381]' : 'border-[#b9934c]/30 bg-black/50 text-[#d9c79f]')}>{label}</button>)}
        {lobbyTab !== 'players' && (lobbyTab === 'tables' ? lobbyPageCount : famePageCount) > 1 && <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="Previous page" disabled={lobbyTab === 'tables' ? lobbyPage === 0 : famePage === 0} onClick={() => lobbyTab === 'tables' ? setLobbyPage(page => page - 1) : setFamePage(page => page - 1)} className="min-h-11 min-w-11 rounded-lg border border-[#b9934c]/30 bg-black/50 text-[#f0d381] disabled:opacity-45">‹</button>
          <span className="min-w-10 text-center text-xs text-[#d9c79f]">{lobbyTab === 'tables' ? Math.min(lobbyPage, lobbyPageCount - 1) + 1 : Math.min(famePage, famePageCount - 1) + 1} / {lobbyTab === 'tables' ? lobbyPageCount : famePageCount}</span>
          <button type="button" aria-label="Next page" disabled={lobbyTab === 'tables' ? lobbyPage >= lobbyPageCount - 1 : famePage >= famePageCount - 1} onClick={() => lobbyTab === 'tables' ? setLobbyPage(page => page + 1) : setFamePage(page => page + 1)} className="min-h-11 min-w-11 rounded-lg border border-[#b9934c]/30 bg-black/50 text-[#f0d381] disabled:opacity-45">›</button>
        </div>}
      </div>
      <section role="tabpanel" className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[#b9934c]/30 bg-black/60 p-2">
        {lobbyTab === 'tables' && (loading ? <div className="flex h-full items-center justify-center"><LoadingSpinner size="lg" className="text-[#f0d381]" /></div> : <div className="flex h-full min-h-0 flex-col">
          <h2 className="mb-1 text-sm font-semibold text-[#f0d381]">Open Matches &amp; Live Boards</h2>
          <div className="min-h-0 flex-1 overflow-hidden">{lobbyMatches.length ? visibleLobbyMatches.map(renderLobbyCard) : <p className="self-center text-sm text-[#d9c79f]">No active tables yet. Create the first one.</p>}</div>
        </div>)}
        {lobbyTab === 'fame' && <HallOfFame leaderboard={visibleLeaders} rankOffset={Math.min(famePage, famePageCount - 1)} />}
        {lobbyTab === 'players' && <div className="h-full overflow-hidden"><ShadowCheckersInvitePicker characterKey={selectedCharacter} boardSkin={selectedBoardSkin} /></div>}
      </section>
    </main>
  )

  const renderMatch = () => {
    if (!activeMatch || !state) return null
    const winnerName = state.winner === 'player_one'
      ? displayName(activeMatch.player_one)
      : displayName(activeMatch.player_two)
    const resultTitle = state.winner === viewerSlot
      ? 'Victory'
      : viewerSlot === 'spectator'
        ? 'Match Concluded'
        : 'Defeat'
    const resultAsset = state.winner === viewerSlot || viewerSlot === 'spectator'
      ? SHADOW_CHECKERS_ASSETS.victory
      : SHADOW_CHECKERS_ASSETS.defeat
    const showResultOverlay = Boolean(state.winner && state === presentedBoard && dismissedResultMatchId !== activeMatch.id)
    const totalCaptures = state.stats.player_one.captures + state.stats.player_two.captures
    const totalCrowns = state.stats.player_one.kings + state.stats.player_two.kings

    return (
      <main className="shadow-checkers-match-surface relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <div className="relative flex min-h-0 flex-1">
          <section className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="relative h-full">
              <ShadowCheckersUnityBoard
                key={activeMatch.id}
                ref={boardControls}
                fill
                masterSoundEnabled={masterSoundEnabled}
                onPresentationComplete={setPresentedBoard}
                paused={rotateGate}
                state={state}
                viewerSlot={viewerSlot}
                selectedPieceId={selectedPieceId}
                legalMoves={legalMoves}
                helperMoves={helperMoves}
                highlightedMove={highlightedLastMove}
                onSelectPiece={handleSelectPiece}
                onSelectMove={handleSelectMove}
                onInvalidDestination={handleInvalidDestination}
                disabled={rotateGate || Boolean(confirmation) || !myTurn || Boolean(state.winner) || busy === 'move'}
                showHints={showHints}
                boardSkin={activeBoardSkin}
              />
              {showResultOverlay && (
                <button
                  type="button"
                  aria-label="Dismiss match result"
                  onClick={() => setDismissedResultMatchId(activeMatch.id)}
                  className="absolute inset-0 z-30 flex items-center justify-center bg-black/[0.68] p-3 text-left backdrop-blur-[2px]"
                >
                  <div className="checkers-result-card w-full max-w-[31rem] overflow-hidden rounded-[1.1rem] border border-[#f0d381]/35 bg-black/[0.98] shadow-[0_28px_80px_rgba(0,0,0,0.78)]">
                    <img src={resultAsset} alt="" className="h-40 w-full object-cover sm:h-52" loading="eager" />
                    <div className="space-y-3 p-4 text-center">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b9a16f]">Tap anywhere to dismiss</p>
                        <h2 className="mt-1 text-2xl font-semibold text-[#f6e0a2]">{resultTitle}</h2>
                        <p className="mt-1 text-sm text-[#d9c79f]">Winner: {winnerName}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-[#d9c79f]">
                        <span className="rounded-[0.65rem] border border-[#b9934c]/20 bg-white/[0.04] px-2 py-2">Reason: {formatWinReason(state.winReason ?? activeMatch.win_reason)}</span>
                        <span className="rounded-[0.65rem] border border-[#b9934c]/20 bg-white/[0.04] px-2 py-2">Moves: {activeMatch.move_count}</span>
                        <span className="rounded-[0.65rem] border border-[#b9934c]/20 bg-white/[0.04] px-2 py-2">Captures: {totalCaptures}</span>
                        <span className="rounded-[0.65rem] border border-[#b9934c]/20 bg-white/[0.04] px-2 py-2">Crowns: {totalCrowns}</span>
                      </div>
                    </div>
                  </div>
                </button>
              )}
            </div>
          </section>

          {chatFeedVisible && !matchChatOpen && <section aria-label="Recent match chat" className="shadow-checkers-chat-feed pointer-events-none absolute bottom-[max(0.6rem,env(safe-area-inset-bottom))] right-2 z-20 w-[min(18rem,38vw)] space-y-1 text-xs text-[#f6e0a2]">
            {chat.length === 0 ? <p className="text-[#d9c79f]">Match chat will appear here.</p> : chat.slice(-4).map(message => <p key={message.id} className="line-clamp-2 break-words"><strong className="text-[#f0d381]">{displayName(message.user)}:</strong> {message.body}</p>)}
          </section>}
          {matchChatOpen && activeMatch.status === 'active' && <section aria-label="Match chat composer" className="shadow-checkers-chat-composer absolute bottom-[max(0.6rem,env(safe-area-inset-bottom))] right-2 z-40 w-[min(22rem,48vw)] rounded-xl border border-[#b9934c]/45 bg-black/90 p-2 shadow-xl backdrop-blur-sm" onKeyDown={event => { if (event.key === 'Escape') { setMatchChatOpen(false); chatInputRef.current?.blur() } }}>
            <form onSubmit={handlePostChat} className="flex items-center gap-1">
              <input ref={chatInputRef} autoFocus aria-label="Match message" enterKeyHint="send" value={chatDraft} onChange={event => setChatDraft(event.target.value.slice(0, 120))} placeholder="Say something" className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#b9934c]/35 bg-black/55 px-2 text-base text-[#f6e0a2] focus:outline-none focus:ring-2 focus:ring-[#f0d381]" />
              <button type="submit" disabled={chatSending || !chatDraft.trim()} aria-label="Send match message" className="flex min-h-11 items-center justify-center rounded-lg border border-[#f0d381]/60 bg-[#d7aa46] px-3 text-sm font-bold text-[#120d08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381] disabled:opacity-50">Send</button>
              <button type="button" aria-label="Close match chat" onClick={() => { setMatchChatOpen(false); chatInputRef.current?.blur() }} className="flex min-h-11 min-w-11 items-center justify-center text-[#f0d381] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381]"><X size={18} /></button>
            </form>
            {chatError && <p role="alert" className="mt-1 text-xs text-red-100">{chatError}</p>}
          </section>}
        </div>
      </main>
    )
  }

  return (
    <div ref={gameRoot} className="relative flex h-full min-h-0 flex-col overflow-hidden bg-black pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-[#f6e0a2]">
      {!rotateGate && <CheckersNotice notice={notice} onDismiss={dismissNotice} />}
      {rotateGate && <div className="absolute inset-0 z-[150] flex flex-col items-center justify-center gap-3 bg-black px-8 text-center" role="dialog" aria-modal="true" aria-label="Rotate phone to play">
        <img src={SHADOW_CHECKERS_ASSETS.logo} alt="Shadow Checkers" className="h-16 max-w-[min(60vw,22rem)] object-contain" />
        <p className="text-2xl font-semibold text-[#f0d381]">Rotate your phone</p>
        <p className="max-w-xs text-sm text-[#d9c79f]">Shadow Checkers plays sideways. Turn your phone to enter the study.</p>
        <CheckersButton onClick={() => void requestLandscape(true)}>Enter landscape</CheckersButton>
        <CheckersButton variant="ghost" onClick={onExit}>Back to entertainment</CheckersButton>
      </div>}
      <div className={cn('relative flex min-h-0 flex-1 flex-col', rotateGate && 'invisible')} aria-hidden={rotateGate || undefined}>
      <img src={SHADOW_CHECKERS_ASSETS.background} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.56]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(215,170,70,0.18),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.58),rgba(0,0,0,0.20)_42%,rgba(0,0,0,0.84))]" />
      <div className="pointer-events-none absolute right-[max(.4rem,env(safe-area-inset-right))] top-[max(.3rem,env(safe-area-inset-top))] z-[60] flex items-center gap-1">
        {activeMatch && <button type="button" aria-label={matchChatOpen ? 'Close match chat' : 'Open match chat'} aria-expanded={matchChatOpen} onClick={() => { setMatchChatOpen(open => !open); setChatError(null); if (matchChatOpen) chatInputRef.current?.blur() }} className="pointer-events-auto flex h-11 min-w-11 items-center justify-center border-0 bg-transparent text-[#f0d381] drop-shadow-[0_2px_3px_#000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381]"><MessageSquare className="h-5 w-5" /></button>}
        <div className="pointer-events-auto">{renderHeaderMenu()}</div>
      </div>
      {selectedMatchId && activeMatch ? renderMatch() : renderLobby()}
      {busy && (
        <div className="pointer-events-none fixed right-4 top-[calc(env(safe-area-inset-top)_+_5.2rem)] z-[70] inline-flex items-center gap-2 rounded-full border border-[#b9934c]/35 bg-black/82 px-3 py-2 text-xs text-[#d9c79f] shadow-[0_16px_40px_rgba(0,0,0,0.48)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#f0d381]" />
          Syncing checkers
        </div>
      )}
      {audioBlocked && (
        <div className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)_+_5.7rem)] z-[70] -translate-x-1/2 rounded-full border border-[#b9934c]/35 bg-black/82 px-3 py-2 text-center text-xs text-[#d9c79f] shadow-[0_16px_40px_rgba(0,0,0,0.48)]">
          Tap the menu music item to start the soundtrack.
        </div>
      )}
      {error && (
        <div className="relative z-20 m-3 rounded-[0.8rem] border border-[rgba(190,52,85,0.45)] bg-[rgba(87,14,28,0.3)] p-3 text-sm text-red-100">
          {error}
        </div>
      )}
      {renderRulesDialog()}
      {renderBoardChoiceDialog()}
      {renderCharacterDialog()}
      {confirmation && <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !confirmPending) setConfirmation(null) }}>
        <div ref={confirmationRef} role="alertdialog" aria-modal="true" aria-labelledby={`${confirmationId}-title`} aria-describedby={`${confirmationId}-description`} aria-busy={confirmPending} className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-full max-w-sm overflow-y-auto rounded-[1.1rem] border border-[#d7aa46]/35 bg-[linear-gradient(180deg,#17150f,#000000)] p-4 text-[#f6e0a2] shadow-[0_26px_90px_rgba(0,0,0,0.72)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b9a16f]">Shadow Checkers</p>
          <h2 id={`${confirmationId}-title`} className="mt-1 text-xl font-semibold">{confirmation.kind === 'resign' ? 'Leave this contest?' : confirmation.adminRemoval ? 'Remove this table?' : 'Cancel this table?'}</h2>
          <p id={`${confirmationId}-description`} className="mt-3 text-sm leading-6 text-[#d9c79f]">{confirmation.kind === 'resign' ? 'Resigning awards the win to your opponent.' : confirmation.adminRemoval ? 'This match will be removed from the lobby.' : 'This unfinished match will be removed from the lobby.'}</p>
          {confirmError && <p role="alert" className="mt-3 text-sm text-red-100">{confirmError}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <CheckersButton variant="secondary" disabled={confirmPending} onClick={() => setConfirmation(null)}>{confirmation.kind === 'resign' ? 'Keep playing' : 'Keep table'}</CheckersButton>
            <CheckersButton variant="danger" loading={confirmPending} onClick={() => void confirmMatchAction()}>{confirmation.kind === 'resign' ? 'Resign match' : confirmation.adminRemoval ? 'Remove table' : 'Cancel table'}</CheckersButton>
          </div>
        </div>
      </div>}
      </div>
    </div>
  )
}

function PlayerChip({
  name,
  characterKey,
  crown,
  detail,
  align = 'left',
  muted = false,
  activeTurn = false,
  turnFlash = false,
  showCharacterName = false,
  compact = false,
}: {
  name: string
  characterKey?: string | null
  crown?: boolean | null
  detail?: string
  align?: 'left' | 'right'
  muted?: boolean
  activeTurn?: boolean
  turnFlash?: boolean
  showCharacterName?: boolean
  compact?: boolean
}) {
  const character = getShadowCheckersCharacter(characterKey)
  return (
    <div
      className={cn(
        'relative flex min-w-0 items-center gap-2 rounded-[0.85rem] border bg-white/[0.035] transition-[border-color,box-shadow,background] duration-200',
        compact ? 'p-1' : 'p-2.5',
        activeTurn ? 'border-[#f0d381]/80 bg-[#d7aa46]/12 shadow-[0_0_26px_rgba(215,170,70,0.22)]' : 'border-white/8',
        align === 'right' && 'flex-row-reverse text-right',
        muted && 'opacity-60'
      )}
    >
      <img src={character.portrait} alt="" className={cn('shrink-0 rounded-full border border-[#d7aa46]/28 object-cover', compact ? 'h-8 w-8' : 'h-12 w-12')} loading="lazy" />
      <CheckersCrownBadge active={crown} className="absolute right-1.5 top-1.5" />
      {turnFlash && !showCharacterName && (
        <img
          src={SHADOW_CHECKERS_ASSETS.yourTurn}
          alt=""
          className="pointer-events-none absolute inset-x-3 top-1/2 z-10 -translate-y-1/2 opacity-90 drop-shadow-[0_14px_24px_rgba(0,0,0,0.78)]"
          loading="eager"
        />
      )}
      <div className="min-w-0">
        <p className="truncate text-[clamp(0.82rem,3.25vw,0.96rem)] font-semibold leading-tight text-[#f6e0a2]">{name}</p>
        {showCharacterName && <p className="truncate text-[11px] text-[#d9c79f]">{`${character.name}${activeTurn ? ' · To move' : ''}`}</p>}
        <p className="truncate text-[11px] text-[#b9a16f]">{detail || character.title}</p>
      </div>
    </div>
  )
}

function HallOfFame({ leaderboard, rankOffset }: { leaderboard: Array<{ user_id: string; wins: number; losses: number; total_games: number; user?: any }>; rankOffset: number }) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-[1rem] border border-[#b9934c]/25 bg-black/58 p-2 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-[#f0d381]" />
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#f0d381]">Hall of Fame</h3>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
        {leaderboard.length === 0 ? (
          <p className="text-sm text-[#b9a16f]">Complete a match to enter the Hall of Fame.</p>
        ) : leaderboard.map((row, index) => {
          const winRate = row.total_games > 0 ? Math.round((row.wins / row.total_games) * 100) : 0
          return (
            <div key={row.user_id} data-checkers-rank={rankOffset + index + 1} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-[0.8rem] border border-white/8 bg-white/[0.035] px-2 py-1">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7aa46]/28 bg-[#d7aa46]/10 text-xs font-bold text-[#f0d381]">
                {rankOffset + index === 0 ? <Crown className="h-4 w-4" /> : rankOffset + index + 1}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate text-sm font-semibold text-[#f6e0a2]">
                  <span className="truncate">{displayName(row.user)}</span>
                  <CheckersCrownBadge active={shouldShowLegacyAchievementBadges(row.user) && row.user?.checkers_crown} />
                </p>
                <p className="text-[11px] text-[#b9a16f]">{row.wins}W / {row.losses}L</p>
              </div>
              <span className="text-xs font-semibold text-[#d9c79f]">{winRate}%</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
