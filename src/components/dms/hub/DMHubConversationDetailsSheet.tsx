import { useEffect, useId, useRef, useState, type Ref } from 'react'
import {
  Bell,
  BellOff,
  Images,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import type { PresenceVisibility } from '../../../types'
import { cn } from '../../../lib/utils'
import { Avatar } from '../../ui/Avatar'
import { DMHubBottomSheet } from './DMHubBottomSheet'

type DMHubConversationDetailsSheetProps = {
  open: boolean
  onClose: () => void
  conversationId: string
  otherUserId?: string
  displayName: string
  username?: string
  avatarUrl?: string | null
  avatarThumbnailUrl?: string | null
  color?: string | null
  presenceVisibility?: PresenceVisibility | null
  muted?: boolean
  blockedByMe?: boolean
  busyAction?: 'notifications' | 'block' | null
  onSearch: (conversationId: string) => void
  onOpenShared: (conversationId: string) => void
  onToggleNotifications: (conversationId: string, nextMuted: boolean) => void | Promise<void>
  onOpenProfile: (conversationId: string) => void
  onToggleBlock: (conversationId: string, nextBlocked: boolean) => void | Promise<void>
}

function DetailsAction({
  label,
  description,
  icon: Icon,
  onClick,
  pressed,
  disabled,
  danger = false,
  buttonRef,
}: {
  label: string
  description: string
  icon: typeof Search
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
  danger?: boolean
  buttonRef?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-busy={disabled || undefined}
      disabled={disabled}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-3 text-left transition-[background-color,border-color,color] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] disabled:cursor-wait disabled:opacity-60',
        danger
          ? 'border-[rgba(190,52,85,0.3)] bg-[rgba(132,24,45,0.08)] text-red-100 hover:bg-[rgba(132,24,45,0.16)]'
          : pressed
            ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-[var(--text-primary)]'
            : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] text-[var(--text-primary)] hover:border-[var(--border-glow)] hover:bg-[var(--theme-surface-hover)]'
      )}
    >
      <span className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        danger ? 'bg-[rgba(190,52,85,0.12)] text-red-200' : 'bg-[rgba(var(--theme-accent-rgb),0.1)] text-[var(--theme-accent-readable)]'
      )} aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs leading-4 text-[var(--text-muted)]">{description}</span>
      </span>
    </button>
  )
}

export function DMHubConversationDetailsSheet({
  open,
  onClose,
  conversationId,
  otherUserId,
  displayName,
  username,
  avatarUrl,
  avatarThumbnailUrl,
  color,
  presenceVisibility,
  muted = false,
  blockedByMe = false,
  busyAction = null,
  onSearch,
  onOpenShared,
  onToggleNotifications,
  onOpenProfile,
  onToggleBlock,
}: DMHubConversationDetailsSheetProps) {
  const [confirmingBlock, setConfirmingBlock] = useState(false)
  const blockButtonRef = useRef<HTMLButtonElement>(null)
  const cancelBlockRef = useRef<HTMLButtonElement>(null)
  const blockDescriptionId = useId()

  useEffect(() => {
    if (confirmingBlock) cancelBlockRef.current?.focus({ preventScroll: true })
  }, [confirmingBlock])

  const cancelBlock = () => {
    setConfirmingBlock(false)
    window.requestAnimationFrame(() => blockButtonRef.current?.focus({ preventScroll: true }))
  }
  return (
    <DMHubBottomSheet
      open={open}
      onClose={onClose}
      title="Conversation details"
      eyebrow="Direct message"
      testId="dm-hub-conversation-details"
    >
      <div className="mb-4 flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-3">
        <Avatar
          src={avatarThumbnailUrl || avatarUrl || undefined}
          alt={displayName}
          size="lg"
          color={color || undefined}
          userId={otherUserId}
          presenceVisibility={presenceVisibility}
          showStatus
          loading="eager"
          fetchPriority="high"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-[var(--text-primary)]">{displayName}</p>
          {username && <p className="truncate text-sm text-[var(--text-muted)]">@{username}</p>}
        </div>
      </div>

      <div className="space-y-2" aria-label={`Options for ${displayName}`}>
        <DetailsAction
          label="Search conversation"
          description="Find words and messages inside this thread."
          icon={Search}
          onClick={() => onSearch(conversationId)}
        />
        <DetailsAction
          label="Shared media, files & links"
          description="Browse the content you have exchanged together."
          icon={Images}
          onClick={() => onOpenShared(conversationId)}
        />
        <DetailsAction
          label={muted ? 'Resume notifications' : 'Mute notifications'}
          description={muted ? 'Allow new-message alerts from this conversation.' : 'Silence alerts without archiving or blocking.'}
          icon={muted ? Bell : BellOff}
          pressed={muted}
          disabled={busyAction === 'notifications'}
          onClick={() => void onToggleNotifications(conversationId, !muted)}
        />
        <DetailsAction
          label="View profile"
          description={`Open ${displayName}'s member profile.`}
          icon={UserRound}
          onClick={() => onOpenProfile(conversationId)}
        />
        <DetailsAction
          label={blockedByMe ? `Unblock ${displayName}` : `Block ${displayName}`}
          description={blockedByMe
            ? 'Restore mutual visibility and messaging access.'
            : 'Hide each other across chat, discovery, DMs, and notifications.'}
          icon={blockedByMe ? ShieldCheck : ShieldAlert}
          pressed={blockedByMe}
          disabled={busyAction === 'block'}
          danger={!blockedByMe}
          buttonRef={blockButtonRef}
          onClick={() => {
            if (blockedByMe) void onToggleBlock(conversationId, false)
            else setConfirmingBlock(true)
          }}
        />
        {confirmingBlock && !blockedByMe && (
          <div role="alertdialog" aria-label={`Confirm blocking ${displayName}`} aria-describedby={blockDescriptionId} className="rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.34)] bg-[rgba(24,10,14,0.96)] p-3">
            <p id={blockDescriptionId} className="text-sm leading-5 text-red-100">
              Block {displayName}? You will no longer see each other across chat, search, DMs, or notifications.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                ref={cancelBlockRef}
                type="button"
                onClick={cancelBlock}
                className="min-h-12 rounded-[var(--radius-md)] border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingBlock(false)
                  void onToggleBlock(conversationId, true)
                }}
                className="min-h-12 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.4)] bg-[rgba(132,24,45,0.24)] text-sm font-semibold text-red-100 focus:outline-none focus:ring-2 focus:ring-red-300"
              >
                Confirm block
              </button>
            </div>
          </div>
        )}
      </div>
    </DMHubBottomSheet>
  )
}
