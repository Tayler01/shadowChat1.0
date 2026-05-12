import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getRealtimeClient, getWorkingClient } from '../../../../lib/supabase'
import { useAuth } from '../../../../hooks/useAuth'

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

export function useShadowWarLobbyPresence(active: boolean = true) {
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
