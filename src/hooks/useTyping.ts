import { useState, useEffect, useCallback, useRef } from 'react'
import { getWorkingClient } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

interface TypingUser {
  id: string
  username: string
  display_name: string
}

export const useTyping = (channelName?: string | null) => {
  const { user: currentUser } = useAuth()
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const clientRef = useRef<SupabaseClient | null>(null)

  useEffect(() => {
    if (!channelName) return;
    let channel: RealtimeChannel | null = null;

    const setupChannel = async () => {
      const client = await getWorkingClient();
      clientRef.current = client;
      channel = client.channel(`typing:${channelName}`);
      channelRef.current = channel;

      // Listen for typing events
      channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { user: payloadUser, typing } = payload.payload

        if (payloadUser.id === currentUser?.id) return

        setTypingUsers(prev => {
          if (typing) {
            // Add user to typing list if not already there
            if (!prev.find(u => u.id === payloadUser.id)) {
              return [...prev, payloadUser]
            }
            return prev
          } else {
            // Remove user from typing list
            return prev.filter(u => u.id !== payloadUser.id)
          }
        })

        // Auto-remove typing users after 3 seconds of inactivity
        if (typing) {
          setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u.id !== payloadUser.id))
          }, 3000)
        }
      })
      .subscribe()
    };

    setupChannel();

    return () => {
      if (channel && clientRef.current) {
        clientRef.current.removeChannel(channel);
      }
    }
  }, [channelName])

  const stopTyping = useCallback(async () => {
    if (!channelName || !isTyping || !currentUser) return

    try {
      setIsTyping(false)

      // Broadcast typing stop using current user info
      await channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user: {
            id: currentUser.id,
            username: currentUser.username,
            display_name: currentUser.display_name
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
  }, [channelName, isTyping, currentUser])

  const startTyping = useCallback(async () => {
    if (!channelName || isTyping || !currentUser) return

    try {
      setIsTyping(true)

      // Broadcast typing start using current user info
      await channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user: {
            id: currentUser.id,
            username: currentUser.username,
            display_name: currentUser.display_name
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
  }, [channelName, isTyping, currentUser, stopTyping])

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
