import React from 'react'
import { PinnedMessageItem } from './PinnedMessageItem'
import type { Message } from '../../lib/supabase'

interface PinnedMessagesBarProps {
  messages: Message[]
  onUnpin: (messageId: string) => Promise<void>
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>
  className?: string
  compact?: boolean
}

export function PinnedMessagesBar({
  messages,
  onUnpin,
  onToggleReaction,
  className,
  compact = false,
}: PinnedMessagesBarProps) {
  if (messages.length === 0) return null

  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className || ''}`}>
        <button
          onClick={() => onUnpin(messages[0].id)}
          className="cursor-pointer text-xs text-[var(--text-muted)] transition-colors hover:text-red-300"
          title="Unpin message"
        >
          Pin
        </button>
        <div
          className="group relative max-w-xs cursor-help truncate rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-sm text-[var(--text-secondary)]"
          title={`${messages[0].user?.display_name}: ${messages[0].content}`}
        >
          <strong>{messages[0].user?.display_name}:</strong> {messages[0].content}

          <div className="glass-panel-strong pointer-events-none absolute bottom-full left-0 z-50 mb-2 max-w-sm whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-2 text-xs text-[var(--text-primary)] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <strong>{messages[0].user?.display_name}:</strong> {messages[0].content}
          </div>
        </div>
        {messages.length > 1 && (
          <span className="text-xs text-[var(--text-muted)]">
            +{messages.length - 1} more
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={`glass-panel rounded-[var(--radius-lg)] p-4 ${className || ''}`}>
      <div className="space-y-2">
        {messages.map(message => (
          <PinnedMessageItem
            key={message.id}
            message={message}
            onUnpin={onUnpin}
            onToggleReaction={onToggleReaction}
          />
        ))}
      </div>
    </div>
  )
}
