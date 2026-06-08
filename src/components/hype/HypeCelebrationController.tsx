import React, { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
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
    const count = Math.min(360, 128 + intensity * 34)
    return Array.from({ length: count }, (_, index) => {
      const lane = (index * 37) % 101
      const side = index % 2 === 0 ? -1 : 1
      const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length]
      return {
        id: index,
        startX: `${lane}vw`,
        drift: `${side * (8 + (index % 11) * 1.6)}vw`,
        fall: `${112 + (index % 9) * 6}vh`,
        delay: `${(index % 28) * 34}ms`,
        duration: `${5200 + (index % 10) * 180 + intensity * 120}ms`,
        rotate: `${side * (160 + index * 17)}deg`,
        size: `${index % 5 === 0 ? 11 : index % 3 === 0 ? 8 : 5}px`,
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
    : `${actorName} hyped`
  const subtitle = activeCelebration.mode === 'catchup' && activeCelebration.events.length > 1
    ? 'Caught up while you were away.'
    : latest.event_type === 'message'
      ? `${authorName}'s message`
      : ''

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
            '--hype-particle-start-x': particle.startX,
            '--hype-particle-drift': particle.drift,
            '--hype-particle-fall': particle.fall,
            '--hype-particle-delay': particle.delay,
            '--hype-particle-duration': particle.duration,
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
        <div className="hype-celebration__nameplate" aria-hidden="true">
          <img
            src="/hype/hype-celebration-nameplate.webp"
            alt=""
            className="hype-celebration__asset"
            draggable={false}
          />
        </div>
        <div className="hype-celebration__copy">
          <p className="hype-celebration__eyebrow">Hype x{activeCelebration.intensity}</p>
          <h2 className="hype-celebration__title">{title}</h2>
          {subtitle && <p className="hype-celebration__subtitle">{subtitle}</p>}
        </div>
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
