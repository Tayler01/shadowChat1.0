import { useCallback, useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { RadioTower } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../../../hooks/useAuth'
import { createRealtimeChannelName } from '../../../../lib/realtimeChannelName'
import { getRealtimeClient, getWorkingClient } from '../../../../lib/supabase'

type ShadoLiveNotificationType =
  | 'room_started'
  | 'room_ended'
  | 'speaker_promoted'
  | 'speaker_demoted'
  | 'participant_muted'
  | 'participant_removed'

type ShadoLiveNotification = {
  notification_id: string
  type: ShadoLiveNotificationType
  room_id: string
  actor: {
    display_name?: string | null
    username?: string | null
  } | null
  body_preview: string
  read_at: string | null
  occurred_at: string
}

const PRESENTATION_WINDOW_MS = 90_000
const notificationTypes = new Set<ShadoLiveNotificationType>([
  'room_started',
  'room_ended',
  'speaker_promoted',
  'speaker_demoted',
  'participant_muted',
  'participant_removed',
])

const openShadoLiveRoom = (roomId: string) => {
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'games')
  url.searchParams.set('experience', 'shado-live')
  url.searchParams.set('item', roomId)
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

const actorLabel = (notification: ShadoLiveNotification) => (
  notification.actor?.display_name?.trim()
  || (notification.actor?.username ? `@${notification.actor.username}` : 'Shado Live')
)

export function ShadoLiveNotificationBridge() {
  const { user } = useAuth()
  const handledRef = useRef(new Set<string>())
  const fetchInFlightRef = useRef(false)

  const markRead = useCallback(async (notificationId: string) => {
    const client = await getWorkingClient()
    const { error } = await client.rpc('mark_my_shado_live_notifications_read', {
      p_notification_ids: [notificationId],
    })
    if (error) throw error
  }, [])

  const present = useCallback((notification: ShadoLiveNotification) => {
    if (
      handledRef.current.has(notification.notification_id)
      || notification.read_at
      || !notificationTypes.has(notification.type)
      || Date.now() - new Date(notification.occurred_at).getTime() > PRESENTATION_WINDOW_MS
    ) return

    handledRef.current.add(notification.notification_id)
    const title = notification.type === 'room_started'
      ? `${actorLabel(notification)} is live now`
      : notification.body_preview || 'Shado Live room update'
    const toastId = toast.custom(currentToast => (
      <button
        type="button"
        onClick={() => {
          void markRead(notification.notification_id).catch(() => undefined)
          openShadoLiveRoom(notification.room_id)
          toast.dismiss(currentToast.id)
        }}
        className={`popup-surface flex max-w-sm items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-panel)] p-3 text-left shadow-[var(--shadow-panel)] transition-[opacity,transform] duration-200 ${
          currentToast.visible
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
        aria-label={`${title}. Open Shado Live.`}
      >
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(215,170,70,0.12)] text-[var(--text-gold)]">
          <RadioTower className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">Tap to open the room.</span>
        </span>
      </button>
    ), { duration: 5000, position: 'top-center' })
    window.setTimeout(() => toast.dismiss(toastId), 5000)
  }, [markRead])

  const fetchUnread = useCallback(async () => {
    if (!user?.id || fetchInFlightRef.current || document.visibilityState !== 'visible') return
    fetchInFlightRef.current = true
    try {
      const client = await getWorkingClient()
      const { data, error } = await client.rpc('list_my_shado_live_notifications', {
        p_limit: 20,
        p_before_occurred_at: null,
        p_before_id: null,
      })
      if (error) throw error
      const notifications = (data ?? []) as ShadoLiveNotification[]
      notifications
        .slice()
        .reverse()
        .forEach(present)
    } catch {
      // Realtime reconnect or the next foreground pass retries canonical reads.
    } finally {
      fetchInFlightRef.current = false
    }
  }, [present, user?.id])

  useEffect(() => {
    if (!user?.id) return
    handledRef.current.clear()
    let disposed = false
    let channel: RealtimeChannel | null = null
    let reconnectTimer: number | null = null

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        if (!disposed) void subscribe()
      }, 1500)
    }

    const subscribe = async () => {
      try {
        const client = await getWorkingClient()
        if (disposed) return
        const previousChannel = channel
        channel = null
        if (previousChannel && client.removeChannel) {
          await client.removeChannel(previousChannel).catch(() => undefined)
        }
        const nextChannel = client.channel(createRealtimeChannelName(`shado_live_notifications:${user.id}`))
        channel = nextChannel
        nextChannel
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'shado_live_notifications',
              filter: `recipient_user_id=eq.${user.id}`,
            },
            () => void fetchUnread(),
          )
          .subscribe((status: string) => {
            if (disposed || channel !== nextChannel) return
            if (status === 'SUBSCRIBED') {
              void fetchUnread()
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              scheduleReconnect()
            }
          })
      } catch {
        scheduleReconnect()
      }
    }

    const handleFocus = () => void fetchUnread()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void fetchUnread()
    }
    void subscribe()
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      disposed = true
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      const realtimeClient = getRealtimeClient()
      if (channel && realtimeClient?.removeChannel) realtimeClient.removeChannel(channel)
    }
  }, [fetchUnread, user?.id])

  return null
}

export default ShadoLiveNotificationBridge
