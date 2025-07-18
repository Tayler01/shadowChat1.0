import React from 'react'
import { Avatar } from '../ui/Avatar'
import { formatTime } from '../../lib/utils'
import type { Message } from '../../lib/supabase'

interface ThreadReplyLinkProps {
  message: Message
  parent: Message
  onJumpToMessage: (id: string) => void
}

export const ThreadReplyLink: React.FC<ThreadReplyLinkProps> = ({
  message,
  parent,
  onJumpToMessage
}) => {
  return (
    <div className="flex space-x-3 ml-2" data-testid="thread-reply-link">
      <Avatar
        src={message.user?.avatar_url}
        alt={message.user?.display_name || 'Unknown User'}
        size="md"
        color={message.user?.color}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline space-x-2 mb-1">
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {message.user?.display_name}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(message.created_at)}
          </span>
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-300 break-words">
          {message.content.slice(0, 40)}
          {message.content.length > 40 ? '...' : ''}
        </div>
        <button
          type="button"
          onClick={() => onJumpToMessage(parent.id)}
          className="text-xs text-blue-600 dark:text-blue-400 mt-1 hover:underline"
        >
          In reply to {parent.user?.display_name || 'Unknown'}: {parent.content.slice(0, 40)}
          {parent.content.length > 40 ? '...' : ''}
        </button>
      </div>
    </div>
  )
}
