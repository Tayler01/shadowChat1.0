import { useCallback, useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { getRealtimeClient, getWorkingClient } from '../lib/supabase'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { createRealtimeChannelName } from '../lib/realtimeChannelName'
import { useAuth } from './useAuth'
import { useIsDesktop } from './useIsDesktop'
import { useRealtimeRecovery } from './useRealtimeRecovery'
import { MessageNotification } from '../components/notifications/MessageNotification'

const NOTIFICATION_DEDUPE_WINDOW_MS = 30_000

const removeRealtimeChannel = (channel: RealtimeChannel | null) => {
  const realtimeClient = getRealtimeClient()

  if (
    channel &&
    realtimeClient?.removeChannel &&
    typeof realtimeClient.removeChannel === 'function'
  ) {
    try {
      realtimeClient.removeChannel(channel)
    } catch {
      // ignore cleanup failures
    }
  }
}

export function useMessageNotifications(onOpenConversation: (id: string) => void) {
  const { user } = useAuth()
  const userId = user?.id
  const isDesktop = useIsDesktop()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel>) | null>(null)
  const resetSequenceRef = useRef(0)
  const onOpenConversationRef = useRef(onOpenConversation)
  const isDesktopRef = useRef(isDesktop)
  const handledMessageIdsRef = useRef(new Map<string, number>())

  onOpenConversationRef.current = onOpenConversation
  isDesktopRef.current = isDesktop

  const markMessageNotificationStarted = useCallback((messageId: string) => {
    const now = Date.now()
    const handledMessageIds = handledMessageIdsRef.current

    handledMessageIds.forEach((handledAt, handledMessageId) => {
      if (now - handledAt > NOTIFICATION_DEDUPE_WINDOW_MS) {
        handledMessageIds.delete(handledMessageId)
      }
    })

    if (handledMessageIds.has(messageId)) {
      return false
    }

    handledMessageIds.set(messageId, now)
    return true
  }, [])

  const clearMessageNotificationStarted = useCallback((messageId: string) => {
    handledMessageIdsRef.current.delete(messageId)
  }, [])

  const resetNotificationChannel = useCallback(async () => {
    const resetSequence = resetSequenceRef.current + 1
    resetSequenceRef.current = resetSequence
    const activeChannel = channelRef.current
    removeRealtimeChannel(activeChannel)

    channelRef.current = null

    const subscribe = subscribeRef.current
    if (subscribe) {
      try {
        const nextChannel = await subscribe()
        if (subscribeRef.current === subscribe && resetSequenceRef.current === resetSequence) {
          channelRef.current = nextChannel
        } else {
          removeRealtimeChannel(nextChannel)
        }
      } catch {
        // The next visibility/focus event will try again.
      }
    }
  }, [])

  useRealtimeRecovery(() => {
    void resetNotificationChannel()
  }, 350)

  useEffect(() => {
    if (!userId) return

    let channel: RealtimeChannel | null = null
    let disposed = false
    const resubscribeTimers = new Set<number>()

    const subscribeToChannel = async (): Promise<RealtimeChannel> => {
      const realtimeClient =
        (await getWorkingClient().catch(() => getRealtimeClient())) ||
        getRealtimeClient()

      if (!realtimeClient?.channel || typeof realtimeClient.channel !== 'function') {
        throw new Error('Realtime client unavailable')
      }

      const nextChannel = realtimeClient
        .channel(createRealtimeChannelName(`dm_notifications:${userId}`))
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'dm_messages' },
          async (payload: any) => {
            const messageId = payload.new.id
            if (!messageId || payload.new.sender_id === userId) return
            if (!markMessageNotificationStarted(messageId)) return

            try {
              const working = await getWorkingClient()
              const { data } = await working
                .from('dm_messages')
                .select(
                  `id, content, conversation_id, sender:users!sender_id(id, display_name, avatar_url, color, admin_role, checkers_crown, war_sword, shadow_pin_gold_pin, presence_visibility)`
                )
                .eq('id', messageId)
                .single()

              const message = data as unknown as {
                id: string
                content: string
                conversation_id: string
                sender?: {
                  id?: string
                  display_name?: string
                  avatar_url?: string
                  color?: string
                  admin_role?: 'admin' | 'sub_admin' | null
                  presence_visibility?: 'tracked' | 'invisible' | null
                }
              } | null

              if (!message || disposed) {
                clearMessageNotificationStarted(messageId)
                return
              }

              const desktop = isDesktopRef.current
              toast.custom(t => (
                <MessageNotification
                  t={t}
                  content={message.content}
                  sender={message.sender || {}}
                  onClick={() => {
                    toast.dismiss(t.id)
                    onOpenConversationRef.current(message.conversation_id)
                  }}
                  desktop={desktop}
                />
              ), {
                duration: 5000,
                position: desktop ? 'top-right' : 'top-center',
              })
            } catch {
              clearMessageNotificationStarted(messageId)
            }
          }
        )
      .subscribe(async (status: string) => {
        if (disposed) return

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          try {
            await runRealtimeRecovery('channel-error')
          } catch {
            // fall back to a plain resubscribe below
          }
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          const activeChannel = channelRef.current
          if (
            status !== 'CLOSED' &&
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
          resubscribeTimers.forEach(timerId => window.clearTimeout(timerId))
          resubscribeTimers.clear()
          const timerId = window.setTimeout(() => {
            resubscribeTimers.delete(timerId)
            if (disposed) return
            subscribeToChannel()
              .then(resubscribedChannel => {
                if (disposed) {
                  removeRealtimeChannel(resubscribedChannel)
                  return
                }
                channel = resubscribedChannel
                channelRef.current = resubscribedChannel
              })
              .catch(() => {
                // The next visibility/focus event will try again.
              })
          }, status === 'CLOSED' ? 1000 : 1500)
          resubscribeTimers.add(timerId)
        }
      })

      return nextChannel
    }

    subscribeRef.current = subscribeToChannel

    subscribeToChannel()
      .then(newChannel => {
        if (disposed) {
          removeRealtimeChannel(newChannel)
          return
        }
        channel = newChannel
        channelRef.current = newChannel
      })
      .catch(() => {
        // In-app notifications recover on the next visibility/focus refresh.
      })

    return () => {
      disposed = true
      resetSequenceRef.current += 1
      resubscribeTimers.forEach(timerId => window.clearTimeout(timerId))
      resubscribeTimers.clear()
      subscribeRef.current = null
      const activeChannel = channel || channelRef.current
      removeRealtimeChannel(activeChannel)
      channelRef.current = null
    }
  }, [
    clearMessageNotificationStarted,
    markMessageNotificationStarted,
    resetNotificationChannel,
    userId,
  ])
}
