import React, { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { useMessages } from '../../hooks/useMessages'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import { MobileAppHeader } from '../layout/MobileAppHeader'
import { clearGroupNotifications } from '../../lib/appBadge'
import { getBlockedActionMessage, getCurrentUserChannelBan, formatChannelBanBlockMessage } from '../../lib/moderation'
import { showActionErrorToast } from '../../lib/toastNotifications'
import {
  SESSION_RECOVERY_EVENT,
  type SessionRecoveryResult,
} from '../../lib/sessionRecovery'
import { resolveGeneralChatThreadId, type ChatMessageType } from '../../lib/supabase'
import type { AppView } from '../../types/navigation'
import type { Message } from '../../lib/supabase'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import type { ChatThreadRouteAction } from '../../lib/appRouting'

const LazyGeneralChatRoomTools = lazy(() => import('./GeneralChatRoomTools').then(module => ({
  default: module.GeneralChatRoomTools,
})))

const LazyGeneralChatThreadSheet = lazy(() => import('../../features/general-chat-threads').then(module => ({
  default: module.GeneralChatThreadSheet,
})))

interface ChatViewProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  initialMessageId?: string
  initialThreadId?: string
  onThreadRoute?: (action: ChatThreadRouteAction, threadRootId?: string, targetMessageId?: string) => void
}

export const ChatView: React.FC<ChatViewProps> = ({
  currentView,
  onViewChange,
  initialMessageId,
  initialThreadId,
  onThreadRoute,
}) => {
  const isDesktop = useIsDesktop()
  const {
    messages,
    sendMessage,
    sending,
    retryFailedMessage,
    discardFailedMessage,
    refreshThreadSummaries = async () => {},
  } = useMessages()

  const [uploading, setUploading] = useState(false)
  const [localThreadId, setLocalThreadId] = useState<string | null>(initialThreadId ?? null)
  const activeThreadId = initialThreadId ?? localThreadId
  const loungeScrollTopRef = useRef<number | null>(null)

  const captureLoungeScroll = useCallback(() => {
    const scroll = document.querySelector<HTMLElement>('[data-testid="message-scroll"]')
    if (scroll) loungeScrollTopRef.current = scroll.scrollTop
  }, [])

  const restoreLoungeScroll = useCallback(() => {
    const savedTop = loungeScrollTopRef.current
    if (savedTop === null) return
    const restore = () => {
      const scroll = document.querySelector<HTMLElement>('[data-testid="message-scroll"]')
      if (scroll) scroll.scrollTop = savedTop
    }
    restore()
    window.requestAnimationFrame(() => {
      restore()
      window.requestAnimationFrame(restore)
    })
    window.setTimeout(restore, 120)
  }, [])

  useEffect(() => {
    setLocalThreadId(initialThreadId ?? null)
  }, [initialThreadId])

  useEffect(() => {
    if (activeThreadId) restoreLoungeScroll()
    else if (loungeScrollTopRef.current !== null) {
      restoreLoungeScroll()
      loungeScrollTopRef.current = null
    }
  }, [activeThreadId, restoreLoungeScroll])

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

  const openThread = useCallback((message: Message, targetMessageId = message.id) => {
    captureLoungeScroll()
    setLocalThreadId(message.id)
    onThreadRoute?.('push-thread', message.id, targetMessageId)
  }, [captureLoungeScroll, onThreadRoute])

  const handleReply = useCallback((message: Message) => {
    openThread(message)
  }, [openThread])

  useEffect(() => {
    if (!initialMessageId || initialThreadId) return
    let cancelled = false
    void resolveGeneralChatThreadId(initialMessageId)
      .then(threadId => {
        if (cancelled || !threadId) return
        captureLoungeScroll()
        setLocalThreadId(threadId)
        onThreadRoute?.('replace-thread', threadId, initialMessageId)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [captureLoungeScroll, initialMessageId, initialThreadId, onThreadRoute])

  const closeThread = useCallback(() => {
    if (activeThreadId) void refreshThreadSummaries([activeThreadId]).catch(() => undefined)
    setLocalThreadId(null)
    onThreadRoute?.('close-thread', activeThreadId ?? undefined, initialMessageId)
  }, [activeThreadId, initialMessageId, onThreadRoute, refreshThreadSummaries])

  const handleSendMessage = async (
    content: string,
    type?: ChatMessageType,
    fileUrl?: string,
    replyToId?: string,
    thumbnailUrl?: string | null
  ) => {
    try {
      const msg = await sendMessage(content, type, fileUrl, replyToId, thumbnailUrl)
      return msg
    } catch (error) {
      const activeBan = await getCurrentUserChannelBan('general_chat').catch(() => null)
      if (activeBan) {
        showActionErrorToast(formatChannelBanBlockMessage(activeBan))
        return null
      }

      const message = await getBlockedActionMessage('general_chat', error, 'Failed to send message')
      showActionErrorToast(message)
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
        actions={isDesktop ? (
          <Suspense fallback={null}>
            <LazyGeneralChatRoomTools onViewChange={onViewChange} />
          </Suspense>
        ) : null}
        className="hidden md:flex"
      />

      {/* Messages */}
      <MessageList
        onReply={handleReply}
        onOpenThread={openThread}
        onRetryFailed={retryFailedMessage}
        onDiscardFailed={discardFailedMessage}
        sending={sending}
        uploading={uploading}
        initialMessageId={initialMessageId}
      />

      {/* Desktop Message Input */}
      <div
        className={`hidden md:block ${activeThreadId ? 'invisible pointer-events-none' : ''}`}
        aria-hidden={activeThreadId ? 'true' : undefined}
      >
        <div className="mx-auto w-full max-w-6xl">
          <MessageInput
            onSendMessage={handleSendMessage}
            placeholder='Try "@ai" to ask AI anything'
            disabled={sending || uploading}
            cacheKey="general"
            onUploadStatusChange={setUploading}
            messages={messages}
            enableGifPicker
          />
        </div>
      </div>

      {/* Mobile Message Input with Navigation */}
      <div
        className={activeThreadId ? 'invisible pointer-events-none' : ''}
        aria-hidden={activeThreadId ? 'true' : undefined}
      >
        <MobileChatFooter
          currentView={currentView}
          onViewChange={onViewChange}
        >
          <MessageInput
            onSendMessage={handleSendMessage}
            placeholder='Try "@ai" to ask AI anything'
            disabled={uploading}
            className="border-t border-[var(--border-panel)]"
            cacheKey="general"
            onUploadStatusChange={setUploading}
            messages={messages}
            enableGifPicker
          />
        </MobileChatFooter>
      </div>

      {activeThreadId && (
        <Suspense fallback={null}>
          <LazyGeneralChatThreadSheet
            open
            threadId={activeThreadId}
            initialRootMessage={messages.find(message => message.id === activeThreadId) ?? null}
            initialMessageId={initialMessageId ?? activeThreadId}
            onClose={closeThread}
          />
        </Suspense>
      )}
    </div>
  )
}
