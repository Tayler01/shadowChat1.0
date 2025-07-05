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
        <button
          onClick={() => onUnpin(messages[0].id)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
          title="Unpin message"
        >
          📌
        </button>
        <div
          className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-xs cursor-help relative group"
          title={`${messages[0].user?.display_name}: ${messages[0].content}`}
        >
          <strong>{messages[0].user?.display_name}:</strong> {messages[0].content}
          
          {/* Tooltip */}
          <div className="absolute bottom-full left-0 mb-2 z-50 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap max-w-sm">
            <strong>{messages[0].user?.display_name}:</strong> {messages[0].content}
            <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
          </div>
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
