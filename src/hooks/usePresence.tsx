/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  fetchPresenceStates,
  getRealtimeClient,
  getWorkingClient,
  type PresenceSnapshot,
} from '../lib/supabase'
import type { PresenceState } from '../types'

const PRESENCE_REFRESH_MS = 30000
const PRESENCE_REALTIME_DEBOUNCE_MS = 350
const PRESENCE_ACTIVE_WINDOW_MS = 2 * 60 * 1000

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

type UserPresenceRealtimeRow = {
  user_id?: string | null
  status?: string | null
  last_seen?: string | null
}

const resolvePresenceFromHeartbeat = (
  existing: PresenceSnapshot,
  row: UserPresenceRealtimeRow,
  now = Date.now()
) => {
  const lastSeen = row.last_seen ?? existing.last_seen ?? null
  const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0
  const fresh = Boolean(lastSeenMs && now - lastSeenMs < PRESENCE_ACTIVE_WINDOW_MS)
  const online = row.status === 'online' && fresh
  const presenceState: PresenceState = existing.presence_visibility === 'invisible'
    ? 'invisible'
    : online
      ? 'online'
      : 'offline'

  return {
    ...existing,
    last_seen: lastSeen,
    presence_state: presenceState,
    is_active: existing.presence_visibility === 'tracked' && online,
  }
}

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
  const presenceByUserIdRef = useRef<Record<string, PresenceSnapshot>>({})

  useEffect(() => {
    presenceByUserIdRef.current = presenceByUserId
  }, [presenceByUserId])

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

  const applyPresenceRealtimePayload = useCallback((payload: any) => {
    const row = (payload.new || payload.old) as UserPresenceRealtimeRow | undefined
    const targetUserId = row?.user_id
    if (!targetUserId) {
      refreshSoon()
      return
    }

    const existing = presenceByUserIdRef.current[targetUserId]
    if (!existing) {
      refreshSoon()
      return
    }

    const nextRow = payload.eventType === 'DELETE'
      ? { ...row, status: 'offline', last_seen: null }
      : row
    const nextPresence = resolvePresenceFromHeartbeat(existing, nextRow)

    presenceByUserIdRef.current = {
      ...presenceByUserIdRef.current,
      [targetUserId]: nextPresence,
    }
    setPresenceByUserId(presenceByUserIdRef.current)
  }, [refreshSoon])

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
          (payload: any) => {
            applyPresenceRealtimePayload(payload)
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
  }, [applyPresenceRealtimePayload, refresh, refreshSoon, userId])

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
