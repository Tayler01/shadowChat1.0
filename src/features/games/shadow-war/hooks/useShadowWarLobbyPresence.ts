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

export function useShadowWarLobbyPresence(active: boolean = true) {
  const { user } = useAuth()
  const [users, setUsers] = useState<ShadowWarLobbyUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const clientRef = useRef<any>(null)

  useEffect(() => {
    if (!active || !user) {
      setUsers([])
      return
    }

    let cancelled = false

    const setup = async () => {
      const client = await getWorkingClient().catch(() => getRealtimeClient())
      if (!client?.channel || cancelled) return

      clientRef.current = client
      const channel = client.channel('shadow-war:lobby-presence', {
        config: { presence: { key: user.id } },
      })
      channelRef.current = channel

      const syncUsers = () => {
        const state = channel.presenceState() as PresenceState
        const nextUsers = Object.values(state)
          .flat()
          .filter(Boolean)
          .sort((a, b) => a.joinedAt - b.joinedAt)
        setUsers(nextUsers)
      }

      channel
        .on('presence', { event: 'sync' }, syncUsers)
        .subscribe((status: string) => {
          if (status !== 'SUBSCRIBED') return
          void channel.track({
            id: user.id,
            name: user.display_name || user.username || 'Shadow player',
            avatarUrl: user.avatar_url,
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
  }, [active, user])

  return useMemo(() => ({ users }), [users])
}

