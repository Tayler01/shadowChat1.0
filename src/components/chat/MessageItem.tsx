import React, { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Pin,
  PinOff,
  Edit3,
  Trash2,
  Reply,
  Plus,
  Copy,
  Check,
  RefreshCw,
  XCircle,
  PartyPopper,
} from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { ImageModal } from '../ui/ImageModal'
import { Button } from '../ui/Button'
import { FileAttachment } from './FileAttachment'
import { VideoAttachment } from './VideoAttachment'
import { MessageRichText } from './MessageRichText'
import { ChatMessageActionsMenu, type ChatMessageAction } from './ChatMessageActionsMenu'
import { UserRoleBadge } from '../ui/UserRoleBadge'
import { UserPresenceBadge } from '../ui/UserPresenceBadge'
import { UserAchievementBadges } from '../ui/UserAchievementBadges'
import { formatTime, shouldGroupMessage, cn, getReadableTextColor } from '../../lib/utils'
import type { Message, User } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'
import type { EmojiClickData } from '../../types'
import { useToneAnalysis } from '../../hooks/useToneAnalysis'
import { useToneAnalysisEnabled } from '../../hooks/useToneAnalysisEnabled'
import { getBlockedActionMessage, type ChannelBanScope } from '../../lib/moderation'
import { showActionErrorToast } from '../../lib/toastNotifications'
import { EmojiPickerOverlay } from './EmojiPickerOverlay'
import { QuickReactionRail } from './QuickReactionRail'
import { useOptionalHype } from '../../hooks/useHype'
import { getHypeTier } from '../../lib/hypePresentation'
import { MessageHypeBadge } from './MessageHypeBadge'
import {
  CHAT_MEDIA_INTRINSIC_HEIGHT,
  CHAT_MEDIA_INTRINSIC_WIDTH,
  getChatMediaAspectClass,
  getChatMediaOrientation,
  getImageMessageDisplaySrc,
  getMessagePreviewText,
  type ChatMediaOrientation,
} from './messageDisplay'

interface MessageItemProps {
  message: Message
  previousMessage?: Message
  parentMessage?: Message
  onReply?: (message: Message) => void
  onEdit: (messageId: string, content: string) => Promise<void>
  onDelete: (messageId: string) => Promise<void>
  onTogglePin: (messageId: string) => Promise<void>
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>
  onRetryFailed?: (messageId: string) => Promise<Message | null>
  onDiscardFailed?: (messageId: string) => void
  onJumpToMessage?: (messageId: string) => void
  containerRef?: React.RefObject<HTMLDivElement>
  avatarLoading?: 'eager' | 'lazy'
  avatarFetchPriority?: 'high' | 'low' | 'auto'
  moderationScope?: ChannelBanScope
}

const PublicProfileDialog = lazy(() =>
  import('../profile/PublicProfileDialog').then(module => ({
    default: module.PublicProfileDialog,
  }))
)

const getToneEmoji = (tone: string) => {
  if (tone === 'positive') return '\u{1F60A}'
  if (tone === 'negative') return '\u2639\uFE0F'
  return '\u{1F610}'
}

const normalizeEmojiValue = (emoji: string) => {
  const value = emoji.trim()

  if (value === '??' || value === '??1') return '\u{1F44D}'

  return value
}

const shouldCollapseReplyPreview = (content: string) =>
  content.length > 160 || content.split(/\r?\n/).length > 3

function ReplyContextPreview({
  parentMessage,
  content,
  onJumpToMessage,
}: {
  parentMessage: Message
  content: string
  onJumpToMessage?: (messageId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = shouldCollapseReplyPreview(content)
  const hypeCount = parentMessage.hype_count ?? 0
  const hypeTier = getHypeTier(hypeCount)
  const previewImageSrc = parentMessage.message_type === 'image'
    ? getImageMessageDisplaySrc(parentMessage.file_url, parentMessage.thumbnail_url)
    : ''

  return (
    <div className="mb-1 flex min-w-0 items-start gap-2 pl-1 text-xs text-[var(--text-muted)]">
      <span
        aria-hidden="true"
        className="mt-0.5 h-5 w-4 shrink-0 rounded-bl-[0.45rem] border-b border-l border-[var(--theme-accent-border-soft)]"
      />
      <div
        className={cn(
          'min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.035)] px-2.5 py-1.5',
          hypeTier > 0 && 'hype-message-shell hype-message-bubble'
        )}
        data-hype-tier={hypeTier || undefined}
      >
        <MessageHypeBadge count={hypeCount} users={parentMessage.hype_users ?? []} className="float-right ml-2" />
        <button
          type="button"
          onClick={() => onJumpToMessage?.(parentMessage.id)}
          className="mb-1 inline-flex max-w-full min-w-0 items-center gap-1 text-left transition-colors hover:text-[var(--theme-accent-readable)] hover:underline"
          aria-label="View parent message"
        >
          <span className="truncate">Replying to {parentMessage.user?.display_name || 'Unknown'}</span>
          <UserRoleBadge role={parentMessage.user?.admin_role} className="shrink-0" />
          <UserAchievementBadges user={parentMessage.user} className="shrink-0" />
          <UserPresenceBadge userId={parentMessage.user?.id} presenceVisibility={parentMessage.user?.presence_visibility} className="shrink-0" />
        </button>
        <div className="flex min-w-0 items-start gap-2">
          {previewImageSrc && (
            <button
              type="button"
              onClick={() => onJumpToMessage?.(parentMessage.id)}
              className="shrink-0 rounded-[var(--radius-xs)] focus:outline-none focus:ring-2 focus:ring-[rgba(215,170,70,0.32)]"
              aria-label="View replied image"
            >
              <img
                src={previewImageSrc}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="h-12 w-12 rounded-[var(--radius-xs)] object-cover"
              />
            </button>
          )}
          <div
            className={cn(
              'min-w-0 flex-1 whitespace-pre-wrap break-words text-[var(--text-secondary)]',
              collapsible && !expanded && 'line-clamp-3'
            )}
            data-testid="reply-parent-preview"
          >
            {content}
          </div>
        </div>
        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded(current => !current)}
            className="mt-1 text-[0.7rem] font-semibold text-[var(--theme-accent-readable)]"
            aria-expanded={expanded}
          >
            {expanded ? 'Show less' : 'Show full message'}
          </button>
        )}
      </div>
    </div>
  )
}

export const MessageItem: React.FC<MessageItemProps> = React.memo(
  ({
    message,
    previousMessage,
    parentMessage,
    onReply,
    onEdit,
    onDelete,
    onTogglePin,
    onToggleReaction,
    onRetryFailed,
    onDiscardFailed,
    onJumpToMessage,
    containerRef,
    avatarLoading = 'lazy',
    avatarFetchPriority,
    moderationScope = 'general_chat',
  }) => {
    const { profile } = useAuth()
    const hype = useOptionalHype()
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState(message.content)
    const [showReactionPicker, setShowReactionPicker] = useState(false)
    const [showImageModal, setShowImageModal] = useState(false)
    const [retryingFailedMessage, setRetryingFailedMessage] = useState(false)
    const bubbleShellRef = useRef<HTMLDivElement>(null)
    const [showQuickReactions, setShowQuickReactions] = useState(false)
    const [profileUser, setProfileUser] = useState<User | null>(null)
    const [imageOrientation, setImageOrientation] = useState<ChatMediaOrientation>('portrait')
    const reactionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const { enabled: toneEnabled } = useToneAnalysisEnabled()
    const analyzeTone = useToneAnalysis(toneEnabled)

    const isGrouped = shouldGroupMessage(message, previousMessage)
    const isOwner = profile?.id === message.user_id
    const isOperator = profile?.admin_role === 'admin' || profile?.admin_role === 'sub_admin'
    const isAuthorOperator = message.user?.admin_role === 'admin' || message.user?.admin_role === 'sub_admin'
    const isLocalDelivery = message.optimistic || message.delivery_status === 'sending' || message.delivery_status === 'failed'
    const isFailedLocalMessage = isOwner && message.delivery_status === 'failed'
    const canDelete = isOwner || (isOperator && Boolean(message.user) && !isAuthorOperator)
    const isShadoAI = message.user?.username === 'shado_ai'
    const isAIMessage = isShadoAI || message.message_type === 'command'
    const isImageMessage = message.message_type === 'image' && Boolean(message.file_url)
    const isVideoMessage = message.message_type === 'video' && Boolean(message.file_url)
    const isFloatingMediaMessage = isImageMessage || isVideoMessage
    const videoMessageUrl = isVideoMessage ? message.file_url || '' : ''
    const imageMessageSrc = getImageMessageDisplaySrc(message.file_url, message.thumbnail_url)
    const parentPreview = parentMessage
      ? getMessagePreviewText(parentMessage)
      : ''
    const hypeCount = message.hype_count ?? 0
    const hypeTier = getHypeTier(hypeCount)
    const hypeUsers = message.hype_users ?? []
    const hasCurrentUserHyped = hypeUsers.some(user => user.user_id === profile?.id)
    const usesMediaHypeFrame = isFloatingMediaMessage && hypeTier > 0
    const usesBubbleHypeFrame = !isFloatingMediaMessage && hypeTier > 0
    const avatarSrc = isShadoAI
      ? message.user?.avatar_thumbnail_url || message.user?.avatar_url || '/icons/app-icon-192.png'
      : message.user?.avatar_thumbnail_url || message.user?.avatar_url

    const bubbleColor = undefined
    const bubbleStyle = bubbleColor
      ? { backgroundColor: bubbleColor, color: getReadableTextColor(bubbleColor) }
      : undefined
    const { tone } = toneEnabled ? analyzeTone(message.content) : { tone: 'neutral' }

    const handleMouseEnterReactions = () => {
      if (reactionTimeoutRef.current) {
        clearTimeout(reactionTimeoutRef.current)
      }
      setShowQuickReactions(true)
    }

    const handleMouseLeaveReactions = () => {
      reactionTimeoutRef.current = setTimeout(() => {
        setShowQuickReactions(false)
      }, 300) // 300ms delay
    }

    useEffect(() => {
      return () => {
        if (reactionTimeoutRef.current) {
          clearTimeout(reactionTimeoutRef.current)
        }
      }
    }, [])

    useEffect(() => {
      setImageOrientation('portrait')
    }, [imageMessageSrc])

    const handleEditSave = async () => {
      if (!editContent.trim()) return
      await onEdit(message.id, editContent)
      setIsEditing(false)
    }

    const handleReaction = async (emoji: string) => {
      try {
        await onToggleReaction(message.id, emoji)
      } catch (error) {
        const notice = await getBlockedActionMessage(moderationScope, error, 'Failed to update reaction')
        showActionErrorToast(notice)
      }
    }

    const handleReactionSelect = (emojiData: EmojiClickData) => {
      const emoji = emojiData.emoji
      handleReaction(emoji)
      setShowReactionPicker(false)
    }

    const handleCopyMessage = async () => {
      try {
        await navigator.clipboard.writeText(message.content)
        toast.success('Message copied')
      } catch {
        toast.error('Failed to copy message')
      }
    }

    const handlePinToggle = async () => {
      await onTogglePin(message.id)
    }

    const handleHypeMessage = async () => {
      if (!hype) return
      try {
        await hype.hypeMessage(message.id)
      } catch (error) {
        const notice = await getBlockedActionMessage(moderationScope, error, 'Failed to Hype message')
        showActionErrorToast(notice)
      }
    }

    if (message.message_type === 'hype') {
      return (
        <div id={`message-${message.id}`} className="hype-system-event" data-testid="hype-system-event">
          <span>{message.user?.display_name || message.user?.username || 'Someone'} hyped</span>
          <span className="ml-1" aria-hidden="true">{'\u{1F389}'}</span>
          <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{formatTime(message.created_at)}</span>
        </div>
      )
    }

    const handleRetryFailed = async () => {
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

    const handleDiscardFailed = () => {
      onDiscardFailed?.(message.id)
    }

    const messageActions: ChatMessageAction[] = [
      {
        id: 'retry',
        label: retryingFailedMessage ? 'Retrying' : 'Retry',
        icon: RefreshCw,
        hidden: !isFailedLocalMessage || !onRetryFailed,
        onSelect: () => void handleRetryFailed(),
      },
      {
        id: 'discard-failed',
        label: 'Discard',
        icon: XCircle,
        tone: 'danger',
        hidden: !isFailedLocalMessage || !onDiscardFailed,
        onSelect: handleDiscardFailed,
      },
      {
        id: 'copy',
        label: 'Copy',
        icon: Copy,
        onSelect: handleCopyMessage,
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
        id: 'hype',
        label: hype?.hypingMessageIds.has(message.id) ? 'Hyping' : 'Hype',
        icon: PartyPopper,
        hidden: !hype || isOwner || isLocalDelivery || hasCurrentUserHyped || (hype.status !== null && hype.status.remaining <= 0),
        onSelect: () => void handleHypeMessage(),
      },
      {
        id: 'edit',
        label: 'Edit',
        icon: Edit3,
        hidden: !isOwner || isLocalDelivery,
        onSelect: () => {
          setIsEditing(true)
          setEditContent(message.content)
        },
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        tone: 'danger',
        hidden: !canDelete || isLocalDelivery,
        onSelect: () => void onDelete(message.id),
      },
      {
        id: 'pin',
        label: message.pinned ? 'Unpin' : 'Pin',
        icon: message.pinned ? PinOff : Pin,
        hidden: isLocalDelivery,
        onSelect: handlePinToggle,
      },
    ]

    return (
      <>
        <div
          id={`message-${message.id}`}
          className="group relative ml-2 min-w-0 py-1"
        >
        {!isGrouped && (
          <div className="absolute left-0 top-1 z-10">
            {message.user ? (
              <button
                type="button"
                onClick={() => setProfileUser(message.user ?? null)}
                className="rounded-full focus:outline-none focus:ring-2 focus:ring-[rgba(215,170,70,0.32)]"
                aria-label={`Open ${message.user.display_name || message.user.username}'s profile`}
                aria-haspopup="dialog"
              >
                <Avatar
                  src={avatarSrc}
                  alt={message.user?.display_name || 'Unknown User'}
                  size="md"
                  color={message.user?.color}
                  userId={message.user?.id}
                  presenceVisibility={message.user?.presence_visibility}
                  showStatus
                  loading={avatarLoading}
                  fetchPriority={avatarFetchPriority}
                />
              </button>
            ) : (
              <Avatar
                src={avatarSrc}
                alt="Unknown User"
                size="md"
              />
            )}
          </div>
        )}

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          {!isGrouped && (
            <div className="mb-1 flex min-h-8 items-end space-x-2 pl-11">
              <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                <span className="truncate">{message.user?.display_name}</span>
                <UserRoleBadge role={message.user?.admin_role} />
                <UserAchievementBadges user={message.user} />
                <UserPresenceBadge userId={message.user?.id} presenceVisibility={message.user?.presence_visibility} />
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {formatTime(message.created_at)}
              </span>
              {message.edited_at && (
                <span className="text-xs text-[var(--text-muted)]/80">
                  (edited)
                </span>
              )}
              {isOwner && message.delivery_status && message.delivery_status !== 'sent' && (
                <span className={cn(
                  'text-xs',
                  message.delivery_status === 'failed' ? 'text-red-300' : 'text-[var(--text-muted)]/80'
                )}>
                  {message.delivery_status === 'failed' ? 'Failed to send' : 'Sending...'}
                </span>
              )}
            </div>
          )}

          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="obsidian-input w-full resize-none rounded-[var(--radius-md)] p-3 text-base md:text-sm"
                rows={2}
              />
              <div className="flex space-x-2">
                <Button size="sm" onClick={handleEditSave} type="button">
                  <Check className="w-4 h-4 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                  type="button"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div
                ref={bubbleShellRef}
                className={cn(
                  'relative inline-block max-w-[calc(100%-3rem)] group/message md:max-w-full',
                  usesBubbleHypeFrame && 'hype-message-shell'
                )}
                data-hype-tier={hypeTier || undefined}
                data-testid="message-bubble-shell"
                onMouseEnter={handleMouseEnterReactions}
                onMouseLeave={handleMouseLeaveReactions}
              >
                {parentMessage && (
                  <ReplyContextPreview
                    parentMessage={parentMessage}
                    content={parentPreview}
                    onJumpToMessage={onJumpToMessage}
                  />
                )}
                <div
                  className={cn(
                    'relative peer space-y-1 break-words rounded-[var(--radius-md)]',
                    usesBubbleHypeFrame && 'hype-message-bubble',
                    isFloatingMediaMessage
                      ? 'bg-transparent px-0 py-0 text-[var(--text-primary)] shadow-none'
                      : 'px-3 py-2 shadow-[var(--shadow-panel)]',
                    isFloatingMediaMessage
                      ? ''
                      : isAIMessage
                      ? 'border border-[var(--border-glow)] bg-[var(--theme-accent-softer)] text-[var(--text-primary)]'
                      : bubbleStyle
                      ? ''
                      : 'border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)]'
                  )}
                  style={bubbleStyle}
                >
                  {!isFloatingMediaMessage && (
                    <>
                      <MessageHypeBadge count={hypeCount} users={hypeUsers} className="float-right ml-2" />
                      <MessageReactions
                        message={message}
                        onReact={handleReaction}
                        className="text-[0.65rem]"
                      />
                    </>
                  )}
                  {message.message_type === 'audio' ? (
                    <audio controls src={message.audio_url ?? undefined} className="mt-1 max-w-full" />
                  ) : isImageMessage ? (
                    <div
                      data-chat-media-frame="true"
                      data-hype-tier={usesMediaHypeFrame ? hypeTier : undefined}
                      className={cn(
                        'chat-media-frame relative mt-1 inline-block max-w-full rounded-[var(--radius-md)] align-top',
                        usesMediaHypeFrame && 'hype-message-shell chat-media-frame--hyped'
                      )}
                    >
                      <img
                        src={imageMessageSrc}
                        alt="uploaded image"
                        width={CHAT_MEDIA_INTRINSIC_WIDTH}
                        height={CHAT_MEDIA_INTRINSIC_HEIGHT}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        data-chat-media="image"
                        className={cn(
                          'block max-h-[42vh] w-40 max-w-full cursor-pointer rounded-[var(--radius-md)] object-cover shadow-[0_10px_24px_rgba(0,0,0,0.22)] sm:w-44',
                          getChatMediaAspectClass(imageOrientation)
                        )}
                        onLoad={event => {
                          const image = event.currentTarget
                          setImageOrientation(getChatMediaOrientation(image.naturalWidth, image.naturalHeight))
                        }}
                        onClick={() => setShowImageModal(true)}
                      />
                      <div className="chat-media-frame__hype pointer-events-none absolute left-1.5 right-1.5 top-1.5 z-10 flex justify-end">
                        <MessageHypeBadge count={hypeCount} users={hypeUsers} className="pointer-events-auto" />
                      </div>
                      <MessageReactions
                        message={message}
                        onReact={handleReaction}
                        className="chat-media-frame__reactions pointer-events-auto absolute bottom-1.5 right-1.5 z-10 w-auto max-w-[calc(100%-0.75rem)] justify-end text-[0.65rem]"
                      />
                    </div>
                  ) : isVideoMessage ? (
                    <div
                      data-chat-media-frame="true"
                      data-hype-tier={usesMediaHypeFrame ? hypeTier : undefined}
                      className={cn(
                        'chat-media-frame relative mt-1 inline-block max-w-full rounded-[var(--radius-md)] align-top',
                        usesMediaHypeFrame && 'hype-message-shell chat-media-frame--hyped'
                      )}
                    >
                      <VideoAttachment url={videoMessageUrl} meta={message.content} className="mt-0" />
                      <div className="chat-media-frame__hype pointer-events-none absolute left-1.5 right-1.5 top-1.5 z-10 flex justify-end">
                        <MessageHypeBadge count={hypeCount} users={hypeUsers} className="pointer-events-auto" />
                      </div>
                      <MessageReactions
                        message={message}
                        onReact={handleReaction}
                        className="chat-media-frame__reactions pointer-events-auto absolute bottom-1.5 right-1.5 z-10 w-auto max-w-[calc(100%-0.75rem)] justify-end text-[0.65rem]"
                      />
                    </div>
                  ) : message.message_type === 'file' && message.file_url ? (
                    <FileAttachment url={message.file_url} meta={message.content} />
                  ) : (
                    <div className={cn(isAIMessage && 'font-medium')}>
                      <MessageRichText
                        content={message.content}
                      />
                      {toneEnabled && (
                        <span data-testid="tone-indicator" className="ml-1">
                          {getToneEmoji(tone)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Actions */}
                <ChatMessageActionsMenu
                  actions={messageActions}
                  containerRef={containerRef}
                  className="absolute -right-12 -top-2"
                  buttonClassName="md:opacity-0 md:group-hover/message:opacity-70"
                />

                {/* Invisible hover area to trigger reactions */}
                <div 
                  className="absolute -top-12 -left-2 -right-2 h-16 group-hover/message:block hidden"
                  onMouseEnter={handleMouseEnterReactions}
                  onMouseLeave={handleMouseLeaveReactions}
                  onPointerDown={event => {
                    if (event.pointerType !== 'mouse') {
                      handleMouseEnterReactions()
                    }
                  }}
                />
                <QuickReactionRail
                  open={showQuickReactions && !showReactionPicker}
                  anchorRef={bubbleShellRef}
                  reactions={['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F389}', '\u{1F64F}']}
                  onReact={handleReaction}
                  onAddReaction={() => setShowReactionPicker(true)}
                  onClose={() => setShowQuickReactions(false)}
                  onPointerEnter={handleMouseEnterReactions}
                  onPointerLeave={handleMouseLeaveReactions}
                  normalizeEmoji={normalizeEmojiValue}
                />
                <EmojiPickerOverlay
                  open={showReactionPicker}
                  title="Add reaction"
                  ariaLabel="Reaction emoji picker"
                  onClose={() => setShowReactionPicker(false)}
                  onEmojiClick={handleReactionSelect}
                  desktopClassName="fixed left-1/2 top-16 z-[90] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-[var(--radius-md)] sm:absolute sm:bottom-full sm:left-1/2 sm:top-auto sm:mb-2"
                />
              </div>
              {isFailedLocalMessage && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-1 text-xs text-red-300">
                  <span>Failed to send</span>
                  {onRetryFailed && (
                    <button
                      type="button"
                      onClick={() => void handleRetryFailed()}
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
                      onClick={handleDiscardFailed}
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
        </div>
        </div>
        <ImageModal
          open={showImageModal}
          src={message.file_url || ''}
          alt="uploaded image"
          onClose={() => setShowImageModal(false)}
        />
        {profileUser && (
          <Suspense fallback={null}>
            <PublicProfileDialog
              user={profileUser}
              open
              onClose={() => setProfileUser(null)}
            />
          </Suspense>
        )}
      </>
    )
  }
)

MessageItem.displayName = 'MessageItem'

export const MessageReactions = React.memo(function MessageReactions({
  message,
  onReact,
  className = '',
}: {
  message: Message
  onReact: (emoji: string) => void
  className?: string
}) {
  const { profile } = useAuth()
  const reactions: Record<string, { count: number; users: string[] }> = message.reactions || {}
  const hasReactions = Object.keys(reactions).length > 0

  if (!hasReactions) return null

  return (
    <div className={cn('flex flex-wrap gap-1 w-full justify-end', className)}>
      {Object.entries(reactions).map(([emoji, data]: [string, { count: number; users: string[] }]) => {
        const isReacted = data.users?.includes(profile?.id ?? '')
        return (
          <motion.button
            key={emoji}
            initial={false}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onReact(emoji)}
            className={`inline-flex items-center space-x-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
              isReacted
                ? 'theme-accent-chip'
                : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.08)]'
            }`}
            aria-label={`Reaction ${normalizeEmojiValue(emoji)} count ${data.count}`}
          >
            <span>{normalizeEmojiValue(emoji)}</span>
            <span className="text-[0.5em]">{data.count}</span>
          </motion.button>
        )
      })}
    </div>
  )
})
