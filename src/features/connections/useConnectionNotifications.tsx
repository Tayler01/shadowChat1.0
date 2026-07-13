import { useCallback, useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { UserRoundCheck, UserRoundPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import { openConnectionsHub } from '../../lib/connectionsNavigation'
import { createRealtimeChannelName } from '../../lib/realtimeChannelName'
import { getRealtimeClient, getWorkingClient } from '../../lib/supabase'
import {
  CONNECTION_NOTIFICATION_TYPES,
  dispatchConnectionsChanged,
  getConnectionNotificationTargetUserId,
  getConnectionNotificationTitle,
  isConnectionNotificationType,
  shouldPresentConnectionNotification,
  type ConnectionNotificationType,
} from './connectionModel'

interface ConnectionNotificationEvent {
  id: string
  type: ConnectionNotificationType
  payload: unknown
}

export function useConnectionNotifications() {
  const { user } = useAuth()
  const completedRef = useRef(new Set<string>())
  const inFlightRef = useRef(new Set<string>())
  const presentedRef = useRef(new Set<string>())

  const markRead = useCallback(async (eventId: string) => {
    if (!user?.id) return false
    try {
      const client = await getWorkingClient()
      const { error } = await client
        .from('notification_events')
        .update({ read_at: new Date().toISOString() })
        .eq('id', eventId)
        .eq('user_id', user.id)
      return !error
    } catch {
      return false
    }
  }, [user?.id])

  const handleEvent = useCallback(async (event: ConnectionNotificationEvent) => {
    if (completedRef.current.has(event.id) || inFlightRef.current.has(event.id)) return
    inFlightRef.current.add(event.id)

    dispatchConnectionsChanged({
      targetUserId: getConnectionNotificationTargetUserId(event.payload),
      source: 'notification',
    })

    const firstPresentation = !presentedRef.current.has(event.id)
    presentedRef.current.add(event.id)
    const title = getConnectionNotificationTitle(event.type, event.payload)
    if (firstPresentation && title && shouldPresentConnectionNotification(event.payload)) {
      const isRequest = event.type === 'connection_request'
      const toastId = toast.custom(currentToast => (
        <button
          type="button"
          onClick={() => {
            openConnectionsHub()
            toast.dismiss(currentToast.id)
          }}
          className={`popup-surface flex max-w-sm items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-panel)] p-3 text-left shadow-[var(--shadow-panel)] transition-[opacity,transform] duration-200 ${
            currentToast.visible
              ? 'pointer-events-auto translate-y-0 opacity-100'
              : 'pointer-events-none -translate-y-2 opacity-0'
          }`}
          aria-label={`${title}. Open Connections.`}
        >
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(215,170,70,0.12)] text-[var(--text-gold)]">
            {isRequest
              ? <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
              : <UserRoundCheck className="h-4 w-4" aria-hidden="true" />}
          </span>
          <span className="min-w-0 text-sm font-semibold text-[var(--text-primary)]">{title}</span>
        </button>
      ), { duration: 5000, position: 'top-center' })
      window.setTimeout(() => toast.dismiss(toastId), 5000)
    }

    const markedRead = await markRead(event.id)
    if (markedRead) completedRef.current.add(event.id)
    inFlightRef.current.delete(event.id)
  }, [markRead])

  useEffect(() => {
    if (!user) return

    completedRef.current.clear()
    inFlightRef.current.clear()
    presentedRef.current.clear()

    let disposed = false
    let channel: RealtimeChannel | null = null
    let reconnectTimer: number | null = null

    const fetchUnread = async () => {
      try {
        const client = await getWorkingClient()
        const { data } = await client
          .from('notification_events')
          .select('id, type, payload')
          .eq('user_id', user.id)
          .in('type', [...CONNECTION_NOTIFICATION_TYPES])
          .is('read_at', null)
          .order('created_at', { ascending: true })
          .limit(20)

        if (disposed) return
        for (const rawEvent of data ?? []) {
          const event = rawEvent as unknown as ConnectionNotificationEvent
          if (isConnectionNotificationType(event.type)) await handleEvent(event)
        }
      } catch {
        // Subscription recovery and the next visibility catch-up retry safely.
      }
    }

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
        const nextChannel = client.channel(createRealtimeChannelName(`connection_notifications:${user.id}`))
        channel = nextChannel
        nextChannel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notification_events',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: { new: unknown }) => {
            const event = payload.new as ConnectionNotificationEvent
            if (isConnectionNotificationType(event.type)) void handleEvent(event)
          },
        )
        .subscribe((status: string) => {
          if (disposed || channel !== nextChannel) return
          if (status === 'SUBSCRIBED') {
            void fetchUnread()
            return
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
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
  }, [handleEvent, user])
}
