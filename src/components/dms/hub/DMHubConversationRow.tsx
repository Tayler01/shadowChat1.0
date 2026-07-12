import { useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  CheckCheck,
  Circle,
  FileText,
  Image,
  Mic,
  MoreHorizontal,
  Pin,
  PinOff,
  Video,
} from 'lucide-react'
import type { PresenceVisibility } from '../../../types'
import { cn } from '../../../lib/utils'
import { Avatar } from '../../ui/Avatar'
import { DMHubBottomSheet } from './DMHubBottomSheet'

export type DMHubMessageKind = 'text' | 'image' | 'video' | 'audio' | 'file' | 'gif'
export type DMHubDeliveryState = 'sent' | 'sending' | 'failed'

export type DMHubConversationRowData = {
  id: string
  otherUserId?: string
  displayName: string
  username?: string
  avatarUrl?: string | null
  avatarThumbnailUrl?: string | null
  color?: string | null
  presenceVisibility?: PresenceVisibility | null
  preview?: string
  timestamp?: string
  timestampLabel?: string
  unreadCount?: number
  manuallyUnread?: boolean
  pinned?: boolean
  archived?: boolean
  muted?: boolean
  blocked?: boolean
  draftPreview?: string
  lastMessageFromCurrentUser?: boolean
  lastMessageKind?: DMHubMessageKind
  deliveryState?: DMHubDeliveryState
}

type DMHubConversationRowProps = {
  conversation: DMHubConversationRowData
  selected?: boolean
  onOpen: (conversationId: string) => void
  onTogglePin?: (conversationId: string, nextPinned: boolean) => void | Promise<void>
  onToggleArchive?: (conversationId: string, nextArchived: boolean) => void | Promise<void>
  onToggleRead?: (conversationId: string, nextUnread: boolean) => void | Promise<void>
  onToggleMute?: (conversationId: string, nextMuted: boolean) => void | Promise<void>
  onRowRemovedFocusFallback?: () => void
}

const kindMeta: Record<DMHubMessageKind, { label: string; Icon: typeof FileText }> = {
  text: { label: 'Message', Icon: FileText },
  image: { label: 'Photo', Icon: Image },
  video: { label: 'Video', Icon: Video },
  audio: { label: 'Voice message', Icon: Mic },
  file: { label: 'File', Icon: FileText },
  gif: { label: 'GIF', Icon: Image },
}

const getPreview = (conversation: DMHubConversationRowData) => {
  if (conversation.blocked) return 'Messaging is unavailable while blocked'
  if (conversation.draftPreview?.trim()) return conversation.draftPreview.trim()
  if (conversation.preview?.trim()) return conversation.preview.trim()
  return kindMeta[conversation.lastMessageKind ?? 'text'].label
}

function DMHubRowAction({
  label,
  description,
  icon: Icon,
  onClick,
  danger = false,
}: {
  label: string
  description: string
  icon: typeof Pin
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]',
        danger
          ? 'border-[rgba(190,52,85,0.28)] bg-[rgba(132,24,45,0.08)] text-red-100 hover:bg-[rgba(132,24,45,0.16)]'
          : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] text-[var(--text-primary)] hover:border-[var(--border-glow)] hover:bg-[var(--theme-surface-hover)]'
      )}
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.045)] text-[var(--theme-accent-readable)]" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs leading-4 text-[var(--text-muted)]">{description}</span>
      </span>
    </button>
  )
}

export function DMHubConversationRow({
  conversation,
  selected = false,
  onOpen,
  onTogglePin,
  onToggleArchive,
  onToggleRead,
  onToggleMute,
  onRowRemovedFocusFallback,
}: DMHubConversationRowProps) {
  const [actionsOpen, setActionsOpen] = useState(false)
  const unreadCount = Math.max(0, conversation.unreadCount ?? 0)
  const isUnread = unreadCount > 0 || conversation.manuallyUnread === true
  const messageKind = conversation.lastMessageKind ?? 'text'
  const KindIcon = kindMeta[messageKind].Icon
  const preview = getPreview(conversation)
  const senderPrefix = conversation.lastMessageFromCurrentUser && !conversation.draftPreview ? 'You: ' : ''
  const deliveryLabel = conversation.deliveryState === 'failed'
    ? 'Failed to send'
    : conversation.deliveryState === 'sending'
      ? 'Sending'
      : ''
  const accessibleState = [
    isUnread ? `${unreadCount || 1} unread` : 'read',
    conversation.draftPreview ? 'draft' : null,
    conversation.pinned ? 'pinned' : null,
    conversation.archived ? 'archived' : null,
    conversation.muted ? 'muted' : null,
    conversation.blocked ? 'blocked' : null,
    deliveryLabel || null,
  ].filter(Boolean).join(', ')

  const runAction = (action: () => void | Promise<void>, mayRemoveRow = false) => {
    setActionsOpen(false)
    void action()
    if (mayRemoveRow) {
      window.requestAnimationFrame(() => {
        const activeElement = document.activeElement
        if (!activeElement || activeElement === document.body || !activeElement.isConnected) {
          onRowRemovedFocusFallback?.()
        }
      })
    }
  }

  return (
    <article
      className={cn(
        'relative rounded-[var(--radius-lg)] border transition-[background-color,border-color,box-shadow]',
        selected
          ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] shadow-[var(--shadow-panel)]'
          : isUnread
            ? 'border-[rgba(var(--theme-accent-rgb),0.2)] bg-[rgba(var(--theme-accent-rgb),0.055)]'
            : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[rgba(255,255,255,0.025)]'
      )}
      data-testid={`dm-hub-row-${conversation.id}`}
    >
      <button
        type="button"
        onClick={() => onOpen(conversation.id)}
        aria-current={selected ? 'true' : undefined}
        aria-label={`${conversation.displayName}${conversation.username ? `, @${conversation.username}` : ''}. ${senderPrefix}${preview}. ${accessibleState}${conversation.timestampLabel ? `, ${conversation.timestampLabel}` : ''}`}
        className="flex min-h-[5.25rem] w-full items-center gap-3 rounded-[var(--radius-lg)] py-3 pl-3 pr-14 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--theme-focus-ring)]"
      >
        <div className="relative shrink-0">
          <Avatar
            src={conversation.avatarThumbnailUrl || conversation.avatarUrl || undefined}
            alt={conversation.displayName}
            size="lg"
            color={conversation.color || undefined}
            userId={conversation.otherUserId}
            presenceVisibility={conversation.presenceVisibility}
            showStatus
          />
          {conversation.pinned && (
            <span className="absolute -left-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-glow)] bg-[rgba(12,13,14,0.96)] text-[var(--text-gold)]" aria-hidden="true">
              <Pin className="h-2.5 w-2.5 fill-current" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('truncate text-sm text-[var(--text-primary)]', isUnread ? 'font-bold' : 'font-semibold')}>
              {conversation.displayName}
            </span>
            {conversation.muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />}
            {conversation.blocked && (
              <span className="shrink-0 rounded-full border border-[rgba(215,170,70,0.2)] bg-[rgba(215,170,70,0.07)] px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-[var(--text-gold)]" aria-hidden="true">Blocked</span>
            )}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-sm">
            {conversation.draftPreview ? (
              <span className="shrink-0 font-semibold text-[var(--theme-accent-readable)]">Draft:</span>
            ) : (
              <KindIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            )}
            <span className={cn(
              'truncate',
              deliveryLabel === 'Failed to send' ? 'text-red-300' : isUnread ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
            )}>
              {senderPrefix}{preview}
            </span>
          </div>
          {deliveryLabel && (
            <span className={cn('mt-1 block text-[0.68rem] font-medium', conversation.deliveryState === 'failed' ? 'text-red-300' : 'text-[var(--text-muted)]')}>
              {deliveryLabel}
            </span>
          )}
        </div>

        <div className="flex min-w-[3rem] shrink-0 flex-col items-end gap-2 self-stretch py-0.5 text-right">
          {conversation.timestampLabel && (
            <time dateTime={conversation.timestamp} className="text-[0.68rem] text-[var(--text-muted)]">
              {conversation.timestampLabel}
            </time>
          )}
          {isUnread && (
            <span className="theme-unread-badge mt-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[0.68rem] font-bold" aria-hidden="true">
              {unreadCount > 99 ? '99+' : unreadCount || <Circle className="h-2.5 w-2.5 fill-current" />}
            </span>
          )}
        </div>
      </button>

      <button
        type="button"
        onClick={() => setActionsOpen(true)}
        aria-label={`Conversation actions for ${conversation.displayName}`}
        aria-haspopup="dialog"
        aria-expanded={actionsOpen}
        className="absolute right-1 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.055)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      <DMHubBottomSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        title={conversation.displayName}
        eyebrow="Conversation actions"
        testId="dm-hub-row-actions"
      >
        <div className="space-y-2">
          {onTogglePin && (
            <DMHubRowAction
              label={conversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
              description={conversation.pinned ? 'Return this conversation to normal inbox ordering.' : 'Keep this conversation at the top of the inbox.'}
              icon={conversation.pinned ? PinOff : Pin}
              onClick={() => runAction(() => onTogglePin(conversation.id, !conversation.pinned))}
            />
          )}
          {onToggleRead && (
            <DMHubRowAction
              label={isUnread ? 'Mark as read' : 'Mark as unread'}
              description={isUnread ? 'Clear the unread state on this conversation.' : 'Keep a private reminder in your Unread view.'}
              icon={isUnread ? CheckCheck : Circle}
              onClick={() => runAction(() => onToggleRead(conversation.id, !isUnread), true)}
            />
          )}
          {onToggleMute && (
            <DMHubRowAction
              label={conversation.muted ? 'Resume notifications' : 'Mute notifications'}
              description={conversation.muted ? 'Allow new-message notifications again.' : 'Silence notifications without hiding the conversation.'}
              icon={conversation.muted ? Bell : BellOff}
              onClick={() => runAction(() => onToggleMute(conversation.id, !conversation.muted))}
            />
          )}
          {onToggleArchive && (
            <DMHubRowAction
              label={conversation.archived ? 'Return to inbox' : 'Archive conversation'}
              description={conversation.archived ? 'Move this conversation back to the Inbox view.' : 'Hide this conversation from Inbox without deleting messages.'}
              icon={conversation.archived ? ArchiveRestore : Archive}
              onClick={() => runAction(() => onToggleArchive(conversation.id, !conversation.archived), true)}
              danger={!conversation.archived}
            />
          )}
        </div>
      </DMHubBottomSheet>
    </article>
  )
}
