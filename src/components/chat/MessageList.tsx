import React, { useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pin } from 'lucide-react'
import { useMessages } from '../../hooks/useMessages'
import { useTyping } from '../../hooks/useTyping'
import { groupMessagesByDate } from '../../lib/utils'
import { MessageItem } from './MessageItem'
import toast from 'react-hot-toast'

interface MessageListProps {
  onReply?: (messageId: string, content: string) => void
}

export const MessageList: React.FC<MessageListProps> = ({ onReply }) => {
  const { messages, loading, editMessage, deleteMessage, togglePin } = useMessages()
  const { typingUsers } = useTyping('general')
  
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    const list = listRef.current
    if (list) {
      list.scrollTop = list.scrollHeight
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const groupedMessages = useMemo(() => groupMessagesByDate(messages), [messages])

  const handleEdit = async (messageId: string, content: string) => {
    try {
      await editMessage(messageId, content)
      toast.success('Message updated')
    } catch {
      toast.error('Failed to update message')
    }
  }

  const handleDelete = async (messageId: string) => {
    try {
      await deleteMessage(messageId)
      toast.success('Message deleted')
    } catch {
      toast.error('Failed to delete message')
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
        <div className="text-gray-500 dark:text-gray-400">Loading messages...</div>
          <div className="text-xs text-gray-400 mt-2">
            Debug: {messages.length} messages in state
          </div>
        </div>
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
            {group.messages.map((message, index) => (
              <MessageItem
                key={message.id}
                message={message}
                previousMessage={group.messages[index - 1]}
                onReply={onReply}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onTogglePin={togglePin}
              />
            ))}
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
