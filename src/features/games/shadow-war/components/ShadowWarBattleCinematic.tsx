import React from 'react'
import { Shield, Sparkles, Swords } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import { SHADOW_WAR_LANES } from '../engine/resolver'
import type {
  ShadowWarLane,
  ShadowWarLaneResult,
  ShadowWarPlayerSlot,
  ShadowWarRoundHistoryEntry,
} from '../engine/types'
import { ShadowWarCardView } from './ShadowWarCardView'

const laneLabels: Record<ShadowWarLane, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
}

const laneAccents: Record<ShadowWarLane, string> = {
  left: 'from-[#4f8dba]/58 via-[#f0d381]/32 to-transparent',
  center: 'from-[#d7aa46]/64 via-[#f0d381]/38 to-transparent',
  right: 'from-[#a54a38]/58 via-[#f0d381]/32 to-transparent',
}

const sparkPositions = [
  'left-[9%] top-[18%]',
  'left-[18%] top-[66%]',
  'left-[30%] top-[42%]',
  'left-[43%] top-[20%]',
  'left-[54%] top-[74%]',
  'left-[64%] top-[36%]',
  'left-[76%] top-[58%]',
  'left-[88%] top-[24%]',
]

type EffectTone = 'buff' | 'debuff' | 'guard' | 'ability'

function slotCard(result: ShadowWarLaneResult, slot: ShadowWarPlayerSlot) {
  return slot === 'player_one' ? result.playerOneCard : result.playerTwoCard
}

function slotStrength(result: ShadowWarLaneResult, slot: ShadowWarPlayerSlot) {
  return slot === 'player_one' ? result.playerOneStrength : result.playerTwoStrength
}

function signedDelta(value: number) {
  return value > 0 ? `+${value}` : String(value)
}

function laneOutcome(result: ShadowWarLaneResult, mySlot: ShadowWarPlayerSlot) {
  if (result.winner === 'contested') return 'Tie'
  return result.winner === mySlot ? 'Won' : 'Lost'
}

function laneOutcomeClass(result: ShadowWarLaneResult, mySlot: ShadowWarPlayerSlot) {
  if (result.winner === 'contested') return 'text-[#f0d381] border-[#d7aa46]/45 bg-[#d7aa46]/13'
  return result.winner === mySlot
    ? 'text-[#b7e6ff] border-[#4f8dba]/50 bg-[#4f8dba]/16'
    : 'text-[#ffb29f] border-[#a54a38]/50 bg-[#a54a38]/16'
}

function headline(round: ShadowWarRoundHistoryEntry, mySlot: ShadowWarPlayerSlot) {
  if (round.needsSuddenWar) return 'Sudden War'
  if (round.roundWinner === 'draw' || round.roundWinner === null) return 'Round Draw'
  return round.roundWinner === mySlot ? 'Round Won' : 'Round Lost'
}

function effectBadges(result: ShadowWarLaneResult, mySlot: ShadowWarPlayerSlot) {
  const enemySlot = mySlot === 'player_one' ? 'player_two' : 'player_one'
  const cards = [
    {
      card: slotCard(result, enemySlot),
      delta: slotStrength(result, enemySlot) - slotCard(result, enemySlot).rank,
      side: 'Enemy',
    },
    {
      card: slotCard(result, mySlot),
      delta: slotStrength(result, mySlot) - slotCard(result, mySlot).rank,
      side: 'You',
    },
  ]

  const badges: Array<{ key: string; label: string; detail: string; tone: EffectTone }> = []

  cards.forEach(({ card, delta, side }) => {
    if (delta !== 0) {
      badges.push({
        key: `${side}-${card.instanceId}-${delta}`,
        label: signedDelta(delta),
        detail: `${card.name} ${delta > 0 ? 'surges' : 'weakened'}`,
        tone: delta > 0 ? 'buff' : 'debuff',
      })
    }
  })

  const guardedSlot = result.winner === 'contested'
    ? cards.find(({ card, delta }) => card.abilityKey === 'guard' && delta === 0)
    : undefined

  if (guardedSlot) {
    badges.push({
      key: `${guardedSlot.side}-${guardedSlot.card.instanceId}-guard`,
      label: 'Guard',
      detail: 'Narrow loss denied',
      tone: 'guard',
    })
  }

  if (badges.length === 0) {
    const notes = result.notes ?? []
    const note = notes.find(nextNote => !nextNote.toLowerCase().includes('wins')) ?? notes[0]
    if (note) {
      badges.push({
        key: `${result.lane}-ability`,
        label: 'Tactic',
        detail: note,
        tone: 'ability',
      })
    }
  }

  return badges.slice(0, 2)
}

function StrengthBadge({
  value,
  delta,
  align,
}: {
  value: number
  delta: number
  align: 'left' | 'right'
}) {
  return (
    <div
      className={cn(
        'absolute top-1 z-10 flex min-w-7 flex-col items-center rounded-full border border-[#d7aa46]/45 bg-black/78 px-1.5 py-1 text-center shadow-[0_8px_18px_rgba(0,0,0,0.45)]',
        align === 'left' ? 'left-1' : 'right-1'
      )}
    >
      <span className="font-serif text-sm font-bold leading-none text-[#f6e0a2]">{value}</span>
      {delta !== 0 ? (
        <span className={cn('text-[9px] font-black leading-none', delta > 0 ? 'text-[#9fd5ff]' : 'text-[#ff9a83]')}>
          {signedDelta(delta)}
        </span>
      ) : null}
    </div>
  )
}

export function ShadowWarBattleCinematic({
  round,
  mySlot = 'player_one',
}: {
  round: ShadowWarRoundHistoryEntry
  mySlot?: ShadowWarPlayerSlot
}) {
  const enemySlot = mySlot === 'player_one' ? 'player_two' : 'player_one'

  return (
    <div
      className="shadow-war-cinematic pointer-events-none absolute inset-0 z-[55] overflow-hidden bg-black/76 backdrop-blur-[2px]"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(240,211,129,0.22),transparent_24%),linear-gradient(180deg,rgba(0,0,0,0.2),rgba(0,0,0,0.78))]" />
      <div className="shadow-war-cinematic-smoke absolute inset-x-[-20%] bottom-[-10%] h-[45%] bg-[radial-gradient(ellipse_at_center,rgba(180,163,128,0.2),transparent_64%)] opacity-70 blur-xl" />
      <div className="shadow-war-cinematic-sigil absolute left-1/2 top-[45%] h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#d7aa46]/28 shadow-[0_0_80px_rgba(215,170,70,0.3)]" />

      <div className="absolute inset-x-2 top-[7%] bottom-[18%] grid grid-cols-3 gap-1.5 sm:inset-x-6 sm:gap-3">
        {SHADOW_WAR_LANES.map((lane, index) => {
          const result = round.laneResults.find(nextResult => nextResult.lane === lane)
          if (!result) return null

          const myCard = slotCard(result, mySlot)
          const enemyCard = slotCard(result, enemySlot)
          const myStrength = slotStrength(result, mySlot)
          const enemyStrength = slotStrength(result, enemySlot)
          const myDelta = myStrength - myCard.rank
          const enemyDelta = enemyStrength - enemyCard.rank
          const effects = effectBadges(result, mySlot)
          const laneDelay = 2200 + index * 760

          return (
            <div
              key={lane}
              className="shadow-war-cinematic-lane relative min-h-0 overflow-hidden rounded-[0.75rem] border border-[#d7aa46]/26 bg-black/45 shadow-[inset_0_0_32px_rgba(0,0,0,0.68),0_18px_50px_rgba(0,0,0,0.38)]"
              style={{
                '--lane-delay': `${laneDelay}ms`,
                '--effect-delay': `${380 + index * 160}ms`,
              } as React.CSSProperties}
            >
              <div className={cn('absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b opacity-78 blur-sm', laneAccents[lane])} />
              <p className="absolute inset-x-0 top-1 z-10 text-center font-serif text-sm font-semibold text-[#f6e0a2] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)] sm:top-2 sm:text-base">
                {laneLabels[lane]}
              </p>

              <div className="shadow-war-cinematic-card shadow-war-cinematic-card-opponent absolute left-1/2 top-[11%] w-[5.2rem] max-w-[27vw] -translate-x-1/2 sm:w-24">
                <div className="relative">
                  <ShadowWarCardView card={enemyCard} compact />
                  <StrengthBadge value={enemyStrength} delta={enemyDelta} align="right" />
                </div>
              </div>

              <div className="shadow-war-cinematic-card shadow-war-cinematic-card-player absolute bottom-[7%] left-1/2 w-[5.2rem] max-w-[27vw] -translate-x-1/2 sm:w-24">
                <div className="relative">
                  <ShadowWarCardView card={myCard} compact />
                  <StrengthBadge value={myStrength} delta={myDelta} align="left" />
                </div>
              </div>

              <div className="shadow-war-cinematic-effects absolute inset-x-1 top-[42%] z-20 flex -translate-y-1/2 flex-col items-center gap-1 text-center">
                {effects.map(effect => (
                  <div
                    key={effect.key}
                    className={cn(
                      'shadow-war-cinematic-effect max-w-full rounded-full border px-2 py-1 shadow-[0_10px_22px_rgba(0,0,0,0.42)] backdrop-blur-sm',
                      effect.tone === 'buff' && 'border-[#4f8dba]/55 bg-[#4f8dba]/18 text-[#b7e6ff]',
                      effect.tone === 'debuff' && 'border-[#a54a38]/58 bg-[#a54a38]/18 text-[#ffb29f]',
                      effect.tone === 'guard' && 'border-[#d7aa46]/55 bg-[#d7aa46]/18 text-[#f6e0a2]',
                      effect.tone === 'ability' && 'border-[#d7aa46]/40 bg-black/64 text-[#f0d381]'
                    )}
                  >
                    <span className="block text-[10px] font-black leading-none sm:text-xs">{effect.label}</span>
                    <span className="block max-w-[6.4rem] truncate text-[8px] font-semibold uppercase tracking-[0.08em] opacity-90 sm:max-w-[8rem]">
                      {effect.detail}
                    </span>
                  </div>
                ))}
              </div>

              <div className="shadow-war-cinematic-ray absolute left-1/2 top-1/2 z-10 h-px w-[165%] -translate-x-1/2 -translate-y-1/2 rotate-[-17deg] bg-gradient-to-r from-transparent via-[#f0d381] to-transparent shadow-[0_0_30px_rgba(240,211,129,0.94)]" />
              <div className="shadow-war-cinematic-impact absolute left-1/2 top-1/2 z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#d7aa46]/45 bg-black/72 text-[#f0d381] shadow-[0_0_46px_rgba(215,170,70,0.46)]">
                <Swords className="h-7 w-7" />
              </div>
              <div className={cn('shadow-war-cinematic-outcome absolute inset-x-1 bottom-1 z-30 mx-auto flex max-w-[7rem] items-center justify-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] shadow-[0_10px_22px_rgba(0,0,0,0.44)]', laneOutcomeClass(result, mySlot))}>
                {result.winner === 'contested' ? <Shield className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                {laneOutcome(result, mySlot)}
              </div>
            </div>
          )
        })}
      </div>

      {sparkPositions.map((position, index) => (
        <span
          key={position}
          className={cn(
            'shadow-war-cinematic-spark absolute h-1.5 w-1.5 rounded-full bg-[#f0d381] shadow-[0_0_18px_rgba(240,211,129,0.95)]',
            position
          )}
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}

      <div className="shadow-war-cinematic-title absolute inset-x-4 bottom-[4.5%] flex flex-col items-center text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#b9a16f]">Round {round.roundNumber}</p>
        <h3 className="mt-1 font-serif text-3xl font-semibold leading-none text-[#f6e0a2] [text-shadow:0_5px_18px_rgba(0,0,0,0.95),0_0_32px_rgba(215,170,70,0.38)] sm:text-4xl">
          {headline(round, mySlot)}
        </h3>
      </div>
    </div>
  )
}
