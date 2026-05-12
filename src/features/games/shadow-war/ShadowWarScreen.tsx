import React from 'react'
import { ArrowLeft, ChevronRight, Loader2, Music, Plus, Shield, Swords, Users, Volume2, VolumeX } from 'lucide-react'
import toast from 'react-hot-toast'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { useAuth } from '../../../hooks/useAuth'
import { cn } from '../../../lib/utils'
import type { GameSession } from '../../../lib/supabase'
import { useShadowWar } from './hooks/useShadowWar'
import { ShadowWarMatch } from './components/ShadowWarMatch'
import { SHADOW_WAR_ASSETS } from './assets/manifest'

interface ShadowWarScreenProps {
  onExit?: () => void
  musicPlaying?: boolean
  audioBlocked?: boolean
  onToggleMusic?: () => void
}

type WarButtonVariant = 'primary' | 'secondary' | 'ghost'

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

function isUserInSession(session: GameSession, userId?: string | null) {
  return Boolean(userId && (session.player_one_id === userId || session.player_two_id === userId))
}

export function ShadowWarScreen({
  onExit,
  musicPlaying = false,
  audioBlocked = false,
  onToggleMusic,
}: ShadowWarScreenProps) {
  const { user } = useAuth()
  const {
    sessions,
    selectedSessionId,
    activeSession,
    match,
    playerState,
    queue,
    moves,
    loading,
    busy,
    error,
    actions,
  } = useShadowWar()

  const selectedIsPlayer = Boolean(activeSession && isUserInSession(activeSession, user?.id))
  const selectedHasPlayableMatch = Boolean(activeSession && match && selectedIsPlayer)
  const isQueuedForSelected = Boolean(queue.some(entry => entry.user_id === user?.id && entry.status === 'queued'))
  const myOpenSession = sessions.find(session => isUserInSession(session, user?.id) && session.status !== 'completed') ?? null

  const guarded = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      toast.success(success)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Game action failed')
    }
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
    const sessionIsQueued = activeSession?.id === session.id
      ? isQueuedForSelected
      : false
    const canJoin = session.status === 'waiting' && !isPlayer
    const canQueue = session.status === 'active' && !isPlayer && !sessionIsQueued

    return (
      <div className="mt-4 grid grid-cols-2 gap-2">
        {isPlayer && session.current_match_id && session.status !== 'completed' ? (
          <WarButton className="col-span-2" onClick={() => actions.selectSession(session.id)}>
            <Swords className="mr-2 h-4 w-4" />
            Continue Duel
          </WarButton>
        ) : (
          <WarButton className="col-span-2" variant="secondary" onClick={() => actions.selectSession(session.id)}>
            Inspect Duel
            <ChevronRight className="ml-2 h-4 w-4" />
          </WarButton>
        )}

        {canJoin && (
          <WarButton loading={busy === 'join'} onClick={() => void guarded(() => actions.join(session.id), 'Joined duel')}>
            <Users className="mr-2 h-4 w-4" />
            Join Duel
          </WarButton>
        )}
        {canQueue && (
          <WarButton variant="secondary" loading={busy === 'queue'} onClick={() => void guarded(() => actions.queue(session.id), 'Joined queue')}>
            <Shield className="mr-2 h-4 w-4" />
            Queue
          </WarButton>
        )}
        {sessionIsQueued && (
          <WarButton variant="ghost" loading={busy === 'leaveQueue'} onClick={() => void guarded(() => actions.leaveQueue(session.id), 'Left queue')}>
            Leave Queue
          </WarButton>
        )}
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
            Create a fresh duel, join an open seat, or inspect an active table before queueing. Shadow War no longer drops you into a match until you choose one.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <WarButton loading={busy === 'create'} onClick={() => void guarded(actions.create, 'Duel created')}>
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
        <section className="space-y-3">
          {sessions.length === 0 && (
            <div className="rounded-[1rem] border border-[#b9934c]/25 bg-black/50 p-5 text-center text-sm text-[#b9a16f]">
              No duels yet. Create the first table.
            </div>
          )}
          {sessions.map(session => (
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
              {renderSessionActions(session)}
            </article>
          ))}
        </section>
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
            className="absolute left-3 top-[calc(env(safe-area-inset-top)_+_0.8rem)] flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.65rem] border border-[#b9934c]/45 bg-black/64 text-[#f0d381] shadow-[0_12px_28px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-colors hover:bg-[#d7aa46]/10 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {onToggleMusic && (
            <button
              type="button"
              aria-label={musicPlaying ? 'Pause Shadow War music' : 'Play Shadow War music'}
              onClick={onToggleMusic}
              className={cn(
                'absolute right-3 top-[calc(env(safe-area-inset-top)_+_0.8rem)] flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.65rem] border text-[#f0d381] shadow-[0_12px_28px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50',
                audioBlocked
                  ? 'border-[#f0d381]/55 bg-[#d7aa46]/20'
                  : 'border-[#b9934c]/45 bg-black/64 hover:bg-[#d7aa46]/10'
              )}
            >
              {audioBlocked ? <Music className="h-5 w-5" /> : musicPlaying ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </button>
          )}
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
    </div>
  )
}
