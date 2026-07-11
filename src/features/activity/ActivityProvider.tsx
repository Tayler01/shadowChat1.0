import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useAuth } from '../../hooks/useAuth'
import { useRealtimeRecovery } from '../../hooks/useRealtimeRecovery'
import { createRealtimeChannelName } from '../../lib/realtimeChannelName'
import {
  isRecoverableRealtimeStatus,
  removeRealtimeChannel,
} from '../../lib/realtimeSubscription'
import { getWorkingClient } from '../../lib/supabase'
import {
  ACTIVITY_PAGE_SIZE,
  normalizeActivityEvent,
  sortAndDedupeActivity,
  type ActivityEvent,
  type ActivityFilter,
} from './activityModel'
import { ActivityContext } from './ActivityContext'

const ACTIVITY_SELECT = `
  id,
  user_id,
  actor_id,
  type,
  entity_id,
  conversation_id,
  message_id,
  dm_message_id,
  shadow_pin_image_id,
  shadow_pin_comment_id,
  body_preview,
  metadata,
  read_at,
  occurred_at,
  actor:users!activity_events_actor_id_fkey(
    id,
    display_name,
    username,
    avatar_url,
    avatar_thumbnail_url,
    color
  )
`

const normalizeRows = (rows: unknown[]) => rows
  .map(normalizeActivityEvent)
  .filter((item): item is ActivityEvent => Boolean(item))

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [items, setItems] = useState<ActivityEvent[]>([])
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [realtimeStatus, setRealtimeStatus] = useState<'idle' | 'connecting' | 'live' | 'recovering'>('idle')
  const [subscriptionGeneration, setSubscriptionGeneration] = useState(0)
  const requestGenerationRef = useRef(0)
  const knownEventIdsRef = useRef(new Set<string>())

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0)
      return 0
    }
    const client = await getWorkingClient()
    const { count, error: countError } = await client
      .from('activity_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
    if (countError) throw countError
    const nextCount = Number(count ?? 0)
    setUnreadCount(nextCount)
    return nextCount
  }, [userId])

  const fetchPage = useCallback(async ({ append = false, silent = false }: { append?: boolean; silent?: boolean } = {}) => {
    if (!userId) {
      setItems([])
      setUnreadCount(0)
      setHasMore(false)
      setLoading(false)
      return
    }

    const generation = ++requestGenerationRef.current
    const cursor = append ? items[items.length - 1] ?? null : null
    const existingIdsAtRequestStart = new Set(items.map(item => item.id))
    if (append) setLoadingMore(true)
    else if (!silent) setLoading(true)
    setError(null)

    try {
      const client = await getWorkingClient()
      let query = client
        .from('activity_events')
        .select(ACTIVITY_SELECT)
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(ACTIVITY_PAGE_SIZE + 1)

      if (filter === 'unread') query = query.is('read_at', null)
      if (cursor) {
        query = query.or(
          `occurred_at.lt.${cursor.occurred_at},and(occurred_at.eq.${cursor.occurred_at},id.lt.${cursor.id})`
        )
      }

      const [{ data, error: fetchError }] = await Promise.all([
        query,
        fetchUnreadCount(),
      ])
      if (fetchError) throw fetchError
      if (generation !== requestGenerationRef.current) return

      const nextRows = normalizeRows((data ?? []) as unknown[])
      setHasMore(nextRows.length > ACTIVITY_PAGE_SIZE)
      const page = nextRows.slice(0, ACTIVITY_PAGE_SIZE)
      setItems(current => {
        const arrivedDuringRequest = append
          ? []
          : current.filter(item => (
              !existingIdsAtRequestStart.has(item.id) &&
              (filter === 'all' || !item.read_at)
            ))
        const nextItems = sortAndDedupeActivity(
          append ? [...current, ...page] : [...arrivedDuringRequest, ...page]
        )
        knownEventIdsRef.current.clear()
        nextItems.forEach(item => knownEventIdsRef.current.add(item.id))
        return nextItems
      })
    } catch (loadError) {
      if (generation === requestGenerationRef.current) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load Activity')
      }
    } finally {
      if (generation === requestGenerationRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [fetchUnreadCount, filter, items, userId])

  const refresh = useCallback(() => fetchPage({ silent: items.length > 0 }), [fetchPage, items.length])
  const loadMore = useCallback(() => fetchPage({ append: true, silent: true }), [fetchPage])

  useEffect(() => {
    knownEventIdsRef.current.clear()
    void fetchPage()
  }, [filter, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEvent = useCallback(async (id: string) => {
    const client = await getWorkingClient()
    const { data, error: fetchError } = await client
      .from('activity_events')
      .select(ACTIVITY_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (fetchError || !data) return null
    return normalizeActivityEvent(data)
  }, [])

  useEffect(() => {
    if (!userId) return
    let disposed = false
    let channel: RealtimeChannel | null = null
    let client: Awaited<ReturnType<typeof getWorkingClient>> | null = null
    let reconnectTimer: number | null = null

    const scheduleReconnect = () => {
      setRealtimeStatus('recovering')
      if (!disposed && reconnectTimer === null) {
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null
          setSubscriptionGeneration(current => current + 1)
        }, 900)
      }
    }

    const subscribe = async () => {
      setRealtimeStatus('connecting')
      try {
        client = await getWorkingClient()
        if (disposed || !client?.channel) return

        channel = client
          .channel(createRealtimeChannelName(`activity_events:${userId}`))
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'activity_events' },
          async (payload: { new: { id?: string; user_id?: string } }) => {
            if (!payload.new.id || payload.new.user_id !== userId) return
            const event = await fetchEvent(payload.new.id)
            if (!event) return
            if (knownEventIdsRef.current.has(event.id)) return
            knownEventIdsRef.current.add(event.id)
            setUnreadCount(current => event.read_at ? current : current + 1)
            if (filter === 'all' || !event.read_at) {
              setItems(current => sortAndDedupeActivity([event, ...current]))
            }
            const actor = event.actor?.display_name || event.actor?.username || 'a member'
            setAnnouncement(`New activity from ${actor}`)
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'activity_events' },
          (payload: { new: { id?: string; user_id?: string; read_at?: string | null } }) => {
            if (!payload.new.id || payload.new.user_id !== userId) return
            setItems(current => current
              .map(item => item.id === payload.new.id ? { ...item, read_at: payload.new.read_at ?? null } : item)
              .filter(item => filter === 'all' || !item.read_at))
            void fetchUnreadCount().catch(() => undefined)
          }
        )
          .subscribe((status: string) => {
            if (disposed) return
            if (status === 'SUBSCRIBED') {
              setRealtimeStatus('live')
            } else if (isRecoverableRealtimeStatus(status)) {
              scheduleReconnect()
            }
          })
      } catch {
        if (!disposed) {
          scheduleReconnect()
        }
      }
    }

    void subscribe()
    return () => {
      disposed = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      void removeRealtimeChannel(client, channel)
    }
  }, [fetchEvent, fetchUnreadCount, filter, subscriptionGeneration, userId])

  const recoverActivity = useCallback(() => {
    void fetchPage({ silent: true })
    setSubscriptionGeneration(current => current + 1)
  }, [fetchPage])
  useRealtimeRecovery(recoverActivity)

  const markRead = useCallback(async (id: string) => {
    const target = items.find(item => item.id === id)
    if (!target || target.read_at) return true
    const readAt = new Date().toISOString()
    setItems(current => current
      .map(item => item.id === id ? { ...item, read_at: readAt } : item)
      .filter(item => filter === 'all' || !item.read_at))
    setUnreadCount(current => Math.max(0, current - 1))

    try {
      const client = await getWorkingClient()
      const { error: updateError } = await client
        .from('activity_events')
        .update({ read_at: readAt })
        .eq('id', id)
      if (updateError) throw updateError
      return true
    } catch (updateError) {
      setItems(current => sortAndDedupeActivity([...current, target]))
      setUnreadCount(current => current + 1)
      setError(updateError instanceof Error ? updateError.message : 'Unable to mark Activity read')
      return false
    }
  }, [filter, items])

  const markAllRead = useCallback(async () => {
    if (!userId || unreadCount === 0) return true
    const previousItems = items
    const previousUnreadCount = unreadCount
    const readAt = new Date().toISOString()
    setItems(current => filter === 'unread' ? [] : current.map(item => ({ ...item, read_at: item.read_at ?? readAt })))
    setUnreadCount(0)

    try {
      const client = await getWorkingClient()
      const { error: updateError } = await client
        .from('activity_events')
        .update({ read_at: readAt })
        .eq('user_id', userId)
        .is('read_at', null)
      if (updateError) throw updateError
      return true
    } catch (updateError) {
      setItems(previousItems)
      setUnreadCount(previousUnreadCount)
      setError(updateError instanceof Error ? updateError.message : 'Unable to mark Activity read')
      return false
    }
  }, [filter, items, unreadCount, userId])

  return (
    <ActivityContext.Provider value={{
      items,
      filter,
      loading,
      loadingMore,
      error,
      unreadCount,
      hasMore,
      announcement,
      realtimeStatus,
      setFilter,
      refresh,
      loadMore,
      markRead,
      markAllRead,
    }}>
      {children}
    </ActivityContext.Provider>
  )
}
