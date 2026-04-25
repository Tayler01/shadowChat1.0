import { useCallback, useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { getRealtimeClient, getWorkingClient, resetRealtimeConnection } from '../lib/supabase'
import { useAuth } from './useAuth'
import { useIsDesktop } from './useIsDesktop'
import { useVisibilityRefresh } from './useVisibilityRefresh'
import { MessageNotification } from '../components/notifications/MessageNotification'

export function useMessageNotifications(onOpenConversation: (id: string) => void) {
  const { user } = useAuth()
  const isDesktop = useIsDesktop()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel>) | null>(null)

  const resetNotificationChannel = useCallback(async () => {
    const activeChannel = channelRef.current
    const realtimeClient = getRealtimeClient()

    if (
      activeChannel &&
      realtimeClient?.removeChannel &&
      typeof realtimeClient.removeChannel === 'function'
    ) {
      try {
        realtimeClient.removeChannel(activeChannel)
      } catch {
        // ignore cleanup failures
      }
    }

    channelRef.current = null

    if (subscribeRef.current) {
      try {
        channelRef.current = await subscribeRef.current()
      } catch {
        // The next visibility/focus event will try again.
      }
    }
  }, [])

  useVisibilityRefresh(() => {
    void resetNotificationChannel()
  }, 350)

  useEffect(() => {
    if (!user) return

    let channel: RealtimeChannel | null = null
    let disposed = false

    const subscribeToChannel = async (): Promise<RealtimeChannel> => {
      const realtimeClient =
        (await getWorkingClient().catch(() => getRealtimeClient())) ||
        getRealtimeClient()

      if (!realtimeClient?.channel || typeof realtimeClient.channel !== 'function') {
        throw new Error('Realtime client unavailable')
      }

      const nextChannel = realtimeClient
      .channel('dm_notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages' },
        async (payload: any) => {
          if (payload.new.sender_id === user.id) return

          const working = await getWorkingClient()
          const { data } = await working
            .from('dm_messages')
            .select(
              `id, content, conversation_id, sender:users!sender_id(id, display_name, avatar_url, color)`
            )
            .eq('id', payload.new.id)
            .single()

          const message = data as unknown as {
            id: string
            content: string
            conversation_id: string
            sender?: {
              display_name?: string
              avatar_url?: string
              color?: string
            }
          } | null

          if (message) {
            toast.custom(t => (
              <MessageNotification
                t={t}
                content={message.content}
                sender={message.sender || {}}
                onClick={() => {
                  toast.dismiss(t.id)
                  onOpenConversation(message.conversation_id)
                }}
                desktop={isDesktop}
              />
            ), {
              duration: 5000,
              position: isDesktop ? 'top-right' : 'top-center',
            })
          }
        }
      )
      .subscribe(async (status: string) => {
        if (disposed) return

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          try {
            await resetRealtimeConnection()
          } catch {
            // fall back to a plain resubscribe below
          }
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          const activeChannel = channelRef.current
          if (
            activeChannel &&
            realtimeClient.removeChannel &&
            typeof realtimeClient.removeChannel === 'function'
          ) {
            try {
              realtimeClient.removeChannel(activeChannel)
            } catch {
              // ignore cleanup failures
            }
          }

          channelRef.current = null
          window.setTimeout(() => {
            if (disposed) return
            subscribeToChannel()
              .then(resubscribedChannel => {
                channel = resubscribedChannel
                channelRef.current = resubscribedChannel
              })
              .catch(() => {
                // The next visibility/focus event will try again.
              })
          }, status === 'CLOSED' ? 1000 : 1500)
        }
      })

      return nextChannel
    }

    subscribeRef.current = subscribeToChannel

    subscribeToChannel()
      .then(newChannel => {
        channel = newChannel
        channelRef.current = newChannel
      })
      .catch(() => {
        // In-app notifications recover on the next visibility/focus refresh.
      })

    return () => {
      disposed = true
      subscribeRef.current = null
      const realtimeClient = getRealtimeClient()
      const activeChannel = channel || channelRef.current
      if (
        activeChannel &&
        realtimeClient?.removeChannel &&
        typeof realtimeClient.removeChannel === 'function'
      ) {
        try {
          realtimeClient.removeChannel(activeChannel)
        } catch {
          // ignore cleanup failures
        }
      }
      channelRef.current = null
    }
  }, [isDesktop, onOpenConversation, resetNotificationChannel, user])
}
