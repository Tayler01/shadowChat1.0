import React, { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
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
  variant = 'inline',
}: {
  reactions?: NewsReactionSummary
  onReact: (emoji: string) => void | Promise<void>
  className?: string
  variant?: 'inline' | 'menu'
}) {
  const { profile } = useAuth()
  const [showPicker, setShowPicker] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const EmojiPicker = useEmojiPicker(showPicker)
  const entries = Object.entries(reactions || {})
  const totalReactions = entries.reduce((sum, [, data]) => sum + data.count, 0)

  useEffect(() => {
    if (!showPicker && !showMenu) return
    const handleClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false)
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu, showPicker])

  const handleSelect = (emojiData: EmojiClickData) => {
    void onReact(emojiData.emoji)
    setShowPicker(false)
    setShowMenu(false)
  }

  const handleReact = (emoji: string) => {
    void onReact(emoji)
    if (variant === 'menu') setShowMenu(false)
  }

  if (variant === 'menu') {
    return (
      <div ref={menuRef} className={cn('relative inline-flex', className)}>
        <button
          type="button"
          onClick={() => setShowMenu(prev => !prev)}
          className={cn(
            'inline-flex h-8 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]',
            totalReactions > 0 ? 'min-w-12 gap-1 px-2 text-xs' : 'w-8'
          )}
          aria-label="News reactions menu"
          aria-haspopup="menu"
          aria-expanded={showMenu}
        >
          <MoreHorizontal className="h-4 w-4" />
          {totalReactions > 0 && <span>{totalReactions}</span>}
        </button>

        {showMenu && (
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-2 w-64 rounded-[var(--radius-md)] border border-[var(--border-panel)] bg-[linear-gradient(180deg,rgba(24,26,27,0.98),rgba(12,13,14,0.99))] p-2 shadow-[0_18px_48px_rgba(0,0,0,0.42)]"
          >
            {entries.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5 border-b border-[var(--border-subtle)] pb-2">
                {entries.map(([emoji, data]) => {
                  const isReacted = data.users?.includes(profile?.id ?? '')
                  return (
                    <button
                      key={emoji}
                      type="button"
                      role="menuitem"
                      onClick={() => handleReact(emoji)}
                      className={cn(
                        'inline-flex h-8 items-center gap-1 rounded-full border px-2 text-xs transition-colors',
                        isReacted
                          ? 'border-[var(--border-glow)] bg-[rgba(215,170,70,0.14)] text-[var(--text-gold)]'
                          : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      )}
                    >
                      <span>{normalizeEmojiValue(emoji)}</span>
                      <span>{data.count}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="grid grid-cols-6 gap-1.5">
              {QUICK_REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  role="menuitem"
                  onClick={() => handleReact(emoji)}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]"
                  aria-label={`React with ${normalizeEmojiValue(emoji)}`}
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={() => setShowPicker(prev => !prev)}
                className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]"
                aria-label="Add reaction"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {showPicker && EmojiPicker && (
              <div ref={pickerRef} className="absolute bottom-full right-0 z-50 mb-2">
                <EmojiPicker
                  onEmojiClick={handleSelect}
                  width={320}
                  height={380}
                  theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
                />
              </div>
            )}
          </div>
        )}
      </div>
    )
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
            onClick={() => handleReact(emoji)}
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
          onClick={() => handleReact(emoji)}
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
