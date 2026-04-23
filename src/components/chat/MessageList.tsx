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
import { useAuth } from '../../hooks/useAuth'

interface MessageListProps {
  onReply?: (messageId: string, content: string) => void
  failedMessages?: FailedMessage[]
  onResend?: (msg: FailedMessage) => void
  sending?: boolean
  uploading?: boolean
  initialMessageId?: string
}

export const MessageList: React.FC<MessageListProps> = ({
  onReply,
  failedMessages = [],
  onResend,
  sending = false,
  uploading = false,
  initialMessageId,
}) => {
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
  const { profile } = useAuth()
  const containerRef = useRef<HTMLDivElement>(null)
  const prevHeightRef = useRef(0)
  const prevScrollTopRef = useRef(0)
  const initialUnreadJumpDoneRef = useRef(false)
  const initialTargetJumpDoneRef = useRef<string | null>(null)
  const lastSeenMessageIdRef = useRef<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null)
  const lastSeenStorageKey = useMemo(
    () => (profile?.id ? `shadowchat:general:last-seen:${profile.id}` : null),
    [profile?.id]
  )

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

  const jumpToMessage = useCallback(
    (id: string) => {
      setCollapsed(prev => {
        const newSet = new Set(prev)
        let current = messageMap.get(id)
        // Expand all ancestor threads so the message is visible
        while (current && current.reply_to) {
          newSet.delete(current.reply_to)
          current = messageMap.get(current.reply_to)
        }
        newSet.delete(id)
        return newSet
      })

      // Wait for the DOM to update before scrolling
      requestAnimationFrame(() => {
        const el = document.getElementById(`message-${id}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('ring-2', 'ring-[var(--color-accent)]')
          setTimeout(() => {
            el.classList.remove('ring-2', 'ring-[var(--color-accent)]')
          }, 2000)
        }
      })
    },
    [messageMap]
  )

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
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth'
      })
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

  useEffect(() => {
    initialUnreadJumpDoneRef.current = false
    initialTargetJumpDoneRef.current = null
    setFirstUnreadMessageId(null)
    if (!lastSeenStorageKey || typeof localStorage === 'undefined') {
      lastSeenMessageIdRef.current = null
      return
    }

    try {
      lastSeenMessageIdRef.current = localStorage.getItem(lastSeenStorageKey)
    } catch {
      lastSeenMessageIdRef.current = null
    }
  }, [lastSeenStorageKey])

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

  useEffect(() => {
    if (
      loading ||
      initialMessageId ||
      initialUnreadJumpDoneRef.current ||
      combinedMessages.length === 0
    ) {
      return
    }

    initialUnreadJumpDoneRef.current = true

    const lastSeenId = lastSeenMessageIdRef.current
    const lastSeenIndex = lastSeenId
      ? combinedMessages.findIndex(message => message.id === lastSeenId)
      : -1

    if (lastSeenIndex >= 0 && lastSeenIndex < combinedMessages.length - 1) {
      const firstUnread = combinedMessages[lastSeenIndex + 1]
      setFirstUnreadMessageId(firstUnread.id)
      setAutoScroll(false)

      requestAnimationFrame(() => {
        const el = document.getElementById(`message-${lastSeenId}`)
        el?.scrollIntoView({ block: 'start' })
      })
      return
    }

    setFirstUnreadMessageId(null)
  }, [combinedMessages, initialMessageId, loading])

  useEffect(() => {
    if (
      loading ||
      !initialMessageId ||
      initialTargetJumpDoneRef.current === initialMessageId ||
      combinedMessages.length === 0
    ) {
      return
    }

    const target = combinedMessages.find(message => message.id === initialMessageId)
    if (!target) {
      return
    }

    initialTargetJumpDoneRef.current = initialMessageId
    setFirstUnreadMessageId(null)
    setAutoScroll(false)

    requestAnimationFrame(() => {
      const el = document.getElementById(`message-${initialMessageId}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-[rgba(34,197,94,0.55)]')
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[rgba(34,197,94,0.55)]')
      }, 2200)
    })
  }, [combinedMessages, initialMessageId, loading])

  useEffect(() => {
    if (
      !lastSeenStorageKey ||
      loading ||
      !autoScroll ||
      !initialUnreadJumpDoneRef.current ||
      combinedMessages.length === 0 ||
      (typeof document !== 'undefined' && document.visibilityState !== 'visible')
    ) {
      return
    }

    try {
      localStorage.setItem(lastSeenStorageKey, combinedMessages[combinedMessages.length - 1].id)
    } catch {
      // Ignore storage failures; the feed will still behave like normal chat.
    }
  }, [autoScroll, combinedMessages, lastSeenStorageKey, loading])

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
      <div key={message.id} className={cn(depth > 0 ? 'ml-6 border-l border-[var(--border-subtle)] pl-3' : '')}>
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
              className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-gold)]"
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
        <div className="glass-panel rounded-[var(--radius-xl)] px-8 py-6 text-center">
          <div className="text-[var(--text-secondary)]">Loading the conversation...</div>
          <div className="mt-2 text-xs text-[var(--text-muted)]">Pulling in the latest messages and thread state.</div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="relative flex-1 w-full overflow-y-auto overflow-x-hidden px-4 pb-[calc(env(safe-area-inset-bottom)_+_24rem)] pt-4 md:px-3 md:pb-[calc(env(safe-area-inset-bottom)_+_6rem)]"
    >
      <div className="mx-auto w-full max-w-6xl">

      {loadingMore && (
        <div className="flex justify-center py-2 text-sm text-[var(--text-muted)]">
          <LoadingSpinner size="sm" /> Loading more...
        </div>
      )}


      {groupedMessages.map((group, index) => (
        <React.Fragment key={`${group.date}-${index}`}>
          <div className="flex items-center my-2">
            <hr className="flex-grow border-t border-[var(--border-panel)]" />
            <span className="mx-2 whitespace-nowrap rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">{group.date}</span>
            <hr className="flex-grow border-t border-[var(--border-panel)]" />
          </div>
          {group.messages.map((message: any, idx) => {
            const prev = group.messages[idx - 1] as any
            const isGrouped = shouldGroupMessage(message, prev)
            return (
              <React.Fragment key={message.id}>
                {firstUnreadMessageId === message.id && (
                  <div className="my-3 flex items-center gap-3">
                    <hr className="flex-grow border-t border-[rgba(34,197,94,0.24)]" />
                    <span className="rounded-full border border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[#86efac]">
                      Unread
                    </span>
                    <hr className="flex-grow border-t border-[rgba(34,197,94,0.24)]" />
                  </div>
                )}
                <div className={cn(isGrouped ? 'pt-1 pb-1' : 'pt-4 pb-1')}>
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
              </React.Fragment>
            )
          })}
        </React.Fragment>
      ))}

      {failedMessages.map(msg => (
        <FailedMessageItem key={msg.id} message={msg} onResend={onResend!} />
      ))}

      {(uploading || sending) && (
        <div className="flex items-center space-x-2 text-sm text-[var(--text-muted)]">
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
            className="mt-2 flex items-center space-x-2 text-sm text-[var(--text-muted)]"
          >
            <div className="flex space-x-1">
              <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--gold-3)]" />
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-[var(--gold-3)]"
                style={{ animationDelay: '0.1s' }}
              />
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-[var(--gold-3)]"
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
          className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)_+_10rem)] z-50 rounded-full border border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(255,240,184,0.18),rgba(215,170,70,0.12)_36%,rgba(122,89,24,0.5)_100%)] p-2 text-[var(--text-gold)] shadow-[var(--shadow-gold-soft)] transition-transform hover:-translate-y-0.5 md:bottom-32"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      )}
      </div>
    </div>
  )
}
