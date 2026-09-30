import React, { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles } from 'lucide-react'
import { GoldEasterEggBadge } from '../ui/GoldEasterEggBadge'
import { GOLD_EASTER_EGG_BADGE_SRC, GOLD_EASTER_EGG_BANNER_SRC } from './goldEggAssets'

type GoldEggCelebration = {
  displayName: string
  username?: string | null
}

export function GoldEggDiscoveryOverlay({ celebration }: { celebration: GoldEggCelebration }) {
  const particles = useMemo(
    () => Array.from({ length: 22 }, (_, index) => {
      const angle = (index / 22) * Math.PI * 2
      const distance = index % 3 === 0 ? 128 : index % 2 === 0 ? 104 : 82
      return {
        id: index,
        x: `${Math.cos(angle) * distance}px`,
        y: `${Math.sin(angle) * distance}px`,
        delay: `${(index % 7) * 42}ms`,
        size: `${index % 4 === 0 ? 7 : 5}px`,
      }
    }),
    []
  )

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="gold-egg-discovery" role="status" aria-live="polite" data-testid="gold-egg-discovery-overlay">
      <div className="gold-egg-discovery__scene" aria-hidden="true">
        <img src={GOLD_EASTER_EGG_BANNER_SRC} alt="" draggable={false} />
      </div>
      <div className="gold-egg-discovery__veil" aria-hidden="true" />
      <div className="gold-egg-discovery__aurora" aria-hidden="true" />
      <div className="gold-egg-discovery__ring gold-egg-discovery__ring--one" aria-hidden="true" />
      <div className="gold-egg-discovery__ring gold-egg-discovery__ring--two" aria-hidden="true" />
      <div className="gold-egg-discovery__ring gold-egg-discovery__ring--three" aria-hidden="true" />
      {particles.map(particle => (
        <span
          key={particle.id}
          className="gold-egg-discovery__particle"
          style={{
            '--gold-egg-particle-x': particle.x,
            '--gold-egg-particle-y': particle.y,
            '--gold-egg-particle-delay': particle.delay,
            '--gold-egg-particle-size': particle.size,
          } as React.CSSProperties}
          aria-hidden="true"
        />
      ))}
      <div className="gold-egg-discovery__content">
        <div className="gold-egg-discovery__spark gold-egg-discovery__spark--left" aria-hidden="true">
          <Sparkles className="h-full w-full" />
        </div>
        <div className="gold-egg-discovery__seal" aria-hidden="true">
          <img src={GOLD_EASTER_EGG_BADGE_SRC} alt="" draggable={false} />
        </div>
        <div className="gold-egg-discovery__spark gold-egg-discovery__spark--right" aria-hidden="true">
          <Sparkles className="h-full w-full" />
        </div>
        <p className="gold-egg-discovery__eyebrow">Discovery Unlocked</p>
        <h2 className="gold-egg-discovery__title">Golden Egg Found</h2>
        <p className="gold-egg-discovery__name">
          <span className="truncate">{celebration.displayName}</span>
          <GoldEasterEggBadge active className="h-6 w-6" />
        </p>
        {celebration.username && (
          <p className="gold-egg-discovery__handle">@{celebration.username}</p>
        )}
      </div>
    </div>,
    document.body
  )
}
