import { PRIVATE_REALTIME_ENABLED } from '../../../../src/lib/privateRealtimeChannels'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getRealtimeClient, getWorkingClient } from '../lib/supabase'
import { createRealtimeChannelName } from '../../../../src/lib/realtimeChannelName'
import { runRealtimeRecovery } from '../../../../src/lib/realtimeRecovery'
import { useAuth } from './useAuth'
import { useRealtimeRecovery } from '../../../../src/hooks/useRealtimeRecovery'
import type { AdminRole } from '../lib/supabase'
import type { PresenceVisibility } from '../../../../src/types'

export interface TypingUser {
  id: string
  username: string
  display_name: string
  admin_role?: AdminRole | null
  presence_visibility?: PresenceVisibility | null
}

const useLegacyTyping = (channelName: string = 'general') => {
  const { user } = useAuth()
  const userId = user?.id
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const isTypingRef = useRef(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const clientRef = useRef<SupabaseClient | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel | null>) | null>(null)

  const resetTypingChannel = useCallback(async () => {
    const activeChannel = channelRef.current
    if (activeChannel && clientRef.current?.removeChannel) {
      try {
        clientRef.current.removeChannel(activeChannel)
      } catch {
        // ignore channel cleanup failures
      }
    }

    channelRef.current = null
    setTypingUsers([])

    if (subscribeRef.current) {
      channelRef.current = await subscribeRef.current().catch(() => null)
    }
  }, [])

  useRealtimeRecovery(() => {
    void resetTypingChannel()
  })

  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    const setupChannel = async (): Promise<RealtimeChannel | null> => {
      const client = await getWorkingClient().catch(() => getRealtimeClient());
      if (!client?.channel) return null;
      clientRef.current = client;
      channel = client.channel(`typing:${channelName}`);
      channelRef.current = channel;

      // Listen for typing events
      channel?.on('broadcast', { event: 'typing' }, (payload) => {
        const { user: typingUser, typing } = payload.payload

        // Ignore events from the current user
        if (typingUser.id === userId) return

        setTypingUsers(prev => {
          if (typing) {
            // Add user to typing list if not already there
            if (!prev.find(u => u.id === typingUser.id)) {
              return [...prev, typingUser]
            }
            return prev
          } else {
            // Remove user from typing list
            return prev.filter(u => u.id !== typingUser.id)
          }
        })

        // Auto-remove typing users after 3 seconds of inactivity
        if (typing) {
          setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u.id !== typingUser.id))
          }, 3000)
        }
      })
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void runRealtimeRecovery('channel-error')
        }
      })

      return channel
    };

    subscribeRef.current = setupChannel;
    setupChannel();

    return () => {
      subscribeRef.current = null;
      if (channel && clientRef.current) {
        clientRef.current.removeChannel(channel);
      }
    }
  }, [channelName, userId])

  const stopTyping = useCallback(async () => {
    if (!isTypingRef.current || !user) return

    try {
      isTypingRef.current = false
      setIsTyping(false)

      // Broadcast typing stop using current user info
      await channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user: {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            admin_role: user.admin_role,
            presence_visibility: user.presence_visibility,
          },
          typing: false
        }
      })

      // Clear timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = undefined
      }
    } catch {
    }
  }, [user])

  const startTyping = useCallback(async () => {
    if (!user) return

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Auto-stop typing after 2 seconds of inactivity. Refresh this on each keystroke
    // without rebroadcasting "typing: true" while the user is already typing.
    typingTimeoutRef.current = setTimeout(() => {
      void stopTyping()
    }, 2000)

    if (isTypingRef.current) return

    try {
      isTypingRef.current = true
      setIsTyping(true)

      // Broadcast typing start using current user info
      await channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user: {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            admin_role: user.admin_role,
            presence_visibility: user.presence_visibility,
          },
          typing: true
        }
      })

    } catch {
    }
  }, [user, stopTyping])

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      isTypingRef.current = false
    }
  }, [])

  return {
    typingUsers,
    isTyping,
    startTyping,
    stopTyping
  }
}

const TYPING_REFRESH_MS = 2000
const TYPING_TTL_MS = 6000
const TYPING_READ_DEBOUNCE_MS = 150
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const VALID_SCOPE = new RegExp(`^(?:general|dm-${UUID}|general-thread:${UUID})$`, 'i')

const useAuthorizedTyping = (channelName: string = 'general') => {
  const { user } = useAuth()
  const userId = user?.id
  const scopeKey = VALID_SCOPE.test(channelName) ? channelName.toLowerCase() : null
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [reconnectVersion, setReconnectVersion] = useState(0)
  const isTypingRef = useRef(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const lastWriteRef = useRef(-Infinity)
  const pendingWriteRef = useRef<Promise<void>>(Promise.resolve())
  const scopeRef = useRef({ key: scopeKey, userId, active: true })
  if (scopeRef.current.key !== scopeKey || scopeRef.current.userId !== userId) {
    scopeRef.current = { key: scopeKey, userId, active: true }
  }
  const scope = scopeRef.current
  const displayScopeRef = useRef(scope)

  const writeTyping = useCallback((typing: boolean) => {
    if (!scopeKey || !userId) return Promise.resolve()
    // Serialize start/stop so a slow start cannot outlive a later stop. The RPC
    // derives identity and expiry on the server; no profile data leaves here.
    const pending = pendingWriteRef.current.catch(() => undefined).then(async () => {
      if (scopeRef.current !== scope || !scope.active) return
      const client = await getWorkingClient()
      if (scopeRef.current !== scope || !scope.active) return
      const { error } = await client.rpc('set_typing_status', {
        target_scope_key: scopeKey,
        p_is_typing: typing,
      })
      if (error) throw error
    }).catch(() => {
      // Missing migration, access denial or transport failure disables this
      // ephemeral indicator; never fall back to a public broadcast channel.
    })
    pendingWriteRef.current = pending
    return pending
  }, [scope, scopeKey, userId])

  const stopTyping = useCallback(async () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = undefined
    if (!isTypingRef.current) return
    isTypingRef.current = false
    setIsTyping(false)
    await writeTyping(false)
  }, [writeTyping])

  const startTyping = useCallback(async () => {
    if (!scopeKey || !userId || !scope.active || scopeRef.current !== scope) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => { void stopTyping() }, TYPING_REFRESH_MS)
    const wasTyping = isTypingRef.current
    isTypingRef.current = true
    setIsTyping(true)
    const now = Date.now()
    if (wasTyping && now - lastWriteRef.current < TYPING_REFRESH_MS) return
    lastWriteRef.current = now
    await writeTyping(true)
  }, [scope, scopeKey, stopTyping, userId, writeTyping])

  const recover = useCallback(() => {
    if (scopeRef.current.active) setReconnectVersion(value => value + 1)
  }, [])
  useRealtimeRecovery(recover)

  useEffect(() => {
    let disposed = false
    let channel: RealtimeChannel | null = null
    let client: Awaited<ReturnType<typeof getWorkingClient>> | null = null
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    let expiryTimer: ReturnType<typeof setTimeout> | undefined
    let requestVersion = 0
    let rows: Array<{ user: TypingUser; expiresAt: number }> = []
    scope.active = true
    isTypingRef.current = false
    lastWriteRef.current = -Infinity
    pendingWriteRef.current = Promise.resolve()
    setIsTyping(false)
    setTypingUsers([])
    displayScopeRef.current = scope

    const current = () => !disposed && scopeRef.current === scope && scope.active
    const expire = () => {
      if (!current()) return
      if (expiryTimer) clearTimeout(expiryTimer)
      rows = rows.filter(row => row.expiresAt > Date.now())
      setTypingUsers(rows.map(row => row.user))
      if (rows.length) {
        expiryTimer = setTimeout(expire, Math.max(1, Math.min(...rows.map(row => row.expiresAt)) - Date.now() + 1))
      }
    }
    const refresh = async () => {
      if (!current() || !client || !scopeKey || !userId || document.visibilityState !== 'visible') return
      const version = ++requestVersion
      try {
        const { data, error } = await client.rpc('list_typing_states', { target_scope_key: scopeKey })
        if (!current() || version !== requestVersion) return
        const now = Date.now()
        rows = !error && Array.isArray(data) ? data.flatMap(row => {
          if (typeof row.user_id !== 'string' || row.user_id === userId || typeof row.username !== 'string') return []
          const expiresAt = Math.min(Date.parse(row.expires_at), now + TYPING_TTL_MS)
          if (!Number.isFinite(expiresAt) || expiresAt <= now) return []
          return [{
            expiresAt,
            user: {
              id: row.user_id,
              username: row.username,
              display_name: typeof row.display_name === 'string' && row.display_name ? row.display_name : row.username,
            },
          }]
        }) : []
        expire()
      } catch {
        if (current() && version === requestVersion) { rows = []; expire() }
      }
    }
    const scheduleRefresh = () => {
      if (!current() || refreshTimer) return
      refreshTimer = setTimeout(() => { refreshTimer = undefined; void refresh() }, TYPING_READ_DEBOUNCE_MS)
    }
    const handleBlocksChanged = () => { requestVersion += 1; rows = []; expire(); scheduleRefresh() }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefresh()
      else { requestVersion += 1; void stopTyping(); rows = []; expire() }
    }

    if (scopeKey && userId) {
      void (async () => {
        client = await getWorkingClient().catch(() => getRealtimeClient())
        if (!current() || !client?.channel) return
        channel = client.channel(createRealtimeChannelName(`typing:${scopeKey}`))
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'typing_states', filter: `scope_key=eq.${scopeKey}` }, scheduleRefresh)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'typing_states', filter: `scope_key=eq.${scopeKey}` }, scheduleRefresh)
          .subscribe((status: string) => {
            if (!current()) return
            if (status === 'SUBSCRIBED') scheduleRefresh()
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              void runRealtimeRecovery('channel-error').catch(() => undefined)
            }
          })
        await refresh()
      })().catch(() => undefined)
      document.addEventListener('visibilitychange', handleVisibility)
      window.addEventListener('shadowchat:personal-blocks-changed', handleBlocksChanged)
    }

    return () => {
      disposed = true
      scope.active = false
      requestVersion += 1
      if (refreshTimer) clearTimeout(refreshTimer)
      if (expiryTimer) clearTimeout(expiryTimer)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      isTypingRef.current = false
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('shadowchat:personal-blocks-changed', handleBlocksChanged)
      if (channel && client?.removeChannel) void Promise.resolve(client.removeChannel(channel)).catch(() => undefined)
    }
  }, [reconnectVersion, scope, scopeKey, stopTyping, userId])

  return { typingUsers: displayScopeRef.current === scope ? typingUsers : [], isTyping, startTyping, stopTyping }
}

// Build-time selection preserves the legacy transport until coordinated private cutover.
export const useTyping = PRIVATE_REALTIME_ENABLED ? useAuthorizedTyping : useLegacyTyping
