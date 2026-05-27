import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, Check, Copy, Edit3, Plus, Send, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { MessageRichText } from '../chat/MessageRichText'
import { ChatMessageActionsMenu, type ChatMessageAction } from '../chat/ChatMessageActionsMenu'
import { NewsReactionSummaryStrip } from '../news/NewsReactionBar'
import { UserRoleBadge } from '../ui/UserRoleBadge'
import { UserPresenceBadge } from '../ui/UserPresenceBadge'
import { UserAchievementBadges } from '../ui/UserAchievementBadges'
import { UnreadDivider } from '../chat/UnreadDivider'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import { useAuth } from '../../hooks/useAuth'
import { useBoardChat } from '../../hooks/useBoardChat'
import { useReadCursor } from '../../hooks/useReadCursor'
import { useUnreadScroll } from '../../hooks/useUnreadScroll'
import { cn, formatTime } from '../../lib/utils'
import { getBlockedActionMessage } from '../../lib/moderation'
import { showActionErrorToast } from '../../lib/toastNotifications'
import type { EmojiClickData } from '../../types'
import type { BoardChatMessage } from '../../lib/supabase'
import type { ChatBoardDefinition } from '../../lib/boards'
import type { AppView } from '../../types/navigation'
import { EmojiPickerOverlay } from '../chat/EmojiPickerOverlay'

const HISTORY_LOAD_SCROLL_THRESHOLD = 180
const HISTORY_LOAD_COOLDOWN_MS = 1800

function BoardChatRow({
  board,
  message,
  onEdit,
  onDelete,
  onReact,
  containerRef,
}: {
  board: ChatBoardDefinition
  message: BoardChatMessage
  onEdit: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReact: (id: string, emoji: string) => Promise<void>
  containerRef?: React.RefObject<HTMLDivElement>
}) {
  const { profile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const isOwner = profile?.id === message.user_id
  const isOperator = profile?.admin_role === 'admin' || profile?.admin_role === 'sub_admin'
  const isAuthorOperator = message.user?.admin_role === 'admin' || message.user?.admin_role === 'sub_admin'
  const canDelete = isOwner || (isOperator && Boolean(message.user) && !isAuthorOperator)

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      toast.success('Message copied')
    } catch {
      toast.error('Failed to copy message')
    }
  }

  const saveEdit = async () => {
    try {
      await onEdit(message.id, draft)
      setEditing(false)
    } catch (error) {
      const notice = await getBlockedActionMessage(
        board.moderationScope,
        error,
        `Failed to update ${board.title} message`
      )
      showActionErrorToast(notice)
    }
  }

  const reactToMessage = async (emoji: string) => {
    try {
      await onReact(message.id, emoji)
    } catch (error) {
      const notice = await getBlockedActionMessage(board.moderationScope, error, 'Failed to update reaction')
      showActionErrorToast(notice)
    }
  }

  const handleReactionSelect = (emojiData: EmojiClickData) => {
    void reactToMessage(emojiData.emoji)
    setShowReactionPicker(false)
  }

  const deleteMessage = async () => {
    try {
      await onDelete(message.id)
    } catch (error) {
      const notice = await getBlockedActionMessage(
        board.moderationScope,
        error,
        `Failed to delete ${board.title} message`
      )
      showActionErrorToast(notice)
    }
  }

  const actions: ChatMessageAction[] = [
    {
      id: 'copy',
      label: 'Copy',
      icon: Copy,
      onSelect: copyMessage,
    },
    {
      id: 'reaction',
      label: 'Add Reaction',
      icon: Plus,
      onSelect: () => setShowReactionPicker(true),
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: Edit3,
      hidden: !isOwner,
      onSelect: () => {
        setDraft(message.content)
        setEditing(true)
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      tone: 'danger',
      hidden: !canDelete,
      onSelect: deleteMessage,
    },
  ]

  return (
    <div
      id={`board-chat-message-${board.slug}-${message.id}`}
      className="group grid max-w-full grid-cols-[auto_minmax(0,1fr)_2rem] items-start gap-3 px-4 py-3 md:px-5"
    >
      <Avatar
        src={message.user?.avatar_url}
        alt={message.user?.display_name || 'Board user'}
        size="md"
        color={message.user?.color}
        userId={message.user?.id}
        presenceVisibility={message.user?.presence_visibility}
        showStatus
      />
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-[var(--text-primary)]">
            <span className="truncate">{message.user?.display_name || message.user?.username || 'Unknown'}</span>
            <UserRoleBadge role={message.user?.admin_role} />
            <UserAchievementBadges user={message.user} />
            <UserPresenceBadge userId={message.user?.id} presenceVisibility={message.user?.presence_visibility} />
          </span>
          <span className="text-xs text-[var(--text-muted)]">{formatTime(message.created_at)}</span>
          {message.edited_at && <span className="text-xs text-[var(--text-muted)]">(edited)</span>}
        </div>

        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              className="obsidian-input min-h-20 w-full resize-none rounded-[var(--radius-md)] p-3 text-base md:text-sm"
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => void saveEdit()} disabled={!draft.trim()}>
                <Check className="mr-2 h-4 w-4" />
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            data-testid="board-chat-message-bubble"
            className="block w-fit min-w-0 max-w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-[var(--shadow-panel)]"
          >
            <MessageRichText content={message.content} />
          </div>
        )}

        {!editing && (
          <NewsReactionSummaryStrip
            reactions={message.reactions}
            onReact={reactToMessage}
            className="mt-1.5"
          />
        )}

      </div>
      <div className="relative flex h-8 w-8 justify-end">
        {!editing && (
          <ChatMessageActionsMenu
            actions={actions}
            containerRef={containerRef}
            className="shrink-0"
            buttonLabel={`${board.title} message actions`}
          />
        )}
        <EmojiPickerOverlay
          open={showReactionPicker}
          title="Add reaction"
          ariaLabel={`${board.title} reaction emoji picker`}
          onClose={() => setShowReactionPicker(false)}
          onEmojiClick={handleReactionSelect}
          desktopClassName="fixed left-1/2 top-16 z-[90] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-[var(--radius-md)] sm:absolute sm:bottom-full sm:left-auto sm:right-0 sm:top-auto sm:mb-2 sm:translate-x-0"
        />
      </div>
    </div>
  )
}

function BoardChatComposer({
  board,
  draft,
  sending,
  onDraftChange,
  onSubmit,
  className,
}: {
  board: ChatBoardDefinition
  draft: string
  sending: boolean
  onDraftChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  className?: string
}) {
  return (
    <form
      onSubmit={onSubmit}
      data-message-composer-surface="true"
      className={cn(
        'theme-composer-surface border-t border-[var(--border-panel)] p-3',
        className
      )}
    >
      <div className="flex items-end gap-2.5">
        <textarea
          value={draft}
          onChange={event => onDraftChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder={`Drop a link or note in ${board.title}`}
          rows={1}
          className="obsidian-input max-h-28 min-h-12 flex-1 resize-none rounded-[var(--radius-md)] px-3.5 py-3 text-base leading-6 text-[var(--text-primary)] md:text-sm"
        />
        <Button
          type="submit"
          disabled={!draft.trim() || sending}
          loading={sending}
          className="h-12 w-12 rounded-xl p-0"
          aria-label={`Send ${board.title} message`}
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </form>
  )
}

export function BoardChat({
  board,
  currentView = 'boards',
  onViewChange = () => {},
}: {
  board: ChatBoardDefinition
  currentView?: AppView
  onViewChange?: (view: AppView) => void
}) {
  const { profile } = useAuth()
  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    sending,
    error,
    loadOlderMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
  } = useBoardChat(board.slug, board.title)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevHeightRef = useRef(0)
  const prevScrollTopRef = useRef(0)
  const olderLoadInFlightRef = useRef(false)
  const lastHistoryRequestAtRef = useRef(0)
  const historyRetryTimerRef = useRef<number | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const {
    cursor,
    loading: cursorLoading,
    markRead,
  } = useReadCursor('board_chat', board.slug, Boolean(profile?.id))

  const markBoardRead = useCallback(
    async (message: BoardChatMessage) => {
      await markRead(message.id, message.created_at)
    },
    [markRead]
  )

  const {
    autoScroll,
    firstUnreadMessageId,
    setAutoScroll,
    handleUnreadScroll,
    scrollToBottom,
  } = useUnreadScroll<BoardChatMessage>({
    containerRef: scrollRef,
    messages,
    loading,
    cursor,
    cursorLoading,
    enabled: Boolean(profile?.id),
    surfaceKey: `board_chat:${board.slug}`,
    getMessageId: message => message.id,
    getMessageCreatedAt: message => message.created_at,
    getElementId: id => `board-chat-message-${board.slug}-${id}`,
    onMarkReadToLatest: markBoardRead,
  })

  const clearHistoryRetry = useCallback(() => {
    if (historyRetryTimerRef.current !== null) {
      window.clearTimeout(historyRetryTimerRef.current)
      historyRetryTimerRef.current = null
    }
  }, [])

  const requestOlderMessages = useCallback(() => {
    const el = scrollRef.current
    if (!el || loadingMore || !hasMore || olderLoadInFlightRef.current) return

    const now = Date.now()
    if (
      lastHistoryRequestAtRef.current > 0 &&
      now - lastHistoryRequestAtRef.current < HISTORY_LOAD_COOLDOWN_MS
    ) {
      const retryDelay = Math.max(80, HISTORY_LOAD_COOLDOWN_MS - (now - lastHistoryRequestAtRef.current) + 24)
      if (historyRetryTimerRef.current === null) {
        historyRetryTimerRef.current = window.setTimeout(() => {
          historyRetryTimerRef.current = null
          const retryEl = scrollRef.current
          if (!retryEl || retryEl.scrollTop > HISTORY_LOAD_SCROLL_THRESHOLD) return
          requestOlderMessages()
        }, retryDelay)
      }
      return
    }

    clearHistoryRetry()
    lastHistoryRequestAtRef.current = now
    prevHeightRef.current = el.scrollHeight
    prevScrollTopRef.current = el.scrollTop
    setAutoScroll(false)
    olderLoadInFlightRef.current = true
    void loadOlderMessages().finally(() => {
      olderLoadInFlightRef.current = false
    })
  }, [clearHistoryRetry, hasMore, loadingMore, loadOlderMessages, setAutoScroll])

  const handleScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) return

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null
      const el = scrollRef.current
      if (!el) return

      handleUnreadScroll()

      if (el.scrollTop <= HISTORY_LOAD_SCROLL_THRESHOLD) {
        requestOlderMessages()
      }
    })
  }, [handleUnreadScroll, requestOlderMessages])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (!loadingMore && prevHeightRef.current) {
      const diff = el.scrollHeight - prevHeightRef.current
      el.scrollTop = prevScrollTopRef.current <= 0
        ? diff
        : prevScrollTopRef.current + diff
      prevHeightRef.current = 0
      prevScrollTopRef.current = 0
    }
  }, [loadingMore, messages.length])

  useEffect(() => {
    return () => {
      clearHistoryRetry()
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current)
      }
    }
  }, [clearHistoryRetry])

  useEffect(() => {
    let frameId: number | null = null
    let settleFrameId: number | null = null
    let settleTimerId: number | null = null

    const keepLatestVisible = () => {
      if (!autoScroll) return

      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      if (settleFrameId !== null) {
        cancelAnimationFrame(settleFrameId)
      }
      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId)
      }

      frameId = requestAnimationFrame(() => {
        frameId = null
        scrollToBottom('auto')
        settleFrameId = requestAnimationFrame(() => {
          settleFrameId = null
          scrollToBottom('auto')
        })
        settleTimerId = window.setTimeout(() => {
          settleTimerId = null
          scrollToBottom('auto')
        }, 140)
      })
    }

    keepLatestVisible()
    window.visualViewport?.addEventListener('resize', keepLatestVisible)
    window.visualViewport?.addEventListener('scroll', keepLatestVisible)
    window.addEventListener('resize', keepLatestVisible)
    window.addEventListener('focusin', keepLatestVisible)

    return () => {
      window.visualViewport?.removeEventListener('resize', keepLatestVisible)
      window.visualViewport?.removeEventListener('scroll', keepLatestVisible)
      window.removeEventListener('resize', keepLatestVisible)
      window.removeEventListener('focusin', keepLatestVisible)
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      if (settleFrameId !== null) {
        cancelAnimationFrame(settleFrameId)
      }
      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId)
      }
    }
  }, [autoScroll, messages.length, scrollToBottom])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.trim() || sending) return

    try {
      await sendMessage(draft)
      setDraft('')
    } catch (err) {
      const notice = await getBlockedActionMessage(
        board.moderationScope,
        err,
        `Failed to send ${board.title} message`
      )
      showActionErrorToast(notice)
    }
  }

  return (
    <div className="theme-image-surface flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          data-testid="board-chat-message-scroll"
          className="h-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-mobile-scroll-keyboard-inset,0px)_+_0.75rem)] md:pb-0"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center p-8">
              <LoadingSpinner size="lg" className="text-[var(--text-gold)]" />
            </div>
          ) : error ? (
            <div className="m-4 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-4 text-sm text-red-100">
              {error}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--text-muted)]">
              No {board.title.toLowerCase()} messages yet.
            </div>
          ) : (
            <div className="py-2">
              {loadingMore && (
                <div className="flex justify-center py-2 text-sm text-[var(--text-muted)]">
                  <LoadingSpinner size="sm" /> Loading more...
                </div>
              )}
              {messages.map(message => (
                <React.Fragment key={message.id}>
                  {firstUnreadMessageId === message.id && (
                    <UnreadDivider className="mx-4 md:mx-5" />
                  )}
                  <BoardChatRow
                    board={board}
                    message={message}
                    onEdit={editMessage}
                    onDelete={deleteMessage}
                    onReact={toggleReaction}
                    containerRef={scrollRef}
                  />
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {!autoScroll && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            aria-label="Jump to latest"
            className="theme-floating-action fixed right-4 bottom-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-keyboard-inset,0px)_+_0.5rem)] z-50 rounded-full p-2 transition-transform hover:-translate-y-0.5 md:absolute md:bottom-4 md:right-4 md:z-20"
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="hidden md:block">
        <BoardChatComposer
          board={board}
          draft={draft}
          sending={sending}
          onDraftChange={setDraft}
          onSubmit={handleSubmit}
        />
      </div>

      <MobileChatFooter currentView={currentView} onViewChange={onViewChange} avoidAndroidKeyboardLift>
        <BoardChatComposer
          board={board}
          draft={draft}
          sending={sending}
          onDraftChange={setDraft}
          onSubmit={handleSubmit}
        />
      </MobileChatFooter>
    </div>
  )
}
