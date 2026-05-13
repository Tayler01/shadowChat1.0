import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useMessages } from '../../hooks/useMessages'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { PinnedMessagesButton } from './PinnedMessagesButton'
import { useFailedMessages } from '../../hooks/useFailedMessages'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import { useClientReset } from '../../hooks/ClientResetContext'
import { ActiveUsersButton } from './ActiveUsersButton'
import { WeatherWidget } from './WeatherWidget'
import { clearGroupNotifications } from '../../lib/appBadge'
import { getBlockedActionMessage, getCurrentUserChannelBan, formatChannelBanBlockMessage } from '../../lib/moderation'
import { showActionErrorToast } from '../../lib/toastNotifications'
import {
  SESSION_RECOVERY_EVENT,
  type SessionRecoveryResult,
} from '../../lib/sessionRecovery'
import type { ChatMessageType } from '../../lib/supabase'
import type { AppView } from '../../types/navigation'

interface ChatViewProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  initialMessageId?: string
}

export const ChatView: React.FC<ChatViewProps> = ({ currentView, onViewChange, initialMessageId }) => {
  const { messages, sendMessage, sending, togglePin, toggleReaction } = useMessages()
  const pinnedMessages = useMemo(() => messages.filter(m => m.pinned), [messages])
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
    } catch (error) {
      const activeBan = await getCurrentUserChannelBan('general_chat').catch(() => null)
      if (activeBan) {
        showActionErrorToast(formatChannelBanBlockMessage(activeBan))
        return null
      }

      const message = await getBlockedActionMessage('general_chat', error, 'Failed to send message')
      showActionErrorToast(message)
      if (!(error as { optimisticMessageId?: string })?.optimisticMessageId) {
        addFailedMessage({ id: Date.now().toString(), type: type || 'text', content: content, dataUrl: fileUrl })
      }
      return null
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="theme-app-surface flex h-full min-h-0 flex-col text-sm"
    >
      {/* Header */}
      <div className="glass-panel-strong relative z-30 flex-shrink-0 border-b border-[var(--border-panel)] px-4 py-1.5 md:px-6">
        <div className="mx-auto flex min-h-9 w-full max-w-6xl items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center">
            {/* Menu button removed on mobile */}
            {/* Header title */}
            <div className="relative -ml-3 flex min-w-0 items-center gap-4 md:ml-0 md:gap-4">
              <span className="relative h-8 w-20 flex-shrink-0 overflow-visible sm:h-10 sm:w-24 md:hidden">
                <img
                  src="/icons/header-logo.png"
                  alt="SHADO"
                  className="theme-logo absolute left-0 top-1/2 h-12 w-28 origin-left -translate-y-1/2 scale-[1.3] object-contain object-left sm:h-14 sm:w-32"
                />
              </span>
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
                <span className="theme-accent-chip rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em]">
                  {messages.length} messages loaded
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
            <WeatherWidget onOpenSettings={() => onViewChange('settings')} />
            <PinnedMessagesButton
              messages={pinnedMessages}
              onUnpin={togglePin}
              onToggleReaction={toggleReaction}
            />
            <ActiveUsersButton resetStatus={resetStatus} />
          </div>
        </div>
      </div>

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
