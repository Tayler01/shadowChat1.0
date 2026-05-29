import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { UserReadCursor } from '../lib/readCursors'

const READ_SETTLE_MS = 220
const SHORT_UNREAD_VIEWPORT_RATIO = 0.72

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
  const followFrameRef = useRef<number | null>(null)
  const followSettleFrameRef = useRef<number | null>(null)
  const followTimerRef = useRef<number | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const messageCount = messages.length
  const latestMessage = messages[messageCount - 1]
  const latestMessageKey = latestMessage
    ? `${surfaceKey}:${getMessageId(latestMessage)}:${getMessageCreatedAt(latestMessage)}`
    : `${surfaceKey}:empty`

  const setAutoScroll = useCallback((value: boolean) => {
    if (autoScrollRef.current === value) {
      return
    }

    autoScrollRef.current = value
    setAutoScrollState(value)
  }, [])

  const cancelFollowLatest = useCallback(() => {
    if (followFrameRef.current !== null) {
      cancelAnimationFrame(followFrameRef.current)
      followFrameRef.current = null
    }

    if (followSettleFrameRef.current !== null) {
      cancelAnimationFrame(followSettleFrameRef.current)
      followSettleFrameRef.current = null
    }

    if (followTimerRef.current !== null) {
      window.clearTimeout(followTimerRef.current)
      followTimerRef.current = null
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
    }

    return messages.find(message => isAfterCursor(message, cursor, getMessageCreatedAt)) ?? null
  }, [cursor, getMessageCreatedAt, getMessageId, getUnreadMessages, messages])

  const markLatestRead = useCallback(async (clearDivider = false) => {
    const currentMessages = messagesRef.current
    if (!enabled || currentMessages.length === 0) return

    const currentLatestMessage = currentMessages[currentMessages.length - 1]
    if (!currentLatestMessage) return

    const latestId = getMessageId(currentLatestMessage)
    const latestCreatedAt = getMessageCreatedAt(currentLatestMessage)
    const markKey = `${surfaceKey}:${latestId}:${latestCreatedAt}`
    if (lastMarkedKeyRef.current === markKey || readInFlightKeyRef.current === markKey) {
      return
    }

    readInFlightKeyRef.current = markKey
    try {
      await onMarkReadToLatest(currentLatestMessage)
      lastMarkedKeyRef.current = markKey
      if (clearDivider) {
        setFirstUnreadMessageId(null)
      }
    } finally {
      if (readInFlightKeyRef.current === markKey) {
        readInFlightKeyRef.current = null
      }
    }
  }, [enabled, getMessageCreatedAt, getMessageId, onMarkReadToLatest, surfaceKey])

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

  const followLatest = useCallback(() => {
    if (!autoScrollRef.current) return

    cancelFollowLatest()

    followFrameRef.current = requestAnimationFrame(() => {
      followFrameRef.current = null
      if (!autoScrollRef.current) return

      scrollToBottom('auto')

      followSettleFrameRef.current = requestAnimationFrame(() => {
        followSettleFrameRef.current = null
        if (autoScrollRef.current) {
          scrollToBottom('auto')
        }
      })

      followTimerRef.current = window.setTimeout(() => {
        followTimerRef.current = null
        if (autoScrollRef.current) {
          scrollToBottom('auto')
        }
      }, 140)
    })
  }, [cancelFollowLatest, scrollToBottom])

  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return false

    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 28
    setAutoScroll(atBottom)

    if (atBottom) {
      setFirstUnreadMessageId(null)
      scheduleMarkLatestRead(true)
    }

    return atBottom
  }, [containerRef, scheduleMarkLatestRead, setAutoScroll])

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
        markTimerRef.current = null
      }
      if (autoScrollRef.current) {
        void markLatestRead(false)
      }
      cancelFollowLatest()
    }
  }, [cancelFollowLatest, markLatestRead])

  useEffect(() => {
    if (!enabled) return

    const flushReadCursor = () => {
      if (autoScrollRef.current) {
        void markLatestRead(false)
      }
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
  }, [enabled, markLatestRead])

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

    followLatest()
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
      scrollToBottom('auto')
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
      messageCount === 0
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
    latestMessageKey,
    loading,
    messageCount,
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
