import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare,
  Plus,
  ArrowLeft,
  ArrowDown,
  X,
} from 'lucide-react'
import { useDirectMessages } from '../../hooks/useDirectMessages'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { UserSearchSelect } from './UserSearchSelect'
import { MessageInput } from '../chat/MessageInput'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import { FailedMessageItem } from '../chat/FailedMessageItem'
import { FileAttachment } from '../chat/FileAttachment'
import { useFailedMessages } from '../../hooks/useFailedMessages'
import { formatTime, shouldGroupMessage, getReadableTextColor } from '../../lib/utils'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { useTyping } from '../../hooks/useTyping'
import toast from 'react-hot-toast'
import type { BasicUser } from '../../lib/supabase'

interface DirectMessagesViewProps {
  onToggleSidebar: () => void
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
  initialConversation?: string
}

export const DirectMessagesView: React.FC<DirectMessagesViewProps> = ({
  onToggleSidebar: _onToggleSidebar,
  currentView,
  onViewChange,
  initialConversation,
}) => {
  const { profile } = useAuth()
  const isDesktop = useIsDesktop()
  const {
    conversations,
    currentConversation,
    messages,
    setCurrentConversation,
    startConversation,
    sendMessage,
    markAsRead,
    sending,
    loadOlderMessages,
    loadingMore,
    hasMore,
  } = useDirectMessages()
  const { failedMessages, addFailedMessage, removeFailedMessage } = useFailedMessages(currentConversation || 'none')

  const [showNewConversation, setShowNewConversation] = useState(false)
  const [searchUsername, setSearchUsername] = useState('')
  const [startingUsername, setStartingUsername] = useState<string | null>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [uploading, setUploading] = useState(false)
  const { typingUsers } = useTyping(currentConversation ? `dm-${currentConversation}` : 'none')

  useEffect(() => {
    if (initialConversation && currentConversation !== initialConversation) {
      setCurrentConversation(initialConversation)
      markAsRead(initialConversation)
    }
  }, [initialConversation, currentConversation, markAsRead, setCurrentConversation])

  useEffect(() => {
    if (!isDesktop || initialConversation || currentConversation || conversations.length === 0) {
      return
    }

    setCurrentConversation(conversations[0].id)
  }, [conversations, currentConversation, initialConversation, isDesktop, setCurrentConversation])

  useEffect(() => {
    if (!currentConversation) return
    const conv = conversations.find(c => c.id === currentConversation)
    if (conv && (conv.unread_count || 0) > 0) {
      markAsRead(currentConversation)
    }
  }, [currentConversation, conversations, markAsRead])

  const handleUserSelect = async (user: { username: string }) => {
    const normalizedUsername = user.username.trim().toLowerCase()
    const existingConversation = conversations.find(
      conversation => conversation.other_user?.username?.toLowerCase() === normalizedUsername
    )

    if (existingConversation) {
      handleConversationSelect(existingConversation.id)
      setShowNewConversation(false)
      setSearchUsername('')
      toast.success(`Opened @${user.username}`)
      return
    }

    try {
      setStartingUsername(user.username)
      const conversationId = await startConversation(user.username)
      if (conversationId) {
        setCurrentConversation(conversationId)
        setShowNewConversation(false)
        setSearchUsername('')
        toast.success(`Opened @${user.username}`)
      }
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Failed to start conversation')
    } finally {
      setStartingUsername(null)
    }
  }

  const handleSendMessage = async (
    content: string,
    type?: 'text' | 'command' | 'audio' | 'image' | 'file',
    fileUrl?: string
  ) => {
    try {
      await sendMessage(content, type, fileUrl)
    } catch (error) {
      console.error(error)
      toast.error('Failed to send message')
      addFailedMessage({ id: Date.now().toString(), type: type || 'text', content, dataUrl: fileUrl })
    }
  }

  const handleConversationSelect = (conversationId: string) => {
    setCurrentConversation(conversationId)
    markAsRead(conversationId)
  }

  const handleScroll = useCallback(() => {
    const el = messagesRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 20
    setAutoScroll(atBottom)
    if (el.scrollTop < 100 && hasMore && !loadingMore) {
      loadOlderMessages()
    }
  }, [hasMore, loadingMore, loadOlderMessages])

  const scrollToBottom = useCallback(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTo({
        top: messagesRef.current.scrollHeight,
        behavior: 'smooth',
      })
      setAutoScroll(true)
    }
  }, [])

  useEffect(() => {
    if (autoScroll && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages, currentConversation, autoScroll])

  useEffect(() => {
    setAutoScroll(true)
  }, [currentConversation])

  const currentConv = conversations.find(c => c.id === currentConversation)
  const showConversationList = isDesktop || !currentConversation
  const searchableUsers: BasicUser[] = conversations.flatMap(conversation => {
    const user = conversation.other_user
    if (!user) {
      return []
    }

    return [{
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      color: user.color,
      status: user.status,
    }]
  })

  return (
    <div className="flex h-full bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.05),transparent_28%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))]">
      <motion.div
        initial={{ x: -320 }}
        animate={{ x: 0 }}
        className={`glass-panel-strong relative flex-shrink-0 w-full border-r border-[var(--border-panel)] lg:w-[22rem] ${
          showConversationList ? 'flex' : 'hidden lg:flex'
        } flex-col`}
      >
        <div className="border-b border-[var(--border-panel)] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center">
              {!isDesktop && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewChange('chat')}
                  className="mr-2"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src="/icons/header-logo.png"
                  alt="SHADO"
                  className="h-9 w-24 shrink-0 object-contain object-left md:hidden"
                />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-[var(--text-primary)] md:text-lg">
                    Direct Messages
                  </h2>
                  {!isDesktop && (
                    <p className="truncate text-[11px] text-[var(--text-muted)]">
                      Open a thread or jump back in.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setShowNewConversation(true)}
              className="gap-2 p-2 sm:px-3"
              aria-label="Start new conversation"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>

          <div className="mb-3 flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
            <span>{conversations.length} thread{conversations.length === 1 ? '' : 's'}</span>
            <span>{conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0)} unread</span>
          </div>
        </div>

        <AnimatePresence>
          {showNewConversation && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="absolute inset-0 z-20 flex flex-col bg-[linear-gradient(180deg,rgba(7,8,9,0.94),rgba(10,11,12,0.98))] backdrop-blur-xl"
            >
              <div className="border-b border-[var(--border-panel)] px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">
                      Start a new DM
                    </h3>
                    <p className="text-sm text-[var(--text-muted)]">
                      Tap a person once and we’ll drop you straight into the thread.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 rounded-xl p-0"
                    onClick={() => {
                      setShowNewConversation(false)
                      setSearchUsername('')
                    }}
                    aria-label="Close new conversation"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <UserSearchSelect
                  value={searchUsername}
                  onChange={setSearchUsername}
                  onSelect={handleUserSelect}
                  users={searchableUsers}
                  autoFocus
                  inlineResults
                  pendingUsername={startingUsername}
                  title={!isDesktop ? 'Find someone to message' : undefined}
                  description={!isDesktop ? 'Search by username or pick from the people already in your network.' : undefined}
                />
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNewConversation(false)
                      setSearchUsername('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-[var(--text-muted)]">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm text-[var(--text-primary)]">No conversations yet</p>
              <p className="mt-1 text-xs">Start a private chat to build your inbox.</p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {conversations.map(conversation => {
                const unreadCount = conversation.unread_count || 0

                return (
                <motion.button
                  key={conversation.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  type="button"
                  onClick={() => handleConversationSelect(conversation.id)}
                  className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-all ${
                    currentConversation === conversation.id
                      ? 'border-[var(--border-glow)] bg-[rgba(255,255,255,0.05)] shadow-[var(--shadow-gold-soft)]'
                      : 'border-transparent hover:border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.03)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={conversation.other_user?.avatar_url}
                      alt={conversation.other_user?.display_name || 'Unknown User'}
                      size="md"
                      color={conversation.other_user?.color}
                      status={conversation.other_user?.status}
                      showStatus
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate font-medium text-[var(--text-primary)]">
                          {conversation.other_user?.display_name}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="truncate text-xs text-[var(--text-muted)]">
                          @{conversation.other_user?.username}
                        </span>
                      </div>

                      {conversation.last_message && (
                        <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">
                          {conversation.last_message.content}
                        </p>
                      )}
                    </div>

                    <div className="ml-auto flex min-w-[3.5rem] shrink-0 flex-col items-end gap-2 text-right">
                      {conversation.last_message && (
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatTime(conversation.last_message.created_at)}
                        </span>
                      )}
                      {unreadCount > 0 && (
                        <span className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full border border-[rgba(215,170,70,0.3)] bg-[rgba(215,170,70,0.14)] px-2 py-0.5 text-xs font-medium text-[var(--text-gold)]">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>

      <div className="flex flex-1 flex-col">
        {currentConversation && currentConv ? (
          <>
            <div className="glass-panel-strong flex-shrink-0 border-b border-[var(--border-panel)] px-6 py-4">
              <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentConversation(null)}
                  className="h-10 w-10 rounded-xl p-0 lg:hidden"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>

                <Avatar
                  src={currentConv.other_user?.avatar_url}
                  alt={currentConv.other_user?.display_name || 'Unknown User'}
                  size="md"
                  color={currentConv.other_user?.color}
                  status={currentConv.other_user?.status}
                  showStatus
                />

                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-[var(--text-primary)]">
                    {currentConv.other_user?.display_name}
                  </h2>
                  <p className="truncate text-xs sm:text-sm text-[var(--text-muted)]">
                    @{currentConv.other_user?.username} {'\u2022'} {currentConv.other_user?.status}
                  </p>
                </div>
                <img
                  src="/icons/header-logo.png"
                  alt="SHADO"
                  className="ml-auto h-8 w-20 shrink-0 object-contain object-right md:hidden"
                />
              </div>
            </div>

            <div
              ref={messagesRef}
              onScroll={handleScroll}
              className="relative flex-1 w-full overflow-y-auto overflow-x-hidden p-4 space-y-3 pb-[calc(env(safe-area-inset-bottom)_+_10.5rem)] md:pb-[calc(env(safe-area-inset-bottom)_+_6rem)]"
            >
              <div className="mx-auto w-full max-w-4xl space-y-3">
              {loadingMore && (
                <div className="flex justify-center py-2 text-sm text-[var(--text-muted)]">
                  <LoadingSpinner size="sm" /> Loading more...
                </div>
              )}

              {messages.length === 0 && !loadingMore && (
                <div className="glass-panel rounded-[var(--radius-xl)] px-8 py-8 text-center text-[var(--text-muted)]">
                  <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <h3 className="mb-2 text-lg font-medium text-[var(--text-primary)]">Say hello to {currentConv.other_user?.display_name}</h3>
                  <p className="text-sm">This thread is ready. Send the first message and the conversation will show up here immediately.</p>
                </div>
              )}

              {messages.map((message, index) => {
                const previousMessage = messages[index - 1]
                const isGrouped = shouldGroupMessage(message, previousMessage)
                const isOwn = message.sender_id === profile?.id
                const bubbleColor = undefined
                const bubbleStyle = bubbleColor
                  ? { backgroundColor: bubbleColor, color: getReadableTextColor(bubbleColor) }
                  : undefined

                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${
                      isGrouped ? 'mt-1' : 'mt-4'
                    }`}
                  >
                    <div
                      className={`flex max-w-[85%] items-end space-x-2 sm:max-w-xs lg:max-w-md ${
                        isOwn ? 'flex-row-reverse space-x-reverse' : ''
                      }`}
                    >
                      {!isGrouped && !isOwn && (
                        <Avatar
                          src={message.sender?.avatar_url}
                          alt={message.sender?.display_name || 'Unknown User'}
                          size="sm"
                          color={message.sender?.color}
                        />
                      )}

                      <div
                        className={`rounded-2xl px-4 py-2 ${
                          bubbleStyle
                            ? ''
                            : isOwn
                              ? 'border border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(255,240,184,0.16),rgba(215,170,70,0.1)_34%,rgba(122,89,24,0.45)_100%)] text-[var(--text-primary)] shadow-[var(--shadow-gold-soft)]'
                              : 'border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-[var(--shadow-panel)]'
                        }`}
                        style={bubbleStyle}
                      >
                        {message.message_type === 'audio' ? (
                          <audio controls src={message.audio_url} className="mt-1 max-w-full" />
                        ) : message.message_type === 'image' && message.file_url ? (
                          <img
                            src={message.file_url}
                            alt="uploaded"
                            className="mt-1 max-w-xs rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
                          />
                        ) : message.message_type === 'file' && message.file_url ? (
                          <FileAttachment url={message.file_url} meta={message.content} />
                        ) : (
                          <p className="break-words text-sm">{message.content}</p>
                        )}
                        <p className={`mt-1 text-xs ${isOwn ? 'text-[var(--text-gold)]/85' : 'text-[var(--text-muted)]'}`}>
                          {formatTime(message.created_at)}
                          {message.edited_at && ' (edited)'}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}

              {failedMessages.map(msg => (
                <FailedMessageItem
                  key={msg.id}
                  message={msg}
                  onResend={m => {
                    removeFailedMessage(m.id)
                    handleSendMessage(m.content, m.type, m.dataUrl)
                  }}
                />
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
                      <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--gold-3)]" style={{ animationDelay: '0.1s' }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--gold-3)]" style={{ animationDelay: '0.2s' }} />
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

            <div className="hidden md:block">
              <div className="mx-auto w-full max-w-4xl">
                <MessageInput
                  onSendMessage={handleSendMessage}
                  placeholder={`Message @${currentConv.other_user?.username}...`}
                  cacheKey={`dm-${currentConversation}`}
                  onUploadStatusChange={setUploading}
                  messages={messages}
                  typingChannel={`dm-${currentConversation}`}
                />
              </div>
            </div>

            <MobileChatFooter
              currentView={currentView}
              onViewChange={onViewChange}
            >
              <MessageInput
                onSendMessage={handleSendMessage}
                placeholder={`Message @${currentConv.other_user?.username}...`}
                className="border-t border-[var(--border-panel)]"
                cacheKey={`dm-${currentConversation}`}
                onUploadStatusChange={setUploading}
                messages={messages}
                typingChannel={`dm-${currentConversation}`}
              />
            </MobileChatFooter>
          </>
        ) : (
            <div className="flex flex-1 items-center justify-center">
            <div className="glass-panel max-w-md rounded-[var(--radius-xl)] px-8 py-8 text-center text-[var(--text-muted)]">
              <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <h3 className="mb-2 text-lg font-medium text-[var(--text-primary)]">Select a conversation</h3>
              <p className="text-sm">Choose a thread on the left or start a new one to jump straight into chat.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
