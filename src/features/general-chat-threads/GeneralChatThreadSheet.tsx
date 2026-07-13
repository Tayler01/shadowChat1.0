import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowLeft, MessageCircle, RefreshCw } from 'lucide-react'
import { MessageInput } from '../../components/chat/MessageInput'
import { MessageItem } from '../../components/chat/MessageItem'
import { messageToReplyTarget, type ReplyTarget } from '../../components/chat/messageDisplay'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { useComfortPreferences } from '../../hooks/useComfortPreferences'
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility'
import { useOptionalMessages, type MessagesContextValue } from '../../hooks/MessagesContext'
import { useReadCursor } from '../../hooks/useReadCursor'
import { cn, shouldGroupMessage } from '../../lib/utils'
import type { ChatMessageType, Message } from '../../lib/supabase'
import { useGeneralChatThread } from './useGeneralChatThread'

export type GeneralChatThreadSheetProps = {
  open: boolean
  threadId: string | null
  onClose: () => void
  initialRootMessage?: Message | null
  initialMessageId?: string | null
  messagesApi?: MessagesContextValue
}

const isNearBottom = (element: HTMLElement) => (
  element.scrollHeight - element.scrollTop - element.clientHeight < 88
)

export function GeneralChatThreadSheet({
  open,
  threadId,
  onClose,
  initialRootMessage = null,
  initialMessageId = null,
  messagesApi: providedMessagesApi,
}: GeneralChatThreadSheetProps) {
  const contextMessagesApi = useOptionalMessages()
  const messagesApi = providedMessagesApi ?? contextMessagesApi
  if (!messagesApi) throw new Error('GeneralChatThreadSheet requires a messages API or MessagesProvider')

  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const targetScrolledRef = useRef<string | null>(null)
  const readInFlightRef = useRef(false)
  const wasNearBottomRef = useRef(true)
  const previousReplyCountRef = useRef(0)
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | undefined>()
  const { isReducedMotion } = useComfortPreferences()
  const thread = useGeneralChatThread({
    threadId,
    open,
    initialRootMessage,
    targetMessageId: initialMessageId,
  })
  const { markRead } = useReadCursor('general_chat_thread', threadId, open && Boolean(threadId))

  const markLatestVisibleRead = useCallback(async () => {
    if (!threadId || readInFlightRef.current) return
    const scroll = scrollRef.current
    if (scroll && !isNearBottom(scroll)) return
    const latest = thread.replies[thread.replies.length - 1] ?? thread.rootMessage
    if (!latest) return

    readInFlightRef.current = true
    try {
      await markRead(latest.id, latest.created_at)
      await messagesApi.refreshThreadSummaries?.([threadId])
    } catch {
      // A later scroll/realtime refresh can retry the cursor without blocking the thread.
    } finally {
      readInFlightRef.current = false
    }
  }, [markRead, messagesApi, thread.replies, thread.rootMessage, threadId])

  const requestClose = useCallback(() => {
    if (wasNearBottomRef.current) {
      void markLatestVisibleRead()
    } else if (threadId) {
      const summaryRefresh = messagesApi.refreshThreadSummaries?.([threadId])
      if (summaryRefresh) void summaryRefresh.catch(() => undefined)
    }
    onClose()
  }, [markLatestVisibleRead, messagesApi, onClose, threadId])

  const dialogRef = useDialogAccessibility<HTMLDivElement>({
    open,
    onClose: requestClose,
    initialFocusRef: closeRef,
  })

  const messageMap = useMemo(() => {
    const result = new Map<string, Message>()
    if (thread.rootMessage) result.set(thread.rootMessage.id, thread.rootMessage)
    thread.replies.forEach(message => result.set(message.id, message))
    return result
  }, [thread.replies, thread.rootMessage])

  useEffect(() => {
    if (!open) setReplyingTo(undefined)
  }, [open])

  useEffect(() => {
    if (!open || !initialMessageId || targetScrolledRef.current === initialMessageId) return
    const frame = window.requestAnimationFrame(() => {
      const target = scrollRef.current?.querySelector<HTMLElement>(`[data-thread-message-id="${CSS.escape(initialMessageId)}"]`)
      if (!target) return
      target.scrollIntoView({ block: 'center', behavior: isReducedMotion ? 'auto' : 'smooth' })
      target.focus({ preventScroll: true })
      targetScrolledRef.current = initialMessageId
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialMessageId, isReducedMotion, open, thread.replies])

  useEffect(() => {
    if (!open || thread.loading) return
    const previousCount = previousReplyCountRef.current
    previousReplyCountRef.current = thread.replies.length
    const frame = window.requestAnimationFrame(() => {
      const scroll = scrollRef.current
      if (!scroll) return
      if (thread.replies.length > previousCount && wasNearBottomRef.current) {
        scroll.scrollTop = scroll.scrollHeight
      }
      if (isNearBottom(scroll)) void markLatestVisibleRead()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [markLatestVisibleRead, open, thread.loading, thread.replies.length])

  const scrollToLatest = useCallback(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: isReducedMotion ? 'auto' : 'smooth' })
    wasNearBottomRef.current = true
    thread.setFollowingLatest(true)
    void markLatestVisibleRead()
  }, [isReducedMotion, markLatestVisibleRead, thread])

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const followingLatest = isNearBottom(event.currentTarget)
    wasNearBottomRef.current = followingLatest
    thread.setFollowingLatest(followingLatest)
    if (followingLatest) void markLatestVisibleRead()
  }, [markLatestVisibleRead, thread])

  const loadOlder = useCallback(async () => {
    const scroll = scrollRef.current
    const previousHeight = scroll?.scrollHeight ?? 0
    await thread.loadOlder()
    window.requestAnimationFrame(() => {
      if (!scroll) return
      scroll.scrollTop += scroll.scrollHeight - previousHeight
    })
  }, [thread])

  const handleSendMessage = useCallback(async (
    content: string,
    type?: ChatMessageType,
    fileUrl?: string,
    replyTo?: string,
    thumbnailUrl?: string | null
  ) => {
    if (!threadId) return null
    const sent = await messagesApi.sendMessage(content, type, fileUrl, replyTo ?? threadId, thumbnailUrl)
    if (sent) {
      setReplyingTo(undefined)
      await thread.refresh()
      window.requestAnimationFrame(scrollToLatest)
    }
    return sent
  }, [messagesApi, scrollToLatest, thread, threadId])

  const handleEdit = useCallback(async (messageId: string, content: string) => {
    await messagesApi.editMessage(messageId, content)
    await thread.refresh()
  }, [messagesApi, thread])

  const handleDelete = useCallback(async (messageId: string) => {
    await messagesApi.deleteMessage(messageId)
    if (messageId === threadId) {
      requestClose()
      return
    }
    await thread.refresh()
  }, [messagesApi, requestClose, thread, threadId])

  const jumpToMessage = useCallback((messageId: string) => {
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-thread-message-id="${CSS.escape(messageId)}"]`)
    target?.scrollIntoView({ block: 'center', behavior: isReducedMotion ? 'auto' : 'smooth' })
    target?.focus({ preventScroll: true })
  }, [isReducedMotion])

  if (!open || !threadId) return null

  const sheet = (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[135] flex justify-end bg-[rgba(0,0,0,0.68)] backdrop-blur-sm"
        initial={isReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={isReducedMotion ? undefined : { opacity: 0 }}
        onPointerDown={event => {
          if (event.target === event.currentTarget) requestClose()
        }}
        data-testid="general-chat-thread-backdrop"
      >
        <motion.section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="glass-panel-strong flex h-[var(--shadowchat-visual-viewport-height,100dvh)] w-full flex-col overflow-hidden border-l border-[var(--border-panel)] bg-[var(--bg-app)] shadow-[var(--shadow-panel-strong)] md:w-[28rem]"
          initial={isReducedMotion ? false : { x: '100%' }}
          animate={{ x: 0 }}
          exit={isReducedMotion ? undefined : { x: '100%' }}
          transition={{ duration: isReducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          data-testid="general-chat-thread-sheet"
        >
          <header className="shrink-0 border-b border-[var(--border-panel)] px-2 pb-2 pt-[calc(env(safe-area-inset-top)_+_0.4rem)] md:px-3 md:pt-3">
            <div className="flex min-h-12 items-center gap-2">
              <button
                ref={closeRef}
                type="button"
                onClick={requestClose}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--theme-accent-soft)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
                aria-label="Back to General Chat"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[var(--theme-accent-readable)]">General Chat</p>
                <h2 id={titleId} className="truncate text-lg font-semibold text-[var(--text-primary)]">Thread</h2>
              </div>
              <span className="mr-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] px-2.5 py-1 text-xs text-[var(--text-muted)]" aria-label={`${thread.replies.length} loaded replies`}>
                <MessageCircle className="h-3.5 w-3.5" />
                {thread.replies.length}
              </span>
            </div>
          </header>

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [overflow-anchor:auto] md:px-4"
            data-testid="general-chat-thread-scroll"
          >
            {thread.loading && !thread.rootMessage ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
                <LoadingSpinner size="sm" /> Loading thread…
              </div>
            ) : thread.error && !thread.rootMessage ? (
              <div className="mx-auto flex min-h-48 max-w-xs flex-col items-center justify-center text-center">
                <MessageCircle className="mb-3 h-8 w-8 text-[var(--text-muted)]" />
                <p className="font-medium text-[var(--text-primary)]">Thread unavailable</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">It may have been removed, or you may no longer have access.</p>
                <button type="button" onClick={() => void thread.refresh()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-glow)] px-4 text-sm text-[var(--theme-accent-readable)]">
                  <RefreshCw className="h-4 w-4" /> Try again
                </button>
              </div>
            ) : (
              <>
                {thread.rootMessage ? (
                  <div
                    data-thread-message-id={thread.rootMessage.id}
                    tabIndex={-1}
                    className="rounded-[var(--radius-lg)] border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-softer)] py-2 pr-1 outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
                  >
                    <MessageItem
                      message={thread.rootMessage}
                      onReply={message => setReplyingTo(messageToReplyTarget(message))}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onTogglePin={messagesApi.togglePin}
                      onToggleReaction={messagesApi.toggleReaction}
                      onJumpToMessage={jumpToMessage}
                      containerRef={scrollRef}
                      avatarLoading="eager"
                      avatarFetchPriority="high"
                      moderationScope="general_chat"
                      allowPin={false}
                      domIdPrefix="thread-message"
                    />
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-panel)] px-4 py-5 text-center text-sm text-[var(--text-muted)]">
                    The starting message is unavailable.
                  </div>
                )}

                <div className="my-4 flex items-center gap-3" role="separator" aria-label="Thread replies">
                  <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Replies</span>
                  <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                </div>

                {thread.hasOlder && (
                  <div className="mb-3 flex justify-center">
                    <button
                      type="button"
                      onClick={() => void loadOlder()}
                      disabled={thread.loadingOlder}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 text-sm text-[var(--text-secondary)] hover:border-[var(--border-glow)] hover:text-[var(--text-primary)] disabled:opacity-60"
                    >
                      {thread.loadingOlder && <LoadingSpinner size="sm" />}
                      {thread.loadingOlder ? 'Loading…' : 'Load older replies'}
                    </button>
                  </div>
                )}

                {thread.replies.length === 0 && !thread.loading ? (
                  <div className="px-4 py-10 text-center">
                    <MessageCircle className="mx-auto h-8 w-8 text-[var(--theme-accent-readable)]/70" />
                    <p className="mt-3 font-medium text-[var(--text-primary)]">Start the conversation</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">Your reply will stay connected to this message.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {thread.replies.map((message, index) => {
                      const previousMessage = thread.replies[index - 1]
                      return (
                        <div
                          key={message.id}
                          data-thread-message-id={message.id}
                          data-message-grouped={shouldGroupMessage(message, previousMessage) ? 'true' : 'false'}
                          tabIndex={-1}
                          className={cn('comfort-message-row rounded-[var(--radius-md)] py-0.5 outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]')}
                        >
                          <MessageItem
                            message={message}
                            previousMessage={previousMessage}
                            parentMessage={messageMap.get(message.reply_to ?? '')}
                            onReply={reply => setReplyingTo(messageToReplyTarget(reply))}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onTogglePin={messagesApi.togglePin}
                            onToggleReaction={messagesApi.toggleReaction}
                            onJumpToMessage={jumpToMessage}
                            onRetryFailed={messagesApi.retryFailedMessage}
                            onDiscardFailed={messagesApi.discardFailedMessage}
                            containerRef={scrollRef}
                            moderationScope="general_chat"
                            allowPin={false}
                            domIdPrefix="thread-message"
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="relative shrink-0 border-t border-[var(--border-panel)] bg-[var(--bg-panel-strong)] px-2 pb-[calc(env(safe-area-inset-bottom)_+_0.4rem)] pt-2 md:px-3 md:pb-3">
            {thread.pendingReplyCount > 0 && (
              <button
                type="button"
                onClick={scrollToLatest}
                className="absolute bottom-full left-1/2 mb-2 inline-flex min-h-10 -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--border-glow)] bg-[var(--bg-panel-strong)] px-4 text-sm font-medium text-[var(--theme-accent-readable)] shadow-[var(--shadow-panel)]"
              >
                <ArrowDown className="h-4 w-4" />
                {thread.pendingReplyCount} new {thread.pendingReplyCount === 1 ? 'reply' : 'replies'}
              </button>
            )}
            <MessageInput
              onSendMessage={handleSendMessage}
              messages={thread.replies}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(undefined)}
              placeholder="Reply in thread"
              cacheKey={`general-thread:${threadId}`}
              typingChannel={`general-thread:${threadId}`}
              enableGifPicker
              disabled={!thread.rootMessage || messagesApi.sending}
              className="rounded-[var(--radius-lg)]"
            />
            <p className="sr-only" aria-live="polite">
              {thread.pendingReplyCount > 0 ? `${thread.pendingReplyCount} new replies available` : ''}
            </p>
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  )

  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body)
}
