import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  ensureSession,
  getRealtimeClient,
  getWorkingClient,
  type BoardChatMessage,
} from '../lib/supabase'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { MESSAGE_FETCH_LIMIT } from '../config'
import { useAuth } from './useAuth'
import { useRealtimeRecovery } from './useRealtimeRecovery'

type FetchMessagesOptions = {
  silent?: boolean
}

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
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel | null>) | null>(null)
  const fetchRequestIdRef = useRef(0)
  const loadedOlderRef = useRef(false)

  const fetchMessages = useCallback(async (options: FetchMessagesOptions = {}) => {
    const requestId = fetchRequestIdRef.current + 1
    fetchRequestIdRef.current = requestId
    const showLoading = !options.silent
    if (showLoading) {
      setLoading(true)
    }

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
        .limit(MESSAGE_FETCH_LIMIT)

      if (fetchError) throw fetchError

      if (requestId !== fetchRequestIdRef.current) {
        return
      }

      const fetchedMessages = sortChatMessages((data ?? []) as unknown as BoardChatMessage[])
      setHasMore((data?.length || 0) === MESSAGE_FETCH_LIMIT)
      setMessages(prev => {
        if (!loadedOlderRef.current || prev.length === 0) {
          return fetchedMessages
        }
        return dedupeChatMessages([...prev, ...fetchedMessages])
      })
      setError(null)
    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) {
        return
      }

      if (!options.silent) {
        setMessages([])
        setHasMore(false)
        setError(err instanceof Error ? err.message : `Unable to load ${boardTitle}`)
      }
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false)
      }
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
    loadedOlderRef.current = false
    fetchRequestIdRef.current += 1
    setMessages([])
    setHasMore(true)
    setError(null)
    setLoading(true)
    void fetchMessages()
  }, [fetchMessages])

  const resetChatChannel = useCallback(async () => {
    await fetchMessages({ silent: true })

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
            setMessages(prev => {
              const nextMessages = dedupeChatMessages([...prev, message])
              return loadedOlderRef.current ? nextMessages : nextMessages.slice(-MESSAGE_FETCH_LIMIT)
            })
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
      setMessages(prev => {
        const nextMessages = dedupeChatMessages([...prev, message])
        return loadedOlderRef.current ? nextMessages : nextMessages.slice(-MESSAGE_FETCH_LIMIT)
      })
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

  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore) return
    const oldest = messages[0]?.created_at
    if (!oldest) return

    setLoadingMore(true)
    try {
      const workingClient = await getWorkingClient()
      const { data, error: fetchError } = await workingClient
        .from('board_chat_messages')
        .select(`
          *,
          user:users!user_id(*)
        `)
        .eq('board_slug', boardSlug)
        .lt('created_at', oldest)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_FETCH_LIMIT)

      if (fetchError) throw fetchError

      if (data && data.length > 0) {
        const olderMessages = sortChatMessages(data as unknown as BoardChatMessage[])
        loadedOlderRef.current = true
        setMessages(prev => dedupeChatMessages([...olderMessages, ...prev]))
        setHasMore(data.length === MESSAGE_FETCH_LIMIT)
      } else {
        setHasMore(false)
      }
    } finally {
      setLoadingMore(false)
    }
  }, [boardSlug, hasMore, loadingMore, messages])

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    sending,
    error,
    refresh: fetchMessages,
    loadOlderMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
  }
}
