import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useMessages } from '../../hooks/useMessages'
import { useAuth } from '../../hooks/useAuth'
import { MessageList } from '../../../../../src/components/chat/MessageList'
import { MessageInput } from './MessageInput'
import { MessageOutboxStorageError } from '../../lib/localMessageOutbox'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import { GeneralChatRoomTools } from '../../../../../src/streamlined/components/StreamlinedGeneralChatRoomTools'
import { getBlockedActionMessage } from '../../../../../src/lib/moderation'
import { showActionErrorToast } from '../../../../../src/lib/toastNotifications'
import { resolveGeneralChatThreadId, type ChatMessageType } from '../../lib/supabase'
import type { AppView } from '../../../../../src/types/navigation'
import type { Message } from '../../lib/supabase'
import { useIsDesktop } from '../../../../../src/hooks/useIsDesktop'
import type { ChatThreadRouteAction } from '../../../../../src/lib/appRouting'
import { captureMessageScrollAnchor, restoreMessageScrollAnchor, type MessageScrollAnchor } from '../../../../../src/lib/messageScrollAnchor'

const LazyGeneralChatThreadSheet = lazy(() => import('../../../../../src/features/general-chat-threads').then(module => ({
  default: module.GeneralChatThreadSheet,
})))

interface ChatViewProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  onSearch: (query: string, scope: 'messages' | 'all') => void
  initialMessageId?: string
  initialThreadId?: string
  onThreadRoute?: (action: ChatThreadRouteAction, threadRootId?: string, targetMessageId?: string) => void
}

export const ChatView: React.FC<ChatViewProps> = ({
  currentView,
  onViewChange,
  onSearch,
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
  const [searchVisible, setSearchVisible] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef<number | null>(null)
  const scrollTravelRef = useRef(0)
  const touchStartYRef = useRef<number | null>(null)

  const isMessageScrollTarget = (target: EventTarget) => target instanceof Element && Boolean(target.closest('[data-testid="message-scroll"]'))

  const handleChatScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof HTMLElement) || target.dataset.testid !== 'message-scroll') return
    const previous = scrollPositionRef.current
    scrollPositionRef.current = Math.max(0, target.scrollTop)
    if (previous === null) return
    const delta = target.scrollTop - previous
    if (!delta) return
    // Accumulate small finger/trackpad movements, resetting when direction changes.
    scrollTravelRef.current = Math.sign(delta) === Math.sign(scrollTravelRef.current)
      ? scrollTravelRef.current + delta : delta
    if (scrollTravelRef.current <= -16) setSearchVisible(true)
    if (scrollTravelRef.current >= 24 && !searchRef.current?.contains(document.activeElement) && !searchRef.current?.querySelector('input')?.value.trim()) setSearchVisible(false)
  }, [])

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
    <div data-streamlined-chat="true" className="theme-app-surface relative flex h-full min-h-0 flex-col text-sm" onScrollCapture={handleChatScroll}
      onWheelCapture={event => { if (event.deltaY < 0 && isMessageScrollTarget(event.target)) setSearchVisible(true) }}
      onTouchStartCapture={event => { touchStartYRef.current = isMessageScrollTarget(event.target) ? event.touches[0]?.clientY ?? null : null }}
      onTouchMoveCapture={event => {
        const touchY = event.touches[0]?.clientY
        if (touchY !== undefined && touchStartYRef.current !== null && touchY - touchStartYRef.current >= 16) setSearchVisible(true)
      }}
      onTouchEndCapture={() => { touchStartYRef.current = null }}
    >
      <h1 className="sr-only">Group chat</h1>
      <button type="button" className="sr-only focus:not-sr-only focus:min-h-11" onClick={() => {
        setSearchVisible(true)
        window.requestAnimationFrame(() => searchRef.current?.querySelector('input')?.focus())
      }}>Search group chat</button>
      <div ref={searchRef} data-streamlined-chat-search="true" hidden={Boolean(activeThreadId) || (!isDesktop && !searchVisible)} className={isDesktop ? 'shrink-0' : 'absolute inset-x-0 top-0 z-20'}>
        <GeneralChatRoomTools onSearch={onSearch} />
      </div>

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
