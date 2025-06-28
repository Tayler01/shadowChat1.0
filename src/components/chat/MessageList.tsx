import React, {
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pin } from 'lucide-react'
import { VariableSizeList as List } from 'react-window'
import { useMessages } from '../../hooks/useMessages'
import { useTyping } from '../../hooks/useTyping'
import { groupMessagesByDate } from '../../lib/utils'
import { MessageItem } from './MessageItem'
import type { Message as ChatMessage } from '../../lib/supabase'
import toast from 'react-hot-toast'

interface MessageListProps {
  onReply?: (messageId: string, content: string) => void
}

export const MessageList: React.FC<MessageListProps> = ({ onReply }) => {
  const { messages, loading, editMessage, deleteMessage, togglePin } = useMessages()
  const { typingUsers } = useTyping('general')
  
  
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<List>(null)
  const [listHeight, setListHeight] = useState(0)

  useLayoutEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setListHeight(containerRef.current.clientHeight)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const groupedMessages = useMemo(() => groupMessagesByDate(messages), [messages])

  const items = useMemo(() => {
    const arr: { type: 'header' | 'message'; date?: string; message?: ChatMessage; prev?: ChatMessage }[] = []
    groupedMessages.forEach(group => {
      arr.push({ type: 'header', date: group.date })
      group.messages.forEach((m, idx) => {
        arr.push({ type: 'message', message: m, prev: group.messages[idx - 1] })
      })
    })
    return arr
  }, [groupedMessages])

  // Auto-scroll to bottom whenever items change or list resizes
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollToItem(items.length - 1, 'end')
    }
  }, [items.length, listHeight])

  const sizeMap = useRef<Record<number, number>>({})

  const getSize = useCallback((index: number) => sizeMap.current[index] ?? 80, [])

  const setSize = useCallback((index: number, size: number) => {
    if (sizeMap.current[index] !== size) {
      sizeMap.current[index] = size
      listRef.current?.resetAfterIndex(index)
    }
  }, [])

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


  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = items[index]
    const refCallback = (el: HTMLDivElement | null) => {
      if (el) {
        const height = el.getBoundingClientRect().height
        setSize(index, height)
      }
    }

    if (item.type === 'header') {
      return (
        <div
          ref={refCallback}
          style={style}
          className="sticky top-0 z-10 flex items-center my-2"
        >
          <hr className="flex-grow border-t border-gray-300 dark:border-gray-700" />
          <span className="mx-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {item.date}
          </span>
          <hr className="flex-grow border-t border-gray-300 dark:border-gray-700" />
        </div>
      )
    }

    return (
      <div ref={refCallback} style={style} className="py-1">
        <MessageItem
          message={item.message as ChatMessage}
          previousMessage={item.prev}
          onReply={onReply}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onTogglePin={togglePin}
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden p-4">
      {messages.some(m => m.pinned) && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
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

      {listHeight > 0 && (
        <List
          ref={listRef}
          height={listHeight}
          width="100%"
          itemCount={items.length}
          itemSize={getSize}
          overscanCount={10}
        >
          {Row}
        </List>
      )}

      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 mt-2"
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
    </div>
  )
}
