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
import { useEmojiPicker } from '../../hooks/useEmojiPicker'
import { formatTime, shouldGroupMessage, cn } from '../../lib/utils'
import { toggleReaction, type Message } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { EmojiClickData } from 'emoji-picker-react'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏']

interface MessageItemProps {
  message: Message
  previousMessage?: Message
  onReply?: (messageId: string, content: string) => void
  onEdit: (messageId: string, content: string) => Promise<void>
  onDelete: (messageId: string) => Promise<void>
  onTogglePin: (messageId: string) => Promise<void>
}

export const MessageItem: React.FC<MessageItemProps> = React.memo(
  ({ message, previousMessage, onReply, onEdit, onDelete, onTogglePin }) => {
    const { profile } = useAuth()
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState(message.content)
    const [showActions, setShowActions] = useState(false)
    const [showReactionPicker, setShowReactionPicker] = useState(false)
    const EmojiPicker = useEmojiPicker(showReactionPicker)
    const reactionPickerRef = useRef<HTMLDivElement>(null)
    const actionsRef = useRef<HTMLDivElement>(null)

    const isGrouped = shouldGroupMessage(message, previousMessage)
    const isOwner = profile?.id === message.user_id

    const handleEditSave = async () => {
      if (!editContent.trim()) return
      await onEdit(message.id, editContent)
      setIsEditing(false)
    }

    const handleReaction = async (emoji: string) => {
      await toggleReaction(message.id, emoji, false)
    }

    const handleReactionSelect = (emojiData: EmojiClickData) => {
      const emoji = emojiData.emoji
      handleReaction(emoji)
      setShowReactionPicker(false)
    }

    const handleCopyMessage = () => {
      navigator.clipboard.writeText(message.content)
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

    const hasReactions = !!message.reactions && Object.keys(message.reactions).length > 0

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="group flex space-x-3 mt-2"
      >
        {/* Avatar */}
        <div className="flex-shrink-0 w-10">
          {!isGrouped && (
            <Avatar
              src={message.user?.avatar_url}
              alt={message.user?.display_name}
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
                <Button size="sm" onClick={handleEditSave}>
                  <Check className="w-4 h-4 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative group/message inline-block max-w-full">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-xl px-3 py-2 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors break-words">
                  {message.content}
                </div>
                <div className="hidden group-hover/message:flex absolute -top-8 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow px-2 py-1 space-x-1 z-10">
                  {QUICK_REACTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => handleReaction(e)}
                      className="text-base hover:scale-110 transition-transform"
                    >
                      {e}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowReactionPicker(!showReactionPicker)}
                    className="text-base hover:scale-110 transition-transform"
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
              </div>
              <MessageReactions message={message} onReact={handleReaction} />
            </>
          )}
        </div>

        {/* Actions */}
        <div
          className="relative"
          ref={actionsRef}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowActions(!showActions)}
            className="opacity-70 group-hover:opacity-100 transition-opacity"
            aria-label="Message actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>

          <AnimatePresence>
            {showActions && (
              <div
                onMouseLeave={() => setShowActions(false)}
                className="absolute right-0 top-full mt-1 p-2 -m-2"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10 min-w-[160px]"
                >
                  <button
                    onClick={() => handleReaction('👍')}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span>React</span>
                  </button>

                <button
                  onClick={handleCopyMessage}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </button>

                {onReply && (
                  <button
                    onClick={() => onReply(message.id, message.content)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
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
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => onDelete(message.id)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 flex items-center space-x-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => onTogglePin(message.id)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
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

const MessageReactions: React.FC<{ message: Message; onReact: (emoji: string) => void }> = ({ message, onReact }) => {
  const { profile } = useAuth()
  const reactions: Record<string, { count: number; users: string[] }> = message.reactions || {}
  const hasReactions = Object.keys(reactions).length > 0

  if (!hasReactions) return null

  return (
    <div className="flex flex-wrap gap-1 mt-2">
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
            className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs transition-colors ${
              isReacted
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            <span>{emoji}</span>
            <span>{data.count}</span>
          </motion.button>
        )
      })}
    </div>
  )
}


