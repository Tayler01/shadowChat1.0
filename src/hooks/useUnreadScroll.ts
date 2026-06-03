import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { compareMessageKey, isMessageAfterCursor, type UserReadCursor } from '../lib/readCursors'

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
  enabled?: boolean
  surfaceKey: string
  initialMessageId?: string | null
  renderSignal?: unknown
  getMessageId: (message: TMessage) => string
  getMessageCreatedAt: (message: TMessage) => string
  getElementId: (messageId: string) => string
  getUnreadMessages?: (messages: TMessage[]) => TMessage[]
  onBeforeInitialJump?: (message: TMessage) => void
  onMarkReadToLatest: (message: TMessage) => Promise<void> | void
}

type ObservedMessage<TMessage> = {
  id: string
  createdAt: string
  key: string
  message: TMessage
}

const getReadableVisiblePixels = (elementRect: DOMRect, containerRect: DOMRect) => {
  const visibleTop = Math.max(elementRect.top, containerRect.top)
  const visibleBottom = Math.min(elementRect.bottom, containerRect.bottom)
  return Math.max(0, visibleBottom - visibleTop)
}

export function useUnreadScroll<TMessage>({
  containerRef,
  messages,
  loading = false,
  cursor,
  cursorLoading = false,
  enabled = true,
  surfaceKey,
  initialMessageId,
  renderSignal,
  getMessageId,
  getMessageCreatedAt,
  getElementId,
  getUnreadMessages,
  onBeforeInitialJump,
  onMarkReadToLatest,
}: UseUnreadScrollOptions<TMessage>) {
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
  messagesRef.current = messages
  cursorRef.current = cursor
  loadingRef.current = loading
  cursorLoadingRef.current = cursorLoading
  onMarkReadRef.current = onMarkReadToLatest
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

  const isCursorAnchorPending = useCallback(() => {
    if (!cursor?.last_read_message_id || messages.length === 0) {
      return false
    }

    if (messages.some(message => getMessageId(message) === cursor.last_read_message_id)) {
      return false
    }

    const oldestMessage = messages[0]
    const latestMessageInWindow = messages[messages.length - 1]
    if (!oldestMessage || !latestMessageInWindow) {
      return false
    }

    const cursorKey = {
      created_at: cursor.last_read_at,
      id: cursor.last_read_message_id,
    }
    const oldestKey = {
      created_at: getMessageCreatedAt(oldestMessage),
      id: getMessageId(oldestMessage),
    }
    const latestKey = {
      created_at: getMessageCreatedAt(latestMessageInWindow),
      id: getMessageId(latestMessageInWindow),
    }

    if (compareMessageKey(cursorKey, oldestKey) < 0) {
      return false
    }

    return compareMessageKey(cursorKey, latestKey) > 0
  }, [cursor, getMessageCreatedAt, getMessageId, messages])

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
    const explicitUnread = getUnreadMessages?.(messages)
    if (explicitUnread?.length) {
      return explicitUnread[0] ?? null
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
      if (isCursorAnchorPending()) {
        return null
      }
    }

    return messages.find(message => isMessageAfterCursor({
      created_at: getMessageCreatedAt(message),
      id: getMessageId(message),
    }, cursor)) ?? null
  }, [cursor, getMessageCreatedAt, getMessageId, getUnreadMessages, isCursorAnchorPending, messages])

  const getObservedMessage = useCallback((message: TMessage): ObservedMessage<TMessage> => {
    const id = getMessageId(message)
    const createdAt = getMessageCreatedAt(message)
    return {
      id,
      createdAt,
      key: `${surfaceKey}:${id}:${createdAt}`,
      message,
    }
  }, [getMessageCreatedAt, getMessageId, surfaceKey])

  const updateLastObservedMessage = useCallback(() => {
    const container = containerRef.current
    if (!enabled || !container) return lastObservedMessageRef.current

    const containerRect = container.getBoundingClientRect()
    let candidate: ObservedMessage<TMessage> | null = null

    const mountedRows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-message-id]')
    )

    if (mountedRows.length > 0) {
      for (const element of mountedRows) {
        const id = element.dataset.messageId
        const message = id ? messagesById.get(id) : null
        if (!message || !container.contains(element)) {
          continue
        }

        const rect = element.getBoundingClientRect()
        if (rect.height <= 0 || rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) {
          continue
        }

        const visiblePixels = getReadableVisiblePixels(rect, containerRect)
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
        if (rect.height <= 0 || rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) {
          continue
        }

        const visiblePixels = getReadableVisiblePixels(rect, containerRect)
        const readableThreshold = Math.min(48, Math.max(12, rect.height * 0.45))
        if (visiblePixels >= readableThreshold) {
          candidate = getObservedMessage(message)
        }
      }
    }

    if (candidate && lastObservedMessageRef.current?.key !== candidate.key) {
      lastObservedMessageRef.current = candidate
      setLastObservedMessageId(candidate.id)
    }

    return candidate ?? lastObservedMessageRef.current
  }, [containerRef, enabled, getElementId, getMessageId, getObservedMessage, messagesById])

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
    if (!enabled || !candidate || !isCandidateBeyondCursor(candidate)) return
    if (!initialMessageId && !initialUnreadJumpDoneRef.current) return
    if (initialUnreadReadHoldRef.current && !clearDivider) return

    const markKey = candidate.key
    if (lastMarkedKeyRef.current === markKey || readInFlightKeyRef.current === markKey) {
      return
    }

    readInFlightKeyRef.current = markKey
    try {
      await onMarkReadRef.current(candidate.message)
      lastMarkedKeyRef.current = markKey
      setLastFlushedMessageId(candidate.id)
      if (clearDivider) {
        setFirstUnreadMessageId(null)
      }
    } finally {
      if (readInFlightKeyRef.current === markKey) {
        readInFlightKeyRef.current = null
      }
      if (autoScrollRef.current && feedStateRef.current !== 'targetingFirstUnread') {
        setFeedState('bottomPinned')
      }
    }
  }, [enabled, initialMessageId, isCandidateBeyondCursor, setFeedState])

  const markObservedRead = useCallback(async (
    clearDivider = false,
    options: { refreshCandidate?: boolean } = {}
  ) => {
    const candidate = options.refreshCandidate
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
      void markObservedRead(clearDivider, { refreshCandidate: true })
    }, READ_SETTLE_MS)
  }, [markObservedRead])

  const scrollContainerToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current
    if (!container) return

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
    initialUnreadReadHoldRef.current = false
    scrollContainerToBottom(behavior)
    setAutoScroll(true)
    setFirstUnreadMessageId(null)
    setTargetMessageId(null)
    setFeedState('layoutSettling')
    scheduleMarkObservedRead(true)
  }, [scheduleMarkObservedRead, scrollContainerToBottom, setAutoScroll, setFeedState, setTargetMessageId])

  const flushFollowLatest = useCallback(() => {
    cancelFollowLatest()
    if (autoScrollRef.current) {
      scrollToBottom('auto')
    }
  }, [cancelFollowLatest, scrollToBottom])

  const followLatest = useCallback(() => {
    if (!autoScrollRef.current) return
    if (!initialMessageId && !initialUnreadJumpDoneRef.current) return
    if (initialUnreadReadHoldRef.current) return

    setFeedState('layoutSettling')

    if (followSettleTimerRef.current !== null) {
      window.clearTimeout(followSettleTimerRef.current)
    }

    followSettleTimerRef.current = window.setTimeout(flushFollowLatest, FOLLOW_LATEST_SETTLE_MS)

    if (followMaxTimerRef.current === null) {
      followMaxTimerRef.current = window.setTimeout(flushFollowLatest, FOLLOW_LATEST_MAX_WAIT_MS)
    }
  }, [flushFollowLatest, initialMessageId, setFeedState])

  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return false

    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 28
    updateLastObservedMessage()

    if (
      !initialMessageId &&
      !initialUnreadJumpDoneRef.current &&
      (loadingRef.current || cursorLoadingRef.current || targetSettleTimerRef.current !== null)
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
    }

    return atBottom
  }, [
    containerRef,
    initialMessageId,
    scheduleMarkObservedRead,
    setAutoScroll,
    setFeedState,
    updateLastObservedMessage,
  ])

  const completeTargetAfterSettle = useCallback((
    nextState: UnreadScrollFeedState,
    markAfterSettled: boolean
  ) => {
    clearTargetSettleTimer()
    setFeedState('layoutSettling')

    targetSettleTimerRef.current = window.setTimeout(() => {
      targetSettleTimerRef.current = null
      updateLastObservedMessage()
      initialUnreadJumpDoneRef.current = true
      initialUnreadTargetIdRef.current = null
      initialUnreadReadHoldRef.current = !markAfterSettled
      setTargetMessageId(null)
      setFeedState(nextState)
      if (markAfterSettled) {
        void markObservedRead(true)
      }
    }, TARGET_SETTLE_MS)
  }, [
    clearTargetSettleTimer,
    markObservedRead,
    setFeedState,
    setTargetMessageId,
    updateLastObservedMessage,
  ])

  useEffect(() => {
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
  }, [clearTargetSettleTimer, setAutoScroll, setFeedState, setTargetMessageId, surfaceKey])

  useEffect(() => {
    return () => {
      if (markTimerRef.current) {
        window.clearTimeout(markTimerRef.current)
        markTimerRef.current = null
      }
      clearTargetSettleTimer()
      cancelFollowLatest()
      void markObservedRead(false)
    }
  }, [cancelFollowLatest, clearTargetSettleTimer, markObservedRead])

  useEffect(() => {
    if (!enabled) return

    const flushReadCursor = () => {
      void markObservedRead(false)
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

    const observer = new ResizeObserver(followLatest)
    observer.observe(container)
    if (container.firstElementChild instanceof Element) {
      observer.observe(container.firstElementChild)
    }

    window.visualViewport?.addEventListener('resize', followLatest)
    window.visualViewport?.addEventListener('scroll', followLatest)
    window.addEventListener('resize', followLatest)
    window.addEventListener('focusin', followLatest)

    return () => {
      observer.disconnect()
      window.visualViewport?.removeEventListener('resize', followLatest)
      window.visualViewport?.removeEventListener('scroll', followLatest)
      window.removeEventListener('resize', followLatest)
      window.removeEventListener('focusin', followLatest)
      cancelFollowLatest()
    }
  }, [cancelFollowLatest, containerRef, enabled, followLatest, latestMessageKey, loading])

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

    if (loading || cursorLoading) {
      setFeedState(messages.length > 0 ? 'reconnectReconciling' : 'resolvingInitial')
      return
    }

    if (initialMessageId) {
      setTargetMessageId(initialMessageId)
      setFeedState('targetingDeepLink')
      return
    }

    if (initialUnreadJumpDoneRef.current || targetSettleTimerRef.current !== null) {
      return
    }

    if (messages.length === 0) {
      setFeedState('resolvingInitial')
      return
    }

    if (isCursorAnchorPending()) {
      setFeedState('reconnectReconciling')
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

      firstUnreadEl.scrollIntoView({ block: 'start', behavior: 'auto' })
      setAutoScroll(false)
      completeTargetAfterSettle('anchoredCatchup', false)
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
    isCursorAnchorPending,
    loading,
    messages,
    onBeforeInitialJump,
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
  }
}
