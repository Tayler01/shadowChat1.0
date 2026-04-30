import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  getRealtimeClient,
  getWorkingClient,
  type NewsFeedItem,
} from '../lib/supabase'
import { useAuth } from './useAuth'

const FEED_LIMIT = 80

const getEasternVisibleDay = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

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

export function useNewsFeed() {
  const { user } = useAuth()
  const [items, setItems] = useState<NewsFeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const fetchFeed = useCallback(async () => {
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
      setItems(((data ?? []) as unknown as NewsFeedItem[]))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load news feed')
    } finally {
      setLoading(false)
    }
  }, [])

  const isCurrentVisibleItem = useCallback((item: NewsFeedItem | null): item is NewsFeedItem => (
    Boolean(item && !item.hidden && item.visible_day === getEasternVisibleDay())
  ), [])

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
    void fetchFeed()
  }, [fetchFeed])

  useEffect(() => {
    if (!user) return

    let channel: RealtimeChannel | null = null
    let currentClient: any = null

    const subscribe = async () => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()
      if (!currentClient?.channel) return

      channel = currentClient
        .channel('public:news_feed_items')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'news_feed_items' },
          async (payload: any) => {
            const item = await fetchFeedItem(payload.new.id)
            if (!isCurrentVisibleItem(item)) return
            setItems(prev => dedupeFeedItems([item, ...prev]).slice(0, FEED_LIMIT))
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'news_feed_items' },
          async (payload: any) => {
            const item = await fetchFeedItem(payload.new.id)
            setItems(prev => {
              if (!item || item.hidden) {
                return prev.filter(existing => existing.id !== payload.new.id)
              }
              if (!isCurrentVisibleItem(item)) {
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
            setItems(prev => prev.filter(item => item.id !== payload.old.id))
          }
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
  }, [fetchFeedItem, isCurrentVisibleItem, user])

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
      setItems(prev => dedupeFeedItems(prev.map(existing => existing.id === item.id ? item : existing)))
    }
  }, [fetchFeedItem, user])

  const markSeen = useCallback(async () => {
    const workingClient = await getWorkingClient()
    await workingClient.rpc('mark_news_seen', { section: 'feed' })
  }, [])

  return {
    items,
    loading,
    error,
    refresh: fetchFeed,
    markSeen,
    toggleReaction,
  }
}
