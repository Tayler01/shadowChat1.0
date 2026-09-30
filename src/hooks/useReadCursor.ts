import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  fetchUserReadCursor,
  isMessageKeyAtOrBefore,
  setUserReadCursor,
  type MessageKey,
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

export interface UseReadCursorResult {
  cursor: UserReadCursor | null
  loading: boolean
  error: unknown | null
  refresh: (options?: RefreshOptions) => Promise<UserReadCursor | null>
  markRead: (messageId: string | null, messageCreatedAt?: string | null) => Promise<UserReadCursor | null>
}

const readCursorCache = new Map<string, UserReadCursor | null>()

const getReadCursorCacheKey = (
  userId: string,
  surface: ReadSurface,
  scopeId: string
) => `${userId}:${surface}:${scopeId}`

const cursorToMessageKey = (cursor: UserReadCursor): MessageKey => ({
  created_at: cursor.last_read_at,
  id: cursor.last_read_message_id,
})

const keepLatestCursor = (
  currentCursor: UserReadCursor | null,
  nextCursor: UserReadCursor | null
) => {
  if (!nextCursor) return currentCursor
  if (!currentCursor) return nextCursor

  return isMessageKeyAtOrBefore(cursorToMessageKey(nextCursor), currentCursor)
    ? currentCursor
    : nextCursor
}

export function useReadCursor(
  surface: ReadSurface,
  scopeId?: string | null,
  enabled = true
): UseReadCursorResult {
  const { user } = useAuth()
  const normalizedScopeId = useMemo(() => normalizeScopeId(scopeId), [scopeId])
  const cacheKey = enabled && user?.id
    ? getReadCursorCacheKey(user.id, surface, normalizedScopeId)
    : null
  const cachedCursor = cacheKey ? readCursorCache.get(cacheKey) : undefined
  const [cursor, setCursor] = useState<UserReadCursor | null>(() => cachedCursor ?? null)
  const [loading, setLoading] = useState(() => Boolean(cacheKey && cachedCursor === undefined))
  const [error, setError] = useState<unknown | null>(null)
  const cursorRef = useRef<UserReadCursor | null>(cachedCursor ?? null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel | null>) | null>(null)
  const hasLoadedRef = useRef(cachedCursor !== undefined)
  const scopeEpochRef = useRef(0)
  const activeKeyRef = useRef(cacheKey)
  const requestVersionRef = useRef(0)
  const [publishedKey, setPublishedKey] = useState(cacheKey)
  if (activeKeyRef.current !== cacheKey) {
    activeKeyRef.current = cacheKey
    scopeEpochRef.current += 1
    requestVersionRef.current += 1
    cursorRef.current = cachedCursor ?? null
    hasLoadedRef.current = cachedCursor !== undefined
  }

  const setCursorState = useCallback((nextCursor: UserReadCursor | null) => {
    cursorRef.current = nextCursor
    setCursor(nextCursor)
  }, [])

  const refresh = useCallback(async (options: RefreshOptions = {}) => {
    const requestVersion = ++requestVersionRef.current
    if (!enabled || !user || !cacheKey) {
      setCursorState(null)
      setError(null)
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
      if (activeKeyRef.current !== cacheKey || requestVersion !== requestVersionRef.current) return nextCursor
      const resolvedCursor = keepLatestCursor(cursorRef.current, nextCursor)
      readCursorCache.set(cacheKey, resolvedCursor)
      setCursorState(resolvedCursor)
      setPublishedKey(cacheKey)
      setError(null)
      return resolvedCursor
    } catch (readCursorError) {
      if (activeKeyRef.current !== cacheKey || requestVersion !== requestVersionRef.current) return null
      setError(readCursorError)
      return cursorRef.current
    } finally {
      if (activeKeyRef.current === cacheKey && requestVersion === requestVersionRef.current) {
        hasLoadedRef.current = true
        setPublishedKey(cacheKey)
        setLoading(false)
      }
    }
  }, [cacheKey, enabled, normalizedScopeId, setCursorState, surface, user])

  useEffect(() => {
    setPublishedKey(cacheKey)
    if (!cacheKey) {
      setCursorState(null)
      setError(null)
      hasLoadedRef.current = true
      setLoading(false)
      return
    }

    const nextCachedCursor = readCursorCache.get(cacheKey)
    if (nextCachedCursor !== undefined) {
      setCursorState(nextCachedCursor)
      setError(null)
      hasLoadedRef.current = true
      setLoading(false)
      return
    }

    setCursorState(null)
    setError(null)
    hasLoadedRef.current = false
    setLoading(true)
  }, [cacheKey, setCursorState])

  useEffect(() => {
    void refresh({ silent: hasLoadedRef.current })
  }, [refresh])

  const resetCursorChannel = useCallback(async () => {
    const recoveryKey = cacheKey
    const recoveryVersion = requestVersionRef.current
    const recoveryEpoch = scopeEpochRef.current
    await refresh({ silent: true })
    if (scopeEpochRef.current !== recoveryEpoch || activeKeyRef.current !== recoveryKey || requestVersionRef.current > recoveryVersion + 1) return

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
      const recoveredChannel = await subscribeRef.current().catch(() => null)
      if (scopeEpochRef.current === recoveryEpoch && activeKeyRef.current === recoveryKey) channelRef.current = recoveredChannel
    }
  }, [cacheKey, refresh])

  useRealtimeRecovery(() => {
    void resetCursorChannel()
  })

  useEffect(() => {
    if (!enabled || !user) return

    let channel: RealtimeChannel | null = null
    let currentClient: any = null
    let disposed = false

    const subscribe = async (): Promise<RealtimeChannel | null> => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()
      if (disposed || activeKeyRef.current !== cacheKey) return null
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
            if (disposed || activeKeyRef.current !== cacheKey) return
            const row = (payload.new || payload.old) as UserReadCursor | undefined
            if (!row || row.surface !== surface || row.scope_id !== normalizedScopeId) {
              return
            }
            const nextCursor = payload.eventType === 'DELETE' ? null : (payload.new as UserReadCursor)
            const resolvedCursor = payload.eventType === 'DELETE'
              ? null
              : keepLatestCursor(cursorRef.current, nextCursor)
            if (cacheKey) {
              readCursorCache.set(cacheKey, resolvedCursor)
            }
            setCursorState(resolvedCursor)
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
      disposed = true
      subscribeRef.current = null
      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [cacheKey, enabled, normalizedScopeId, setCursorState, surface, user])

  const markRead = useCallback(async (messageId: string | null, messageCreatedAt?: string | null) => {
    if (!enabled || !user || !cacheKey) return null

    const currentCursor = cursorRef.current
    if (
      messageCreatedAt &&
      currentCursor &&
      isMessageKeyAtOrBefore({ created_at: messageCreatedAt, id: messageId }, currentCursor)
    ) {
      return currentCursor
    }

    try {
      const markVersion = scopeEpochRef.current
    const nextCursor = await setUserReadCursor(
        surface,
        normalizedScopeId,
        messageId,
        messageCreatedAt
      )
      if (activeKeyRef.current !== cacheKey || scopeEpochRef.current !== markVersion) return nextCursor
      const resolvedCursor = keepLatestCursor(cursorRef.current, nextCursor)
      readCursorCache.set(cacheKey, resolvedCursor)
      setCursorState(resolvedCursor)
      setError(null)
      return resolvedCursor
    } catch (readCursorError) {
      if (activeKeyRef.current !== cacheKey) throw readCursorError
      setError(readCursorError)
      throw readCursorError
    }
  }, [cacheKey, enabled, normalizedScopeId, setCursorState, surface, user])

  const hasCachedCursorValue = cacheKey ? readCursorCache.has(cacheKey) : false
  const scopeChanged = publishedKey !== cacheKey
  const loadingOrUnknown = scopeChanged
    ? Boolean(cacheKey && !hasCachedCursorValue)
    : loading || Boolean(cacheKey && error && cursor === null && !hasCachedCursorValue)

  return {
    cursor: scopeChanged ? cachedCursor ?? null : cursor,
    loading: loadingOrUnknown,
    error,
    refresh,
    markRead,
  }
}
