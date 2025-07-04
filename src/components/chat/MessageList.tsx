import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pin } from 'lucide-react'
import { useMessages } from '../../hooks/useMessages'
import { useTyping } from '../../hooks/useTyping'
import { groupMessagesByDate, cn, shouldGroupMessage } from '../../lib/utils'
import { MessageItem } from './MessageItem'
import { PinnedMessageItem } from './PinnedMessageItem'
import type { FailedMessage } from '../../hooks/useFailedMessages'
import { FailedMessageItem } from './FailedMessageItem'
import toast from 'react-hot-toast'

interface MessageListProps {
  onReply?: (messageId: string, content: string) => void
  failedMessages?: FailedMessage[]
  onResend?: (msg: FailedMessage) => void
}

export const MessageList: React.FC<MessageListProps> = ({ onReply, failedMessages = [], onResend }) => {
  const {
    messages,
    loading,
    editMessage,
    deleteMessage,
    togglePin,
    toggleReaction
  } = useMessages()
  const { typingUsers } = useTyping('general')
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 20
    setAutoScroll(atBottom)
  }, [])

  const groupedMessages = useMemo(() => groupMessagesByDate(messages), [messages])

  // Scroll to bottom when messages or typing users change
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages, typingUsers, autoScroll])

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
          <div className="text-xs text-gray-400 mt-2">Debug: {messages.length} messages in state</div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto overflow-x-visible p-4 pb-48 md:pb-40"
    >
      {messages.some(m => m.pinned) && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <Pin className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Pinned Messages</span>
          </div>
          <div className="space-y-2">
            {messages
              .filter(m => m.pinned)
              .map(message => (
                <PinnedMessageItem
                  key={message.id}
                  message={message}
                  onUnpin={togglePin}
                  onToggleReaction={toggleReaction}
                />
              ))}
          </div>
        </div>
      )}

      {groupedMessages.map(group => (
        <React.Fragment key={group.date}>
          <div className="flex items-center my-2">
            <hr className="flex-grow border-t border-gray-300 dark:border-gray-700" />
            <span className="mx-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{group.date}</span>
            <hr className="flex-grow border-t border-gray-300 dark:border-gray-700" />
          </div>
          {group.messages.map((message, idx) => {
            const prev = group.messages[idx - 1]
            const isGrouped = shouldGroupMessage(message, prev)
            return (
              <div key={message.id} className={cn(isGrouped ? 'pt-1 pb-1' : 'pt-4 pb-1')}>
                <MessageItem
                  message={message}
                  previousMessage={prev}
                  onReply={onReply}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onTogglePin={togglePin}
                  onToggleReaction={toggleReaction}
                />
              </div>
            )
          })}
        </React.Fragment>
      ))}

      {failedMessages.map(msg => (
        <FailedMessageItem key={msg.id} message={msg} onResend={onResend!} />
      ))}

      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-2 flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400"
          >
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: '0.1s' }}
              />
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: '0.2s' }}
              />
            </div>
            <span>
              {typingUsers.map(u => u.display_name).join(', ')}
              {typingUsers.length === 1 ? ' is' : ' are'} typing...
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
