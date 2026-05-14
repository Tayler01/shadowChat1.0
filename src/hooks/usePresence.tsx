/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  fetchPresenceStates,
  getRealtimeClient,
  getWorkingClient,
  type PresenceSnapshot,
} from '../lib/supabase'
import type { PresenceState, PresenceVisibility } from '../types'

const PRESENCE_REFRESH_MS = 30000
const PRESENCE_REALTIME_DEBOUNCE_MS = 350
const PRESENCE_ACTIVE_WINDOW_MS = 2 * 60 * 1000

type PresenceContextValue = {
  store: PresenceStore
  refresh: () => Promise<void>
}

const normalizePresence = (rows: PresenceSnapshot[]) =>
  Object.fromEntries(rows.map(row => [row.user_id, row]))

const getVisibleDocument = () =>
  typeof document === 'undefined' || document.visibilityState !== 'hidden'

const getActiveUsersSnapshot = (presenceByUserId: Record<string, PresenceSnapshot>) =>
  Object.values(presenceByUserId)
    .filter(row => row.is_active)
    .sort((left, right) =>
      (left.display_name || left.username || '').localeCompare(
        right.display_name || right.username || ''
      )
    )

const activeUsersEqual = (left: PresenceSnapshot[], right: PresenceSnapshot[]) =>
  left.length === right.length && left.every((item, index) => item === right[index])

type PresenceStore = {
  subscribe: (listener: () => void) => () => void
  getPresenceByUserId: () => Record<string, PresenceSnapshot>
  getPresenceForUser: (userId?: string | null) => PresenceSnapshot | null
  getActiveUsers: () => PresenceSnapshot[]
  setPresenceByUserId: (nextPresenceByUserId: Record<string, PresenceSnapshot>) => void
}

const createPresenceStore = (): PresenceStore => {
  let presenceByUserId: Record<string, PresenceSnapshot> = {}
  let activeUsers: PresenceSnapshot[] = []
  const listeners = new Set<() => void>()

  const emit = () => {
    listeners.forEach(listener => listener())
  }

  const setPresenceByUserId = (nextPresenceByUserId: Record<string, PresenceSnapshot>) => {
    const nextActiveUsers = getActiveUsersSnapshot(nextPresenceByUserId)
    presenceByUserId = nextPresenceByUserId
    activeUsers = activeUsersEqual(activeUsers, nextActiveUsers) ? activeUsers : nextActiveUsers
    emit()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getPresenceByUserId() {
      return presenceByUserId
    },
    getPresenceForUser(userId) {
      return userId ? presenceByUserId[userId] ?? null : null
    },
    getActiveUsers() {
      return activeUsers
    },
    setPresenceByUserId,
  }
}

const fallbackPresenceStore = createPresenceStore()

const PresenceContext = createContext<PresenceContextValue>({
  store: fallbackPresenceStore,
  refresh: async () => undefined,
})

type UserPresenceRealtimeRow = {
  user_id?: string | null
  status?: string | null
  last_seen?: string | null
}

type UserProfileRealtimeRow = {
  id?: string | null
  username?: string | null
  display_name?: string | null
  avatar_url?: string | null
  color?: string | null
  presence_visibility?: PresenceVisibility | null
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
  const storeRef = useRef<PresenceStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = createPresenceStore()
  }
  const store = storeRef.current
  const aliveRef = useRef(true)
  const refreshInFlightRef = useRef<Promise<void> | null>(null)
  const refreshTimerRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) {
      store.setPresenceByUserId({})
      return
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current
    }

    refreshInFlightRef.current = fetchPresenceStates()
      .then(rows => {
        if (aliveRef.current) {
          store.setPresenceByUserId(normalizePresence(rows))
        }
      })
      .catch(() => undefined)
      .finally(() => {
        refreshInFlightRef.current = null
      })

    return refreshInFlightRef.current
  }, [store, userId])

  const refreshSoon = useCallback(() => {
    if (!getVisibleDocument()) {
      return
    }

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

    const existing = store.getPresenceForUser(targetUserId)
    if (!existing) {
      refreshSoon()
      return
    }

    const nextRow = payload.eventType === 'DELETE'
      ? { ...row, status: 'offline', last_seen: null }
      : row
    const nextPresence = resolvePresenceFromHeartbeat(existing, nextRow)

    store.setPresenceByUserId({
      ...store.getPresenceByUserId(),
      [targetUserId]: nextPresence,
    })
  }, [refreshSoon, store])

  const applyUserRealtimePayload = useCallback((payload: any) => {
    const row = payload.new as UserProfileRealtimeRow | undefined
    const targetUserId = row?.id
    if (!targetUserId) {
      refreshSoon()
      return
    }

    const existing = store.getPresenceForUser(targetUserId)
    if (!existing) {
      refreshSoon()
      return
    }

    const nextBase: PresenceSnapshot = {
      ...existing,
      username: row.username ?? existing.username,
      display_name: row.display_name ?? existing.display_name,
      avatar_url: row.avatar_url ?? existing.avatar_url,
      color: row.color ?? existing.color,
      presence_visibility: row.presence_visibility ?? existing.presence_visibility,
    }
    const nextPresence = resolvePresenceFromHeartbeat(nextBase, {
      status: existing.presence_state === 'online' ? 'online' : 'offline',
      last_seen: existing.last_seen,
    })

    store.setPresenceByUserId({
      ...store.getPresenceByUserId(),
      [targetUserId]: nextPresence,
    })
  }, [refreshSoon, store])

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
      store.setPresenceByUserId({})
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
          (payload: any) => {
            applyUserRealtimePayload(payload)
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
      if (getVisibleDocument()) {
        void refresh()
      }
    }, PRESENCE_REFRESH_MS)

    const refreshWhenVisible = () => {
      if (getVisibleDocument()) {
        void refresh()
      }
    }

    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)

    return () => {
      disposed = true
      clearReconnect()
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      } else if (channel && getRealtimeClient()?.removeChannel) {
        getRealtimeClient()?.removeChannel(channel)
      }
    }
  }, [applyPresenceRealtimePayload, applyUserRealtimePayload, refresh, store, userId])

  const value = useMemo(
    () => ({
      store,
      refresh,
    }),
    [refresh, store]
  )

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  const { store, refresh } = useContext(PresenceContext)
  const presenceByUserId = useSyncExternalStore(
    store.subscribe,
    store.getPresenceByUserId,
    fallbackPresenceStore.getPresenceByUserId
  )
  const activeUsers = useSyncExternalStore(
    store.subscribe,
    store.getActiveUsers,
    fallbackPresenceStore.getActiveUsers
  )

  return useMemo(() => ({
    presenceByUserId,
    activeUsers,
    refresh,
  }), [activeUsers, presenceByUserId, refresh])
}

export function usePresenceForUser(userId?: string | null) {
  const { store } = useContext(PresenceContext)
  return useSyncExternalStore(
    store.subscribe,
    () => store.getPresenceForUser(userId),
    () => fallbackPresenceStore.getPresenceForUser(userId)
  )
}

export function useActiveUsers() {
  const { store } = useContext(PresenceContext)
  return useSyncExternalStore(
    store.subscribe,
    store.getActiveUsers,
    fallbackPresenceStore.getActiveUsers
  )
}

export const getPresenceStateLabel = (state?: string | null) => {
  if (state === 'invisible') return 'Invisible'
  if (state === 'online') return 'Online'
  return 'Offline'
}
