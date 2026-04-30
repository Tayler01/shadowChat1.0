import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getRealtimeClient, getWorkingClient } from '../lib/supabase'
import { useAuth } from './useAuth'

const normalizeCount = (value: unknown) => {
  const count = Number(value ?? 0)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

export function useNewsBadges() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(0)
      return 0
    }

    try {
      const workingClient = await getWorkingClient()
      const { data, error } = await workingClient.rpc('count_news_badge_items', {
        target_user_id: user.id,
      })
      if (error) throw error
      const nextCount = normalizeCount(data)
      setCount(nextCount)
      return nextCount
    } catch {
      setCount(0)
      return 0
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!user) return

    let channel: RealtimeChannel | null = null
    let currentClient: any = null

    const subscribe = async () => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()
      if (!currentClient?.channel) return

      channel = currentClient
        .channel('public:news_badges')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'news_feed_items' },
          () => void refresh()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'news_chat_messages' },
          () => void refresh()
        )
        .subscribe()

      channelRef.current = channel
    }

    void subscribe()

    return () => {
      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [refresh, user])

  const markSeen = useCallback(async (section: 'all' | 'feed' | 'chat') => {
    const workingClient = await getWorkingClient()
    await workingClient.rpc('mark_news_seen', { section })
    await refresh()
  }, [refresh])

  return { count, refresh, markSeen }
}
