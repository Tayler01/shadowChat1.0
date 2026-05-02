import { useState, useEffect, useCallback, useRef } from 'react'
import { getRealtimeClient, getWorkingClient } from '../lib/supabase'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { useAuth } from './useAuth'
import { useRealtimeRecovery } from './useRealtimeRecovery'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { AdminRole } from '../lib/supabase'
import type { PresenceVisibility } from '../types'

export interface TypingUser {
  id: string
  username: string
  display_name: string
  admin_role?: AdminRole | null
  presence_visibility?: PresenceVisibility | null
}

export const useTyping = (channelName: string = 'general') => {
  const { user } = useAuth()
  const userId = user?.id
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const [isTyping, setIsTyping] = useState(false)
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
    if (!isTyping || !user) return

    try {
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
      }
    } catch (err) {
    }
  }, [isTyping, user])

  const startTyping = useCallback(async () => {
    if (isTyping || !user) return

    try {
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

      // Clear any existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      // Auto-stop typing after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping()
      }, 2000)
    } catch (err) {
    }
  }, [isTyping, user, stopTyping])

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [])

  return {
    typingUsers,
    isTyping,
    startTyping,
    stopTyping
  }
}
