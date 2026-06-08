import React, { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { BellRing, PartyPopper, Sparkles, X } from 'lucide-react'
import { useHype } from '../../hooks/useHype'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

const CONFETTI_COLORS = [
  ['#fff1a8', '#f2b84b'],
  ['#ff8ab3', '#ff3f7d'],
  ['#84f3ff', '#2aa8ff'],
  ['#b79bff', '#7357ff'],
  ['#8cffbd', '#28c76f'],
  ['#ffbf69', '#ff6b35'],
  ['#f9a8ff', '#d946ef'],
  ['#d9f99d', '#84cc16'],
] as const

export function HypeCelebrationController() {
  const { activeCelebration, dismissCelebration } = useHype()

  const particles = useMemo(() => {
    const intensity = clamp(activeCelebration?.intensity ?? 1, 1, 8)
    const count = Math.min(168, 64 + intensity * 18)
    return Array.from({ length: count }, (_, index) => {
      const lane = index % 12
      const side = index % 2 === 0 ? -1 : 1
      const spread = 26 + (index % 9) * 7
      const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length]
      return {
        id: index,
        x: `${side * (spread + lane * 3)}vw`,
        y: `${-20 - (index % 8) * 6}vh`,
        delay: `${(index % 20) * 22}ms`,
        rotate: `${side * (120 + index * 13)}deg`,
        size: `${index % 5 === 0 ? 10 : index % 3 === 0 ? 7 : 5}px`,
        radius: index % 4 === 0 ? '999px' : index % 5 === 0 ? '1px' : '3px',
        colorStart: color[0],
        colorEnd: color[1],
      }
    })
  }, [activeCelebration?.intensity])

  if (!activeCelebration || typeof document === 'undefined') return null

  const intensity = clamp(activeCelebration.intensity, 1, 8)
  const latest = activeCelebration.latestEvent
  const metadata = latest.metadata ?? {}
  const actorName = metadata.actor_display_name || 'Someone'
  const authorName = metadata.message_author_display_name || 'a message'
  const title = activeCelebration.mode === 'catchup' && activeCelebration.events.length > 1
    ? `${activeCelebration.events.length} Hypes`
    : latest.event_type === 'message'
      ? 'Message Hyped'
      : 'Hype!'
  const subtitle = activeCelebration.mode === 'catchup' && activeCelebration.events.length > 1
    ? 'Caught up while you were away.'
    : latest.event_type === 'message'
      ? `${actorName} celebrated ${authorName}.`
      : `${actorName} rang the bell.`

  return createPortal(
    <div
      key={activeCelebration.key}
      className="hype-celebration"
      data-hype-intensity={intensity}
      style={{ '--hype-intensity': intensity } as React.CSSProperties}
      role="status"
      aria-live="polite"
      data-testid="hype-celebration-overlay"
    >
      <div className="hype-celebration__wash" aria-hidden="true" />
      <div className="hype-celebration__burst hype-celebration__burst--one" aria-hidden="true" />
      <div className="hype-celebration__burst hype-celebration__burst--two" aria-hidden="true" />
      <div className="hype-celebration__rays" aria-hidden="true" />
      {particles.map(particle => (
        <span
          key={particle.id}
          className="hype-celebration__particle"
          style={{
            '--hype-particle-x': particle.x,
            '--hype-particle-y': particle.y,
            '--hype-particle-delay': particle.delay,
            '--hype-particle-rotate': particle.rotate,
            '--hype-particle-size': particle.size,
            '--hype-particle-radius': particle.radius,
            '--hype-particle-color-start': particle.colorStart,
            '--hype-particle-color-end': particle.colorEnd,
          } as React.CSSProperties}
          aria-hidden="true"
        />
      ))}
      <div className="hype-celebration__content">
        <div className="hype-celebration__spark hype-celebration__spark--left" aria-hidden="true">
          <Sparkles className="h-full w-full" />
        </div>
        <div className="hype-celebration__icon" aria-hidden="true">
          {latest.event_type === 'message' ? (
            <PartyPopper className="h-16 w-16" />
          ) : (
            <BellRing className="h-16 w-16" />
          )}
        </div>
        <div className="hype-celebration__spark hype-celebration__spark--right" aria-hidden="true">
          <Sparkles className="h-full w-full" />
        </div>
        <p className="hype-celebration__eyebrow">Hype x{activeCelebration.intensity}</p>
        <h2 className="hype-celebration__title">{title}</h2>
        <p className="hype-celebration__subtitle">{subtitle}</p>
      </div>
      <button
        type="button"
        className="hype-celebration__dismiss"
        onClick={dismissCelebration}
        aria-label="Dismiss Hype celebration"
      >
        <X className="h-4 w-4" />
      </button>
    </div>,
    document.body
  )
}
