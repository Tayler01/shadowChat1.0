import { PRIVATE_REALTIME_ENABLED } from '../../../../lib/privateRealtimeChannels'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getRealtimeClient, getWorkingClient } from '../../../../lib/supabase'
import { createRealtimeChannelName } from '../../../../lib/realtimeChannelName'
import { runRealtimeRecovery } from '../../../../lib/realtimeRecovery'
import { useAuth } from '../../../../hooks/useAuth'
import { useRealtimeRecovery } from '../../../../hooks/useRealtimeRecovery'

export interface ShadowWarLobbyUser {
  id: string
  name: string
  avatarUrl?: string | null
  joinedAt: number
}

type PresenceState = Record<string, ShadowWarLobbyUser[]>

const dedupeLobbyUsers = (users: ShadowWarLobbyUser[]) => {
  const usersById = new Map<string, ShadowWarLobbyUser>()

  users.forEach(nextUser => {
    const existingUser = usersById.get(nextUser.id)
    if (!existingUser || nextUser.joinedAt >= existingUser.joinedAt) {
      usersById.set(nextUser.id, nextUser)
    }
  })

  return Array.from(usersById.values()).sort((a, b) => a.joinedAt - b.joinedAt)
}

function useLegacyLobbyPresence(active: boolean = true) {
  const { user } = useAuth()
  const userId = user?.id
  const userName = user?.display_name || user?.username || 'Shadow player'
  const userAvatarUrl = user?.avatar_url
  const [users, setUsers] = useState<ShadowWarLobbyUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const clientRef = useRef<any>(null)

  useEffect(() => {
    if (!active || !userId) {
      setUsers([])
      return
    }

    let cancelled = false

    const setup = async () => {
      const client = await getWorkingClient().catch(() => getRealtimeClient())
      if (!client?.channel || cancelled) return

      clientRef.current = client
      const channel = client.channel('shadow-war:lobby-presence', {
        config: { presence: { key: userId } },
      })
      channelRef.current = channel

      const syncUsers = () => {
        const state = channel.presenceState() as PresenceState
        const nextUsers = dedupeLobbyUsers(Object.values(state)
          .flat()
          .filter(Boolean))
        setUsers(nextUsers)
      }

      channel
        .on('presence', { event: 'sync' }, syncUsers)
        .subscribe((status: string) => {
          if (status !== 'SUBSCRIBED') return
          void channel.track({
            id: userId,
            name: userName,
            avatarUrl: userAvatarUrl,
            joinedAt: Date.now(),
          })
        })
    }

    void setup()

    return () => {
      cancelled = true
      const channel = channelRef.current
      const client = clientRef.current
      if (channel && client?.removeChannel) {
        client.removeChannel(channel)
      }
      channelRef.current = null
      setUsers([])
    }
  }, [active, userAvatarUrl, userId, userName])

  return useMemo(() => ({ users }), [users])
}

const HEARTBEAT_MS = 15_000
const LEASE_MS = 45_000

function useAuthorizedLobbyPresence(active: boolean = true) {
  const { user } = useAuth()
  const userId = user?.id
  const accountRef = useRef(userId)
  accountRef.current = userId
  const [state, setState] = useState<{ userId?: string; users: ShadowWarLobbyUser[] }>({ users: [] })
  const [reconnectVersion, setReconnectVersion] = useState(0)
  const mountedRef = useRef(false)
  const pendingWriteRef = useRef(Promise.resolve())
  const recover = useCallback(() => { if (mountedRef.current) setReconnectVersion(value => value + 1) }, [])
  useRealtimeRecovery(recover)

  useEffect(() => {
    mountedRef.current = true
    let disposed = false
    let client: Awaited<ReturnType<typeof getWorkingClient>> | null = null
    let channel: RealtimeChannel | null = null
    let requestVersion = 0
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    let expiryTimer: ReturnType<typeof setTimeout> | undefined
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined
    let rows: Array<{ user: ShadowWarLobbyUser; expiresAt: number }> = []
    const current = () => !disposed && active && userId && accountRef.current === userId
    setState({ userId, users: [] })

    const expire = () => {
      if (!current()) return
      if (expiryTimer) clearTimeout(expiryTimer)
      rows = rows.filter(row => row.expiresAt > Date.now())
      setState({ userId, users: rows.map(row => row.user) })
      if (rows.length) expiryTimer = setTimeout(expire, Math.max(1, Math.min(...rows.map(row => row.expiresAt)) - Date.now() + 1))
    }
    const refresh = async () => {
      if (!current() || !client || document.visibilityState !== 'visible') return
      const version = ++requestVersion
      try {
        const { data, error } = await client.rpc('list_shadow_war_lobby_presence')
        if (!current() || version !== requestVersion) return
        const now = Date.now()
        rows = !error && Array.isArray(data) ? data.flatMap(row => {
          if (typeof row?.user_id !== 'string' || typeof row.username !== 'string') return []
          const expiresAt = Math.min(Date.parse(row.expires_at), now + LEASE_MS)
          if (!Number.isFinite(expiresAt) || expiresAt <= now) return []
          return [{ expiresAt, user: {
            id: row.user_id,
            name: row.display_name || row.username,
            avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
            joinedAt: Date.parse(row.joined_at) || now,
          } }]
        }) : []
        expire()
      } catch {
        if (current() && version === requestVersion) { rows = []; expire() }
      }
    }
    const write = (present: boolean) => {
      pendingWriteRef.current = pendingWriteRef.current.catch(() => undefined).then(async () => {
        // A final stop can follow an in-flight start after ordinary unmount, but
        // never acts on a replacement account. No caller-supplied identity.
        if (!client || !userId || accountRef.current !== userId || (present && !current())) return
        const { data: { session } } = await client.auth.getSession()
        if (session?.user?.id !== userId || accountRef.current !== userId || (present && !current())) return
        await client.rpc('set_shadow_war_lobby_presence', { p_is_present: present })
      }).catch(() => undefined)
      return pendingWriteRef.current
    }
    const scheduleRefresh = () => {
      if (!current() || refreshTimer) return
      refreshTimer = setTimeout(() => { refreshTimer = undefined; void refresh() }, 150)
    }
    const heartbeat = () => {
      if (!current() || document.visibilityState !== 'visible') return
      void write(true).then(refresh)
    }
    const clear = () => { requestVersion += 1; rows = []; expire() }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') heartbeat()
      else { clear(); void write(false) }
    }
    const onBlocks = () => { clear(); scheduleRefresh() }

    if (active && userId) {
      void (async () => {
        client = await getWorkingClient().catch(() => getRealtimeClient())
        if (!current() || !client?.channel) return
        channel = client.channel(createRealtimeChannelName('shadow-war:lobby-roster'))
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shadow_war_lobby_presence' }, scheduleRefresh)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shadow_war_lobby_presence' }, scheduleRefresh)
          .subscribe((status: string) => {
            if (!current()) return
            if (status === 'SUBSCRIBED') scheduleRefresh()
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') void runRealtimeRecovery('channel-error').catch(() => undefined)
          })
        heartbeat()
        heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS)
      })().catch(() => undefined)
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('shadowchat:personal-blocks-changed', onBlocks)
    }

    return () => {
      disposed = true
      mountedRef.current = false
      requestVersion += 1
      if (refreshTimer) clearTimeout(refreshTimer)
      if (expiryTimer) clearTimeout(expiryTimer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('shadowchat:personal-blocks-changed', onBlocks)
      if (channel && client?.removeChannel) void Promise.resolve(client.removeChannel(channel)).catch(() => undefined)
      void write(false)
    }
  }, [active, reconnectVersion, userId])

  return { users: active && state.userId === userId ? state.users : [] }
}

export const useShadowWarLobbyPresence = PRIVATE_REALTIME_ENABLED ? useAuthorizedLobbyPresence : useLegacyLobbyPresence
