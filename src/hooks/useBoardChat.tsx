import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  ensureSession,
  getRealtimeClient,
  getWorkingClient,
  refreshSessionLocked,
  withTimeout,
  type BoardChatMessage,
  type ChatMessageType,
  type GeneralChatMessageKey,
  type GeneralChatMessageWindowMode,
  type GeneralChatMessageWindowResult,
  type GeneralChatMessageWindowStatus,
  type User,
} from '../lib/supabase'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { createRealtimeChannelName } from '../lib/realtimeChannelName'
import { MESSAGE_FETCH_LIMIT } from '../config'
import { compareMessageKey } from '../lib/readCursors'
import { useAuth } from './useAuth'
import { useRealtimeRecovery } from './useRealtimeRecovery'
import { useSoundEffects } from './useSoundEffects'
import {
  createClientMessageId,
  findMatchingMessageIndex,
  isClientMessageIdSchemaError,
  isMediaThumbnailSchemaError,
  isReplyToSchemaError,
  isSchemaColumnError,
  markMessageSendFailed,
  mergeRealtimeMessageUpdate,
  upsertMessageIntoState,
} from '../lib/optimisticMessages'
import {
  loadLocalOutboxEntries,
  removeLocalOutboxEntry,
  upsertLocalOutboxEntry,
  type LocalMessageOutboxEntry,
} from '../lib/localMessageOutbox'
import type { EnsureMessageWindowOptions, MessagesContextValue } from './MessagesContext'

type FetchMessagesOptions = {
  silent?: boolean
  force?: boolean
}

type BoardChatMessageWindowRequest = {
  mode: GeneralChatMessageWindowMode
  targetMessageId?: string | null
  targetLastReadMessageId?: string | null
  targetLastReadAt?: string | null
  anchor?: GeneralChatMessageKey | null
  limit: number
}

type SendMessageOptions = {
  clientMessageId?: string
  createdAt?: string
}

type BoardMessageInsertData = {
  board_slug: string
  user_id: string
  content: string
  message_type: ChatMessageType
  client_message_id?: string
  file_url?: string
  thumbnail_url?: string
  media_processed_at?: string
  audio_url?: string
  reply_to?: string
}

type BoardChatCacheEntry = {
  messages: BoardChatMessage[]
  hasOlder: boolean
  hasNewer: boolean
  windowMode: GeneralChatMessageWindowMode
  targetStatus: GeneralChatMessageWindowStatus
  anchorStatus: GeneralChatMessageWindowStatus
  fetchedAt: number
}

const BOARD_CHAT_CACHE_MS = 60 * 1000
const SEND_OPERATION_TIMEOUT_MS = 12000
const BOARD_CHAT_WITH_USER_SELECT = `
  *,
  user:users!user_id(*)
`

let boardChatCacheByKey = new Map<string, BoardChatCacheEntry>()

export function resetBoardChatCacheForTests() {
  boardChatCacheByKey = new Map<string, BoardChatCacheEntry>()
}

const getBoardOutboxScope = (boardSlug: string) => `board:${boardSlug}`

const getBoardChatCacheKey = (userId: string, boardSlug: string) => `${userId}:${boardSlug}`

const getBoardChatCache = (cacheKey: string) => boardChatCacheByKey.get(cacheKey) ?? null

const isFreshBoardChatCache = (cache: BoardChatCacheEntry | null) =>
  Boolean(cache && Date.now() - cache.fetchedAt < BOARD_CHAT_CACHE_MS)

const normalizeBoardChatMessage = (message: Partial<BoardChatMessage> & { id: string }): BoardChatMessage => {
  const merged = {
    client_message_id: null,
    board_slug: '',
    user_id: '',
    content: '',
    message_type: 'text' as ChatMessageType,
    audio_url: null,
    audio_duration: null,
    file_url: null,
    thumbnail_url: null,
    thumbnail_path: null,
    media_width: null,
    media_height: null,
    media_processed_at: null,
    reactions: {},
    pinned: false,
    pinned_by: null,
    pinned_at: null,
    reply_to: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...message,
  }

  return {
    ...merged,
    message_type: merged.message_type ?? 'text',
    reactions: merged.reactions ?? {},
    pinned: merged.pinned ?? false,
    optimistic: merged.optimistic ?? false,
    delivery_status: merged.delivery_status ?? (merged.optimistic ? 'sending' : 'sent'),
  }
}

const compareBoardMessageKeys = (a: GeneralChatMessageKey, b: GeneralChatMessageKey) =>
  compareMessageKey(a, b)

const sortBoardMessagesByStableKey = (items: BoardChatMessage[]) =>
  [...items].sort((a, b) => compareBoardMessageKeys(
    { created_at: a.created_at, id: a.id },
    { created_at: b.created_at, id: b.id }
  ))

const dedupeBoardMessagesById = (items: BoardChatMessage[]) =>
  items.reduce<BoardChatMessage[]>(
    (acc, item) => upsertMessageIntoState(acc, normalizeBoardChatMessage(item)),
    []
  )

const isLocalPendingMessage = (message: BoardChatMessage) =>
  message.optimistic ||
  message.delivery_status === 'sending' ||
  message.delivery_status === 'failed'

const isServerWindowMessage = (message: BoardChatMessage) =>
  !message.pinned && !isLocalPendingMessage(message)

const getOldestServerWindowMessage = (items: BoardChatMessage[]) =>
  sortBoardMessagesByStableKey(items.filter(isServerWindowMessage))[0] ?? null

const getNewestServerWindowMessage = (items: BoardChatMessage[]) => {
  const sorted = sortBoardMessagesByStableKey(items.filter(isServerWindowMessage))
  return sorted[sorted.length - 1] ?? null
}

const withSentDeliveryState = (message: BoardChatMessage) => normalizeBoardChatMessage({
  ...message,
  optimistic: false,
  delivery_status: 'sent',
})

const trimBoardMessageWindow = (items: BoardChatMessage[]) => {
  const deduped = dedupeBoardMessagesById(items)
  const pinned = deduped.filter(message => message.pinned)
  const regular = deduped.filter(message => !message.pinned)

  return sortBoardMessagesByStableKey([
    ...pinned,
    ...sortBoardMessagesByStableKey(regular).slice(-MESSAGE_FETCH_LIMIT),
  ])
}

const createWindowResult = ({
  messages,
  pinnedMessages = [],
  hasOlder,
  hasNewer,
  windowMode,
  targetStatus = 'not_requested',
  anchorStatus = 'not_requested',
}: {
  messages: BoardChatMessage[]
  pinnedMessages?: BoardChatMessage[]
  hasOlder: boolean
  hasNewer: boolean
  windowMode: GeneralChatMessageWindowMode
  targetStatus?: GeneralChatMessageWindowStatus
  anchorStatus?: GeneralChatMessageWindowStatus
}): GeneralChatMessageWindowResult => ({
  messages: messages.map(withSentDeliveryState),
  pinnedMessages: pinnedMessages.map(withSentDeliveryState),
  hasOlder,
  hasNewer,
  windowMode,
  targetStatus,
  anchorStatus,
})

const combineWindowMessages = (window: GeneralChatMessageWindowResult) =>
  sortBoardMessagesByStableKey(dedupeBoardMessagesById([
    ...(window.pinnedMessages as BoardChatMessage[]),
    ...(window.messages as BoardChatMessage[]),
  ].map(message => withSentDeliveryState(message))))

const writeBoardChatCache = (
  cacheKey: string,
  messages: BoardChatMessage[],
  metadata: Pick<BoardChatCacheEntry, 'hasOlder' | 'hasNewer' | 'windowMode' | 'targetStatus' | 'anchorStatus'>
) => {
  boardChatCacheByKey.set(cacheKey, {
    messages: trimBoardMessageWindow(messages),
    ...metadata,
    fetchedAt: Date.now(),
  })
}

const boardSchemaMissingFullMessageColumns = (error: any) =>
  isClientMessageIdSchemaError(error) ||
  isMediaThumbnailSchemaError(error) ||
  isReplyToSchemaError(error) ||
  isSchemaColumnError(error, [
    'message_type',
    'file_url',
    'audio_url',
    'audio_duration',
    'pinned',
    'pinned_at',
    'pinned_by',
    'media_width',
    'media_height',
  ])

const buildOlderKeysetFilter = (anchor: GeneralChatMessageKey) =>
  `created_at.lt.${anchor.created_at},and(created_at.eq.${anchor.created_at},id.lt.${anchor.id})`

const buildOlderOrEqualKeysetFilter = (anchor: GeneralChatMessageKey) =>
  `created_at.lt.${anchor.created_at},and(created_at.eq.${anchor.created_at},id.lte.${anchor.id})`

const buildNewerKeysetFilter = (anchor: GeneralChatMessageKey) =>
  `created_at.gt.${anchor.created_at},and(created_at.eq.${anchor.created_at},id.gt.${anchor.id})`

const fetchPinnedBoardMessages = async (workingClient: any, boardSlug: string) => {
  const { data, error } = await workingClient
    .from('board_chat_messages')
    .select(BOARD_CHAT_WITH_USER_SELECT)
    .eq('board_slug', boardSlug)
    .eq('pinned', true)
    .order('pinned_at', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    if (boardSchemaMissingFullMessageColumns(error)) return []
    throw error
  }

  return ((data || []) as unknown as BoardChatMessage[]).map(normalizeBoardChatMessage)
}

const fetchLatestBoardWindowDirect = async (
  workingClient: any,
  boardSlug: string,
  limit: number
) => {
  const [pinnedMessages, messagesRes] = await Promise.all([
    fetchPinnedBoardMessages(workingClient, boardSlug),
    workingClient
      .from('board_chat_messages')
      .select(BOARD_CHAT_WITH_USER_SELECT)
      .eq('board_slug', boardSlug)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit),
  ])

  if (messagesRes.error) throw messagesRes.error

  return createWindowResult({
    messages: sortBoardMessagesByStableKey(((messagesRes.data || []) as unknown as BoardChatMessage[]).map(normalizeBoardChatMessage)),
    pinnedMessages,
    hasOlder: (messagesRes.data?.length || 0) === limit,
    hasNewer: false,
    windowMode: 'latest',
    anchorStatus: 'latest',
  })
}

const fetchOlderBoardWindowDirect = async (
  workingClient: any,
  boardSlug: string,
  anchor: GeneralChatMessageKey,
  limit: number
) => {
  const [pinnedMessages, messagesRes] = await Promise.all([
    fetchPinnedBoardMessages(workingClient, boardSlug),
    workingClient
      .from('board_chat_messages')
      .select(BOARD_CHAT_WITH_USER_SELECT)
      .eq('board_slug', boardSlug)
      .or(buildOlderKeysetFilter(anchor))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit),
  ])

  if (messagesRes.error) throw messagesRes.error

  return createWindowResult({
    messages: sortBoardMessagesByStableKey(((messagesRes.data || []) as unknown as BoardChatMessage[]).map(normalizeBoardChatMessage)),
    pinnedMessages,
    hasOlder: (messagesRes.data?.length || 0) === limit,
    hasNewer: false,
    windowMode: 'older',
    anchorStatus: 'found',
  })
}

const fetchNewerBoardWindowDirect = async (
  workingClient: any,
  boardSlug: string,
  anchor: GeneralChatMessageKey,
  limit: number
) => {
  const [pinnedMessages, messagesRes] = await Promise.all([
    fetchPinnedBoardMessages(workingClient, boardSlug),
    workingClient
      .from('board_chat_messages')
      .select(BOARD_CHAT_WITH_USER_SELECT)
      .eq('board_slug', boardSlug)
      .or(buildNewerKeysetFilter(anchor))
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit),
  ])

  if (messagesRes.error) throw messagesRes.error

  return createWindowResult({
    messages: sortBoardMessagesByStableKey(((messagesRes.data || []) as unknown as BoardChatMessage[]).map(normalizeBoardChatMessage)),
    pinnedMessages,
    hasOlder: false,
    hasNewer: (messagesRes.data?.length || 0) === limit,
    windowMode: 'newer',
    anchorStatus: 'found',
  })
}

const fetchTargetBoardWindowDirect = async (
  workingClient: any,
  boardSlug: string,
  targetMessageId: string | null,
  limit: number,
  targetLastReadMessageId?: string | null,
  targetLastReadAt?: string | null
) => {
  let target: BoardChatMessage | null = null
  let targetStatus: GeneralChatMessageWindowStatus = 'missing'

  if (targetMessageId) {
    const targetRes = await workingClient
      .from('board_chat_messages')
      .select(BOARD_CHAT_WITH_USER_SELECT)
      .eq('board_slug', boardSlug)
      .eq('id', targetMessageId)
      .maybeSingle()

    if (targetRes.error) throw targetRes.error
    target = targetRes.data ? normalizeBoardChatMessage(targetRes.data as unknown as BoardChatMessage) : null
    targetStatus = target ? 'found' : 'missing'
  }

  if (!target && targetLastReadAt) {
    const anchor = {
      created_at: targetLastReadAt,
      id: targetLastReadMessageId ?? '00000000-0000-0000-0000-000000000000',
    }
    const fallbackRes = await workingClient
      .from('board_chat_messages')
      .select(BOARD_CHAT_WITH_USER_SELECT)
      .eq('board_slug', boardSlug)
      .or(buildNewerKeysetFilter(anchor))
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)

    if (fallbackRes.error) throw fallbackRes.error
    target = ((fallbackRes.data || []) as unknown as BoardChatMessage[]).map(normalizeBoardChatMessage)[0] ?? null
    targetStatus = target ? 'timestamp_fallback' : 'missing'
  }

  if (!target) {
    return createWindowResult({
      messages: [],
      hasOlder: false,
      hasNewer: false,
      windowMode: 'target',
      targetStatus,
    })
  }

  const olderLimit = Math.floor((limit - 1) / 2)
  const newerLimit = Math.max(limit - 1 - olderLimit, 0)
  const anchor = { created_at: target.created_at, id: target.id }
  const [pinnedMessages, olderRes, newerRes] = await Promise.all([
    fetchPinnedBoardMessages(workingClient, boardSlug),
    olderLimit > 0
      ? workingClient
        .from('board_chat_messages')
        .select(BOARD_CHAT_WITH_USER_SELECT)
        .eq('board_slug', boardSlug)
        .or(buildOlderOrEqualKeysetFilter(anchor))
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(olderLimit + 1)
      : Promise.resolve({ data: [], error: null }),
    newerLimit > 0
      ? workingClient
        .from('board_chat_messages')
        .select(BOARD_CHAT_WITH_USER_SELECT)
        .eq('board_slug', boardSlug)
        .or(buildNewerKeysetFilter(anchor))
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(newerLimit)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (olderRes.error) throw olderRes.error
  if (newerRes.error) throw newerRes.error

  const olderMessages = ((olderRes.data || []) as unknown as BoardChatMessage[]).map(normalizeBoardChatMessage)
  const newerMessages = ((newerRes.data || []) as unknown as BoardChatMessage[]).map(normalizeBoardChatMessage)

  return createWindowResult({
    messages: sortBoardMessagesByStableKey([...olderMessages, target, ...newerMessages]),
    pinnedMessages,
    hasOlder: olderLimit > 0 && (olderRes.data?.length || 0) > olderLimit,
    hasNewer: newerLimit > 0 && (newerRes.data?.length || 0) === newerLimit,
    windowMode: 'target',
    targetStatus,
  })
}

const mergeMessageWindowIntoState = (
  prev: BoardChatMessage[],
  window: GeneralChatMessageWindowResult,
  options: { replaceWindow: boolean; trimToLatest?: boolean }
) => {
  const serverMessages = combineWindowMessages(window)

  if (options.replaceWindow) {
    const pendingLocalMessages = prev.filter(isLocalPendingMessage)
    const mergedMessages = [...serverMessages, ...pendingLocalMessages].reduce<BoardChatMessage[]>(
      (acc, message) => upsertMessageIntoState(acc, message),
      []
    )
    return options.trimToLatest
      ? trimBoardMessageWindow(mergedMessages)
      : sortBoardMessagesByStableKey(mergedMessages)
  }

  return sortBoardMessagesByStableKey(
    [...prev, ...serverMessages].reduce<BoardChatMessage[]>(
      (acc, message) => upsertMessageIntoState(acc, message),
      []
    )
  )
}

const prepareBoardMessageData = (
  boardSlug: string,
  userId: string,
  content: string,
  messageType: ChatMessageType,
  fileUrl?: string,
  replyTo?: string,
  clientMessageId?: string,
  thumbnailUrl?: string | null
): BoardMessageInsertData => ({
  board_slug: boardSlug,
  user_id: userId,
  ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
  content: messageType === 'audio' ? '' : content.trim(),
  message_type: messageType,
  file_url: fileUrl,
  ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl, media_processed_at: new Date().toISOString() } : {}),
  ...(replyTo ? { reply_to: replyTo } : {}),
  ...(messageType === 'audio' ? { audio_url: content.trim() } : {}),
})

const insertBoardMessage = async (messageData: BoardMessageInsertData) => {
  const workingClient = await getWorkingClient()
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('Database insert timeout after 10 seconds')),
      10000
    )
  )
  const runInsert = (data: Partial<BoardMessageInsertData>) => Promise.race([
    workingClient
      .from('board_chat_messages')
      .insert(data)
      .select(BOARD_CHAT_WITH_USER_SELECT)
      .single(),
    timeout,
  ]) as Promise<any>

  let result = await runInsert(messageData)

  if (result.error && boardSchemaMissingFullMessageColumns(result.error)) {
    const {
      client_message_id: _clientMessageId,
      thumbnail_url: _thumbnailUrl,
      media_processed_at: _mediaProcessedAt,
      reply_to: _replyTo,
      message_type: _messageType,
      file_url: _fileUrl,
      audio_url: _audioUrl,
      ...legacyMessageData
    } = messageData

    result = await runInsert(legacyMessageData)
  }

  if (
    result.error &&
    messageData.client_message_id &&
    (result.error.code === '23505' || result.error.status === 409)
  ) {
    result = await workingClient
      .from('board_chat_messages')
      .select(BOARD_CHAT_WITH_USER_SELECT)
      .eq('board_slug', messageData.board_slug)
      .eq('user_id', messageData.user_id)
      .eq('client_message_id', messageData.client_message_id)
      .maybeSingle()
  }

  return {
    data: result.data ? normalizeBoardChatMessage(result.data as BoardChatMessage) : null,
    error: result.error,
  } as { data: BoardChatMessage | null; error: any }
}

const refreshSessionAndRetryBoardMessage = async (messageData: BoardMessageInsertData) => {
  const refreshPromise = refreshSessionLocked()
  const refreshTimeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('Session refresh timeout after 5 seconds')),
      5000
    )
  )

  const { data: refreshData, error: refreshError } = (await Promise.race([
    refreshPromise,
    refreshTimeout,
  ])) as any

  if (!refreshError && refreshData.session) {
    return insertBoardMessage(messageData)
  }

  return { data: null, error: refreshError } as {
    data: BoardChatMessage | null
    error: any
  }
}

const localOutboxEntryToBoardMessage = (
  boardSlug: string,
  entry: LocalMessageOutboxEntry,
  user?: Partial<User> | null
) => normalizeBoardChatMessage({
  id: entry.clientMessageId,
  board_slug: boardSlug,
  client_message_id: entry.clientMessageId,
  user_id: entry.senderId,
  content: entry.messageType === 'audio' ? '' : entry.content,
  message_type: entry.messageType,
  file_url: entry.fileUrl,
  thumbnail_url: entry.thumbnailUrl ?? null,
  ...(entry.replyTo ? { reply_to: entry.replyTo } : {}),
  ...(entry.messageType === 'audio' ? { audio_url: entry.content } : {}),
  reactions: {},
  pinned: false,
  pinned_by: null,
  pinned_at: null,
  created_at: entry.createdAt,
  updated_at: entry.failedAt,
  user: user ? user as User : undefined,
  optimistic: true,
  delivery_status: 'failed',
})

export function useBoardChat(boardSlug: string, boardTitle = 'Board Chat'): MessagesContextValue & {
  error: string | null
  refresh: (options?: FetchMessagesOptions) => Promise<void>
} {
  const { user, profile } = useAuth()
  const { playMessage, playReaction } = useSoundEffects()
  const cacheUserId = user?.id ?? 'anonymous'
  const cacheKey = getBoardChatCacheKey(cacheUserId, boardSlug)
  const cachedChat = getBoardChatCache(cacheKey)
  const [messages, setMessages] = useState<BoardChatMessage[]>(() => cachedChat?.messages ?? [])
  const [loading, setLoading] = useState(!cachedChat)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sending, setSending] = useState(false)
  const [hasOlder, setHasOlder] = useState(cachedChat?.hasOlder ?? true)
  const [hasNewer, setHasNewer] = useState(cachedChat?.hasNewer ?? false)
  const [windowMode, setWindowMode] = useState<GeneralChatMessageWindowMode>(cachedChat?.windowMode ?? 'latest')
  const [targetStatus, setTargetStatus] = useState<GeneralChatMessageWindowStatus>(cachedChat?.targetStatus ?? 'not_requested')
  const [anchorStatus, setAnchorStatus] = useState<GeneralChatMessageWindowStatus>(cachedChat?.anchorStatus ?? 'not_requested')
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel | null>) | null>(null)
  const fetchRequestIdRef = useRef(0)
  const resetInFlightRef = useRef<Promise<void> | null>(null)
  const sendingRef = useRef(false)
  const latestMessagesRef = useRef<BoardChatMessage[]>([])
  const windowModeRef = useRef<GeneralChatMessageWindowMode>(windowMode)
  const hasNewerRef = useRef(hasNewer)

  useEffect(() => {
    latestMessagesRef.current = messages
  }, [messages])

  useEffect(() => {
    windowModeRef.current = windowMode
  }, [windowMode])

  useEffect(() => {
    hasNewerRef.current = hasNewer
  }, [hasNewer])

  const applyWindowMetadata = useCallback((window: GeneralChatMessageWindowResult) => {
    setHasOlder(window.hasOlder)
    setHasNewer(window.hasNewer)
    setWindowMode(window.windowMode)
    setTargetStatus(window.targetStatus)
    setAnchorStatus(window.anchorStatus)
  }, [])

  const setHasNewerValue = useCallback((nextValue: boolean) => {
    hasNewerRef.current = nextValue
    setHasNewer(nextValue)
  }, [])

  const fetchBoardMessageWindow = useCallback(async (request: BoardChatMessageWindowRequest) => {
    const workingClient = await getWorkingClient()

    if (request.mode === 'older' && request.anchor) {
      return fetchOlderBoardWindowDirect(workingClient, boardSlug, request.anchor, request.limit)
    }

    if (request.mode === 'newer' && request.anchor) {
      return fetchNewerBoardWindowDirect(workingClient, boardSlug, request.anchor, request.limit)
    }

    if (
      request.mode === 'target' ||
      request.targetMessageId ||
      request.targetLastReadMessageId ||
      request.targetLastReadAt
    ) {
      return fetchTargetBoardWindowDirect(
        workingClient,
        boardSlug,
        request.targetMessageId ?? null,
        request.limit,
        request.targetLastReadMessageId ?? null,
        request.targetLastReadAt ?? null
      )
    }

    return fetchLatestBoardWindowDirect(workingClient, boardSlug, request.limit)
  }, [boardSlug])

  const loadLatestMessages = useCallback(async () => {
    const requestId = fetchRequestIdRef.current + 1
    fetchRequestIdRef.current = requestId

    try {
      const window = await fetchBoardMessageWindow({
        mode: 'latest',
        limit: MESSAGE_FETCH_LIMIT,
      })

      if (requestId !== fetchRequestIdRef.current) return

      applyWindowMetadata({
        ...window,
        windowMode: 'latest',
        targetStatus: 'not_requested',
      })

      setMessages(prev => {
        const nextMessages = combineWindowMessages(window).length > 0
          ? mergeMessageWindowIntoState(prev, window, { replaceWindow: true, trimToLatest: true })
          : prev.filter(isLocalPendingMessage)
        writeBoardChatCache(cacheKey, nextMessages, {
          hasOlder: window.hasOlder,
          hasNewer: false,
          windowMode: 'latest',
          targetStatus: 'not_requested',
          anchorStatus: window.anchorStatus,
        })
        return nextMessages
      })
      setError(null)
    } catch (err) {
      if (requestId === fetchRequestIdRef.current) {
        setError(err instanceof Error ? err.message : `Unable to load ${boardTitle}`)
      }
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false)
      }
    }
  }, [applyWindowMetadata, boardTitle, cacheKey, fetchBoardMessageWindow])

  const refresh = useCallback(async (options: FetchMessagesOptions = {}) => {
    const cached = getBoardChatCache(cacheKey)
    if (!options.force && isFreshBoardChatCache(cached)) {
      setMessages(cached?.messages ?? [])
      setHasOlder(cached?.hasOlder ?? true)
      setHasNewer(cached?.hasNewer ?? false)
      setWindowMode(cached?.windowMode ?? 'latest')
      setTargetStatus(cached?.targetStatus ?? 'not_requested')
      setAnchorStatus(cached?.anchorStatus ?? 'not_requested')
      setError(null)
      setLoading(false)
      return
    }

    if (!options.silent) {
      setLoading(true)
    }
    await loadLatestMessages()
  }, [cacheKey, loadLatestMessages])

  const hydrateMessage = useCallback(async (messageId: string) => {
    const workingClient = await getWorkingClient()
    const { data, error: fetchError } = await workingClient
      .from('board_chat_messages')
      .select(BOARD_CHAT_WITH_USER_SELECT)
      .eq('board_slug', boardSlug)
      .eq('id', messageId)
      .maybeSingle()

    if (fetchError || !data) return null
    return normalizeBoardChatMessage(data as unknown as BoardChatMessage)
  }, [boardSlug])

  const addNewMessage = useCallback((message: BoardChatMessage) => {
    let added = false
    const normalizedMessage = withSentDeliveryState(message)
    const currentMessages = latestMessagesRef.current
    const existsInCurrentWindow = findMatchingMessageIndex(currentMessages, normalizedMessage) >= 0
    const newestWindowMessage = getNewestServerWindowMessage(currentMessages)
    const isNewerThanWindow = newestWindowMessage
      ? compareBoardMessageKeys(normalizedMessage, newestWindowMessage) > 0
      : true

    if (
      windowModeRef.current !== 'latest' &&
      !existsInCurrentWindow &&
      user &&
      normalizedMessage.user_id !== user.id &&
      isNewerThanWindow
    ) {
      setHasNewerValue(true)
      return
    }

    setMessages(prev => {
      const exists = findMatchingMessageIndex(prev, normalizedMessage) >= 0
      const nextMessages = upsertMessageIntoState(prev, normalizedMessage)
      if (nextMessages === prev) return prev
      added = !exists
      return windowModeRef.current === 'latest'
        ? trimBoardMessageWindow(nextMessages)
        : sortBoardMessagesByStableKey(nextMessages)
    })

    if (added && user && normalizedMessage.user_id !== user.id) {
      playMessage()
    }
  }, [playMessage, setHasNewerValue, user])

  useEffect(() => {
    const cached = getBoardChatCache(cacheKey)
    fetchRequestIdRef.current += 1
    setMessages(cached?.messages ?? [])
    setHasOlder(cached?.hasOlder ?? true)
    setHasNewer(cached?.hasNewer ?? false)
    setWindowMode(cached?.windowMode ?? 'latest')
    setTargetStatus(cached?.targetStatus ?? 'not_requested')
    setAnchorStatus(cached?.anchorStatus ?? 'not_requested')
    setError(null)

    if (isFreshBoardChatCache(cached)) {
      setLoading(false)
      return
    }

    setLoading(!cached)
    void refresh({ silent: Boolean(cached), force: true })
  }, [boardSlug, cacheKey, refresh])

  useEffect(() => {
    if (!user) return
    const failedMessages = loadLocalOutboxEntries(getBoardOutboxScope(boardSlug))
      .filter(entry => entry.senderId === user.id)
      .map(entry => localOutboxEntryToBoardMessage(boardSlug, entry, profile ?? user))
    if (failedMessages.length === 0) return

    setMessages(prev => sortBoardMessagesByStableKey(dedupeBoardMessagesById([...prev, ...failedMessages])))
  }, [boardSlug, profile, user])

  useEffect(() => {
    if (loading && messages.length === 0) return
    if (error && messages.length === 0) return
    writeBoardChatCache(cacheKey, messages, {
      hasOlder,
      hasNewer,
      windowMode,
      targetStatus,
      anchorStatus,
    })
  }, [anchorStatus, cacheKey, error, hasNewer, hasOlder, loading, messages, targetStatus, windowMode])

  const resetChatChannel = useCallback(async () => {
    await refresh({ force: true, silent: true })

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
  }, [refresh])

  useRealtimeRecovery(() => {
    void resetChatChannel()
  })

  useEffect(() => {
    if (!user) return

    let channel: RealtimeChannel | null = null
    let currentClient: any = null
    let disposed = false

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
            if (disposed) return
            const message = await hydrateMessage(payload.new.id)
            if (!message) return
            addNewMessage(message)
          }
        )
        .on('broadcast', { event: 'new_message' }, (payload: any) => {
          if (disposed) return
          addNewMessage(normalizeBoardChatMessage(payload.payload as BoardChatMessage))
        })
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'board_chat_messages', filter: `board_slug=eq.${boardSlug}` },
          (payload: any) => {
            const incoming = payload.new as Partial<BoardChatMessage>
            if (!incoming?.id || disposed) return

            setMessages(prev => {
              const index = prev.findIndex(message => message.id === incoming.id)
              if (index === -1) return prev

              const previousMessage = prev[index]
              const merged = mergeRealtimeMessageUpdate(previousMessage, incoming, { user: previousMessage.user })
              if (!merged) return prev

              const changed =
                JSON.stringify(previousMessage.reactions) !== JSON.stringify(merged.reactions)
              const nextMessages = prev.map(message =>
                message.id === merged.id ? normalizeBoardChatMessage(merged as BoardChatMessage) : message
              )
              if (changed) {
                const prevUsers = (previousMessage.reactions || {}) as Record<string, { users?: string[] }>
                const currUsers = (merged.reactions || {}) as Record<string, { users?: string[] }>
                const changedByCurrent = Object.keys({ ...prevUsers, ...currUsers }).some(emoji => {
                  const before = prevUsers[emoji]?.users || []
                  const after = currUsers[emoji]?.users || []
                  const beforeHas = before.includes(user.id)
                  const afterHas = after.includes(user.id)
                  return beforeHas !== afterHas
                })
                if (!changedByCurrent) {
                  playReaction()
                }
              }
              return sortBoardMessagesByStableKey(nextMessages)
            })
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'board_chat_messages', filter: `board_slug=eq.${boardSlug}` },
          (payload: any) => {
            if (disposed) return
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
      disposed = true
      subscribeRef.current = null
      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [addNewMessage, boardSlug, hydrateMessage, playReaction, user])

  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasOlder) return
    const oldestMessage = getOldestServerWindowMessage(latestMessagesRef.current)
    if (!oldestMessage) return

    setLoadingMore(true)
    setAnchorStatus('pending')
    setTargetStatus('not_requested')
    try {
      const window = await fetchBoardMessageWindow({
        mode: 'older',
        anchor: { created_at: oldestMessage.created_at, id: oldestMessage.id },
        limit: MESSAGE_FETCH_LIMIT,
      })

      setMessages(prev => mergeMessageWindowIntoState(prev, window, { replaceWindow: false }))
      applyWindowMetadata({
        ...window,
        windowMode: 'older',
        hasNewer: hasNewerRef.current || window.hasNewer,
        targetStatus: 'not_requested',
      })
    } finally {
      setLoadingMore(false)
    }
  }, [applyWindowMetadata, fetchBoardMessageWindow, hasOlder, loadingMore])

  const loadNewerMessages = useCallback(async () => {
    if (loadingMore || !hasNewerRef.current) {
      if (!hasNewerRef.current) {
        await loadLatestMessages()
      }
      return
    }
    const newestMessage = getNewestServerWindowMessage(latestMessagesRef.current)
    if (!newestMessage) {
      await loadLatestMessages()
      return
    }

    setLoadingMore(true)
    setAnchorStatus('pending')
    setTargetStatus('not_requested')
    try {
      const window = await fetchBoardMessageWindow({
        mode: 'newer',
        anchor: { created_at: newestMessage.created_at, id: newestMessage.id },
        limit: MESSAGE_FETCH_LIMIT,
      })

      setMessages(prev => mergeMessageWindowIntoState(prev, window, { replaceWindow: false }))
      applyWindowMetadata({
        ...window,
        windowMode: 'newer',
        hasOlder: hasOlder || window.hasOlder,
        targetStatus: 'not_requested',
      })
    } finally {
      setLoadingMore(false)
    }
  }, [applyWindowMetadata, fetchBoardMessageWindow, hasOlder, loadLatestMessages, loadingMore])

  const ensureMessageWindow = useCallback(async (
    targetMessageId: string | null,
    options: EnsureMessageWindowOptions = {}
  ) => {
    if (!targetMessageId && !options.targetLastReadAt && !options.targetLastReadMessageId && !options.anchor) {
      await loadLatestMessages()
      return null
    }

    const existing = targetMessageId
      ? latestMessagesRef.current.find(message =>
        message.id === targetMessageId || message.client_message_id === targetMessageId
      ) ?? null
      : null
    if (existing) {
      setTargetStatus('found')
      setAnchorStatus(options.anchor ? 'found' : 'not_requested')
      return existing
    }

    const requestId = fetchRequestIdRef.current + 1
    fetchRequestIdRef.current = requestId
    setLoadingMore(true)
    setTargetStatus('pending')
    setAnchorStatus(options.anchor ? 'pending' : 'not_requested')

    try {
      const window = await fetchBoardMessageWindow({
        mode: 'target',
        targetMessageId: targetMessageId ?? null,
        targetLastReadMessageId: options.targetLastReadMessageId ?? null,
        targetLastReadAt: options.targetLastReadAt ?? null,
        anchor: options.anchor ?? null,
        limit: MESSAGE_FETCH_LIMIT,
      })

      if (requestId !== fetchRequestIdRef.current) {
        return null
      }

      const windowMessages = combineWindowMessages(window)
      setMessages(prev => mergeMessageWindowIntoState(prev, window, {
        replaceWindow: windowMessages.length > 0,
      }))
      applyWindowMetadata(window)

      const resolved = targetMessageId
        ? windowMessages.find(message => message.id === targetMessageId || message.client_message_id === targetMessageId) ?? null
        : windowMessages[0] ?? null
      return resolved
    } catch (err) {
      setTargetStatus('error')
      throw err
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoadingMore(false)
        setLoading(false)
      }
    }
  }, [applyWindowMetadata, fetchBoardMessageWindow, loadLatestMessages])

  const compactToLatestMessages = useCallback(() => {
    if (hasNewerRef.current) {
      void loadLatestMessages().catch(() => undefined)
      return
    }

    setWindowMode('latest')
    setHasNewerValue(false)
    setTargetStatus('not_requested')
    setAnchorStatus('not_requested')
    setMessages(prev => trimBoardMessageWindow(prev))
  }, [loadLatestMessages, setHasNewerValue])

  const resetWithFreshClient = useCallback(async () => {
    if (resetInFlightRef.current) return resetInFlightRef.current

    resetInFlightRef.current = (async () => {
      try {
        if (channelRef.current) {
          try {
            const workingClient = await getWorkingClient()
            if (workingClient?.removeChannel) {
              await workingClient.removeChannel(channelRef.current)
            }
          } catch {
            // ignore cleanup failures
          }
          channelRef.current = null
        }

        await refresh({ force: true, silent: true }).catch(() => undefined)

        if (subscribeRef.current) {
          try {
            channelRef.current = await subscribeRef.current()
          } catch {
            // The next recovery event will try again.
          }
        }
      } finally {
        resetInFlightRef.current = null
      }
    })()

    return resetInFlightRef.current
  }, [refresh])

  const sendMessage = useCallback(async (
    content: string,
    messageType: ChatMessageType = 'text',
    fileUrl?: string,
    replyTo?: string,
    thumbnailUrl?: string | null,
    options: SendMessageOptions = {}
  ): Promise<BoardChatMessage | null> => {
    if (!user || (!content.trim() && !fileUrl)) {
      return null
    }

    if (sendingRef.current) {
      return null
    }

    sendingRef.current = true
    setSending(true)
    let inserted: BoardChatMessage | null = null
    const outboxScope = getBoardOutboxScope(boardSlug)
    const clientMessageId = options.clientMessageId || createClientMessageId()
    const createdAt = options.createdAt || new Date().toISOString()
    const optimisticPayload = prepareBoardMessageData(
      boardSlug,
      user.id,
      content,
      messageType,
      fileUrl,
      replyTo,
      clientMessageId,
      thumbnailUrl
    )

    setMessages(prev => {
      const nextMessages = upsertMessageIntoState(prev, normalizeBoardChatMessage({
        id: clientMessageId,
        ...optimisticPayload,
        reactions: {},
        pinned: false,
        pinned_by: null,
        pinned_at: null,
        created_at: createdAt,
        updated_at: createdAt,
        user: profile ?? user,
        optimistic: true,
        delivery_status: 'sending',
      }))
      return windowModeRef.current === 'latest'
        ? trimBoardMessageWindow(nextMessages)
        : sortBoardMessagesByStableKey(nextMessages)
    })

    const executeSend = async () => {
      const sessionValid = await ensureSession()
      if (!sessionValid) {
        throw new Error('Authentication session is invalid or expired. Please refresh the page and try again.')
      }

      const messageData = prepareBoardMessageData(
        boardSlug,
        user.id,
        content,
        messageType,
        fileUrl,
        replyTo,
        clientMessageId,
        thumbnailUrl
      )

      const attemptSend = async () => {
        let { data, error: insertError } = await insertBoardMessage(messageData)

        if (insertError && (insertError.status === 401 || /jwt|token|expired/i.test(insertError.message))) {
          const retry = await refreshSessionAndRetryBoardMessage(messageData)
          data = retry.data
          insertError = retry.error
        }

        if (insertError) {
          throw insertError
        }

        if (data) {
          removeLocalOutboxEntry(outboxScope, clientMessageId)
          inserted = withSentDeliveryState(data)
          addNewMessage(inserted)

          if (channelRef.current?.state === 'joined') {
            channelRef.current.send({
              type: 'broadcast',
              event: 'new_message',
              payload: inserted,
            })
          }
        }
      }

      let lastError: any = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await attemptSend()
          lastError = null
          break
        } catch (err) {
          lastError = err
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 300))
          }
        }
      }

      if (lastError) throw lastError
    }

    try {
      await withTimeout(
        executeSend(),
        SEND_OPERATION_TIMEOUT_MS,
        'Message send timed out while reconnecting. Please try again.'
      )
    } catch (err) {
      upsertLocalOutboxEntry(outboxScope, {
        id: clientMessageId,
        clientMessageId,
        senderId: user.id,
        content: content.trim(),
        messageType,
        fileUrl,
        thumbnailUrl,
        replyTo,
        createdAt,
        failedAt: new Date().toISOString(),
      })
      setMessages(prev => markMessageSendFailed(prev, clientMessageId))
      await runRealtimeRecovery('send-error').catch(() => undefined)
      await resetWithFreshClient().catch(() => undefined)
      if (err instanceof Error) {
        ;(err as Error & { optimisticMessageId?: string }).optimisticMessageId = clientMessageId
        throw err
      }
      const wrappedError = new Error('Failed to send message') as Error & { optimisticMessageId?: string }
      wrappedError.optimisticMessageId = clientMessageId
      throw wrappedError
    } finally {
      sendingRef.current = false
      setSending(false)
    }

    return inserted
  }, [addNewMessage, boardSlug, profile, resetWithFreshClient, user])

  const retryFailedMessage = useCallback(async (messageId: string) => {
    const failedMessage = latestMessagesRef.current.find(message =>
      (message.id === messageId || message.client_message_id === messageId) &&
      message.delivery_status === 'failed'
    )

    if (!failedMessage) return null

    const clientMessageId = failedMessage.client_message_id || failedMessage.id
    const retryContent = failedMessage.message_type === 'audio'
      ? failedMessage.audio_url || failedMessage.content
      : failedMessage.content

    return sendMessage(
      retryContent ?? '',
      failedMessage.message_type,
      failedMessage.file_url ?? undefined,
      failedMessage.reply_to ?? undefined,
      failedMessage.thumbnail_url,
      {
        clientMessageId,
        createdAt: new Date().toISOString(),
      }
    )
  }, [sendMessage])

  const discardFailedMessage = useCallback((messageId: string) => {
    removeLocalOutboxEntry(getBoardOutboxScope(boardSlug), messageId)
    setMessages(prev => prev.filter(message => (
      message.id !== messageId &&
      message.client_message_id !== messageId
    )))
  }, [boardSlug])

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!user || !content.trim()) return
    const workingClient = await getWorkingClient()
    const editedAt = new Date().toISOString()
    const { error: updateError } = await workingClient
      .from('board_chat_messages')
      .update({ content: content.trim(), edited_at: editedAt })
      .eq('id', messageId)
      .eq('board_slug', boardSlug)
      .eq('user_id', user.id)

    if (updateError) throw updateError

    setMessages(prev => sortBoardMessagesByStableKey(prev.map(message =>
      message.id === messageId
        ? normalizeBoardChatMessage({ ...message, content: content.trim(), edited_at: editedAt })
        : message
    )))
  }, [boardSlug, user])

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

    setMessages(prev => {
      const index = prev.findIndex(message => message.id === messageId)
      if (index === -1) return prev

      const message = prev[index]
      const reactions = { ...(message.reactions || {}) } as Record<string, { count: number; users: string[] }>
      let data = reactions[emoji] || { count: 0, users: [] as string[] }
      const reacted = data.users.includes(user.id)

      if (reacted) {
        data = {
          count: data.count - 1,
          users: data.users.filter(userId => userId !== user.id),
        }
        if (data.count <= 0) {
          delete reactions[emoji]
        } else {
          reactions[emoji] = data
        }
      } else {
        data = {
          count: data.count + 1,
          users: [...data.users, user.id],
        }
        reactions[emoji] = data
      }

      const nextMessages = [...prev]
      nextMessages[index] = normalizeBoardChatMessage({ ...message, reactions })
      return nextMessages
    })

    const workingClient = await getWorkingClient()
    const { error: rpcError } = await workingClient.rpc('toggle_board_chat_reaction', {
      chat_message_id: messageId,
      emoji,
    })

    if (rpcError) throw rpcError
  }, [user])

  const togglePin = useCallback(async (messageId: string) => {
    if (!user) return
    const workingClient = await getWorkingClient()
    const { error: rpcError } = await workingClient.rpc('toggle_board_chat_pin', {
      chat_message_id: messageId,
    })

    if (rpcError) {
      await refresh({ force: true, silent: true }).catch(() => undefined)
      throw rpcError
    }

    setMessages(prev => {
      const current = prev.find(message => message.id === messageId)
      const isPinned = current?.pinned
      return sortBoardMessagesByStableKey(prev.map(message => {
        if (message.id === messageId) {
          return normalizeBoardChatMessage({
            ...message,
            pinned: !isPinned,
            pinned_by: !isPinned ? user.id : null,
            pinned_at: !isPinned ? new Date().toISOString() : null,
          })
        }
        return !isPinned
          ? normalizeBoardChatMessage({ ...message, pinned: false, pinned_by: null, pinned_at: null })
          : message
      }))
    })
  }, [refresh, user])

  return {
    messages,
    loading,
    sending,
    loadingMore,
    hasOlder,
    hasNewer,
    hasMore: hasOlder,
    windowMode,
    targetStatus,
    anchorStatus,
    error,
    refresh,
    sendMessage,
    editMessage,
    deleteMessage,
    retryFailedMessage,
    discardFailedMessage,
    toggleReaction,
    togglePin,
    loadLatestMessages,
    loadOlderMessages,
    loadNewerMessages,
    ensureMessageWindow,
    compactToLatestMessages,
  }
}
