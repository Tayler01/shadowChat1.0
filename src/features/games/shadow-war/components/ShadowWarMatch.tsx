import React, { useMemo, useState } from 'react'
import { Check, Crown, Loader2, Lock, Swords } from 'lucide-react'
import { Button } from '../../../../components/ui/Button'
import { cn } from '../../../../lib/utils'
import { useAuth } from '../../../../hooks/useAuth'
import type { GameSession, GameSessionQueueEntry, ShadowWarMatch as ShadowWarMatchRow, ShadowWarMove, ShadowWarPlayerStateRow } from '../../../../lib/supabase'
import { SHADOW_WAR_LANES, validatePlacement } from '../engine/resolver'
import type { ShadowWarCard, ShadowWarLane, ShadowWarPlacementInput, ShadowWarPlayerState } from '../engine/types'
import { ShadowWarCardView } from './ShadowWarCardView'

const laneLabels: Record<ShadowWarLane, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
}

const asPlayerState = (row: ShadowWarPlayerStateRow | null): ShadowWarPlayerState | null => {
  if (!row?.state) return null
  return row.state as unknown as ShadowWarPlayerState
}

const getMoveForSlot = (moves: ShadowWarMove[], slot: 'player_one' | 'player_two', moveType: ShadowWarMove['move_type']) =>
  moves.find(move => move.player_slot === slot && move.move_type === moveType) ?? null

const getMoveCard = (move: ShadowWarMove | null, lane: ShadowWarLane) => {
  const payload = move?.payload as Record<string, ShadowWarCard | undefined> | undefined
  return payload?.[lane] ?? null
}

const getSuddenWarCard = (move: ShadowWarMove | null) => {
  const payload = move?.payload as { card?: ShadowWarCard } | undefined
  return payload?.card ?? null
}

export function ShadowWarMatch({
  session,
  match,
  playerStateRow,
  moves,
  queue,
  busy,
  onSubmitPlacement,
  onSubmitSuddenWarCard,
  onResolveRound,
  onRematch,
  onNextChallenger,
}: {
  session: GameSession
  match: ShadowWarMatchRow
  playerStateRow: ShadowWarPlayerStateRow | null
  moves: ShadowWarMove[]
  queue: GameSessionQueueEntry[]
  busy: string | null
  onSubmitPlacement: (matchId: string, placement: ShadowWarPlacementInput) => Promise<unknown>
  onSubmitSuddenWarCard: (matchId: string, cardId: string) => Promise<unknown>
  onResolveRound: (matchId: string) => Promise<unknown>
  onRematch: (sessionId: string) => Promise<unknown>
  onNextChallenger: (sessionId: string) => Promise<unknown>
}) {
  const { user } = useAuth()
  const playerState = asPlayerState(playerStateRow)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [placement, setPlacement] = useState<Partial<ShadowWarPlacementInput>>({})
  const mySlot = playerStateRow?.player_slot
  const opponentSlot = mySlot === 'player_one' ? 'player_two' : 'player_one'
  const myMove = mySlot ? getMoveForSlot(moves, mySlot, 'placement') : null
  const opponentMove = opponentSlot ? getMoveForSlot(moves, opponentSlot, 'placement') : null
  const mySuddenWarMove = mySlot ? getMoveForSlot(moves, mySlot, 'sudden_war') : null
  const opponentSuddenWarMove = opponentSlot ? getMoveForSlot(moves, opponentSlot, 'sudden_war') : null
  const isSuddenWar = match.current_phase === 'sudden_war'
  const isLocked = isSuddenWar ? Boolean(mySuddenWarMove) : Boolean(myMove)
  const placementMoves = moves.filter(move => move.round_number === match.round_number && move.move_type === 'placement')
  const suddenWarMoves = moves.filter(move => move.round_number === match.round_number && move.move_type === 'sudden_war')
  const bothLocked = isSuddenWar ? suddenWarMoves.length >= 2 : placementMoves.length >= 2
  const canResolve = bothLocked && (match.current_phase === 'reveal' || match.current_phase === 'sudden_war') && match.status === 'active'
  const latestRound = Array.isArray(match.state?.rounds)
    ? (match.state.rounds as any[]).slice(-1)[0]
    : null
  const pendingSuddenWar = match.state?.pendingSuddenWar as any | undefined
  const displayedRound = pendingSuddenWar ?? latestRound
  const hasQueuedChallenger = queue.some(entry => entry.status === 'queued')

  const availableHand = useMemo(() => {
    const used = new Set([
      ...Object.values(placement).filter(Boolean),
      ...(isSuddenWar && myMove ? SHADOW_WAR_LANES.map(lane => getMoveCard(myMove, lane)?.instanceId).filter(Boolean) : []),
    ])
    return (playerState?.hand ?? []).filter(card => !used.has(card.instanceId))
  }, [isSuddenWar, myMove, placement, playerState?.hand])

  const placeSelectedCard = (lane: ShadowWarLane) => {
    if (!selectedCardId || isLocked || isSuddenWar) return
    setPlacement(previous => {
      const withoutSelected = Object.fromEntries(
        Object.entries(previous).filter(([, id]) => id !== selectedCardId)
      ) as Partial<ShadowWarPlacementInput>
      return { ...withoutSelected, [lane]: selectedCardId }
    })
    setSelectedCardId(null)
  }

  const placedCard = (lane: ShadowWarLane) => {
    const cardId = placement[lane]
    return playerState?.hand.find(card => card.instanceId === cardId) ?? null
  }

  const validation = playerState ? validatePlacement(playerState.hand, placement) : { valid: false, message: 'Hand unavailable.' }
  const submitting = busy === 'submitPlacement'

  const submit = async () => {
    if (!validation.valid || !placement.left || !placement.center || !placement.right) return
    await onSubmitPlacement(match.id, placement as ShadowWarPlacementInput)
    setPlacement({})
    setSelectedCardId(null)
  }

  const submitSuddenWar = async () => {
    if (!selectedCardId || isLocked) return
    await onSubmitSuddenWarCard(match.id, selectedCardId)
    setSelectedCardId(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(215,170,70,0.1),transparent_28%),linear-gradient(180deg,rgba(13,14,16,0.98),rgba(6,7,9,0.98))]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-panel)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Round {match.round_number}</p>
          <h2 className="truncate text-lg font-semibold text-[var(--text-primary)]">Shadow War</h2>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.26)] bg-[rgba(215,170,70,0.1)] px-3 py-1.5 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">First to {match.target_score}</p>
          <p className="text-lg font-bold text-[var(--theme-accent-readable)]">{match.player_one_score} - {match.player_two_score}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-3 grid grid-cols-3 gap-2">
          {SHADOW_WAR_LANES.map(lane => (
            <div key={`enemy-${lane}`} className="min-w-0">
              <ShadowWarCardView
                card={getMoveCard(opponentMove, lane)}
                hidden={!opponentMove?.revealed_at}
                compact
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {SHADOW_WAR_LANES.map(lane => {
            const laneResult = displayedRound?.laneResults?.find((result: any) => result.lane === lane)
            const winner = laneResult?.winner
            return (
              <button
                key={lane}
                type="button"
                onClick={() => placeSelectedCard(lane)}
                className={cn(
                  'min-h-40 rounded-[var(--radius-md)] border bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-2 text-left transition-colors',
                  selectedCardId && !isLocked && !isSuddenWar ? 'border-[rgba(239,202,114,0.54)]' : 'border-[rgba(255,255,255,0.1)]'
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">{laneLabels[lane]}</span>
                  {winner && (
                    <span className="rounded-full bg-[rgba(215,170,70,0.12)] px-1.5 py-0.5 text-[9px] uppercase text-[var(--theme-accent-readable)]">
                      {winner === 'contested' ? 'Tie' : winner === mySlot ? 'Won' : 'Lost'}
                    </span>
                  )}
                </div>
                <ShadowWarCardView
                  card={myMove ? getMoveCard(myMove, lane) : placedCard(lane)}
                  hidden={false}
                  compact
                />
              </button>
            )
          })}
        </div>

        <div className="mt-4 rounded-[var(--radius-md)] border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.22)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Swords className="h-4 w-4 text-[var(--theme-accent-readable)]" />
              Warband hand
            </div>
            {isLocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(215,170,70,0.12)] px-2 py-1 text-xs text-[var(--theme-accent-readable)]">
                <Lock className="h-3 w-3" />
                Locked
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {isSuddenWar && (
              <div className="col-span-5 mb-1 rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.24)] bg-[rgba(215,170,70,0.08)] p-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-accent-readable)]">
                  Sudden war
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  The lanes tied. Lock one unplayed reserve card; higher strength takes the round.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <ShadowWarCardView card={getSuddenWarCard(mySuddenWarMove)} compact hidden={false} />
                  <ShadowWarCardView card={getSuddenWarCard(opponentSuddenWarMove)} compact hidden={!opponentSuddenWarMove?.revealed_at} />
                </div>
              </div>
            )}
            {(isLocked ? [] : availableHand).map(card => (
              <ShadowWarCardView
                key={card.instanceId}
                card={card}
                compact
                selected={selectedCardId === card.instanceId}
                onClick={() => setSelectedCardId(card.instanceId)}
              />
            ))}
            {!playerState && (
              <div className="col-span-5 py-6 text-center text-sm text-[var(--text-muted)]">
                Loading your hand...
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border-panel)] bg-[var(--theme-composer-bg)] p-3 pb-[calc(env(safe-area-inset-bottom)_+_0.75rem)] md:pb-3">
        {match.status === 'completed' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {session.winner_id === user?.id ? 'Victory held' : 'Duel complete'}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {hasQueuedChallenger
                  ? 'Winner is recorded. A queued challenger is waiting.'
                  : 'Winner is recorded. Run it back or wait for the next challenger.'}
              </p>
            </div>
            <Crown className="h-6 w-6 text-[var(--theme-accent-readable)]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onRematch(session.id)}
                loading={busy === 'rematch'}
                disabled={hasQueuedChallenger}
              >
                Rematch
              </Button>
              <Button
                type="button"
                onClick={() => onNextChallenger(session.id)}
                disabled={session.winner_id !== user?.id || !hasQueuedChallenger}
                loading={busy === 'nextChallenger'}
              >
                Next
              </Button>
            </div>
          </div>
        ) : canResolve ? (
          <Button type="button" className="w-full" onClick={() => onResolveRound(match.id)} loading={busy === 'resolveRound'}>
            <Check className="mr-2 h-4 w-4" />
            {isSuddenWar ? 'Reveal Sudden War' : 'Reveal Round'}
          </Button>
        ) : isLocked ? (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--theme-accent-readable)]" />
            Waiting for opponent...
          </div>
        ) : (
          isSuddenWar ? (
            <Button
              type="button"
              className="w-full"
              disabled={!selectedCardId || submitting}
              loading={busy === 'submitSuddenWarCard'}
              onClick={() => void submitSuddenWar()}
            >
              <Lock className="mr-2 h-4 w-4" />
              Lock Sudden War Card
            </Button>
          ) : (
            <Button type="button" className="w-full" disabled={!validation.valid || submitting} loading={submitting} onClick={() => void submit()}>
              <Lock className="mr-2 h-4 w-4" />
              Lock Formation
            </Button>
          )
        )}
        {!validation.valid && !isLocked && !isSuddenWar && (
          <p className="mt-2 text-center text-xs text-[var(--text-muted)]">{validation.message}</p>
        )}
      </div>
    </div>
  )
}
