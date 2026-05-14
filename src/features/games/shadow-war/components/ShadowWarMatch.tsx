import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Crown, Flag, Loader2, Lock, X } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import { useAuth } from '../../../../hooks/useAuth'
import type { GameSession, GameSessionQueueEntry, ShadowWarMatch as ShadowWarMatchRow, ShadowWarMove, ShadowWarPlayerStateRow } from '../../../../lib/supabase'
import { SHADOW_WAR_LANES, validatePlacement } from '../engine/resolver'
import type { ShadowWarCard, ShadowWarLane, ShadowWarPlacementInput, ShadowWarPlayerState, ShadowWarRoundHistoryEntry } from '../engine/types'
import { ShadowWarCardView } from './ShadowWarCardView'
import { getShadowWarAvatar, getShadowWarFaction, type ShadowWarIdentity } from '../identity'
import { ShadowWarBattleCinematic } from './ShadowWarBattleCinematic'
import { getShadowWarCardTip, getShadowWarCardWeakness } from '../engine/cardGuide'

const laneLabels: Record<ShadowWarLane, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
}

const laneStyles: Record<ShadowWarLane, string> = {
  left: 'border-[#4f8dba]/45 bg-[linear-gradient(180deg,rgba(18,43,63,0.66),rgba(5,7,9,0.78))]',
  center: 'border-[#d7aa46]/45 bg-[linear-gradient(180deg,rgba(72,53,19,0.58),rgba(5,7,9,0.78))]',
  right: 'border-[#a54a38]/48 bg-[linear-gradient(180deg,rgba(78,22,17,0.58),rgba(5,7,9,0.78))]',
}

const laneTextStyles: Record<ShadowWarLane, string> = {
  left: 'text-[#9fd3ff]',
  center: 'text-[#f1d58d]',
  right: 'text-[#f18468]',
}

function GameButton({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-12 items-center justify-center rounded-[0.65rem] border px-4 py-2 text-sm font-semibold transition-[border-color,background,box-shadow,color,opacity,transform] duration-200 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'border-[#f0d381]/70 bg-[linear-gradient(180deg,#e3bd61,#7c5821)] text-[#140d07] shadow-[0_18px_42px_rgba(215,170,70,0.3)] hover:-translate-y-0.5',
        variant === 'secondary' && 'border-[#b9934c]/42 bg-black/55 text-[#f1d58d] hover:border-[#f0d381]/60 hover:bg-[#2b2114]/78',
        variant === 'ghost' && 'border-transparent bg-transparent text-[#d9c79f] hover:border-[#b9934c]/35 hover:bg-white/5',
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

function playerName(session: GameSession, slot: 'player_one' | 'player_two') {
  const player = slot === 'player_one' ? session.player_one : session.player_two
  return player?.display_name || player?.username || (slot === 'player_one' ? 'Iron Vanguard' : 'Ravenblade')
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
  playerIdentity,
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
  playerIdentity?: ShadowWarIdentity
}) {
  const { user } = useAuth()
  const playerState = asPlayerState(playerStateRow)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [placement, setPlacement] = useState<Partial<ShadowWarPlacementInput>>({})
  const [cinematicRound, setCinematicRound] = useState<ShadowWarRoundHistoryEntry | null>(null)
  const [detailCard, setDetailCard] = useState<ShadowWarCard | null>(null)
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
    ? ((match.state.rounds as ShadowWarRoundHistoryEntry[]).slice(-1)[0] ?? null)
    : null
  const roundsCount = Array.isArray(match.state?.rounds) ? (match.state.rounds as unknown[]).length : 0
  const latestRoundKey = latestRound
    ? `${match.id}:${roundsCount}:${latestRound.roundNumber}:${latestRound.resolvedAt ?? latestRound.roundWinner ?? 'resolved'}`
    : null
  const pendingSuddenWar = match.state?.pendingSuddenWar as any | undefined
  const displayedRound = pendingSuddenWar ?? latestRound
  const hasQueuedChallenger = queue.some(entry => entry.status === 'queued')
  const myScore = mySlot === 'player_two' ? match.player_two_score : match.player_one_score
  const opponentScore = mySlot === 'player_two' ? match.player_one_score : match.player_two_score
  const opponentName = playerName(session, opponentSlot)
  const myAvatar = getShadowWarAvatar(playerIdentity?.avatarId)
  const myFaction = getShadowWarFaction(playerIdentity?.factionId)
  const opponentAvatar = getShadowWarAvatar(opponentSlot === 'player_one' ? 'field-captain' : 'night-spy')
  const opponentFaction = getShadowWarFaction(opponentSlot === 'player_one' ? 'storm-guard' : 'blood-oath')
  const autoResolveKey = `${match.id}:${match.round_number}:${match.current_phase}:${moves.length}`
  const autoResolveRef = useRef<string | null>(null)
  const clashSoundRef = useRef<string | null>(null)
  const cinematicRef = useRef<string | null>(null)

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

  useEffect(() => {
    if (!canResolve || busy === 'resolveRound' || autoResolveRef.current === autoResolveKey) return
    autoResolveRef.current = autoResolveKey
    const timeout = window.setTimeout(() => {
      void onResolveRound(match.id).catch(() => {
        autoResolveRef.current = null
      })
    }, 520)
    return () => window.clearTimeout(timeout)
  }, [autoResolveKey, busy, canResolve, match.id, onResolveRound])

  useEffect(() => {
    if (!displayedRound) return
    const soundKey = `${match.id}:${match.round_number}:${displayedRound.roundWinner ?? 'pending'}`
    if (clashSoundRef.current === soundKey) return
    clashSoundRef.current = soundKey

    try {
      const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextConstructor) return
      const context = new AudioContextConstructor()
      const gain = context.createGain()
      gain.gain.setValueAtTime(0.0001, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.34)
      gain.connect(context.destination)

      const first = context.createOscillator()
      first.type = 'triangle'
      first.frequency.setValueAtTime(132, context.currentTime)
      first.frequency.exponentialRampToValueAtTime(72, context.currentTime + 0.28)
      first.connect(gain)
      first.start()
      first.stop(context.currentTime + 0.36)

      const second = context.createOscillator()
      second.type = 'square'
      second.frequency.setValueAtTime(220, context.currentTime + 0.06)
      second.frequency.exponentialRampToValueAtTime(98, context.currentTime + 0.22)
      second.connect(gain)
      second.start(context.currentTime + 0.06)
      second.stop(context.currentTime + 0.28)

      window.setTimeout(() => void context.close().catch(() => {}), 520)
    } catch {
      // Browser audio policies can still block synthesized feedback; gameplay should continue.
    }
  }, [displayedRound, match.id, match.round_number])

  useEffect(() => {
    if (!latestRound || !latestRoundKey) return

    if (cinematicRef.current === latestRoundKey) return
    cinematicRef.current = latestRoundKey

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    setCinematicRound(latestRound)
    const timeout = window.setTimeout(() => {
      setCinematicRound(currentRound => currentRound === latestRound ? null : currentRound)
    }, 5900)

    return () => window.clearTimeout(timeout)
  }, [latestRound, latestRoundKey])

  const statusLabel = match.status === 'completed'
    ? 'Duel complete'
    : isSuddenWar
      ? 'Sudden war'
      : canResolve
        ? 'Battle resolving'
          : isLocked
            ? 'Waiting for opponent'
            : 'Choose your formation'

  const renderCardDetailDialog = () => {
    if (!detailCard) return null

    return (
      <div
        className="fixed inset-0 z-[94] flex items-end justify-center bg-black/76 px-3 pb-[calc(env(safe-area-inset-bottom)_+_0.85rem)] pt-[calc(env(safe-area-inset-top)_+_0.85rem)] backdrop-blur-sm sm:items-center"
        role="presentation"
        onMouseDown={() => setDetailCard(null)}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="shadow-war-card-detail-title"
          className="max-h-full w-full max-w-lg overflow-y-auto rounded-[1.1rem] border border-[#d7aa46]/35 bg-[linear-gradient(180deg,rgba(24,20,14,0.98),rgba(5,6,7,0.98))] p-4 text-[#f6e0a2] shadow-[0_26px_90px_rgba(0,0,0,0.72)]"
          onMouseDown={event => event.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b9a16f]">Card intel</p>
              <h2 id="shadow-war-card-detail-title" className="mt-1 text-2xl font-semibold text-[#f6e0a2]">
                {detailCard.name}
              </h2>
              <p className="mt-1 text-sm text-[#b9a16f]">Strength {detailCard.rank} · {detailCard.archetype}</p>
            </div>
            <button
              type="button"
              aria-label="Close card details"
              onClick={() => setDetailCard(null)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-transparent bg-black/10 text-[#f0d381] transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <div className="mx-auto w-full max-w-[12rem]">
              <ShadowWarCardView card={detailCard} />
            </div>
            <div className="space-y-3 text-sm leading-6 text-[#d9c79f]">
              <div className="rounded-[0.8rem] border border-[#b9934c]/24 bg-black/38 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f0d381]">Special power</p>
                <p className="mt-1">{detailCard.description}</p>
              </div>
              <div className="rounded-[0.8rem] border border-[#b9934c]/24 bg-black/38 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f0d381]">Weakness</p>
                <p className="mt-1">{getShadowWarCardWeakness(detailCard.cardId)}</p>
              </div>
              <div className="rounded-[0.8rem] border border-[#b9934c]/24 bg-black/38 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f0d381]">Tip</p>
                <p className="mt-1">{getShadowWarCardTip(detailCard.cardId)}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
      {cinematicRound && (
        <ShadowWarBattleCinematic
          round={cinematicRound}
          mySlot={mySlot}
        />
      )}
      {renderCardDetailDialog()}
      <p className="sr-only" aria-live="polite">{statusLabel}</p>
      <section className="shrink-0 border-b border-[#b9934c]/35 bg-black/58 px-3 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d7aa46]/45 bg-black/60 text-[#f0d381] shadow-[0_0_28px_rgba(215,170,70,0.18)]">
              <img src={myAvatar.imageUrl} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#f6e0a2]">You</p>
              <p className="truncate text-xs text-[#b9a16f]">{myFaction.name}</p>
            </div>
          </div>

          <div className="rounded-[0.75rem] border border-[#d7aa46]/40 bg-black/72 px-4 py-2 text-center shadow-[0_12px_35px_rgba(0,0,0,0.46)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b9a16f]">Round {match.round_number}</p>
            <p className="text-2xl font-bold leading-none text-[#f0d381]">
              <span className="text-[#8fc7ff]">{myScore}</span>
              <span className="px-2 text-[#d9c79f]">-</span>
              <span className="text-[#f18468]">{opponentScore}</span>
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[#d9c79f]">First to {match.target_score}</p>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2 text-right">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#f6e0a2]">{opponentName}</p>
              <p className="truncate text-xs text-[#b9a16f]">{opponentFaction.name}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#8f2f26]/55 bg-black/60 text-[#f18468] shadow-[0_0_28px_rgba(165,74,56,0.18)]">
              <img src={opponentAvatar.imageUrl} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" />
            </div>
          </div>
        </div>
      </section>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 md:px-4 md:py-3">
        <div className="mx-auto grid max-w-6xl grid-cols-3 gap-1.5 sm:gap-2 md:gap-4">
          {SHADOW_WAR_LANES.map(lane => {
            const laneResult = displayedRound?.laneResults?.find((result: any) => result.lane === lane)
            const winner = laneResult?.winner
            return (
              <button
                key={lane}
                type="button"
                data-testid="shadow-war-lane"
                data-shadow-war-lane={lane}
                onClick={() => placeSelectedCard(lane)}
                disabled={!selectedCardId || isLocked || isSuddenWar}
                className={cn(
                  'relative flex min-h-[18.5rem] flex-col overflow-hidden rounded-[0.8rem] border p-1.5 text-left shadow-[inset_0_0_28px_rgba(0,0,0,0.45),0_18px_40px_rgba(0,0,0,0.35)] transition-[border-color,box-shadow,transform] duration-200 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/50 disabled:cursor-default sm:min-h-[21rem] sm:p-2 md:min-h-[30rem] md:p-3',
                  laneStyles[lane],
                  winner && 'after:pointer-events-none after:absolute after:inset-x-2 after:top-1/2 after:h-px after:origin-center after:animate-[shadow-war-clash_900ms_ease-out_1] after:bg-gradient-to-r after:from-transparent after:via-[#f0d381] after:to-transparent after:shadow-[0_0_28px_rgba(240,211,129,0.7)]',
                  winner === mySlot && 'ring-1 ring-[#f0d381]/34',
                  winner && winner !== mySlot && winner !== 'contested' && 'opacity-88',
                  selectedCardId && !isLocked && !isSuddenWar && 'border-[#f0d381]/75 shadow-[0_0_0_1px_rgba(240,211,129,0.28),0_18px_45px_rgba(215,170,70,0.12)]'
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-1">
                  <span className={cn('font-serif text-base font-semibold md:text-xl', laneTextStyles[lane])}>
                    {laneLabels[lane]}
                  </span>
                  {winner && (
                    <span className="rounded-full border border-[#d7aa46]/30 bg-black/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-[#f0d381]">
                      {winner === 'contested' ? 'Tie' : winner === mySlot ? 'Won' : 'Lost'}
                    </span>
                  )}
                </div>

                <div className="mx-auto w-full max-w-[5.8rem] sm:max-w-[6.4rem] md:max-w-[8.2rem]">
                  <ShadowWarCardView
                    card={getMoveCard(opponentMove, lane)}
                    hidden={!opponentMove?.revealed_at}
                    compact
                  />
                </div>

                <div className="my-3 flex flex-1 items-center justify-center">
                  <span className="h-px w-full bg-gradient-to-r from-transparent via-[#d7aa46]/40 to-transparent" />
                  <span className="mx-2 h-3 w-3 rotate-45 border border-[#d7aa46]/45 bg-black" />
                  <span className="h-px w-full bg-gradient-to-r from-transparent via-[#d7aa46]/40 to-transparent" />
                </div>

                <div className="mx-auto w-full max-w-[5.8rem] sm:max-w-[6.4rem] md:max-w-[8.2rem]">
                  <ShadowWarCardView
                    card={myMove ? getMoveCard(myMove, lane) : placedCard(lane)}
                    hidden={false}
                    compact
                  />
                </div>
              </button>
            )
          })}
        </div>

        <section
          data-testid="shadow-war-hand"
          className="mx-auto mt-3 max-w-6xl rounded-[0.95rem] border border-[#b9934c]/30 bg-black/64 p-2 shadow-[0_18px_45px_rgba(0,0,0,0.38)] backdrop-blur-sm md:p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#f6e0a2]">
              <Flag className="h-4 w-4 text-[#f0d381]" />
              Warband hand
            </div>
            {isLocked && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#d7aa46]/30 bg-[#d7aa46]/10 px-2 py-1 text-xs text-[#f0d381]">
                <Lock className="h-3 w-3" />
                Locked
              </span>
            )}
          </div>

          {isSuddenWar && (
            <div className="mb-2 rounded-[0.75rem] border border-[#d7aa46]/30 bg-[#d7aa46]/10 p-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f0d381]">
                Sudden war
              </p>
              <p className="mt-1 text-xs text-[#d9c79f]">
                The lanes tied. Lock one reserve card; higher strength takes the round.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="mx-auto w-full max-w-[5.8rem]">
                  <ShadowWarCardView card={getSuddenWarCard(mySuddenWarMove)} compact hidden={false} />
                </div>
                <div className="mx-auto w-full max-w-[5.8rem]">
                  <ShadowWarCardView card={getSuddenWarCard(opponentSuddenWarMove)} compact hidden={!opponentSuddenWarMove?.revealed_at} />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-5 gap-1.5 md:gap-2">
            {(isLocked ? [] : availableHand).map(card => (
              <ShadowWarCardView
                key={card.instanceId}
                card={card}
                compact
                selected={selectedCardId === card.instanceId}
                onClick={() => setSelectedCardId(card.instanceId)}
                onLongPress={() => setDetailCard(card)}
              />
            ))}
            {!playerState && (
              <div className="col-span-5 py-6 text-center text-sm text-[#b9a16f]">
                Loading your hand...
              </div>
            )}
            {playerState && isLocked && (
              <div className="col-span-5 py-4 text-center text-sm text-[#b9a16f]">
                Formation locked. Waiting for the reveal window.
              </div>
            )}
            {playerState && !isLocked && availableHand.length === 0 && (
              <div className="col-span-5 py-4 text-center text-sm text-[#b9a16f]">
                No reserve cards available.
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="shrink-0 border-t border-[#b9934c]/35 bg-black/84 p-3 pb-[calc(env(safe-area-inset-bottom)_+_0.75rem)] shadow-[0_-18px_42px_rgba(0,0,0,0.56)] backdrop-blur-md md:pb-3">
        {match.status === 'completed' ? (
          <div className="mx-auto max-w-6xl space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#f6e0a2]">
                  {session.winner_id === user?.id ? 'Victory held' : 'Duel complete'}
                </p>
                <p className="text-xs text-[#b9a16f]">
                  {hasQueuedChallenger
                    ? 'Winner is recorded. A queued challenger is waiting.'
                    : 'Winner is recorded. Run it back or wait for the next challenger.'}
                </p>
              </div>
              <Crown className="h-6 w-6 text-[#f0d381]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <GameButton
                variant="secondary"
                onClick={() => onRematch(session.id)}
                loading={busy === 'rematch'}
                disabled={hasQueuedChallenger}
              >
                Rematch
              </GameButton>
              <GameButton
                onClick={() => onNextChallenger(session.id)}
                disabled={session.winner_id !== user?.id || !hasQueuedChallenger}
                loading={busy === 'nextChallenger'}
              >
                Next
              </GameButton>
            </div>
          </div>
        ) : canResolve ? (
          <div className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-[#f0d381]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Battle resolving...
          </div>
        ) : isLocked ? (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-[#d9c79f]">
            <Loader2 className="h-4 w-4 animate-spin text-[#f0d381]" />
            Waiting for opponent...
          </div>
        ) : (
          isSuddenWar ? (
            <div className="mx-auto w-full max-w-6xl">
              <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d381]">
                Sudden war
              </p>
              <GameButton
                data-testid="shadow-war-lock"
                className="flex w-full"
                disabled={!selectedCardId || submitting}
                loading={busy === 'submitSuddenWarCard'}
                onClick={() => void submitSuddenWar()}
              >
                <Lock className="mr-2 h-4 w-4" />
                Battle Reserve
              </GameButton>
            </div>
          ) : (
            <GameButton
              data-testid="shadow-war-lock"
              className="mx-auto flex w-full max-w-6xl"
              disabled={!validation.valid || submitting}
              loading={submitting}
              onClick={() => void submit()}
            >
              <Lock className="mr-2 h-4 w-4" />
              Battle
            </GameButton>
          )
        )}
        {!validation.valid && !isLocked && !isSuddenWar && (
          <p className="mt-2 text-center text-xs text-[#b9a16f]">{validation.message}</p>
        )}
      </footer>
    </div>
  )
}
