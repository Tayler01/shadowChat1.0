import React from 'react'
import { Avatar } from '../ui/Avatar'
import { formatTime } from '../../lib/utils'
import type { Message } from '../../lib/supabase'

interface ThreadReplyLinkProps {
  message: Message
  parent: Message
  onJumpToMessage: (id: string) => void
}

export const ThreadReplyLink: React.FC<ThreadReplyLinkProps> = ({
  message,
  parent,
  onJumpToMessage
}) => {
  return (
    <div
      className="ml-2 flex gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5 shadow-[var(--shadow-panel)]"
      data-testid="thread-reply-link"
    >
      <Avatar
        src={message.user?.avatar_url}
        alt={message.user?.display_name || 'Unknown User'}
        size="sm"
        color={message.user?.color}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="truncate font-semibold text-[var(--text-primary)]">
            {message.user?.display_name}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {formatTime(message.created_at)}
          </span>
        </div>
        <div className="break-words text-sm text-[var(--text-secondary)]">
          {message.content.slice(0, 40)}
          {message.content.length > 40 ? '...' : ''}
        </div>
        <button
          type="button"
          onClick={() => onJumpToMessage(parent.id)}
          className="mt-2 inline-flex max-w-full items-center rounded-full border border-[rgba(215,170,70,0.16)] bg-[rgba(215,170,70,0.08)] px-2.5 py-1 text-[11px] text-[var(--text-gold)] transition-colors hover:bg-[rgba(215,170,70,0.14)]"
        >
          In reply to {parent.user?.display_name || 'Unknown'}: {parent.content.slice(0, 40)}
          {parent.content.length > 40 ? '...' : ''}
        </button>
      </div>
    </div>
  )
}
