import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare,
  Plus,
  ArrowLeft,
  Menu,
  ArrowDown
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
import toast from 'react-hot-toast'

interface DirectMessagesViewProps {
  onToggleSidebar: () => void
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
  initialConversation?: string
}

export const DirectMessagesView: React.FC<DirectMessagesViewProps> = ({ onToggleSidebar, currentView, onViewChange, initialConversation }) => {
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
    hasMore
  } = useDirectMessages()
  const { failedMessages, addFailedMessage, removeFailedMessage } = useFailedMessages(currentConversation || 'none')
  
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [searchUsername, setSearchUsername] = useState('')
  const [lastConversation, setLastConversation] = useState<string | null>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (initialConversation && currentConversation !== initialConversation) {
      setCurrentConversation(initialConversation)
      markAsRead(initialConversation)
    }
  }, [initialConversation, currentConversation, markAsRead])

  const handleUserSelect = async (user: { username: string }) => {
    try {
      const conversationId = await startConversation(user.username)
      if (conversationId) {
        setCurrentConversation(conversationId)
        setShowNewConversation(false)
        setSearchUsername('')
        toast.success('Conversation started!')
      }
    } catch {
      toast.error(error instanceof Error ? error.message : 'Failed to start conversation')
    }
  }

  const handleSendMessage = async (
    content: string,
    type?: 'text' | 'command' | 'audio' | 'image' | 'file',
    fileUrl?: string
  ) => {
    try {
      await sendMessage(content, type, fileUrl)
    } catch {
      toast.error('Failed to send message')
      addFailedMessage({ id: Date.now().toString(), type: type || 'text', content, dataUrl: fileUrl })
    }
  }

  const handleConversationSelect = (conversationId: string) => {
    setLastConversation(conversationId)
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
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
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

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {/* Conversations List */}
      <motion.div
        initial={{ x: -320 }}
        animate={{ x: 0 }}
        className={`flex-shrink-0 w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 ${
          currentConversation ? 'hidden lg:flex' : 'flex'
        } flex-col`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              {!isDesktop && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (lastConversation) {
                      setCurrentConversation(lastConversation)
                    } else {
                      onViewChange('chat')
                    }
                  }}
                  className="mr-2"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              {isDesktop && (
                <button
                  onClick={onToggleSidebar}
                  className="p-2 -ml-2 mr-2"
                  aria-label="Toggle sidebar"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Direct Messages
              </h2>
            </div>
            <Button
              size="sm"
              onClick={() => setShowNewConversation(true)}
              className="p-2"
              aria-label="Start new conversation"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* New Conversation Form */}
          <AnimatePresence>
            {showNewConversation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                <UserSearchSelect
                  value={searchUsername}
                  onChange={setSearchUsername}
                  onSelect={handleUserSelect}
                />
                <div className="flex justify-end">
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Start a new chat to get started</p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {conversations.map((conversation) => (
                <motion.button
                  key={conversation.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => handleConversationSelect(conversation.id)}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    currentConversation === conversation.id
                      ? 'bg-blue-100 dark:bg-blue-900'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <Avatar
                        src={conversation.other_user?.avatar_url}
                        alt={conversation.other_user?.display_name || 'Unknown User'}
                        size="md"
                        color={conversation.other_user?.color}
                        status={conversation.other_user?.status}
                        showStatus
                      />
                      {conversation.unread_count && conversation.unread_count > 0 && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                          {conversation.unread_count}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {conversation.other_user?.display_name}
                        </span>
                        {conversation.last_message && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTime(conversation.last_message.created_at)}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          @{conversation.other_user?.username}
                        </span>
                      </div>
                      
                      {conversation.last_message && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 truncate mt-1">
                          {conversation.last_message.content}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Current Conversation */}
      <div className="flex-1 flex flex-col">
        {currentConversation && currentConv ? (
          <>
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                {isDesktop && (
                  <button
                    onClick={onToggleSidebar}
                    className="p-2 -ml-2"
                    aria-label="Toggle sidebar"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentConversation(null)}
                  className="lg:hidden"
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
                
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                    {currentConv.other_user?.display_name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    @{currentConv.other_user?.username} • {currentConv.other_user?.status}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={messagesRef}
              onScroll={handleScroll}
              className="relative flex-1 w-full overflow-y-auto overflow-x-hidden p-4 space-y-3 pb-[calc(env(safe-area-inset-bottom)_+_24rem)] md:pb-[calc(env(safe-area-inset-bottom)_+_6rem)]"
            >
              {loadingMore && (
                <div className="flex justify-center py-2 text-gray-500 text-sm">
                  <LoadingSpinner size="sm" /> Loading more...
                </div>
              )}
              {messages.map((message, index) => {
                const previousMessage = messages[index - 1]
                const isGrouped = shouldGroupMessage(message, previousMessage)
                const isOwn = message.sender_id === profile?.id
                const bubbleColor = isOwn ? profile?.color : message.sender?.color
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
                    <div className={`flex items-end space-x-2 max-w-xs lg:max-w-md ${
                      isOwn ? 'flex-row-reverse space-x-reverse' : ''
                    }`}>
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
                          bubbleStyle ? '' : isOwn
                              ? 'bg-blue-600 text-white'
                              : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600'
                        }`}
                        style={bubbleStyle}
                      >
                        {message.message_type === 'audio' ? (
                          <audio controls src={message.content} className="mt-1 max-w-full" />
                        ) : message.message_type === 'image' && message.file_url ? (
                          <img src={message.file_url} alt="uploaded" className="mt-1 max-w-xs rounded" />
                        ) : message.message_type === 'file' && message.file_url ? (
                          <FileAttachment url={message.file_url} meta={message.content} />
                        ) : (
                          <p className="text-sm break-words">{message.content}</p>
                        )}
                        <p className={`text-xs mt-1 ${
                          isOwn ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {formatTime(message.created_at)}
                          {message.edited_at && ' (edited)'}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}

              {failedMessages.map(msg => (
                <FailedMessageItem key={msg.id} message={msg} onResend={m => {
                  removeFailedMessage(m.id)
                  handleSendMessage(m.content, m.type, m.dataUrl)
                }} />
              ))}

              {(uploading || sending) && (
                <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                  <LoadingSpinner size="sm" />
                  <span>{uploading ? 'Uploading...' : 'Sending...'}</span>
                </div>
              )}

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

            {/* Desktop Message Input */}
            <div className="hidden md:block">
              <MessageInput
                onSendMessage={handleSendMessage}
                placeholder={`Message @${currentConv.other_user?.username}...`}
                cacheKey={`dm-${currentConversation}`}
                onUploadStatusChange={setUploading}
              />
            </div>

            {/* Mobile Message Input with Navigation */}
            <MobileChatFooter
              currentView={currentView}
              onViewChange={onViewChange}
            >
              <MessageInput
                onSendMessage={handleSendMessage}
                placeholder={`Message @${currentConv.other_user?.username}...`}
                className="border-t"
                cacheKey={`dm-${currentConversation}`}
                onUploadStatusChange={setUploading}
              />
            </MobileChatFooter>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">Select a conversation</h3>
              <p className="text-sm">Choose a conversation from the sidebar or start a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
