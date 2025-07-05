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

export function PinnedMessagesBar({ messages, onUnpin, onToggleReaction, className, compact = false }: PinnedMessagesBarProps) {
  if (messages.length === 0) return null
  
  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className || ''}`}>
        <span className="text-xs text-gray-500 dark:text-gray-400">📌</span>
        <div className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-xs">
          <strong>{messages[0].user?.display_name}:</strong> {messages[0].content}
        </div>
        {messages.length > 1 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            +{messages.length - 1} more
          </span>
        )}
      </div>
    )
  }
  
  return (
    <div
      className={`bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-lg p-4 ${className || ''}`}
    >
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
