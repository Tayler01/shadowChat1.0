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
import { CheckersCrownBadge } from '../../features/games/shadow-checkers/components/CheckersCrownBadge'
import { ShadowWarSwordBadge } from '../../features/games/shadow-war/components/ShadowWarSwordBadge'
import { ShadowPinGoldPinBadge } from '../../features/shadow-pin/components/ShadowPinGoldPinBadge'
import { formatTime, shouldGroupMessage, cn, getReadableTextColor } from '../../lib/utils'
import type { Message, User } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'
import type { EmojiClickData } from '../../types'
import { useToneAnalysis } from '../../hooks/useToneAnalysis'
import { useToneAnalysisEnabled } from '../../hooks/useToneAnalysisEnabled'
import { getBlockedActionMessage } from '../../lib/moderation'
import { showActionErrorToast } from '../../lib/toastNotifications'
import { getSupabaseImageTransformUrl } from '../../lib/storageImageTransforms'
import { EmojiPickerOverlay } from './EmojiPickerOverlay'
import { QuickReactionRail } from './QuickReactionRail'

interface MessageItemProps {
  message: Message
  previousMessage?: Message
  parentMessage?: Message
  onReply?: (messageId: string, content: string) => void
  onEdit: (messageId: string, content: string) => Promise<void>
  onDelete: (messageId: string) => Promise<void>
  onTogglePin: (messageId: string) => Promise<void>
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>
  onJumpToMessage?: (messageId: string) => void
  containerRef?: React.RefObject<HTMLDivElement>
  avatarLoading?: 'eager' | 'lazy'
  avatarFetchPriority?: 'high' | 'low' | 'auto'
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
    onJumpToMessage,
    containerRef,
    avatarLoading = 'lazy',
    avatarFetchPriority,
  }) => {
    const { profile } = useAuth()
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState(message.content)
    const [showReactionPicker, setShowReactionPicker] = useState(false)
    const [showImageModal, setShowImageModal] = useState(false)
    const bubbleShellRef = useRef<HTMLDivElement>(null)
    const [showQuickReactions, setShowQuickReactions] = useState(false)
    const [profileUser, setProfileUser] = useState<User | null>(null)
    const reactionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const { enabled: toneEnabled } = useToneAnalysisEnabled()
    const analyzeTone = useToneAnalysis(toneEnabled)

    const isGrouped = shouldGroupMessage(message, previousMessage)
    const isOwner = profile?.id === message.user_id
    const isOperator = profile?.admin_role === 'admin' || profile?.admin_role === 'sub_admin'
    const isAuthorOperator = message.user?.admin_role === 'admin' || message.user?.admin_role === 'sub_admin'
    const isLocalDelivery = message.optimistic || message.delivery_status === 'sending' || message.delivery_status === 'failed'
    const canDelete = isOwner || (isOperator && Boolean(message.user) && !isAuthorOperator)
    const isShadoAI = message.user?.username === 'shado_ai'
    const isAIMessage = isShadoAI || message.message_type === 'command'
    const isImageMessage = message.message_type === 'image' && Boolean(message.file_url)
    const imageMessageSrc = message.thumbnail_url || getSupabaseImageTransformUrl(message.file_url, {
      width: 960,
      height: 960,
      resize: 'contain',
      quality: 82,
    })
    const parentPreview = parentMessage
      ? parentMessage.content?.trim() || (parentMessage.message_type === 'image' ? 'Image' : parentMessage.message_type)
      : ''
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

    const handleEditSave = async () => {
      if (!editContent.trim()) return
      await onEdit(message.id, editContent)
      setIsEditing(false)
    }

    const handleReaction = async (emoji: string) => {
      try {
        await onToggleReaction(message.id, emoji)
      } catch (error) {
        const notice = await getBlockedActionMessage('general_chat', error, 'Failed to update reaction')
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

    const messageActions: ChatMessageAction[] = [
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
        onSelect: () => onReply?.(message.id, message.content),
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
        <motion.div
          id={`message-${message.id}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
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
                <CheckersCrownBadge active={message.user?.checkers_crown} />
                <ShadowWarSwordBadge active={message.user?.war_sword} />
                <ShadowPinGoldPinBadge active={message.user?.shadow_pin_gold_pin} />
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
                className="relative inline-block max-w-[calc(100%-3rem)] group/message md:max-w-full"
                data-testid="message-bubble-shell"
                onMouseEnter={handleMouseEnterReactions}
                onMouseLeave={handleMouseLeaveReactions}
              >
                {parentMessage && (
                  <div className="mb-1 flex min-w-0 items-end gap-2 pl-1 text-xs text-[var(--text-muted)]">
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 rounded-bl-[0.45rem] border-b border-l border-[var(--theme-accent-border-soft)]"
                    />
                    <button
                      type="button"
                      onClick={() => onJumpToMessage?.(parentMessage.id)}
                      className="min-w-0 truncate text-left transition-colors hover:text-[var(--theme-accent-readable)] hover:underline"
                      aria-label="View parent message"
                    >
                      Replying to {parentMessage.user?.display_name || 'Unknown'}
                      <UserRoleBadge role={parentMessage.user?.admin_role} className="ml-1" />
                      <ShadowPinGoldPinBadge active={parentMessage.user?.shadow_pin_gold_pin} className="ml-1" />
                      <UserPresenceBadge userId={parentMessage.user?.id} presenceVisibility={parentMessage.user?.presence_visibility} className="ml-1" />
                      :
                      {' '}
                      {parentPreview.slice(0, 36)}
                      {parentPreview.length > 36 ? '...' : ''}
                    </button>
                  </div>
                )}
                <div
                  className={cn(
                    'relative peer space-y-1 break-words rounded-[var(--radius-md)]',
                    isImageMessage
                      ? 'bg-transparent px-0 py-0 text-[var(--text-primary)] shadow-none'
                      : 'px-3 py-2 shadow-[var(--shadow-panel)]',
                    isImageMessage
                      ? ''
                      : isAIMessage
                      ? 'border border-[var(--border-glow)] bg-[var(--theme-accent-softer)] text-[var(--text-primary)]'
                      : bubbleStyle
                      ? ''
                      : 'border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)]'
                  )}
                  style={bubbleStyle}
                >
                  <MessageReactions
                    message={message}
                    onReact={handleReaction}
                    className="text-[0.65rem]"
                  />
                  {message.message_type === 'audio' ? (
                    <audio controls src={message.audio_url} className="mt-1 max-w-full" />
                  ) : isImageMessage ? (
                    <img
                      src={imageMessageSrc}
                      alt="uploaded image"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="mt-1 block h-auto max-h-[70vh] max-w-[min(20rem,100%)] cursor-pointer rounded-[var(--radius-md)] object-contain shadow-[0_12px_34px_rgba(0,0,0,0.24)] sm:max-w-xs"
                      onClick={() => setShowImageModal(true)}
                    />
                  ) : message.message_type === 'video' && message.file_url ? (
                    <VideoAttachment url={message.file_url} meta={message.content} />
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
            </>
          )}
        </div>
        </motion.div>
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
