import React, { useState, useRef, useEffect } from 'react'
import { PinOff, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import type { Message } from '../../lib/supabase'
import { useEmojiPicker } from '../../hooks/useEmojiPicker'
import type { EmojiClickData } from '../../types'
import { MessageReactions } from './MessageItem'
import { cn } from '../../lib/utils'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏']

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
    <div className="relative p-2 rounded-md bg-yellow-100/60 dark:bg-yellow-800/40 flex items-start group">
      <div className="flex-1 min-w-0 space-y-1">
        <MessageReactions
          message={message}
          onReact={handleReaction}
          className="text-[0.65rem]"
        />
        <div className="text-sm text-yellow-800 dark:text-yellow-200 break-words">
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
              className="text-base hover:scale-110 transition-transform"
            >
              {e}
            </button>
          ))}
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="text-base hover:scale-110 transition-transform"
            aria-label="Add reaction"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {showPicker && Picker && (
          <div ref={pickerRef} className="absolute z-50 top-full mt-2">
            <Picker
              onEmojiClick={handleSelect}
              width={320}
              height={400}
              theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
            />
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onUnpin(message.id)}
        aria-label="Unpin message"
        className="ml-2 text-yellow-700 dark:text-yellow-300"
      >
        <PinOff className="w-4 h-4" />
      </Button>
    </div>
  )
}
