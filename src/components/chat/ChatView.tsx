import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Hash, Users, Pin } from 'lucide-react'
import { useMessages } from '../../hooks/useMessages'
import { useAuth } from '../../hooks/useAuth'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import toast from 'react-hot-toast'

export const ChatView: React.FC = () => {
  const { sendMessage, messages, loading } = useMessages()
  const { user } = useAuth()

  // Debug the messages state in ChatView
  useEffect(() => {
    if (messages.length > 0) {
      console.log('🏠 ChatView: Messages loaded, count:', messages.length);
    }
  }, [messages, loading]);

  const handleSendMessage = async (content: string) => {
    console.log('🚀 ChatView: Sending message:', content);
    try {
      await sendMessage(content)
      console.log('✅ ChatView: Message sent successfully');
    } catch (error) {
      console.error('❌ ChatView: Failed to send message:', error);
      toast.error('Failed to send message')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full bg-gray-50 dark:bg-gray-900"
    >
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Hash className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  General Chat
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Welcome to the general discussion
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <Users className="w-4 h-4" />
              <span>Online</span>
            </div>
            
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <Pin className="w-4 h-4" />
              <span>Pinned</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <MessageList key={`messages-${messages.length}`} />

      {/* Message Input */}
      <MessageInput
        onSendMessage={handleSendMessage}
        placeholder="Type a message in #general..."
      />
    </motion.div>
  )
}