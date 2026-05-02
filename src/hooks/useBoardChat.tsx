import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  ensureSession,
  getRealtimeClient,
  getWorkingClient,
  type BoardChatMessage,
} from '../lib/supabase'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { useAuth } from './useAuth'
import { useRealtimeRecovery } from './useRealtimeRecovery'

const CHAT_LIMIT = 120

const sortChatMessages = (items: BoardChatMessage[]) =>
  [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

const dedupeChatMessages = (items: BoardChatMessage[]) => {
  const map = new Map<string, BoardChatMessage>()
  items.forEach(item => map.set(item.id, item))
  return sortChatMessages(Array.from(map.values()))
}

export function useBoardChat(boardSlug: string, boardTitle = 'Board Chat') {
  const { user } = useAuth()
  const [messages, setMessages] = useState<BoardChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel | null>) | null>(null)

  const fetchMessages = useCallback(async () => {
    setLoading(true)
    try {
      const workingClient = await getWorkingClient()
      const { data, error: fetchError } = await workingClient
        .from('board_chat_messages')
        .select(`
          *,
          user:users!user_id(*)
        `)
        .eq('board_slug', boardSlug)
        .order('created_at', { ascending: false })
        .limit(CHAT_LIMIT)

      if (fetchError) throw fetchError
      setMessages(sortChatMessages((data ?? []) as unknown as BoardChatMessage[]))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to load ${boardTitle}`)
    } finally {
      setLoading(false)
    }
  }, [boardSlug, boardTitle])

  const fetchMessage = useCallback(async (id: string) => {
    const workingClient = await getWorkingClient()
    const { data, error: fetchError } = await workingClient
      .from('board_chat_messages')
      .select(`
        *,
        user:users!user_id(*)
      `)
      .eq('id', id)
      .eq('board_slug', boardSlug)
      .maybeSingle()

    if (fetchError || !data) return null
    return data as unknown as BoardChatMessage
  }, [boardSlug])

  useEffect(() => {
    setMessages([])
    void fetchMessages()
  }, [fetchMessages])

  const resetChatChannel = useCallback(async () => {
    await fetchMessages()

    const activeChannel = channelRef.current
    const realtimeClient = getRealtimeClient()
    if (activeChannel && realtimeClient?.removeChannel) {
      try {
        realtimeClient.removeChannel(activeChannel)
      } catch {
        // ignore channel cleanup failures
      }
    }

    channelRef.current = null
    if (subscribeRef.current) {
      channelRef.current = await subscribeRef.current().catch(() => null)
    }
  }, [fetchMessages])

  useRealtimeRecovery(() => {
    void resetChatChannel()
  })

  useEffect(() => {
    if (!user) return

    let channel: RealtimeChannel | null = null
    let currentClient: any = null

    const subscribe = async (): Promise<RealtimeChannel | null> => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()
      if (!currentClient?.channel) return null

      channel = currentClient
        .channel(`public:board_chat_messages:${boardSlug}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'board_chat_messages', filter: `board_slug=eq.${boardSlug}` },
          async (payload: any) => {
            const message = await fetchMessage(payload.new.id)
            if (!message) return
            setMessages(prev => dedupeChatMessages([...prev, message]).slice(-CHAT_LIMIT))
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'board_chat_messages', filter: `board_slug=eq.${boardSlug}` },
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
          { event: 'DELETE', schema: 'public', table: 'board_chat_messages', filter: `board_slug=eq.${boardSlug}` },
          (payload: any) => {
            setMessages(prev => prev.filter(message => message.id !== payload.old.id))
          }
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void runRealtimeRecovery('channel-error')
          }
        })

      channelRef.current = channel
      return channel
    }

    subscribeRef.current = subscribe
    void subscribe()

    return () => {
      subscribeRef.current = null
      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [boardSlug, fetchMessage, user])

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
        .from('board_chat_messages')
        .insert({
          board_slug: boardSlug,
          user_id: user.id,
          content: content.trim(),
        })
        .select(`
          *,
          user:users!user_id(*)
        `)
        .single()

      if (insertError) throw insertError
      const message = data as unknown as BoardChatMessage
      setMessages(prev => dedupeChatMessages([...prev, message]).slice(-CHAT_LIMIT))
      return message
    } finally {
      setSending(false)
    }
  }, [boardSlug, user])

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!user || !content.trim()) return
    const workingClient = await getWorkingClient()
    const { error: updateError } = await workingClient
      .from('board_chat_messages')
      .update({ content: content.trim(), edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('board_slug', boardSlug)
      .eq('user_id', user.id)

    if (updateError) throw updateError
    const message = await fetchMessage(messageId)
    if (message) {
      setMessages(prev => dedupeChatMessages(prev.map(existing => existing.id === message.id ? message : existing)))
    }
  }, [boardSlug, fetchMessage, user])

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user) return
    const workingClient = await getWorkingClient()
    const { error: deleteError } = await workingClient
      .from('board_chat_messages')
      .delete()
      .eq('id', messageId)
      .eq('board_slug', boardSlug)
      .eq('user_id', user.id)

    if (deleteError) throw deleteError
    setMessages(prev => prev.filter(message => message.id !== messageId))
  }, [boardSlug, user])

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return
    const workingClient = await getWorkingClient()
    const { error: rpcError } = await workingClient.rpc('toggle_board_chat_reaction', {
      chat_message_id: messageId,
      emoji,
    })

    if (rpcError) throw rpcError
    const message = await fetchMessage(messageId)
    if (message) {
      setMessages(prev => dedupeChatMessages(prev.map(existing => existing.id === message.id ? message : existing)))
    }
  }, [fetchMessage, user])

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
  }
}
