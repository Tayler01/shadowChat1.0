import React, { useState, useRef, useEffect } from 'react'
import { PinOff, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import type { Message } from '../../lib/supabase'
import { useEmojiPicker } from '../../hooks/useEmojiPicker'
import type { EmojiClickData } from '../../types'
import { MessageReactions } from './MessageItem'
import { cn } from '../../lib/utils'

const QUICK_REACTIONS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F389}', '\u{1F64F}']

const getEmojiPickerDimensions = () => {
  if (typeof window === 'undefined') return { width: 300, height: 360 }

  if (window.innerWidth < 480) {
    return { width: 280, height: Math.max(260, Math.min(320, window.innerHeight - 120)) }
  }

  return { width: 300, height: 360 }
}

const getEmojiPickerTheme = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light'

interface PinnedMessageItemProps {
  message: Message
  onUnpin: (messageId: string) => Promise<void>
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>
}

export const PinnedMessageItem: React.FC<PinnedMessageItemProps> = ({
  message,
  onUnpin,
  onToggleReaction,
}) => {
  const [showPicker, setShowPicker] = useState(false)
  const Picker = useEmojiPicker(showPicker)
  const pickerRef = useRef<HTMLDivElement>(null)
  const pickerDimensions = getEmojiPickerDimensions()

  useEffect(() => {
    if (!showPicker) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const handleReaction = async (emoji: string) => {
    await onToggleReaction(message.id, emoji)
  }

  const handleSelect = (emojiData: EmojiClickData) => {
    handleReaction(emojiData.emoji)
    setShowPicker(false)
  }

  return (
    <div className="glass-panel relative flex items-start rounded-[var(--radius-md)] p-3 group">
      <div className="flex-1 min-w-0 space-y-1">
        <MessageReactions
          message={message}
          onReact={handleReaction}
          className="text-[0.65rem]"
        />
        <div className="break-words text-sm text-[var(--text-primary)]">
          <strong>{message.user?.display_name}:</strong>{' '}
          {message.message_type === 'audio' ? (
            <audio controls src={message.audio_url} className="mt-1 max-w-full" />
          ) : (
            message.content
          )}
        </div>
        <div className={cn('hidden group-hover:flex items-center space-x-2 mt-1', showPicker && 'flex')}>
          {QUICK_REACTIONS.map(e => (
            <button
              key={e}
              onClick={() => handleReaction(e)}
              className="text-base transition-transform hover:scale-110"
            >
              {e}
            </button>
          ))}
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="text-base text-[var(--text-secondary)] transition-transform hover:scale-110 hover:text-[var(--text-gold)]"
            aria-label="Add reaction"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {showPicker && Picker && (
          <div
            ref={pickerRef}
            className="fixed left-1/2 top-16 z-[90] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-[var(--radius-md)] sm:absolute sm:left-0 sm:top-full sm:mt-2 sm:translate-x-0"
          >
            <Picker
              onEmojiClick={handleSelect}
              width={pickerDimensions.width}
              height={pickerDimensions.height}
              theme={getEmojiPickerTheme()}
            />
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onUnpin(message.id)}
        aria-label="Unpin message"
        className="ml-2 text-[var(--text-muted)] hover:text-[var(--text-gold)]"
      >
        <PinOff className="w-4 h-4" />
      </Button>
    </div>
  )
}
