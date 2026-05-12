import { useCallback, useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { getRealtimeClient, getWorkingClient, type ArtBoardReaction, type User } from '../lib/supabase'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { useAuth } from './useAuth'
import { useRealtimeRecovery } from './useRealtimeRecovery'
import { ArtReactionNotification } from '../components/notifications/ArtReactionNotification'

const SUPPRESS_MS = 120000

export function useArtBoardReactionNotifications() {
  const { user } = useAuth()
  const handledRef = useRef<Map<string, number>>(new Map())
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel>) | null>(null)

  const resetNotificationChannel = useCallback(async () => {
    const activeChannel = channelRef.current
    const realtimeClient = getRealtimeClient()

    if (activeChannel && realtimeClient?.removeChannel) {
      try {
        realtimeClient.removeChannel(activeChannel)
      } catch {
        // best effort cleanup
      }
    }

    channelRef.current = null

    if (subscribeRef.current) {
      try {
        channelRef.current = await subscribeRef.current()
      } catch {
        // Retry on the next visibility or realtime recovery event.
      }
    }
  }, [])

  useRealtimeRecovery(() => {
    void resetNotificationChannel()
  }, 500)

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
        .channel(`art_board_reaction_notifications:${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'art_board_reactions' },
          async (payload: any) => {
            const reactionRow = payload.new as {
              item_id?: string
              user_id?: string
              reaction?: ArtBoardReaction
            }

            if (!reactionRow.item_id || !reactionRow.user_id || reactionRow.user_id === user.id || !reactionRow.reaction) {
              return
            }

            const key = `${reactionRow.item_id}:${reactionRow.user_id}:${reactionRow.reaction}`
            const now = Date.now()
            const lastHandled = handledRef.current.get(key) ?? 0
            if (now - lastHandled < SUPPRESS_MS) return
            handledRef.current.set(key, now)

            const working = await getWorkingClient()
            const [{ data: item }, { data: actor }] = await Promise.all([
              working
                .from('art_board_items')
                .select('id, user_id, title, caption, note_text, item_type')
                .eq('id', reactionRow.item_id)
                .maybeSingle(),
              working
                .from('users')
                .select('id, username, display_name, avatar_url, color, admin_role, checkers_crown, presence_visibility')
                .eq('id', reactionRow.user_id)
                .maybeSingle(),
            ])

            if (disposed || !item || item.user_id !== user.id) return

            const reaction = reactionRow.reaction
            const itemTitle =
              item.title ||
              item.caption ||
              (item.item_type === 'note' ? item.note_text?.slice(0, 42) : 'your art')

            toast.custom(
              t => (
                <button
                  type="button"
                  onClick={() => toast.dismiss(t.id)}
                  className="block text-left"
                  aria-label="Dismiss Art Board reaction notification"
                >
                  <ArtReactionNotification
                    actor={actor as Partial<User> | null}
                    reaction={reaction}
                    itemTitle={itemTitle || 'your art'}
                  />
                </button>
              ),
              {
                duration: 5000,
                position: 'top-center',
              }
            )
          }
        )
        .subscribe(async (status: string) => {
          if (disposed) return

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            try {
              await runRealtimeRecovery('channel-error')
            } catch {
              // fall through to normal retry
            }
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            const activeChannel = channelRef.current
            if (status !== 'CLOSED' && activeChannel && realtimeClient.removeChannel) {
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
                  // The next recovery/focus event will try again.
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
        // Realtime recovery will retry.
      })

    return () => {
      disposed = true
      subscribeRef.current = null
      const realtimeClient = getRealtimeClient()
      const activeChannel = channel || channelRef.current
      if (activeChannel && realtimeClient?.removeChannel) {
        try {
          realtimeClient.removeChannel(activeChannel)
        } catch {
          // ignore cleanup failures
        }
      }
      channelRef.current = null
    }
  }, [resetNotificationChannel, user])
}
