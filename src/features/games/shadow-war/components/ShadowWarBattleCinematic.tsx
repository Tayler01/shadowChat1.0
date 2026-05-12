import React from 'react'
import { Swords } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import { SHADOW_WAR_LANES } from '../engine/resolver'
import type { ShadowWarLane, ShadowWarPlayerSlot, ShadowWarRoundHistoryEntry } from '../engine/types'

const laneLabels: Record<ShadowWarLane, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
}

const laneAccents: Record<ShadowWarLane, string> = {
  left: 'from-[#4f8dba]/55 via-[#f0d381]/35 to-transparent',
  center: 'from-[#d7aa46]/62 via-[#f0d381]/44 to-transparent',
  right: 'from-[#a54a38]/58 via-[#f0d381]/35 to-transparent',
}

const sparkPositions = [
  'left-[9%] top-[22%]',
  'left-[18%] top-[62%]',
  'left-[29%] top-[38%]',
  'left-[43%] top-[18%]',
  'left-[53%] top-[72%]',
  'left-[64%] top-[32%]',
  'left-[76%] top-[57%]',
  'left-[88%] top-[26%]',
]

function laneOutcome(round: ShadowWarRoundHistoryEntry, lane: ShadowWarLane, mySlot?: ShadowWarPlayerSlot) {
  const result = round.laneResults?.find(nextResult => nextResult.lane === lane)
  if (!result) return 'Clash'
  if (result.winner === 'contested') return 'Contested'
  return result.winner === mySlot ? 'Won' : 'Lost'
}

function headline(round: ShadowWarRoundHistoryEntry, mySlot?: ShadowWarPlayerSlot) {
  if (round.needsSuddenWar) return 'Sudden War'
  if (round.roundWinner === 'draw' || round.roundWinner === null) return 'Round Draw'
  return round.roundWinner === mySlot ? 'Round Won' : 'Round Lost'
}

export function ShadowWarBattleCinematic({
  round,
  mySlot,
}: {
  round: ShadowWarRoundHistoryEntry
  mySlot?: ShadowWarPlayerSlot
}) {
  return (
    <div
      className="shadow-war-cinematic pointer-events-none absolute inset-0 z-[55] overflow-hidden bg-black/70 backdrop-blur-[2px]"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(240,211,129,0.26),transparent_21%),linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.72))]" />
      <div className="shadow-war-cinematic-smoke absolute inset-x-[-20%] bottom-[-12%] h-[42%] bg-[radial-gradient(ellipse_at_center,rgba(180,163,128,0.2),transparent_64%)] opacity-70 blur-xl" />
      <div className="shadow-war-cinematic-sigil absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#d7aa46]/30 shadow-[0_0_70px_rgba(215,170,70,0.32)]" />

      <div className="absolute inset-x-4 top-[17%] grid grid-cols-3 gap-2 sm:inset-x-10 sm:gap-4">
        {SHADOW_WAR_LANES.map(lane => (
          <div
            key={lane}
            className="shadow-war-cinematic-lane relative min-h-[46vh] overflow-hidden rounded-[0.85rem] border border-[#d7aa46]/28 bg-black/44 shadow-[inset_0_0_36px_rgba(0,0,0,0.65),0_20px_60px_rgba(0,0,0,0.38)]"
          >
            <div className={cn('absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b opacity-75 blur-sm', laneAccents[lane])} />
            <div className="shadow-war-cinematic-card shadow-war-cinematic-card-opponent absolute left-1/2 top-[18%] h-24 w-16 -translate-x-1/2 rounded-[0.45rem] border border-[#d7aa46]/40 bg-[radial-gradient(circle_at_50%_8%,rgba(215,170,70,0.24),rgba(19,20,21,0.96)_56%,rgba(4,5,6,1))] shadow-[0_16px_34px_rgba(0,0,0,0.58)] sm:h-32 sm:w-20" />
            <div className="shadow-war-cinematic-card shadow-war-cinematic-card-player absolute bottom-[18%] left-1/2 h-24 w-16 -translate-x-1/2 rounded-[0.45rem] border border-[#d7aa46]/40 bg-[radial-gradient(circle_at_50%_8%,rgba(215,170,70,0.24),rgba(19,20,21,0.96)_56%,rgba(4,5,6,1))] shadow-[0_16px_34px_rgba(0,0,0,0.58)] sm:h-32 sm:w-20" />
            <div className="shadow-war-cinematic-strike absolute left-1/2 top-1/2 h-px w-[165%] -translate-x-1/2 -translate-y-1/2 rotate-[-18deg] bg-gradient-to-r from-transparent via-[#f0d381] to-transparent shadow-[0_0_28px_rgba(240,211,129,0.9)]" />
            <div className="absolute inset-x-1 bottom-2 text-center">
              <p className="font-serif text-sm font-semibold text-[#f6e0a2] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)] sm:text-base">
                {laneLabels[lane]}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f0d381]">
                {laneOutcome(round, lane, mySlot)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {sparkPositions.map((position, index) => (
        <span
          key={position}
          className={cn(
            'shadow-war-cinematic-spark absolute h-1.5 w-1.5 rounded-full bg-[#f0d381] shadow-[0_0_18px_rgba(240,211,129,0.95)]',
            position
          )}
          style={{ animationDelay: `${index * 70}ms` }}
        />
      ))}

      <div className="shadow-war-cinematic-title absolute inset-x-4 top-[42%] flex flex-col items-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-[#d7aa46]/45 bg-black/72 text-[#f0d381] shadow-[0_0_46px_rgba(215,170,70,0.45)]">
          <Swords className="h-7 w-7" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#b9a16f]">Round {round.roundNumber}</p>
        <h3 className="mt-1 font-serif text-4xl font-semibold text-[#f6e0a2] [text-shadow:0_5px_18px_rgba(0,0,0,0.95),0_0_32px_rgba(215,170,70,0.38)]">
          {headline(round, mySlot)}
        </h3>
      </div>
    </div>
  )
}
