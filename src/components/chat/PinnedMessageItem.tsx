import React, { useState } from 'react'
import { PinOff, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import type { Message } from '../../lib/supabase'
import type { EmojiClickData } from '../../types'
import { MessageReactions } from './MessageItem'
import { VideoAttachment } from './VideoAttachment'
import { cn } from '../../lib/utils'
import { UserRoleBadge } from '../ui/UserRoleBadge'
import { UserPresenceBadge } from '../ui/UserPresenceBadge'
import { getBlockedActionMessage } from '../../lib/moderation'
import { showActionErrorToast } from '../../lib/toastNotifications'
import { MessageRichText } from './MessageRichText'
import { EmojiPickerOverlay } from './EmojiPickerOverlay'

const QUICK_REACTIONS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F389}', '\u{1F64F}']

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

  const handleReaction = async (emoji: string) => {
    try {
      await onToggleReaction(message.id, emoji)
    } catch (error) {
      const notice = await getBlockedActionMessage('general_chat', error, 'Failed to update reaction')
      showActionErrorToast(notice)
    }
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
          <strong className="inline-flex items-center gap-1">
            {message.user?.display_name}
            <UserRoleBadge role={message.user?.admin_role} />
            <UserPresenceBadge userId={message.user?.id} presenceVisibility={message.user?.presence_visibility} />
          </strong>
          :{' '}
          {message.message_type === 'audio' ? (
            <audio controls src={message.audio_url} className="mt-1 max-w-full" />
          ) : message.message_type === 'video' && message.file_url ? (
            <VideoAttachment url={message.file_url} meta={message.content} />
          ) : (
            <MessageRichText content={message.content} className="inline whitespace-pre-wrap" />
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
        <EmojiPickerOverlay
          open={showPicker}
          title="Add reaction"
          ariaLabel="Pinned message reaction emoji picker"
          onClose={() => setShowPicker(false)}
          onEmojiClick={handleSelect}
          desktopClassName="fixed left-1/2 top-16 z-[90] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-[var(--radius-md)] sm:absolute sm:left-0 sm:top-full sm:mt-2 sm:translate-x-0"
        />
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
