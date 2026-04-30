import React, { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Pin,
  PinOff,
  Edit3,
  Trash2,
  Reply,
  MoreHorizontal,
  Plus,
  Copy,
  Check,
} from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { ImageModal } from '../ui/ImageModal'
import { Button } from '../ui/Button'
import { FileAttachment } from './FileAttachment'
import { MessageRichText } from './MessageRichText'
import { PublicProfileDialog } from '../profile/PublicProfileDialog'
import { formatTime, shouldGroupMessage, cn, getReadableTextColor } from '../../lib/utils'
import type { Message, User } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'
import type { EmojiClickData } from '../../types'
import { useEmojiPicker } from '../../hooks/useEmojiPicker'
import { useToneAnalysis } from '../../hooks/useToneAnalysis'
import { useToneAnalysisEnabled } from '../../hooks/useToneAnalysisEnabled'

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
}

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
  ({ message, previousMessage, parentMessage, onReply, onEdit, onDelete, onTogglePin, onToggleReaction, onJumpToMessage, containerRef }) => {
    const { profile } = useAuth()
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState(message.content)
    const [showActions, setShowActions] = useState(false)
    const [showReactionPicker, setShowReactionPicker] = useState(false)
    const [openAbove, setOpenAbove] = useState(false)
    const [openRight, setOpenRight] = useState(false)
    const [menuPlacementReady, setMenuPlacementReady] = useState(false)
    const [menuMaxHeight, setMenuMaxHeight] = useState<number | undefined>(undefined)
    const [showImageModal, setShowImageModal] = useState(false)
    const EmojiPicker = useEmojiPicker(showReactionPicker)
    const reactionPickerRef = useRef<HTMLDivElement>(null)
    const actionsRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const [showQuickReactions, setShowQuickReactions] = useState(false)
    const [profileUser, setProfileUser] = useState<User | null>(null)
    const reactionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const analyzeTone = useToneAnalysis()
    const { enabled: toneEnabled } = useToneAnalysisEnabled()

    const isGrouped = shouldGroupMessage(message, previousMessage)
    const isOwner = profile?.id === message.user_id
    const isShadoAI = message.user?.username === 'shado_ai'
    const isAIMessage = isShadoAI || message.message_type === 'command'
    const avatarSrc = isShadoAI
      ? message.user?.avatar_url || '/icons/app-icon-192.png'
      : message.user?.avatar_url

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
      await onToggleReaction(message.id, emoji)
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
        setShowActions(false)
      } catch {
        toast.error('Failed to copy message')
      }
    }

    const handlePinToggle = async () => {
      await onTogglePin(message.id)
      setShowActions(false)
    }

    useEffect(() => {
      const handleClick = (e: MouseEvent) => {
        if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
          setShowActions(false)
        }
      }
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    useLayoutEffect(() => {
      if (!showActions) {
        setMenuPlacementReady(false)
        return
      }

      const btnRect = actionsRef.current?.getBoundingClientRect()
      const containerRect = containerRef?.current?.getBoundingClientRect()

      if (!btnRect) return

      if (menuRef.current) {
        const viewport = window.visualViewport
        const viewportTop = viewport?.offsetTop ?? 0
        const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight)
        const viewportLeft = viewport?.offsetLeft ?? 0
        const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth)
        const mobileFooterRect = window.innerWidth < 768
          ? document.querySelector('[data-mobile-chat-footer="true"]')?.getBoundingClientRect()
          : undefined
        const safeGap = 12
        const visibleTop = Math.max(viewportTop, containerRect?.top ?? viewportTop)
        const visibleBottom = Math.min(
          viewportBottom,
          containerRect?.bottom ?? viewportBottom,
          mobileFooterRect?.top ?? viewportBottom
        )
        const menuHeight = menuRef.current.scrollHeight
        const menuWidth = menuRef.current.offsetWidth

        const spaceBelow = Math.max(0, visibleBottom - btnRect.bottom - safeGap)
        const spaceAbove = Math.max(0, btnRect.top - visibleTop - safeGap)
        const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow
        const availableSpace = openUp ? spaceAbove : spaceBelow

        setOpenAbove(openUp)
        setMenuMaxHeight(Math.floor(Math.min(360, Math.max(96, availableSpace))))

        const desktopSidebarWidth = window.innerWidth >= 768 ? 256 : 0
        const safeLeft = Math.max(viewportLeft + safeGap, desktopSidebarWidth)
        const rightAlignedLeft = btnRect.right - menuWidth
        const canOpenRight = btnRect.right + menuWidth + safeGap <= viewportRight

        if (rightAlignedLeft < safeLeft && canOpenRight) {
          setOpenRight(true)
        } else {
          setOpenRight(false)
        }

        setMenuPlacementReady(true)
      }
    }, [showActions, containerRef])


    useEffect(() => {
      if (!showReactionPicker) return
      const handleClick = (e: MouseEvent) => {
        if (
          reactionPickerRef.current &&
          !reactionPickerRef.current.contains(e.target as Node)
        ) {
          setShowReactionPicker(false)
        }
      }
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }, [showReactionPicker])


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
                  status={message.user?.status}
                  showStatus
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
              <span className="font-semibold text-[var(--text-primary)]">
                {message.user?.display_name}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {formatTime(message.created_at)}
              </span>
              {message.edited_at && (
                <span className="text-xs text-[var(--text-muted)]/80">
                  (edited)
                </span>
              )}
            </div>
          )}

          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="obsidian-input w-full resize-none rounded-[var(--radius-md)] p-3"
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
                className="relative inline-block max-w-[calc(100%-3rem)] group/message md:max-w-full"
                data-testid="message-bubble-shell"
              >
                {parentMessage && (
                  <button
                    type="button"
                    onClick={() => onJumpToMessage?.(parentMessage.id)}
                    className="mb-1 text-left text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-gold)] hover:underline"
                    aria-label="View parent message"
                  >
                    Replying to {parentMessage.user?.display_name || 'Unknown'}:
                    {' '}
                    {parentMessage.content.slice(0, 30)}
                    {parentMessage.content.length > 30 ? '...' : ''}
                  </button>
                )}
                <div
                  className={cn(
                    'relative peer space-y-1 break-words rounded-[var(--radius-md)] px-3 py-2 shadow-[var(--shadow-panel)]',
                    isAIMessage
                      ? 'border border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(255,240,184,0.08),rgba(255,255,255,0.03)_24%,rgba(13,15,16,0.98)_100%)] text-[var(--text-primary)]'
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
                  ) : message.message_type === 'image' && message.file_url ? (
                    <img
                      src={message.file_url}
                      alt="uploaded image"
                      className="mt-1 max-w-full cursor-pointer rounded-[var(--radius-md)] border border-[var(--border-subtle)] sm:max-w-xs"
                      onClick={() => setShowImageModal(true)}
                    />
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
                <div className="absolute -right-12 -top-2" ref={actionsRef}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowActions(!showActions)}
                    onPointerDown={event => event.preventDefault()}
                    onMouseDown={event => event.preventDefault()}
                    className="opacity-70 transition-opacity hover:opacity-100 hover:text-[var(--text-gold)] md:opacity-0 md:group-hover/message:opacity-70"
                    aria-label="Message actions"
                    aria-expanded={showActions}
                    aria-haspopup="menu"
                    type="button"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>

                  <AnimatePresence>
                    {showActions && (
                      <div
                        className={cn(
                          'absolute p-2 -m-2 z-50',
                          openAbove ? 'bottom-full mb-1' : 'top-full mt-1',
                          openRight ? 'left-full ml-2' : 'right-0',
                          !menuPlacementReady && 'invisible pointer-events-none'
                        )}
                        ref={menuRef}
                        role="menu"
                        aria-label="Message options"
                        data-testid="message-actions-menu"
                      >
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="glass-panel-strong z-50 min-w-[160px] overflow-y-auto overscroll-contain rounded-[var(--radius-md)] py-1"
                          style={{ maxHeight: menuMaxHeight }}
                        >

                          <button
                            onClick={handleCopyMessage}
                            className="flex w-full items-center space-x-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]"
                            type="button"
                            role="menuitem"
                          >
                            <Copy className="w-4 h-4" />
                            <span>Copy</span>
                          </button>

                          <button
                            onClick={() => {
                              void handleReaction('\u{1F44D}')
                              setShowActions(false)
                            }}
                            className="flex w-full items-center space-x-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]"
                            type="button"
                            aria-label="React with thumbs up"
                            role="menuitem"
                          >
                            <span className="text-base leading-none">{'\u{1F44D}'}</span>
                            <span>React</span>
                          </button>

                          <button
                            onClick={() => {
                              setShowReactionPicker(true)
                              setShowActions(false)
                            }}
                            className="flex w-full items-center space-x-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]"
                            type="button"
                            role="menuitem"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Add Reaction</span>
                          </button>

                          {onReply && (
                            <button
                              onClick={() => {
                                onReply(message.id, message.content)
                                setShowActions(false)
                              }}
                              className="flex w-full items-center space-x-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]"
                              type="button"
                              role="menuitem"
                            >
                              <Reply className="w-4 h-4" />
                              <span>Reply</span>
                            </button>
                          )}

                          {isOwner && (
                            <>
                              <button
                                onClick={() => {
                                  setIsEditing(true)
                                  setEditContent(message.content)
                                  setShowActions(false)
                                }}
                                className="flex w-full items-center space-x-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]"
                                type="button"
                                role="menuitem"
                              >
                                <Edit3 className="w-4 h-4" />
                                <span>Edit</span>
                              </button>

                              <button
                                onClick={() => {
                                  onDelete(message.id)
                                  setShowActions(false)
                                }}
                                className="flex w-full items-center space-x-2 px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-red-100"
                                type="button"
                                role="menuitem"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>Delete</span>
                              </button>
                            </>
                          )}

                          <button
                            onClick={handlePinToggle}
                            className="flex w-full items-center space-x-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]"
                            type="button"
                            role="menuitem"
                          >
                            {message.pinned ? (
                              <PinOff className="w-4 h-4" />
                            ) : (
                              <Pin className="w-4 h-4" />
                            )}
                            <span>{message.pinned ? 'Unpin' : 'Pin'}</span>
                          </button>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Emoji picker positioned just above message bubble */}
                <div 
                  className={`glass-panel absolute -top-10 left-4 z-10 space-x-1 rounded-full px-2 py-1 transition-opacity duration-200 ${
                    showQuickReactions ? 'flex opacity-100' : 'hidden opacity-0'
                  }`}
                  onMouseEnter={handleMouseEnterReactions}
                  onMouseLeave={handleMouseLeaveReactions}
                >
                  {['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F389}', '\u{1F64F}'].map(e => (
                    <button
                      key={e}
                      onClick={() => handleReaction(e)}
                      className="text-base hover:scale-110 transition-transform"
                      type="button"
                      aria-label={`React with ${normalizeEmojiValue(e)}`}
                    >
                      {e}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowReactionPicker(!showReactionPicker)}
                    className="text-base hover:scale-110 transition-transform"
                    type="button"
                    aria-label="Add reaction"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Invisible hover area to trigger reactions */}
                <div 
                  className="absolute -top-12 -left-2 -right-2 h-16 group-hover/message:block hidden"
                  onMouseEnter={handleMouseEnterReactions}
                  onMouseLeave={handleMouseLeaveReactions}
                />
                
                {showReactionPicker && EmojiPicker && (
                  <div
                    ref={reactionPickerRef}
                    className="absolute -top-46 left-1/2 -translate-x-1/2 z-50"
                  >
                    <EmojiPicker
                      onEmojiClick={handleReactionSelect}
                      width={320}
                      height={400}
                      theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
                    />
                  </div>
                )}
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
        <PublicProfileDialog
          user={profileUser}
          open={Boolean(profileUser)}
          onClose={() => setProfileUser(null)}
        />
      </>
    )
  }
)

MessageItem.displayName = 'MessageItem'

export const MessageReactions: React.FC<{
  message: Message
  onReact: (emoji: string) => void
  className?: string
}> = ({ message, onReact, className = '' }) => {
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
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onReact(emoji)}
            className={`inline-flex items-center space-x-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
              isReacted
                ? 'border-[var(--border-glow)] bg-[rgba(215,170,70,0.14)] text-[var(--text-gold)]'
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
}
