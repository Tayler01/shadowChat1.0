import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useMessages } from '../../hooks/useMessages'
import { useAuth } from '../../hooks/useAuth'
import { MessageList } from '../../../../../src/components/chat/MessageList'
import { MessageInput } from './MessageInput'
import { MessageOutboxStorageError } from '../../lib/localMessageOutbox'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import { MobileAppHeader } from '../../../../../src/components/layout/MobileAppHeader'
import { getBlockedActionMessage } from '../../../../../src/lib/moderation'
import { showActionErrorToast } from '../../../../../src/lib/toastNotifications'
import { resolveGeneralChatThreadId, type ChatMessageType } from '../../lib/supabase'
import type { AppView } from '../../../../../src/types/navigation'
import type { Message } from '../../lib/supabase'
import { useIsDesktop } from '../../../../../src/hooks/useIsDesktop'
import type { ChatThreadRouteAction } from '../../../../../src/lib/appRouting'
import { captureMessageScrollAnchor, restoreMessageScrollAnchor, type MessageScrollAnchor } from '../../../../../src/lib/messageScrollAnchor'

const LazyGeneralChatRoomTools = lazy(() => import('../../../../../src/components/chat/GeneralChatRoomTools').then(module => ({
  default: module.GeneralChatRoomTools,
})))

const LazyGeneralChatThreadSheet = lazy(() => import('../../../../../src/features/general-chat-threads').then(module => ({
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
  const { user } = useAuth()
  const isDesktop = useIsDesktop()
  const { profile } = useAuth()
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
  const loungeScrollTopRef = useRef<MessageScrollAnchor | null>(null)

  const captureLoungeScroll = useCallback(() => {
    const scroll = document.querySelector<HTMLElement>('[data-testid="message-scroll"]')
    if (scroll) loungeScrollTopRef.current = captureMessageScrollAnchor(scroll)
  }, [])

  const restoreLoungeScroll = useCallback(() => {
    const savedAnchor = loungeScrollTopRef.current
    const scroll = document.querySelector<HTMLElement>('[data-testid="message-scroll"]')
    if (savedAnchor && scroll) restoreMessageScrollAnchor(scroll, savedAnchor)
  }, [])

  useEffect(() => {
    setLocalThreadId(initialThreadId ?? null)
  }, [initialThreadId])

  useLayoutEffect(() => {
    if (!activeThreadId && loungeScrollTopRef.current !== null) {
      restoreLoungeScroll()
      loungeScrollTopRef.current = null
    }
  }, [activeThreadId, restoreLoungeScroll])

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
    thumbnailUrl?: string | null,
    clientMessageId?: string,
    onQueued?: () => void
  ) => {
    try {
      const msg = await sendMessage(content, type, fileUrl, replyToId, thumbnailUrl, { clientMessageId, onQueued })

      return msg
    } catch (error) {
      const message = error instanceof MessageOutboxStorageError
        ? error.message
        : await getBlockedActionMessage('general_chat', error, 'Failed to send message')
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
        active={!activeThreadId}
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
              identityKey={profile?.id ?? null}
            onSendMessage={handleSendMessage}
            placeholder='Try "@ai" to ask AI anything'
            disabled={uploading}
            cacheKey="general"
            aiReplyDestination="general-chat"
            senderId={user?.id}
            onUploadStatusChange={setUploading}
            messages={messages}
            enableGifPicker
          />
        </div>
      </div>

      {/* Mobile Message Input with Navigation */}
      {!activeThreadId && <div>
        <MobileChatFooter
          currentView={currentView}
          onViewChange={onViewChange}
        >
          <MessageInput
              identityKey={profile?.id ?? null}
            onSendMessage={handleSendMessage}
            placeholder='Try "@ai" to ask AI anything'
            disabled={uploading}
            className="border-t border-[var(--border-panel)]"
            cacheKey="general"
            aiReplyDestination="general-chat"
            senderId={user?.id}
            onUploadStatusChange={setUploading}
            messages={messages}
            enableGifPicker
          />
        </MobileChatFooter>
      </div>}

      {activeThreadId && (
        <Suspense fallback={null}>
          <LazyGeneralChatThreadSheet
            open
            threadId={activeThreadId}
            initialRootMessage={messages.find(message => message.id === activeThreadId) ?? null}
            initialMessageId={initialMessageId}
            currentView={currentView}
            onViewChange={onViewChange}
            onClose={closeThread}
          />
        </Suspense>
      )}
    </div>
  )
}
