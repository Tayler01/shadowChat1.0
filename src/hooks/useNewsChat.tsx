import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ensureSession,
  getRealtimeClient,
  getWorkingClient,
  type NewsChatMessage,
} from '../lib/supabase'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { createRealtimeChannelName } from '../lib/realtimeChannelName'
import {
  createRealtimeSubscriptionManager,
  isRecoverableRealtimeStatus,
} from '../lib/realtimeSubscription'
import { useAuth } from './useAuth'
import { useRealtimeRecovery } from './useRealtimeRecovery'

const CHAT_LIMIT = 120
const NEWS_CHAT_CACHE_MS = 60 * 1000

type NewsChatCacheEntry = {
  messages: NewsChatMessage[]
  fetchedAt: number
}

let newsChatCacheByUserId = new Map<string, NewsChatCacheEntry>()

export function resetNewsChatCacheForTests() {
  newsChatCacheByUserId = new Map<string, NewsChatCacheEntry>()
}

const sortChatMessages = (items: NewsChatMessage[]) =>
  [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

const dedupeChatMessages = (items: NewsChatMessage[]) => {
  const map = new Map<string, NewsChatMessage>()
  items.forEach(item => map.set(item.id, item))
  return sortChatMessages(Array.from(map.values()))
}

const getFreshNewsChatCache = (userId: string) => {
  const newsChatCache = newsChatCacheByUserId.get(userId)
  if (!newsChatCache) return null
  return Date.now() - newsChatCache.fetchedAt < NEWS_CHAT_CACHE_MS ? newsChatCache : null
}

const writeNewsChatCache = (userId: string, messages: NewsChatMessage[]) => {
  const newsChatCache = {
    messages: dedupeChatMessages(messages).slice(-CHAT_LIMIT),
    fetchedAt: Date.now(),
  }
  newsChatCacheByUserId.set(userId, newsChatCache)
  return newsChatCache.messages
}

export function useNewsChat() {
  const { user } = useAuth()
  const cacheUserId = user?.id ?? 'anonymous'
  const cachedChat = getFreshNewsChatCache(cacheUserId)
  const [messages, setMessages] = useState<NewsChatMessage[]>(() => cachedChat?.messages ?? [])
  const [loading, setLoading] = useState(!cachedChat)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const subscriptionRef = useRef<ReturnType<typeof createRealtimeSubscriptionManager> | null>(null)
  if (!subscriptionRef.current) {
    subscriptionRef.current = createRealtimeSubscriptionManager({ getFallbackClient: getRealtimeClient })
  }

  const updateMessages = useCallback((updater: NewsChatMessage[] | ((current: NewsChatMessage[]) => NewsChatMessage[])) => {
    setMessages(current => {
      const nextMessages = typeof updater === 'function' ? updater(current) : updater
      return writeNewsChatCache(cacheUserId, nextMessages)
    })
  }, [cacheUserId])

  const fetchMessages = useCallback(async (options: { silent?: boolean; force?: boolean } = {}) => {
    const cached = getFreshNewsChatCache(cacheUserId)
    if (!options.force && cached) {
      setMessages(cached.messages)
      setLoading(false)
      setError(null)
      return
    }

    if (!options.silent) setLoading(!cached || Boolean(options.force))
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
      setMessages(writeNewsChatCache(cacheUserId, sortChatMessages((data ?? []) as unknown as NewsChatMessage[])))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load news chat')
    } finally {
      setLoading(false)
    }
  }, [cacheUserId])

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
    void fetchMessages({ silent: Boolean(getFreshNewsChatCache(cacheUserId)) })
  }, [cacheUserId, fetchMessages])

  const resetChatChannel = useCallback(async () => {
    await fetchMessages({ force: true, silent: true })
    await subscriptionRef.current?.resubscribe().catch(() => null)
  }, [fetchMessages])

  useRealtimeRecovery(() => {
    void resetChatChannel()
  })

  useEffect(() => {
    if (!user) return

    const subscriptionManager = subscriptionRef.current

    const subscribe = async () => {
      let currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()
      if (!currentClient?.channel) return null

      const channel = currentClient
        .channel(createRealtimeChannelName('public:news_chat_messages'))
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'news_chat_messages' },
          async (payload: any) => {
            const message = await fetchMessage(payload.new.id)
            if (!message) return
            updateMessages(prev => dedupeChatMessages([...prev, message]).slice(-CHAT_LIMIT))
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'news_chat_messages' },
          async (payload: any) => {
            const message = await fetchMessage(payload.new.id)
            if (!message) return
            updateMessages(prev => dedupeChatMessages(prev.map(existing => (
              existing.id === message.id ? message : existing
            ))))
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'news_chat_messages' },
          (payload: any) => {
            updateMessages(prev => prev.filter(message => message.id !== payload.old.id))
          }
        )
        .subscribe((status: string) => {
          if (isRecoverableRealtimeStatus(status)) {
            void runRealtimeRecovery('channel-error')
          }
        })

      return { channel, client: currentClient }
    }

    subscriptionManager?.setSubscribe(subscribe)
    void subscriptionManager?.start(subscribe).catch(() => null)

    return () => {
      subscriptionManager?.clearSubscribe(subscribe)
      void subscriptionManager?.stop()
    }
  }, [fetchMessage, updateMessages, user])

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
      updateMessages(prev => dedupeChatMessages([...prev, message]).slice(-CHAT_LIMIT))
      return message
    } finally {
      setSending(false)
    }
  }, [updateMessages, user])

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
      updateMessages(prev => dedupeChatMessages(prev.map(existing => existing.id === message.id ? message : existing)))
    }
  }, [fetchMessage, updateMessages, user])

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user) return
    const workingClient = await getWorkingClient()
    const { error: deleteError } = await workingClient
      .from('news_chat_messages')
      .delete()
      .eq('id', messageId)
      .eq('user_id', user.id)

    if (deleteError) throw deleteError
    updateMessages(prev => prev.filter(message => message.id !== messageId))
  }, [updateMessages, user])

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
      updateMessages(prev => dedupeChatMessages(prev.map(existing => existing.id === message.id ? message : existing)))
    }
  }, [fetchMessage, updateMessages, user])

  const markSeen = useCallback(async () => {
    const workingClient = await getWorkingClient()
    await workingClient.rpc('mark_news_seen', { section: 'chat' })
  }, [])

  return {
    messages,
    loading,
    sending,
    error,
    refresh: () => fetchMessages({ force: true }),
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    markSeen,
  }
}
