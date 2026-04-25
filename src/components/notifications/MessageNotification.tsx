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
          initial={{ opacity: 0, y: -16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          onClick={onClick}
          className={`popup-surface pointer-events-auto flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] p-3 text-[var(--text-primary)] shadow-[0_18px_48px_rgba(0,0,0,0.42)] ${
            desktop
              ? 'w-[22rem]'
              : 'mx-auto w-[min(calc(100vw-2rem),24rem)]'
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
