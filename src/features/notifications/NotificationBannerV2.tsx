import {
  Bell,
  Gamepad2,
  Images,
  MessageCircle,
  RadioTower,
  ShieldAlert,
  UserRoundPlus,
  Users,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
} from 'react'
import { Avatar } from '../../components/ui/Avatar'
import { useComfortPreferences } from '../../hooks/useComfortPreferences'
import {
  getEnvelopeVisibleContent,
  getNotificationPrimaryActionLabel,
  type NotificationEnvelopeV2,
} from './notificationEnvelopeV2'

const PRESENTATION_DURATION_MS = 6_500

const getCategoryIcon = (envelope: NotificationEnvelopeV2) => {
  if (envelope.category === 'dm') return Users
  if (
    envelope.category === 'general_chat' ||
    envelope.category === 'mentions_replies' ||
    envelope.category === 'reactions_hype'
  ) return MessageCircle
  if (envelope.category === 'shadow_pin') return Images
  if (envelope.category === 'connections') return UserRoundPlus
  if (envelope.category === 'presence' || envelope.category === 'shado_live') {
    return RadioTower
  }
  if (envelope.category === 'shadow_checkers' || envelope.category === 'shadow_war') {
    return Gamepad2
  }
  if (envelope.category === 'security') return ShieldAlert
  return Bell
}

export function NotificationBannerV2({
  envelope,
  desktop,
  queuedCount,
  autoDismiss = true,
  onDismiss,
  onOpen,
  onOpenProfile,
}: {
  envelope: NotificationEnvelopeV2
  desktop: boolean
  queuedCount: number
  autoDismiss?: boolean
  onDismiss: (eventId: string) => void
  onOpen: (envelope: NotificationEnvelopeV2) => void
  onOpenProfile: (profileId: string) => void
}) {
  const { effectivePreferences } = useComfortPreferences()
  const [remainingMs, setRemainingMs] = useState(PRESENTATION_DURATION_MS)
  const pausedRef = useRef(false)
  const lastTickRef = useRef(Date.now())
  const content = getEnvelopeVisibleContent(envelope)
  const Icon = getCategoryIcon(envelope)
  const initial = (content.actor?.label ?? content.title).charAt(0).toUpperCase()
  const actionLabel = getNotificationPrimaryActionLabel(envelope.type)
  const motionLevel = effectivePreferences.motion

  const setPaused = useCallback((paused: boolean) => {
    pausedRef.current = paused
    lastTickRef.current = Date.now()
  }, [])

  useEffect(() => {
    setRemainingMs(PRESENTATION_DURATION_MS)
    pausedRef.current = false
    lastTickRef.current = Date.now()

    if (!autoDismiss) return
    const intervalId = window.setInterval(() => {
      const now = Date.now()
      const elapsed = now - lastTickRef.current
      lastTickRef.current = now
      if (pausedRef.current || document.visibilityState !== 'visible') return
      setRemainingMs(current => Math.max(0, current - elapsed))
    }, 100)

    return () => window.clearInterval(intervalId)
  }, [autoDismiss, envelope.eventId])

  useEffect(() => {
    if (autoDismiss && remainingMs <= 0) onDismiss(envelope.eventId)
  }, [autoDismiss, envelope.eventId, onDismiss, remainingMs])

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) setPaused(false)
  }

  const handlePointerUp = (_event: PointerEvent<HTMLElement>) => setPaused(false)
  const transitionClass = motionLevel === 'none'
    ? ''
    : motionLevel === 'reduced'
      ? 'animate-[notification-fade-in_80ms_ease-out]'
      : 'animate-[notification-slide-in_200ms_cubic-bezier(0.2,0.8,0.2,1)]'

  return (
    <article
      className={`${transitionClass} popup-surface pointer-events-auto relative mx-auto w-full max-w-[25rem] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] shadow-[var(--shadow-panel-strong)]`}
      aria-label={`${content.title}. Notification.`}
      data-testid="notification-banner-v2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={handleBlur}
      onPointerDown={() => setPaused(true)}
      onPointerCancel={() => setPaused(false)}
      onPointerUp={handlePointerUp}
    >
      <div className="flex min-w-0 items-start gap-3 p-3.5">
        <div className="flex w-12 shrink-0 flex-col gap-2">
          {content.actor ? (
            <button
              type="button"
              onClick={() => onOpenProfile(content.actor!.id)}
              className="relative inline-flex min-h-12 min-w-12 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-glow)]"
              aria-label={`Open ${content.actor.label}'s profile`}
            >
              <Avatar
                src={content.actor.avatarUrl ?? undefined}
                alt={content.actor.label}
                fallback={initial}
                userId={content.actor.id}
                size="lg"
                loading="eager"
                fetchPriority="high"
              />
              <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 inline-flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded-full border border-[var(--theme-accent-border-soft)] bg-[var(--bg-panel-strong)] text-[var(--theme-accent-readable)]">
                <Icon className="h-3 w-3" aria-hidden="true" />
              </span>
            </button>
          ) : (
            <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          )}

          {content.media && (
            <button
              type="button"
              onClick={() => onOpen(envelope)}
              className="relative h-12 w-12 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-glow)]"
              aria-label={`${actionLabel}: ${content.media.alt || content.title}`}
            >
              <img
                src={content.media.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="eager"
                decoding="async"
              />
              {content.media.kind === 'video' && (
                <span className="absolute inset-0 grid place-items-center bg-black/25 text-[0.625rem] font-bold uppercase text-white">
                  Play
                </span>
              )}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpen(envelope)}
          className="min-h-12 min-w-0 flex-1 text-left outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-[var(--border-glow)]"
          aria-label={`${content.title}. ${actionLabel}.`}
        >
          <span className="block text-[0.625rem] font-semibold uppercase tracking-[0.17em] text-[var(--text-gold)]">
            {envelope.content.eyebrow}
          </span>
          <span className="mt-0.5 block text-sm font-semibold leading-5 text-[var(--text-primary)]">
            {content.title}
          </span>
          {content.body && (
            <span className="mt-0.5 line-clamp-2 block text-[0.8125rem] leading-[1.2rem] text-[var(--text-secondary)]">
              {content.body}
            </span>
          )}
          <span className="mt-1.5 block whitespace-nowrap text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[var(--theme-accent-readable)]">
            {actionLabel}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onDismiss(envelope.eventId)}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-panel-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-glow)]"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {queuedCount > 0 && (
        <div className="border-t border-[var(--border-subtle)] px-3.5 py-1.5 text-right text-[0.6875rem] font-medium text-[var(--text-muted)]">
          {queuedCount} more waiting
        </div>
      )}
      {autoDismiss && (
        <div
          className="h-0.5 origin-left bg-[linear-gradient(90deg,var(--theme-accent),var(--gold-4))]"
          style={{ transform: `scaleX(${remainingMs / PRESENTATION_DURATION_MS})` }}
          aria-hidden="true"
        />
      )}
      {!desktop && (
        <span className="sr-only" aria-live="polite">
          {content.title}{content.body ? `. ${content.body}` : ''}
        </span>
      )}
    </article>
  )
}
