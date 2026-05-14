import React from 'react'
import { ArrowLeft, HelpCircle, Loader2, Music, Plus, Shield, Swords, Trophy, Users, Volume2, VolumeX, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { useAuth } from '../../../hooks/useAuth'
import { cn } from '../../../lib/utils'
import type { GameSession, GameSessionPresence, ShadowWarStats } from '../../../lib/supabase'
import { useShadowWar } from './hooks/useShadowWar'
import { ShadowWarMatch } from './components/ShadowWarMatch'
import { SHADOW_WAR_ASSETS } from './assets/manifest'
import { useShadowWarIdentity } from './hooks/useShadowWarIdentity'
import { useShadowWarLobbyPresence } from './hooks/useShadowWarLobbyPresence'
import {
  getShadowWarAvatar,
  getShadowWarFaction,
  SHADOW_WAR_AVATARS,
  SHADOW_WAR_FACTIONS,
} from './identity'
import { SHADOW_WAR_CARD_DEFINITIONS } from './engine/cards'
import { SHADOW_WAR_CARD_MATCHUP_NOTES } from './engine/cardGuide'
import { ShadowWarSwordBadge } from './components/ShadowWarSwordBadge'

interface ShadowWarScreenProps {
  onExit?: () => void
  musicPlaying?: boolean
  audioBlocked?: boolean
  onToggleMusic?: () => void
}

type WarButtonVariant = 'primary' | 'secondary' | 'ghost'
type IdentityDialogState =
  | { mode: 'create' }
  | { mode: 'join'; sessionId: string }
  | { mode: 'queue'; sessionId: string }

function WarButton({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: WarButtonVariant
  loading?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-[0.55rem] border px-4 py-2 text-sm font-semibold transition-[border-color,box-shadow,color,background,opacity,transform] duration-200 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'border-[#f0d381]/60 bg-[linear-gradient(180deg,#d7aa46,#7a5620)] text-[#120d08] shadow-[0_16px_35px_rgba(215,170,70,0.28)] hover:-translate-y-0.5',
        variant === 'secondary' && 'border-[#b9934c]/40 bg-black/45 text-[#f1d58d] hover:border-[#f0d381]/60 hover:bg-[#2a2114]/70',
        variant === 'ghost' && 'border-transparent bg-transparent text-[#d9c79f] hover:border-[#b9934c]/30 hover:bg-white/5',
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

function sessionTitle(session: GameSession) {
  if (session.status === 'waiting') return 'Waiting for challenger'
  if (session.status === 'active') return 'Duel in progress'
  if (session.status === 'completed') return 'Completed duel'
  return 'Cancelled duel'
}

function displayPlayerName(session: GameSession, slot: 'one' | 'two') {
  const user = slot === 'one' ? session.player_one : session.player_two
  return user?.display_name || user?.username || (slot === 'one' ? 'Player one' : 'Open seat')
}

function displayPresenceName(presence: GameSessionPresence) {
  return presence.user?.display_name || presence.user?.username || 'Shadow player'
}

function isUserInSession(session: GameSession, userId?: string | null) {
  return Boolean(userId && (session.player_one_id === userId || session.player_two_id === userId))
}

function winRate(stats: ShadowWarStats) {
  return stats.total_games > 0 ? Math.round((stats.wins / stats.total_games) * 100) : 0
}

export function ShadowWarScreen({
  onExit,
  musicPlaying = false,
  audioBlocked = false,
  onToggleMusic,
}: ShadowWarScreenProps) {
  const { user } = useAuth()
  const [instructionsOpen, setInstructionsOpen] = React.useState(false)
  const [identityDialog, setIdentityDialog] = React.useState<IdentityDialogState | null>(null)
  const { identity, setIdentity } = useShadowWarIdentity()
  const {
    sessions,
    selectedSessionId,
    activeSession,
    match,
    playerState,
    queue,
    moves,
    presence,
    leaderboard,
    loading,
    busy,
    error,
    actions,
  } = useShadowWar()
  const { users: lobbyUsers } = useShadowWarLobbyPresence(!selectedSessionId)

  const selectedIsPlayer = Boolean(activeSession && isUserInSession(activeSession, user?.id))
  const selectedHasPlayableMatch = Boolean(activeSession && match && selectedIsPlayer)
  const isQueuedForSelected = Boolean(queue.some(entry => entry.user_id === user?.id && entry.status === 'queued'))
  const presenceBySessionId = React.useMemo(() => {
    const next = new Map<string, GameSessionPresence[]>()
    presence.forEach(entry => {
      const sessionPresence = next.get(entry.session_id) ?? []
      sessionPresence.push(entry)
      next.set(entry.session_id, sessionPresence)
    })
    return next
  }, [presence])
  const visibleSessions = React.useMemo(() => (
    sessions.filter(session => (presenceBySessionId.get(session.id)?.length ?? 0) > 0 || session.id === selectedSessionId)
  ), [presenceBySessionId, selectedSessionId, sessions])
  const myOpenSession = visibleSessions.find(session => isUserInSession(session, user?.id) && session.status !== 'completed') ?? null
  const selectedAvatar = getShadowWarAvatar(identity.avatarId)
  const selectedFaction = getShadowWarFaction(identity.factionId)

  React.useEffect(() => {
    if (!instructionsOpen && !identityDialog) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInstructionsOpen(false)
        setIdentityDialog(null)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [identityDialog, instructionsOpen])

  const guarded = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      toast.success(success)
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Game action failed')
      return false
    }
  }

  const confirmIdentityDialog = async () => {
    if (!identityDialog) return

    if (identityDialog.mode === 'create') {
      if (!await guarded(actions.create, 'Duel created')) return
    } else if (identityDialog.mode === 'join') {
      if (!await guarded(() => actions.join(identityDialog.sessionId), 'Joined duel')) return
    } else {
      if (!await guarded(() => actions.queue(identityDialog.sessionId), 'Joined queue')) return
    }

    setIdentityDialog(null)
  }

  const goBack = () => {
    if (selectedSessionId) {
      actions.clearSession()
      return
    }
    onExit?.()
  }

  const renderSessionActions = (session: GameSession) => {
    const isPlayer = isUserInSession(session, user?.id)
    const canContinue = isPlayer && Boolean(session.current_match_id) && session.status !== 'completed'
    const canOpenWaitingTable = isPlayer && session.status === 'waiting'
    const sessionIsQueued = activeSession?.id === session.id
      ? isQueuedForSelected
      : false
    const canJoin = session.status === 'waiting' && !isPlayer
    const canQueue = session.status === 'active' && !isPlayer && !sessionIsQueued
    const hasActions = canContinue || canOpenWaitingTable || canJoin || canQueue || sessionIsQueued

    if (!hasActions) {
      return null
    }

    return (
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {canContinue ? (
          <WarButton className="sm:col-span-2" onClick={() => actions.selectSession(session.id)}>
            <Swords className="mr-2 h-4 w-4" />
            Continue Duel
          </WarButton>
        ) : null}

        {canOpenWaitingTable ? (
          <WarButton className="sm:col-span-2" variant="secondary" onClick={() => actions.selectSession(session.id)}>
            Open Table
          </WarButton>
        ) : null}

        {canJoin && (
          <WarButton className="sm:col-span-2" loading={busy === 'join'} onClick={() => setIdentityDialog({ mode: 'join', sessionId: session.id })}>
            <Users className="mr-2 h-4 w-4" />
            Join Duel
          </WarButton>
        )}
        {canQueue && (
          <WarButton className="sm:col-span-2" variant="secondary" loading={busy === 'queue'} onClick={() => setIdentityDialog({ mode: 'queue', sessionId: session.id })}>
            <Shield className="mr-2 h-4 w-4" />
            Queue
          </WarButton>
        )}
        {sessionIsQueued && (
          <WarButton className="sm:col-span-2" variant="ghost" loading={busy === 'leaveQueue'} onClick={() => void guarded(() => actions.leaveQueue(session.id), 'Left queue')}>
            Leave Queue
          </WarButton>
        )}
      </div>
    )
  }

  const renderSessionPresence = (session: GameSession) => {
    const sessionPresence = presenceBySessionId.get(session.id) ?? []

    if (sessionPresence.length === 0) {
      return (
        <p className="mt-3 rounded-[0.7rem] border border-[#b9934c]/20 bg-white/[0.035] px-3 py-2 text-xs text-[#b9a16f]">
          No player is currently at this table.
        </p>
      )
    }

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {sessionPresence.map(entry => (
          <span
            key={`${entry.session_id}-${entry.user_id}`}
            className="inline-flex min-h-8 items-center gap-2 rounded-full border border-[#d7aa46]/28 bg-[#d7aa46]/10 px-2.5 py-1 text-xs font-semibold text-[#f6e0a2]"
          >
            <span className="h-2 w-2 rounded-full bg-[#75f0a4] shadow-[0_0_12px_rgba(117,240,164,0.75)]" />
            {entry.user_id === user?.id ? 'You' : displayPresenceName(entry)}
          </span>
        ))}
      </div>
    )
  }

  const renderLeaderboard = () => (
    <aside className="rounded-[1rem] border border-[#b9934c]/25 bg-black/58 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b9a16f]">Hall of blades</p>
          <h3 className="mt-1 text-lg font-semibold text-[#f6e0a2]">Shadow War Leaderboard</h3>
        </div>
        <Trophy className="h-5 w-5 shrink-0 text-[#f0d381]" />
      </div>

      {leaderboard.length === 0 ? (
        <p className="rounded-[0.75rem] border border-[#b9934c]/18 bg-white/[0.035] px-3 py-3 text-sm text-[#b9a16f]">
          Finish a duel to claim the first sword.
        </p>
      ) : (
        <div className="space-y-2">
          {leaderboard.slice(0, 8).map((entry, index) => {
            const name = entry.user?.display_name || entry.user?.username || 'Shadow duelist'
            return (
              <div
                key={entry.user_id}
                className={cn(
                  'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[0.8rem] border px-3 py-2',
                  index === 0
                    ? 'border-[#f0d381]/48 bg-[#d7aa46]/14 shadow-[0_0_28px_rgba(215,170,70,0.12)]'
                    : 'border-white/8 bg-white/[0.035]'
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7aa46]/35 bg-black/62 text-xs font-bold text-[#f0d381]">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-[#f6e0a2]">
                    <span className="truncate">{name}</span>
                    <ShadowWarSwordBadge active={index === 0} />
                  </p>
                  <p className="truncate text-[11px] text-[#b9a16f]">
                    {entry.wins}W / {entry.losses}L · {winRate(entry)}% · {entry.rounds_won}-{entry.rounds_lost} rounds
                  </p>
                </div>
                <span className="rounded-full border border-[#d7aa46]/28 bg-[#d7aa46]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#f0d381]">
                  {entry.total_games}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )

  const renderIdentityDialog = () => {
    if (!identityDialog) return null

    const title = identityDialog.mode === 'create'
      ? 'Choose Your War Persona'
      : identityDialog.mode === 'join'
        ? 'Choose Persona To Join'
        : 'Choose Persona To Queue'
    const actionLabel = identityDialog.mode === 'create'
      ? 'Start Table'
      : identityDialog.mode === 'join'
        ? 'Join Duel'
        : 'Join Queue'

    return (
      <div
        className="fixed inset-0 z-[92] flex items-end justify-center bg-black/72 px-3 pb-[calc(env(safe-area-inset-bottom)_+_0.85rem)] pt-[calc(env(safe-area-inset-top)_+_0.85rem)] backdrop-blur-sm sm:items-center"
        role="presentation"
        onMouseDown={() => setIdentityDialog(null)}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="shadow-war-persona-title"
          className="max-h-full w-full max-w-lg overflow-y-auto rounded-[1.1rem] border border-[#d7aa46]/35 bg-[linear-gradient(180deg,rgba(24,20,14,0.98),rgba(5,6,7,0.98))] p-4 text-[#f6e0a2] shadow-[0_26px_90px_rgba(0,0,0,0.72)]"
          onMouseDown={event => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b9a16f]">Shadow War</p>
              <h2 id="shadow-war-persona-title" className="mt-1 text-2xl font-semibold text-[#f6e0a2]">
                {title}
              </h2>
              <p className="mt-1 text-sm text-[#b9a16f]">{selectedAvatar.name} of {selectedFaction.name}</p>
            </div>
            <button
              type="button"
              aria-label="Close persona picker"
              onClick={() => setIdentityDialog(null)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-transparent bg-black/10 text-[#f0d381] transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 rounded-[1rem] border border-[#b9934c]/24 bg-black/42 p-3">
            <div className="mb-3 flex items-center gap-3">
              <div className={cn('h-14 w-14 shrink-0 overflow-hidden rounded-full border bg-black/70', selectedAvatar.accentClass)}>
                <img src={selectedAvatar.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[#f6e0a2]">{selectedAvatar.name}</p>
                <p className="truncate text-sm text-[#b9a16f]">{selectedFaction.crest} {selectedFaction.name}</p>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-2">
              {SHADOW_WAR_AVATARS.map(avatar => (
                <button
                  key={avatar.id}
                  type="button"
                  aria-label={`Select ${avatar.name}`}
                  onClick={() => setIdentity(current => ({ ...current, avatarId: avatar.id }))}
                  className={cn(
                    'aspect-square overflow-hidden rounded-full border bg-black/72 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50',
                    avatar.accentClass,
                    identity.avatarId === avatar.id ? 'ring-2 ring-[#f0d381]/70' : 'opacity-72 hover:opacity-100'
                  )}
                >
                  <img src={avatar.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SHADOW_WAR_FACTIONS.map(faction => (
                <button
                  key={faction.id}
                  type="button"
                  onClick={() => setIdentity(current => ({ ...current, factionId: faction.id }))}
                  className={cn(
                    'min-h-11 rounded-[0.65rem] border bg-black/46 px-2 py-2 text-left transition-[border-color,background,transform] duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50',
                    faction.accentClass,
                    identity.factionId === faction.id ? 'bg-[#d7aa46]/12' : ''
                  )}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">{faction.crest}</span>
                  <span className="block truncate text-xs font-semibold text-[#f6e0a2]">{faction.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <WarButton variant="ghost" onClick={() => setIdentityDialog(null)}>
              Cancel
            </WarButton>
            <WarButton loading={busy === identityDialog.mode || (identityDialog.mode === 'create' && busy === 'create')} onClick={() => void confirmIdentityDialog()}>
              {actionLabel}
            </WarButton>
          </div>
        </section>
      </div>
    )
  }

  const renderInstructionsDialog = () => {
    if (!instructionsOpen) return null

    return (
      <div
        className="fixed inset-0 z-[90] flex items-end justify-center bg-black/72 px-3 pb-[calc(env(safe-area-inset-bottom)_+_0.85rem)] pt-[calc(env(safe-area-inset-top)_+_0.85rem)] backdrop-blur-sm sm:items-center"
        role="presentation"
        onMouseDown={() => setInstructionsOpen(false)}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="shadow-war-instructions-title"
          className="max-h-full w-full max-w-lg overflow-y-auto rounded-[1.1rem] border border-[#d7aa46]/35 bg-[linear-gradient(180deg,rgba(24,20,14,0.98),rgba(5,6,7,0.98))] p-4 text-[#f6e0a2] shadow-[0_26px_90px_rgba(0,0,0,0.72)]"
          onMouseDown={event => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b9a16f]">How to play</p>
              <h2 id="shadow-war-instructions-title" className="mt-1 text-2xl font-semibold text-[#f6e0a2]">
                Shadow War
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close Shadow War instructions"
              onClick={() => setInstructionsOpen(false)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-transparent bg-black/10 text-[#f0d381] transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 space-y-4 text-sm leading-6 text-[#d9c79f]">
            <p>
              Shadow War is a 1v1 tactical card duel. Each round, both players secretly place three units into Left, Center, and Right lanes, then lock formation.
            </p>

            <div className="rounded-[0.85rem] border border-[#b9934c]/24 bg-black/38 p-3">
              <h3 className="text-sm font-semibold text-[#f0d381]">Round Flow</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4">
                <li>Pick one card for each lane.</li>
                <li>Tap Battle to lock your formation.</li>
                <li>When both players lock, lanes reveal and resolve automatically.</li>
                <li>Win two lanes to take the round. First to 5 rounds wins the match.</li>
              </ol>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[0.85rem] border border-[#b9934c]/24 bg-black/38 p-3">
                <h3 className="text-sm font-semibold text-[#f0d381]">Strategy</h3>
                <p className="mt-2">
                  Strong cards can dominate a lane, but low cards have tricks. Sacrifice one lane when it helps you win the other two.
                </p>
              </div>
              <div className="rounded-[0.85rem] border border-[#b9934c]/24 bg-black/38 p-3">
                <h3 className="text-sm font-semibold text-[#f0d381]">Tables</h3>
                <p className="mt-2">
                  Create a duel to wait for a challenger, join an open table, or queue behind an active fight.
                </p>
              </div>
            </div>

            <div className="rounded-[0.85rem] border border-[#b9934c]/24 bg-black/38 p-3">
              <h3 className="text-sm font-semibold text-[#f0d381]">Card Strength And Abilities</h3>
              <p className="mt-2">
                Higher strength usually wins the lane, but abilities can swing matchups. Use this guide to decide when to commit power and when to counter it.
              </p>
              <div className="mt-3 space-y-2.5">
                {SHADOW_WAR_CARD_DEFINITIONS.map(card => (
                  <article
                    key={card.cardId}
                    className="rounded-[0.75rem] border border-white/8 bg-white/[0.035] p-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.55rem] border border-[#d7aa46]/32 bg-[#d7aa46]/12 text-base font-bold text-[#f6e0a2]">
                        {card.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <h4 className="text-sm font-semibold text-[#f6e0a2]">{card.name}</h4>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#b9a16f]">
                            {card.archetype}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[#d9c79f]">
                          <span className="font-semibold text-[#f0d381]">Power:</span> {card.description}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#b9a16f]">
                          <span className="font-semibold text-[#f0d381]">Can beat:</span> {SHADOW_WAR_CARD_MATCHUP_NOTES[card.cardId]}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    )
  }

  const renderLobby = () => (
    <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)_+_1rem)] md:px-6">
      {!selectedSessionId && (
        <section className="mb-4 overflow-hidden rounded-[1.35rem] border border-[#b9934c]/35 bg-black/58 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-sm md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b9a16f]">Tactical card duel</p>
              <h2 className="mt-1 text-2xl font-semibold text-[#f6e0a2] md:text-3xl">Choose your table</h2>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d7aa46]/40 bg-[#d7aa46]/10 text-[#f0d381]">
              <Swords className="h-6 w-6" />
            </div>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-[#d9c79f]">
            Create a fresh duel or join a table where a player is actively waiting.
          </p>
          <div className="mt-5 rounded-[1rem] border border-[#b9934c]/24 bg-black/42 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f0d381]">Lobby</p>
              <span className="rounded-full border border-[#d7aa46]/28 bg-[#d7aa46]/10 px-2 py-0.5 text-[10px] font-semibold text-[#f0d381]">
                {lobbyUsers.length || 1} active
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(lobbyUsers.length > 0 ? lobbyUsers : [{ id: user?.id ?? 'you', name: user?.display_name || user?.username || 'You', avatarUrl: user?.avatar_url ?? null, joinedAt: Date.now() }]).slice(0, 8).map(lobbyUser => (
                <div key={lobbyUser.id} className="flex min-w-[10rem] items-center gap-2 rounded-[0.7rem] border border-white/8 bg-white/[0.035] px-2 py-2">
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[#d7aa46]/28 bg-black/60">
                    {lobbyUser.avatarUrl ? (
                      <img src={lobbyUser.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <img src={selectedAvatar.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[#f6e0a2]">{lobbyUser.id === user?.id ? 'You' : lobbyUser.name}</p>
                    <p className="truncate text-[10px] text-[#b9a16f]">Browsing Shadow War</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <WarButton loading={busy === 'create'} onClick={() => setIdentityDialog({ mode: 'create' })}>
              <Plus className="mr-2 h-4 w-4" />
              Create Duel
            </WarButton>
            {myOpenSession && (
              <WarButton variant="secondary" onClick={() => actions.selectSession(myOpenSession.id)}>
                <Swords className="mr-2 h-4 w-4" />
                Continue Current Duel
              </WarButton>
            )}
          </div>
        </section>
      )}

      {selectedSessionId && activeSession && !selectedHasPlayableMatch && (
        <section className="mb-4 rounded-[1.35rem] border border-[#b9934c]/35 bg-black/68 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b9a16f]">Selected duel</p>
              <h2 className="mt-1 text-xl font-semibold text-[#f6e0a2]">{sessionTitle(activeSession)}</h2>
              <p className="mt-1 text-sm text-[#d9c79f]">
                {displayPlayerName(activeSession, 'one')} vs {displayPlayerName(activeSession, 'two')}
              </p>
              {renderSessionPresence(activeSession)}
            </div>
            <span className="rounded-full border border-[#d7aa46]/35 bg-[#d7aa46]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#f0d381]">
              {activeSession.status}
            </span>
          </div>
          {activeSession.status === 'active' && !selectedIsPlayer && (
            <p className="rounded-[0.75rem] border border-[#b9934c]/25 bg-white/[0.04] px-3 py-2 text-sm text-[#d9c79f]">
              This duel is live. You can join the challenger queue instead of being dropped into cards you cannot play.
            </p>
          )}
          {activeSession.status === 'waiting' && selectedIsPlayer && (
            <p className="rounded-[0.75rem] border border-[#b9934c]/25 bg-white/[0.04] px-3 py-2 text-sm text-[#d9c79f]">
              Your war table is open. Keep this screen up while a challenger joins.
            </p>
          )}
          {queue.length > 0 && (
            <div className="mt-3 rounded-[0.75rem] border border-[#b9934c]/25 bg-black/42 px-3 py-2 text-sm text-[#d9c79f]">
              {queue.length} queued challenger{queue.length === 1 ? '' : 's'} waiting.
            </div>
          )}
          {renderSessionActions(activeSession)}
        </section>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <LoadingSpinner size="lg" className="text-[#f0d381]" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="space-y-3">
            {visibleSessions.length === 0 && (
              <div className="rounded-[1rem] border border-[#b9934c]/25 bg-black/50 p-5 text-center text-sm text-[#b9a16f]">
                No active tables with players present. Create the first table.
              </div>
            )}
            {visibleSessions.map(session => (
              <article
                key={session.id}
                className={cn(
                  'rounded-[1rem] border bg-black/58 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-sm',
                  activeSession?.id === session.id
                    ? 'border-[#f0d381]/45'
                    : 'border-[#b9934c]/22'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#f6e0a2]">{sessionTitle(session)}</p>
                    <p className="mt-1 truncate text-xs text-[#b9a16f]">
                      {displayPlayerName(session, 'one')} vs {displayPlayerName(session, 'two')}
                    </p>
                  </div>
                  <span className="rounded-full border border-[#d7aa46]/30 bg-[#d7aa46]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#f0d381]">
                    {session.status}
                  </span>
                </div>
                {renderSessionPresence(session)}
                {renderSessionActions(session)}
              </article>
            ))}
          </section>
          {renderLeaderboard()}
        </div>
      )}
    </main>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#030405] text-[#f6e0a2]">
      <img
        src={SHADOW_WAR_ASSETS.battlefield}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.78]"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(215,170,70,0.18),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.42),rgba(0,0,0,0.12)_42%,rgba(0,0,0,0.74))]" />

      <header className="relative z-20 shrink-0 border-b border-[#b9934c]/35 bg-black shadow-[0_16px_40px_rgba(0,0,0,0.58)]">
        <div className="relative h-[calc(env(safe-area-inset-top)_+_5.35rem)] min-h-[6rem] overflow-hidden md:h-[7.1rem]">
          <img
            src={SHADOW_WAR_ASSETS.banner}
            alt="Shadow War"
            className="absolute inset-0 h-full w-full object-fill"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.46),rgba(0,0,0,0.04)_42%,rgba(0,0,0,0.46)),linear-gradient(180deg,rgba(0,0,0,0.28),rgba(0,0,0,0.18))]" />
          <button
            type="button"
            aria-label={selectedSessionId ? 'Back to Shadow War lobbies' : 'Back to games'}
            onClick={goBack}
            className="absolute left-1 top-[calc(env(safe-area-inset-top)_+_0.35rem)] flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-transparent bg-black/5 text-[#f0d381] drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)] transition-colors hover:bg-black/18 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {onToggleMusic && (
            <button
              type="button"
              aria-label={musicPlaying ? 'Pause Shadow War music' : 'Play Shadow War music'}
              onClick={onToggleMusic}
              className={cn(
                'absolute right-1 top-[calc(env(safe-area-inset-top)_+_0.35rem)] flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-transparent text-[#f0d381] drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)] transition-colors focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50',
                audioBlocked
                  ? 'bg-[#d7aa46]/16'
                  : 'bg-black/5 hover:bg-black/18'
              )}
            >
              {audioBlocked ? <Music className="h-5 w-5" /> : musicPlaying ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </button>
          )}
          <button
            type="button"
            aria-label="Open Shadow War instructions"
            onClick={() => setInstructionsOpen(true)}
            className="absolute right-2 top-[calc(env(safe-area-inset-top)_+_3.35rem)] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-transparent bg-black/5 text-[#f0d381] drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)] transition-colors hover:bg-black/18 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
        {audioBlocked && (
          <p className="bg-black/82 px-4 py-2 text-xs text-[#f0d381]">
            Tap the music button to start the soundtrack.
          </p>
        )}
      </header>

      {selectedHasPlayableMatch && activeSession && match ? (
        <ShadowWarMatch
          session={activeSession}
          match={match}
          playerStateRow={playerState}
          moves={moves}
          queue={queue}
          busy={busy}
          onSubmitPlacement={actions.submitPlacement}
          onSubmitSuddenWarCard={actions.submitSuddenWarCard}
          onResolveRound={actions.resolveRound}
          onRematch={actions.rematch}
          onNextChallenger={actions.nextChallenger}
          playerIdentity={identity}
        />
      ) : (
        renderLobby()
      )}

      {busy && (
        <div className="pointer-events-none fixed right-4 top-[calc(env(safe-area-inset-top)_+_5.2rem)] z-[70] inline-flex items-center gap-2 rounded-full border border-[#b9934c]/35 bg-black/82 px-3 py-2 text-xs text-[#d9c79f] shadow-[0_16px_40px_rgba(0,0,0,0.48)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#f0d381]" />
          Syncing duel
        </div>
      )}
      {error && (
        <div className="relative z-20 m-3 rounded-[0.8rem] border border-[rgba(190,52,85,0.45)] bg-[rgba(87,14,28,0.3)] p-3 text-sm text-red-100">
          {error}
        </div>
      )}
      {renderInstructionsDialog()}
      {renderIdentityDialog()}
    </div>
  )
}
