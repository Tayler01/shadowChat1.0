import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase, getWorkingClient } from '../lib/supabase'
import { useAuth } from './useAuth'
import { useIsDesktop } from './useIsDesktop'
import { useSoundEffects } from './useSoundEffects'
import { playMessageSound } from '../lib/playMessageSound'
import { MessageNotification } from '../components/notifications/MessageNotification'

export function useMessageNotifications(onOpenConversation: (id: string) => void) {
  const { user } = useAuth()
  const isDesktop = useIsDesktop()
  const { enabled: soundEnabled, sound } = useSoundEffects()

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('dm_notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages' },
        async payload => {
          if (payload.new.sender_id === user.id) return

          const working = await getWorkingClient()
          const { data } = await working
            .from('dm_messages')
            .select(
              `id, content, conversation_id, sender:users!sender_id(id, display_name, avatar_url, color)`
            )
            .eq('id', payload.new.id)
            .single()

          if (data) {
            toast.custom(t => (
              <MessageNotification
                t={t}
                content={data.content}
                sender={data.sender || {}}
                onClick={() => {
                  toast.dismiss(t.id)
                  onOpenConversation(data.conversation_id)
                }}
                desktop={isDesktop}
              />
            ))
            if (soundEnabled) {
              playMessageSound(sound)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, onOpenConversation, isDesktop, soundEnabled, sound])
}
