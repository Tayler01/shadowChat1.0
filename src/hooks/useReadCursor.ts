import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  fetchUserReadCursor,
  setUserReadCursor,
  type ReadSurface,
  type UserReadCursor,
} from '../lib/readCursors'
import { getRealtimeClient, getWorkingClient } from '../lib/supabase'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { createRealtimeChannelName } from '../lib/realtimeChannelName'
import { useAuth } from './useAuth'
import { useRealtimeRecovery } from './useRealtimeRecovery'

const normalizeScopeId = (scopeId?: string | null) => scopeId?.trim() || 'main'

type RefreshOptions = {
  silent?: boolean
}

const readCursorCache = new Map<string, UserReadCursor | null>()

const getReadCursorCacheKey = (
  userId: string,
  surface: ReadSurface,
  scopeId: string
) => `${userId}:${surface}:${scopeId}`

export function useReadCursor(
  surface: ReadSurface,
  scopeId?: string | null,
  enabled = true
) {
  const { user } = useAuth()
  const normalizedScopeId = useMemo(() => normalizeScopeId(scopeId), [scopeId])
  const cacheKey = enabled && user?.id
    ? getReadCursorCacheKey(user.id, surface, normalizedScopeId)
    : null
  const cachedCursor = cacheKey ? readCursorCache.get(cacheKey) : undefined
  const [cursor, setCursor] = useState<UserReadCursor | null>(() => cachedCursor ?? null)
  const [loading, setLoading] = useState(() => Boolean(cacheKey && cachedCursor === undefined))
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel | null>) | null>(null)
  const hasLoadedRef = useRef(cachedCursor !== undefined)

  const refresh = useCallback(async (options: RefreshOptions = {}) => {
    if (!enabled || !user || !cacheKey) {
      setCursor(null)
      hasLoadedRef.current = true
      setLoading(false)
      return null
    }

    const showLoading = !options.silent || !hasLoadedRef.current
    if (showLoading) {
      setLoading(true)
    }

    try {
      const nextCursor = await fetchUserReadCursor(surface, normalizedScopeId)
      readCursorCache.set(cacheKey, nextCursor)
      setCursor(nextCursor)
      return nextCursor
    } catch {
      setCursor(null)
      return null
    } finally {
      hasLoadedRef.current = true
      setLoading(false)
    }
  }, [cacheKey, enabled, normalizedScopeId, surface, user])

  useEffect(() => {
    if (!cacheKey) {
      setCursor(null)
      hasLoadedRef.current = true
      setLoading(false)
      return
    }

    const nextCachedCursor = readCursorCache.get(cacheKey)
    if (nextCachedCursor !== undefined) {
      setCursor(nextCachedCursor)
      hasLoadedRef.current = true
      setLoading(false)
      return
    }

    setCursor(null)
    hasLoadedRef.current = false
    setLoading(true)
  }, [cacheKey])

  useEffect(() => {
    void refresh({ silent: hasLoadedRef.current })
  }, [refresh])

  const resetCursorChannel = useCallback(async () => {
    await refresh({ silent: true })

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
    void resetCursorChannel()
  })

  useEffect(() => {
    if (!enabled || !user) return

    let channel: RealtimeChannel | null = null
    let currentClient: any = null

    const subscribe = async (): Promise<RealtimeChannel | null> => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()
      if (!currentClient?.channel) return null

      channel = currentClient
        .channel(createRealtimeChannelName(`public:user_read_cursors:${user.id}:${surface}:${normalizedScopeId}`))
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_read_cursors',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const row = (payload.new || payload.old) as UserReadCursor | undefined
            if (!row || row.surface !== surface || row.scope_id !== normalizedScopeId) {
              return
            }
            const nextCursor = payload.eventType === 'DELETE' ? null : (payload.new as UserReadCursor)
            if (cacheKey) {
              readCursorCache.set(cacheKey, nextCursor)
            }
            setCursor(nextCursor)
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
      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [cacheKey, enabled, normalizedScopeId, surface, user])

  const markRead = useCallback(async (messageId: string | null, messageCreatedAt?: string | null) => {
    if (!enabled || !user || !cacheKey) return null

    const nextCursor = await setUserReadCursor(
      surface,
      normalizedScopeId,
      messageId,
      messageCreatedAt
    )
    readCursorCache.set(cacheKey, nextCursor)
    setCursor(nextCursor)
    return nextCursor
  }, [cacheKey, enabled, normalizedScopeId, surface, user])

  return {
    cursor,
    loading,
    refresh,
    markRead,
  }
}
