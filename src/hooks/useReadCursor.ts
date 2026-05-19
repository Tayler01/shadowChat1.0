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

export function useReadCursor(
  surface: ReadSurface,
  scopeId?: string | null,
  enabled = true
) {
  const { user } = useAuth()
  const normalizedScopeId = useMemo(() => normalizeScopeId(scopeId), [scopeId])
  const [cursor, setCursor] = useState<UserReadCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel | null>) | null>(null)
  const hasLoadedRef = useRef(false)

  const refresh = useCallback(async (options: RefreshOptions = {}) => {
    if (!enabled || !user) {
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
      setCursor(nextCursor)
      return nextCursor
    } catch {
      setCursor(null)
      return null
    } finally {
      hasLoadedRef.current = true
      setLoading(false)
    }
  }, [enabled, normalizedScopeId, surface, user])

  useEffect(() => {
    void refresh()
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
            setCursor(payload.eventType === 'DELETE' ? null : (payload.new as UserReadCursor))
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
  }, [enabled, normalizedScopeId, surface, user])

  const markRead = useCallback(async (messageId: string | null, messageCreatedAt?: string | null) => {
    if (!enabled || !user) return null

    const nextCursor = await setUserReadCursor(
      surface,
      normalizedScopeId,
      messageId,
      messageCreatedAt
    )
    setCursor(nextCursor)
    return nextCursor
  }, [enabled, normalizedScopeId, surface, user])

  return {
    cursor,
    loading,
    refresh,
    markRead,
  }
}
