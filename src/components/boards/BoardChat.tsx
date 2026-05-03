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
import { UnreadDivider } from '../chat/UnreadDivider'
import { useAuth } from '../../hooks/useAuth'
import { useBoardChat } from '../../hooks/useBoardChat'
import { useReadCursor } from '../../hooks/useReadCursor'
import { useUnreadScroll } from '../../hooks/useUnreadScroll'
import { formatTime } from '../../lib/utils'
import { getBlockedActionMessage } from '../../lib/moderation'
import { showActionErrorToast } from '../../lib/toastNotifications'
import { useEmojiPicker } from '../../hooks/useEmojiPicker'
import type { EmojiClickData } from '../../types'
import type { BoardChatMessage } from '../../lib/supabase'
import type { ChatBoardDefinition } from '../../lib/boards'

const getEmojiPickerDimensions = () => {
  if (typeof window === 'undefined') return { width: 300, height: 360 }

  if (window.innerWidth < 480) {
    return { width: 280, height: Math.max(260, Math.min(320, window.innerHeight - 120)) }
  }

  return { width: 300, height: 360 }
}

const getEmojiPickerTheme = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light'

function BoardChatRow({
  board,
  message,
  onEdit,
  onDelete,
  onReact,
}: {
  board: ChatBoardDefinition
  message: BoardChatMessage
  onEdit: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReact: (id: string, emoji: string) => Promise<void>
}) {
  const { profile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const EmojiPicker = useEmojiPicker(showReactionPicker)
  const pickerDimensions = getEmojiPickerDimensions()
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

  useEffect(() => {
    if (!showReactionPicker) return

    const handleClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowReactionPicker(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showReactionPicker])

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
            className="shrink-0"
            buttonLabel={`${board.title} message actions`}
          />
        )}
        {showReactionPicker && EmojiPicker && (
          <div
            ref={pickerRef}
            className="fixed left-1/2 top-16 z-[90] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-[var(--radius-md)] sm:absolute sm:bottom-full sm:left-auto sm:right-0 sm:top-auto sm:mb-2 sm:translate-x-0"
          >
            <EmojiPicker
              onEmojiClick={handleReactionSelect}
              width={pickerDimensions.width}
              height={pickerDimensions.height}
              theme={getEmojiPickerTheme()}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function BoardChat({ board }: { board: ChatBoardDefinition }) {
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

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return

    handleUnreadScroll()

    if (el.scrollTop < 100 && hasMore && !loadingMore) {
      void loadOlderMessages()
    }
  }, [handleUnreadScroll, hasMore, loadingMore, loadOlderMessages])

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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
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
            className="absolute bottom-4 right-4 z-20 rounded-full border border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(255,240,184,0.18),rgba(215,170,70,0.12)_36%,rgba(122,89,24,0.5)_100%)] p-2 text-[var(--text-gold)] shadow-[var(--shadow-gold-soft)] transition-transform hover:-translate-y-0.5"
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[var(--border-panel)] bg-[linear-gradient(180deg,rgba(16,18,19,0.94),rgba(10,11,12,0.98))] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder={`Drop a link or note in ${board.title}`}
            rows={1}
            className="obsidian-input max-h-28 min-h-11 flex-1 resize-none rounded-[var(--radius-md)] px-3.5 py-3 text-base text-[var(--text-primary)] md:text-sm"
          />
          <Button
            type="submit"
            disabled={!draft.trim() || sending}
            loading={sending}
            className="h-11 w-11 rounded-xl p-0"
            aria-label={`Send ${board.title} message`}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </form>
    </div>
  )
}
