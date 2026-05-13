import React, { useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDown } from 'lucide-react'
import { useMessages } from '../../hooks/useMessages'
import { useTyping } from '../../hooks/useTyping'
import { groupMessagesByDate, cn, shouldGroupMessage } from '../../lib/utils'
import { MessageItem } from './MessageItem'
import type { FailedMessage } from '../../hooks/useFailedMessages'
import { FailedMessageItem } from './FailedMessageItem'
import toast from 'react-hot-toast'
import type { Message } from '../../lib/supabase'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { useAuth } from '../../hooks/useAuth'
import { UserRoleBadge } from '../ui/UserRoleBadge'
import { UserPresenceBadge } from '../ui/UserPresenceBadge'
import { getBlockedActionMessage } from '../../lib/moderation'
import { showActionErrorToast } from '../../lib/toastNotifications'
import { useReadCursor } from '../../hooks/useReadCursor'
import { useUnreadScroll } from '../../hooks/useUnreadScroll'
import { UnreadDivider } from './UnreadDivider'

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
  const initialTargetJumpDoneRef = useRef<string | null>(null)
  const { cursor, loading: cursorLoading, markRead } = useReadCursor('general_chat', 'main', Boolean(profile?.id))

  const messageMap = useMemo(() => {
    const msgMap = new Map<string, Message>()
    messages.forEach(m => {
      msgMap.set(m.id, m)
    })
    return msgMap
  }, [messages])

  const jumpToMessage = useCallback(
    (id: string) => {
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
    []
  )

  const combinedMessages = useMemo(() => {
    return [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [messages])

  const groupedMessages = useMemo(
    () => groupMessagesByDate(combinedMessages as any[]),
    [combinedMessages]
  )

  const markGeneralChatRead = useCallback(
    async (message: Message) => {
      await markRead(message.id, message.created_at)
    },
    [markRead]
  )
  const getMessageId = useCallback((message: Message) => message.id, [])
  const getMessageCreatedAt = useCallback((message: Message) => message.created_at, [])
  const getMessageElementId = useCallback((id: string) => `message-${id}`, [])

  const {
    autoScroll,
    firstUnreadMessageId,
    setAutoScroll,
    setFirstUnreadMessageId,
    handleUnreadScroll,
    scrollToBottom,
    markLatestRead,
  } = useUnreadScroll<Message>({
    containerRef,
    messages: combinedMessages as Message[],
    loading,
    cursor,
    cursorLoading,
    enabled: Boolean(profile?.id),
    surfaceKey: 'general_chat:main',
    initialMessageId,
    getMessageId,
    getMessageCreatedAt,
    getElementId: getMessageElementId,
    onMarkReadToLatest: markGeneralChatRead,
  })

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return

    handleUnreadScroll()

    if (el.scrollTop < 100 && hasMore && !loadingMore) {
      prevHeightRef.current = el.scrollHeight
      prevScrollTopRef.current = el.scrollTop
      loadOlderMessages()
    }
  }, [handleUnreadScroll, hasMore, loadingMore, loadOlderMessages])

  useEffect(() => {
    initialTargetJumpDoneRef.current = null
  }, [profile?.id])

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
  }, [loadingMore, messages.length])

  useEffect(() => {
    if (autoScroll && typingUsers.length > 0) {
      scrollToBottom('auto')
    }
  }, [autoScroll, scrollToBottom, typingUsers.length])

  useEffect(() => {
    let frameId: number | null = null
    let settleFrameId: number | null = null
    let settleTimerId: number | null = null

    const keepLatestVisible = () => {
      if (!autoScroll) return

      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      if (settleFrameId !== null) {
        cancelAnimationFrame(settleFrameId)
      }
      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId)
      }

      frameId = requestAnimationFrame(() => {
        frameId = null
        scrollToBottom('auto')
        settleFrameId = requestAnimationFrame(() => {
          settleFrameId = null
          scrollToBottom('auto')
        })
        settleTimerId = window.setTimeout(() => {
          settleTimerId = null
          scrollToBottom('auto')
        }, 140)
      })
    }

    keepLatestVisible()
    window.visualViewport?.addEventListener('resize', keepLatestVisible)
    window.visualViewport?.addEventListener('scroll', keepLatestVisible)
    window.addEventListener('resize', keepLatestVisible)
    window.addEventListener('focusin', keepLatestVisible)

    return () => {
      window.visualViewport?.removeEventListener('resize', keepLatestVisible)
      window.visualViewport?.removeEventListener('scroll', keepLatestVisible)
      window.removeEventListener('resize', keepLatestVisible)
      window.removeEventListener('focusin', keepLatestVisible)
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      if (settleFrameId !== null) {
        cancelAnimationFrame(settleFrameId)
      }
      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId)
      }
    }
  }, [autoScroll, combinedMessages.length, scrollToBottom])

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
      void markLatestRead(false)
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[rgba(34,197,94,0.55)]')
      }, 2200)
    })
  }, [combinedMessages, initialMessageId, loading, markLatestRead, setAutoScroll, setFirstUnreadMessageId])

  const handleEdit = useCallback(async (messageId: string, content: string) => {
    try {
      await editMessage(messageId, content)
      toast.success('Message updated')
    } catch (error) {
      const message = await getBlockedActionMessage('general_chat', error, 'Failed to update message')
      showActionErrorToast(message)
    }
  }, [editMessage])

  const handleDelete = useCallback(async (messageId: string) => {
    try {
      await deleteMessage(messageId)
      toast.success('Message deleted')
    } catch (error) {
      const message = await getBlockedActionMessage('general_chat', error, 'Failed to delete message')
      showActionErrorToast(message)
    }
  }, [deleteMessage])

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
      data-testid="message-scroll"
      className="relative flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden px-4 pb-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-mobile-scroll-keyboard-inset,0px)_+_0.75rem)] pt-4 md:px-3 md:pb-[calc(env(safe-area-inset-bottom)_+_6rem)]"
    >
      <div data-testid="message-stack" className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-end">

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
          {group.messages.map((groupMessage, idx) => {
            const message = groupMessage as Message
            const prev = group.messages[idx - 1] as Message | undefined
            const isGrouped = shouldGroupMessage(message, prev)
            return (
              <React.Fragment key={message.id}>
                {firstUnreadMessageId === message.id && (
                  <UnreadDivider />
                )}
                <div className={cn(isGrouped ? 'pt-1 pb-1' : 'pt-4 pb-1')}>
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
              <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--theme-accent)]" />
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-[var(--theme-accent)]"
                style={{ animationDelay: '0.1s' }}
              />
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-[var(--theme-accent)]"
                style={{ animationDelay: '0.2s' }}
              />
            </div>
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {typingUsers.map((typingUser, index) => (
                <React.Fragment key={typingUser.id}>
                  {index > 0 && <span>,</span>}
                  <span className="inline-flex items-center gap-1">
                    {typingUser.display_name}
                    <UserRoleBadge role={typingUser.admin_role} />
                    <UserPresenceBadge userId={typingUser.id} presenceVisibility={typingUser.presence_visibility} />
                  </span>
                </React.Fragment>
              ))}
              <span>{typingUsers.length === 1 ? 'is' : 'are'} typing...</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {!autoScroll && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          aria-label="Jump to latest"
          className="theme-floating-action fixed right-4 bottom-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-keyboard-inset,0px)_+_0.5rem)] z-50 rounded-full p-2 transition-transform hover:-translate-y-0.5 md:bottom-32"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      )}
      </div>
    </div>
  )
}
