import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { AlertCircle, ArrowUpRight, Check, Inbox, Loader2, MessageCircle, RefreshCw, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { MobileAppHeader } from '../../components/layout/MobileAppHeader'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useComfortPreferences } from '../../hooks/useComfortPreferences'
import { getUserProfile } from '../../lib/auth'
import { requestAppBadgeRefresh } from '../../lib/appBadge'
import type { User } from '../../lib/supabase'
import type { AppView } from '../../types/navigation'
import {
  clearAllNotificationsFromSystemTray,
  clearNotificationEventFromSystemTray,
} from '../notifications/notificationApi'
import {
  acknowledgeCatchUpEvents,
  acknowledgeAllNotificationInboxEvents,
  acknowledgeNotificationInboxEvent,
  clearPendingNotificationRead,
  fetchCatchUpSnapshot,
  fetchNotificationInbox,
  findUnreadNotificationEventIds,
  flushPendingNotificationReads,
  queuePendingNotificationRead,
} from './catchUpApi'
import {
  CATCH_UP_SECTION_ORDER,
  clearCatchUpCache,
  formatCatchUpTime,
  readCatchUpCache,
  writeCatchUpCache,
  type CatchUpItem,
  type CatchUpSnapshot,
} from './catchUpModel'
import { NotificationSandDisintegration } from './NotificationSandDisintegration'
import {
  captureNotificationSandSnapshot,
  NOTIFICATION_SAND_DURATION_MS,
  type NotificationSandSnapshot,
} from './notificationSand'

const PublicProfileDialog = lazy(() =>
  import('../../components/profile/PublicProfileDialog').then(module => ({
    default: module.PublicProfileDialog,
  }))
)

type CatchUpViewProps = {
  currentView: AppView
  onViewChange: (view: AppView) => void
  onOpenSource: (item: CatchUpItem) => void
}

const CACHE_TTL_MS = 30_000
const SWIPE_ACTION_WIDTH_PX = 96
const SWIPE_DISMISS_MIN_PX = 72
const SWIPE_DISMISS_MAX_PX = 120
const SWIPE_DISMISS_RATIO = 0.28
const SWIPE_FLICK_MIN_DISTANCE_PX = 28
const SWIPE_FLICK_VELOCITY_PX_MS = -0.65
const SWIPE_HORIZONTAL_CLAIM_PX = 10
const SWIPE_TOUCH_HORIZONTAL_CLAIM_PX = 6
const SWIPE_VERTICAL_RELEASE_PX = 18
const SWIPE_LEFT_DIAGONAL_RATIO = 0.75
const SWIPE_VERTICAL_DOMINANCE_RATIO = 1.4
const SWIPE_RIGHT_RELEASE_PX = 14
const SWIPE_EXIT_OVERSHOOT_PX = 24
const FULL_CARD_CLIP_PATH = 'polygon(0% 0%, 100% 0%, 100% 9%, 100% 18%, 100% 27%, 100% 36%, 100% 45%, 100% 55%, 100% 64%, 100% 73%, 100% 82%, 100% 91%, 100% 100%, 0% 100%)'
const CARD_DISSOLVE_CLIP_PATHS = [
  FULL_CARD_CLIP_PATH,
  'polygon(0% 0%, 93% 0%, 98% 9%, 88% 18%, 96% 27%, 86% 36%, 94% 45%, 84% 55%, 97% 64%, 87% 73%, 95% 82%, 83% 91%, 91% 100%, 0% 100%)',
  'polygon(0% 0%, 70% 0%, 80% 9%, 61% 18%, 75% 27%, 57% 36%, 72% 45%, 59% 55%, 78% 64%, 62% 73%, 73% 82%, 55% 91%, 67% 100%, 0% 100%)',
  'polygon(0% 0%, 39% 0%, 51% 9%, 29% 18%, 46% 27%, 23% 36%, 41% 45%, 27% 55%, 53% 64%, 31% 73%, 44% 82%, 20% 91%, 35% 100%, 0% 100%)',
  'polygon(0% 0%, 12% 0%, 23% 9%, 5% 18%, 19% 27%, 2% 36%, 15% 45%, 4% 55%, 25% 64%, 7% 73%, 18% 82%, 1% 91%, 10% 100%, 0% 100%)',
  'polygon(0% 0%, 0% 0%, 0% 9%, 0% 18%, 0% 27%, 0% 36%, 0% 45%, 0% 55%, 0% 64%, 0% 73%, 0% 82%, 0% 91%, 0% 100%, 0% 100%)',
] as const

type SwipePhase = 'idle' | 'dragging' | 'settling' | 'dismissing' | 'collapsing'
type SwipeIntent = 'pending' | 'horizontal' | 'vertical' | 'right'

const resolveSwipeIntent = (
  deltaX: number,
  deltaY: number,
  horizontalClaimPx: number
): SwipeIntent => {
  const leftwardDistance = Math.max(0, -deltaX)
  const rightwardDistance = Math.max(0, deltaX)
  const verticalDistance = Math.abs(deltaY)
  if (
    leftwardDistance >= horizontalClaimPx
    && leftwardDistance >= verticalDistance * SWIPE_LEFT_DIAGONAL_RATIO
  ) {
    return 'horizontal'
  }
  if (
    verticalDistance >= SWIPE_VERTICAL_RELEASE_PX
    && verticalDistance >= leftwardDistance * SWIPE_VERTICAL_DOMINANCE_RATIO
  ) {
    return 'vertical'
  }
  if (
    rightwardDistance >= SWIPE_RIGHT_RELEASE_PX
    && rightwardDistance >= verticalDistance
  ) {
    return 'right'
  }
  return 'pending'
}

const mapSwipeFingerOffset = (
  deltaX: number,
  startX: number,
  leftBoundary: number,
  maxTravel: number
) => {
  if (deltaX >= 0) return 0
  const availableFingerTravel = Math.max(64, startX - leftBoundary)
  const rawDistance = Math.min(availableFingerTravel, -deltaX)
  const progress = Math.min(1, rawDistance / availableFingerTravel)
  const edgeRampProgress = Math.min(1, Math.max(0, (progress - 0.45) / 0.55))
  const smoothEdgeProgress = edgeRampProgress * edgeRampProgress * (3 - (2 * edgeRampProgress))
  const edgeCompensation = Math.max(0, maxTravel - availableFingerTravel) * smoothEdgeProgress
  return -Math.min(maxTravel, rawDistance + edgeCompensation)
}

const findTouch = (touches: TouchList, identifier: number): Touch | null => {
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches[index]
    if (touch?.identifier === identifier) return touch
  }
  return null
}

const DISINTEGRATION_FRAGMENTS = Array.from({ length: 28 }, (_, index) => {
  const left = 98 - ((index * 17) % 90)
  const shard = index % 4 === 0
  const wave = Math.min(4, Math.floor((100 - left) / 20))
  return {
    left,
    top: 5 + ((index * 37) % 91),
    width: shard ? 3 + (index % 3) : 2 + (index % 3),
    height: shard ? 9 + ((index * 5) % 8) : 2 + ((index * 7) % 3),
    x: -42 - ((index * 29) % 112),
    y: -44 + ((index * 31) % 89),
    rotate: -95 + ((index * 47) % 190),
    delay: (wave * 0.05) + ((index % 3) * 0.006),
    wave,
    tone: index % 3 === 0
      ? 'var(--theme-accent-readable)'
      : index % 3 === 1
        ? 'var(--text-secondary)'
        : 'var(--theme-accent)',
  }
})

const getInitials = (item: CatchUpItem) => {
  const label = item.actor?.display_name || item.actor?.username || item.title
  return label.split(/\s+/u).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'S'
}

const removeOpenedActivityItem = (snapshot: CatchUpSnapshot, item: CatchUpItem): CatchUpSnapshot => {
  if (item.activityEventIds.length === 0) return snapshot
  const eventIds = new Set(item.activityEventIds)
  const sections = Object.fromEntries(CATCH_UP_SECTION_ORDER.map(sectionId => {
    const section = snapshot.sections[sectionId]
    const items = section.items.filter(candidate => !candidate.activityEventIds.some(id => eventIds.has(id)))
    const removed = section.items.length - items.length
    return [sectionId, {
      ...section,
      items,
      shownCount: items.length,
      totalCount: Math.max(0, section.totalCount - removed),
      hasMore: Math.max(0, section.totalCount - removed) > items.length,
    }]
  })) as CatchUpSnapshot['sections']
  return { ...snapshot, sections }
}

function CatchUpCard({
  item,
  onOpen,
  onOpenProfile,
  profileLoading,
}: {
  item: CatchUpItem
  onOpen: () => void
  onOpenProfile: (userId: string) => void
  profileLoading: boolean
}) {
  const domId = useId()
  const titleId = `${domId}-title`
  const detailsId = `${domId}-details`
  const actorLabel = item.actor?.display_name || item.actor?.username || 'ShadowChat member'
  return (
    <article className="group flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.026)] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.14)] transition-[border-color,background-color] hover:border-[var(--border-glow)] hover:bg-[rgba(255,255,255,0.04)]">
      {item.actor ? (
        <button
          type="button"
          onClick={() => onOpenProfile(item.actor!.id)}
          disabled={profileLoading}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] disabled:opacity-65"
          aria-label={`Open ${actorLabel}'s profile`}
          aria-busy={profileLoading}
        >
          <Avatar
            src={item.actor.avatar_thumbnail_url || item.actor.avatar_url || undefined}
            alt={actorLabel}
            fallback={getInitials(item)}
            size="lg"
            color={item.actor.color || undefined}
            userId={item.actor.id}
          />
        </button>
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-sm font-bold text-[var(--theme-accent-readable)]" aria-hidden="true">
          {getInitials(item)}
        </span>
      )}
      <button type="button" onClick={onOpen} data-catch-up-item-id={item.id} className="flex min-h-16 min-w-0 flex-1 items-center rounded-[var(--radius-md)] text-left focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" aria-labelledby={titleId} aria-describedby={detailsId}>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span id={titleId} className="truncate font-semibold text-[var(--text-primary)]">{item.title}</span>
            <span className="shrink-0 text-xs text-[var(--text-muted)]">{formatCatchUpTime(item.occurredAt)}</span>
          </span>
          <span id={detailsId} className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{item.preview}</span>
          <span aria-hidden="true" className="mt-2 flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--theme-accent-readable)]">
            {item.unreadCount > 1 ? `${item.unreadCount} unread` : item.manuallyUnread ? 'Marked unread' : 'Open source'}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </span>
      </button>
    </article>
  )
}

function SwipeToReadNotification({
  item,
  motionPreference,
  onReadStart,
  onDismissComplete,
  onHorizontalSwipeLockChange,
  children,
}: {
  item: CatchUpItem
  motionPreference: 'full' | 'reduced' | 'none'
  onReadStart: () => Promise<boolean>
  onDismissComplete: () => void
  onHorizontalSwipeLockChange: (itemId: string, locked: boolean) => void
  children: React.ReactNode
}) {
  const [phase, setPhase] = useState<SwipePhase>('idle')
  const [dissolveActive, setDissolveActive] = useState(false)
  const [sandSnapshot, setSandSnapshot] = useState<NotificationSandSnapshot | null>(null)
  const x = useMotionValue(0)
  const readActionOpacity = useTransform(x, [-SWIPE_ACTION_WIDTH_PX, -12, 0], [1, 0.2, 0])
  const readActionScale = useTransform(x, [-SWIPE_ACTION_WIDTH_PX, -12, 0], [1, 0.9, 0.82])
  const rootRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const sandSnapshotPromiseRef = useRef<Promise<NotificationSandSnapshot | null> | null>(null)
  const offsetRef = useRef(0)
  const maxTravelRef = useRef(344)
  const phaseRef = useRef<SwipePhase>('idle')
  const settleAnimationRef = useRef<ReturnType<typeof animate> | null>(null)
  const phaseTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const dismissStartedRef = useRef(false)
  const dismissCompletedRef = useRef(false)
  const departureCompletedRef = useRef(false)
  const readConfirmedRef = useRef(false)
  const dismissalAttemptRef = useRef(0)
  const horizontalLockRef = useRef(false)
  const gestureRef = useRef<{
    pointerId: number
    input: 'pointer' | 'touch'
    startX: number
    startY: number
    lastX: number
    lastAt: number
    velocityX: number
    dragging: boolean
    cancelled: boolean
  } | null>(null)
  const nativeTouchHandlersRef = useRef<{
    start: (event: TouchEvent) => void
    move: (event: TouchEvent) => void
    end: (event: TouchEvent) => void
    cancel: (event: TouchEvent) => void
  } | null>(null)
  const nativeTouchCleanupRef = useRef<(() => void) | null>(null)
  const suppressClickRef = useRef(false)

  const setSwipePhase = (next: SwipePhase) => {
    phaseRef.current = next
    setPhase(next)
  }

  const primeSandSnapshot = () => {
    if (motionPreference !== 'full') return Promise.resolve(null)
    if (sandSnapshotPromiseRef.current) return sandSnapshotPromiseRef.current
    const surface = surfaceRef.current
    if (!surface) return Promise.resolve(null)
    const snapshotPromise = captureNotificationSandSnapshot(surface).catch(() => null)
    sandSnapshotPromiseRef.current = snapshotPromise
    return snapshotPromise
  }

  const updateOffset = (next: number) => {
    const bounded = Math.max(-maxTravelRef.current, Math.min(0, next))
    offsetRef.current = bounded
    x.set(bounded)
    surfaceRef.current?.setAttribute('data-swipe-offset', String(Math.round(bounded)))
  }

  const clearPhaseTimer = () => {
    if (phaseTimerRef.current === null) return
    globalThis.clearTimeout(phaseTimerRef.current)
    phaseTimerRef.current = null
  }

  const stopNativeTouchTracking = () => {
    nativeTouchCleanupRef.current?.()
    nativeTouchCleanupRef.current = null
  }

  const startNativeTouchTracking = () => {
    stopNativeTouchTracking()
    const move = (event: TouchEvent) => nativeTouchHandlersRef.current?.move(event)
    const end = (event: TouchEvent) => nativeTouchHandlersRef.current?.end(event)
    const cancel = (event: TouchEvent) => nativeTouchHandlersRef.current?.cancel(event)
    document.addEventListener('touchmove', move, { capture: true, passive: false })
    document.addEventListener('touchend', end, { capture: true, passive: true })
    document.addEventListener('touchcancel', cancel, { capture: true, passive: true })
    nativeTouchCleanupRef.current = () => {
      document.removeEventListener('touchmove', move, true)
      document.removeEventListener('touchend', end, true)
      document.removeEventListener('touchcancel', cancel, true)
    }
  }

  const setHorizontalSwipeLock = useCallback((locked: boolean) => {
    if (horizontalLockRef.current === locked) return
    horizontalLockRef.current = locked
    onHorizontalSwipeLockChange(item.id, locked)
  }, [item.id, onHorizontalSwipeLockChange])

  const releasePointerCapture = (pointerId: number) => {
    const surface = surfaceRef.current
    if (!surface?.hasPointerCapture?.(pointerId)) return
    surface.releasePointerCapture?.(pointerId)
  }

  const settleTo = (target: number) => {
    settleAnimationRef.current?.stop()
    const duration = motionPreference === 'none' ? 0 : motionPreference === 'reduced' ? 0.08 : 0.18
    settleAnimationRef.current = animate(x, target, {
      duration,
      ease: [0.22, 0.72, 0.24, 1],
      onUpdate: latest => {
        offsetRef.current = latest
        surfaceRef.current?.setAttribute('data-swipe-offset', String(Math.round(latest)))
      },
    })
  }

  const resetGesture = (animated = true) => {
    const gesture = gestureRef.current
    gestureRef.current = null
    stopNativeTouchTracking()
    if (gesture?.input === 'pointer') releasePointerCapture(gesture.pointerId)
    setHorizontalSwipeLock(false)
    setSwipePhase(animated ? 'settling' : 'idle')
    if (animated) settleTo(0)
    else updateOffset(0)
    clearPhaseTimer()
    phaseTimerRef.current = globalThis.setTimeout(() => {
      if (phaseRef.current === 'settling') setSwipePhase('idle')
      suppressClickRef.current = false
    }, motionPreference === 'full' && animated ? 190 : motionPreference === 'reduced' && animated ? 90 : 0)
  }

  const finishDismissal = () => {
    if (dismissCompletedRef.current) return
    dismissCompletedRef.current = true
    onDismissComplete()
  }

  const beginCollapse = () => {
    if (phaseRef.current !== 'dismissing') return
    setSwipePhase('collapsing')
    const collapseDuration = motionPreference === 'none' ? 0 : motionPreference === 'reduced' ? 90 : 190
    clearPhaseTimer()
    phaseTimerRef.current = globalThis.setTimeout(finishDismissal, collapseDuration + 40)
  }

  const tryBeginCollapse = () => {
    if (!departureCompletedRef.current || !readConfirmedRef.current) return
    if (phaseRef.current !== 'dismissing') return
    if (motionPreference === 'none') {
      setSwipePhase('collapsing')
      finishDismissal()
      return
    }
    beginCollapse()
  }

  const restoreAfterReadFailure = (attempt: number) => {
    if (attempt !== dismissalAttemptRef.current || dismissCompletedRef.current) return
    clearPhaseTimer()
    settleAnimationRef.current?.stop()
    dismissStartedRef.current = false
    departureCompletedRef.current = false
    readConfirmedRef.current = false
    setDissolveActive(false)
    setSandSnapshot(null)
    suppressClickRef.current = true
    setSwipePhase('settling')
    settleTo(0)
    phaseTimerRef.current = globalThis.setTimeout(() => {
      if (phaseRef.current === 'settling') setSwipePhase('idle')
      suppressClickRef.current = false
    }, motionPreference === 'full' ? 190 : motionPreference === 'reduced' ? 90 : 0)
  }

  const completeDeparture = (attempt: number) => {
    if (attempt !== dismissalAttemptRef.current || phaseRef.current !== 'dismissing') return
    departureCompletedRef.current = true
    tryBeginCollapse()
  }

  const startDisintegration = async (attempt: number) => {
    if (attempt !== dismissalAttemptRef.current || dismissCompletedRef.current) return
    if (motionPreference === 'none') {
      completeDeparture(attempt)
      return
    }

    const capturedSnapshot = motionPreference === 'full'
      ? await primeSandSnapshot()
      : null
    if (attempt !== dismissalAttemptRef.current || dismissCompletedRef.current) return

    setSandSnapshot(capturedSnapshot)
    setDissolveActive(true)
    settleAnimationRef.current?.stop()
    const duration = motionPreference === 'full'
      ? capturedSnapshot
        ? NOTIFICATION_SAND_DURATION_MS / 1_000
        : 0.64
      : 0.08
    const target = motionPreference === 'full' ? 0 : offsetRef.current
    settleAnimationRef.current = animate(x, target, {
      duration,
      ease: [0.22, 0.72, 0.24, 1],
      onUpdate: latest => {
        offsetRef.current = latest
        surfaceRef.current?.setAttribute('data-swipe-offset', String(Math.round(latest)))
      },
    })
    clearPhaseTimer()
    phaseTimerRef.current = globalThis.setTimeout(() => {
      completeDeparture(attempt)
    }, Math.round(duration * 1_000) + (capturedSnapshot ? 240 : motionPreference === 'full' ? 40 : 16))
  }

  const beginDismissal = () => {
    if (dismissStartedRef.current) return
    dismissStartedRef.current = true
    suppressClickRef.current = true
    const gesture = gestureRef.current
    gestureRef.current = null
    stopNativeTouchTracking()
    if (gesture?.input === 'pointer') releasePointerCapture(gesture.pointerId)
    setHorizontalSwipeLock(false)
    setSwipePhase('dismissing')
    setDissolveActive(false)
    departureCompletedRef.current = false
    readConfirmedRef.current = false
    const attempt = dismissalAttemptRef.current + 1
    dismissalAttemptRef.current = attempt
    void primeSandSnapshot()
    void onReadStart().then(confirmed => {
      if (!confirmed) throw new Error('Notification read acknowledgement was not confirmed.')
      if (attempt !== dismissalAttemptRef.current || dismissCompletedRef.current) return
      readConfirmedRef.current = true
      void startDisintegration(attempt)
    }).catch(() => restoreAfterReadFailure(attempt))
    settleAnimationRef.current?.stop()
    if (motionPreference !== 'none') {
      const savingOffset = Math.max(offsetRef.current, -Math.round(SWIPE_ACTION_WIDTH_PX * 0.42))
      settleAnimationRef.current = animate(x, savingOffset, {
        duration: motionPreference === 'full' ? 0.18 : 0.08,
        ease: [0.22, 0.72, 0.24, 1],
        onUpdate: latest => {
          offsetRef.current = latest
          surfaceRef.current?.setAttribute('data-swipe-offset', String(Math.round(latest)))
        },
      })
    }
  }

  const finishGesture = (pointerId: number) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== pointerId) return
    const width = Math.max(1, maxTravelRef.current - SWIPE_EXIT_OVERSHOOT_PX)
    const threshold = Math.min(
      SWIPE_DISMISS_MAX_PX,
      Math.max(SWIPE_DISMISS_MIN_PX, width * SWIPE_DISMISS_RATIO)
    )
    const distanceCommitted = gesture.dragging && offsetRef.current <= -threshold
    const flickCommitted = gesture.dragging
      && offsetRef.current <= -SWIPE_FLICK_MIN_DISTANCE_PX
      && gesture.velocityX <= SWIPE_FLICK_VELOCITY_PX_MS
    gestureRef.current = null
    if (gesture.input === 'pointer') releasePointerCapture(pointerId)
    setHorizontalSwipeLock(false)
    if (distanceCommitted || flickCommitted) {
      beginDismissal()
      return
    }
    resetGesture()
  }

  nativeTouchHandlersRef.current = {
    start: event => {
      if (phaseRef.current === 'dismissing' || phaseRef.current === 'collapsing') return
      if (event.touches.length !== 1) {
        if (gestureRef.current?.input === 'touch') resetGesture(false)
        return
      }
      const touch = event.touches[0]
      if (!touch) return
      settleAnimationRef.current?.stop()
      clearPhaseTimer()
      const measuredWidth = surfaceRef.current?.getBoundingClientRect().width || 320
      maxTravelRef.current = Math.max(240, measuredWidth + SWIPE_EXIT_OVERSHOOT_PX)
      const now = globalThis.performance?.now?.() ?? Date.now()
      gestureRef.current = {
        pointerId: touch.identifier,
        input: 'touch',
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastAt: now,
        velocityX: 0,
        dragging: false,
        cancelled: false,
      }
      startNativeTouchTracking()
    },
    move: event => {
      const gesture = gestureRef.current
      if (!gesture || gesture.input !== 'touch' || gesture.cancelled) return
      if (event.touches.length !== 1) {
        resetGesture(false)
        return
      }
      const touch = findTouch(event.touches, gesture.pointerId)
      if (!touch) return
      const deltaX = touch.clientX - gesture.startX
      const deltaY = touch.clientY - gesture.startY
      if (!gesture.dragging) {
        const intent = resolveSwipeIntent(deltaX, deltaY, SWIPE_TOUCH_HORIZONTAL_CLAIM_PX)
        if (intent === 'pending') return
        if (intent === 'vertical' || intent === 'right') {
          gesture.cancelled = true
          updateOffset(0)
          return
        }
        gesture.dragging = true
        suppressClickRef.current = true
        setSwipePhase('dragging')
        setHorizontalSwipeLock(true)
        void primeSandSnapshot()
      }

      const now = globalThis.performance?.now?.() ?? Date.now()
      const elapsed = Math.max(1, now - gesture.lastAt)
      const instantaneousVelocity = (touch.clientX - gesture.lastX) / elapsed
      gesture.velocityX = (gesture.velocityX * 0.35) + (instantaneousVelocity * 0.65)
      gesture.lastX = touch.clientX
      gesture.lastAt = now
      if (event.cancelable) event.preventDefault()
      const leftBoundary = rootRef.current?.getBoundingClientRect().left ?? 0
      updateOffset(mapSwipeFingerOffset(
        deltaX,
        gesture.startX,
        leftBoundary,
        maxTravelRef.current
      ))
    },
    end: event => {
      const gesture = gestureRef.current
      if (!gesture || gesture.input !== 'touch') return
      if (findTouch(event.touches, gesture.pointerId)) return
      stopNativeTouchTracking()
      finishGesture(gesture.pointerId)
    },
    cancel: () => {
      const gesture = gestureRef.current
      if (!gesture || gesture.input !== 'touch') return
      gesture.cancelled = true
      resetGesture()
    },
  }

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const start = (event: TouchEvent) => nativeTouchHandlersRef.current?.start(event)
    surface.addEventListener('touchstart', start, { passive: true })
    return () => {
      surface.removeEventListener('touchstart', start)
      stopNativeTouchTracking()
    }
  }, [])

  useEffect(() => () => {
    settleAnimationRef.current?.stop()
    clearPhaseTimer()
    stopNativeTouchTracking()
    setHorizontalSwipeLock(false)
  }, [setHorizontalSwipeLock])

  const collapseDuration = motionPreference === 'none' ? 0 : motionPreference === 'reduced' ? 0.09 : 0.19
  const layoutTransition = motionPreference === 'none'
    ? { duration: 0 }
    : motionPreference === 'reduced'
      ? { duration: 0.08 }
      : { type: 'spring' as const, stiffness: 500, damping: 42, mass: 0.55 }
  const isDeparting = phase === 'dismissing' || phase === 'collapsing'
  const showDust = dissolveActive && phase === 'dismissing' && motionPreference === 'full'
  const showSand = showDust && sandSnapshot !== null

  return (
    <motion.div
      ref={rootRef}
      layout={motionPreference === 'none' ? false : 'position'}
      data-testid={`notification-row-${item.id}`}
      data-notification-swipe-id={item.id}
      data-dismiss-phase={phase}
      data-motion-preference={motionPreference}
      animate={phase === 'collapsing'
        ? { height: 0, opacity: 0, marginTop: -8 }
        : { height: 'auto', opacity: 1, marginTop: 0 }}
      transition={{
        height: { duration: collapseDuration, ease: [0.22, 0.72, 0.24, 1] },
        opacity: { duration: collapseDuration * 0.72 },
        marginTop: { duration: collapseDuration, ease: [0.22, 0.72, 0.24, 1] },
        layout: layoutTransition,
      }}
      onAnimationComplete={() => {
        if (phaseRef.current === 'collapsing') finishDismissal()
      }}
      className="relative overflow-visible rounded-[var(--radius-lg)]"
    >
      <div className="relative overflow-hidden rounded-[var(--radius-lg)]">
        <motion.div
          animate={{ opacity: dissolveActive ? 0 : 1 }}
          transition={{ duration: dissolveActive && motionPreference === 'full' ? 0.09 : 0 }}
          className="absolute inset-0"
        >
          <motion.button
            type="button"
            onClick={beginDismissal}
            onFocus={() => {
              if (dismissStartedRef.current) return
              setSwipePhase('settling')
              settleTo(-SWIPE_ACTION_WIDTH_PX)
            }}
            onBlur={() => {
              if (!dismissStartedRef.current) resetGesture()
            }}
            disabled={isDeparting}
            style={{ opacity: readActionOpacity }}
            className="flex h-full w-full items-center justify-end bg-[linear-gradient(90deg,rgba(201,154,58,0.06),var(--theme-accent-soft))] pr-5 text-[var(--theme-accent-readable)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-focus-ring)] disabled:pointer-events-none"
            aria-label={`Mark ${item.title} as read`}
          >
            <motion.span
              style={{ scale: readActionScale }}
              className="flex flex-col items-center gap-1 text-[0.65rem] font-bold uppercase tracking-[0.1em]"
            >
              {isDeparting ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-5 w-5" aria-hidden="true" />
              )}
              {isDeparting ? 'Saving' : 'Read'}
            </motion.span>
          </motion.button>
        </motion.div>
        <motion.div
          ref={surfaceRef}
          data-testid={`notification-swipe-${item.id}`}
          data-swipe-offset="0"
          style={{
            x,
            touchAction: 'pan-y pinch-zoom',
            userSelect: phase === 'dragging' ? 'none' : undefined,
            pointerEvents: isDeparting ? 'none' : undefined,
            willChange: phase === 'dragging' || dissolveActive
              ? 'transform, clip-path, opacity'
              : 'auto',
          }}
          animate={dissolveActive
            ? motionPreference === 'full'
              ? sandSnapshot
                ? { clipPath: FULL_CARD_CLIP_PATH, opacity: 0 }
                : {
                    clipPath: [...CARD_DISSOLVE_CLIP_PATHS],
                    opacity: [1, 1, 0.98, 0.86, 0.45, 0],
                  }
              : { clipPath: FULL_CARD_CLIP_PATH, opacity: motionPreference === 'none' ? 0 : 0.06 }
            : { clipPath: FULL_CARD_CLIP_PATH, opacity: 1 }}
          transition={{
            clipPath: {
              duration: motionPreference === 'full' ? 0.64 : 0,
              times: [0, 0.14, 0.34, 0.56, 0.78, 1],
              ease: [0.22, 0.72, 0.24, 1],
            },
            opacity: {
              duration: sandSnapshot
                ? 0
                : motionPreference === 'full'
                  ? 0.64
                  : motionPreference === 'reduced'
                    ? 0.08
                    : 0,
              times: motionPreference === 'full' ? [0, 0.14, 0.34, 0.56, 0.78, 1] : undefined,
              ease: [0.22, 0.72, 0.24, 1],
            },
          }}
          data-card-disintegration={dissolveActive && motionPreference === 'full' ? 'active' : 'inactive'}
          data-native-touch-swipe="true"
          className="relative z-[1] bg-[var(--bg-app)]"
          onClickCapture={event => {
            if (!suppressClickRef.current) return
            event.preventDefault()
            event.stopPropagation()
            if (!isDeparting) suppressClickRef.current = false
          }}
          onPointerDown={event => {
            if (
              event.pointerType === 'touch'
              || isDeparting
              || (event.pointerType === 'mouse' && event.button !== 0)
            ) return
            settleAnimationRef.current?.stop()
            clearPhaseTimer()
            const measuredWidth = surfaceRef.current?.getBoundingClientRect().width || 320
            maxTravelRef.current = Math.max(240, measuredWidth + SWIPE_EXIT_OVERSHOOT_PX)
            const now = globalThis.performance?.now?.() ?? Date.now()
            gestureRef.current = {
              pointerId: event.pointerId,
              input: 'pointer',
              startX: event.clientX,
              startY: event.clientY,
              lastX: event.clientX,
              lastAt: now,
              velocityX: 0,
              dragging: false,
              cancelled: false,
            }
          }}
          onPointerMove={event => {
            if (event.pointerType === 'touch') return
            const gesture = gestureRef.current
            if (
              !gesture
              || gesture.input !== 'pointer'
              || gesture.pointerId !== event.pointerId
              || gesture.cancelled
            ) return
            const deltaX = event.clientX - gesture.startX
            const deltaY = event.clientY - gesture.startY
            if (!gesture.dragging) {
              const intent = resolveSwipeIntent(deltaX, deltaY, SWIPE_HORIZONTAL_CLAIM_PX)
              if (intent === 'pending') return
              if (intent === 'vertical' || intent === 'right') {
                gesture.cancelled = true
                updateOffset(0)
                return
              }
              gesture.dragging = true
              suppressClickRef.current = true
              setSwipePhase('dragging')
              setHorizontalSwipeLock(true)
              void primeSandSnapshot()
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }

            const now = globalThis.performance?.now?.() ?? Date.now()
            const elapsed = Math.max(1, now - gesture.lastAt)
            const instantaneousVelocity = (event.clientX - gesture.lastX) / elapsed
            gesture.velocityX = (gesture.velocityX * 0.35) + (instantaneousVelocity * 0.65)
            gesture.lastX = event.clientX
            gesture.lastAt = now
            event.preventDefault()
            const leftBoundary = rootRef.current?.getBoundingClientRect().left ?? 0
            updateOffset(mapSwipeFingerOffset(
              deltaX,
              gesture.startX,
              leftBoundary,
              maxTravelRef.current
            ))
          }}
          onPointerUp={event => {
            if (event.pointerType === 'touch') return
            finishGesture(event.pointerId)
          }}
          onPointerCancel={event => {
            if (event.pointerType === 'touch') return
            const gesture = gestureRef.current
            if (!gesture || gesture.input !== 'pointer' || gesture.pointerId !== event.pointerId) return
            gesture.cancelled = true
            resetGesture()
          }}
          onLostPointerCapture={event => {
            if (event.pointerType === 'touch') return
            const gesture = gestureRef.current
            if (
              !gesture
              || gesture.input !== 'pointer'
              || gesture.pointerId !== event.pointerId
              || !gesture.dragging
            ) return
            resetGesture()
          }}
        >
          {children}
        </motion.div>
      </div>

      {showSand && sandSnapshot ? (
        <NotificationSandDisintegration
          itemId={item.id}
          snapshot={sandSnapshot}
          onComplete={() => completeDeparture(dismissalAttemptRef.current)}
        />
      ) : showDust ? (
        <div
          data-testid={`notification-disintegration-${item.id}`}
          className="pointer-events-none absolute inset-0 z-[2] overflow-visible"
          aria-hidden="true"
        >
          <motion.span
            data-disintegration-fracture-band
            initial={{ opacity: 0, x: '0%', scaleX: 0.4 }}
            animate={{
              opacity: [0, 1, 0.72, 0.34, 0],
              x: ['0%', '-120%', '-285%', '-430%', '-560%'],
              scaleX: [0.4, 1.2, 0.94, 0.7, 0.35],
            }}
            transition={{ duration: 0.58, times: [0, 0.12, 0.42, 0.74, 1], ease: [0.22, 0.72, 0.24, 1] }}
            className="absolute right-0 top-[2%] h-[96%] w-[18%] origin-right bg-[linear-gradient(90deg,transparent,rgba(215,170,70,0.18),rgba(245,218,143,0.74),rgba(215,170,70,0.2),transparent)]"
          />
          {DISINTEGRATION_FRAGMENTS.map(fragment => (
            <motion.span
              key={`${fragment.left}-${fragment.top}`}
              data-disintegration-fragment
              data-disintegration-wave={fragment.wave}
              initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.45 }}
              animate={{
                opacity: [0, 1, 0.7, 0],
                x: [0, fragment.x * 0.25, fragment.x],
                y: [0, fragment.y * 0.35, fragment.y],
                rotate: fragment.rotate,
                scale: [0.45, 1.15, 0.7, 0],
              }}
              transition={{
                duration: 0.38,
                delay: fragment.delay,
                times: [0, 0.2, 0.72, 1],
                ease: [0.22, 0.72, 0.24, 1],
              }}
              className="absolute rounded-[1px]"
              style={{
                left: `${fragment.left}%`,
                top: `${fragment.top}%`,
                width: fragment.width,
                height: fragment.height,
                backgroundColor: fragment.tone,
                boxShadow: fragment.wave === 0 && fragment.tone === 'var(--theme-accent-readable)'
                  ? '0 0 9px rgba(215,170,70,0.4)'
                  : undefined,
              }}
            />
          ))}
        </div>
      ) : null}
    </motion.div>
  )
}

export function CatchUpView({ currentView, onViewChange, onOpenSource }: CatchUpViewProps) {
  const { user } = useAuth()
  const { effectivePreferences } = useComfortPreferences()
  const userId = user?.id ?? ''
  const [cached] = useState(() => readCatchUpCache(userId))
  const [snapshot, setSnapshot] = useState<CatchUpSnapshot | null>(cached.snapshot)
  const [notificationInbox, setNotificationInbox] = useState<CatchUpItem[]>([])
  const [notificationInboxTotal, setNotificationInboxTotal] = useState(0)
  const [notificationInboxLoading, setNotificationInboxLoading] = useState(true)
  const [notificationInboxError, setNotificationInboxError] = useState<string | null>(null)
  const [clearingNotificationInbox, setClearingNotificationInbox] = useState(false)
  const [loading, setLoading] = useState(!cached.snapshot)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<User | null>(null)
  const [loadingProfileId, setLoadingProfileId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const snapshotRef = useRef(snapshot)
  const fetchedAtRef = useRef(cached.fetchedAt)
  const mountedRef = useRef(true)
  const profileCacheRef = useRef(new Map<string, User>())
  const profileRequestRef = useRef(0)
  const notificationAcknowledgeRef = useRef(new Map<string, Promise<boolean>>())
  const activeHorizontalSwipeRef = useRef<string | null>(null)

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    setAnnouncement(refresh ? 'Refreshing Catch-Up.' : 'Loading Catch-Up.')
    try {
      const next = await fetchCatchUpSnapshot()
      if (!mountedRef.current) return
      const fetchedAt = Date.now()
      fetchedAtRef.current = fetchedAt
      setSnapshot(next)
      writeCatchUpCache(userId, next, {
        fetchedAt,
        scrollTop: refresh ? scrollRef.current?.scrollTop ?? 0 : 0,
      })
      setAnnouncement('Catch-Up is current.')
    } catch {
      if (!mountedRef.current) return
      setError('Catch-Up is temporarily unavailable.')
      setAnnouncement('Catch-Up refresh failed.')
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [userId])

  const loadNotificationInbox = useCallback(async () => {
    setNotificationInboxLoading(true)
    setNotificationInboxError(null)
    try {
      const retry = await flushPendingNotificationReads(userId)
      const page = await fetchNotificationInbox()
      const unreadRetryIds = retry.failed.length > 0
        ? await findUnreadNotificationEventIds(retry.failed)
        : []
      if (mountedRef.current) {
        setNotificationInbox(page.items)
        setNotificationInboxTotal(page.totalCount)
        const unreadRetryIdSet = new Set(unreadRetryIds)
        const visibleEventIds = new Set(page.items.flatMap(item => item.notificationEventIds ?? []))
        const visibleRetryFailures = unreadRetryIds.filter(eventId => visibleEventIds.has(eventId))
        retry.failed
          .filter(eventId => !unreadRetryIdSet.has(eventId))
          .forEach(eventId => clearPendingNotificationRead(userId, eventId))
        if (visibleRetryFailures.length > 0) {
          setNotificationInboxError('A previously dismissed notification is still syncing. Swipe it again or refresh to retry.')
        }
      }
    } catch {
      if (mountedRef.current) setNotificationInboxError('Notification inbox could not refresh.')
    } finally {
      if (mountedRef.current) setNotificationInboxLoading(false)
    }
  }, [userId])

  const setHorizontalSwipeLock = useCallback((itemId: string, locked: boolean) => {
    if (locked) activeHorizontalSwipeRef.current = itemId
    else if (activeHorizontalSwipeRef.current === itemId) activeHorizontalSwipeRef.current = null
    scrollRef.current?.setAttribute(
      'data-horizontal-swipe-locked',
      activeHorizontalSwipeRef.current ? 'true' : 'false'
    )
  }, [])

  useEffect(() => {
    if (!cached.snapshot) void load()
    else if (Date.now() - cached.fetchedAt >= CACHE_TTL_MS) void load(true)
    void loadNotificationInbox()
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current && cached.scrollTop > 0) scrollRef.current.scrollTop = cached.scrollTop
      if (cached.focusItemId && typeof CSS !== 'undefined') {
        const selector = `[data-catch-up-item-id="${CSS.escape(cached.focusItemId)}"]`
        scrollRef.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
        writeCatchUpCache(userId, snapshotRef.current, { focusItemId: null })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [cached, load, loadNotificationInbox, userId])

  useEffect(() => {
    mountedRef.current = true
    const scrollElement = scrollRef.current
    const preventVerticalScrollDuringSwipe = (event: TouchEvent) => {
      if (!activeHorizontalSwipeRef.current || !event.cancelable) return
      event.preventDefault()
    }
    scrollElement?.addEventListener('touchmove', preventVerticalScrollDuringSwipe, { passive: false })
    return () => {
      mountedRef.current = false
      activeHorizontalSwipeRef.current = null
      scrollElement?.removeEventListener('touchmove', preventVerticalScrollDuringSwipe)
      if (scrollElement) {
        scrollElement.setAttribute('data-horizontal-swipe-locked', 'false')
        writeCatchUpCache(userId, snapshotRef.current, {
          scrollTop: scrollElement.scrollTop,
          fetchedAt: fetchedAtRef.current,
        })
      }
    }
  }, [userId])

  const sections = useMemo(
    () => snapshot ? CATCH_UP_SECTION_ORDER.map(id => snapshot.sections[id]) : [],
    [snapshot]
  )
  const totalCount = sections.reduce((sum, section) => sum + section.totalCount, 0)
  const hasOlderUnread = sections.some(section => section.olderUnreadExists)
  const hasNotificationInboxItems = notificationInbox.length > 0

  const openProfile = async (profileId: string) => {
    const cachedProfile = profileCacheRef.current.get(profileId)
    if (cachedProfile) {
      setProfileError(null)
      setSelectedProfile(cachedProfile)
      return
    }

    const requestId = profileRequestRef.current + 1
    profileRequestRef.current = requestId
    setLoadingProfileId(profileId)
    setProfileError(null)

    try {
      const profile = await getUserProfile(profileId)
      if (requestId !== profileRequestRef.current) return
      if (!profile) throw new Error('This profile is no longer available.')
      profileCacheRef.current.set(profileId, profile)
      setSelectedProfile(profile)
    } catch (caught) {
      if (requestId !== profileRequestRef.current) return
      setProfileError(caught instanceof Error ? caught.message : 'Unable to open this profile.')
    } finally {
      if (requestId === profileRequestRef.current) setLoadingProfileId(null)
    }
  }

  const openItem = (item: CatchUpItem) => {
    if (snapshot) {
      const scrollTop = scrollRef.current?.scrollTop ?? 0
      writeCatchUpCache(userId, snapshot, {
        scrollTop,
        fetchedAt: fetchedAtRef.current,
        focusItemId: item.id,
      })
      onOpenSource(item)
      if (item.activityEventIds.length === 0) return

      const next = removeOpenedActivityItem(snapshot, item)
      void acknowledgeCatchUpEvents(item.activityEventIds).then(() => {
        writeCatchUpCache(userId, next, {
          scrollTop,
          fetchedAt: fetchedAtRef.current,
          focusItemId: item.id,
        })
        if (mountedRef.current) setSnapshot(next)
      }).catch(() => {
        if (mountedRef.current) setError('The source opened, but its Catch-Up status could not be updated. Refresh to try again.')
      })
      return
    }
    onOpenSource(item)
  }

  const acknowledgeNotificationItem = (item: CatchUpItem, openSource: boolean): Promise<boolean> => {
    const eventId = item.notificationEventIds?.[0]
    if (!eventId || !userId) {
      return Promise.reject(new Error('This notification does not have a readable event.'))
    }

    const currentRequest = notificationAcknowledgeRef.current.get(eventId)
    if (currentRequest) return currentRequest

    queuePendingNotificationRead(userId, eventId)
    const request = acknowledgeNotificationInboxEvent(eventId)
      .then(() => {
        clearPendingNotificationRead(userId, eventId)
        clearCatchUpCache()
        void clearNotificationEventFromSystemTray({
          notificationType: item.kind,
          eventId,
        })
        requestAppBadgeRefresh()
        return true
      })
      .catch(caught => {
        if (mountedRef.current) {
          setNotificationInboxError(
            openSource
              ? 'The source opened, but this notification could not be cleared. It will retry automatically.'
              : 'This notification could not be marked as read. It stayed in your inbox and will retry automatically.'
          )
        }
        throw caught
      })
      .finally(() => {
        notificationAcknowledgeRef.current.delete(eventId)
      })

    notificationAcknowledgeRef.current.set(eventId, request)
    return request
  }

  const openNotificationItem = async (item: CatchUpItem) => {
    setAnnouncement(`Opening and clearing ${item.title}.`)
    try {
      await acknowledgeNotificationItem(item, true)
      if (mountedRef.current) {
        setNotificationInbox(current => current.filter(candidate => candidate.id !== item.id))
        setNotificationInboxTotal(current => Math.max(0, current - 1))
        setAnnouncement(`${item.title} marked as read.`)
      }
    } catch {
      // Opening the exact source remains available even if acknowledgement must retry later.
    } finally {
      onOpenSource(item)
    }
  }

  const beginNotificationDismissal = (item: CatchUpItem): Promise<boolean> => {
    setAnnouncement(`Marking ${item.title} as read.`)
    return acknowledgeNotificationItem(item, false).then(() => {
      if (mountedRef.current) setAnnouncement(`${item.title} marked as read.`)
      return true
    }).catch(caught => {
      if (mountedRef.current) setAnnouncement(`${item.title} could not be marked as read and was restored.`)
      throw caught
    })
  }

  const finishNotificationDismissal = (item: CatchUpItem) => {
    setNotificationInbox(current => current.filter(candidate => candidate.id !== item.id))
    setNotificationInboxTotal(current => Math.max(0, current - 1))
  }

  const clearNotificationInbox = async () => {
    if (clearingNotificationInbox || notificationInboxTotal <= 0) return
    const confirmed = window.confirm(
      `Mark all ${notificationInboxTotal.toLocaleString()} notifications as read? This will not delete messages, Pins, games, or Live rooms.`
    )
    if (!confirmed) return

    setClearingNotificationInbox(true)
    setNotificationInboxError(null)
    setAnnouncement('Marking every notification as read.')
    try {
      const cleared = await acknowledgeAllNotificationInboxEvents()
      clearCatchUpCache()
      await clearAllNotificationsFromSystemTray()
      requestAppBadgeRefresh()
      if (!mountedRef.current) return
      setNotificationInbox([])
      setNotificationInboxTotal(0)
      await load(true)
      if (mountedRef.current) {
        setAnnouncement(`${cleared.toLocaleString()} notifications marked as read.`)
      }
    } catch {
      if (mountedRef.current) {
        setNotificationInboxError('The notification inbox could not be cleared. Nothing was hidden; refresh and try again.')
        setAnnouncement('Notification inbox could not be cleared.')
      }
    } finally {
      if (mountedRef.current) setClearingNotificationInbox(false)
    }
  }

  const refreshAll = () => {
    void Promise.all([load(true), loadNotificationInbox()])
  }

  return (
    <div className="theme-app-surface flex h-full min-h-0 flex-col pb-[calc(env(safe-area-inset-bottom)+4.2rem)] text-sm md:pb-0" data-testid="catch-up-view">
      <MobileAppHeader currentView={currentView} onViewChange={onViewChange} title="Catch-Up" logo className="hidden md:flex" />

      <div ref={scrollRef} role="region" aria-label="Catch-Up content" data-horizontal-swipe-locked="false" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:pt-6">
        <div className="mx-auto w-full max-w-4xl">
          <header className="border-b border-[var(--border-subtle)] px-1 pb-4" data-testid="catch-up-compact-header">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent-readable)]">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Source-linked / No AI
                </span>
                <h1 className="mt-0.5 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">Your Catch-Up</h1>
                <p className="mt-1 max-w-xl text-sm leading-5 text-[var(--text-muted)]">Your notification inbox, unread conversations, new Chat roots, and ShadowPin posts - each linked to its exact source.</p>
                {snapshot && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <Check className="h-3.5 w-3.5 text-[var(--theme-accent-readable)]" aria-hidden="true" />
                    Through {new Date(snapshot.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} / {snapshot.lookbackHours / 24}-day activity window
                  </p>
                )}
              </div>
              <button type="button" onClick={refreshAll} disabled={loading || refreshing} aria-label="Refresh Catch-Up" aria-busy={refreshing || notificationInboxLoading} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] text-[var(--theme-accent-readable)] transition-colors hover:border-[var(--border-glow)] hover:bg-[var(--theme-accent-soft)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]">
                <RefreshCw className={`h-4 w-4 ${refreshing || notificationInboxLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
            </div>
          </header>

          {loading && !snapshot ? (
            <div className="grid min-h-72 place-items-center" role="status"><span className="flex items-center gap-3 text-[var(--text-muted)]"><Loader2 className="h-5 w-5 animate-spin" />Building your source snapshot...</span></div>
          ) : error && !snapshot ? (
            <div className="mt-5 rounded-[var(--radius-xl)] border border-red-300/20 bg-red-950/10 p-6 text-center" role="alert">
              <AlertCircle className="mx-auto h-8 w-8 text-red-200" aria-hidden="true" />
              <h2 className="mt-3 font-semibold text-[var(--text-primary)]">Catch-Up could not load</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">{error}</p>
              <Button type="button" variant="secondary" className="mt-4" onClick={() => void load()}>Try again</Button>
            </div>
          ) : snapshot && totalCount === 0 && !hasOlderUnread && !hasNotificationInboxItems && !notificationInboxLoading && !notificationInboxError ? (
            <div className="mt-5 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-8 text-center">
              <Sparkles className="mx-auto h-9 w-9 text-[var(--theme-accent-readable)]" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">You are caught up</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">No current source-linked updates are waiting in this seven-day window.</p>
            </div>
          ) : snapshot ? (
            <div className="mt-5 space-y-6">
              {profileError && (
                <p role="alert" className="rounded-[var(--radius-md)] border border-red-300/20 bg-red-950/15 px-4 py-3 text-sm text-red-100">
                  {profileError}
                </p>
              )}
              {hasNotificationInboxItems && (
                <section aria-labelledby="catch-up-notification-inbox">
                  <div className="mb-3 flex items-end justify-between gap-3 px-1">
                    <div className="min-w-0">
                      <h2 id="catch-up-notification-inbox" className="flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
                        <Inbox className="h-5 w-5 text-[var(--theme-accent-readable)]" />
                        Notification inbox
                      </h2>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Showing {notificationInbox.length.toLocaleString()} of {notificationInboxTotal.toLocaleString()} unread notifications. Open or swipe one to clear it permanently.
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                        {notificationInboxTotal > 999 ? '999+' : notificationInboxTotal}
                      </span>
                      <button
                        type="button"
                        onClick={() => void clearNotificationInbox()}
                        disabled={clearingNotificationInbox}
                        aria-label={`Mark all ${notificationInboxTotal.toLocaleString()} notifications as read`}
                        className="min-h-9 rounded-full border border-[var(--border-glow)] bg-[var(--theme-accent-soft)] px-3 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--theme-accent-readable)] transition-colors hover:bg-[var(--theme-accent-soft-strong)] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]"
                      >
                        {clearingNotificationInbox ? 'Clearing...' : 'Mark all read'}
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {notificationInbox.map(item => (
                      <SwipeToReadNotification
                        key={item.id}
                        item={item}
                        motionPreference={effectivePreferences.motion}
                        onReadStart={() => beginNotificationDismissal(item)}
                        onDismissComplete={() => finishNotificationDismissal(item)}
                        onHorizontalSwipeLockChange={setHorizontalSwipeLock}
                      >
                        <CatchUpCard
                          item={item}
                          onOpen={() => void openNotificationItem(item)}
                          onOpenProfile={profileId => void openProfile(profileId)}
                          profileLoading={loadingProfileId === item.actor?.id}
                        />
                      </SwipeToReadNotification>
                    ))}
                  </div>
                </section>
              )}
              {sections.filter(section => section.totalCount > 0).map(section => (
                <section key={section.id} aria-labelledby={`catch-up-${section.id}`}>
                  <div className="mb-3 flex items-end justify-between gap-3 px-1">
                    <div>
                      <h2 id={`catch-up-${section.id}`} className="flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
                        {section.id === 'direct_messages' ? <Users className="h-5 w-5 text-[var(--theme-accent-readable)]" /> : section.id === 'general_chat' ? <MessageCircle className="h-5 w-5 text-[var(--theme-accent-readable)]" /> : <Inbox className="h-5 w-5 text-[var(--theme-accent-readable)]" />}
                        {section.title}
                      </h2>
                      {(section.hasMore || section.olderUnreadExists) && <p className="mt-1 text-xs text-[var(--text-muted)]">Showing {section.shownCount} of {section.totalCount}{section.olderUnreadExists ? ' / older unread sources also exist' : ''}</p>}
                    </div>
                    <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">{section.totalCount}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {section.items.map(item => (
                      <CatchUpCard
                        key={item.id}
                        item={item}
                        onOpen={() => openItem(item)}
                        onOpenProfile={profileId => void openProfile(profileId)}
                        profileLoading={loadingProfileId === item.actor?.id}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {totalCount === 0 && hasOlderUnread && (
                <section className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-6 text-center" aria-labelledby="catch-up-older-title">
                  <Inbox className="mx-auto h-8 w-8 text-[var(--theme-accent-readable)]" aria-hidden="true" />
                  <h2 id="catch-up-older-title" className="mt-3 text-lg font-bold text-[var(--text-primary)]">Older unread sources are waiting</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">Nothing new is inside this seven-day activity snapshot. Open the original surface to review older unread items.</p>
                </section>
              )}
            </div>
          ) : null}

          {error && snapshot && <p className="mt-4 text-center text-xs text-red-200" role="status">Refresh failed; the last source snapshot is still shown.</p>}
          {notificationInboxError && <p className="mt-4 text-center text-xs text-red-200" role="status">{notificationInboxError}</p>}
          <p className="sr-only" aria-live="polite">{announcement}</p>
        </div>
      </div>

      {selectedProfile && (
        <Suspense fallback={null}>
          <PublicProfileDialog
            user={selectedProfile}
            open
            onClose={() => setSelectedProfile(null)}
          />
        </Suspense>
      )}
    </div>
  )
}
