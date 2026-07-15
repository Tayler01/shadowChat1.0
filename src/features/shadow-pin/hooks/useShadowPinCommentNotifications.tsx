import { useCallback, useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { MessageSquare, Reply } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../../hooks/useAuth'
import { createRealtimeChannelName } from '../../../lib/realtimeChannelName'
import { requestAppBadgeRefresh } from '../../../lib/appBadge'
import { getRealtimeClient, getWorkingClient } from '../../../lib/supabase'

type ShadowPinNotificationEvent = {
  id: string
  type: 'shadow_pin_post' | 'shadow_pin_comment' | 'shadow_pin_reply'
  payload: {
    image_id?: string
    image_title?: string
    body_preview?: string
    actor?: { display_name?: string | null; username?: string | null }
  } | null
}

const openShadowPin = () => {
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'pins')
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useShadowPinCommentNotifications() {
  const { user } = useAuth()
  const handledRef = useRef(new Set<string>())

  const handleEvent = useCallback(async (event: ShadowPinNotificationEvent) => {
    if (handledRef.current.has(event.id)) return
    handledRef.current.add(event.id)
    requestAppBadgeRefresh()

    const actor = event.payload?.actor
    const actorLabel = actor?.display_name || (actor?.username ? `@${actor.username}` : 'Someone')
    const isReply = event.type === 'shadow_pin_reply'
    const isNewPost = event.type === 'shadow_pin_post'
    const title = isNewPost
      ? `${actorLabel} posted a new ShadowPin`
      : isReply
      ? `${actorLabel} replied to your ShadowPin comment`
      : `${actorLabel} commented on ${event.payload?.image_title || 'your pin'}`

    const toastId = toast.custom(t => (
      <button
        type="button"
        onClick={() => {
          void (async () => {
            const client = await getWorkingClient()
            const { error } = await client
              .from('notification_events')
              .update({ read_at: new Date().toISOString() })
              .eq('id', event.id)
              .eq('user_id', user?.id ?? '')
            if (!error) requestAppBadgeRefresh()
          })()
          openShadowPin()
          toast.dismiss(t.id)
        }}
        className={`popup-surface flex max-w-sm items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-panel)] p-3 text-left shadow-[var(--shadow-panel)] transition-[opacity,transform] duration-200 ${
          t.visible
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
        aria-label={`${title}. Open ShadowPin.`}
      >
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(215,170,70,0.12)] text-[var(--text-gold)]">
          {isReply ? <Reply className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
          {(event.payload?.body_preview || (isNewPost ? event.payload?.image_title : '')) && (
            <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[var(--text-secondary)]">
              {event.payload?.body_preview || event.payload?.image_title}
            </span>
          )}
        </span>
      </button>
    ), { duration: 5000, position: 'top-center' })
    window.setTimeout(() => toast.dismiss(toastId), 5000)

  }, [user?.id])

  useEffect(() => {
    if (!user) return

    let disposed = false
    let channel: RealtimeChannel | null = null

    const fetchUnread = async () => {
      const client = await getWorkingClient()
      const { data } = await client
        .from('notification_events')
        .select('id, type, payload')
        .eq('user_id', user.id)
        .in('type', ['shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply'])
        .is('read_at', null)
        .order('created_at', { ascending: true })
        .limit(10)

      if (disposed) return
      for (const event of (data ?? []) as unknown as ShadowPinNotificationEvent[]) {
        await handleEvent(event)
      }
    }

    const subscribe = async () => {
      const client = await getWorkingClient()
      channel = client
        .channel(createRealtimeChannelName(`shadow_pin_comment_notifications:${user.id}`))
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notification_events',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: { new: unknown }) => {
            const event = payload.new as ShadowPinNotificationEvent
            if (
              event.type === 'shadow_pin_post' ||
              event.type === 'shadow_pin_comment' ||
              event.type === 'shadow_pin_reply'
            ) {
              void handleEvent(event)
            }
          }
        )
        .subscribe()
    }

    const handleFocus = () => { void fetchUnread() }
    void fetchUnread()
    void subscribe()
    window.addEventListener('focus', handleFocus)

    return () => {
      disposed = true
      window.removeEventListener('focus', handleFocus)
      const realtimeClient = getRealtimeClient()
      if (channel && realtimeClient?.removeChannel) realtimeClient.removeChannel(channel)
    }
  }, [handleEvent, user])
}
