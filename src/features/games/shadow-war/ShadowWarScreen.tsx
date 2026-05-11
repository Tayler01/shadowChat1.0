import React from 'react'
import { Gamepad2, Loader2, Plus, Shield, Swords, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../../../components/ui/Button'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { useAuth } from '../../../hooks/useAuth'
import { cn } from '../../../lib/utils'
import type { GameSession } from '../../../lib/supabase'
import { useShadowWar } from './hooks/useShadowWar'
import { ShadowWarMatch } from './components/ShadowWarMatch'
import { SHADOW_WAR_ASSETS } from './assets/manifest'

function sessionTitle(session: GameSession) {
  if (session.status === 'waiting') return 'Waiting for challenger'
  if (session.status === 'active') return 'Duel in progress'
  return 'Completed duel'
}

export function ShadowWarScreen() {
  const { user } = useAuth()
  const {
    sessions,
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

  const isPlayer = Boolean(
    user?.id &&
    activeSession &&
    (activeSession.player_one_id === user.id || activeSession.player_two_id === user.id)
  )
  const isQueued = Boolean(queue.some(entry => entry.user_id === user?.id && entry.status === 'queued'))

  const guarded = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      toast.success(success)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Game action failed')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!match && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <section className="relative isolate mb-4 overflow-hidden rounded-[var(--radius-lg)] border border-[rgba(215,170,70,0.24)] bg-[radial-gradient(circle_at_18%_0%,rgba(215,170,70,0.18),transparent_34%),linear-gradient(180deg,rgba(24,20,18,0.94),rgba(9,10,12,0.98))] p-4 shadow-[var(--shadow-panel-strong)] md:p-6">
            <div className="pointer-events-none absolute inset-0 -z-10 opacity-45 [background-image:linear-gradient(120deg,rgba(255,255,255,0.08)_0,transparent_28%),radial-gradient(circle_at_82%_18%,rgba(130,36,30,0.28),transparent_26%)]" />
            <img
              src={SHADOW_WAR_ASSETS.assetSheet}
              alt=""
              className="pointer-events-none absolute right-0 top-0 -z-10 hidden h-full w-1/2 object-cover opacity-28 mix-blend-screen md:block"
              loading="lazy"
            />
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[rgba(215,170,70,0.28)] bg-[rgba(215,170,70,0.1)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent-readable)]">
              <Swords className="h-3.5 w-3.5" />
              1v1 tactical duel
            </div>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)] md:text-3xl">Shadow War</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Place medieval units into three hidden lanes, lock your formation, then reveal the clash.
              Low ranks carry tricks, high ranks carry risk, and best two lanes wins the round.
            </p>
            <Button
              type="button"
              size="lg"
              className="mt-5 w-full md:w-auto"
              loading={busy === 'create'}
              onClick={() => void guarded(actions.create, 'Duel created')}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Duel
            </Button>
          </section>

          {loading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner size="lg" className="text-[var(--theme-accent-readable)]" />
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.length === 0 && (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[var(--bg-panel)] p-5 text-center text-sm text-[var(--text-muted)]">
                  No duels yet. Create the first table.
                </div>
              )}
              {sessions.map(session => {
                const canJoin = session.status === 'waiting' && session.player_one_id !== user?.id
                const canQueue = session.status === 'active' && !isPlayer && !isQueued
                return (
                  <article
                    key={session.id}
                    className={cn(
                      'rounded-[var(--radius-lg)] border p-4 shadow-[var(--shadow-panel)]',
                      activeSession?.id === session.id
                        ? 'border-[rgba(215,170,70,0.36)] bg-[rgba(215,170,70,0.08)]'
                        : 'border-[var(--border-panel)] bg-[var(--bg-panel)]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{sessionTitle(session)}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {session.player_one?.display_name || 'Player one'} vs {session.player_two?.display_name || 'open seat'}
                        </p>
                      </div>
                      <span className="rounded-full border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] px-2.5 py-1 text-xs text-[var(--theme-accent-readable)]">
                        {session.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canJoin && (
                        <Button type="button" size="sm" loading={busy === 'join'} onClick={() => void guarded(() => actions.join(session.id), 'Joined duel')}>
                          <Users className="mr-2 h-4 w-4" />
                          Join
                        </Button>
                      )}
                      {canQueue && (
                        <Button type="button" size="sm" variant="secondary" loading={busy === 'queue'} onClick={() => void guarded(() => actions.queue(session.id), 'Joined queue')}>
                          <Shield className="mr-2 h-4 w-4" />
                          Queue
                        </Button>
                      )}
                      <Button type="button" size="sm" variant="ghost" onClick={() => actions.selectSession(session.id)}>
                        View
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}

      {match && activeSession && (
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
      )}

      {activeSession && queue.length > 0 && (
        <div className="shrink-0 border-t border-[var(--border-panel)] bg-[rgba(0,0,0,0.24)] px-4 py-2 text-xs text-[var(--text-muted)]">
          <div className="flex items-center justify-between gap-2">
            <span>{queue.length} queued challenger{queue.length === 1 ? '' : 's'}</span>
            {isQueued && (
              <button
                type="button"
                className="text-[var(--theme-accent-readable)]"
                onClick={() => void guarded(() => actions.leaveQueue(activeSession.id), 'Left queue')}
              >
                Leave queue
              </button>
            )}
          </div>
        </div>
      )}

      {busy && (
        <div className="pointer-events-none fixed right-4 top-[var(--shadowchat-toast-top,4.5rem)] z-[70] inline-flex items-center gap-2 rounded-full border border-[var(--border-panel)] bg-[var(--bg-panel-strong)] px-3 py-2 text-xs text-[var(--text-secondary)] shadow-[var(--shadow-panel)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--theme-accent-readable)]" />
          Syncing duel
        </div>
      )}
      {error && (
        <div className="m-3 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-3 text-sm text-red-100">
          {error}
        </div>
      )}
    </div>
  )
}
