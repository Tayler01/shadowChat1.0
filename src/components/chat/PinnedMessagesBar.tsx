import React from 'react'
import { Pin } from 'lucide-react'
import { PinnedMessageItem } from './PinnedMessageItem'
import type { Message } from '../../lib/supabase'

interface PinnedMessagesBarProps {
  messages: Message[]
  onUnpin: (messageId: string) => Promise<void>
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>
  className?: string
}

export function PinnedMessagesBar({ messages, onUnpin, onToggleReaction, className }: PinnedMessagesBarProps) {
  if (messages.length === 0) return null
  return (
    <div
      className={`bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-lg p-4 ${className || ''}`}
    >
      <div className="flex items-center space-x-2 mb-2">
        <Pin className="w-4 h-4 text-[var(--color-accent)]" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Pinned Messages</span>
      </div>
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
