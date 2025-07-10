import { useEffect, useRef } from 'react'
import { useAuth } from './useAuth'
import type { ChatMessage } from '../lib/supabase'
import { playMessageSound } from '../lib/sounds'
import type { MessageSound } from './useSoundEffects'

export function useMessageArrivalSound(
  messages: ChatMessage[],
  enabled: boolean,
  sound: MessageSound
) {
  const { user } = useAuth()
  const lastId = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || messages.length === 0) return
    const last = messages[messages.length - 1]
    if (last.id !== lastId.current) {
      const sender = (last as any).user_id ?? (last as any).sender_id
      if (sender && sender !== user?.id) {
        try {
          playMessageSound(sound)
        } catch {}
      }
      lastId.current = last.id
    }
  }, [messages, enabled, sound, user])
}
