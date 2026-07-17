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
import { clearNotificationEventFromSystemTray } from '../notifications/notificationApi'
import {
  acknowledgeCatchUpEvents,
  acknowledgeNotificationInboxEvent,
  fetchCatchUpSnapshot,
  fetchNotificationInbox,
} from './catchUpApi'
import {
  CATCH_UP_SECTION_ORDER,
  formatCatchUpTime,
  readCatchUpCache,
  writeCatchUpCache,
  type CatchUpItem,
  type CatchUpSnapshot,
} from './catchUpModel'

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
const SWIPE_VERTICAL_LOCK_PX = 10
const SWIPE_HORIZONTAL_LOCK_RATIO = 1.2
const SWIPE_EXIT_OVERSHOOT_PX = 24

type SwipePhase = 'idle' | 'dragging' | 'settling' | 'dismissing' | 'collapsing'

const DISINTEGRATION_FRAGMENTS = [
  { left: 38, top: 18, size: 2, x: -18, y: -8, rotate: -24, delay: 0 },
  { left: 52, top: 72, size: 3, x: -28, y: 10, rotate: 34, delay: 0.015 },
  { left: 63, top: 35, size: 2, x: -36, y: -13, rotate: -42, delay: 0.03 },
  { left: 72, top: 84, size: 2, x: -24, y: 8, rotate: 28, delay: 0.045 },
  { left: 79, top: 14, size: 3, x: -44, y: -7, rotate: -36, delay: 0.06 },
  { left: 84, top: 58, size: 2, x: -32, y: 13, rotate: 46, delay: 0.075 },
  { left: 89, top: 30, size: 2, x: -52, y: -11, rotate: -52, delay: 0.09 },
  { left: 92, top: 76, size: 3, x: -38, y: 9, rotate: 38, delay: 0.105 },
  { left: 95, top: 46, size: 2, x: -58, y: -4, rotate: -60, delay: 0.12 },
  { left: 97, top: 22, size: 2, x: -46, y: -14, rotate: 54, delay: 0.135 },
] as const

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
  children,
}: {
  item: CatchUpItem
  motionPreference: 'full' | 'reduced' | 'none'
  onReadStart: () => void
  onDismissComplete: () => void
  children: React.ReactNode
}) {
  const [phase, setPhase] = useState<SwipePhase>('idle')
  const x = useMotionValue(0)
  const readActionOpacity = useTransform(x, [-SWIPE_ACTION_WIDTH_PX, -12, 0], [1, 0.2, 0])
  const readActionScale = useTransform(x, [-SWIPE_ACTION_WIDTH_PX, -12, 0], [1, 0.9, 0.82])
  const rootRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const maxTravelRef = useRef(344)
  const phaseRef = useRef<SwipePhase>('idle')
  const settleAnimationRef = useRef<ReturnType<typeof animate> | null>(null)
  const phaseTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const dismissStartedRef = useRef(false)
  const dismissCompletedRef = useRef(false)
  const gestureRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    lastX: number
    lastAt: number
    velocityX: number
    dragging: boolean
    cancelled: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)

  const setSwipePhase = (next: SwipePhase) => {
    phaseRef.current = next
    setPhase(next)
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
    gestureRef.current = null
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

  const beginDismissal = () => {
    if (dismissStartedRef.current) return
    dismissStartedRef.current = true
    suppressClickRef.current = true
    gestureRef.current = null
    setSwipePhase('dismissing')
    onReadStart()
    settleAnimationRef.current?.stop()

    const departureDuration = motionPreference === 'none' ? 0 : motionPreference === 'reduced' ? 0.08 : 0.24
    settleAnimationRef.current = animate(x, -maxTravelRef.current, {
      duration: departureDuration,
      ease: [0.22, 0.72, 0.24, 1],
      onUpdate: latest => {
        offsetRef.current = latest
        surfaceRef.current?.setAttribute('data-swipe-offset', String(Math.round(latest)))
      },
    })
    clearPhaseTimer()
    phaseTimerRef.current = globalThis.setTimeout(
      beginCollapse,
      Math.round(departureDuration * 1_000) + 16
    )
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
    if (distanceCommitted || flickCommitted) {
      beginDismissal()
      return
    }
    resetGesture()
  }

  useEffect(() => () => {
    settleAnimationRef.current?.stop()
    clearPhaseTimer()
  }, [])

  const collapseDuration = motionPreference === 'none' ? 0 : motionPreference === 'reduced' ? 0.09 : 0.19
  const layoutTransition = motionPreference === 'none'
    ? { duration: 0 }
    : motionPreference === 'reduced'
      ? { duration: 0.08 }
      : { type: 'spring' as const, stiffness: 500, damping: 42, mass: 0.55 }
  const isDeparting = phase === 'dismissing' || phase === 'collapsing'
  const showDust = phase === 'dismissing' && motionPreference === 'full'

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
      className={`relative rounded-[var(--radius-lg)] ${phase === 'collapsing' ? 'overflow-hidden' : 'overflow-visible'}`}
    >
      <div className="relative overflow-hidden rounded-[var(--radius-lg)]">
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
          className="absolute inset-0 flex items-center justify-end bg-[linear-gradient(90deg,rgba(201,154,58,0.06),var(--theme-accent-soft))] pr-5 text-[var(--theme-accent-readable)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-focus-ring)] disabled:pointer-events-none"
          aria-label={`Mark ${item.title} as read`}
        >
          <motion.span
            style={{ scale: readActionScale }}
            className="flex flex-col items-center gap-1 text-[0.65rem] font-bold uppercase tracking-[0.1em]"
          >
            <Check className="h-5 w-5" aria-hidden="true" />
            Read
          </motion.span>
        </motion.button>
        <motion.div
          ref={surfaceRef}
          data-testid={`notification-swipe-${item.id}`}
          data-swipe-offset="0"
          style={{
            x,
            touchAction: 'pan-y',
            willChange: phase === 'dragging' || isDeparting ? 'transform' : 'auto',
          }}
          className="relative z-[1] bg-[var(--bg-app)]"
          onClickCapture={event => {
            if (!suppressClickRef.current) return
            event.preventDefault()
            event.stopPropagation()
            if (!isDeparting) suppressClickRef.current = false
          }}
          onPointerDown={event => {
            if (isDeparting || (event.pointerType === 'mouse' && event.button !== 0)) return
            settleAnimationRef.current?.stop()
            clearPhaseTimer()
            const measuredWidth = surfaceRef.current?.getBoundingClientRect().width || 320
            maxTravelRef.current = Math.max(240, measuredWidth + SWIPE_EXIT_OVERSHOOT_PX)
            const now = globalThis.performance?.now?.() ?? Date.now()
            gestureRef.current = {
              pointerId: event.pointerId,
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
            const gesture = gestureRef.current
            if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return
            const deltaX = event.clientX - gesture.startX
            const deltaY = event.clientY - gesture.startY
            if (!gesture.dragging) {
              if (
                Math.abs(deltaY) > SWIPE_VERTICAL_LOCK_PX
                && Math.abs(deltaY) > Math.abs(deltaX) * SWIPE_HORIZONTAL_LOCK_RATIO
              ) {
                gesture.cancelled = true
                updateOffset(0)
                return
              }
              if (
                deltaX >= -8
                || Math.abs(deltaX) <= Math.abs(deltaY) * SWIPE_HORIZONTAL_LOCK_RATIO
              ) return
              gesture.dragging = true
              suppressClickRef.current = true
              setSwipePhase('dragging')
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }

            const now = globalThis.performance?.now?.() ?? Date.now()
            const elapsed = Math.max(1, now - gesture.lastAt)
            const instantaneousVelocity = (event.clientX - gesture.lastX) / elapsed
            gesture.velocityX = (gesture.velocityX * 0.35) + (instantaneousVelocity * 0.65)
            gesture.lastX = event.clientX
            gesture.lastAt = now
            event.preventDefault()
            updateOffset(deltaX)
          }}
          onPointerUp={event => finishGesture(event.pointerId)}
          onPointerCancel={event => {
            const gesture = gestureRef.current
            if (!gesture || gesture.pointerId !== event.pointerId) return
            gesture.cancelled = true
            resetGesture()
          }}
        >
          <motion.div
            animate={isDeparting
              ? { opacity: motionPreference === 'none' ? 0 : 0.12, scale: motionPreference === 'full' ? 0.975 : 1 }
              : { opacity: 1, scale: 1 }}
            transition={{
              duration: motionPreference === 'full' ? 0.22 : motionPreference === 'reduced' ? 0.08 : 0,
              ease: [0.22, 0.72, 0.24, 1],
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      </div>

      {showDust && (
        <div
          data-testid={`notification-disintegration-${item.id}`}
          className="pointer-events-none absolute inset-0 z-[2] overflow-visible"
          aria-hidden="true"
        >
          {DISINTEGRATION_FRAGMENTS.map(fragment => (
            <motion.span
              key={`${fragment.left}-${fragment.top}`}
              initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.7 }}
              animate={{
                opacity: [0, 0.9, 0],
                x: fragment.x,
                y: fragment.y,
                rotate: fragment.rotate,
                scale: [0.7, 1, 0.15],
              }}
              transition={{
                duration: 0.28,
                delay: fragment.delay,
                times: [0, 0.28, 1],
                ease: [0.22, 0.72, 0.24, 1],
              }}
              className="absolute rounded-[1px] bg-[var(--theme-accent-readable)] shadow-[0_0_8px_rgba(215,170,70,0.35)]"
              style={{
                left: `${fragment.left}%`,
                top: `${fragment.top}%`,
                width: fragment.size,
                height: fragment.size,
              }}
            />
          ))}
        </div>
      )}
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
  const [notificationInboxLoading, setNotificationInboxLoading] = useState(true)
  const [notificationInboxError, setNotificationInboxError] = useState<string | null>(null)
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
  const notificationAcknowledgeRef = useRef(new Set<string>())

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
      const items = await fetchNotificationInbox()
      if (mountedRef.current) setNotificationInbox(items)
    } catch {
      if (mountedRef.current) setNotificationInboxError('Notification inbox could not refresh.')
    } finally {
      if (mountedRef.current) setNotificationInboxLoading(false)
    }
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
    return () => {
      mountedRef.current = false
      if (scrollElement) {
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

  const acknowledgeNotificationItem = (item: CatchUpItem, openSource: boolean) => {
    const eventId = item.notificationEventIds?.[0]
    if (!eventId || notificationAcknowledgeRef.current.has(eventId)) return
    notificationAcknowledgeRef.current.add(eventId)
    void acknowledgeNotificationInboxEvent(eventId).then(() => {
      void clearNotificationEventFromSystemTray({
        notificationType: item.kind,
        eventId,
      })
      requestAppBadgeRefresh()
    }).catch(() => {
      notificationAcknowledgeRef.current.delete(eventId)
      if (!mountedRef.current) return
      setNotificationInboxError(
        openSource
          ? 'The source opened, but this notification could not be cleared. Refresh to try again.'
          : 'This notification could not be marked as read. Refresh to try again.'
      )
      void loadNotificationInbox()
    })
  }

  const openNotificationItem = (item: CatchUpItem) => {
    onOpenSource(item)
    setNotificationInbox(current => current.filter(candidate => candidate.id !== item.id))
    acknowledgeNotificationItem(item, true)
  }

  const beginNotificationDismissal = (item: CatchUpItem) => {
    setAnnouncement(`${item.title} marked as read.`)
    acknowledgeNotificationItem(item, false)
  }

  const finishNotificationDismissal = (item: CatchUpItem) => {
    setNotificationInbox(current => current.filter(candidate => candidate.id !== item.id))
  }

  const refreshAll = () => {
    void Promise.all([load(true), loadNotificationInbox()])
  }

  return (
    <div className="theme-app-surface flex h-full min-h-0 flex-col pb-[calc(env(safe-area-inset-bottom)+4.2rem)] text-sm md:pb-0" data-testid="catch-up-view">
      <MobileAppHeader currentView={currentView} onViewChange={onViewChange} title="Catch-Up" logo className="hidden md:flex" />

      <div ref={scrollRef} role="region" aria-label="Catch-Up content" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:pt-6">
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
                    <div>
                      <h2 id="catch-up-notification-inbox" className="flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
                        <Inbox className="h-5 w-5 text-[var(--theme-accent-readable)]" />
                        Notification inbox
                      </h2>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">Every unread app-icon count has a source you can open and clear here.</p>
                    </div>
                    <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">{notificationInbox.length}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {notificationInbox.map(item => (
                      <SwipeToReadNotification
                        key={item.id}
                        item={item}
                        motionPreference={effectivePreferences.motion}
                        onReadStart={() => beginNotificationDismissal(item)}
                        onDismissComplete={() => finishNotificationDismissal(item)}
                      >
                        <CatchUpCard
                          item={item}
                          onOpen={() => openNotificationItem(item)}
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
