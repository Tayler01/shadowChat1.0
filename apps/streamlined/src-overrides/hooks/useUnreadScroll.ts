import { beginChatTiming, type ChatTimingSurface } from '../../../../src/lib/chatPerformance'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { MOBILE_VIEWPORT_UPDATED_EVENT } from '../../../../src/lib/mobileViewport'
import { isMessageAfterCursor, type UserReadCursor } from '../../../../src/lib/readCursors'
import { captureMessageScrollAnchor, restoreMessageScrollAnchor, saveMessageScrollAnchor, getSavedMessageScrollAnchor, getMessageReadableViewport, scrollMessageWithinContainer, type MessageScrollAnchor } from '../../../../src/lib/messageScrollAnchor'

const READ_SETTLE_MS = 220
const TARGET_SETTLE_MS = 180
const FOLLOW_LATEST_SETTLE_MS = 150
const FOLLOW_LATEST_MAX_WAIT_MS = 800
const INITIAL_TARGET_MAX_RAF_ATTEMPTS = 5
const USER_SCROLL_SETTLE_MS = 180

const isElasticScroll = (container: HTMLElement) => {
  const max = Math.max(0, container.scrollHeight - container.clientHeight)
  return container.scrollTop < 0 || container.scrollTop > max + 1
}

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
  onFollowingChange?: (following: boolean) => void
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
  onFollowingChange,
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
  const onFollowingChangeRef = useRef(onFollowingChange)
  onFollowingChangeRef.current = onFollowingChange
  const cursorRef = useRef(cursor)
  const messagesRef = useRef(messages)
  const loadingRef = useRef(loading)
  const cursorLoadingRef = useRef(cursorLoading)
  const restorationReadyRef = useRef(restorationReady)
  const anchoredPositionRef = useRef<MessageScrollAnchor | null>(null)
  // Native scrolling owns the viewport from contact through momentum. A scroll
  // event inside the bottom tolerance must not give ownership back mid-swipe.
  const userScrollRef = useRef({ active: false, touching: false, moved: false, wasFollowing: false, top: 0, x: 0, y: 0, direction: 0 })
  const userScrollSettleTimerRef = useRef<number | null>(null)
  const scrollGeometryRef = useRef({ height: 0, viewport: 0 })
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
    if (value) userScrollRef.current.active = false
    // Realtime retention must see takeover in the same native event, before a
    // React effect or an incoming insert can evict the reader's visible rows.
    onFollowingChangeRef.current?.(value)
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
    if (!container || !enabledRef.current || isElasticScroll(container) || document.querySelector('[aria-modal="true"]') && !container.closest('[aria-modal="true"]')) return

    const top = Math.max(container.scrollHeight - container.clientHeight, 0)
    scrollGeometryRef.current = { height: container.scrollHeight, viewport: container.clientHeight }
    if (Math.abs(container.scrollTop - top) > 1) {
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top, behavior })
      } else {
        container.scrollTop = top
      }
    }
  }, [containerRef])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    userScrollRef.current.active = false
    userScrollRef.current.touching = false
    clearTargetSettleTimer()
    initialUnreadJumpDoneRef.current = true
    setReadyScope(scopeKey)
    initialUnreadReadHoldRef.current = false
    scrollContainerToBottom(behavior)
    setAutoScroll(true)
    saveMessageScrollAnchor(readerId, surfaceKey, null)
    setFirstUnreadMessageId(null)
    setTargetMessageId(null)
    setFeedState('layoutSettling')
    scheduleMarkObservedRead(true)
  }, [clearTargetSettleTimer, readerId, scopeKey, surfaceKey, scheduleMarkObservedRead, scrollContainerToBottom, setAutoScroll, setFeedState, setTargetMessageId])

  const flushFollowLatest = useCallback(() => {
    cancelFollowLatest()
    const container = containerRef.current
    if (container && autoScrollRef.current && !userScrollRef.current.active && !userScrollRef.current.touching && !isElasticScroll(container)) {
      scrollToBottom('auto')
    }
  }, [cancelFollowLatest, containerRef, scrollToBottom])

  const followLatest = useCallback(() => {
    const container = containerRef.current
    if (!container || !enabledRef.current || userScrollRef.current.active || userScrollRef.current.touching || isElasticScroll(container) || document.querySelector('[aria-modal="true"]') && !container.closest('[aria-modal="true"]') || !autoScrollRef.current) return
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

  const settleUserScroll = useCallback(() => {
    if (userScrollSettleTimerRef.current !== null) window.clearTimeout(userScrollSettleTimerRef.current)
    const settle = () => {
      userScrollSettleTimerRef.current = null
      if (userScrollRef.current.touching) return
      const container = containerRef.current
      // WebKit exposes elastic positions outside the scrollable range. Leave
      // rebound to the browser; correcting that range fights its animation.
      if (container && isElasticScroll(container)) {
        userScrollSettleTimerRef.current = window.setTimeout(settle, USER_SCROLL_SETTLE_MS)
        return
      }
      userScrollRef.current.active = false
      if (container) {
        if (container.scrollHeight - container.scrollTop - container.clientHeight <= 1 && (userScrollRef.current.wasFollowing || userScrollRef.current.direction > 0)) {
          setAutoScroll(true)
          setFeedState('bottomPinned')
          scheduleMarkObservedRead(true)
        }
        anchoredPositionRef.current = captureMessageScrollAnchor(container)
        if (!autoScrollRef.current) saveMessageScrollAnchor(readerId, surfaceKey, anchoredPositionRef.current)
      }
    }
    userScrollSettleTimerRef.current = window.setTimeout(settle, USER_SCROLL_SETTLE_MS)
  }, [containerRef, readerId, scheduleMarkObservedRead, setAutoScroll, setFeedState, surfaceKey])

  const scrollToBottomIfFollowing = useCallback(() => {
    if (autoScrollRef.current && !userScrollRef.current.active) followLatest()
  }, [followLatest])

  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return false

    const bottomGap = container.scrollHeight - container.scrollTop - container.clientHeight
    const userScroll = userScrollRef.current
    const previousGeometry = scrollGeometryRef.current
    const layoutChanged = previousGeometry.height !== container.scrollHeight || previousGeometry.viewport !== container.clientHeight
    scrollGeometryRef.current = { height: container.scrollHeight, viewport: container.clientHeight }
    const scrollTop = Math.max(0, Math.min(container.scrollTop, container.scrollHeight - container.clientHeight))
    const scrollDelta = scrollTop - userScroll.top
    userScroll.top = scrollTop
    if (userScroll.active) {
      if (Math.abs(scrollDelta) > 0.5) userScroll.moved = true
      settleUserScroll()
    }
    // Keep the generous tolerance while following, but require an actual return
    // to the bottom after the user takes over. The first few swipe pixels count.
    const atBottom = !isElasticScroll(container) && !userScroll.touching && (autoScrollRef.current ? bottomGap <= 28 : bottomGap <= 1 && (!userScroll.active || scrollDelta > 0))
    // Sending, clearing the composer and keyboard layout can emit a native
    // scroll before ResizeObserver. A temporary gap is not a gesture away from
    // latest. Keep follow intent until layout settles; actual contact/wheel/key
    // ownership still cancels it before this path, including elastic rebound.
    if (!atBottom && previousGeometry.viewport > 0 && autoScrollRef.current && !userScroll.active && !userScroll.touching &&
      (layoutChanged || followSettleTimerRef.current !== null || followMaxTimerRef.current !== null)) {
      followLatest()
      return false
    }
    anchoredPositionRef.current = captureMessageScrollAnchor(container)
    if (initialUnreadJumpDoneRef.current) saveMessageScrollAnchor(readerId, surfaceKey, atBottom || bottomGap <= 1 ? null : anchoredPositionRef.current)
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
    settleUserScroll,
    followLatest,
  ])

  const captureScrollAnchor = useCallback(() => {
    const container = containerRef.current
    if (container) anchoredPositionRef.current = captureMessageScrollAnchor(container)
    saveMessageScrollAnchor(readerId, surfaceKey, anchoredPositionRef.current)
    return anchoredPositionRef.current
  }, [containerRef, readerId, surfaceKey])
  const restoreScrollAnchor = useCallback(() => {
    const container = containerRef.current
    if (container && !isElasticScroll(container) && !autoScrollRef.current && !userScrollRef.current.active && initialUnreadJumpDoneRef.current) {
      restoreMessageScrollAnchor(container, anchoredPositionRef.current)
    }
  }, [containerRef])

  useLayoutEffect(restoreScrollAnchor, [messages, renderSignal, restoreScrollAnchor])

  useLayoutEffect(() => {
    const container = containerRef.current
    return () => {
      if (!container || !initialUnreadJumpDoneRef.current) return
      const visible = container.isConnected && container.getBoundingClientRect().height > 0
      const anchor = visible ? captureMessageScrollAnchor(container) ?? anchoredPositionRef.current : anchoredPositionRef.current
      saveMessageScrollAnchor(readerId, surfaceKey, autoScrollRef.current ? null : anchor)
    }
  }, [containerRef, readerId, renderSignal, surfaceKey])

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
    userScrollRef.current.active = false
    userScrollRef.current.touching = false
    if (userScrollSettleTimerRef.current !== null) window.clearTimeout(userScrollSettleTimerRef.current)
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
    scrollGeometryRef.current = { height: 0, viewport: 0 }
  }, [clearTargetSettleTimer, setAutoScroll, setFeedState, setTargetMessageId, scopeKey, initialMessageId])

  useEffect(() => {
    return () => {
      if (markTimerRef.current) {
        window.clearTimeout(markTimerRef.current)
        markTimerRef.current = null
      }
      clearTargetSettleTimer()
      cancelFollowLatest()
      if (userScrollSettleTimerRef.current !== null) window.clearTimeout(userScrollSettleTimerRef.current)
    }
  }, [cancelFollowLatest, clearTargetSettleTimer])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return
    const previousOverflowAnchor = container.style.overflowAnchor
    container.style.overflowAnchor = 'none'
    const takeScrollControl = () => {
      userScrollRef.current.active = true
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
    const startTouch = (event: TouchEvent) => {
      const touch = event.touches[0]
      userScrollRef.current = { active: true, touching: true, moved: false, wasFollowing: autoScrollRef.current, top: container.scrollTop, x: touch?.clientX ?? 0, y: touch?.clientY ?? 0, direction: 0 }
      // Pause before the browser's first scroll; waiting for touchmove leaves a
      // resize/follow callback free to pull the first swipe back to the bottom.
      cancelFollowLatest()
      setAutoScroll(false)
    }
    const moveTouch = (event: TouchEvent) => {
      const touch = event.touches[0]
      const gesture = userScrollRef.current
      if (touch && (Math.abs(touch.clientY - gesture.y) < 3 || Math.abs(touch.clientY - gesture.y) < Math.abs(touch.clientX - gesture.x))) return
      gesture.moved = true
      gesture.direction = touch ? Math.sign(gesture.y - touch.clientY) : 0
      takeScrollControl()
    }
    const endTouch = () => {
      const gesture = userScrollRef.current
      gesture.touching = false
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 1
      if (!isElasticScroll(container) && (!gesture.moved && gesture.wasFollowing || gesture.direction > 0 && atBottom)) {
        setAutoScroll(true)
        followLatest()
      } else settleUserScroll()
    }
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY) return
      // A push toward latest at the boundary is still bottom-follow intent.
      if (event.deltaY > 0 && container.scrollHeight - container.scrollTop - container.clientHeight <= 1) {
        setAutoScroll(true)
        followLatest()
        return
      }
      userScrollRef.current.top = container.scrollTop
      takeScrollControl()
      settleUserScroll()
    }
    const keydown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return
      if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) return
      const towardBottom = ['ArrowDown', 'PageDown', 'End'].includes(event.key) || event.key === ' ' && !event.shiftKey
      if (towardBottom && container.scrollHeight - container.scrollTop - container.clientHeight <= 1) return
      userScrollRef.current.top = container.scrollTop
      takeScrollControl()
      settleUserScroll()
    }
    container.addEventListener('wheel', wheel, { passive: true })
    container.addEventListener('touchstart', startTouch, { passive: true })
    container.addEventListener('touchmove', moveTouch, { passive: true })
    container.addEventListener('touchend', endTouch, { passive: true })
    container.addEventListener('touchcancel', endTouch, { passive: true })
    container.addEventListener('keydown', keydown)
    return () => {
      container.style.overflowAnchor = previousOverflowAnchor
      container.removeEventListener('wheel', wheel)
      container.removeEventListener('touchstart', startTouch)
      container.removeEventListener('touchmove', moveTouch)
      container.removeEventListener('touchend', endTouch)
      container.removeEventListener('touchcancel', endTouch)
      container.removeEventListener('keydown', keydown)
    }
  }, [cancelFollowLatest, captureScrollAnchor, clearTargetSettleTimer, containerRef, enabled, followLatest, renderSignal, scopeKey, setAutoScroll, setFeedState, setTargetMessageId, settleUserScroll])

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
      scrollToBottom('auto')
      setFeedState('bottomPinned')
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

    if (autoScrollRef.current && !userScrollRef.current.active && !initialUnreadReadHoldRef.current) {
      setFeedState('newerAppend')
      scrollToBottomIfFollowing()
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
    scrollToBottomIfFollowing,
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
    scrollToBottomIfFollowing,
    markLatestRead: markObservedRead,
    captureScrollAnchor,
    restoreScrollAnchor,
  }
}
