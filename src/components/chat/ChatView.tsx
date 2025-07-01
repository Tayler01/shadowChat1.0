import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Hash, Users, Pin } from 'lucide-react'
import { useMessages } from '../../hooks/useMessages'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import toast from 'react-hot-toast'
import { Button } from '../ui/Button'
import { ConsoleModal } from '../ui/ConsoleModal'
import { supabase, ensureSession } from '../../lib/supabase'

interface ChatViewProps {
  onToggleSidebar: () => void
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
}

export const ChatView: React.FC<ChatViewProps> = ({ onToggleSidebar, currentView, onViewChange }) => {
  const { sendMessage, messages, loading } = useMessages()

  const [consoleOpen, setConsoleOpen] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const appendLog = (msg: string) => setLogs((l) => [...l, msg])

  const handleCheckAuth = async () => {
    setConsoleOpen(true)
    setLogs([])

    appendLog('Checking session...')

    try {
      const valid = await Promise.race([
        ensureSession(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 10000)
        ),
      ])

      appendLog(valid ? 'Session valid ✅' : 'Session invalid ❌')
    } catch (err) {
      if ((err as Error).message === 'timeout') {
        appendLog('Connection verification timed out ❌')
      } else {
        appendLog('Failed to verify connection ❌')
      }
      console.error('Session verification failed:', err)
      return
    }

    appendLog('Testing database query...')
    const { error } = await supabase.from('users').select('id').limit(1)
    if (error) {
      appendLog(`Database query failed: ${error.message}`)
    } else {
      appendLog('Database query succeeded ✅')
    }

    const { data } = await supabase.auth.getSession()
    appendLog(`Token expires at: ${data.session?.expires_at}`)
  }

  const handleRefreshSession = async () => {
    appendLog('🔄 Force refreshing session...')
    appendLog('Calling supabase.auth.refreshSession() directly')

    try {
      const { data, error } = await supabase.auth.refreshSession()
      
      if (error) {
        appendLog(`❌ Refresh failed: ${error.message}`)
        console.error('Force session refresh failed:', error)
      } else {
        appendLog('✅ Session refreshed successfully')
        
        if (data.session) {
          appendLog(`📅 New session expires at: ${data.session.expires_at}`)
          appendLog(`👤 User id: ${data.session.user?.id}`)
          appendLog(`🔑 Access token length: ${data.session.access_token?.length || 0} chars`)
        } else {
          appendLog('⚠️ No session returned after refresh')
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      appendLog(`💥 refreshSession() threw an error: ${errorMessage}`)
      console.error('Session refresh failed:', error)
    }
  }

  const handleSendMessage = async (
    content: string,
    type?: 'text' | 'command' | 'audio' | 'image',
    fileUrl?: string
  ) => {
    try {
      await sendMessage(content, type, fileUrl)
    } catch (error) {
      console.error('❌ ChatView: Failed to send message:', error)
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
      <div className="flex-shrink-0 px-6 py-5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Menu button removed on mobile */}
            {/* Header title */}
            <div className="flex items-center space-x-2">
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  General Chat
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <Users className="w-4 h-4" />
              <span>Online</span>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <Pin className="w-4 h-4" />
              <span>Pinned</span>
            </div>
            <Button size="sm" variant="secondary" onClick={handleCheckAuth}>
              Test Auth
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <MessageList />

      {/* Desktop Message Input */}
      <div className="hidden md:block">
        <MessageInput
          onSendMessage={handleSendMessage}
          placeholder="Type a message"
        />
      </div>

      {/* Mobile Message Input with Navigation */}
      <MobileChatFooter
        currentView={currentView}
        onViewChange={onViewChange}
      >
        <MessageInput
          onSendMessage={handleSendMessage}
          placeholder="Type a message"
          className="border-t"
        />
      </MobileChatFooter>
      <ConsoleModal
        open={consoleOpen}
        logs={logs}
        onClose={() => setConsoleOpen(false)}
        onRefresh={handleRefreshSession}
      />
    </motion.div>
  )
}
