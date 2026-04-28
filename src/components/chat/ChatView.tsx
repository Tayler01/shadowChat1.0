import React, { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Users } from 'lucide-react'
import { useMessages } from '../../hooks/useMessages'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { PinnedMessagesBar } from './PinnedMessagesBar'
import { useFailedMessages } from '../../hooks/useFailedMessages'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import toast from 'react-hot-toast'
import { ClientResetIndicator } from '../ui/ClientResetIndicator'
import { useClientReset } from '../../hooks/ClientResetContext'
import {
  ensureSession,
} from '../../lib/supabase'
import { useVisibilityRefresh } from '../../hooks/useVisibilityRefresh'
import { clearGroupNotifications } from '../../lib/appBadge'

interface ChatViewProps {
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
  initialMessageId?: string
}

export const ChatView: React.FC<ChatViewProps> = ({ currentView, onViewChange, initialMessageId }) => {
  const { messages, sendMessage, sending, togglePin, toggleReaction } = useMessages()
  const pinnedMessages = messages.filter(m => m.pinned)
  const { status: resetStatus } = useClientReset()
  const { failedMessages, addFailedMessage, removeFailedMessage } = useFailedMessages('general')

  const [uploading, setUploading] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; content: string } | null>(null)

  const handleFocusRefresh = useCallback(async () => {
    // Let the visibility refresh hook handle client reset
    try {
      await ensureSession()
      await clearGroupNotifications()
    } catch {
      // ignore refresh errors
    }
  }, [])

  useVisibilityRefresh(handleFocusRefresh)

  useEffect(() => {
    void clearGroupNotifications()
  }, [])

  const handleReply = useCallback((id: string, content: string) => {
    setReplyTo({ id, content })
  }, [])

  const handleSendMessage = async (
    content: string,
    type?: 'text' | 'command' | 'audio' | 'image' | 'file',
    fileUrl?: string,
    replyToId?: string
  ) => {
    try {
      const msg = await sendMessage(content, type, fileUrl, replyToId)
      setReplyTo(null)
      return msg
    } catch {
      toast.error('Failed to send message')
      addFailedMessage({ id: Date.now().toString(), type: type || 'text', content: content, dataUrl: fileUrl })
      return null
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.05),transparent_26%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))] text-sm"
    >
      {/* Header */}
      <div className="glass-panel-strong flex-shrink-0 border-b border-[var(--border-panel)] px-6 py-5">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            {/* Menu button removed on mobile */}
            {/* Header title */}
            <div className="relative flex min-h-10 items-center gap-3 md:gap-4">
              <img
                src="/icons/header-logo.png"
                alt="SHADO"
                className="absolute -left-12 top-1/2 h-[5.75rem] w-44 -translate-y-1/2 object-contain object-left sm:-left-14 sm:w-48 md:hidden"
              />
              <div className="pl-28 sm:pl-32 md:pl-0">
                <h1 className="text-lg font-semibold text-[var(--text-primary)] md:text-xl">
                  General Chat
                </h1>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)] md:text-xs md:tracking-[0.18em]">
                  Lounge Channel
                </p>
              </div>
              <div className="hidden items-center gap-2 lg:flex">
                <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Live feed
                </span>
                <span className="rounded-full border border-[rgba(215,170,70,0.16)] bg-[rgba(215,170,70,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-gold)]">
                  {messages.length} messages loaded
                </span>
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
            <div className="flex items-center space-x-2 rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-sm text-[var(--text-muted)]">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Live now</span>
              <ClientResetIndicator status={resetStatus} />
            </div>
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
        onReply={handleReply}
        failedMessages={failedMessages}
        onResend={msg => {
          removeFailedMessage(msg.id)
          handleSendMessage(msg.content, msg.type, msg.dataUrl)
        }}
        sending={sending}
        uploading={uploading}
        initialMessageId={initialMessageId}
      />

      {/* Desktop Message Input */}
      <div className="hidden md:block">
        <div className="mx-auto w-full max-w-6xl">
          <MessageInput
            onSendMessage={handleSendMessage}
            placeholder='Try "@ai" to ask AI anything'
            cacheKey="general"
            onUploadStatusChange={setUploading}
            messages={messages}
            replyingTo={replyTo || undefined}
            onCancelReply={() => setReplyTo(null)}
          />
        </div>
      </div>

      {/* Mobile Message Input with Navigation */}
      <MobileChatFooter
        currentView={currentView}
        onViewChange={onViewChange}
      >
        <MessageInput
          onSendMessage={handleSendMessage}
          placeholder='Try "@ai" to ask AI anything'
          className="border-t border-[var(--border-panel)]"
          cacheKey="general"
          onUploadStatusChange={setUploading}
          messages={messages}
          replyingTo={replyTo || undefined}
          onCancelReply={() => setReplyTo(null)}
        />
      </MobileChatFooter>
    </motion.div>
  )
}
