import React from 'react'
import { motion } from 'framer-motion'
import type { Message } from '../../lib/supabase'
import { cn } from '../../lib/utils'

export type MessageReactionSummary = {
  count: number
  users?: string[]
  reactedByCurrentUser?: boolean
}

const normalizeEmojiValue = (emoji: string) => emoji.trim()

export const MessageReactions = React.memo(function MessageReactions({
  message,
  reactions: providedReactions,
  currentUserId,
  onReact,
  className = '',
}: {
  message?: Pick<Message, 'reactions'>
  reactions?: Record<string, MessageReactionSummary>
  currentUserId?: string
  onReact: (emoji: string) => void
  className?: string
}) {
  const reactions: Record<string, MessageReactionSummary> = providedReactions ?? message?.reactions ?? {}
  const hasReactions = Object.keys(reactions).length > 0

  if (!hasReactions) return null

  return (
    <div className={cn('flex w-full flex-wrap justify-end gap-1', className)}>
      {Object.entries(reactions).map(([emoji, data]) => {
        const isReacted = data.reactedByCurrentUser
          ?? data.users?.includes(currentUserId ?? '')
          ?? false
        return (
          <motion.button
            key={emoji}
            initial={false}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onReact(emoji)}
            className={`inline-flex items-center space-x-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
              isReacted
                ? 'theme-accent-chip'
                : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.08)]'
            }`}
            aria-label={`Reaction ${normalizeEmojiValue(emoji)} count ${data.count}`}
          >
            <span>{normalizeEmojiValue(emoji)}</span>
            <span className="text-[0.5em]">{data.count}</span>
          </motion.button>
        )
      })}
    </div>
  )
})
