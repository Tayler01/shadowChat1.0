import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Pin, 
  PinOff, 
  Edit3, 
  Trash2, 
  Reply, 
  MoreHorizontal,
  Heart,
  ThumbsUp,
  Laugh,
  Copy,
  Check
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useMessages } from '../../hooks/useMessages'
import { useTyping } from '../../hooks/useTyping'
import { toggleReaction } from '../../lib/supabase'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { formatTime, formatDate, groupMessagesByDate, shouldGroupMessage } from '../../lib/utils'
import toast from 'react-hot-toast'

interface MessageListProps {
  onReply?: (messageId: string, content: string) => void
}

export const MessageList: React.FC<MessageListProps> = ({ onReply }) => {
  const { profile } = useAuth()
  const { messages, loading, editMessage, deleteMessage, togglePin } = useMessages()
  const { typingUsers } = useTyping('general')
  
  // Debug logging
  useEffect(() => {
    console.log('📋 MessageList: messages updated', { count: messages.length, loading });
  }, [messages, loading]);
  
  const [editingMessage, setEditingMessage] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const groupedMessages = groupMessagesByDate(messages)

  const handleEdit = async (messageId: string) => {
    if (!editContent.trim()) return

    try {
      await editMessage(messageId, editContent)
      setEditingMessage(null)
      setEditContent('')
      toast.success('Message updated')
    } catch (error) {
      toast.error('Failed to update message')
    }
  }

  const handleDelete = async (messageId: string) => {
    try {
      await deleteMessage(messageId)
      toast.success('Message deleted')
    } catch (error) {
      toast.error('Failed to delete message')
    }
  }

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      await toggleReaction(messageId, emoji, false)
    } catch (error) {
      toast.error('Failed to add reaction')
    }
  }

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
    toast.success('Message copied')
  }

  const startEditing = (messageId: string, content: string) => {
    setEditingMessage(messageId)
    setEditContent(content)
  }

  const MessageActions: React.FC<{ message: any }> = ({ message }) => {
    const isOwner = profile?.id === message.user_id
    const [showActions, setShowActions] = useState(false)

    return (
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowActions(!showActions)}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>

        <AnimatePresence>
          {showActions && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10 min-w-[160px]"
            >
              <button
                onClick={() => handleReaction(message.id, '👍')}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                <ThumbsUp className="w-4 h-4" />
                <span>React</span>
              </button>

              <button
                onClick={() => handleCopyMessage(message.content)}
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
                    onClick={() => startEditing(message.id, message.content)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => handleDelete(message.id)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                </>
              )}

              <button
                onClick={() => togglePin(message.id)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                {message.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                <span>{message.pinned ? 'Unpin' : 'Pin'}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  const MessageReactions: React.FC<{ message: any }> = ({ message }) => {
    const reactions = message.reactions || {}
    const hasReactions = Object.keys(reactions).length > 0

    if (!hasReactions) return null

    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {Object.entries(reactions).map(([emoji, data]: [string, any]) => {
          const isReacted = data.users?.includes(profile?.id)
          
          return (
            <motion.button
              key={emoji}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleReaction(message.id, emoji)}
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading messages...</div>
      </div>
    )
  }

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Pinned Messages */}
      {messages.some(m => m.pinned) && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Pin className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Pinned Messages
            </span>
          </div>
          <div className="space-y-2">
            {messages.filter(m => m.pinned).map(message => (
              <div key={message.id} className="text-sm text-yellow-700 dark:text-yellow-300">
                <strong>{message.user?.display_name}:</strong> {message.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message Groups */}
      {groupedMessages.map(group => (
        <div key={group.date} className="space-y-4">
          {/* Date Header */}
          <div className="sticky top-0 z-10 flex justify-center">
            <div className="bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full text-xs font-medium text-gray-500 dark:text-gray-400">
              {group.date}
            </div>
          </div>

          {/* Messages */}
          <div className="space-y-3">
            {group.messages.map((message, index) => {
              const previousMessage = group.messages[index - 1]
              const isGrouped = shouldGroupMessage(message, previousMessage)
              const isEditing = editingMessage === message.id

              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`group flex space-x-3 ${isGrouped ? 'mt-1' : 'mt-4'}`}
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
                          <Button
                            size="sm"
                            onClick={() => handleEdit(message.id)}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingMessage(null)
                              setEditContent('')
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-gray-900 dark:text-gray-100 break-words">
                          {message.content}
                        </div>
                        <MessageReactions message={message} />
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <MessageActions message={message} />
                </motion.div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Typing Indicators */}
      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400"
          >
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
            <span>
              {typingUsers.map(u => u.display_name).join(', ')} 
              {typingUsers.length === 1 ? ' is' : ' are'} typing...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={messagesEndRef} />
    </div>
  )
}