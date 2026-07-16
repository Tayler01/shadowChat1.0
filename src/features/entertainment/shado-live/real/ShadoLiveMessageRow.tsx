import { PointerEvent, RefObject, useEffect, useRef, useState } from 'react'
import { Copy, Flag, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { Avatar } from '../../../../components/ui/Avatar'
import {
  ChatMessageActionsMenu,
  type ChatMessageAction,
} from '../../../../components/chat/ChatMessageActionsMenu'
import {
  MessageReactions,
  type MessageReactionSummary,
} from '../../../../components/chat/MessageReactions'
import { QuickReactionRail } from '../../../../components/chat/QuickReactionRail'
import { EmojiPickerOverlay } from '../../../../components/chat/EmojiPickerOverlay'
import { formatTime } from '../../../../lib/utils'
import type { EmojiClickData } from '../../../../types'
import type { ShadoLiveMessage } from './shadoLiveModel'

const QUICK_REACTIONS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F389}', '\u{1F64F}']
const TAP_MOVEMENT_THRESHOLD = 8

const normalizeEmojiValue = (emoji: string) => emoji.trim()

const isInteractiveTarget = (target: EventTarget | null) => (
  target instanceof Element
  && Boolean(target.closest('a, button, input, textarea, select, [role="button"], [contenteditable="true"]'))
)

export interface ShadoLiveMessageRowProps {
  message: ShadoLiveMessage
  avatarUrl: string | null
  currentUserId: string
  roomTitle: string
  scrollContainerRef: RefObject<HTMLDivElement>
  onOpenProfile: (userId: string) => void
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>
  onReport: (message: ShadoLiveMessage) => void
}

export function ShadoLiveMessageRow({
  message,
  avatarUrl,
  currentUserId,
  roomTitle,
  scrollContainerRef,
  onOpenProfile,
  onToggleReaction,
  onReport,
}: ShadoLiveMessageRowProps) {
  const messageRef = useRef<HTMLDivElement>(null)
  const reactionCloseTimerRef = useRef<number | null>(null)
  const pointerStartRef = useRef<{
    pointerId: number
    x: number
    y: number
    moved: boolean
  } | null>(null)
  const [showQuickReactions, setShowQuickReactions] = useState(false)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [reactionBusy, setReactionBusy] = useState(false)

  useEffect(() => () => {
    if (reactionCloseTimerRef.current !== null) {
      window.clearTimeout(reactionCloseTimerRef.current)
    }
  }, [])

  const keepQuickReactionsOpen = () => {
    if (reactionCloseTimerRef.current !== null) {
      window.clearTimeout(reactionCloseTimerRef.current)
      reactionCloseTimerRef.current = null
    }
    setShowQuickReactions(true)
  }

  const scheduleQuickReactionsClose = () => {
    if (reactionCloseTimerRef.current !== null) {
      window.clearTimeout(reactionCloseTimerRef.current)
    }
    reactionCloseTimerRef.current = window.setTimeout(() => {
      setShowQuickReactions(false)
      reactionCloseTimerRef.current = null
    }, 260)
  }

  const handleReaction = async (emoji: string) => {
    if (reactionBusy) return
    setReactionBusy(true)
    setShowQuickReactions(false)
    setShowReactionPicker(false)
    try {
      await onToggleReaction(message.id, normalizeEmojiValue(emoji))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update the live message reaction')
    } finally {
      setReactionBusy(false)
    }
  }

  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    void handleReaction(emojiData.emoji)
  }

  const handleMessagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) {
      pointerStartRef.current = null
      return
    }
    pointerStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    }
  }

  const handleMessagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current
    if (!start || start.pointerId !== event.pointerId || start.moved) return
    if (
      Math.abs(event.clientX - start.x) > TAP_MOVEMENT_THRESHOLD
      || Math.abs(event.clientY - start.y) > TAP_MOVEMENT_THRESHOLD
    ) {
      start.moved = true
      setShowQuickReactions(false)
    }
  }

  const handleMessagePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (
      !start
      || start.pointerId !== event.pointerId
      || start.moved
      || isInteractiveTarget(event.target)
      || window.getSelection()?.toString()
    ) {
      return
    }
    keepQuickReactionsOpen()
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.body)
      toast.success('Message copied')
    } catch {
      toast.error('Failed to copy message')
    }
  }

  const actions: ChatMessageAction[] = [
    {
      id: 'copy',
      label: 'Copy',
      icon: Copy,
      onSelect: handleCopy,
    },
    {
      id: 'reaction',
      label: 'Add Reaction',
      icon: Plus,
      disabled: reactionBusy,
      onSelect: () => setShowReactionPicker(true),
    },
    {
      id: 'report',
      label: 'Report message',
      icon: Flag,
      hidden: message.senderId === currentUserId,
      onSelect: () => onReport(message),
    },
  ]

  const reactionSummary: Record<string, MessageReactionSummary> = message.reactions

  return (
    <article
      className="group relative flex min-w-0 gap-3 border-b border-[var(--border-subtle)]/70 py-3 last:border-b-0"
      data-testid="shado-live-message-row"
    >
      <button
        type="button"
        onClick={() => onOpenProfile(message.senderId)}
        aria-label={`Open ${message.senderDisplayName}'s profile`}
        className="mt-0.5 h-fit shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]"
      >
        <Avatar
          src={avatarUrl || undefined}
          alt={message.senderDisplayName}
          fallback={message.senderDisplayName}
          userId={message.senderId}
          size="md"
        />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex min-h-8 items-center gap-2 pr-8">
          <button
            type="button"
            onClick={() => onOpenProfile(message.senderId)}
            className="min-w-0 truncate rounded-sm text-left text-sm font-semibold text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]"
          >
            {message.senderDisplayName}
          </button>
          <time
            dateTime={message.createdAt}
            className="shrink-0 text-xs text-[var(--text-muted)]"
          >
            {formatTime(message.createdAt)}
          </time>
        </div>

        <div
          ref={messageRef}
          className="relative min-w-0"
          onMouseEnter={keepQuickReactionsOpen}
          onMouseLeave={scheduleQuickReactionsClose}
          onPointerDown={handleMessagePointerDown}
          onPointerMove={handleMessagePointerMove}
          onPointerUp={handleMessagePointerUp}
          onPointerCancel={() => {
            pointerStartRef.current = null
            setShowQuickReactions(false)
          }}
        >
          <p className="max-w-full select-text break-words py-0.5 text-sm leading-5 text-[var(--text-secondary)]">
            {message.body}
          </p>

          <MessageReactions
            reactions={reactionSummary}
            currentUserId={currentUserId}
            onReact={emoji => void handleReaction(emoji)}
            className="mt-1.5 !w-auto !justify-start text-[0.65rem]"
          />

          <QuickReactionRail
            open={showQuickReactions && !showReactionPicker}
            anchorRef={messageRef}
            reactions={QUICK_REACTIONS}
            onReact={emoji => void handleReaction(emoji)}
            onAddReaction={() => {
              setShowQuickReactions(false)
              setShowReactionPicker(true)
            }}
            onClose={() => setShowQuickReactions(false)}
            onPointerEnter={keepQuickReactionsOpen}
            onPointerLeave={scheduleQuickReactionsClose}
            normalizeEmoji={normalizeEmojiValue}
          />

          <EmojiPickerOverlay
            open={showReactionPicker}
            title={`React in ${roomTitle}`}
            ariaLabel="Shado Live reaction emoji picker"
            onClose={() => setShowReactionPicker(false)}
            onEmojiClick={handleEmojiSelect}
            desktopClassName="fixed left-1/2 top-16 z-[120] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-[var(--radius-md)]"
          />
        </div>
      </div>

      <ChatMessageActionsMenu
        actions={actions}
        containerRef={scrollContainerRef}
        className="absolute right-0 top-2"
        buttonClassName="text-[var(--text-muted)] md:opacity-0 md:group-hover:opacity-70"
        portalClassName="z-[121]"
        menuLabel={`Options for ${message.senderDisplayName}'s Shado Live message`}
        buttonLabel={`Message actions for ${message.senderDisplayName}`}
        onOpenChange={open => {
          if (open) setShowQuickReactions(false)
        }}
      />
    </article>
  )
}
