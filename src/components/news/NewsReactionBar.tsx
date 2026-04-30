import React, { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth'
import { useEmojiPicker } from '../../hooks/useEmojiPicker'
import type { EmojiClickData } from '../../types'
import { cn } from '../../lib/utils'
import type { NewsReactionSummary } from '../../lib/supabase'

const QUICK_REACTIONS = [
  '\u{1F44D}',
  '\u2764\uFE0F',
  '\u{1F525}',
  '\u{1F440}',
  '\u{1F62E}',
]

const normalizeEmojiValue = (emoji: string) => emoji.trim()

export function NewsReactionBar({
  reactions,
  onReact,
  className,
}: {
  reactions?: NewsReactionSummary
  onReact: (emoji: string) => void | Promise<void>
  className?: string
}) {
  const { profile } = useAuth()
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const EmojiPicker = useEmojiPicker(showPicker)
  const entries = Object.entries(reactions || {})

  useEffect(() => {
    if (!showPicker) return
    const handleClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPicker])

  const handleSelect = (emojiData: EmojiClickData) => {
    void onReact(emojiData.emoji)
    setShowPicker(false)
  }

  return (
    <div className={cn('relative flex flex-wrap items-center gap-1.5', className)}>
      {entries.map(([emoji, data]) => {
        const isReacted = data.users?.includes(profile?.id ?? '')
        return (
          <motion.button
            key={emoji}
            type="button"
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => void onReact(emoji)}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs transition-colors',
              isReacted
                ? 'border-[var(--border-glow)] bg-[rgba(215,170,70,0.14)] text-[var(--text-gold)]'
                : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--text-primary)]'
            )}
            aria-label={`Reaction ${normalizeEmojiValue(emoji)} count ${data.count}`}
          >
            <span>{normalizeEmojiValue(emoji)}</span>
            <span>{data.count}</span>
          </motion.button>
        )
      })}
      {QUICK_REACTIONS.map(emoji => (
        <button
          key={emoji}
          type="button"
          onClick={() => void onReact(emoji)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]"
          aria-label={`React with ${normalizeEmojiValue(emoji)}`}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setShowPicker(prev => !prev)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]"
        aria-label="Add reaction"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {showPicker && EmojiPicker && (
        <div ref={pickerRef} className="absolute bottom-full left-0 z-50 mb-2">
          <EmojiPicker
            onEmojiClick={handleSelect}
            width={320}
            height={380}
            theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
          />
        </div>
      )}
    </div>
  )
}
