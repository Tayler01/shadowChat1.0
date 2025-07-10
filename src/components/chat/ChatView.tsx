import React, { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Users, Sparkles } from 'lucide-react'
import { useMessages } from '../../hooks/useMessages'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { PinnedMessagesBar } from './PinnedMessagesBar'
import { AIAssistModal } from './AIAssistModal'
import { useFailedMessages } from '../../hooks/useFailedMessages'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import toast from 'react-hot-toast'
import { ClientResetIndicator } from '../ui/ClientResetIndicator'
import { useClientReset } from '../../hooks/ClientResetContext'
import {
  ensureSession,
} from '../../lib/supabase'
import type { Message } from '../../lib/supabase'
import { useVisibilityRefresh } from '../../hooks/useVisibilityRefresh'

interface ChatViewProps {
  onToggleSidebar: () => void
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
}

export const ChatView: React.FC<ChatViewProps> = ({ onToggleSidebar, currentView, onViewChange }) => {
  const { messages, sendMessage, sending, togglePin, toggleReaction } = useMessages()
  const pinnedMessages = messages.filter(m => m.pinned)
  const { status: resetStatus, lastResetTime } = useClientReset()
  const { failedMessages, addFailedMessage, removeFailedMessage } = useFailedMessages('general')

  const [uploading, setUploading] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [showAI, setShowAI] = useState(false)

  const handleFocusRefresh = useCallback(async () => {
    // Let the visibility refresh hook handle client reset
    try {
      await ensureSession()
    } catch {
    }
  }, [])

  useVisibilityRefresh(handleFocusRefresh)

  const handleReply = (id: string) => {
    const msg = messages.find(m => m.id === id) || null
    setReplyTo(msg)
  }

  const handleSendMessage = async (
    content: string,
    type?: 'text' | 'command' | 'audio' | 'image' | 'file',
    fileUrl?: string
  ) => {
    try {
      await sendMessage(content, type, fileUrl, replyTo?.id)
      setReplyTo(null)
    } catch {
      toast.error('Failed to send message')
      addFailedMessage({ id: Date.now().toString(), type: type || 'text', content: content, dataUrl: fileUrl })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 text-sm"
    >
      {/* Header */}
      <div className="hidden md:block flex-shrink-0 px-6 py-5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Menu button removed on mobile */}
            {/* Header title */}
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  General Chat
                </h1>
              </div>
              {pinnedMessages.length > 0 && (
                <PinnedMessagesBar
                  messages={pinnedMessages}
                  onUnpin={togglePin}
                  onToggleReaction={toggleReaction}
                  compact={true}
                />
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <Users className="w-4 h-4" />
              <span>Online</span>
              <ClientResetIndicator status={resetStatus} />
            </div>
            <button
              type="button"
              onClick={() => setShowAI(true)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Open AI assistant"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Pinned messages on mobile */}
      {pinnedMessages.length > 0 && (
        <div className="md:hidden px-4 pt-4">
          <PinnedMessagesBar
            messages={pinnedMessages}
            onUnpin={togglePin}
            onToggleReaction={toggleReaction}
          />
        </div>
      )}

      {/* Messages */}
      <MessageList
        failedMessages={failedMessages}
        onReply={handleReply}
        onResend={msg => {
          removeFailedMessage(msg.id)
          handleSendMessage(msg.content, msg.type, msg.dataUrl)
        }}
        sending={sending}
        uploading={uploading}
      />

      {/* Desktop Message Input */}
      <div className="hidden md:block">
        <MessageInput
          onSendMessage={handleSendMessage}
          replyingTo={replyTo || undefined}
          onCancelReply={() => setReplyTo(null)}
          placeholder="Type a message"
          cacheKey="general"
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
          replyingTo={replyTo || undefined}
          onCancelReply={() => setReplyTo(null)}
          placeholder="Type a message"
          className="border-t"
          cacheKey="general"
          onUploadStatusChange={setUploading}
        />
      </MobileChatFooter>

      <AIAssistModal
        open={showAI}
        messages={messages.slice(-20)}
        onClose={() => setShowAI(false)}
        onSendMessage={text => handleSendMessage(text, 'text')}
      />
    </motion.div>
  )
}
