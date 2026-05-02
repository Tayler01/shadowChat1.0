import React, { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useMessages } from '../../hooks/useMessages'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { PinnedMessagesBar } from './PinnedMessagesBar'
import { useFailedMessages } from '../../hooks/useFailedMessages'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import toast from 'react-hot-toast'
import { useClientReset } from '../../hooks/ClientResetContext'
import { ActiveUsersButton } from './ActiveUsersButton'
import { WeatherWidget } from './WeatherWidget'
import { clearGroupNotifications } from '../../lib/appBadge'
import {
  SESSION_RECOVERY_EVENT,
  type SessionRecoveryResult,
} from '../../lib/sessionRecovery'
import type { ChatMessageType } from '../../lib/supabase'

interface ChatViewProps {
  currentView: 'chat' | 'dms' | 'news' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'news' | 'settings') => void
  initialMessageId?: string
}

export const ChatView: React.FC<ChatViewProps> = ({ currentView, onViewChange, initialMessageId }) => {
  const { messages, sendMessage, sending, togglePin, toggleReaction } = useMessages()
  const pinnedMessages = messages.filter(m => m.pinned)
  const { status: resetStatus } = useClientReset()
  const { failedMessages, addFailedMessage, removeFailedMessage } = useFailedMessages('general')

  const [uploading, setUploading] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; content: string } | null>(null)

  useEffect(() => {
    void clearGroupNotifications()
  }, [])

  useEffect(() => {
    const handleSessionRecovery = (event: Event) => {
      const result = (event as CustomEvent<SessionRecoveryResult>).detail
      if (result?.ok) {
        void clearGroupNotifications()
      }
    }

    window.addEventListener(SESSION_RECOVERY_EVENT, handleSessionRecovery)
    return () => window.removeEventListener(SESSION_RECOVERY_EVENT, handleSessionRecovery)
  }, [])

  const handleReply = useCallback((id: string, content: string) => {
    setReplyTo({ id, content })
  }, [])

  const handleSendMessage = async (
    content: string,
    type?: ChatMessageType,
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
      <div className="glass-panel-strong relative z-30 flex-shrink-0 border-b border-[var(--border-panel)] px-4 py-1.5 md:px-6">
        <div className="mx-auto flex min-h-9 w-full max-w-6xl items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center">
            {/* Menu button removed on mobile */}
            {/* Header title */}
            <div className="relative flex min-w-0 items-center gap-2 md:gap-4">
              <img
                src="/icons/header-logo.png"
                alt="SHADO"
                className="h-8 w-16 flex-shrink-0 object-contain object-left sm:h-10 sm:w-20 md:hidden"
              />
              <div className="min-w-0">
                <h1 className="sr-only">General Chat</h1>
                <p className="truncate text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] sm:tracking-[0.18em] md:text-xs">
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
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
            <WeatherWidget onOpenSettings={() => onViewChange('settings')} />
            <ActiveUsersButton resetStatus={resetStatus} />
          </div>
        </div>
      </div>

      {/* Pinned messages */}
      {pinnedMessages.length > 0 && (
        <div className="px-4 pt-4 md:px-3">
          <div className="mx-auto w-full max-w-6xl">
          <PinnedMessagesBar
            messages={pinnedMessages}
            onUnpin={togglePin}
            onToggleReaction={toggleReaction}
          />
          </div>
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
