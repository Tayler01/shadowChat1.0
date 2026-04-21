import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Avatar } from '../ui/Avatar'
import type { Toast } from 'react-hot-toast'

interface MessageNotificationProps {
  t: Toast
  content: string
  sender: {
    display_name?: string
    avatar_url?: string
    color?: string
  }
  onClick: () => void
  desktop: boolean
}

export const MessageNotification: React.FC<MessageNotificationProps> = ({ t, content, sender, onClick, desktop }) => {
  return (
    <AnimatePresence>
      {t.visible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          onClick={onClick}
          className={`popup-surface fixed z-50 flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] p-3 text-[var(--text-primary)] ${
            desktop
              ? 'right-4 top-16 w-[22rem]'
              : 'left-4 right-4 bottom-[calc(env(safe-area-inset-bottom)_+_9rem)]'
          }`}
        >
          <Avatar src={sender.avatar_url} alt={sender.display_name || 'User'} size="sm" color={sender.color} />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
              {sender.display_name}
            </p>
            <p className="truncate text-sm text-[var(--text-secondary)]">
              {content}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
