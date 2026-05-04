import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { UserReadCursor } from '../lib/readCursors'

const READ_SETTLE_MS = 220
const SHORT_UNREAD_VIEWPORT_RATIO = 0.72
const getTimestamp = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
)

interface UseUnreadScrollOptions<TMessage> {
  containerRef: RefObject<HTMLElement>
  messages: TMessage[]
  loading?: boolean
  cursor: UserReadCursor | null
  cursorLoading?: boolean
  enabled?: boolean
  surfaceKey: string
  initialMessageId?: string | null
  getMessageId: (message: TMessage) => string
  getMessageCreatedAt: (message: TMessage) => string
  getElementId: (messageId: string) => string
  getUnreadMessages?: (messages: TMessage[]) => TMessage[]
  onBeforeInitialJump?: (message: TMessage) => void
  onMarkReadToLatest: (message: TMessage) => Promise<void> | void
}

const isAfterCursor = <TMessage,>(
  message: TMessage,
  cursor: UserReadCursor | null,
  getMessageCreatedAt: (message: TMessage) => string
) => {
  if (!cursor?.last_read_at) return false

  const cursorTime = Date.parse(cursor.last_read_at)
  const messageTime = Date.parse(getMessageCreatedAt(message))
  if (!Number.isFinite(cursorTime) || !Number.isFinite(messageTime)) {
    return false
  }

  return messageTime > cursorTime
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
  getMessageId,
  getMessageCreatedAt,
  getElementId,
  getUnreadMessages,
  onBeforeInitialJump,
  onMarkReadToLatest,
}: UseUnreadScrollOptions<TMessage>) {
  const [autoScroll, setAutoScrollState] = useState(true)
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null)
  const autoScrollRef = useRef(true)
  const initialUnreadJumpDoneRef = useRef(false)
  const lastMarkedKeyRef = useRef<string | null>(null)
  const readInFlightKeyRef = useRef<string | null>(null)
  const markTimerRef = useRef<number | null>(null)
  const viewportAdjustingUntilRef = useRef(0)
  const viewportFrameRef = useRef<number | null>(null)
  const viewportTimerRefs = useRef<number[]>([])

  const setAutoScroll = useCallback((value: boolean) => {
    autoScrollRef.current = value
    setAutoScrollState(value)
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
    }

    return messages.find(message => isAfterCursor(message, cursor, getMessageCreatedAt)) ?? null
  }, [cursor, getMessageCreatedAt, getMessageId, getUnreadMessages, messages])

  const markLatestRead = useCallback(async (clearDivider = false) => {
    if (!enabled || messages.length === 0) return

    const latestMessage = messages[messages.length - 1]
    if (!latestMessage) return

    const latestId = getMessageId(latestMessage)
    const latestCreatedAt = getMessageCreatedAt(latestMessage)
    const markKey = `${surfaceKey}:${latestId}:${latestCreatedAt}`
    if (lastMarkedKeyRef.current === markKey || readInFlightKeyRef.current === markKey) {
      return
    }

    readInFlightKeyRef.current = markKey
    try {
      await onMarkReadToLatest(latestMessage)
      lastMarkedKeyRef.current = markKey
      if (clearDivider) {
        setFirstUnreadMessageId(null)
      }
    } finally {
      if (readInFlightKeyRef.current === markKey) {
        readInFlightKeyRef.current = null
      }
    }
  }, [enabled, getMessageCreatedAt, getMessageId, messages, onMarkReadToLatest, surfaceKey])

  const scheduleMarkLatestRead = useCallback((clearDivider = false) => {
    if (markTimerRef.current) {
      window.clearTimeout(markTimerRef.current)
    }

    markTimerRef.current = window.setTimeout(() => {
      markTimerRef.current = null
      void markLatestRead(clearDivider)
    }, READ_SETTLE_MS)
  }, [markLatestRead])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current
    if (!container) return

    const top = Math.max(container.scrollHeight - container.clientHeight, 0)
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top, behavior })
    } else {
      container.scrollTop = top
    }
    setAutoScroll(true)
    setFirstUnreadMessageId(null)
    scheduleMarkLatestRead(true)
  }, [containerRef, scheduleMarkLatestRead, setAutoScroll])

  const scheduleViewportBottomLock = useCallback(() => {
    if (!enabled || loading || !autoScrollRef.current) return

    viewportAdjustingUntilRef.current = getTimestamp() + 700

    if (viewportFrameRef.current !== null) {
      cancelAnimationFrame(viewportFrameRef.current)
    }
    viewportTimerRefs.current.forEach(timerId => window.clearTimeout(timerId))
    viewportTimerRefs.current = []

    const keepPinned = () => {
      if (autoScrollRef.current) {
        scrollToBottom('auto')
      }
    }

    viewportFrameRef.current = requestAnimationFrame(() => {
      viewportFrameRef.current = null
      keepPinned()
      viewportTimerRefs.current = [90, 220, 420].map(delay =>
        window.setTimeout(keepPinned, delay)
      )
    })
  }, [enabled, loading, scrollToBottom])

  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return false

    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 28

    if (!atBottom && autoScrollRef.current && viewportAdjustingUntilRef.current > getTimestamp()) {
      scrollToBottom('auto')
      return true
    }

    setAutoScroll(atBottom)

    if (atBottom) {
      setFirstUnreadMessageId(null)
      scheduleMarkLatestRead(true)
    }

    return atBottom
  }, [containerRef, scheduleMarkLatestRead, scrollToBottom, setAutoScroll])

  useEffect(() => {
    initialUnreadJumpDoneRef.current = false
    lastMarkedKeyRef.current = null
    readInFlightKeyRef.current = null
    setFirstUnreadMessageId(null)
    setAutoScroll(true)
  }, [setAutoScroll, surfaceKey])

  useLayoutEffect(() => {
    return () => {
      if (markTimerRef.current) {
        window.clearTimeout(markTimerRef.current)
      }
      if (viewportFrameRef.current !== null) {
        cancelAnimationFrame(viewportFrameRef.current)
      }
      viewportTimerRefs.current.forEach(timerId => window.clearTimeout(timerId))
      viewportTimerRefs.current = []
    }
  }, [])

  useEffect(() => {
    if (!enabled || loading) return

    window.visualViewport?.addEventListener('resize', scheduleViewportBottomLock)
    window.visualViewport?.addEventListener('scroll', scheduleViewportBottomLock)
    window.addEventListener('resize', scheduleViewportBottomLock)
    window.addEventListener('focusin', scheduleViewportBottomLock)

    return () => {
      window.visualViewport?.removeEventListener('resize', scheduleViewportBottomLock)
      window.visualViewport?.removeEventListener('scroll', scheduleViewportBottomLock)
      window.removeEventListener('resize', scheduleViewportBottomLock)
      window.removeEventListener('focusin', scheduleViewportBottomLock)
      if (viewportFrameRef.current !== null) {
        cancelAnimationFrame(viewportFrameRef.current)
        viewportFrameRef.current = null
      }
      viewportTimerRefs.current.forEach(timerId => window.clearTimeout(timerId))
      viewportTimerRefs.current = []
    }
  }, [enabled, loading, scheduleViewportBottomLock])

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

    let frameId: number | null = null
    const followLatest = () => {
      if (!autoScrollRef.current) return

      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }

      frameId = requestAnimationFrame(() => {
        frameId = null
        if (autoScrollRef.current) {
          scrollToBottom('auto')
        }
      })
    }

    const observer = new ResizeObserver(followLatest)
    observer.observe(container)
    if (container.firstElementChild instanceof Element) {
      observer.observe(container.firstElementChild)
    }

    return () => {
      observer.disconnect()
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
    }
  }, [containerRef, enabled, loading, messages.length, scrollToBottom])

  useLayoutEffect(() => {
    if (
      !enabled ||
      loading ||
      cursorLoading ||
      initialMessageId ||
      initialUnreadJumpDoneRef.current ||
      messages.length === 0
    ) {
      return
    }

    initialUnreadJumpDoneRef.current = true
    const firstUnread = findFirstUnreadMessage()

    if (!firstUnread) {
      requestAnimationFrame(() => {
        scrollToBottom('auto')
      })
      return
    }

    const firstUnreadId = getMessageId(firstUnread)
    setFirstUnreadMessageId(firstUnreadId)
    setAutoScroll(false)
    onBeforeInitialJump?.(firstUnread)

    requestAnimationFrame(() => {
      const container = containerRef.current
      const firstUnreadEl = document.getElementById(getElementId(firstUnreadId))
      const latestMessage = messages[messages.length - 1]
      const latestEl = latestMessage
        ? document.getElementById(getElementId(getMessageId(latestMessage)))
        : null

      if (!container || !firstUnreadEl) {
        scheduleMarkLatestRead(false)
        return
      }

      const firstRect = firstUnreadEl.getBoundingClientRect()
      const latestRect = latestEl?.getBoundingClientRect()
      const unreadHeight = latestRect
        ? Math.max(0, latestRect.bottom - firstRect.top)
        : Number.POSITIVE_INFINITY

      if (unreadHeight <= container.clientHeight * SHORT_UNREAD_VIEWPORT_RATIO) {
        scrollToBottom('auto')
        return
      }

      firstUnreadEl.scrollIntoView({ block: 'start', behavior: 'auto' })
      scheduleMarkLatestRead(false)
    })
  }, [
    containerRef,
    cursorLoading,
    enabled,
    findFirstUnreadMessage,
    getElementId,
    getMessageId,
    initialMessageId,
    loading,
    messages,
    onBeforeInitialJump,
    scheduleMarkLatestRead,
    scrollToBottom,
    setAutoScroll,
  ])

  useLayoutEffect(() => {
    if (
      !enabled ||
      loading ||
      cursorLoading ||
      !initialUnreadJumpDoneRef.current ||
      messages.length === 0
    ) {
      return
    }

    if (autoScroll) {
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
    loading,
    messages,
    scrollToBottom,
  ])

  return {
    autoScroll,
    firstUnreadMessageId,
    setAutoScroll,
    setFirstUnreadMessageId,
    handleUnreadScroll: handleScroll,
    scrollToBottom,
    markLatestRead,
  }
}
