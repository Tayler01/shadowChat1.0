import React, { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Pin,
  PinOff,
  Edit3,
  Trash2,
  Reply,
  MoreHorizontal,
  ThumbsUp,
  Plus,
  Copy,
  Check,
} from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { ImageModal } from '../ui/ImageModal'
import { Button } from '../ui/Button'
import { FileAttachment } from './FileAttachment'
import { formatTime, shouldGroupMessage, cn, getReadableTextColor } from '../../lib/utils'
import type { Message } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'
import type { EmojiClickData } from '../../types'
import { useEmojiPicker } from '../../hooks/useEmojiPicker'
import { useToneAnalysis } from '../../hooks/useToneAnalysis'
import { useToneAnalysisEnabled } from '../../hooks/useToneAnalysisEnabled'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏']

interface MessageItemProps {
  message: Message
  previousMessage?: Message
  parentMessage?: Message
  onReply?: (messageId: string, content: string) => void
  onEdit: (messageId: string, content: string) => Promise<void>
  onDelete: (messageId: string) => Promise<void>
  onTogglePin: (messageId: string) => Promise<void>
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>
  containerRef?: React.RefObject<HTMLDivElement>
}

export const MessageItem: React.FC<MessageItemProps> = React.memo(
  ({ message, previousMessage, parentMessage, onReply, onEdit, onDelete, onTogglePin, onToggleReaction, containerRef }) => {
    const { profile } = useAuth()
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState(message.content)
    const [showActions, setShowActions] = useState(false)
    const [showReactionPicker, setShowReactionPicker] = useState(false)
    const [openAbove, setOpenAbove] = useState(false)
    const [openRight, setOpenRight] = useState(false)
    const [showImageModal, setShowImageModal] = useState(false)
    const EmojiPicker = useEmojiPicker(showReactionPicker)
    const reactionPickerRef = useRef<HTMLDivElement>(null)
    const actionsRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const [showQuickReactions, setShowQuickReactions] = useState(false)
    const reactionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const analyzeTone = useToneAnalysis()
    const { enabled: toneEnabled } = useToneAnalysisEnabled()

    const isGrouped = shouldGroupMessage(message, previousMessage)
    const isOwner = profile?.id === message.user_id
    const isAIMessage = message.message_type === 'command'

    const bubbleColor = isAIMessage ? undefined : message.user?.color
    const bubbleStyle = bubbleColor
      ? { backgroundColor: bubbleColor, color: getReadableTextColor(bubbleColor) }
      : undefined
    const { tone } = toneEnabled ? analyzeTone(message.content) : { tone: 'neutral' }
    const toneEmoji = tone === 'positive' ? '😊' : tone === 'negative' ? '☹️' : '😐'

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
      if (!showActions) return

      const btnRect = actionsRef.current?.getBoundingClientRect()
      const containerRect = containerRef?.current?.getBoundingClientRect()

      if (!btnRect) return

      let openUp = false

      if (containerRect) {
        const center = containerRect.top + containerRect.height / 2
        openUp = btnRect.top > center
      }

      if (menuRef.current) {
        const menuHeight = menuRef.current.offsetHeight
        const spaceBelow = window.innerHeight - btnRect.bottom
        const spaceAbove = btnRect.top

        if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
          openUp = true
        } else if (spaceBelow > menuHeight) {
          openUp = false
        }

        const menuWidth = menuRef.current.offsetWidth
        const SIDEBAR_WIDTH = 256 // width of left sidebar on desktop
        if (btnRect.left - menuWidth < SIDEBAR_WIDTH) {
          setOpenRight(true)
        } else {
          setOpenRight(false)
        }

        if (window.innerWidth <= 768) {
          requestAnimationFrame(() => {
            menuRef.current?.scrollIntoView({ block: 'nearest' })
          })
        }
      }

      setOpenAbove(openUp)
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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn('group flex space-x-3 ml-2')}
        >
        {/* Avatar */}
        <div className="flex-shrink-0 w-10">
          {!isGrouped && (
            <Avatar
              src={message.user?.avatar_url}
              alt={message.user?.display_name || 'Unknown User'}
              size="md"
              color={message.user?.color}
              status={message.user?.status}
              showStatus
            />
          )}
        </div>

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          {!isGrouped && (
            <div className="flex items-baseline space-x-2 mb-1">
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {message.user?.display_name}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatTime(message.created_at)}
              </span>
              {message.edited_at && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
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
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
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
              <div className="relative inline-block max-w-full group/message">
                {parentMessage && (
                  <div className="text-xs text-gray-500 mb-1">
                    Replying to {parentMessage.user?.display_name || 'Unknown'}: {parentMessage.content.slice(0, 30)}
                  </div>
                )}
                <div
                  className={cn(
                    'relative peer rounded-xl px-3 py-2 break-words space-y-1',
                    isAIMessage
                      ? 'bg-[var(--color-accent-light)] border-l-4 border-[var(--color-accent)] text-gray-900 dark:text-gray-100'
                      : bubbleStyle
                      ? ''
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
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
                      className="mt-1 max-w-xs rounded cursor-pointer"
                      onClick={() => setShowImageModal(true)}
                    />
                  ) : message.message_type === 'file' && message.file_url ? (
                    <FileAttachment url={message.file_url} meta={message.content} />
                  ) : (
                    <span className={isAIMessage ? 'font-bold text-black' : ''}>
                      {message.content}
                      {toneEnabled && (
                        <span data-testid="tone-indicator" className="ml-1">
                          {toneEmoji}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {/* Actions */}
                <div className="absolute -right-12 -top-2" ref={actionsRef}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowActions(!showActions)}
                    className="opacity-0 group-hover/message:opacity-70 hover:opacity-100 transition-opacity hover:text-[var(--color-accent)]"
                    aria-label="Message actions"
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
                          openRight ? 'left-full ml-2' : 'right-0'
                        )}
                        ref={menuRef}
                      >
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 min-w-[160px]"
                        >

                          <button
                            onClick={handleCopyMessage}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                            type="button"
                          >
                            <Copy className="w-4 h-4" />
                            <span>Copy</span>
                          </button>

                          {onReply && (
                            <button
                              onClick={() => {
                                onReply(message.id, message.content)
                                setShowActions(false)
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                              type="button"
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
                                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                                type="button"
                              >
                                <Edit3 className="w-4 h-4" />
                                <span>Edit</span>
                              </button>

                              <button
                                onClick={() => {
                                  onDelete(message.id)
                                  setShowActions(false)
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 flex items-center space-x-2"
                                type="button"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>Delete</span>
                              </button>
                            </>
                          )}

                          <button
                            onClick={handlePinToggle}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                            type="button"
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
                  <span className={isAIMessage ? 'font-bold text-black dark:text-white' : ''}>
                {/* Emoji picker positioned just above message bubble */}
                <div 
                  className={`absolute -top-10 left-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow px-2 py-1 space-x-1 z-10 transition-opacity duration-200 ${
                    showQuickReactions ? 'flex opacity-100' : 'hidden opacity-0'
                  }`}
                  onMouseEnter={handleMouseEnterReactions}
                  onMouseLeave={handleMouseLeaveReactions}
                >
                  {QUICK_REACTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => handleReaction(e)}
                      className="text-base hover:scale-110 transition-transform"
                      type="button"
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
            className={`inline-flex items-center space-x-1 text-xs rounded-full transition-colors ${
              isReacted
                ? 'text-blue-800 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <span>{emoji}</span>
            <span className="text-[0.5em]">{data.count}</span>
          </motion.button>
        )
      })}
    </div>
  )
}