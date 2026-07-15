import { useCallback, useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { RadioTower } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from './useAuth'
import { createRealtimeChannelName } from '../lib/realtimeChannelName'
import { getRealtimeClient, getWorkingClient } from '../lib/supabase'

type PresenceNotificationEvent = {
  id: string
  created_at: string
  sent_at: string | null
  payload: {
    notify_in_app?: boolean
    actor?: { display_name?: string | null; username?: string | null }
  } | null
}

const MAX_CATCH_UP_AGE_MS = 90_000

const openActiveUsers = () => {
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'active-users')
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function usePresenceNotifications() {
  const { user } = useAuth()
  const handledRef = useRef(new Set<string>())

  const markRead = useCallback(async (eventId: string) => {
    if (!user?.id) return
    const client = await getWorkingClient()
    await client
      .from('notification_events')
      .update({ read_at: new Date().toISOString() })
      .eq('id', eventId)
      .eq('user_id', user.id)
  }, [user?.id])

  const handleEvent = useCallback(async (event: PresenceNotificationEvent) => {
    if (handledRef.current.has(event.id)) return
    handledRef.current.add(event.id)

    const recent = Date.now() - new Date(event.created_at).getTime() <= MAX_CATCH_UP_AGE_MS
    const shouldShow = (
      document.visibilityState === 'visible' &&
      event.payload?.notify_in_app !== false &&
      !event.sent_at &&
      recent
    )

    if (shouldShow) {
      const actor = event.payload?.actor
      const actorLabel = actor?.display_name || (actor?.username ? `@${actor.username}` : 'Someone')
      const title = `${actorLabel} is active now`
      const toastId = toast.custom(currentToast => (
        <button
          type="button"
          onClick={() => {
            openActiveUsers()
            toast.dismiss(currentToast.id)
          }}
          className={`popup-surface flex max-w-sm items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-panel)] p-3 text-left shadow-[var(--shadow-panel)] transition-[opacity,transform] duration-200 ${
            currentToast.visible
              ? 'pointer-events-auto translate-y-0 opacity-100'
              : 'pointer-events-none -translate-y-2 opacity-0'
          }`}
          aria-label={`${title}. Open Active Users.`}
        >
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(80,210,135,0.12)] text-emerald-300">
            <RadioTower className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">See who else is around.</span>
          </span>
        </button>
      ), { duration: 5000, position: 'top-center' })
      window.setTimeout(() => toast.dismiss(toastId), 5000)
    }

    await markRead(event.id)
  }, [markRead])

  useEffect(() => {
    if (!user) return

    handledRef.current.clear()
    let disposed = false
    let channel: RealtimeChannel | null = null
    let reconnectTimer: number | null = null

    const fetchUnread = async () => {
      try {
        const client = await getWorkingClient()
        const { data } = await client
          .from('notification_events')
          .select('id, created_at, sent_at, payload')
          .eq('user_id', user.id)
          .eq('type', 'presence_active')
          .is('read_at', null)
          .order('created_at', { ascending: true })
          .limit(20)

        if (disposed) return
        for (const event of (data ?? []) as unknown as PresenceNotificationEvent[]) {
          await handleEvent(event)
        }
      } catch {
        // Realtime reconnect and the next foreground catch-up retry safely.
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
        const nextChannel = client.channel(createRealtimeChannelName(`presence_notifications:${user.id}`))
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
              const event = payload.new as PresenceNotificationEvent & { type?: string }
              if (event.type === 'presence_active') void handleEvent(event)
            }
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
