import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

interface TypingUser {
  id: string
  username: string
  display_name: string
}

export const useTyping = (channelName: string = 'general') => {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout>()
  const channelRef = useRef<any>()

  useEffect(() => {
    const channel = supabase.channel(`typing:${channelName}`)
    channelRef.current = channel

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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelName])

  const startTyping = useCallback(async () => {
    if (isTyping) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user profile for typing indicator
      const { data: profile } = await supabase
        .from('users')
        .select('username, display_name')
        .eq('id', user.id)
        .single()

      if (!profile) return

      setIsTyping(true)

      // Broadcast typing start
      await channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user: {
            id: user.id,
            username: profile.username,
            display_name: profile.display_name
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
  }, [isTyping])

  const stopTyping = useCallback(async () => {
    if (!isTyping) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('users')
        .select('username, display_name')
        .eq('id', user.id)
        .single()

      if (!profile) return

      setIsTyping(false)

      // Broadcast typing stop
      await channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user: {
            id: user.id,
            username: profile.username,
            display_name: profile.display_name
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
  }, [isTyping])

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