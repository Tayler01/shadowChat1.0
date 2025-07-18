import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDown } from 'lucide-react'
import { useMessages } from '../../hooks/useMessages'
import { useTyping } from '../../hooks/useTyping'
import { groupMessagesByDate, cn, shouldGroupMessage } from '../../lib/utils'
import { MessageItem } from './MessageItem'
import { ThreadReplyLink } from './ThreadReplyLink'
import type { FailedMessage } from '../../hooks/useFailedMessages'
import { FailedMessageItem } from './FailedMessageItem'
import toast from 'react-hot-toast'
import type { Message } from '../../lib/supabase'
import { LoadingSpinner } from '../ui/LoadingSpinner'

interface MessageListProps {
  onReply?: (messageId: string, content: string) => void
  failedMessages?: FailedMessage[]
  onResend?: (msg: FailedMessage) => void
  sending?: boolean
  uploading?: boolean
}

export const MessageList: React.FC<MessageListProps> = ({ onReply, failedMessages = [], onResend, sending = false, uploading = false }) => {
  const {
    messages,
    loading,
    editMessage,
    deleteMessage,
    togglePin,
    toggleReaction,
    loadOlderMessages,
    loadingMore,
    hasMore
  } = useMessages()
  const { typingUsers } = useTyping('general')
  const containerRef = useRef<HTMLDivElement>(null)
  const prevHeightRef = useRef(0)
  const prevScrollTopRef = useRef(0)
  const [autoScroll, setAutoScroll] = useState(true)

  const { messageMap, childrenMap, rootMessages } = useMemo(() => {
    const msgMap = new Map<string, Message>()
    const childMap = new Map<string, Message[]>()
    const roots: Message[] = []
    messages.forEach(m => {
      msgMap.set(m.id, m)
      if (m.reply_to) {
        if (!childMap.has(m.reply_to)) childMap.set(m.reply_to, [])
        childMap.get(m.reply_to)!.push(m)
      } else {
        roots.push(m)
      }
    })
    return { messageMap: msgMap, childrenMap: childMap, rootMessages: roots }
  }, [messages])

  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const initialCollapsed = new Set<string>()
    rootMessages.forEach(m => {
      const replies = childrenMap.get(m.id) || []
      if (replies.length > 0) {
        const allAI = replies.every(r => r.message_type === 'command')
        if (!allAI) {
          initialCollapsed.add(m.id)
        }
      }
    })
    return initialCollapsed
  })

  // Update collapsed state when messages change to include new threads
  useEffect(() => {
    setCollapsed(prev => {
      const newCollapsed = new Set(prev)
      rootMessages.forEach(m => {
        const replies = childrenMap.get(m.id) || []
        if (replies.length > 0 && !prev.has(m.id)) {
          const allAI = replies.every(r => r.message_type === 'command')
          if (!allAI) {
            newCollapsed.add(m.id)
          }
        }
      })
      return newCollapsed
    })
  }, [messages, childrenMap, rootMessages])

  const toggleThread = (id: string) => {
    setCollapsed(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const jumpToMessage = useCallback((id: string) => {
    setCollapsed(prev => {
      const newSet = new Set(prev)
      newSet.delete(id)
      return newSet
    })
    const el = document.getElementById(`message-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-[var(--color-accent)]')
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[var(--color-accent)]')
      }, 2000)
    }
  }, [])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 20
    setAutoScroll(atBottom)

    if (el.scrollTop < 100 && hasMore && !loadingMore) {
      prevHeightRef.current = el.scrollHeight
      prevScrollTopRef.current = el.scrollTop
      loadOlderMessages()
    }
  }, [hasMore, loadingMore, loadOlderMessages])

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      setAutoScroll(true)
    }
  }, [])

  const replyLinkMessages = useMemo(() => {
    return messages
      .filter(m => m.reply_to && messageMap.get(m.reply_to))
      .map(m => ({
        ...m,
        parent: messageMap.get(m.reply_to!)!,
        isReplyLink: true,
      })) as Array<Message & { parent: Message; isReplyLink: boolean }>
  }, [messages, messageMap])

  const combinedMessages = useMemo(() => {
    const all = [...rootMessages, ...replyLinkMessages]
    return all.sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [rootMessages, replyLinkMessages])

  const groupedMessages = useMemo(
    () => groupMessagesByDate(combinedMessages as any[]),
    [combinedMessages]
  )

  // Maintain scroll position when older messages are prepended
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (!loadingMore && prevHeightRef.current) {
      const diff = el.scrollHeight - prevHeightRef.current
      if (prevScrollTopRef.current <= 0) {
        el.scrollTop = diff
      } else {
        el.scrollTop = prevScrollTopRef.current + diff
      }
      prevHeightRef.current = 0
      prevScrollTopRef.current = 0
    }
  }, [loadingMore, messages])

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

  const renderThread = (
    message: Message,
    depth = 0,
    prev?: Message
  ): React.ReactNode => {
    const replies = (childrenMap.get(message.id) || []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    )
    const isCollapsed = collapsed.has(message.id)

    return (
      <div key={message.id} className={cn(depth > 0 ? 'ml-6 border-l pl-3' : '')}>
        <MessageItem
          message={message}
          previousMessage={prev}
          parentMessage={messageMap.get(message.reply_to ?? '')}
          onReply={onReply}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onTogglePin={togglePin}
          onToggleReaction={toggleReaction}
          onJumpToMessage={jumpToMessage}
          containerRef={containerRef}
        />
        {replies.length > 0 && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => toggleThread(message.id)}
              className="text-xs text-gray-500"
            >
              {isCollapsed
                ? `Show ${replies.length} repl${replies.length > 1 ? 'ies' : 'y'}`
                : 'Hide replies'}
            </button>
            {!isCollapsed && (
              <div className="mt-1 space-y-1">
                {replies.map((m, idx) =>
                  renderThread(m, depth + 1, replies[idx - 1])
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
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
      className="relative flex-1 w-full overflow-y-auto overflow-x-hidden p-4 md:p-2 pb-[calc(env(safe-area-inset-bottom)_+_24rem)] md:pb-[calc(env(safe-area-inset-bottom)_+_6rem)]"
    >

      {loadingMore && (
        <div className="flex justify-center py-2 text-gray-500 text-sm">
          <LoadingSpinner size="sm" /> Loading more...
        </div>
      )}


      {groupedMessages.map((group, index) => (
        <React.Fragment key={`${group.date}-${index}`}>
          <div className="flex items-center my-2">
            <hr className="flex-grow border-t border-gray-300 dark:border-gray-700" />
            <span className="mx-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{group.date}</span>
            <hr className="flex-grow border-t border-gray-300 dark:border-gray-700" />
          </div>
          {group.messages.map((message: any, idx) => {
            const prev = group.messages[idx - 1] as any
            const isGrouped = shouldGroupMessage(message, prev)
            return (
              <div key={message.id} className={cn(isGrouped ? 'pt-1 pb-1' : 'pt-4 pb-1')}>
                {message.isReplyLink ? (
                  <ThreadReplyLink
                    message={message}
                    parent={message.parent}
                    onJumpToMessage={jumpToMessage}
                  />
                ) : (
                  renderThread(message, 0, prev)
                )}
              </div>
            )
          })}
        </React.Fragment>
      ))}

      {failedMessages.map(msg => (
        <FailedMessageItem key={msg.id} message={msg} onResend={onResend!} />
      ))}

      {(uploading || sending) && (
        <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
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

      {!autoScroll && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Jump to latest"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)_+_10rem)] md:bottom-32 right-4 bg-[var(--color-accent)] text-white p-2 rounded-full shadow-lg hover:bg-opacity-90"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
