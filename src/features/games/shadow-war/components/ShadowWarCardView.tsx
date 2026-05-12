import React, { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { ShadowWarCard } from '../engine/types'
import { SHADOW_WAR_ASSETS } from '../assets/manifest'

export function ShadowWarCardView({
  card,
  compact = false,
  selected = false,
  hidden = false,
  onClick,
}: {
  card?: ShadowWarCard | null
  compact?: boolean
  selected?: boolean
  hidden?: boolean
  onClick?: () => void
}) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [card?.imageUrl])

  if (hidden || !card) {
    return (
      <div className={cn(
        'relative flex aspect-[3/4] min-h-0 w-full flex-col items-center justify-center overflow-hidden rounded-[0.45rem] border border-[rgba(215,170,70,0.28)] bg-[radial-gradient(circle_at_50%_8%,rgba(215,170,70,0.2),rgba(18,19,21,0.96)_52%,rgba(6,7,8,0.98))] text-[#f3d58a] shadow-[0_14px_32px_rgba(0,0,0,0.5)]',
        compact ? 'max-w-[6.2rem]' : ''
      )}>
        <img
          src={SHADOW_WAR_ASSETS.cardBack}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-75"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.42))]" />
        <Shield className="relative h-6 w-6 opacity-90 drop-shadow" />
        <span className="relative mt-1 text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Hidden</span>
      </div>
    )
  }

  const showImage = Boolean(card.imageUrl && !imageFailed)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-testid="shadow-war-card"
      data-shadow-war-card-id={card.instanceId}
      aria-label={`${card.name} strength ${card.rank}`}
      className={cn(
        'group relative aspect-[3/4] min-h-0 w-full overflow-hidden rounded-[0.45rem] border text-left shadow-[0_14px_32px_rgba(0,0,0,0.5)] transition-[border-color,box-shadow,transform] duration-[var(--dur-med)]',
        selected
          ? 'border-[rgba(239,202,114,0.72)] shadow-[0_0_0_1px_rgba(239,202,114,0.2),0_18px_42px_rgba(215,170,70,0.18)]'
          : 'border-[rgba(255,255,255,0.12)]',
        onClick ? 'hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]' : '',
        compact ? 'max-w-[6.2rem]' : ''
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_14%,rgba(255,230,164,0.2),transparent_24%),linear-gradient(160deg,rgba(88,35,28,0.58),rgba(16,17,18,0.94)_46%,rgba(6,7,8,0.99))]" />
      {showImage ? (
        <img
          src={card.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_24%,rgba(215,170,70,0.24),transparent_30%),linear-gradient(180deg,rgba(26,23,18,0.95),rgba(6,7,8,1))] px-2 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f3d58a]">
            {card.name}
          </span>
        </div>
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02)_0%,rgba(0,0,0,0.0)_44%,rgba(0,0,0,0.44)_100%)]" />
      <div className="absolute inset-[5px] rounded-[calc(var(--radius-md)-5px)] border border-[rgba(215,170,70,0.24)]" />
      <div className="absolute inset-x-1.5 bottom-2 px-1 text-center">
        <p
          className={cn(
            'overflow-hidden font-serif font-semibold uppercase text-[#f6e0a2] [text-shadow:0_2px_4px_rgba(0,0,0,0.95),0_0_10px_rgba(0,0,0,0.9)]',
            compact
              ? 'whitespace-nowrap text-[6px] leading-[0.65rem] tracking-0 sm:text-[8px] sm:leading-[0.72rem]'
              : 'line-clamp-2 break-words text-xs tracking-[0.02em] [overflow-wrap:anywhere]'
          )}
        >
          {card.name}
        </p>
        {!compact && (
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-3 text-[#d9c79f] [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">
            {card.description}
          </p>
        )}
      </div>
    </button>
  )
}
