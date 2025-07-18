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
          className={`fixed z-50 cursor-pointer flex items-center space-x-2 p-3 rounded-lg shadow-lg border bg-white dark:bg-gray-800 dark:border-gray-700 ${desktop ? 'md:top-16 md:right-4 md:w-72' : 'top-0 inset-x-0 w-full'}`}
        >
          <Avatar src={sender.avatar_url} alt={sender.display_name || 'User'} size="sm" color={sender.color} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {sender.display_name}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {content}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
