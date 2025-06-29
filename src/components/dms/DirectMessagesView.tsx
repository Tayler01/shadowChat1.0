import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare,
  Search,
  Plus,
  ArrowLeft,
  UserPlus,
  Menu
} from 'lucide-react'
import { useDirectMessages } from '../../hooks/useDirectMessages'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { MessageInput } from '../chat/MessageInput'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import { formatTime, shouldGroupMessage } from '../../lib/utils'
import toast from 'react-hot-toast'

interface DirectMessagesViewProps {
  onToggleSidebar: () => void
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
}

export const DirectMessagesView: React.FC<DirectMessagesViewProps> = ({ onToggleSidebar, currentView, onViewChange }) => {
  const { profile } = useAuth()
  const {
    conversations,
    currentConversation,
    messages,
    setCurrentConversation,
    startConversation,
    sendMessage,
    markAsRead
  } = useDirectMessages()
  
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [searchUsername, setSearchUsername] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)

  const handleStartConversation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchUsername.trim()) return

    setSearchLoading(true)
    try {
      const conversationId = await startConversation(searchUsername.trim())
      if (conversationId) {
        setCurrentConversation(conversationId)
        setShowNewConversation(false)
        setSearchUsername('')
        toast.success('Conversation started!')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start conversation')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSendMessage = async (content: string) => {
    try {
      await sendMessage(content)
    } catch (error) {
      toast.error('Failed to send message')
    }
  }

  const handleConversationSelect = (conversationId: string) => {
    setCurrentConversation(conversationId)
    markAsRead(conversationId)
  }

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
              <button
                onClick={onToggleSidebar}
                className="md:hidden p-2 -ml-2 mr-2"
                aria-label="Toggle sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
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
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleStartConversation}
                className="space-y-3"
              >
                <Input
                  placeholder="Enter username..."
                  value={searchUsername}
                  onChange={(e) => setSearchUsername(e.target.value)}
                  className="text-sm"
                />
                <div className="flex space-x-2">
                  <Button
                    type="submit"
                    size="sm"
                    loading={searchLoading}
                    className="flex-1"
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Start Chat
                  </Button>
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
              </motion.form>
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
                        alt={conversation.other_user?.display_name}
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
                <button
                  onClick={onToggleSidebar}
                  className="md:hidden p-2 -ml-2"
                  aria-label="Toggle sidebar"
                >
                  <Menu className="w-5 h-5" />
                </button>
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
                  alt={currentConv.other_user?.display_name}
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
            <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-40 md:pb-32">
              {messages.map((message, index) => {
                const previousMessage = messages[index - 1]
                const isGrouped = shouldGroupMessage(message, previousMessage)
                const isOwn = message.sender_id === profile?.id

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
                          alt={message.sender?.display_name}
                          size="sm"
                          color={message.sender?.color}
                        />
                      )}
                      
                      <div className={`rounded-2xl px-4 py-2 ${
                        isOwn
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600'
                      }`}>
                        <p className="text-sm break-words">{message.content}</p>
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
            </div>

            {/* Desktop Message Input */}
            <div className="hidden md:block">
              <MessageInput
                onSendMessage={handleSendMessage}
                placeholder={`Message @${currentConv.other_user?.username}...`}
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
