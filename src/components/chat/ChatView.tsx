import React, { useEffect, useState, useCallback } from 'react'
import { useMessages } from '../../hooks/useMessages'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { useFailedMessages } from '../../hooks/useFailedMessages'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import { MobileAppHeader } from '../layout/MobileAppHeader'
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
  const { messages, sendMessage, sending } = useMessages()
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
    replyToId?: string,
    thumbnailUrl?: string | null
  ) => {
    try {
      const msg = await sendMessage(content, type, fileUrl, replyToId, thumbnailUrl)
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
    <div className="theme-app-surface flex h-full min-h-0 flex-col text-sm">
      <MobileAppHeader
        currentView={currentView}
        onViewChange={onViewChange}
        title="Lounge"
        srTitle="General Chat"
        logo
        collapseOnKeyboard
      />

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
            enableGifPicker
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
          enableGifPicker
        />
      </MobileChatFooter>
    </div>
  )
}
