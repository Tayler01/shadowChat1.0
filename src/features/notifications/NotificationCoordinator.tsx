/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  Bell,
  Gamepad2,
  Images,
  MessageCircle,
  RadioTower,
  UserRoundPlus,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import {
  APP_BADGE_REFRESH_EVENT,
  refreshAppBadgeState,
  requestAppBadgeRefresh,
} from '../../lib/appBadge'
import { createRealtimeChannelName } from '../../lib/realtimeChannelName'
import { getRealtimeClient, getWorkingClient } from '../../lib/supabase'
import {
  clearNotificationEventFromSystemTray,
  claimNotificationEvent,
  fetchForegroundNotificationEvents,
  fetchNotificationCoordinatorPreferences,
  markNotificationEventRead,
} from './notificationApi'
import {
  buildNotificationPresentation,
  getNotificationEventMediaIds,
  isNotificationPresentationCandidate,
  isNotificationSourceActive,
  isNotificationTypeEnabled,
  type NotificationCoordinatorPreferences,
  type NotificationEventRecord,
  type NotificationPresentation,
} from './notificationModel'
import {
  dispatchConnectionsChanged,
  getConnectionNotificationTargetUserId,
  isConnectionNotificationType,
} from '../connections/connectionModel'

const PRESENTATION_DURATION_MS = 5_000
const PREFERENCES_REFRESH_MS = 30_000
const MAX_QUEUED_PRESENTATIONS = 4

interface NotificationCoordinatorContextValue {
  dismissAll: () => void
  refreshBadgeState: () => Promise<void>
}

const NotificationCoordinatorContext =
  createContext<NotificationCoordinatorContextValue | null>(null)

const removeRealtimeChannel = (channel: RealtimeChannel | null) => {
  if (!channel) return
  const client = getRealtimeClient()
  try {
    client?.removeChannel?.(channel)
  } catch {
    // A closing or already-removed channel needs no further cleanup.
  }
}

const openNotificationRoute = (route: string) => {
  const url = new URL(route, window.location.origin)
  if (url.origin !== window.location.origin) return
  window.history.pushState(
    { ...(window.history.state ?? {}), shadowchatLayer: 'notification-result' },
    '',
    url,
  )
  window.dispatchEvent(new PopStateEvent('popstate', {
    state: window.history.state,
  }))
}

const getPresentationIcon = (type: string) => {
  if (type === 'dm_message') return Users
  if (type === 'group_message' || type === 'mention' || type === 'reply' || type === 'reaction' || type === 'hype_event') {
    return MessageCircle
  }
  if (type.startsWith('shadow_pin_')) return Images
  if (type.startsWith('connection_')) return UserRoundPlus
  if (type === 'presence_active') return RadioTower
  if (type.startsWith('shado_live_')) return RadioTower
  if (type === 'shadow_checkers_turn') return Gamepad2
  return Bell
}

function NotificationTray({
  presentation,
  desktop,
  onDismiss,
  onOpen,
}: {
  presentation: NotificationPresentation | null
  desktop: boolean
  onDismiss: (eventId: string) => void
  onOpen: (presentation: NotificationPresentation) => void
}) {
  const deadlineRef = useRef(0)

  useEffect(() => {
    if (!presentation) return

    const eventId = presentation.event.id
    deadlineRef.current = Date.now() + PRESENTATION_DURATION_MS
    const dismissIfDue = () => {
      if (Date.now() >= deadlineRef.current) onDismiss(eventId)
    }
    const timerId = window.setTimeout(dismissIfDue, PRESENTATION_DURATION_MS)
    const intervalId = window.setInterval(dismissIfDue, 500)
    window.addEventListener('focus', dismissIfDue)
    window.addEventListener('pageshow', dismissIfDue)
    document.addEventListener('visibilitychange', dismissIfDue)

    return () => {
      window.clearTimeout(timerId)
      window.clearInterval(intervalId)
      window.removeEventListener('focus', dismissIfDue)
      window.removeEventListener('pageshow', dismissIfDue)
      document.removeEventListener('visibilitychange', dismissIfDue)
    }
  }, [onDismiss, presentation])

  if (!presentation) return null
  const Icon = getPresentationIcon(presentation.event.type)
  const initial = (presentation.actorLabel ?? presentation.title).charAt(0).toUpperCase()

  return (
    <div
      className={`pointer-events-none fixed z-[10050] ${
        desktop
          ? 'right-5 top-5 w-[22rem]'
          : 'left-4 right-4 top-[var(--shadowchat-toast-top,calc(env(safe-area-inset-top)+4.5rem))]'
      }`}
      aria-live="polite"
      aria-atomic="true"
      data-testid="notification-coordinator-tray"
    >
      <div className="popup-surface pointer-events-auto mx-auto flex w-full max-w-[24rem] items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-panel)] p-3 text-left shadow-[var(--shadow-panel-strong)]">
        <button
          type="button"
          onClick={() => onOpen(presentation)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-label={`${presentation.title}. Open notification.`}
        >
          <span className="relative mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] text-sm font-semibold text-[var(--theme-accent-readable)]">
            {presentation.avatarUrl ? (
              <img
                src={presentation.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
            <span className="absolute bottom-[-0.1rem] right-[-0.1rem] inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg-panel-strong)] text-[var(--theme-accent-readable)]">
              <Icon className="h-3 w-3" aria-hidden="true" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-5 text-[var(--text-primary)]">
              {presentation.title}
            </span>
            {presentation.body && (
              <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-[var(--text-secondary)]">
                {presentation.body}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onDismiss(presentation.event.id)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-panel-hover)] hover:text-[var(--text-primary)]"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function NotificationCoordinatorProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const isDesktop = useIsDesktop()
  const [queue, setQueue] = useState<NotificationPresentation[]>([])
  const preferencesRef = useRef<NotificationCoordinatorPreferences | null>(null)
  const preferencesLoadedAtRef = useRef(0)
  const preferencesRequestRef = useRef<Promise<NotificationCoordinatorPreferences> | null>(null)
  const visibleSinceRef = useRef<number | null>(
    typeof document !== 'undefined' && document.visibilityState === 'visible'
      ? Date.now()
      : null,
  )
  const handledEventIdsRef = useRef(new Set<string>())

  const dismissAll = useCallback(() => setQueue([]), [])

  const dismissEvent = useCallback((eventId: string) => {
    const now = Date.now()
    setQueue(current => current
      .filter(item => item.event.id !== eventId)
      .filter(item => Date.parse(item.event.presentation_expires_at) > now))
  }, [])

  const refreshBadgeState = useCallback(async () => {
    await refreshAppBadgeState()
  }, [])

  const refreshPreferences = useCallback(async (force = false) => {
    if (!user?.id) throw new Error('Authentication required')
    if (
      !force &&
      preferencesRef.current &&
      Date.now() - preferencesLoadedAtRef.current < PREFERENCES_REFRESH_MS
    ) {
      return preferencesRef.current
    }
    if (preferencesRequestRef.current) return preferencesRequestRef.current

    preferencesRequestRef.current = fetchNotificationCoordinatorPreferences(user.id)
      .then(preferences => {
        preferencesRef.current = preferences
        preferencesLoadedAtRef.current = Date.now()
        return preferences
      })
      .finally(() => {
        preferencesRequestRef.current = null
      })
    return preferencesRequestRef.current
  }, [user?.id])

  const enqueuePresentation = useCallback((presentation: NotificationPresentation) => {
    setQueue(current => {
      if (current.some(item => item.event.id === presentation.event.id)) return current
      const unexpired = current.filter(
        item => Date.parse(item.event.presentation_expires_at) > Date.now(),
      )
      return [...unexpired, presentation].slice(0, MAX_QUEUED_PRESENTATIONS)
    })
  }, [])

  const handleEvent = useCallback(async (event: NotificationEventRecord) => {
    if (!user?.id || event.user_id !== user.id) return

    requestAppBadgeRefresh()
    if (isConnectionNotificationType(event.type)) {
      dispatchConnectionsChanged({
        targetUserId: getConnectionNotificationTargetUserId(event.payload),
        source: 'notification',
      })
    }

    const visibleSince = visibleSinceRef.current
    if (
      visibleSince === null ||
      document.visibilityState !== 'visible' ||
      handledEventIdsRef.current.has(event.id) ||
      !isNotificationPresentationCandidate(event, visibleSince)
    ) {
      return
    }

    handledEventIdsRef.current.add(event.id)
    try {
      const preferences = await refreshPreferences(true)
      if (!isNotificationTypeEnabled(event, preferences)) return
      const claimed = await claimNotificationEvent(event.id)
      if (!claimed || document.visibilityState !== 'visible') return

      const presentation = buildNotificationPresentation(event)
      if (isNotificationSourceActive(presentation.route, window.location.href)) return
      enqueuePresentation(presentation)
      if (presentation.autoRead) {
        await markNotificationEventRead(event.id)
        requestAppBadgeRefresh()
      }
    } catch {
      handledEventIdsRef.current.delete(event.id)
    }
  }, [enqueuePresentation, refreshPreferences, user?.id])

  const recoverVisibleEvents = useCallback(async () => {
    const visibleSince = visibleSinceRef.current
    if (!user?.id || visibleSince === null || document.visibilityState !== 'visible') return
    try {
      const events = await fetchForegroundNotificationEvents(user.id, visibleSince)
      for (const event of events) await handleEvent(event)
    } catch {
      // The live subscription or next visibility recovery retries safely.
    }
  }, [handleEvent, user?.id])

  const openPresentation = useCallback((presentation: NotificationPresentation) => {
    dismissEvent(presentation.event.id)
    const media = getNotificationEventMediaIds(presentation.event)
    void Promise.allSettled([
      markNotificationEventRead(presentation.event.id),
      clearNotificationEventFromSystemTray({
        notificationType: presentation.event.type,
        eventId: presentation.event.id,
        conversationId: presentation.event.conversation_id,
        messageId: presentation.event.dm_message_id ?? presentation.event.message_id,
        ...media,
      }),
    ]).finally(() => requestAppBadgeRefresh())
    openNotificationRoute(presentation.route)
  }, [dismissEvent])

  useEffect(() => {
    preferencesRef.current = null
    preferencesLoadedAtRef.current = 0
    preferencesRequestRef.current = null
    handledEventIdsRef.current.clear()
    setQueue([])
    visibleSinceRef.current = document.visibilityState === 'visible' ? Date.now() : null
    if (!user?.id) return
    void refreshPreferences(true).catch(() => undefined)
    void refreshBadgeState()
  }, [refreshBadgeState, refreshPreferences, user?.id])

  useEffect(() => {
    if (!user?.id) return
    let disposed = false
    let channel: RealtimeChannel | null = null
    let reconnectTimer: number | null = null

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        if (!disposed) void subscribe()
      }, 1_500)
    }

    const subscribe = async () => {
      try {
        const client = await getWorkingClient()
        if (disposed) return
        const prior = channel
        channel = null
        if (prior) await client.removeChannel(prior).catch(() => undefined)

        const next = client
          .channel(createRealtimeChannelName(`notification_coordinator:${user.id}`))
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notification_events',
              filter: `user_id=eq.${user.id}`,
            },
            (payload: { new: unknown }) => {
              void handleEvent(payload.new as NotificationEventRecord)
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'notification_events',
              filter: `user_id=eq.${user.id}`,
            },
            () => {
              requestAppBadgeRefresh()
            },
          )
          .subscribe((status: string) => {
            if (disposed || channel !== next) return
            if (status === 'SUBSCRIBED') {
              void recoverVisibleEvents()
              return
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              scheduleReconnect()
            }
          })
        channel = next
      } catch {
        scheduleReconnect()
      }
    }

    void subscribe()
    return () => {
      disposed = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      removeRealtimeChannel(channel)
    }
  }, [handleEvent, recoverVisibleEvents, user?.id])

  useEffect(() => {
    const beginVisibleSession = () => {
      if (document.visibilityState !== 'visible') return
      if (visibleSinceRef.current === null) visibleSinceRef.current = Date.now()
      void refreshPreferences(true).catch(() => undefined)
      void refreshBadgeState()
      void recoverVisibleEvents()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        visibleSinceRef.current = null
        dismissAll()
        return
      }
      beginVisibleSession()
    }
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        visibleSinceRef.current = Date.now()
        dismissAll()
      }
      beginVisibleSession()
    }
    const handleBadgeRequest = () => {
      if (document.visibilityState === 'visible') void refreshBadgeState()
    }

    window.addEventListener('focus', beginVisibleSession)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener(APP_BADGE_REFRESH_EVENT, handleBadgeRequest)
    document.addEventListener('visibilitychange', handleVisibility)
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshBadgeState()
    }, 30_000)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', beginVisibleSession)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener(APP_BADGE_REFRESH_EVENT, handleBadgeRequest)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [
    dismissAll,
    recoverVisibleEvents,
    refreshBadgeState,
    refreshPreferences,
  ])

  const contextValue: NotificationCoordinatorContextValue = {
    dismissAll,
    refreshBadgeState,
  }

  return (
    <NotificationCoordinatorContext.Provider value={contextValue}>
      {children}
      <NotificationTray
        presentation={queue[0] ?? null}
        desktop={isDesktop}
        onDismiss={dismissEvent}
        onOpen={openPresentation}
      />
    </NotificationCoordinatorContext.Provider>
  )
}

export function useNotificationCoordinator() {
  const context = useContext(NotificationCoordinatorContext)
  if (!context) {
    throw new Error('useNotificationCoordinator must be used inside NotificationCoordinatorProvider')
  }
  return context
}
