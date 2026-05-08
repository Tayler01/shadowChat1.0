/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  fetchPresenceStates,
  getRealtimeClient,
  getWorkingClient,
  type PresenceSnapshot,
} from '../lib/supabase'

const PRESENCE_REFRESH_MS = 30000
const PRESENCE_REALTIME_DEBOUNCE_MS = 350

type PresenceContextValue = {
  presenceByUserId: Record<string, PresenceSnapshot>
  activeUsers: PresenceSnapshot[]
  refresh: () => Promise<void>
}

const PresenceContext = createContext<PresenceContextValue>({
  presenceByUserId: {},
  activeUsers: [],
  refresh: async () => undefined,
})

const normalizePresence = (rows: PresenceSnapshot[]) =>
  Object.fromEntries(rows.map(row => [row.user_id, row]))

export function PresenceProvider({
  children,
  userId,
}: {
  children: React.ReactNode
  userId?: string | null
}) {
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, PresenceSnapshot>>({})
  const aliveRef = useRef(true)
  const refreshInFlightRef = useRef<Promise<void> | null>(null)
  const refreshTimerRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) {
      setPresenceByUserId({})
      return
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current
    }

    refreshInFlightRef.current = fetchPresenceStates()
      .then(rows => {
        if (aliveRef.current) {
          setPresenceByUserId(normalizePresence(rows))
        }
      })
      .catch(() => undefined)
      .finally(() => {
        refreshInFlightRef.current = null
      })

    return refreshInFlightRef.current
  }, [userId])

  const refreshSoon = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current)
    }

    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      void refresh()
    }, PRESENCE_REALTIME_DEBOUNCE_MS)
  }, [refresh])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setPresenceByUserId({})
      return
    }

    let channel: RealtimeChannel | null = null
    let currentClient: any = null
    let reconnectTimer: number | null = null
    let disposed = false

    const clearReconnect = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const subscribe = async () => {
      clearReconnect()
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()

      if (!currentClient?.channel) {
        return
      }

      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      }

      channel = currentClient
        .channel('public:presence-state')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_presence' },
          () => {
            refreshSoon()
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'users' },
          () => {
            refreshSoon()
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            void refresh()
            return
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearReconnect()
            reconnectTimer = window.setTimeout(() => {
              if (!disposed) {
                void subscribe()
              }
            }, status === 'CLOSED' ? 1000 : 1800)
          }
        })
    }

    void refresh()
    void subscribe()
    const poll = window.setInterval(() => {
      void refresh()
    }, PRESENCE_REFRESH_MS)

    return () => {
      disposed = true
      clearReconnect()
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      window.clearInterval(poll)
      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      } else if (channel && getRealtimeClient()?.removeChannel) {
        getRealtimeClient()?.removeChannel(channel)
      }
    }
  }, [refresh, refreshSoon, userId])

  const activeUsers = useMemo(
    () =>
      Object.values(presenceByUserId)
        .filter(row => row.is_active)
        .sort((left, right) =>
          (left.display_name || left.username || '').localeCompare(
            right.display_name || right.username || ''
          )
        ),
    [presenceByUserId]
  )

  const value = useMemo(
    () => ({
      presenceByUserId,
      activeUsers,
      refresh,
    }),
    [activeUsers, presenceByUserId, refresh]
  )

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  return useContext(PresenceContext)
}

export function usePresenceForUser(userId?: string | null) {
  const { presenceByUserId } = usePresence()
  return userId ? presenceByUserId[userId] ?? null : null
}

export function useActiveUsers() {
  return usePresence().activeUsers
}

export const getPresenceStateLabel = (state?: string | null) => {
  if (state === 'invisible') return 'Invisible'
  if (state === 'online') return 'Online'
  return 'Offline'
}
