import React, { useCallback, useState } from 'react'
import { MessageList } from '../chat/MessageList'
import { MessageInput } from '../chat/MessageInput'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import { useBoardChat } from '../../hooks/useBoardChat'
import { getBlockedActionMessage } from '../../lib/moderation'
import { showActionErrorToast } from '../../lib/toastNotifications'
import type { ChatBoardDefinition } from '../../lib/boards'
import type { AppView } from '../../types/navigation'
import type { BoardChatMessage, ChatMessageType, Message } from '../../lib/supabase'
import { messageToReplyTarget, type ReplyTarget } from '../chat/messageDisplay'

export function BoardChat({
  board,
  currentView = 'boards',
  onViewChange = () => {},
}: {
  board: ChatBoardDefinition
  currentView?: AppView
  onViewChange?: (view: AppView) => void
}) {
  const boardChat = useBoardChat(board.slug, board.title)
  const {
    messages,
    sendMessage,
    sending,
    retryFailedMessage,
    discardFailedMessage,
    error,
  } = boardChat
  const [uploading, setUploading] = useState(false)
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  const cacheKey = `board-chat:${board.slug}`
  const typingChannel = `board:${board.slug}`

  const handleReply = useCallback((message: Message) => {
    setReplyTo(messageToReplyTarget(message))
  }, [])

  const handleSendMessage = async (
    content: string,
    type?: ChatMessageType,
    fileUrl?: string,
    replyToId?: string,
    thumbnailUrl?: string | null
  ) => {
    try {
      const message = await sendMessage(content, type, fileUrl, replyToId, thumbnailUrl)
      if (message !== null) {
        setReplyTo(null)
      }
      return message
    } catch (err) {
      const notice = await getBlockedActionMessage(
        board.moderationScope,
        err,
        `Failed to send ${board.title} message`
      )
      showActionErrorToast(notice)
      return null
    }
  }

  return (
    <div className="theme-image-surface flex min-h-0 flex-1 flex-col">
      <MessageList
        messagesApi={boardChat}
        onReply={handleReply}
        onRetryFailed={retryFailedMessage}
        onDiscardFailed={discardFailedMessage}
        sending={sending}
        uploading={uploading}
        readCursorSurface="board_chat"
        readCursorScope={board.slug}
        surfaceKey={`board_chat:${board.slug}`}
        typingChannel={typingChannel}
        moderationScope={board.moderationScope}
        scrollTestId="board-chat-message-scroll"
        emptyState={
          <div className="flex min-h-[40vh] items-center justify-center p-6 text-center text-sm text-[var(--text-muted)]">
            {error || `No ${board.title.toLowerCase()} messages yet.`}
          </div>
        }
      />

      <div className="hidden md:block">
        <div className="mx-auto w-full max-w-6xl">
          <MessageInput
            onSendMessage={handleSendMessage}
            placeholder={`Message ${board.title}`}
            disabled={sending || uploading}
            cacheKey={cacheKey}
            onUploadStatusChange={setUploading}
            messages={messages as BoardChatMessage[]}
            replyingTo={replyTo || undefined}
            onCancelReply={() => setReplyTo(null)}
            typingChannel={typingChannel}
            enableGifPicker
          />
        </div>
      </div>

      <MobileChatFooter currentView={currentView} onViewChange={onViewChange} avoidAndroidKeyboardLift>
        <MessageInput
          onSendMessage={handleSendMessage}
          placeholder={`Message ${board.title}`}
          disabled={sending || uploading}
          className="border-t border-[var(--border-panel)]"
          cacheKey={cacheKey}
          onUploadStatusChange={setUploading}
          messages={messages as BoardChatMessage[]}
          replyingTo={replyTo || undefined}
          onCancelReply={() => setReplyTo(null)}
          typingChannel={typingChannel}
          enableGifPicker
        />
      </MobileChatFooter>
    </div>
  )
}
