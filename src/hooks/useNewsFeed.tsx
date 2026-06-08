import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getRealtimeClient,
  getWorkingClient,
  type NewsFeedItem,
} from '../lib/supabase'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { createRealtimeChannelName } from '../lib/realtimeChannelName'
import {
  createRealtimeSubscriptionManager,
  isRecoverableRealtimeStatus,
} from '../lib/realtimeSubscription'
import {
  getEasternVisibleDay,
  isCurrentVisibleNewsFeedRow,
  isKnownHiddenOrOtherDayNewsFeedRow,
} from '../lib/newsFeedVisibility'
import { useAuth } from './useAuth'
import { useRealtimeRecovery } from './useRealtimeRecovery'

const FEED_LIMIT = 80
const NEWS_FEED_CACHE_MS = 60 * 1000

type NewsFeedCacheEntry = {
  visibleDay: string
  items: NewsFeedItem[]
  fetchedAt: number
}

let newsFeedCacheByUserId = new Map<string, NewsFeedCacheEntry>()

export function resetNewsFeedCacheForTests() {
  newsFeedCacheByUserId = new Map<string, NewsFeedCacheEntry>()
}

const sortFeedItems = (items: NewsFeedItem[]) =>
  [...items].sort((a, b) => (
    new Date(b.detected_at || b.created_at).getTime() -
    new Date(a.detected_at || a.created_at).getTime()
  ))

const dedupeFeedItems = (items: NewsFeedItem[]) => {
  const map = new Map<string, NewsFeedItem>()
  items.forEach(item => map.set(item.id, item))
  return sortFeedItems(Array.from(map.values()))
}

const getFreshNewsFeedCache = (userId: string) => {
  const newsFeedCache = newsFeedCacheByUserId.get(userId)
  if (!newsFeedCache) return null
  if (newsFeedCache.visibleDay !== getEasternVisibleDay()) return null
  return Date.now() - newsFeedCache.fetchedAt < NEWS_FEED_CACHE_MS ? newsFeedCache : null
}

const writeNewsFeedCache = (userId: string, items: NewsFeedItem[]) => {
  const newsFeedCache = {
    visibleDay: getEasternVisibleDay(),
    items: dedupeFeedItems(items).slice(0, FEED_LIMIT),
    fetchedAt: Date.now(),
  }
  newsFeedCacheByUserId.set(userId, newsFeedCache)
  return newsFeedCache.items
}

export function useNewsFeed() {
  const { user } = useAuth()
  const cacheUserId = user?.id ?? 'anonymous'
  const cachedFeed = getFreshNewsFeedCache(cacheUserId)
  const [items, setItems] = useState<NewsFeedItem[]>(() => cachedFeed?.items ?? [])
  const [loading, setLoading] = useState(!cachedFeed)
  const [error, setError] = useState<string | null>(null)
  const subscriptionRef = useRef<ReturnType<typeof createRealtimeSubscriptionManager> | null>(null)
  if (!subscriptionRef.current) {
    subscriptionRef.current = createRealtimeSubscriptionManager({ getFallbackClient: getRealtimeClient })
  }

  const updateItems = useCallback((updater: NewsFeedItem[] | ((current: NewsFeedItem[]) => NewsFeedItem[])) => {
    setItems(current => {
      const nextItems = typeof updater === 'function' ? updater(current) : updater
      return writeNewsFeedCache(cacheUserId, nextItems)
    })
  }, [cacheUserId])

  const fetchFeed = useCallback(async (options: { silent?: boolean; force?: boolean } = {}) => {
    const cached = getFreshNewsFeedCache(cacheUserId)
    if (!options.force && cached) {
      setItems(cached.items)
      setLoading(false)
      setError(null)
      return
    }

    if (!options.silent) setLoading(!cached || Boolean(options.force))
    try {
      const visibleDay = getEasternVisibleDay()
      const workingClient = await getWorkingClient()
      const { data, error: fetchError } = await workingClient
        .from('news_feed_items')
        .select(`
          *,
          source:news_sources(*)
        `)
        .eq('hidden', false)
        .eq('visible_day', visibleDay)
        .order('detected_at', { ascending: false })
        .limit(FEED_LIMIT)

      if (fetchError) throw fetchError
      setItems(writeNewsFeedCache(cacheUserId, (data ?? []) as unknown as NewsFeedItem[]))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load news feed')
    } finally {
      setLoading(false)
    }
  }, [cacheUserId])

  const fetchFeedItem = useCallback(async (id: string) => {
    const workingClient = await getWorkingClient()
    const { data, error: fetchError } = await workingClient
      .from('news_feed_items')
      .select(`
        *,
        source:news_sources(*)
      `)
      .eq('id', id)
      .maybeSingle()

    if (fetchError || !data) return null
    return data as unknown as NewsFeedItem
  }, [])

  useEffect(() => {
    void fetchFeed({ silent: Boolean(getFreshNewsFeedCache(cacheUserId)) })
  }, [cacheUserId, fetchFeed])

  const resetFeedChannel = useCallback(async () => {
    await fetchFeed({ force: true, silent: true })
    await subscriptionRef.current?.resubscribe().catch(() => null)
  }, [fetchFeed])

  useRealtimeRecovery(() => {
    void resetFeedChannel()
  })

  useEffect(() => {
    if (!user) return

    const subscriptionManager = subscriptionRef.current

    const subscribe = async () => {
      let currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()
      if (!currentClient?.channel) return null

      const channel = currentClient
        .channel(createRealtimeChannelName('public:news_feed_items'))
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'news_feed_items' },
          async (payload: any) => {
            if (isKnownHiddenOrOtherDayNewsFeedRow(payload.new)) return

            const item = await fetchFeedItem(payload.new.id)
            if (!isCurrentVisibleNewsFeedRow(item)) return
            updateItems(prev => dedupeFeedItems([item, ...prev]).slice(0, FEED_LIMIT))
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'news_feed_items' },
          async (payload: any) => {
            if (isKnownHiddenOrOtherDayNewsFeedRow(payload.new)) {
              updateItems(prev => prev.filter(existing => existing.id !== payload.new.id))
              return
            }

            const item = await fetchFeedItem(payload.new.id)
            updateItems(prev => {
              if (!item || item.hidden) {
                return prev.filter(existing => existing.id !== payload.new.id)
              }
              if (!isCurrentVisibleNewsFeedRow(item)) {
                return prev.filter(existing => existing.id !== payload.new.id)
              }
              return dedupeFeedItems(prev.map(existing => existing.id === item.id ? item : existing))
            })
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'news_feed_items' },
          (payload: any) => {
            updateItems(prev => prev.filter(item => item.id !== payload.old.id))
          }
        )
        .subscribe((status: string) => {
          if (isRecoverableRealtimeStatus(status)) {
            void runRealtimeRecovery('channel-error')
          }
        })

      return { channel, client: currentClient }
    }

    subscriptionManager?.setSubscribe(subscribe)
    void subscriptionManager?.start(subscribe).catch(() => null)

    return () => {
      subscriptionManager?.clearSubscribe(subscribe)
      void subscriptionManager?.stop()
    }
  }, [fetchFeedItem, updateItems, user])

  const toggleReaction = useCallback(async (feedItemId: string, emoji: string) => {
    if (!user) return

    const workingClient = await getWorkingClient()
    const { error: rpcError } = await workingClient.rpc('toggle_news_feed_reaction', {
      feed_item_id: feedItemId,
      emoji,
    })

    if (rpcError) throw rpcError

    const item = await fetchFeedItem(feedItemId)
    if (item) {
      updateItems(prev => dedupeFeedItems(prev.map(existing => existing.id === item.id ? item : existing)))
    }
  }, [fetchFeedItem, updateItems, user])

  const markSeen = useCallback(async () => {
    const workingClient = await getWorkingClient()
    await workingClient.rpc('mark_news_seen', { section: 'feed' })
  }, [])

  return {
    items,
    loading,
    error,
    refresh: () => fetchFeed({ force: true }),
    markSeen,
    toggleReaction,
  }
}
