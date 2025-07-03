import { useState, useEffect, useCallback, useRef } from 'react'
import { getWorkingClient } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface TypingUser {
  id: string
  username: string
  display_name: string
}

export const useTyping = (channelName: string = 'general') => {
  const { user } = useAuth()
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let currentClient: any = null;

    const setupChannel = async () => {
      currentClient = await getWorkingClient();
      channel = currentClient.channel(`typing:${channelName}`);
      channelRef.current = channel;

      // Listen for typing events
      channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { user, typing } = payload.payload
        
        setTypingUsers(prev => {
          if (typing) {
            // Add user to typing list if not already there
            if (!prev.find(u => u.id === user.id)) {
              return [...prev, user]
            }
            return prev
          } else {
            // Remove user from typing list
            return prev.filter(u => u.id !== user.id)
          }
        })

        // Auto-remove typing users after 3 seconds of inactivity
        if (typing) {
          setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u.id !== user.id))
          }, 3000)
        }
      })
      .subscribe()
    };

    setupChannel();

    return () => {
      if (channel && currentClient) {
        currentClient.removeChannel(channel);
      }
    }
  }, [channelName])

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
            display_name: user.display_name
          },
          typing: false
        }
      })

      // Clear timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    } catch (err) {
      console.error('Error stopping typing:', err)
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
            display_name: user.display_name
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
      console.error('Error starting typing:', err)
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
