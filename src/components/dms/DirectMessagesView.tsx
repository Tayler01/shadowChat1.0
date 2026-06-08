import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare,
  Plus,
  ArrowDown,
  X,
  Check,
  Copy,
  Edit3,
  Trash2,
  Search,
  Reply,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { useDirectMessages } from '../../hooks/useDirectMessages'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { MessageInput } from '../chat/MessageInput'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import { MobileNav } from '../layout/MobileNav'
import { MobileAppHeader } from '../layout/MobileAppHeader'
import { FileAttachment } from '../chat/FileAttachment'
import { VideoAttachment } from '../chat/VideoAttachment'
import { MessageRichText } from '../chat/MessageRichText'
import { ChatMessageActionsMenu, type ChatMessageAction } from '../chat/ChatMessageActionsMenu'
import { UserRoleBadge } from '../ui/UserRoleBadge'
import { UserPresenceBadge } from '../ui/UserPresenceBadge'
import { UserAchievementBadges } from '../ui/UserAchievementBadges'
import { NewsReactionSummaryStrip } from '../news/NewsReactionBar'
import { formatTime, shouldGroupMessage, getReadableTextColor, cn } from '../../lib/utils'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { useTyping } from '../../hooks/useTyping'
import { useReadCursor } from '../../hooks/useReadCursor'
import { useUnreadScroll } from '../../hooks/useUnreadScroll'
import { useAllUsers } from '../../hooks/useAllUsers'
import toast from 'react-hot-toast'
import type { BasicUser, ChatMessageType, DMMessage, User } from '../../lib/supabase'
import { UnreadDivider } from '../chat/UnreadDivider'
import type { EmojiClickData } from '../../types'
import type { AppView } from '../../types/navigation'
import { EmojiPickerOverlay } from '../chat/EmojiPickerOverlay'
import { ImageModal } from '../ui/ImageModal'
import { QuickReactionRail } from '../chat/QuickReactionRail'
import {
  getImageMessageDisplaySrc,
  getMessagePreviewText,
  messageToReplyTarget,
  type ReplyTarget,
} from '../chat/messageDisplay'

interface DirectMessagesViewProps {
  onToggleSidebar: () => void
  currentView: AppView
  onViewChange: (view: AppView) => void
  initialConversation?: string
  initialMessageId?: string
}

const HISTORY_LOAD_SCROLL_THRESHOLD = 180
const HISTORY_LOAD_COOLDOWN_MS = 1800

const normalizeEmojiValue = (emoji: string) => {
  const value = emoji.trim()

  if (value === '??' || value === '??1') return '\u{1F44D}'

  return value
}

const PublicProfileDialog = React.lazy(() =>
  import('../profile/PublicProfileDialog').then(module => ({
    default: module.PublicProfileDialog,
  }))
)

const DirectMessageBubble = React.memo(function DirectMessageBubble({
  message,
  previousMessage,
  parentMessage,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onRetryFailed,
  onDiscardFailed,
  onJumpToMessage,
  onOpenProfile,
  containerRef,
  avatarLoading = 'lazy',
  avatarFetchPriority,
}: {
  message: DMMessage
  previousMessage?: DMMessage
  parentMessage?: DMMessage
  currentUserId: string | null
  onReply?: (message: DMMessage) => void
  onEdit: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReact: (id: string, emoji: string) => Promise<void>
  onRetryFailed?: (messageId: string) => Promise<DMMessage | null>
  onDiscardFailed?: (messageId: string) => void
  onJumpToMessage?: (messageId: string) => void
  onOpenProfile: (user: User | null) => void
  containerRef?: React.RefObject<HTMLDivElement>
  avatarLoading?: 'eager' | 'lazy'
  avatarFetchPriority?: 'high' | 'low' | 'auto'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [showQuickReactions, setShowQuickReactions] = useState(false)
  const [showImageModal, setShowImageModal] = useState(false)
  const [retryingFailedMessage, setRetryingFailedMessage] = useState(false)
  const bubbleShellRef = useRef<HTMLDivElement>(null)
  const reactionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isGrouped = shouldGroupMessage(message, previousMessage)
  const isOwn = message.sender_id === currentUserId
  const isIncoming = !isOwn
  const isImageMessage = message.message_type === 'image' && Boolean(message.file_url)
  const isVideoMessage = message.message_type === 'video' && Boolean(message.file_url)
  const isFloatingMediaMessage = isImageMessage || isVideoMessage
  const videoMessageUrl = isVideoMessage ? message.file_url || '' : ''
  const imageMessageSrc = getImageMessageDisplaySrc(message.file_url, message.thumbnail_url)
  const isLocalDelivery = message.optimistic || message.delivery_status === 'sending' || message.delivery_status === 'failed'
  const isFailedLocalMessage = isOwn && message.delivery_status === 'failed'
  const showIncomingAvatar = !isGrouped && !isOwn
  const parentPreview = parentMessage ? getMessagePreviewText(parentMessage) : ''
  const parentPreviewImageSrc = parentMessage?.message_type === 'image'
    ? getImageMessageDisplaySrc(parentMessage.file_url, parentMessage.thumbnail_url)
    : ''
  const bubbleColor = undefined
  const bubbleStyle = bubbleColor
    ? { backgroundColor: bubbleColor, color: getReadableTextColor(bubbleColor) }
    : undefined

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
    } catch {
      toast.error('Failed to edit message')
    }
  }

  const deleteMessage = async () => {
    try {
      await onDelete(message.id)
    } catch {
      toast.error('Failed to delete message')
    }
  }

  const reactToMessage = async (emoji: string) => {
    try {
      await onReact(message.id, emoji)
    } catch {
      toast.error('Failed to update reaction')
    }
  }

  const handleMouseEnterReactions = () => {
    if (reactionTimeoutRef.current) {
      clearTimeout(reactionTimeoutRef.current)
    }
    setShowQuickReactions(true)
  }

  const handleMouseLeaveReactions = () => {
    reactionTimeoutRef.current = setTimeout(() => {
      setShowQuickReactions(false)
    }, 300)
  }

  useEffect(() => {
    return () => {
      if (reactionTimeoutRef.current) {
        clearTimeout(reactionTimeoutRef.current)
      }
    }
  }, [])

  const handleReactionSelect = (emojiData: EmojiClickData) => {
    void reactToMessage(emojiData.emoji)
    setShowReactionPicker(false)
  }

  const retryFailedMessage = async () => {
    if (!onRetryFailed || retryingFailedMessage) return

    setRetryingFailedMessage(true)
    try {
      const sent = await onRetryFailed(message.id)
      if (sent) {
        toast.success('Message sent')
      }
    } catch {
      toast.error('Still failed to send')
    } finally {
      setRetryingFailedMessage(false)
    }
  }

  const discardFailedMessage = () => {
    onDiscardFailed?.(message.id)
  }

  const actions: ChatMessageAction[] = [
    {
      id: 'retry',
      label: retryingFailedMessage ? 'Retrying' : 'Retry',
      icon: RefreshCw,
      hidden: !isFailedLocalMessage || !onRetryFailed,
      onSelect: () => void retryFailedMessage(),
    },
    {
      id: 'discard-failed',
      label: 'Discard',
      icon: XCircle,
      tone: 'danger',
      hidden: !isFailedLocalMessage || !onDiscardFailed,
      onSelect: discardFailedMessage,
    },
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
      hidden: isLocalDelivery,
      onSelect: () => setShowReactionPicker(true),
    },
    {
      id: 'reply',
      label: 'Reply',
      icon: Reply,
      hidden: !onReply || isLocalDelivery,
      onSelect: () => onReply?.(message),
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: Edit3,
      hidden: !isOwn || isLocalDelivery,
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
      hidden: !isOwn || isLocalDelivery,
      onSelect: deleteMessage,
    },
  ]

  return (
    <div
      id={`dm-message-${message.id}`}
      data-dm-message-row="true"
      data-message-id={message.id}
      className={`group flex ${isOwn ? 'justify-end' : 'justify-start'} ${isGrouped ? 'mt-1' : 'mt-4'}`}
    >
      <div
        className={`relative ${
          isIncoming
            ? 'ml-4 max-w-[calc(85%_-_1rem)] sm:max-w-[calc(20rem_-_1rem)] lg:max-w-[calc(28rem_-_1rem)]'
            : 'max-w-[85%] sm:max-w-xs lg:max-w-md'
        }`}
      >
        {showIncomingAvatar && (
          message.sender ? (
            <button
              type="button"
              onClick={() => onOpenProfile(message.sender ?? null)}
              className="absolute left-0 top-0 z-10 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
              aria-label={`Open ${message.sender.display_name || message.sender.username}'s profile`}
              aria-haspopup="dialog"
            >
              <Avatar
                src={message.sender?.avatar_thumbnail_url || message.sender?.avatar_url}
                alt={message.sender?.display_name || 'Unknown User'}
                size="sm"
                color={message.sender?.color}
                userId={message.sender?.id}
                presenceVisibility={message.sender?.presence_visibility}
                showStatus
                loading={avatarLoading}
                fetchPriority={avatarFetchPriority}
              />
            </button>
          ) : (
            <Avatar
              alt="Unknown User"
              size="sm"
              className="absolute left-0 top-0 z-10"
            />
          )
        )}

        {showIncomingAvatar && message.sender && (
          <div className="mb-1 ml-8 inline-flex max-w-full items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
            <span className="truncate">{message.sender.display_name}</span>
            <UserRoleBadge role={message.sender.admin_role} />
            <UserAchievementBadges user={message.sender} />
            <UserPresenceBadge userId={message.sender.id} presenceVisibility={message.sender.presence_visibility} />
          </div>
        )}

        <div
          ref={bubbleShellRef}
          className={`relative w-fit max-w-full rounded-2xl ${showIncomingAvatar ? 'ml-8' : ''} ${
            isFloatingMediaMessage ? 'bg-transparent px-0 py-0 shadow-none' : 'px-4 py-2'
          } ${
            bubbleStyle
              ? ''
              : isFloatingMediaMessage
                ? ''
                : isOwn
                ? 'theme-sent-bubble'
                : 'border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-[var(--shadow-panel)]'
          }`}
          style={bubbleStyle}
          onMouseEnter={handleMouseEnterReactions}
          onMouseLeave={handleMouseLeaveReactions}
        >
          {!editing && (
            <ChatMessageActionsMenu
              actions={actions}
              containerRef={containerRef}
              className={`absolute top-0 ${isOwn ? '-left-10' : '-right-10'} opacity-80 md:opacity-0 md:group-hover:opacity-80`}
            />
          )}

          {parentMessage && !editing && (
            <div className="mb-1 flex min-w-0 items-start gap-2 rounded-[var(--radius-sm)] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.035)] px-2.5 py-1.5 text-xs text-[var(--text-muted)]">
              {parentPreviewImageSrc && (
                <button
                  type="button"
                  onClick={() => onJumpToMessage?.(parentMessage.id)}
                  className="shrink-0 rounded-[var(--radius-xs)] focus:outline-none focus:ring-2 focus:ring-[rgba(215,170,70,0.32)]"
                  aria-label="View replied image"
                >
                  <img
                    src={parentPreviewImageSrc}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="h-11 w-11 rounded-[var(--radius-xs)] object-cover"
                  />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onJumpToMessage?.(parentMessage.id)}
                  className="mb-0.5 inline-flex max-w-full min-w-0 items-center gap-1 text-left font-semibold text-[var(--theme-accent-readable)] transition-colors hover:underline"
                  aria-label="View parent message"
                >
                  <span className="truncate">
                    Replying to {parentMessage.sender?.display_name || 'Unknown'}
                  </span>
                </button>
                <div className="min-w-0 whitespace-pre-wrap break-words text-[var(--text-secondary)]">
                  {parentPreview}
                </div>
              </div>
            </div>
          )}

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
          ) : message.message_type === 'audio' ? (
            <audio controls src={message.audio_url} className="mt-1 max-w-full" />
          ) : isImageMessage ? (
            <img
              src={imageMessageSrc}
              alt="uploaded"
              loading="lazy"
              decoding="async"
              draggable={false}
              className="mt-1 block h-auto max-h-[42vh] max-w-[min(10rem,100%)] cursor-pointer rounded-[var(--radius-md)] object-contain shadow-[0_10px_24px_rgba(0,0,0,0.22)] sm:max-w-[11rem]"
              onClick={() => setShowImageModal(true)}
            />
          ) : isVideoMessage ? (
            <VideoAttachment url={videoMessageUrl} meta={message.content} />
          ) : message.message_type === 'file' && message.file_url ? (
            <FileAttachment url={message.file_url} meta={message.content} />
          ) : (
            <MessageRichText content={message.content} className="text-sm" />
          )}

          {!editing && (
            <>
              <NewsReactionSummaryStrip
                reactions={message.reactions}
                onReact={reactToMessage}
                className="mt-1.5"
              />
              <p className={`mt-1 text-xs ${isOwn ? 'text-[var(--theme-accent-readable)]/85' : 'text-[var(--text-muted)]'}`}>
                {formatTime(message.created_at)}
                {message.edited_at && ' (edited)'}
                {isOwn && message.delivery_status && message.delivery_status !== 'sent' && (
                  <span className={message.delivery_status === 'failed' ? 'ml-2 text-red-300' : 'ml-2'}>
                    {message.delivery_status === 'failed' ? 'Failed to send' : 'Sending...'}
                  </span>
                )}
              </p>
              {isFailedLocalMessage && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-red-300">
                  <span>Failed to send</span>
                  {onRetryFailed && (
                    <button
                      type="button"
                      onClick={() => void retryFailedMessage()}
                      disabled={retryingFailedMessage}
                      className="inline-flex items-center gap-1 rounded-full border border-red-300/30 px-2 py-0.5 font-semibold text-red-200 transition-colors hover:border-red-200/50 hover:text-red-100 disabled:cursor-wait disabled:opacity-60"
                    >
                      <RefreshCw className={cn('h-3 w-3', retryingFailedMessage && 'animate-spin')} />
                      <span>{retryingFailedMessage ? 'Retrying' : 'Retry'}</span>
                    </button>
                  )}
                  {onDiscardFailed && (
                    <button
                      type="button"
                      onClick={discardFailedMessage}
                      className="inline-flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.12)] px-2 py-0.5 font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      <XCircle className="h-3 w-3" />
                      <span>Discard</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {!editing && (
            <>
              <div
                className="absolute -top-12 -left-2 -right-2 hidden h-16 group-hover:block"
                onMouseEnter={handleMouseEnterReactions}
                onMouseLeave={handleMouseLeaveReactions}
                onPointerDown={event => {
                  if (event.pointerType !== 'mouse') {
                    handleMouseEnterReactions()
                  }
                }}
              />
              <QuickReactionRail
                open={showQuickReactions && !showReactionPicker && !isLocalDelivery}
                anchorRef={bubbleShellRef}
                reactions={['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F389}', '\u{1F64F}']}
                onReact={reactToMessage}
                onAddReaction={() => setShowReactionPicker(true)}
                onClose={() => setShowQuickReactions(false)}
                onPointerEnter={handleMouseEnterReactions}
                onPointerLeave={handleMouseLeaveReactions}
                normalizeEmoji={normalizeEmojiValue}
              />
            </>
          )}
        </div>

        <EmojiPickerOverlay
          open={showReactionPicker}
          title="Add reaction"
          ariaLabel="DM reaction emoji picker"
          onClose={() => setShowReactionPicker(false)}
          onEmojiClick={handleReactionSelect}
          desktopClassName="fixed left-1/2 top-16 z-[90] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-[var(--radius-md)] sm:absolute sm:bottom-full sm:left-1/2 sm:top-auto sm:mb-2"
        />
      </div>
      <ImageModal
        open={showImageModal}
        src={message.file_url || ''}
        alt="uploaded image"
        onClose={() => setShowImageModal(false)}
      />
    </div>
  )
})

function NewDirectMessagePicker({
  currentView,
  onViewChange,
  users,
  loading,
  query,
  pendingUsername,
  onQueryChange,
  onSelect,
  onCancel,
}: {
  currentView: AppView
  onViewChange: (view: AppView) => void
  users: BasicUser[]
  loading: boolean
  query: string
  pendingUsername: string | null
  onQueryChange: (value: string) => void
  onSelect: (user: BasicUser) => void | Promise<void>
  onCancel: () => void
}) {
  const normalizedQuery = query.trim().toLowerCase()
  const filteredUsers = normalizedQuery
    ? users.filter(user =>
        user.username.toLowerCase().includes(normalizedQuery) ||
        user.display_name.toLowerCase().includes(normalizedQuery)
      )
    : users

  return (
    <div className="theme-image-surface flex h-full min-h-0 flex-col">
      <MobileAppHeader
        currentView={currentView}
        onViewChange={onViewChange}
        title="New Message"
        eyebrow="Direct Messages"
        onBack={onCancel}
        backLabel="Back to direct messages"
      />
      <div className="border-b border-[var(--border-panel)] px-4 py-4 sm:px-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Search people"
            autoFocus
            className="h-12 rounded-2xl pl-10 text-base"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-[calc(env(safe-area-inset-bottom)_+_5rem)] sm:px-5 md:pb-3">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
            <LoadingSpinner size="sm" />
            Loading people...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="glass-panel mt-4 rounded-[var(--radius-xl)] px-5 py-7 text-center text-[var(--text-muted)]">
            <MessageSquare className="mx-auto mb-3 h-9 w-9 opacity-50" />
            <p className="font-medium text-[var(--text-primary)]">
              {normalizedQuery ? 'No matching people' : 'No new people to message'}
            </p>
            <p className="mt-1 text-sm">
              {normalizedQuery
                ? 'Try another name or username.'
                : 'You already have conversations with everyone available.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 pb-[calc(env(safe-area-inset-bottom)_+_1rem)]">
            <div className="px-1 pb-1 text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {filteredUsers.length} available
            </div>
            {filteredUsers.map(user => {
              const isPending = pendingUsername === user.username

              return (
                <button
                  key={user.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => void onSelect(user)}
                  className="glass-panel flex w-full items-center gap-3 rounded-[var(--radius-lg)] px-3.5 py-3 text-left transition-[border-color,background-color,transform] duration-[var(--dur-fast)] hover:border-[var(--border-glow)] hover:bg-[var(--theme-surface-hover)] disabled:cursor-wait disabled:opacity-70"
                >
                  <Avatar
                    src={user.avatar_thumbnail_url || user.avatar_url}
                    alt={user.display_name}
                    size="md"
                    color={user.color}
                    userId={user.id}
                    presenceVisibility={user.presence_visibility}
                    showStatus
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-semibold text-[var(--text-primary)]">
                        {user.display_name}
                      </span>
                      <UserRoleBadge role={user.admin_role} />
                      <UserAchievementBadges user={user} />
                      <UserPresenceBadge userId={user.id} presenceVisibility={user.presence_visibility} />
                    </div>
                    <p className="truncate text-sm text-[var(--text-muted)]">
                      @{user.username}
                    </p>
                  </div>
                  <span className="theme-accent-chip shrink-0 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.12em]">
                    {isPending ? 'Opening' : 'Message'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export const DirectMessagesView: React.FC<DirectMessagesViewProps> = ({
  onToggleSidebar: _onToggleSidebar,
  currentView,
  onViewChange,
  initialConversation,
  initialMessageId,
}) => {
  const { profile } = useAuth()
  const isDesktop = useIsDesktop()
  const {
    conversations,
    currentConversation,
    messages,
    messagesConversationId,
    setCurrentConversation,
    startConversation,
    sendMessage,
    retryFailedMessage,
    discardFailedMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    markAsRead,
    messagesLoading,
    sending,
    loadOlderMessages,
    loadingMore,
    hasMore,
    loading: conversationsLoading,
  } = useDirectMessages()
  const [showNewConversation, setShowNewConversation] = useState(false)
  const { users: allUsers, loading: allUsersLoading } = useAllUsers({ enabled: showNewConversation })
  const currentConv = conversations.find(c => c.id === currentConversation)
  const selectedConversationMissing = Boolean(currentConversation && !currentConv)
  const showInboxLoading = conversationsLoading && conversations.length === 0
  const showInboxEmpty = !conversationsLoading && conversations.length === 0
  const selectedThreadLoaded = Boolean(currentConversation && messagesConversationId === currentConversation)
  const showThreadInitialLoading = (!selectedThreadLoaded || messagesLoading) && messages.length === 0
  const showThreadEmpty = selectedThreadLoaded && !messagesLoading && messages.length === 0 && !loadingMore

  const [searchUsername, setSearchUsername] = useState('')
  const [startingUsername, setStartingUsername] = useState<string | null>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const prevHeightRef = useRef(0)
  const prevScrollTopRef = useRef(0)
  const olderLoadInFlightRef = useRef(false)
  const lastHistoryRequestAtRef = useRef(0)
  const historyRetryTimerRef = useRef<number | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const initialConversationAppliedRef = useRef<string | null>(null)
  const initialTargetJumpDoneRef = useRef<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  const [profileUser, setProfileUser] = useState<User | null>(null)
  const { typingUsers } = useTyping(currentConversation ? `dm-${currentConversation}` : 'none')
  const {
    cursor,
    loading: cursorLoading,
    markRead,
  } = useReadCursor('dm', currentConversation, Boolean(profile?.id && currentConversation))

  useEffect(() => {
    if (initialConversation && initialConversationAppliedRef.current !== initialConversation) {
      initialConversationAppliedRef.current = initialConversation
      if (currentConversation === initialConversation) {
        return
      }
      setCurrentConversation(initialConversation)
    }
  }, [initialConversation, currentConversation, setCurrentConversation])

  useEffect(() => {
    if (isDesktop || conversationsLoading || !selectedConversationMissing) {
      return
    }

    setCurrentConversation(null)
  }, [conversationsLoading, isDesktop, selectedConversationMissing, setCurrentConversation])

  useEffect(() => {
    if (!isDesktop || initialConversation || currentConversation || conversations.length === 0) {
      return
    }

    setCurrentConversation(conversations[0].id)
  }, [conversations, currentConversation, initialConversation, isDesktop, setCurrentConversation])

  const handleConversationSelect = useCallback((conversationId: string) => {
    setCurrentConversation(conversationId)
  }, [setCurrentConversation])

  const handleUserSelect = useCallback(async (user: { username: string }) => {
    const normalizedUsername = user.username.trim().toLowerCase()
    const existingConversation = conversations.find(
      conversation => conversation.other_user?.username?.toLowerCase() === normalizedUsername
    )

    if (existingConversation) {
      handleConversationSelect(existingConversation.id)
      setShowNewConversation(false)
      setSearchUsername('')
      toast.success(`Opened @${user.username}`)
      return
    }

    try {
      setStartingUsername(user.username)
      const conversationId = await startConversation(user.username)
      if (conversationId) {
        setCurrentConversation(conversationId)
        setShowNewConversation(false)
        setSearchUsername('')
        toast.success(`Opened @${user.username}`)
      }
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Failed to start conversation')
    } finally {
      setStartingUsername(null)
    }
  }, [conversations, handleConversationSelect, setCurrentConversation, startConversation])

  const handleSendMessage = useCallback(async (
    content: string,
    type?: ChatMessageType,
    fileUrl?: string,
    replyToId?: string,
    thumbnailUrl?: string | null
  ) => {
    try {
      const sent = await sendMessage(content, type, fileUrl, replyToId, thumbnailUrl)
      if (sent) {
        setReplyTo(null)
      }
      return sent
    } catch (error) {
      console.error(error)
      toast.error('Failed to send message')
      return null
    }
  }, [sendMessage])

  const handleReply = useCallback((message: DMMessage) => {
    setReplyTo(messageToReplyTarget(message))
  }, [])

  const getUnreadDMMessages = useCallback(
    (items: DMMessage[]) => {
      if (!profile?.id) return []
      return items.filter(
        message =>
          message.sender_id !== profile.id &&
          !(message.read_by ?? []).includes(profile.id)
      )
    },
    [profile?.id]
  )

  const markDMReadToLatest = useCallback(
    async (message: DMMessage) => {
      if (!currentConversation) return
      await Promise.all([
        markRead(message.id, message.created_at),
        markAsRead(currentConversation),
      ])
    },
    [currentConversation, markAsRead, markRead]
  )
  const getDMMessageId = useCallback((message: DMMessage) => message.id, [])
  const getDMMessageCreatedAt = useCallback((message: DMMessage) => message.created_at, [])
  const getDMMessageElementId = useCallback((id: string) => `dm-message-${id}`, [])

  const {
    autoScroll,
    firstUnreadMessageId: firstUnreadDMMessageId,
    setAutoScroll,
    setFirstUnreadMessageId,
    handleUnreadScroll,
    scrollToBottom,
    markLatestRead,
  } = useUnreadScroll<DMMessage>({
    containerRef: messagesRef,
    messages,
    loading: messagesLoading,
    cursor,
    cursorLoading,
    enabled: Boolean(profile?.id && currentConversation),
    surfaceKey: `dm:${currentConversation || 'none'}`,
    initialMessageId,
    getMessageId: getDMMessageId,
    getMessageCreatedAt: getDMMessageCreatedAt,
    getElementId: getDMMessageElementId,
    getUnreadMessages: getUnreadDMMessages,
    onMarkReadToLatest: markDMReadToLatest,
  })

  const clearHistoryRetry = useCallback(() => {
    if (historyRetryTimerRef.current !== null) {
      window.clearTimeout(historyRetryTimerRef.current)
      historyRetryTimerRef.current = null
    }
  }, [])

  const requestOlderMessages = useCallback(() => {
    const el = messagesRef.current
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
          const retryEl = messagesRef.current
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
      const el = messagesRef.current
      if (!el) return

      handleUnreadScroll()

      if (el.scrollTop <= HISTORY_LOAD_SCROLL_THRESHOLD) {
        requestOlderMessages()
      }
    })
  }, [handleUnreadScroll, requestOlderMessages])

  useEffect(() => {
    initialTargetJumpDoneRef.current = null
    setReplyTo(null)
  }, [currentConversation])

  useEffect(() => {
    const el = messagesRef.current
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
    if (autoScroll && typingUsers.length > 0) {
      scrollToBottom('auto')
    }
  }, [autoScroll, scrollToBottom, typingUsers.length])

  useEffect(() => {
    if (isDesktop || !currentConversation) return

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
  }, [autoScroll, currentConversation, isDesktop, messages.length, scrollToBottom])

  useEffect(() => {
    if (
      !initialMessageId ||
      initialTargetJumpDoneRef.current === initialMessageId ||
      messages.length === 0
    ) {
      return
    }

    const target = messages.find(message => message.id === initialMessageId)
    if (!target) {
      return
    }

    initialTargetJumpDoneRef.current = initialMessageId
    setFirstUnreadMessageId(null)
    setAutoScroll(false)

    requestAnimationFrame(() => {
      const el = document.getElementById(`dm-message-${initialMessageId}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-[rgba(34,197,94,0.55)]')
      void markLatestRead(false)
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[rgba(34,197,94,0.55)]')
      }, 2200)
    })
  }, [initialMessageId, markLatestRead, messages, setAutoScroll, setFirstUnreadMessageId])

  const dmMessageMap = useMemo(() => {
    const map = new Map<string, DMMessage>()
    messages.forEach(message => map.set(message.id, message))
    return map
  }, [messages])

  const jumpToDMMessage = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`dm-message-${id}`)
      if (!el) return

      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-[rgba(34,197,94,0.55)]')
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[rgba(34,197,94,0.55)]')
      }, 2000)
    })
  }, [])

  const eagerDMAvatarMessageIds = useMemo(() => (
    new Set(messages.slice(-12).map(message => message.id))
  ), [messages])
  const showConversationList = isDesktop || !currentConversation
  const existingConversationUserIds = useMemo(
    () => new Set(conversations.map(conversation => conversation.other_user?.id).filter(Boolean) as string[]),
    [conversations]
  )
  const availableDmUsers = useMemo(
    () => allUsers
      .filter(user =>
        user.id !== profile?.id &&
        user.dm_discoverable !== false &&
        !existingConversationUserIds.has(user.id)
      )
      .sort((left, right) =>
        (left.display_name || left.username).localeCompare(right.display_name || right.username)
      ),
    [allUsers, existingConversationUserIds, profile?.id]
  )

  return (
    <div className="theme-image-surface flex h-full min-h-0">
      <motion.div
        initial={false}
        className={`theme-image-surface relative flex-shrink-0 w-full border-r border-[var(--border-panel)] lg:w-[22rem] ${
          showConversationList ? 'flex' : 'hidden lg:flex'
        } flex-col`}
      >
        {showNewConversation ? (
          <NewDirectMessagePicker
            currentView={currentView}
            onViewChange={onViewChange}
            users={availableDmUsers}
            loading={allUsersLoading}
            query={searchUsername}
            pendingUsername={startingUsername}
            onQueryChange={setSearchUsername}
            onSelect={handleUserSelect}
            onCancel={() => {
              setShowNewConversation(false)
              setSearchUsername('')
            }}
          />
        ) : (
          <>
            <MobileAppHeader
              currentView={currentView}
              onViewChange={onViewChange}
              title="DM"
              logo
            />
            <Button
              size="sm"
              onClick={() => setShowNewConversation(true)}
              className="theme-floating-action absolute right-3 top-[calc(env(safe-area-inset-top)_+_3.85rem)] z-40 h-11 w-11 rounded-full p-0 md:right-4"
              aria-label="Start new conversation"
            >
              <Plus className="h-5 w-5" />
            </Button>

            <div className="min-h-0 flex-1 overflow-y-auto pt-14 pb-[calc(env(safe-area-inset-bottom)_+_5rem)] md:pb-0 md:pt-0">
              {showInboxLoading ? (
                <div className="p-6 text-center text-[var(--text-muted)]">
                  <LoadingSpinner size="md" className="mx-auto mb-3" />
                  <p className="text-sm text-[var(--text-primary)]">Loading direct messages</p>
                  <p className="mt-1 text-xs">Restoring your inbox.</p>
                </div>
              ) : showInboxEmpty ? (
                <div className="p-6 text-center text-[var(--text-muted)]">
                  <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm text-[var(--text-primary)]">No conversations yet</p>
                  <p className="mt-1 text-xs">Start a private chat to build your inbox.</p>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {conversations.map((conversation, index) => {
                    const unreadCount = conversation.unread_count || 0
                    const eagerConversationAvatar = index < 12

                    return (
                    <motion.button
                      key={conversation.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      type="button"
                      onClick={() => handleConversationSelect(conversation.id)}
                      className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors duration-[var(--dur-med)] ${
                        currentConversation === conversation.id
                          ? 'theme-selected-row'
                          : 'border-transparent hover:border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.03)]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar
                          src={conversation.other_user?.avatar_thumbnail_url || conversation.other_user?.avatar_url}
                          alt={conversation.other_user?.display_name || 'Unknown User'}
                          size="md"
                          color={conversation.other_user?.color}
                          userId={conversation.other_user?.id}
                          presenceVisibility={conversation.other_user?.presence_visibility}
                          showStatus
                          loading={eagerConversationAvatar ? 'eager' : 'lazy'}
                          fetchPriority={eagerConversationAvatar ? 'high' : undefined}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-[var(--text-primary)]">
                              <span className="truncate">{conversation.other_user?.display_name}</span>
                              <UserRoleBadge role={conversation.other_user?.admin_role} />
                              <UserAchievementBadges user={conversation.other_user} />
                              <UserPresenceBadge userId={conversation.other_user?.id} presenceVisibility={conversation.other_user?.presence_visibility} />
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="truncate text-xs text-[var(--text-muted)]">
                              @{conversation.other_user?.username}
                            </span>
                          </div>

                          {conversation.last_message && (
                            <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">
                              {conversation.last_message.content}
                            </p>
                          )}
                        </div>

                        <div className="ml-auto flex min-w-[3.5rem] shrink-0 flex-col items-end gap-2 text-right">
                          {conversation.last_message && (
                            <span className="text-xs text-[var(--text-muted)]">
                              {formatTime(conversation.last_message.created_at)}
                            </span>
                          )}
                          {unreadCount > 0 && (
                            <span className="theme-unread-badge inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>

      <div className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${currentConversation ? 'flex' : 'hidden lg:flex'}`}>
        {currentConversation && currentConv ? (
          <>
            <MobileAppHeader
              currentView={currentView}
              onViewChange={onViewChange}
              title={currentConv.other_user?.display_name || 'Direct Message'}
              avatar={{
                src: currentConv.other_user?.avatar_thumbnail_url || currentConv.other_user?.avatar_url,
                alt: currentConv.other_user?.display_name || 'Unknown User',
                color: currentConv.other_user?.color,
                userId: currentConv.other_user?.id,
                presenceVisibility: currentConv.other_user?.presence_visibility,
              }}
              onBack={() => setCurrentConversation(null)}
              backLabel="Back to direct messages"
              collapseOnKeyboard
              maxWidthClassName="max-w-4xl"
            />

            <div
              ref={messagesRef}
              onScroll={handleScroll}
              data-testid="dm-message-scroll"
              className="relative flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden px-4 pb-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-mobile-scroll-keyboard-inset,0px)_+_0.75rem)] pt-4 md:pb-[calc(env(safe-area-inset-bottom)_+_6rem)]"
            >
              <div data-testid="dm-message-stack" className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-end space-y-3">
              {loadingMore && (
                <div className="flex justify-center py-2 text-sm text-[var(--text-muted)]">
                  <LoadingSpinner size="sm" /> Loading more...
                </div>
              )}

              {showThreadInitialLoading && (
                <div className="glass-panel rounded-[var(--radius-xl)] px-8 py-8 text-center text-[var(--text-muted)]">
                  <LoadingSpinner size="md" className="mx-auto mb-4" />
                  <h3 className="mb-2 text-lg font-medium text-[var(--text-primary)]">Loading messages</h3>
                  <p className="text-sm">Restoring this thread before showing the latest conversation state.</p>
                </div>
              )}

              {showThreadEmpty && (
                <div className="glass-panel rounded-[var(--radius-xl)] px-8 py-8 text-center text-[var(--text-muted)]">
                  <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <h3 className="mb-2 inline-flex max-w-full items-center justify-center gap-1.5 text-lg font-medium text-[var(--text-primary)]">
                    <span className="truncate">Say hello to {currentConv.other_user?.display_name}</span>
                    <UserRoleBadge role={currentConv.other_user?.admin_role} />
                    <UserAchievementBadges user={currentConv.other_user} />
                    <UserPresenceBadge userId={currentConv.other_user?.id} presenceVisibility={currentConv.other_user?.presence_visibility} />
                  </h3>
                  <p className="text-sm">This thread is ready. Send the first message and the conversation will show up here immediately.</p>
                </div>
              )}

              {messages.map((message, index) => (
                <React.Fragment key={message.id}>
                  {firstUnreadDMMessageId === message.id && (
                    <UnreadDivider />
                  )}
                  <DirectMessageBubble
                    message={message}
                    previousMessage={messages[index - 1]}
                    parentMessage={dmMessageMap.get(message.reply_to ?? '')}
                    currentUserId={profile?.id ?? null}
                    onReply={handleReply}
                    onEdit={editMessage}
                    onDelete={deleteMessage}
                    onReact={toggleReaction}
                    onRetryFailed={retryFailedMessage}
                    onDiscardFailed={discardFailedMessage}
                    onJumpToMessage={jumpToDMMessage}
                    onOpenProfile={setProfileUser}
                    containerRef={messagesRef}
                    avatarLoading={eagerDMAvatarMessageIds.has(message.id) ? 'eager' : 'lazy'}
                    avatarFetchPriority={eagerDMAvatarMessageIds.has(message.id) ? 'high' : undefined}
                  />
                </React.Fragment>
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
                      <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--theme-accent)]" style={{ animationDelay: '0.1s' }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--theme-accent)]" style={{ animationDelay: '0.2s' }} />
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
                  onClick={() => scrollToBottom()}
                  aria-label="Jump to latest"
                  className="theme-floating-action fixed right-4 bottom-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-keyboard-inset,0px)_+_0.5rem)] z-50 rounded-full p-2 transition-transform hover:-translate-y-0.5 md:bottom-32"
                >
                  <ArrowDown className="w-5 h-5" />
                </button>
              )}
              </div>
            </div>

            <div className="hidden md:block">
              <div className="mx-auto w-full max-w-4xl">
                <MessageInput
                  onSendMessage={handleSendMessage}
                  placeholder="Message..."
                  disabled={sending || uploading}
                  cacheKey={`dm-${currentConversation}`}
                  onUploadStatusChange={setUploading}
                  messages={messages}
                  replyingTo={replyTo || undefined}
                  onCancelReply={() => setReplyTo(null)}
                  typingChannel={`dm-${currentConversation}`}
                  enableGifPicker
                />
              </div>
            </div>

            <MobileChatFooter
              currentView={currentView}
              onViewChange={onViewChange}
            >
              <MessageInput
                onSendMessage={handleSendMessage}
                placeholder="Message..."
                disabled={sending || uploading}
                className="border-t border-[var(--border-panel)]"
                cacheKey={`dm-${currentConversation}`}
                onUploadStatusChange={setUploading}
                messages={messages}
                replyingTo={replyTo || undefined}
                onCancelReply={() => setReplyTo(null)}
                typingChannel={`dm-${currentConversation}`}
                enableGifPicker
              />
            </MobileChatFooter>
          </>
        ) : currentConversation ? (
          <>
            <MobileAppHeader
              currentView={currentView}
              onViewChange={onViewChange}
              title="Direct Message"
              onBack={() => setCurrentConversation(null)}
              backLabel="Back to direct messages"
              collapseOnKeyboard
              maxWidthClassName="max-w-4xl"
            />
            <div className="flex flex-1 items-center justify-center px-4">
              <div className="glass-panel max-w-md rounded-[var(--radius-xl)] px-8 py-8 text-center text-[var(--text-muted)]">
                {conversationsLoading ? (
                  <>
                    <LoadingSpinner size="md" className="mx-auto mb-4" />
                    <h3 className="mb-2 text-lg font-medium text-[var(--text-primary)]">Restoring direct message</h3>
                    <p className="text-sm">Reconnecting to the inbox after the app resumed.</p>
                  </>
                ) : (
                  <>
                    <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
                    <h3 className="mb-2 text-lg font-medium text-[var(--text-primary)]">Conversation unavailable</h3>
                    <p className="text-sm">Return to the inbox and choose a thread again.</p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-5"
                      onClick={() => setCurrentConversation(null)}
                    >
                      Back to inbox
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="glass-panel max-w-md rounded-[var(--radius-xl)] px-8 py-8 text-center text-[var(--text-muted)]">
              <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <h3 className="mb-2 text-lg font-medium text-[var(--text-primary)]">Select a conversation</h3>
              <p className="text-sm">Choose a thread on the left or start a new one to jump straight into chat.</p>
            </div>
          </div>
        )}
      </div>
      {profileUser && (
        <React.Suspense fallback={null}>
          <PublicProfileDialog
            user={profileUser}
            open
            onClose={() => setProfileUser(null)}
          />
        </React.Suspense>
      )}
      {!isDesktop && !currentConversation && (
        <MobileNav currentView={currentView} onViewChange={onViewChange} />
      )}
    </div>
  )
}
