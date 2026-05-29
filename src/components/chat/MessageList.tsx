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
import { useUnreadScroll } from '../../hooks/useUnreadScroll'
import { UnreadDivider } from './UnreadDivider'

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
const HISTORY_LOAD_ROOT_MARGIN = '180px 0px 0px 0px'
const HISTORY_LOAD_SCROLL_THRESHOLD = 180
const HISTORY_LOAD_COOLDOWN_MS = 1800

type VisibleMessageAnchor = {
  id: string
  top: number
  scrollHeight: number
}

const findMessageRowById = (container: HTMLElement, id: string) => {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-message-row="true"]'))
    .find(row => row.dataset.messageId === id) ?? null
}

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
    hasMore
  } = useMessages()
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
  const [renderWindowStart, setRenderWindowStart] = useState(0)
  const [historyLoadArmed, setHistoryLoadArmed] = useState(false)
  const { cursor, loading: cursorLoading, markRead } = useReadCursor('general_chat', 'main', Boolean(profile?.id))

  const messageMap = useMemo(() => {
    const msgMap = new Map<string, Message>()
    messages.forEach(m => {
      msgMap.set(m.id, m)
    })
    return msgMap
  }, [messages])

  const combinedMessages = useMemo(() => {
    return [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [messages])

  const markGeneralChatRead = useCallback(
    async (message: Message) => {
      await markRead(message.id, message.created_at)
    },
    [markRead]
  )
  const getMessageId = useCallback((message: Message) => message.id, [])
  const getMessageCreatedAt = useCallback((message: Message) => message.created_at, [])
  const getMessageElementId = useCallback((id: string) => `message-${id}`, [])

  const {
    autoScroll,
    firstUnreadMessageId,
    setAutoScroll,
    setFirstUnreadMessageId,
    handleUnreadScroll,
    scrollToBottom,
    markLatestRead,
  } = useUnreadScroll<Message>({
    containerRef,
    messages: combinedMessages as Message[],
    loading,
    cursor,
    cursorLoading,
    enabled: Boolean(profile?.id),
    surfaceKey: 'general_chat:main',
    initialMessageId,
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
  ])

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
      }
    })
  }, [handleUnreadScroll, requestOlderMessages])

  useEffect(() => {
    initialTargetJumpDoneRef.current = null
    historyIntentRef.current = false
    setHistoryLoadArmed(false)
  }, [profile?.id])

  useEffect(() => {
    if (loading || cursorLoading || combinedMessages.length === 0) {
      setHistoryLoadArmed(false)
      return
    }

    if (historyLoadArmed) return

    const timer = window.setTimeout(() => {
      setHistoryLoadArmed(true)
    }, 650)

    return () => window.clearTimeout(timer)
  }, [combinedMessages.length, cursorLoading, historyLoadArmed, loading])

  useEffect(() => {
    if (!autoScroll || initialMessageId) return
    if (combinedMessages.length <= DEFAULT_RENDER_WINDOW_SIZE) return
    compactToLatestMessages()
  }, [autoScroll, combinedMessages.length, compactToLatestMessages, initialMessageId])

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
      container.scrollTop += delta
    }
  }, [combinedMessages.length, renderWindowStart])

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
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current)
      }
    }
  }, [clearHistoryRetry])

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
        setRenderWindowStart(current => Math.min(current, Math.max(0, targetIndex - 8)))
        return
      }
    }

    if (firstUnreadMessageId) {
      const unreadIndex = combinedMessages.findIndex(message => message.id === firstUnreadMessageId)
      if (unreadIndex >= 0) {
        setRenderWindowStart(current => Math.min(current, Math.max(0, unreadIndex - 8)))
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
    const seenIds = new Set<string>()
    const nextMessages: Message[] = []

    for (const message of pinnedMessagesBeforeWindow) {
      if (!seenIds.has(message.id)) {
        seenIds.add(message.id)
        nextMessages.push(message)
      }
    }

    for (const message of combinedMessages.slice(boundedStart)) {
      if (!seenIds.has(message.id)) {
        seenIds.add(message.id)
        nextMessages.push(message)
      }
    }

    return nextMessages
  }, [combinedMessages, pinnedMessagesBeforeWindow, renderWindowStart])

  const hiddenBeforeCount = Math.max(0, renderWindowStart - pinnedMessagesBeforeWindow.length)

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

  useEffect(() => {
    if (
      loading ||
      !initialMessageId ||
      initialTargetJumpDoneRef.current === initialMessageId ||
      combinedMessages.length === 0
    ) {
      return
    }

    const target = combinedMessages.find(message => message.id === initialMessageId)
    if (!target) {
      return
    }

    initialTargetJumpDoneRef.current = initialMessageId
    setFirstUnreadMessageId(null)
    setAutoScroll(false)

    const targetIndex = combinedMessages.findIndex(message => message.id === initialMessageId)
    if (targetIndex >= 0 && targetIndex < renderWindowStart) {
      pendingJumpMessageIdRef.current = initialMessageId
      setRenderWindowStart(Math.max(0, targetIndex - 8))
    }

    scrollAndHighlightMessage(initialMessageId, 'ring-[rgba(34,197,94,0.55)]', 2200)
    void markLatestRead(false)
  }, [
    combinedMessages,
    initialMessageId,
    loading,
    markLatestRead,
    renderWindowStart,
    scrollAndHighlightMessage,
    setAutoScroll,
    setFirstUnreadMessageId,
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="glass-panel rounded-[var(--radius-xl)] px-8 py-6 text-center">
          <div className="text-[var(--text-secondary)]">Loading the conversation...</div>
          <div className="mt-2 text-xs text-[var(--text-muted)]">Pulling in the latest messages and thread state.</div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      data-testid="message-scroll"
      data-loaded-count={combinedMessages.length}
      data-rendered-count={renderedMessages.length}
      data-hidden-before-count={hiddenBeforeCount}
      className="relative flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden px-4 pb-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-mobile-scroll-keyboard-inset,0px)_+_0.75rem)] pt-4 md:px-3 md:pb-[calc(env(safe-area-inset-bottom)_+_6rem)]"
    >
      <div data-testid="message-stack" className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-end">
      <div ref={topSentinelRef} aria-hidden="true" className="h-px w-full shrink-0" />

      {loadingMore && (
        <div className="flex justify-center py-2 text-sm text-[var(--text-muted)]">
          <LoadingSpinner size="sm" /> Loading more...
        </div>
      )}


      {groupedMessages.map((group, index) => (
        <React.Fragment key={`${group.date}-${index}`}>
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
                  className={isGrouped ? 'pt-1 pb-1' : 'pt-4 pb-1'}
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
            compactToLatestMessages()
            scrollToBottom()
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
