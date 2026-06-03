import React, { useEffect, useLayoutEffect, useMemo, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDown } from 'lucide-react'
import { useMessages } from '../../hooks/useMessages'
import { useTyping } from '../../hooks/useTyping'
import { groupMessagesByDate, shouldGroupMessage } from '../../lib/utils'
import { MessageItem } from './MessageItem'
import type { FailedMessage } from '../../hooks/useFailedMessages'
import { FailedMessageItem } from './FailedMessageItem'
import toast from 'react-hot-toast'
import type { Message } from '../../lib/supabase'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { useAuth } from '../../hooks/useAuth'
import { UserRoleBadge } from '../ui/UserRoleBadge'
import { UserPresenceBadge } from '../ui/UserPresenceBadge'
import { getBlockedActionMessage } from '../../lib/moderation'
import { showActionErrorToast } from '../../lib/toastNotifications'
import { useReadCursor } from '../../hooks/useReadCursor'
import { useUnreadScroll, type UnreadScrollFeedState } from '../../hooks/useUnreadScroll'
import { UnreadDivider } from './UnreadDivider'
import { compareMessageKey, isMessageAfterCursor } from '../../lib/readCursors'

interface MessageListProps {
  onReply?: (message: Message) => void
  failedMessages?: FailedMessage[]
  onResend?: (msg: FailedMessage) => void
  onRetryFailed?: (messageId: string) => Promise<Message | null>
  onDiscardFailed?: (messageId: string) => void
  sending?: boolean
  uploading?: boolean
  initialMessageId?: string
}

const DEFAULT_RENDER_WINDOW_SIZE = 90
const RENDER_WINDOW_INCREMENT = 60
const RENDER_WINDOW_FORWARD_OVERSCAN = 0
const HISTORY_LOAD_ROOT_MARGIN = '180px 0px 0px 0px'
const HISTORY_LOAD_SCROLL_THRESHOLD = 180
const HISTORY_LOAD_COOLDOWN_MS = 1800
const TARGET_SCROLL_SETTLE_MS = 260
const TARGET_SCROLL_VERIFY_ATTEMPTS = 4

type GeneralChatMessagesApi = ReturnType<typeof useMessages> & {
  loadLatestMessages?: () => Promise<void> | void
  ensureMessageWindow?: ReturnType<typeof useMessages>['ensureMessageWindow']
  windowMode?: ReturnType<typeof useMessages>['windowMode']
  targetStatus?: ReturnType<typeof useMessages>['targetStatus']
  anchorStatus?: ReturnType<typeof useMessages>['anchorStatus']
  hasOlder?: boolean
  hasNewer?: boolean
  hasMore?: boolean
}

type DeepLinkStatus = 'none' | 'resolving' | 'mounting' | 'scrolling' | 'settled' | 'targetUnavailable'
type WindowModeOverride = Extract<UnreadScrollFeedState, 'historyPrepend' | 'newerAppend' | 'layoutSettling'>

type VisibleMessageAnchor = {
  id: string
  top: number
  scrollHeight: number
}

const findMessageRowById = (container: HTMLElement, id: string) => {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-message-row="true"]'))
    .find(row => row.dataset.messageId === id) ?? null
}

const isElementVisibleInContainer = (element: HTMLElement, container: HTMLElement) => {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  return elementRect.bottom > containerRect.top + 8 && elementRect.top < containerRect.bottom - 8
}

const resolveWindowStartForTarget = (currentStart: number, targetIndex: number) => {
  const desiredStart = Math.max(0, targetIndex - 8)
  const currentEnd = currentStart + DEFAULT_RENDER_WINDOW_SIZE + RENDER_WINDOW_FORWARD_OVERSCAN

  if (targetIndex < currentStart) {
    return Math.min(currentStart, desiredStart)
  }

  if (targetIndex >= currentEnd) {
    return Math.max(currentStart, desiredStart)
  }

  return currentStart
}

const compareMessagesByStableKey = (a: Message, b: Message) => compareMessageKey(
  { created_at: a.created_at, id: a.id },
  { created_at: b.created_at, id: b.id }
)

const isServerWindowMessage = (message: Message) => (
  !message.pinned &&
  !message.optimistic &&
  message.delivery_status !== 'sending' &&
  message.delivery_status !== 'failed'
)

export const MessageList: React.FC<MessageListProps> = ({
  onReply,
  failedMessages = [],
  onResend,
  onRetryFailed,
  onDiscardFailed,
  sending = false,
  uploading = false,
  initialMessageId,
}) => {
  const messagesApi = useMessages() as GeneralChatMessagesApi
  const {
    messages,
    loading,
    editMessage,
    deleteMessage,
    togglePin,
    toggleReaction,
    loadOlderMessages,
    compactToLatestMessages = () => {},
    loadingMore,
    hasOlder: dataHasOlder = false,
    hasMore: legacyHasMore = false,
    loadLatestMessages,
    ensureMessageWindow,
    windowMode: dataWindowMode = 'latest',
    targetStatus: dataTargetStatus = 'not_requested',
    anchorStatus: dataAnchorStatus = 'not_requested',
    hasNewer = false,
  } = messagesApi
  const hasMore = dataHasOlder || legacyHasMore
  const { typingUsers } = useTyping('general')
  const { profile } = useAuth()
  const containerRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const pendingAnchorRef = useRef<VisibleMessageAnchor | null>(null)
  const pendingJumpMessageIdRef = useRef<string | null>(null)
  const olderLoadInFlightRef = useRef(false)
  const lastHistoryRequestAtRef = useRef(0)
  const historyRetryTimerRef = useRef<number | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const initialTargetJumpDoneRef = useRef<string | null>(null)
  const historyIntentRef = useRef(false)
  const windowModeTimerRef = useRef<number | null>(null)
  const deepLinkSettleTimerRef = useRef<number | null>(null)
  const deepLinkInFlightRef = useRef<string | null>(null)
  const deepLinkFetchRef = useRef<string | null>(null)
  const deepLinkVerifyAttemptsRef = useRef(0)
  const cursorWindowFetchRef = useRef<string | null>(null)
  const previousLatestMessageIdRef = useRef<string | null>(null)
  const hiddenAfterCountRef = useRef(0)
  const combinedMessagesLengthRef = useRef(0)
  const [renderWindowStart, setRenderWindowStart] = useState(0)
  const [historyLoadArmed, setHistoryLoadArmed] = useState(false)
  const [windowModeOverride, setWindowModeOverride] = useState<WindowModeOverride | null>(null)
  const [deepLinkStatus, setDeepLinkStatus] = useState<DeepLinkStatus>(initialMessageId ? 'resolving' : 'none')
  const [cursorWindowResolving, setCursorWindowResolving] = useState(false)
  const { cursor, loading: cursorLoading, markRead } = useReadCursor('general_chat', 'main', Boolean(profile?.id))

  const messageMap = useMemo(() => {
    const msgMap = new Map<string, Message>()
    messages.forEach(m => {
      msgMap.set(m.id, m)
    })
    return msgMap
  }, [messages])

  const combinedMessages = useMemo(() => {
    return [...messages].sort(compareMessagesByStableKey)
  }, [messages])

  const serverWindowMessages = useMemo(
    () => combinedMessages.filter(isServerWindowMessage),
    [combinedMessages]
  )

  const markGeneralChatRead = useCallback(
    async (message: Message) => {
      await markRead(message.id, message.created_at)
    },
    [markRead]
  )
  const getMessageId = useCallback((message: Message) => message.id, [])
  const getMessageCreatedAt = useCallback((message: Message) => message.created_at, [])
  const getMessageElementId = useCallback((id: string) => `message-${id}`, [])
  const cursorWindowFetchKey = useMemo(() => {
    if (
      !profile?.id ||
      initialMessageId ||
      !cursor?.last_read_at ||
      serverWindowMessages.length === 0
    ) {
      return null
    }

    const oldestLoaded = serverWindowMessages[0]
    const latestLoaded = serverWindowMessages[serverWindowMessages.length - 1]
    if (!oldestLoaded || !latestLoaded) return null

    const cursorMessageLoaded = Boolean(
      cursor.last_read_message_id &&
      serverWindowMessages.some(message => message.id === cursor.last_read_message_id)
    )
    const latestLoadedIsUnread = isMessageAfterCursor({
      created_at: latestLoaded.created_at,
      id: latestLoaded.id,
    }, cursor)
    const cursorPredatesLoadedWindow = compareMessageKey(
      { created_at: cursor.last_read_at, id: cursor.last_read_message_id },
      { created_at: oldestLoaded.created_at, id: oldestLoaded.id }
    ) < 0

    if (!latestLoadedIsUnread || cursorMessageLoaded || !cursorPredatesLoadedWindow) {
      return null
    }

    return [
      profile.id,
      cursor.scope_id,
      cursor.last_read_message_id ?? 'timestamp',
      cursor.last_read_at,
    ].join(':')
  }, [cursor, initialMessageId, profile?.id, serverWindowMessages])
  const cursorWindowNeeded = Boolean(
    cursorWindowFetchKey &&
    cursorWindowFetchRef.current !== cursorWindowFetchKey
  )

  const {
    autoScroll,
    firstUnreadMessageId,
    setAutoScroll,
    setFirstUnreadMessageId,
    handleUnreadScroll,
    scrollToBottom,
    feedState,
    targetMessageId,
    lastObservedMessageId,
    lastFlushedMessageId,
  } = useUnreadScroll<Message>({
    containerRef,
    messages: combinedMessages as Message[],
    loading: loading || cursorWindowResolving || cursorWindowNeeded,
    cursor,
    cursorLoading,
    enabled: Boolean(profile?.id),
    surfaceKey: 'general_chat:main',
    initialMessageId,
    renderSignal: renderWindowStart,
    getMessageId,
    getMessageCreatedAt,
    getElementId: getMessageElementId,
    onMarkReadToLatest: markGeneralChatRead,
  })

  const captureVisibleAnchor = useCallback((): VisibleMessageAnchor | null => {
    const container = containerRef.current
    if (!container) return null

    const containerRect = container.getBoundingClientRect()
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-message-row="true"]'))
    const visibleRow = rows.find(row => {
      const rect = row.getBoundingClientRect()
      return rect.bottom > containerRect.top + 1 && rect.top < containerRect.bottom - 1
    })

    const id = visibleRow?.dataset.messageId
    if (!visibleRow || !id) return null

    return {
      id,
      top: visibleRow.getBoundingClientRect().top - containerRect.top,
      scrollHeight: container.scrollHeight,
    }
  }, [])

  const capturePendingAnchor = useCallback(() => {
    pendingAnchorRef.current = captureVisibleAnchor()
  }, [captureVisibleAnchor])

  const clearHistoryRetry = useCallback(() => {
    if (historyRetryTimerRef.current !== null) {
      window.clearTimeout(historyRetryTimerRef.current)
      historyRetryTimerRef.current = null
    }
  }, [])

  const clearWindowModeTimer = useCallback(() => {
    if (windowModeTimerRef.current !== null) {
      window.clearTimeout(windowModeTimerRef.current)
      windowModeTimerRef.current = null
    }
  }, [])

  const clearDeepLinkSettleTimer = useCallback(() => {
    if (deepLinkSettleTimerRef.current !== null) {
      window.clearTimeout(deepLinkSettleTimerRef.current)
      deepLinkSettleTimerRef.current = null
    }
  }, [])

  const setTemporaryWindowMode = useCallback((mode: WindowModeOverride, durationMs = 320) => {
    clearWindowModeTimer()
    setWindowModeOverride(mode)
    windowModeTimerRef.current = window.setTimeout(() => {
      windowModeTimerRef.current = null
      setWindowModeOverride(null)
    }, durationMs)
  }, [clearWindowModeTimer])

  useEffect(() => {
    if (!firstUnreadMessageId && !targetMessageId) return
    clearWindowModeTimer()
    setWindowModeOverride(null)
  }, [clearWindowModeTimer, firstUnreadMessageId, targetMessageId])

  const requestOlderMessages = useCallback((force = false) => {
    if ((!historyLoadArmed && !force) || !historyIntentRef.current) return
    if (loading || loadingMore || olderLoadInFlightRef.current) return

    const canRevealLoadedHistory = renderWindowStart > 0
    if (!canRevealLoadedHistory && !hasMore) return

    const now = Date.now()
    if (
      lastHistoryRequestAtRef.current > 0 &&
      now - lastHistoryRequestAtRef.current < HISTORY_LOAD_COOLDOWN_MS
    ) {
      const retryDelay = Math.max(80, HISTORY_LOAD_COOLDOWN_MS - (now - lastHistoryRequestAtRef.current) + 24)
      if (historyRetryTimerRef.current === null) {
          historyRetryTimerRef.current = window.setTimeout(() => {
          historyRetryTimerRef.current = null
          const el = containerRef.current
          if (!el || el.scrollTop > HISTORY_LOAD_SCROLL_THRESHOLD) return
          requestOlderMessages(true)
        }, retryDelay)
      }
      return
    }
    clearHistoryRetry()
    lastHistoryRequestAtRef.current = now

    capturePendingAnchor()
    setAutoScroll(false)
    setTemporaryWindowMode('historyPrepend', 600)

    if (canRevealLoadedHistory) {
      setRenderWindowStart(current => Math.max(0, current - RENDER_WINDOW_INCREMENT))
      return
    }

    olderLoadInFlightRef.current = true
    void loadOlderMessages().finally(() => {
      olderLoadInFlightRef.current = false
    })
  }, [
    capturePendingAnchor,
    hasMore,
    historyLoadArmed,
    loadOlderMessages,
    loading,
    loadingMore,
    renderWindowStart,
    clearHistoryRetry,
    setAutoScroll,
    setTemporaryWindowMode,
  ])

  const revealNewerLoadedMessages = useCallback(() => {
    if (hiddenAfterCountRef.current <= 0) return false

    capturePendingAnchor()
    setAutoScroll(false)
    setTemporaryWindowMode('layoutSettling', 260)
    setRenderWindowStart(current => {
      const maxStart = Math.max(0, combinedMessagesLengthRef.current - DEFAULT_RENDER_WINDOW_SIZE)
      return Math.min(maxStart, current + RENDER_WINDOW_INCREMENT)
    })
    return true
  }, [capturePendingAnchor, setAutoScroll, setTemporaryWindowMode])

  const handleScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) return

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null
      const el = containerRef.current
      if (!el) return

      handleUnreadScroll()

      if (el.scrollTop <= HISTORY_LOAD_SCROLL_THRESHOLD) {
        historyIntentRef.current = true
        requestOlderMessages(true)
        return
      }

      if (el.scrollHeight - el.scrollTop - el.clientHeight <= HISTORY_LOAD_SCROLL_THRESHOLD) {
        revealNewerLoadedMessages()
      }
    })
  }, [handleUnreadScroll, requestOlderMessages, revealNewerLoadedMessages])

  useEffect(() => {
    initialTargetJumpDoneRef.current = null
    deepLinkInFlightRef.current = null
    deepLinkFetchRef.current = null
    deepLinkVerifyAttemptsRef.current = 0
    cursorWindowFetchRef.current = null
    historyIntentRef.current = false
    setHistoryLoadArmed(false)
    setCursorWindowResolving(false)
    setDeepLinkStatus(initialMessageId ? 'resolving' : 'none')
    clearDeepLinkSettleTimer()
  }, [clearDeepLinkSettleTimer, initialMessageId, profile?.id])

  useEffect(() => {
    if (
      !cursorWindowFetchKey ||
      !cursor?.last_read_at ||
      loading ||
      loadingMore ||
      cursorLoading ||
      cursorWindowResolving ||
      cursorWindowFetchRef.current === cursorWindowFetchKey
    ) {
      return
    }

    cursorWindowFetchRef.current = cursorWindowFetchKey
    setCursorWindowResolving(true)
    void ensureMessageWindow(cursor.last_read_message_id ?? null, {
      targetLastReadMessageId: cursor.last_read_message_id,
      targetLastReadAt: cursor.last_read_at,
    })
      .catch(() => undefined)
      .finally(() => {
        setCursorWindowResolving(false)
      })
  }, [
    cursor,
    cursorLoading,
    cursorWindowFetchKey,
    cursorWindowResolving,
    ensureMessageWindow,
    loading,
    loadingMore,
  ])

  useEffect(() => {
    if (loading || cursorLoading || cursorWindowResolving || combinedMessages.length === 0) {
      setHistoryLoadArmed(false)
      return
    }

    if (historyLoadArmed) return

    const timer = window.setTimeout(() => {
      setHistoryLoadArmed(true)
    }, 650)

    return () => window.clearTimeout(timer)
  }, [combinedMessages.length, cursorLoading, cursorWindowResolving, historyLoadArmed, loading])

  useEffect(() => {
    if (!autoScroll || initialMessageId || firstUnreadMessageId || targetMessageId) return
    if (combinedMessages.length <= DEFAULT_RENDER_WINDOW_SIZE) return
    compactToLatestMessages()
  }, [autoScroll, combinedMessages.length, compactToLatestMessages, firstUnreadMessageId, initialMessageId, targetMessageId])

  useEffect(() => {
    const latestId = combinedMessages[combinedMessages.length - 1]?.id ?? null
    const previousLatestId = previousLatestMessageIdRef.current
    previousLatestMessageIdRef.current = latestId

    if (
      autoScroll &&
      !firstUnreadMessageId &&
      !initialMessageId &&
      !targetMessageId &&
      previousLatestId &&
      latestId &&
      previousLatestId !== latestId
    ) {
      setTemporaryWindowMode('newerAppend')
    }
  }, [autoScroll, combinedMessages, firstUnreadMessageId, initialMessageId, setTemporaryWindowMode, targetMessageId])

  useLayoutEffect(() => {
    const anchor = pendingAnchorRef.current
    if (!anchor) return

    const container = containerRef.current
    const anchorEl = container ? findMessageRowById(container, anchor.id) : null
    pendingAnchorRef.current = null

    if (!container) return

    const heightDelta = Math.max(0, container.scrollHeight - anchor.scrollHeight)
    const nextTop = anchorEl
      ? anchorEl.getBoundingClientRect().top - container.getBoundingClientRect().top
      : anchor.top
    const measuredDelta = nextTop - anchor.top
    const delta = Math.abs(measuredDelta) > 0.5
      ? measuredDelta
      : container.scrollTop <= HISTORY_LOAD_SCROLL_THRESHOLD
      ? heightDelta
      : 0
    if (Math.abs(delta) > 0.5) {
      setTemporaryWindowMode('layoutSettling')
      container.scrollTop += delta
    }
  }, [combinedMessages.length, renderWindowStart, setTemporaryWindowMode])

  useEffect(() => {
    const sentinel = topSentinelRef.current
    const container = containerRef.current
    if (!sentinel || !container || typeof IntersectionObserver === 'undefined') return
    if (!hasMore && renderWindowStart === 0) return

    const observer = new IntersectionObserver(
      entries => {
        if (historyLoadArmed && historyIntentRef.current && entries.some(entry => entry.isIntersecting)) {
          requestOlderMessages()
        }
      },
      {
        root: container,
        rootMargin: HISTORY_LOAD_ROOT_MARGIN,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, historyLoadArmed, renderWindowStart, requestOlderMessages])

  useEffect(() => {
    return () => {
      clearHistoryRetry()
      clearWindowModeTimer()
      clearDeepLinkSettleTimer()
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current)
      }
    }
  }, [clearDeepLinkSettleTimer, clearHistoryRetry, clearWindowModeTimer])

  useEffect(() => {
    if (autoScroll && typingUsers.length > 0) {
      scrollToBottom('auto')
    }
  }, [autoScroll, scrollToBottom, typingUsers.length])

  useLayoutEffect(() => {
    if (combinedMessages.length === 0) {
      setRenderWindowStart(0)
      return
    }

    const latestWindowStart = Math.max(0, combinedMessages.length - DEFAULT_RENDER_WINDOW_SIZE)

    if (initialMessageId) {
      const targetIndex = combinedMessages.findIndex(message => message.id === initialMessageId)
      if (targetIndex >= 0) {
        setRenderWindowStart(current => resolveWindowStartForTarget(current, targetIndex))
        return
      }
    }

    if (firstUnreadMessageId) {
      const unreadIndex = combinedMessages.findIndex(message => message.id === firstUnreadMessageId)
      if (unreadIndex >= 0) {
        setRenderWindowStart(current => resolveWindowStartForTarget(current, unreadIndex))
        return
      }
    }

    if (autoScroll) {
      setRenderWindowStart(latestWindowStart)
    }
  }, [autoScroll, combinedMessages, firstUnreadMessageId, initialMessageId])

  useLayoutEffect(() => {
    const maxStart = Math.max(0, combinedMessages.length - 1)
    setRenderWindowStart(current => Math.min(Math.max(0, current), maxStart))
  }, [combinedMessages.length])

  const pinnedMessagesBeforeWindow = useMemo(
    () => combinedMessages.slice(0, renderWindowStart).filter(message => message.pinned),
    [combinedMessages, renderWindowStart]
  )

  const renderedMessages = useMemo(() => {
    const boundedStart = Math.min(renderWindowStart, combinedMessages.length)
    const boundedEnd = Math.min(
      combinedMessages.length,
      boundedStart + DEFAULT_RENDER_WINDOW_SIZE + RENDER_WINDOW_FORWARD_OVERSCAN
    )
    const seenIds = new Set<string>()
    const nextMessages: Message[] = []

    for (const message of pinnedMessagesBeforeWindow) {
      if (!seenIds.has(message.id)) {
        seenIds.add(message.id)
        nextMessages.push(message)
      }
    }

    for (const message of combinedMessages.slice(boundedStart, boundedEnd)) {
      if (!seenIds.has(message.id)) {
        seenIds.add(message.id)
        nextMessages.push(message)
      }
    }

    return nextMessages
  }, [combinedMessages, pinnedMessagesBeforeWindow, renderWindowStart])

  const hiddenBeforeCount = Math.max(0, renderWindowStart - pinnedMessagesBeforeWindow.length)
  const renderedRegularCount = renderedMessages.length - pinnedMessagesBeforeWindow.length
  const hiddenAfterCount = Math.max(
    0,
    combinedMessages.length - Math.min(
      combinedMessages.length,
      renderWindowStart + renderedRegularCount
    )
  )
  hiddenAfterCountRef.current = hiddenAfterCount
  combinedMessagesLengthRef.current = combinedMessages.length
  const hasOlderMessages = renderWindowStart > 0 || hasMore
  const hasNewerMessages = hasNewer || hiddenAfterCount > 0 || !autoScroll
  const targetId = initialMessageId || targetMessageId || firstUnreadMessageId || ''
  const windowMode: UnreadScrollFeedState = windowModeOverride
    ?? (loading && combinedMessages.length > 0
      ? 'reconnectReconciling'
      : loading || cursorLoading || cursorWindowResolving
      ? 'resolvingInitial'
      : initialMessageId && deepLinkStatus === 'targetUnavailable'
      ? 'targetUnavailable'
      : initialMessageId && deepLinkStatus !== 'none' && deepLinkStatus !== 'settled'
      ? 'targetingDeepLink'
      : feedState)

  const eagerAvatarMessageIds = useMemo(() => (
    new Set(renderedMessages.slice(-12).map(message => message.id))
  ), [renderedMessages])

  const groupedMessages = useMemo(
    () => groupMessagesByDate(renderedMessages as any[]),
    [renderedMessages]
  )

  const scrollAndHighlightMessage = useCallback((
    id: string,
    ringClassName = 'ring-[var(--color-accent)]',
    durationMs = 2000
  ) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`message-${id}`)
      if (!el) return

      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', ringClassName)
      window.setTimeout(() => {
        el.classList.remove('ring-2', ringClassName)
      }, durationMs)
    })
  }, [])

  const jumpToMessage = useCallback(
    (id: string) => {
      const targetIndex = combinedMessages.findIndex(message => message.id === id)
      if (targetIndex >= 0 && targetIndex < renderWindowStart) {
        pendingJumpMessageIdRef.current = id
        capturePendingAnchor()
        setRenderWindowStart(Math.max(0, targetIndex - 8))
        return
      }

      scrollAndHighlightMessage(id)
    },
    [capturePendingAnchor, combinedMessages, renderWindowStart, scrollAndHighlightMessage]
  )

  useLayoutEffect(() => {
    const pendingJumpId = pendingJumpMessageIdRef.current
    if (!pendingJumpId) return

    const el = document.getElementById(`message-${pendingJumpId}`)
    if (!el) return

    pendingJumpMessageIdRef.current = null
    scrollAndHighlightMessage(pendingJumpId)
  }, [renderedMessages, scrollAndHighlightMessage])

  useLayoutEffect(() => {
    if (!initialMessageId) {
      setDeepLinkStatus('none')
      return
    }

    if (initialTargetJumpDoneRef.current === initialMessageId) {
      return
    }

    if (loading) {
      setDeepLinkStatus('resolving')
      return
    }

    const targetIndex = combinedMessages.findIndex(message => message.id === initialMessageId)
    if (targetIndex < 0) {
      if (ensureMessageWindow && dataTargetStatus !== 'missing') {
        if (deepLinkFetchRef.current !== initialMessageId) {
          deepLinkFetchRef.current = initialMessageId
          setDeepLinkStatus('resolving')
          void ensureMessageWindow(initialMessageId)
            .then(target => {
              if (deepLinkFetchRef.current === initialMessageId) {
                deepLinkFetchRef.current = null
              }
              if (!target) {
                setDeepLinkStatus('targetUnavailable')
              }
            })
            .catch(() => {
              if (deepLinkFetchRef.current === initialMessageId) {
                deepLinkFetchRef.current = null
              }
              setDeepLinkStatus('targetUnavailable')
            })
        }
        return
      }

      setDeepLinkStatus('targetUnavailable')
      return
    }

    deepLinkFetchRef.current = null
    setFirstUnreadMessageId(null)
    setAutoScroll(false)

    if (targetIndex < renderWindowStart) {
      setDeepLinkStatus('mounting')
      setRenderWindowStart(current => resolveWindowStartForTarget(current, targetIndex))
      return
    }

    if (!renderedMessages.some(message => message.id === initialMessageId)) {
      setDeepLinkStatus('mounting')
      setRenderWindowStart(current => resolveWindowStartForTarget(current, targetIndex))
      return
    }

    if (deepLinkInFlightRef.current === initialMessageId) {
      return
    }

    const targetEl = document.getElementById(`message-${initialMessageId}`)
    if (!(targetEl instanceof HTMLElement)) {
      setDeepLinkStatus('mounting')
      return
    }

    const targetRect = targetEl.getBoundingClientRect()
    if (targetRect.height <= 0) {
      setDeepLinkStatus('mounting')
      return
    }

    deepLinkInFlightRef.current = initialMessageId
    deepLinkVerifyAttemptsRef.current = 0
    setDeepLinkStatus('scrolling')
    setTemporaryWindowMode('layoutSettling', TARGET_SCROLL_SETTLE_MS + 120)

    requestAnimationFrame(() => {
      const settledTargetEl = document.getElementById(`message-${initialMessageId}`)
      if (!(settledTargetEl instanceof HTMLElement)) {
        deepLinkInFlightRef.current = null
        setDeepLinkStatus('mounting')
        return
      }

      settledTargetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      settledTargetEl.classList.add('ring-2', 'ring-[rgba(34,197,94,0.55)]')

      clearDeepLinkSettleTimer()
      const settleDeepLinkTarget = () => {
        deepLinkSettleTimerRef.current = null

        const currentTargetEl = document.getElementById(`message-${initialMessageId}`)
        const container = containerRef.current
        if (
          currentTargetEl instanceof HTMLElement &&
          container &&
          !isElementVisibleInContainer(currentTargetEl, container) &&
          deepLinkVerifyAttemptsRef.current < TARGET_SCROLL_VERIFY_ATTEMPTS
        ) {
          deepLinkVerifyAttemptsRef.current += 1
          currentTargetEl.scrollIntoView({ behavior: 'auto', block: 'center' })
          setDeepLinkStatus('scrolling')
          deepLinkSettleTimerRef.current = window.setTimeout(settleDeepLinkTarget, TARGET_SCROLL_SETTLE_MS)
          return
        }

        currentTargetEl?.classList.remove('ring-2', 'ring-[rgba(34,197,94,0.55)]')
        initialTargetJumpDoneRef.current = initialMessageId
        deepLinkInFlightRef.current = null
        setDeepLinkStatus('settled')
      }
      deepLinkSettleTimerRef.current = window.setTimeout(settleDeepLinkTarget, TARGET_SCROLL_SETTLE_MS)
    })
  }, [
    clearDeepLinkSettleTimer,
    combinedMessages,
    dataTargetStatus,
    ensureMessageWindow,
    initialMessageId,
    loading,
    renderWindowStart,
    renderedMessages,
    setAutoScroll,
    setFirstUnreadMessageId,
    setTemporaryWindowMode,
  ])

  const handleEdit = useCallback(async (messageId: string, content: string) => {
    try {
      await editMessage(messageId, content)
      toast.success('Message updated')
    } catch (error) {
      const message = await getBlockedActionMessage('general_chat', error, 'Failed to update message')
      showActionErrorToast(message)
    }
  }, [editMessage])

  const handleDelete = useCallback(async (messageId: string) => {
    try {
      await deleteMessage(messageId)
      toast.success('Message deleted')
    } catch (error) {
      const message = await getBlockedActionMessage('general_chat', error, 'Failed to delete message')
      showActionErrorToast(message)
    }
  }, [deleteMessage])

  const handleJumpToLatest = useCallback(async () => {
    setTemporaryWindowMode('layoutSettling', TARGET_SCROLL_SETTLE_MS + 160)
    setAutoScroll(true)
    setFirstUnreadMessageId(null)

    if (loadLatestMessages) {
      await Promise.resolve(loadLatestMessages())
    } else {
      compactToLatestMessages()
    }

    requestAnimationFrame(() => {
      scrollToBottom('auto')
      requestAnimationFrame(() => scrollToBottom())
    })
  }, [
    compactToLatestMessages,
    loadLatestMessages,
    scrollToBottom,
    setAutoScroll,
    setFirstUnreadMessageId,
    setTemporaryWindowMode,
  ])

  const showInitialLoading = loading && combinedMessages.length === 0
  const refreshingCachedMessages = loading && combinedMessages.length > 0

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      data-testid="message-scroll"
      data-loaded-count={combinedMessages.length}
      data-rendered-count={renderedMessages.length}
      data-hidden-before-count={hiddenBeforeCount}
      data-hidden-after-count={hiddenAfterCount}
      data-window-mode={windowMode}
      data-target-id={targetId}
      data-window-target={targetId}
      data-data-window-mode={dataWindowMode}
      data-data-target-status={dataTargetStatus}
      data-data-anchor-status={dataAnchorStatus}
      data-has-older={String(hasOlderMessages)}
      data-has-newer={String(hasNewerMessages)}
      data-last-observed-visible-id={lastObservedMessageId ?? ''}
      data-last-observed-readable-id={lastObservedMessageId ?? ''}
      data-last-flushed-read-id={lastFlushedMessageId ?? ''}
      data-deep-link-status={deepLinkStatus}
      data-scroll-target-state={feedState}
      data-scroll-target-id={targetMessageId ?? ''}
      data-first-unread-id={firstUnreadMessageId ?? ''}
      data-read-cursor-id={cursor?.last_read_message_id ?? ''}
      className="relative flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden px-4 pb-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-mobile-scroll-keyboard-inset,0px)_+_0.75rem)] pt-4 md:px-3 md:pb-[calc(env(safe-area-inset-bottom)_+_6rem)]"
    >
      <div data-testid="message-stack" className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-end">
      <div ref={topSentinelRef} aria-hidden="true" className="h-px w-full shrink-0" />

      {showInitialLoading ? (
        <div className="flex min-h-full items-center justify-center">
          <div className="glass-panel rounded-[var(--radius-xl)] px-8 py-6 text-center">
            <div className="text-[var(--text-secondary)]">Loading the conversation...</div>
            <div className="mt-2 text-xs text-[var(--text-muted)]">Pulling in the latest messages and thread state.</div>
          </div>
        </div>
      ) : (
        <>
      {refreshingCachedMessages && (
        <div className="flex justify-center py-2 text-sm text-[var(--text-muted)]" data-testid="message-refreshing">
          <LoadingSpinner size="sm" /> Refreshing...
        </div>
      )}

      {loadingMore && (
        <div className="flex justify-center py-2 text-sm text-[var(--text-muted)]">
          <LoadingSpinner size="sm" /> Loading more...
        </div>
      )}


      {groupedMessages.map(group => (
        <React.Fragment key={group.date}>
          <div className="flex items-center my-2">
            <hr className="flex-grow border-t border-[var(--border-panel)]" />
            <span className="mx-2 whitespace-nowrap rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">{group.date}</span>
            <hr className="flex-grow border-t border-[var(--border-panel)]" />
          </div>
          {group.messages.map((groupMessage, idx) => {
            const message = groupMessage as Message
            const prev = group.messages[idx - 1] as Message | undefined
            const isGrouped = shouldGroupMessage(message, prev)
            return (
              <React.Fragment key={message.id}>
                {firstUnreadMessageId === message.id && (
                  <UnreadDivider />
                )}
                <div
                  data-message-row="true"
                  data-message-id={message.id}
                  className={isGrouped ? 'pt-1 pb-1 [overflow-anchor:none]' : 'pt-4 pb-1 [overflow-anchor:none]'}
                >
                  <MessageItem
                    message={message}
                    previousMessage={prev}
                    parentMessage={messageMap.get(message.reply_to ?? '')}
                    onReply={onReply}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onTogglePin={togglePin}
                    onToggleReaction={toggleReaction}
                    onJumpToMessage={jumpToMessage}
                    onRetryFailed={onRetryFailed}
                    onDiscardFailed={onDiscardFailed}
                    containerRef={containerRef}
                    avatarLoading={eagerAvatarMessageIds.has(message.id) ? 'eager' : 'lazy'}
                    avatarFetchPriority={eagerAvatarMessageIds.has(message.id) ? 'high' : undefined}
                  />
                </div>
              </React.Fragment>
            )
          })}
        </React.Fragment>
      ))}

      {failedMessages.map(msg => (
        <FailedMessageItem key={msg.id} message={msg} onResend={onResend ?? (() => {})} />
      ))}

      {(uploading || sending) && (
        <div className="flex items-center space-x-2 text-sm text-[var(--text-muted)]">
          <LoadingSpinner size="sm" />
          <span>{uploading ? 'Uploading...' : 'Sending...'}</span>
        </div>
      )}
        </>
      )}

      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-2 flex items-center space-x-2 text-sm text-[var(--text-muted)]"
          >
            <div className="flex space-x-1">
              <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--theme-accent)]" />
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-[var(--theme-accent)]"
                style={{ animationDelay: '0.1s' }}
              />
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-[var(--theme-accent)]"
                style={{ animationDelay: '0.2s' }}
              />
            </div>
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {typingUsers.map((typingUser, index) => (
                <React.Fragment key={typingUser.id}>
                  {index > 0 && <span>,</span>}
                  <span className="inline-flex items-center gap-1">
                    {typingUser.display_name}
                    <UserRoleBadge role={typingUser.admin_role} />
                    <UserPresenceBadge userId={typingUser.id} presenceVisibility={typingUser.presence_visibility} />
                  </span>
                </React.Fragment>
              ))}
              <span>{typingUsers.length === 1 ? 'is' : 'are'} typing...</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {!autoScroll && (
        <button
          type="button"
          onClick={() => {
            void handleJumpToLatest()
          }}
          aria-label="Jump to latest"
          className="theme-floating-action fixed right-4 bottom-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-keyboard-inset,0px)_+_0.5rem)] z-50 rounded-full p-2 transition-transform hover:-translate-y-0.5 md:bottom-32"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      )}
      </div>
    </div>
  )
}
