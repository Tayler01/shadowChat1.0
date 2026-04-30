import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  ensureSession,
  getRealtimeClient,
  getWorkingClient,
  type NewsChatMessage,
} from '../lib/supabase'
import { useAuth } from './useAuth'

const CHAT_LIMIT = 120

const sortChatMessages = (items: NewsChatMessage[]) =>
  [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

const dedupeChatMessages = (items: NewsChatMessage[]) => {
  const map = new Map<string, NewsChatMessage>()
  items.forEach(item => map.set(item.id, item))
  return sortChatMessages(Array.from(map.values()))
}

export function useNewsChat() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<NewsChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const fetchMessages = useCallback(async () => {
    try {
      const workingClient = await getWorkingClient()
      const { data, error: fetchError } = await workingClient
        .from('news_chat_messages')
        .select(`
          *,
          user:users!user_id(*)
        `)
        .order('created_at', { ascending: false })
        .limit(CHAT_LIMIT)

      if (fetchError) throw fetchError
      setMessages(sortChatMessages((data ?? []) as unknown as NewsChatMessage[]))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load news chat')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMessage = useCallback(async (id: string) => {
    const workingClient = await getWorkingClient()
    const { data, error: fetchError } = await workingClient
      .from('news_chat_messages')
      .select(`
        *,
        user:users!user_id(*)
      `)
      .eq('id', id)
      .maybeSingle()

    if (fetchError || !data) return null
    return data as unknown as NewsChatMessage
  }, [])

  useEffect(() => {
    void fetchMessages()
  }, [fetchMessages])

  useEffect(() => {
    if (!user) return

    let channel: RealtimeChannel | null = null
    let currentClient: any = null

    const subscribe = async () => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()
      if (!currentClient?.channel) return

      channel = currentClient
        .channel('public:news_chat_messages')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'news_chat_messages' },
          async (payload: any) => {
            const message = await fetchMessage(payload.new.id)
            if (!message) return
            setMessages(prev => dedupeChatMessages([...prev, message]).slice(-CHAT_LIMIT))
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'news_chat_messages' },
          async (payload: any) => {
            const message = await fetchMessage(payload.new.id)
            if (!message) return
            setMessages(prev => dedupeChatMessages(prev.map(existing => (
              existing.id === message.id ? message : existing
            ))))
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'news_chat_messages' },
          (payload: any) => {
            setMessages(prev => prev.filter(message => message.id !== payload.old.id))
          }
        )
        .subscribe()

      channelRef.current = channel
    }

    void subscribe()

    return () => {
      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [fetchMessage, user])

  const sendMessage = useCallback(async (content: string) => {
    if (!user || !content.trim()) return null
    const sessionValid = await ensureSession()
    if (!sessionValid) {
      throw new Error('Authentication session is invalid or expired.')
    }

    setSending(true)
    try {
      const workingClient = await getWorkingClient()
      const { data, error: insertError } = await workingClient
        .from('news_chat_messages')
        .insert({
          user_id: user.id,
          content: content.trim(),
        })
        .select(`
          *,
          user:users!user_id(*)
        `)
        .single()

      if (insertError) throw insertError
      const message = data as unknown as NewsChatMessage
      setMessages(prev => dedupeChatMessages([...prev, message]).slice(-CHAT_LIMIT))
      return message
    } finally {
      setSending(false)
    }
  }, [user])

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!user || !content.trim()) return
    const workingClient = await getWorkingClient()
    const { error: updateError } = await workingClient
      .from('news_chat_messages')
      .update({ content: content.trim(), edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('user_id', user.id)

    if (updateError) throw updateError
    const message = await fetchMessage(messageId)
    if (message) {
      setMessages(prev => dedupeChatMessages(prev.map(existing => existing.id === message.id ? message : existing)))
    }
  }, [fetchMessage, user])

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user) return
    const workingClient = await getWorkingClient()
    const { error: deleteError } = await workingClient
      .from('news_chat_messages')
      .delete()
      .eq('id', messageId)
      .eq('user_id', user.id)

    if (deleteError) throw deleteError
    setMessages(prev => prev.filter(message => message.id !== messageId))
  }, [user])

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return
    const workingClient = await getWorkingClient()
    const { error: rpcError } = await workingClient.rpc('toggle_news_chat_reaction', {
      chat_message_id: messageId,
      emoji,
    })

    if (rpcError) throw rpcError
    const message = await fetchMessage(messageId)
    if (message) {
      setMessages(prev => dedupeChatMessages(prev.map(existing => existing.id === message.id ? message : existing)))
    }
  }, [fetchMessage, user])

  const markSeen = useCallback(async () => {
    const workingClient = await getWorkingClient()
    await workingClient.rpc('mark_news_seen', { section: 'chat' })
  }, [])

  return {
    messages,
    loading,
    sending,
    error,
    refresh: fetchMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    markSeen,
  }
}
