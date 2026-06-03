import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  ensureSession,
  getRealtimeClient,
  getWorkingClient,
  type BoardChatMessage,
} from '../lib/supabase'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { createRealtimeChannelName } from '../lib/realtimeChannelName'
import { MESSAGE_FETCH_LIMIT } from '../config'
import { compareMessageKey } from '../lib/readCursors'
import { useAuth } from './useAuth'
import { useRealtimeRecovery } from './useRealtimeRecovery'

type FetchMessagesOptions = {
  silent?: boolean
  force?: boolean
}

const BOARD_CHAT_CACHE_MS = 60 * 1000

type BoardChatCacheEntry = {
  messages: BoardChatMessage[]
  hasMore: boolean
  loadedOlder: boolean
  fetchedAt: number
}

let boardChatCacheByKey = new Map<string, BoardChatCacheEntry>()

export function resetBoardChatCacheForTests() {
  boardChatCacheByKey = new Map<string, BoardChatCacheEntry>()
}

const sortChatMessages = (items: BoardChatMessage[]) =>
  [...items].sort((a, b) => compareMessageKey(
    { created_at: a.created_at, id: a.id },
    { created_at: b.created_at, id: b.id }
  ))

const dedupeChatMessages = (items: BoardChatMessage[]) => {
  const map = new Map<string, BoardChatMessage>()
  items.forEach(item => map.set(item.id, item))
  return sortChatMessages(Array.from(map.values()))
}

const isIncomingUpdateCurrent = (existing: BoardChatMessage, incoming: Partial<BoardChatMessage>) => {
  if (!incoming.updated_at || !existing.updated_at) return true
  return new Date(incoming.updated_at).getTime() >= new Date(existing.updated_at).getTime()
}

const getBoardChatCacheKey = (userId: string, boardSlug: string) => `${userId}:${boardSlug}`

const getBoardChatCache = (cacheKey: string) => boardChatCacheByKey.get(cacheKey) ?? null

const isFreshBoardChatCache = (cache: BoardChatCacheEntry | null) =>
  Boolean(cache && Date.now() - cache.fetchedAt < BOARD_CHAT_CACHE_MS)

const writeBoardChatCache = (
  cacheKey: string,
  messages: BoardChatMessage[],
  hasMore: boolean,
  loadedOlder: boolean
) => {
  boardChatCacheByKey.set(cacheKey, {
    messages: dedupeChatMessages(messages),
    hasMore,
    loadedOlder,
    fetchedAt: Date.now(),
  })
}

export function useBoardChat(boardSlug: string, boardTitle = 'Board Chat') {
  const { user } = useAuth()
  const cacheUserId = user?.id ?? 'anonymous'
  const cacheKey = getBoardChatCacheKey(cacheUserId, boardSlug)
  const cachedChat = getBoardChatCache(cacheKey)
  const [messages, setMessages] = useState<BoardChatMessage[]>(() => cachedChat?.messages ?? [])
  const [loading, setLoading] = useState(!cachedChat)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(cachedChat?.hasMore ?? true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel | null>) | null>(null)
  const fetchRequestIdRef = useRef(0)
  const loadedOlderRef = useRef(cachedChat?.loadedOlder ?? false)
  const messagesRef = useRef<BoardChatMessage[]>([])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const fetchMessages = useCallback(async (options: FetchMessagesOptions = {}) => {
    const cached = getBoardChatCache(cacheKey)
    if (!options.force && isFreshBoardChatCache(cached)) {
      loadedOlderRef.current = cached?.loadedOlder ?? false
      setMessages(cached?.messages ?? [])
      setHasMore(cached?.hasMore ?? true)
      setError(null)
      setLoading(false)
      return
    }

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
        .order('id', { ascending: false })
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
  }, [boardSlug, boardTitle, cacheKey])

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
    const cached = getBoardChatCache(cacheKey)
    loadedOlderRef.current = cached?.loadedOlder ?? false
    fetchRequestIdRef.current += 1
    setMessages(cached?.messages ?? [])
    setHasMore(cached?.hasMore ?? true)
    setError(null)
    if (isFreshBoardChatCache(cached)) {
      setLoading(false)
      return
    }

    setLoading(!cached)
    void fetchMessages({ silent: Boolean(cached) })
  }, [boardSlug, cacheKey, fetchMessages])

  useEffect(() => {
    if (loading && messages.length === 0) return
    if (error && messages.length === 0) return
    writeBoardChatCache(cacheKey, messages, hasMore, loadedOlderRef.current)
  }, [cacheKey, error, hasMore, loading, messages])

  const resetChatChannel = useCallback(async () => {
    await fetchMessages({ force: true, silent: true })

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
        .channel(createRealtimeChannelName(`public:board_chat_messages:${boardSlug}`))
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
          (payload: any) => {
            const messageId = payload.new?.id
            if (!messageId || !messagesRef.current.some(message => message.id === messageId)) return

            setMessages(prev => dedupeChatMessages(prev.map(existing => (
              existing.id === messageId && isIncomingUpdateCurrent(existing, payload.new)
                ? { ...existing, ...payload.new, user: existing.user }
                : existing
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
    const { data, error: deleteError } = await workingClient
      .from('board_chat_messages')
      .delete()
      .eq('id', messageId)
      .eq('board_slug', boardSlug)
      .select('id')
      .maybeSingle()

    if (deleteError) throw deleteError
    if (!data) {
      throw new Error('Message delete was not confirmed by the server.')
    }
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
    const oldestMessage = messages[0]
    if (!oldestMessage) return

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
        .or(`created_at.lt.${oldestMessage.created_at},and(created_at.eq.${oldestMessage.created_at},id.lt.${oldestMessage.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
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
    refresh: () => fetchMessages({ force: true }),
    loadOlderMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
  }
}
