import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getRealtimeClient, getWorkingClient } from '../lib/supabase'
import { BOARD_DEFINITIONS } from '../lib/boards'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { useAuth } from './useAuth'
import { useRealtimeRecovery } from './useRealtimeRecovery'

interface BoardBadgeRow {
  board_slug: string
  unread_count: number
  contributes_to_nav: boolean
}

type BoardBadgesValue = {
  count: number
  navCount: number
  countsByBoard: Record<string, number>
  refresh: () => Promise<Record<string, number>>
  markFeedSeen: () => Promise<void>
}

const BADGE_REALTIME_DEBOUNCE_MS = 350
const BoardBadgesContext = createContext<BoardBadgesValue | null>(null)

const normalizeCount = (value: unknown) => {
  const count = Number(value ?? 0)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

const emptyCounts = () => (
  Object.fromEntries(BOARD_DEFINITIONS.map(board => [board.slug, 0])) as Record<string, number>
)

function useProvideBoardBadges(): BoardBadgesValue {
  const { user } = useAuth()
  const [countsByBoard, setCountsByBoard] = useState<Record<string, number>>(() => emptyCounts())
  const [navCount, setNavCount] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel | null>) | null>(null)
  const refreshInFlightRef = useRef<Promise<Record<string, number>> | null>(null)
  const refreshTimerRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      const counts = emptyCounts()
      setCountsByBoard(counts)
      setNavCount(0)
      return counts
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current
    }

    refreshInFlightRef.current = (async () => {
      try {
        const workingClient = await getWorkingClient()
        const { data, error } = await workingClient.rpc('get_board_badge_counts', {
          target_user_id: user.id,
        })
        if (error) throw error

        const rows = (data ?? []) as BoardBadgeRow[]
        const nextCounts = emptyCounts()
        let nextNavCount = 0

        rows.forEach(row => {
          const unreadCount = normalizeCount(row.unread_count)
          nextCounts[row.board_slug] = unreadCount
          if (row.contributes_to_nav) {
            nextNavCount += unreadCount
          }
        })

        setCountsByBoard(nextCounts)
        setNavCount(nextNavCount)
        return nextCounts
      } catch {
        const counts = emptyCounts()
        setCountsByBoard(counts)
        setNavCount(0)
        return counts
      } finally {
        refreshInFlightRef.current = null
      }
    })()

    return refreshInFlightRef.current
  }, [user])

  const refreshSoon = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current)
    }

    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      void refresh()
    }, BADGE_REALTIME_DEBOUNCE_MS)
  }, [refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const resetBadgeChannel = useCallback(async () => {
    await refresh()

    const activeChannel = channelRef.current
    const realtimeClient = getRealtimeClient()
    if (activeChannel && realtimeClient?.removeChannel) {
      try {
        realtimeClient.removeChannel(activeChannel)
      } catch {
        // ignore channel cleanup failures
      }
    }

    channelRef.current = null
    if (subscribeRef.current) {
      channelRef.current = await subscribeRef.current().catch(() => null)
    }
  }, [refresh])

  useRealtimeRecovery(() => {
    void resetBadgeChannel()
  })

  useEffect(() => {
    if (!user) return

    let channel: RealtimeChannel | null = null
    let currentClient: any = null

    const subscribe = async (): Promise<RealtimeChannel | null> => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()
      if (!currentClient?.channel) return null

      channel = currentClient
        .channel('public:board_badges')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'board_chat_messages' },
          () => refreshSoon()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'board_catalog' },
          () => refreshSoon()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'news_feed_items' },
          () => refreshSoon()
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'news_user_state',
            filter: `user_id=eq.${user.id}`,
          },
          () => refreshSoon()
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_read_cursors',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const row = (payload.new || payload.old) as { surface?: string } | undefined
            if (row?.surface === 'board_chat') {
              refreshSoon()
            }
          }
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void runRealtimeRecovery('channel-error')
          }
        })

      channelRef.current = channel
      return channel
    }

    subscribeRef.current = subscribe
    void subscribe()

    return () => {
      subscribeRef.current = null
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [refreshSoon, user])

  const markFeedSeen = useCallback(async () => {
    const workingClient = await getWorkingClient()
    await workingClient.rpc('mark_news_seen', { section: 'feed' })
    await refresh()
  }, [refresh])

  return useMemo(() => ({
    count: navCount,
    navCount,
    countsByBoard,
    refresh,
    markFeedSeen,
  }), [countsByBoard, markFeedSeen, navCount, refresh])
}

export function BoardBadgesProvider({ children }: { children: ReactNode }) {
  const value = useProvideBoardBadges()
  return createElement(BoardBadgesContext.Provider, { value }, children)
}

export function useBoardBadges() {
  const context = useContext(BoardBadgesContext)
  if (!context) {
    throw new Error('useBoardBadges must be used within BoardBadgesProvider')
  }

  return context
}
