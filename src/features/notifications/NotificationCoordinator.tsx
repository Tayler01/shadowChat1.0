/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useAuth } from '../../hooks/useAuth'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useSoundEffects } from '../../hooks/useSoundEffects'
import { getUserProfile } from '../../lib/auth'
import { updateWebNotificationInstallationForeground } from '../../lib/notificationInstallation'
import {
  APP_BADGE_REFRESH_EVENT,
  refreshAppBadgeState,
  requestAppBadgeRefresh,
} from '../../lib/appBadge'
import { createRealtimeChannelName } from '../../lib/realtimeChannelName'
import {
  getRealtimeClient,
  getWorkingClient,
  type User,
} from '../../lib/supabase'
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
import { NotificationBannerV2 } from './NotificationBannerV2'
import {
  buildNotificationEnvelopeV2,
  getNotificationTypePolicyV2,
  type NotificationEnvelopeV2,
} from './notificationEnvelopeV2'
import {
  dispatchConnectionsChanged,
  getConnectionNotificationTargetUserId,
  isConnectionNotificationType,
} from '../connections/connectionModel'

const PREFERENCES_REFRESH_MS = 30_000
const MAX_QUEUED_PRESENTATIONS = 4
const GROUP_WINDOW_MS = 4_000

const PublicProfileDialog = lazy(() =>
  import('../../components/profile/PublicProfileDialog').then(module => ({
    default: module.PublicProfileDialog,
  }))
)

interface QueuedNotificationPresentation {
  presentation: NotificationPresentation
  envelope: NotificationEnvelopeV2
}

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

export function NotificationCoordinatorProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const isDesktop = useIsDesktop()
  const { playNotificationCue } = useSoundEffects()
  const [queue, setQueue] = useState<QueuedNotificationPresentation[]>([])
  const [selectedProfile, setSelectedProfile] = useState<User | null>(null)
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
      .filter(item => !item.envelope.eventIds.includes(eventId))
      .filter(item => Date.parse(item.envelope.expiresAt) > now))
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

  const enqueuePresentation = useCallback((item: QueuedNotificationPresentation) => {
    setQueue(current => {
      if (current.some(queued => queued.envelope.eventIds.includes(item.envelope.eventId))) {
        return current
      }
      const unexpired = current.filter(
        queued => Date.parse(queued.envelope.expiresAt) > Date.now(),
      )
      const groupedIndex = unexpired.findIndex(queued => (
        queued.envelope.groupKey === item.envelope.groupKey &&
        Math.abs(
          Date.parse(queued.envelope.createdAt) -
          Date.parse(item.envelope.createdAt),
        ) <= GROUP_WINDOW_MS
      ))
      if (groupedIndex >= 0) {
        const existing = unexpired[groupedIndex]
        const eventIds = [...new Set([
          ...existing.envelope.eventIds,
          ...item.envelope.eventIds,
        ])]
        const count = eventIds.length
        const groupedTitle = item.envelope.category === 'dm' && item.envelope.actor
          ? `${count} new messages from ${item.envelope.actor.label}`
          : item.envelope.category === 'shadow_pin'
            ? `${count} new ShadowPin updates`
            : item.envelope.category === 'general_chat'
              ? `${count} new General Chat messages`
              : `${count} new updates`
        const next = [...unexpired]
        next[groupedIndex] = {
          presentation: item.presentation,
          envelope: {
            ...item.envelope,
            eventIds,
            content: {
              ...item.envelope.content,
              title: groupedTitle,
            },
          },
        }
        return next
      }

      const next = [...unexpired, item]
      return next
        .sort((left, right) => {
          const rank = { urgent: 3, high: 2, normal: 1, ambient: 0 }
          return (
            rank[right.envelope.priority] - rank[left.envelope.priority] ||
            Date.parse(left.envelope.createdAt) - Date.parse(right.envelope.createdAt)
          )
        })
        .slice(0, MAX_QUEUED_PRESENTATIONS)
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
      const envelope = buildNotificationEnvelopeV2(event, presentation, {
        previewMode: preferences.notification_preview_mode,
        mediaEnabled: preferences.notification_media_enabled,
        soundId: preferences.notification_event_sound_map?.[event.type] ??
          preferences.notification_sound_map?.[
          getNotificationTypePolicyV2(event.type).category
        ],
      })
      enqueuePresentation({ presentation, envelope })
      if (preferences.notification_foreground_sounds_enabled !== false) {
        playNotificationCue(envelope.soundId)
      }
      if (presentation.autoRead) {
        await markNotificationEventRead(event.id)
        requestAppBadgeRefresh()
      }
    } catch {
      handledEventIdsRef.current.delete(event.id)
    }
  }, [enqueuePresentation, playNotificationCue, refreshPreferences, user?.id])

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

  const openPresentation = useCallback((envelope: NotificationEnvelopeV2) => {
    const queued = queue.find(item => item.envelope.eventIds.includes(envelope.eventId))
    if (!queued) return
    dismissEvent(envelope.eventId)
    const media = getNotificationEventMediaIds(queued.presentation.event)
    void Promise.allSettled(envelope.eventIds.flatMap(eventId => [
      markNotificationEventRead(eventId),
      clearNotificationEventFromSystemTray({
        notificationType: queued.presentation.event.type,
        eventId,
        conversationId: queued.presentation.event.conversation_id,
        messageId: (
          queued.presentation.event.dm_message_id ??
          queued.presentation.event.message_id
        ),
        ...media,
      }),
    ])).finally(() => requestAppBadgeRefresh())
    openNotificationRoute(envelope.route)
  }, [dismissEvent, queue])

  const openProfile = useCallback(async (profileId: string) => {
    try {
      const profile = await getUserProfile(profileId)
      if (profile) setSelectedProfile(profile)
    } catch {
      // The notification remains usable even if the current profile is unavailable.
    }
  }, [])

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
      void updateWebNotificationInstallationForeground(true).catch(() => undefined)
      void refreshPreferences(true).catch(() => undefined)
      void refreshBadgeState()
      void recoverVisibleEvents()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        visibleSinceRef.current = null
        dismissAll()
        void updateWebNotificationInstallationForeground(false).catch(() => undefined)
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
      if (document.visibilityState === 'visible') {
        void refreshBadgeState()
        void updateWebNotificationInstallationForeground(true).catch(() => undefined)
      }
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
      {queue[0] && (
        <div
          className={`pointer-events-none fixed z-[10050] ${
            isDesktop
              ? 'right-5 top-5 w-[25rem]'
              : 'left-3 right-3 top-[var(--shadowchat-toast-top,calc(env(safe-area-inset-top)+4.5rem))]'
          }`}
          aria-live="off"
          data-testid="notification-coordinator-tray"
        >
          <NotificationBannerV2
            envelope={queue[0].envelope}
            desktop={isDesktop}
            queuedCount={Math.max(0, queue.length - 1)}
            onDismiss={dismissEvent}
            onOpen={openPresentation}
            onOpenProfile={profileId => void openProfile(profileId)}
          />
        </div>
      )}
      {selectedProfile && (
        <Suspense fallback={null}>
          <PublicProfileDialog
            user={selectedProfile}
            open
            onClose={() => setSelectedProfile(null)}
          />
        </Suspense>
      )}
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
