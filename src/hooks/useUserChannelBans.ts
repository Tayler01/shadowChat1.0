import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getRealtimeClient, getWorkingClient } from '../lib/supabase'
import {
  CHANNEL_BANS_CHANGED_EVENT,
  listPublicUserChannelBans,
  type PublicUserChannelBan,
} from '../lib/moderation'

const CACHE_TTL_MS = 30000

const banCache = new Map<string, { bans: PublicUserChannelBan[]; fetchedAt: number }>()
const inFlightFetches = new Map<string, Promise<PublicUserChannelBan[]>>()

const fetchUserBans = async (userId: string, force = false) => {
  const cached = banCache.get(userId)
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.bans
  }

  const inFlight = inFlightFetches.get(userId)
  if (inFlight && !force) {
    return inFlight
  }

  const request = listPublicUserChannelBans([userId])
    .then(bans => {
      banCache.set(userId, { bans, fetchedAt: Date.now() })
      return bans
    })
    .finally(() => {
      inFlightFetches.delete(userId)
    })

  inFlightFetches.set(userId, request)
  return request
}

export function useUserChannelBans(userId?: string | null) {
  const [bans, setBans] = useState<PublicUserChannelBan[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (force = true) => {
    if (!userId) {
      setBans([])
      return []
    }

    setLoading(true)
    try {
      const nextBans = await fetchUserBans(userId, force)
      setBans(nextBans)
      return nextBans
    } catch {
      setBans([])
      return []
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setBans([])
      return
    }

    let cancelled = false
    setLoading(true)

    fetchUserBans(userId)
      .then(nextBans => {
        if (!cancelled) setBans(nextBans)
      })
      .catch(() => {
        if (!cancelled) setBans([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return

    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ targetUserId?: string }>).detail
      if (!detail?.targetUserId || detail.targetUserId === userId) {
        void refresh(true)
      }
    }

    window.addEventListener(CHANNEL_BANS_CHANGED_EVENT, handleChange)
    return () => window.removeEventListener(CHANNEL_BANS_CHANGED_EVENT, handleChange)
  }, [refresh, userId])

  useEffect(() => {
    if (!userId) return

    let channel: RealtimeChannel | null = null
    let currentClient: any = null

    const subscribe = async () => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()
      if (!currentClient?.channel) return

      channel = currentClient
        .channel(`public:user_channel_bans:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_channel_bans',
            filter: `target_user_id=eq.${userId}`,
          },
          () => {
            void refresh(true)
          }
        )
        .subscribe()
    }

    void subscribe()

    return () => {
      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      } else if (channel && getRealtimeClient()?.removeChannel) {
        getRealtimeClient()?.removeChannel(channel)
      }
    }
  }, [refresh, userId])

  return useMemo(() => ({
    bans,
    hasActiveBan: bans.length > 0,
    loading,
    refresh,
  }), [bans, loading, refresh])
}
