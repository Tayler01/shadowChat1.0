import { beginChatTiming, type ChatTimingSurface } from '../lib/chatPerformance'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { MOBILE_VIEWPORT_UPDATED_EVENT } from '../lib/mobileViewport'
import { isMessageAfterCursor, type UserReadCursor } from '../lib/readCursors'
import { captureMessageScrollAnchor, restoreMessageScrollAnchor, saveMessageScrollAnchor, getSavedMessageScrollAnchor, getMessageReadableViewport, scrollMessageWithinContainer, type MessageScrollAnchor } from '../lib/messageScrollAnchor'

const READ_SETTLE_MS = 220
const TARGET_SETTLE_MS = 180
const FOLLOW_LATEST_SETTLE_MS = 150
const FOLLOW_LATEST_MAX_WAIT_MS = 800
const INITIAL_TARGET_MAX_RAF_ATTEMPTS = 5

export type UnreadScrollFeedState =
  | 'resolvingInitial'
  | 'targetingFirstUnread'
  | 'targetingDeepLink'
  | 'targetUnavailable'
  | 'anchoredCatchup'
  | 'bottomPinned'
  | 'userScrolledUp'
  | 'historyPrepend'
  | 'newerAppend'
  | 'layoutSettling'
  | 'reconnectReconciling'

interface UseUnreadScrollOptions<TMessage> {
  containerRef: RefObject<HTMLElement>
  messages: TMessage[]
  loading?: boolean
  cursor: UserReadCursor | null
  cursorLoading?: boolean
  restorationReady?: boolean
  enabled?: boolean
  surfaceKey: string
  readerId?: string | null
  initialMessageId?: string | null
  renderSignal?: unknown
  getMessageId: (message: TMessage) => string
  getMessageCreatedAt: (message: TMessage) => string
  getElementId: (messageId: string) => string
  getUnreadMessages?: (messages: TMessage[]) => TMessage[]
  onBeforeInitialJump?: (message: TMessage) => void
  markInitialVisibleRead?: boolean
  markVisibleOnScroll?: boolean
  onMarkReadToLatest: (message: TMessage) => Promise<void> | void
}

type ObservedMessage<TMessage> = {
  id: string
  createdAt: string
  key: string
  message: TMessage
}

const getReadableVisiblePixels = (elementRect: DOMRect, viewport: { top: number; bottom: number }) => {
  const visibleTop = Math.max(elementRect.top, viewport.top)
  const visibleBottom = Math.min(elementRect.bottom, viewport.bottom)
  return Math.max(0, visibleBottom - visibleTop)
}

export function useUnreadScroll<TMessage>({
  containerRef,
  messages,
  loading = false,
  cursor,
  cursorLoading = false,
  restorationReady = true,
  enabled = true,
  surfaceKey,
  readerId,
  initialMessageId,
  renderSignal,
  getMessageId,
  getMessageCreatedAt,
  getElementId,
  getUnreadMessages,
  onBeforeInitialJump,
  markInitialVisibleRead = false,
  markVisibleOnScroll = false,
  onMarkReadToLatest,
}: UseUnreadScrollOptions<TMessage>) {
  const savedAnchor = useMemo(() => getSavedMessageScrollAnchor(readerId, surfaceKey), [readerId, surfaceKey])
  const positionTargetId = initialMessageId ?? (savedAnchor && messages.some(message => getMessageId(message) === savedAnchor.id) ? savedAnchor.id : null)
  const scopeGenerationRef = useRef({ key: `${readerId ?? ''}:${surfaceKey}`, version: 0 })
  const scopeKey = `${readerId ?? ''}:${surfaceKey}:${initialMessageId ?? ''}`
  if (scopeGenerationRef.current.key !== scopeKey) scopeGenerationRef.current = { key: scopeKey, version: scopeGenerationRef.current.version + 1 }
  const [readyScope, setReadyScope] = useState<string | null>(null)
  const [autoScroll, setAutoScrollState] = useState(true)
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null)
  const [feedState, setFeedStateValue] = useState<UnreadScrollFeedState>('resolvingInitial')
  const [targetMessageId, setTargetMessageIdValue] = useState<string | null>(null)
  const [lastObservedMessageId, setLastObservedMessageId] = useState<string | null>(null)
  const [lastFlushedMessageId, setLastFlushedMessageId] = useState<string | null>(null)
  const autoScrollRef = useRef(true)
  const feedStateRef = useRef<UnreadScrollFeedState>('resolvingInitial')
  const targetMessageIdRef = useRef<string | null>(null)
  const initialUnreadJumpDoneRef = useRef(false)
  const initialUnreadTargetIdRef = useRef<string | null>(null)
  const initialUnreadReadHoldRef = useRef(false)
  const lastMarkedKeyRef = useRef<string | null>(null)
  const readInFlightKeyRef = useRef<string | null>(null)
  const markTimerRef = useRef<number | null>(null)
  const targetSettleTimerRef = useRef<number | null>(null)
  const followSettleTimerRef = useRef<number | null>(null)
  const followMaxTimerRef = useRef<number | null>(null)
  const lastObservedMessageRef = useRef<ObservedMessage<TMessage> | null>(null)
  const onMarkReadRef = useRef(onMarkReadToLatest)
  const cursorRef = useRef(cursor)
  const messagesRef = useRef(messages)
  const loadingRef = useRef(loading)
  const cursorLoadingRef = useRef(cursorLoading)
  const restorationReadyRef = useRef(restorationReady)
  const anchoredPositionRef = useRef<MessageScrollAnchor | null>(null)
  messagesRef.current = messages
  cursorRef.current = cursor
  loadingRef.current = loading
  cursorLoadingRef.current = cursorLoading
  restorationReadyRef.current = restorationReady
  onMarkReadRef.current = onMarkReadToLatest
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const messageCount = messages.length
  const latestMessage = messages[messageCount - 1]
  const latestMessageKey = latestMessage
    ? `${surfaceKey}:${getMessageId(latestMessage)}:${getMessageCreatedAt(latestMessage)}`
    : `${surfaceKey}:empty`
  const messagesById = useMemo(() => {
    const map = new Map<string, TMessage>()
    for (const message of messages) {
      map.set(getMessageId(message), message)
    }
    return map
  }, [getMessageId, messages])
  const messagesByIdRef = useRef(messagesById)
  messagesByIdRef.current = messagesById

  const setFeedState = useCallback((value: UnreadScrollFeedState) => {
    if (feedStateRef.current === value) {
      return
    }

    feedStateRef.current = value
    setFeedStateValue(value)
  }, [])

  const setTargetMessageId = useCallback((value: string | null) => {
    if (targetMessageIdRef.current === value) {
      return
    }

    targetMessageIdRef.current = value
    setTargetMessageIdValue(value)
  }, [])

  const setAutoScroll = useCallback((value: boolean) => {
    if (autoScrollRef.current === value) {
      return
    }

    autoScrollRef.current = value
    setAutoScrollState(value)
  }, [])

  const cancelFollowLatest = useCallback(() => {
    if (followSettleTimerRef.current !== null) {
      window.clearTimeout(followSettleTimerRef.current)
      followSettleTimerRef.current = null
    }

    if (followMaxTimerRef.current !== null) {
      window.clearTimeout(followMaxTimerRef.current)
      followMaxTimerRef.current = null
    }
  }, [])

  const clearTargetSettleTimer = useCallback(() => {
    if (targetSettleTimerRef.current !== null) {
      window.clearTimeout(targetSettleTimerRef.current)
      targetSettleTimerRef.current = null
    }
  }, [])

  const findFirstUnreadMessage = useCallback(() => {
    if (getUnreadMessages) {
      const explicitUnread = getUnreadMessages(messages)
      // Callers such as DMs provide authoritative per-message read state.
      // An empty result means there is nothing unread; falling back to an
      // older cursor here reopens already-read history on every return.
      if (explicitUnread.length === 0) return null
      if (!cursor) return explicitUnread[0] ?? null
      return explicitUnread.find(message => isMessageAfterCursor({
        created_at: getMessageCreatedAt(message),
        id: getMessageId(message),
      }, cursor)) ?? null
    }

    if (!cursor || messages.length === 0) {
      return null
    }

    if (cursor.last_read_message_id) {
      const cursorIndex = messages.findIndex(
        message => getMessageId(message) === cursor.last_read_message_id
      )
      if (cursorIndex >= 0) {
        return messages[cursorIndex + 1] ?? null
      }
    }

    return messages.find(message => isMessageAfterCursor({
      created_at: getMessageCreatedAt(message),
      id: getMessageId(message),
    }, cursor)) ?? null
  }, [cursor, getMessageCreatedAt, getMessageId, getUnreadMessages, messages])

  const getObservedMessage = useCallback((message: TMessage): ObservedMessage<TMessage> => {
    const id = getMessageId(message)
    const createdAt = getMessageCreatedAt(message)
    return {
      id,
      createdAt,
      key: `${scopeKey}:${id}:${createdAt}`,
      message,
    }
  }, [getMessageCreatedAt, getMessageId, scopeKey])

  const updateLastObservedMessage = useCallback(() => {
    const container = containerRef.current
    if (!enabled || !container) return lastObservedMessageRef.current

    const readableViewport = getMessageReadableViewport(container)
    let candidate: ObservedMessage<TMessage> | null = null

    const mountedRows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-message-id]')
    )

    if (mountedRows.length > 0) {
      for (const element of mountedRows) {
        const id = element.dataset.messageId
        const message = id ? messagesByIdRef.current.get(id) : null
        if (!message || !container.contains(element)) {
          continue
        }

        const rect = element.getBoundingClientRect()
        if (rect.height <= 0 || rect.bottom <= readableViewport.top || rect.top >= readableViewport.bottom) {
          continue
        }

        const visiblePixels = getReadableVisiblePixels(rect, readableViewport)
        const readableThreshold = Math.min(48, Math.max(12, rect.height * 0.45))
        if (visiblePixels >= readableThreshold) {
          candidate = getObservedMessage(message)
        }
      }
    } else {
      for (const message of messagesRef.current) {
        const id = getMessageId(message)
        const element = document.getElementById(getElementId(id))
        if (!(element instanceof HTMLElement) || !container.contains(element)) {
          continue
        }

        const rect = element.getBoundingClientRect()
        if (rect.height <= 0 || rect.bottom <= readableViewport.top || rect.top >= readableViewport.bottom) {
          continue
        }

        const visiblePixels = getReadableVisiblePixels(rect, readableViewport)
        const readableThreshold = Math.min(48, Math.max(12, rect.height * 0.45))
        if (visiblePixels >= readableThreshold) {
          candidate = getObservedMessage(message)
        }
      }
    }

    if (candidate && lastObservedMessageRef.current?.key !== candidate.key) {
      lastObservedMessageRef.current = candidate
      setLastObservedMessageId(candidate.id)
    } else if (!candidate && lastObservedMessageRef.current) {
      lastObservedMessageRef.current = null
      setLastObservedMessageId(null)
    }

    return candidate
  }, [containerRef, enabled, getElementId, getMessageId, getObservedMessage])

  const isCandidateBeyondCursor = useCallback((candidate: ObservedMessage<TMessage>) => {
    const currentCursor = cursorRef.current
    if (!currentCursor) {
      return true
    }

    if (currentCursor.last_read_message_id === candidate.id) {
      return false
    }

    if (currentCursor.last_read_at) {
      return isMessageAfterCursor({
        created_at: candidate.createdAt,
        id: candidate.id,
      }, currentCursor)
    }

    if (currentCursor.last_read_message_id) {
      const currentMessages = messagesRef.current
      const cursorIndex = currentMessages.findIndex(
        message => getMessageId(message) === currentCursor.last_read_message_id
      )
      const candidateIndex = currentMessages.findIndex(
        message => getMessageId(message) === candidate.id
      )
      if (cursorIndex >= 0 && candidateIndex >= 0) {
        return candidateIndex > cursorIndex
      }
    }

    return true
  }, [getMessageId])

  const markReadToCandidate = useCallback(async (
    candidate: ObservedMessage<TMessage> | null,
    clearDivider = false
  ) => {
    if (!enabledRef.current || document.querySelector('[aria-modal="true"]') && !containerRef.current?.closest('[aria-modal="true"]') || !candidate || !isCandidateBeyondCursor(candidate)) return
    if (loadingRef.current || cursorLoadingRef.current || !restorationReadyRef.current || !initialUnreadJumpDoneRef.current) return
    if (initialUnreadReadHoldRef.current && !clearDivider) return

    const markKey = candidate.key
    const scopeGeneration = scopeGenerationRef.current.version
    if (lastMarkedKeyRef.current === markKey || readInFlightKeyRef.current === markKey) {
      return
    }

    readInFlightKeyRef.current = markKey
    try {
      await onMarkReadRef.current(candidate.message)
      if (scopeGeneration !== scopeGenerationRef.current.version) return
      lastMarkedKeyRef.current = markKey
      setLastFlushedMessageId(candidate.id)
      if (clearDivider && autoScrollRef.current) {
        setFirstUnreadMessageId(null)
      }
    } finally {
      if (scopeGeneration === scopeGenerationRef.current.version && readInFlightKeyRef.current === markKey) {
        readInFlightKeyRef.current = null
      }
      if (scopeGeneration === scopeGenerationRef.current.version && autoScrollRef.current && feedStateRef.current !== 'targetingFirstUnread') {
        setFeedState('bottomPinned')
      }
    }
  }, [containerRef, isCandidateBeyondCursor, setFeedState])

  const markObservedRead = useCallback(async (
    clearDivider = false,
    options: { refreshCandidate?: boolean } = {}
  ) => {
    const candidate = (options.refreshCandidate ?? true)
      ? updateLastObservedMessage()
      : lastObservedMessageRef.current
    await markReadToCandidate(candidate, clearDivider)
  }, [markReadToCandidate, updateLastObservedMessage])

  const scheduleMarkObservedRead = useCallback((clearDivider = false) => {
    if (markTimerRef.current) {
      window.clearTimeout(markTimerRef.current)
    }

    markTimerRef.current = window.setTimeout(() => {
      markTimerRef.current = null
      void markObservedRead(clearDivider, { refreshCandidate: true }).catch(() => undefined)
    }, READ_SETTLE_MS)
  }, [markObservedRead])

  const scrollContainerToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current
    if (!container || !enabledRef.current || document.querySelector('[aria-modal="true"]') && !container.closest('[aria-modal="true"]')) return

    const top = Math.max(container.scrollHeight - container.clientHeight, 0)
    if (Math.abs(container.scrollTop - top) > 1) {
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top, behavior })
      } else {
        container.scrollTop = top
      }
    }
  }, [containerRef])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    clearTargetSettleTimer()
    initialUnreadJumpDoneRef.current = true
    setReadyScope(scopeKey)
    initialUnreadReadHoldRef.current = false
    scrollContainerToBottom(behavior)
    setAutoScroll(true)
    setFirstUnreadMessageId(null)
    setTargetMessageId(null)
    setFeedState('layoutSettling')
    scheduleMarkObservedRead(true)
  }, [clearTargetSettleTimer, scopeKey, scheduleMarkObservedRead, scrollContainerToBottom, setAutoScroll, setFeedState, setTargetMessageId])

  const flushFollowLatest = useCallback(() => {
    cancelFollowLatest()
    if (autoScrollRef.current) {
      scrollToBottom('auto')
    }
  }, [cancelFollowLatest, scrollToBottom])

  const followLatest = useCallback(() => {
    if (!enabledRef.current || document.querySelector('[aria-modal="true"]') && !containerRef.current?.closest('[aria-modal="true"]') || !autoScrollRef.current) return
    if (!initialUnreadJumpDoneRef.current) return
    if (initialUnreadReadHoldRef.current) return

    setFeedState('layoutSettling')
    scrollContainerToBottom('auto')

    if (followSettleTimerRef.current !== null) {
      window.clearTimeout(followSettleTimerRef.current)
    }

    followSettleTimerRef.current = window.setTimeout(flushFollowLatest, FOLLOW_LATEST_SETTLE_MS)

    if (followMaxTimerRef.current === null) {
      followMaxTimerRef.current = window.setTimeout(flushFollowLatest, FOLLOW_LATEST_MAX_WAIT_MS)
    }
  }, [containerRef, flushFollowLatest, scrollContainerToBottom, setFeedState])

  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return false

    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 28
    anchoredPositionRef.current = captureMessageScrollAnchor(container)
    if (initialUnreadJumpDoneRef.current) saveMessageScrollAnchor(readerId, surfaceKey, atBottom ? null : anchoredPositionRef.current)
    updateLastObservedMessage()

    if (
      loadingRef.current || cursorLoadingRef.current || !restorationReadyRef.current || !initialUnreadJumpDoneRef.current
    ) {
      return atBottom
    }

    if (initialUnreadReadHoldRef.current && !atBottom) {
      setAutoScroll(false)
      setFeedState('anchoredCatchup')
      return false
    }

    setAutoScroll(atBottom)

    if (atBottom) {
      initialUnreadReadHoldRef.current = false
      setFirstUnreadMessageId(null)
      setFeedState('bottomPinned')
      scheduleMarkObservedRead(true)
    } else {
      setFeedState('userScrolledUp')
      if (markVisibleOnScroll) {
        scheduleMarkObservedRead(false)
      }
    }

    return atBottom
  }, [
    containerRef,
    scheduleMarkObservedRead,
    setAutoScroll,
    setFeedState,
    updateLastObservedMessage,
    markVisibleOnScroll,
    readerId,
    surfaceKey,
  ])

  const captureScrollAnchor = useCallback(() => {
    const container = containerRef.current
    if (container) anchoredPositionRef.current = captureMessageScrollAnchor(container)
    saveMessageScrollAnchor(readerId, surfaceKey, anchoredPositionRef.current)
    return anchoredPositionRef.current
  }, [containerRef, readerId, surfaceKey])
  const restoreScrollAnchor = useCallback(() => {
    const container = containerRef.current
    if (container && !autoScrollRef.current && initialUnreadJumpDoneRef.current) {
      restoreMessageScrollAnchor(container, anchoredPositionRef.current)
    }
  }, [containerRef])

  useLayoutEffect(restoreScrollAnchor, [messages, renderSignal, restoreScrollAnchor])

  const completeTargetAfterSettle = useCallback((
    nextState: UnreadScrollFeedState,
    markAfterSettled: boolean
  ) => {
    clearTargetSettleTimer()
    setFeedState('layoutSettling')
    const timingSurface: ChatTimingSurface = surfaceKey.startsWith('dm:') ? 'dm' : surfaceKey.startsWith('general_chat_thread:') ? 'thread' : surfaceKey.includes('pin') ? 'pins' : 'general'
    const finishRestoreTiming = beginChatTiming('restore', timingSurface)

    const container = containerRef.current
    const settledAnchor = container ? captureMessageScrollAnchor(container) : null
    const settlingScope = scopeGenerationRef.current.version
    targetSettleTimerRef.current = window.setTimeout(() => {
      targetSettleTimerRef.current = null
      if (settlingScope !== scopeGenerationRef.current.version || !enabledRef.current) return
      if (container) restoreMessageScrollAnchor(container, settledAnchor)
      updateLastObservedMessage()
      initialUnreadJumpDoneRef.current = true
      setReadyScope(scopeKey)
      anchoredPositionRef.current = containerRef.current ? captureMessageScrollAnchor(containerRef.current) : null
      initialUnreadTargetIdRef.current = null
      initialUnreadReadHoldRef.current = !markAfterSettled
      setTargetMessageId(null)
      setFeedState(nextState)
      finishRestoreTiming()
      if (markAfterSettled) {
        void markObservedRead(true).catch(() => undefined)
      }
    }, TARGET_SETTLE_MS)
  }, [
    clearTargetSettleTimer,
    markObservedRead,
    setFeedState,
    setTargetMessageId,
    updateLastObservedMessage,
    surfaceKey,
    scopeKey,
    containerRef,
  ])

  useLayoutEffect(() => {
    setReadyScope(null)
    initialUnreadJumpDoneRef.current = false
    initialUnreadTargetIdRef.current = null
    initialUnreadReadHoldRef.current = false
    lastMarkedKeyRef.current = null
    readInFlightKeyRef.current = null
    lastObservedMessageRef.current = null
    setFirstUnreadMessageId(null)
    setLastObservedMessageId(null)
    setLastFlushedMessageId(null)
    setTargetMessageId(null)
    setAutoScroll(true)
    setFeedState('resolvingInitial')
    clearTargetSettleTimer()
    anchoredPositionRef.current = null
  }, [clearTargetSettleTimer, setAutoScroll, setFeedState, setTargetMessageId, scopeKey, initialMessageId])

  useEffect(() => {
    return () => {
      if (markTimerRef.current) {
        window.clearTimeout(markTimerRef.current)
        markTimerRef.current = null
      }
      clearTargetSettleTimer()
      cancelFollowLatest()
    }
  }, [cancelFollowLatest, clearTargetSettleTimer])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return
    const previousOverflowAnchor = container.style.overflowAnchor
    container.style.overflowAnchor = 'none'
    const takeScrollControl = () => {
      clearTargetSettleTimer()
      cancelFollowLatest()
      initialUnreadJumpDoneRef.current = true
      setReadyScope(scopeKey)
      initialUnreadTargetIdRef.current = null
      initialUnreadReadHoldRef.current = false
      setTargetMessageId(null)
      setAutoScroll(false)
      setFeedState('userScrolledUp')
      captureScrollAnchor()
    }
    container.addEventListener('wheel', takeScrollControl, { passive: true })
    container.addEventListener('touchmove', takeScrollControl, { passive: true })
    return () => {
      container.style.overflowAnchor = previousOverflowAnchor
      container.removeEventListener('wheel', takeScrollControl)
      container.removeEventListener('touchmove', takeScrollControl)
    }
  }, [cancelFollowLatest, captureScrollAnchor, clearTargetSettleTimer, containerRef, enabled, scopeKey, setAutoScroll, setFeedState, setTargetMessageId])

  useEffect(() => {
    if (!enabled) return

    const flushReadCursor = () => {
      void markObservedRead(false).catch(() => undefined)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushReadCursor()
      }
    }

    window.addEventListener('pagehide', flushReadCursor)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', flushReadCursor)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, markObservedRead])

  useEffect(() => {
    const container = containerRef.current
    if (
      !enabled ||
      loading ||
      !container ||
      typeof ResizeObserver === 'undefined'
    ) {
      return
    }

    const handleLayout = () => {
      if (!enabledRef.current || document.querySelector('[aria-modal="true"]') && !container.closest('[aria-modal="true"]')) return
      if (autoScrollRef.current) followLatest()
      else restoreScrollAnchor()
    }
    const observer = new ResizeObserver(handleLayout)
    observer.observe(container)
    if (container.firstElementChild instanceof Element) {
      observer.observe(container.firstElementChild)
    }
    container.querySelectorAll('[data-message-id], [data-thread-message-id]').forEach(row => observer.observe(row))

    window.visualViewport?.addEventListener('resize', followLatest)
    window.visualViewport?.addEventListener('scroll', followLatest)
    window.addEventListener('resize', followLatest)
    window.addEventListener('focusin', followLatest)
    window.addEventListener(MOBILE_VIEWPORT_UPDATED_EVENT, followLatest)

    return () => {
      observer.disconnect()
      window.visualViewport?.removeEventListener('resize', followLatest)
      window.visualViewport?.removeEventListener('scroll', followLatest)
      window.removeEventListener('resize', followLatest)
      window.removeEventListener('focusin', followLatest)
      window.removeEventListener(MOBILE_VIEWPORT_UPDATED_EVENT, followLatest)
      cancelFollowLatest()
    }
  }, [cancelFollowLatest, containerRef, enabled, followLatest, latestMessageKey, messageCount, renderSignal, loading, restoreScrollAnchor])

  useEffect(() => {
    const container = containerRef.current
    if (!enabled || !container || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      () => {
        updateLastObservedMessage()
      },
      {
        root: container,
        threshold: [0, 0.45, 1],
      }
    )

    const mountedRows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-message-id]')
    )

    if (mountedRows.length > 0) {
      for (const element of mountedRows) {
        if (container.contains(element)) {
          observer.observe(element)
        }
      }
    } else {
      for (const message of messagesRef.current) {
        const element = document.getElementById(getElementId(getMessageId(message)))
        if (element instanceof HTMLElement && container.contains(element)) {
          observer.observe(element)
        }
      }
    }

    updateLastObservedMessage()
    return () => observer.disconnect()
  }, [
    containerRef,
    enabled,
    firstUnreadMessageId,
    getElementId,
    getMessageId,
    latestMessageKey,
    messageCount,
    renderSignal,
    updateLastObservedMessage,
  ])

  useLayoutEffect(() => {
    if (!enabled) {
      return
    }

    if (loading || cursorLoading || !restorationReady) {
      setFeedState(messages.length > 0 ? 'reconnectReconciling' : 'resolvingInitial')
      if (
        loading &&
        !cursorLoading &&
        restorationReady &&
        !initialMessageId &&
        messages.length > 0 &&
        !initialUnreadJumpDoneRef.current &&
        !targetMessageIdRef.current &&
        !targetSettleTimerRef.current &&
        !findFirstUnreadMessage()
      ) {
        scrollContainerToBottom('auto')
      }
      return
    }

    if (positionTargetId) {
      if (initialUnreadJumpDoneRef.current || targetSettleTimerRef.current !== null) return
      setTargetMessageId(positionTargetId)
      setFeedState('targetingDeepLink')
      const container = containerRef.current
      const target = document.getElementById(getElementId(positionTargetId))
      if (container && target instanceof HTMLElement && container.contains(target) && target.getBoundingClientRect().height > 0) {
        if (savedAnchor && !initialMessageId) restoreMessageScrollAnchor(container, savedAnchor)
        else scrollMessageWithinContainer(container, target, 'center')
        setAutoScroll(false)
        completeTargetAfterSettle('anchoredCatchup', false)
      }
      return
    }

    if (initialUnreadJumpDoneRef.current || targetSettleTimerRef.current !== null) {
      return
    }

    if (messages.length === 0) {
      setFeedState('resolvingInitial')
      return
    }

    const firstUnread = initialUnreadTargetIdRef.current
      ? messages.find(message => getMessageId(message) === initialUnreadTargetIdRef.current) ?? null
      : findFirstUnreadMessage()

    if (!firstUnread) {
      initialUnreadJumpDoneRef.current = true
      setTargetMessageId(null)
      scrollToBottom('auto')
      return
    }

    const firstUnreadId = getMessageId(firstUnread)
    if (!initialUnreadTargetIdRef.current) {
      initialUnreadTargetIdRef.current = firstUnreadId
      setFirstUnreadMessageId(firstUnreadId)
      setTargetMessageId(firstUnreadId)
      setAutoScroll(false)
      onBeforeInitialJump?.(firstUnread)
    }

    setFeedState('targetingFirstUnread')

    let frameId: number | null = null
    let attemptCount = 0
    let cancelled = false

    const attemptInitialUnreadScroll = () => {
      if (cancelled || initialUnreadJumpDoneRef.current || targetSettleTimerRef.current !== null) {
        return
      }

      const container = containerRef.current
      const firstUnreadEl = document.getElementById(getElementId(firstUnreadId))

      if (!container || !(firstUnreadEl instanceof HTMLElement) || !container.contains(firstUnreadEl)) {
        if (attemptCount < INITIAL_TARGET_MAX_RAF_ATTEMPTS) {
          attemptCount += 1
          frameId = requestAnimationFrame(attemptInitialUnreadScroll)
        }
        return
      }

      scrollMessageWithinContainer(container, firstUnreadEl, 'start')
      setAutoScroll(false)
      completeTargetAfterSettle('anchoredCatchup', markInitialVisibleRead)
    }

    frameId = requestAnimationFrame(attemptInitialUnreadScroll)
    return () => {
      cancelled = true
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
    }
  }, [
    completeTargetAfterSettle,
    containerRef,
    cursorLoading,
    enabled,
    findFirstUnreadMessage,
    getElementId,
    getMessageId,
    initialMessageId,
    positionTargetId,
    savedAnchor,
    loading,
    restorationReady,
    messages,
    markInitialVisibleRead,
    onBeforeInitialJump,
    scrollContainerToBottom,
    renderSignal,
    scrollToBottom,
    setAutoScroll,
    setFeedState,
    setTargetMessageId,
  ])

  useLayoutEffect(() => {
    if (
      !enabled ||
      loading ||
      cursorLoading ||
      !initialUnreadJumpDoneRef.current ||
      messageCount === 0
    ) {
      return
    }

    updateLastObservedMessage()

    if (targetMessageIdRef.current || initialUnreadTargetIdRef.current) {
      setFeedState(targetSettleTimerRef.current === null ? 'anchoredCatchup' : 'layoutSettling')
      return
    }

    if (autoScroll && !initialUnreadReadHoldRef.current) {
      setFeedState('newerAppend')
      scrollToBottom('auto')
      return
    }

    if (!firstUnreadMessageId) {
      const firstUnread = findFirstUnreadMessage()
      if (firstUnread) {
        setFirstUnreadMessageId(getMessageId(firstUnread))
      }
    }
  }, [
    autoScroll,
    cursorLoading,
    enabled,
    findFirstUnreadMessage,
    firstUnreadMessageId,
    getMessageId,
    latestMessageKey,
    loading,
    messageCount,
    scrollToBottom,
    setFeedState,
    updateLastObservedMessage,
  ])

  return {
    initialPositionReady: readyScope === scopeKey && restorationReady && !cursorLoading,
    autoScroll,
    firstUnreadMessageId,
    feedState,
    targetMessageId,
    lastObservedMessageId,
    lastFlushedMessageId,
    setAutoScroll,
    setFirstUnreadMessageId,
    handleUnreadScroll: handleScroll,
    scrollToBottom,
    markLatestRead: markObservedRead,
    captureScrollAnchor,
    restoreScrollAnchor,
  }
}
