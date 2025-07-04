import React, { useEffect, useRef, useState } from 'react'
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
import { Button } from '../ui/Button'
import { formatTime, shouldGroupMessage, cn } from '../../lib/utils'
import type { Message } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'
import type { EmojiClickData } from '../../types'
import { useEmojiPicker } from '../../hooks/useEmojiPicker'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏']

interface MessageItemProps {
  message: Message
  previousMessage?: Message
  onReply?: (messageId: string, content: string) => void
  onEdit: (messageId: string, content: string) => Promise<void>
  onDelete: (messageId: string) => Promise<void>
  onTogglePin: (messageId: string) => Promise<void>
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>
  containerRef?: React.RefObject<HTMLDivElement>
}

export const MessageItem: React.FC<MessageItemProps> = React.memo(
  ({ message, previousMessage, onReply, onEdit, onDelete, onTogglePin, onToggleReaction, containerRef }) => {
    const { profile } = useAuth()
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState(message.content)
    const [showActions, setShowActions] = useState(false)
    const [showReactionPicker, setShowReactionPicker] = useState(false)
    const [openAbove, setOpenAbove] = useState(false)
    const EmojiPicker = useEmojiPicker(showReactionPicker)
    const reactionPickerRef = useRef<HTMLDivElement>(null)
    const actionsRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    const isGrouped = shouldGroupMessage(message, previousMessage)
    const isOwner = profile?.id === message.user_id

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
      } catch (error) {
        console.error('❌ MessageItem: Failed to copy message:', error)
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

    useEffect(() => {
      if (!showActions) return
      const btnRect = actionsRef.current?.getBoundingClientRect()
      const containerRect = containerRef?.current?.getBoundingClientRect()
      if (btnRect && containerRect) {
        const center = containerRect.top + containerRect.height / 2
        setOpenAbove(btnRect.top > center)
      } else if (btnRect && menuRef.current) {
        const spaceBelow = window.innerHeight - btnRect.bottom
        const spaceAbove = btnRect.top
        const menuHeight = menuRef.current.offsetHeight
        if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
          setOpenAbove(true)
        } else {
          setOpenAbove(false)
        }
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
              <div className="relative group/message inline-block max-w-full">
                <div
                  className={cn(
                    'relative bg-gray-100 dark:bg-gray-700 rounded-xl px-3 py-2 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors break-words space-y-1'
                  )}
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
                      className="mt-1 max-w-full rounded"
                    />
                  ) : (
                    message.content
                  )}
                </div>
                <div className="hidden group-hover/message:flex absolute -top-8 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow px-2 py-1 space-x-1 z-10">
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
                {showReactionPicker && EmojiPicker && (
                  <div
                    ref={reactionPickerRef}
                    className="absolute -top-48 left-1/2 -translate-x-1/2 z-50"
                  >
                    <EmojiPicker
                      onEmojiClick={handleReactionSelect}
                      width={320}
                      height={400}
                      theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="absolute top-1 right-1" ref={actionsRef}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowActions(!showActions)}
                    className="opacity-70 group-hover:opacity-100 transition-opacity"
                    aria-label="Message actions"
                    type="button"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>

                  <AnimatePresence>
                    {showActions && (
                      <div
                        className={cn(
                          'absolute right-0 p-2 -m-2 z-50',
                          openAbove ? 'bottom-full mb-1' : 'top-full mt-1'
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
        </div>
      </motion.div>
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


