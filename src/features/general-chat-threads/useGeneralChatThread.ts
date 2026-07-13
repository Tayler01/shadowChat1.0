import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getWorkingClient, type Message } from '../../lib/supabase'
import { loadLocalOutboxEntries, type LocalMessageOutboxEntry } from '../../lib/localMessageOutbox'
import { useAuth } from '../../hooks/useAuth'
import {
  fetchGeneralChatThread,
  fetchGeneralChatThreadSummaries,
  GENERAL_CHAT_THREAD_PAGE_SIZE,
  mergeThreadMessages,
  type GeneralChatThreadSummary,
} from './generalChatThreadsApi'

type UseGeneralChatThreadOptions = {
  threadId: string | null
  open: boolean
  initialRootMessage?: Message | null
  targetMessageId?: string | null
}

type ThreadRealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}

const outboxEntryToThreadMessage = (
  entry: LocalMessageOutboxEntry,
  user?: Message['user']
): Message => ({
  id: entry.clientMessageId,
  client_message_id: entry.clientMessageId,
  user_id: entry.senderId,
  content: entry.messageType === 'audio' ? '' : entry.content,
  message_type: entry.messageType,
  file_url: entry.fileUrl,
  thumbnail_url: entry.thumbnailUrl ?? null,
  reply_to: entry.replyTo ?? null,
  ...(entry.messageType === 'audio' ? { audio_url: entry.content } : {}),
  reactions: {},
  pinned: false,
  pinned_by: null,
  pinned_at: null,
  created_at: entry.createdAt,
  updated_at: entry.failedAt,
  user,
  optimistic: true,
  delivery_status: 'failed',
})

export function useGeneralChatThread({
  threadId,
  open,
  initialRootMessage = null,
  targetMessageId = null,
}: UseGeneralChatThreadOptions) {
  const { user, profile } = useAuth()
  const [rootMessage, setRootMessage] = useState<Message | null>(initialRootMessage)
  const [replies, setReplies] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [pendingReplyCount, setPendingReplyCount] = useState(0)
  const followingLatestRef = useRef(true)
  const repliesRef = useRef<Message[]>([])
  const hasLoadedRef = useRef(false)
  const initialRootMessageRef = useRef(initialRootMessage)
  const requestVersionRef = useRef(0)
  const refreshTimerRef = useRef<number | null>(null)

  initialRootMessageRef.current = initialRootMessage

  const refresh = useCallback(async () => {
    if (!threadId || !open) return
    const requestVersion = ++requestVersionRef.current
    if (!hasLoadedRef.current) setLoading(true)
    try {
      const window = await fetchGeneralChatThread({
        threadId,
        targetMessageId: hasLoadedRef.current ? null : targetMessageId,
        limit: GENERAL_CHAT_THREAD_PAGE_SIZE,
      })
      if (requestVersion !== requestVersionRef.current) return
      setRootMessage(window.rootMessage)
      const knownParentIds = new Set([threadId, ...window.replies.map(reply => reply.id)])
      const failedReplies = loadLocalOutboxEntries('general')
        .filter(entry => entry.senderId === user?.id && Boolean(entry.replyTo && knownParentIds.has(entry.replyTo)))
        .map(entry => outboxEntryToThreadMessage(entry, (profile ?? user) as Message['user']))
      setReplies(current => mergeThreadMessages(current, [...window.replies, ...failedReplies]))
      setHasOlder(window.hasOlder)
      setError(null)
      hasLoadedRef.current = true
    } catch (caught) {
      if (requestVersion !== requestVersionRef.current) return
      setError(caught instanceof Error ? caught : new Error('Unable to load this thread.'))
    } finally {
      if (requestVersion === requestVersionRef.current) setLoading(false)
    }
  }, [open, profile, targetMessageId, threadId, user])

  const scheduleRefresh = useCallback((isNewReply: boolean) => {
    if (isNewReply && !followingLatestRef.current) {
      setPendingReplyCount(count => count + 1)
    }
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      void refresh()
    }, 80)
  }, [refresh])

  useEffect(() => {
    requestVersionRef.current += 1
    setRootMessage(initialRootMessageRef.current)
    setReplies([])
    setHasOlder(false)
    setPendingReplyCount(0)
    setError(null)
    hasLoadedRef.current = false
    followingLatestRef.current = true
    if (open && threadId) void refresh()
  // refresh intentionally omitted so a reply merge does not reset the thread.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetMessageId, threadId])

  useEffect(() => {
    repliesRef.current = replies
  }, [replies])

  useEffect(() => {
    if (!open || !threadId) return

    const belongsToThread = (message: Message) => Boolean(
      message.reply_to === threadId ||
      repliesRef.current.some(candidate => (
        candidate.id === message.reply_to ||
        candidate.client_message_id === message.reply_to
      ))
    )
    const handleServerMessage = (event: Event) => {
      const message = (event as CustomEvent<Message>).detail
      if (!message || !belongsToThread(message)) return
      setReplies(current => mergeThreadMessages(current, [message]))
    }
    const handleLocalMessage = (event: Event) => {
      const detail = (event as CustomEvent<{
        action?: 'upsert' | 'remove'
        message?: Message
        messageId?: string
      }>).detail
      if (detail?.action === 'remove' && detail.messageId) {
        setReplies(current => current.filter(message => (
          message.id !== detail.messageId && message.client_message_id !== detail.messageId
        )))
        return
      }
      if (detail?.action === 'upsert' && detail.message && belongsToThread(detail.message)) {
        setReplies(current => mergeThreadMessages(current, [detail.message!]))
      }
    }

    window.addEventListener('shadowchat:general-thread-message', handleServerMessage)
    window.addEventListener('shadowchat:general-thread-local', handleLocalMessage)
    return () => {
      window.removeEventListener('shadowchat:general-thread-message', handleServerMessage)
      window.removeEventListener('shadowchat:general-thread-local', handleLocalMessage)
    }
  }, [open, threadId])

  useEffect(() => {
    if (!open || !threadId) return
    let disposed = false
    let mappingChannel: RealtimeChannel | null = null
    let messageChannel: RealtimeChannel | null = null
    let realtimeClient: Awaited<ReturnType<typeof getWorkingClient>> | null = null

    void getWorkingClient().then(client => {
      if (disposed) return
      realtimeClient = client
      const channelSuffix = `${threadId}:${Math.random().toString(36).slice(2)}`
      mappingChannel = client
        .channel(`general-chat-thread-map:${channelSuffix}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'general_chat_thread_replies',
          filter: `thread_id=eq.${threadId}`,
        }, (payload: ThreadRealtimePayload) => {
          const changedMessageId = String(payload.new.message_id ?? payload.old.message_id ?? '')
          if (payload.eventType === 'DELETE' && changedMessageId) {
            setReplies(current => current.filter(message => message.id !== changedMessageId))
          }
          scheduleRefresh(payload.eventType === 'INSERT')
        })
        .subscribe()

      messageChannel = client
        .channel(`general-chat-thread-messages:${channelSuffix}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'messages',
        }, (payload: ThreadRealtimePayload) => {
          const changedId = String((payload.new as { id?: unknown })?.id ?? (payload.old as { id?: unknown })?.id ?? '')
          if (changedId === threadId && payload.eventType === 'DELETE') {
            setRootMessage(null)
          } else if (payload.eventType === 'DELETE' && changedId) {
            setReplies(current => current.filter(message => message.id !== changedId))
          }
          if (changedId === threadId || repliesRef.current.some(message => message.id === changedId)) scheduleRefresh(false)
        })
        .subscribe()
    })

    return () => {
      disposed = true
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
      if (mappingChannel && realtimeClient) void realtimeClient.removeChannel(mappingChannel)
      if (messageChannel && realtimeClient) void realtimeClient.removeChannel(messageChannel)
    }
  }, [open, scheduleRefresh, threadId])

  const loadOlder = useCallback(async () => {
    const oldest = replies[0]
    if (!threadId || !oldest || !hasOlder || loadingOlder) return
    setLoadingOlder(true)
    try {
      const window = await fetchGeneralChatThread({
        threadId,
        before: { created_at: oldest.created_at, id: oldest.id },
        limit: GENERAL_CHAT_THREAD_PAGE_SIZE,
      })
      setRootMessage(current => current ?? window.rootMessage)
      setReplies(current => mergeThreadMessages(window.replies, current))
      setHasOlder(window.hasOlder)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('Unable to load older replies.'))
    } finally {
      setLoadingOlder(false)
    }
  }, [hasOlder, loadingOlder, replies, threadId])

  const setFollowingLatest = useCallback((following: boolean) => {
    followingLatestRef.current = following
    if (following) setPendingReplyCount(0)
  }, [])

  return {
    rootMessage,
    replies,
    loading,
    loadingOlder,
    hasOlder,
    error,
    pendingReplyCount,
    refresh,
    loadOlder,
    setFollowingLatest,
  }
}

export function useGeneralChatThreadSummaries(rootMessageIds: string[]) {
  const stableKey = Array.from(new Set(rootMessageIds.filter(Boolean))).sort().join(',')
  const stableIds = useMemo(() => stableKey ? stableKey.split(',') : [], [stableKey])
  const [summaries, setSummaries] = useState<Map<string, GeneralChatThreadSummary>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    if (!stableKey) {
      setSummaries(new Map())
      return
    }
    setLoading(true)
    try {
      const result = await fetchGeneralChatThreadSummaries(stableIds)
      setSummaries(new Map(result.map(summary => [summary.threadId, summary])))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('Unable to load thread summaries.'))
    } finally {
      setLoading(false)
    }
  }, [stableIds, stableKey])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!stableKey) return
    let disposed = false
    let channel: RealtimeChannel | null = null
    let realtimeClient: Awaited<ReturnType<typeof getWorkingClient>> | null = null
    void getWorkingClient().then(client => {
      if (disposed) return
      realtimeClient = client
      channel = client
        .channel(`general-chat-thread-summaries:${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'general_chat_thread_replies',
        }, (payload: ThreadRealtimePayload) => {
          const threadId = String((payload.new as { thread_id?: unknown })?.thread_id ?? (payload.old as { thread_id?: unknown })?.thread_id ?? '')
          if (stableIds.includes(threadId)) void refresh()
        })
        .subscribe()
    })
    return () => {
      disposed = true
      if (channel && realtimeClient) void realtimeClient.removeChannel(channel)
    }
  }, [refresh, stableIds, stableKey])

  return { summaries, loading, error, refresh }
}
