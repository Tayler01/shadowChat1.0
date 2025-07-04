import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Hash, Users, Pin } from 'lucide-react'
import { useMessages } from '../../hooks/useMessages'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { useFailedMessages } from '../../hooks/useFailedMessages'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import toast from 'react-hot-toast'
import { Button } from '../ui/Button'
import { ConsoleModal } from '../ui/ConsoleModal'
import { ClientResetIndicator } from '../ui/ClientResetIndicator'
import { useClientResetStatus } from '../../hooks/useClientResetStatus'
import {
  DEBUG,
  ensureSession
} from '../../lib/supabase'
import { useVisibilityRefresh } from '../../hooks/useVisibilityRefresh'

interface ChatViewProps {
  onToggleSidebar: () => void
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
}

export const ChatView: React.FC<ChatViewProps> = ({ onToggleSidebar, currentView, onViewChange }) => {
  const { sendMessage, messages, loading, sending } = useMessages()
  const { status: resetStatus, lastResetTime, manualReset } = useClientResetStatus()
  const { failedMessages, addFailedMessage, removeFailedMessage } = useFailedMessages('general')

  const [consoleOpen, setConsoleOpen] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  const appendLog = (msg: string) =>
    setLogs((l) => [...l, `${new Date().toLocaleTimeString()} ${msg}`])

  const handleCheckAuth = async () => {
    if (!DEBUG) return
    setConsoleOpen(true)
    setLogs([])
    const { runAuthDiagnostics } = await import('../../lib/debugDiagnostics')
    await runAuthDiagnostics(appendLog)
  }
  const handleConsoleAuthCheck = async () => {
    if (!DEBUG) return
    const { runConsoleAuthDiagnostics } = await import("../../lib/debugDiagnostics")
    await runConsoleAuthDiagnostics(appendLog)
  }



  const handleFocusRefresh = useCallback(async () => {
    // Let the visibility refresh hook handle client reset
    try {
      await ensureSession()
    } catch (error) {
      console.warn('Visibility refresh failed:', error)
    }
  }, [])

  useVisibilityRefresh(handleFocusRefresh)

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
      addFailedMessage({ id: Date.now().toString(), type: type || 'text', content: content, dataUrl: fileUrl })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 text-sm"
    >
      {/* Header */}
      <div className="hidden md:block flex-shrink-0 px-6 py-5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
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
              <ClientResetIndicator status={resetStatus} lastResetTime={lastResetTime} />
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <Pin className="w-4 h-4" />
              <span>Pinned</span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => { handleCheckAuth(); manualReset(); }}>
              Test Auth
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { manualReset(); }}>
              Reset Client
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <MessageList
        failedMessages={failedMessages}
        onResend={msg => {
          removeFailedMessage(msg.id)
          handleSendMessage(msg.content, msg.type, msg.dataUrl)
        }}
        sending={sending}
        uploading={uploading}
      />

      {/* Desktop Message Input */}
      <div className="hidden md:block">
        <MessageInput
          onSendMessage={handleSendMessage}
          placeholder="Type a message"
          cacheKey="general"
          onUploadStatusChange={setUploading}
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
          cacheKey="general"
          onUploadStatusChange={setUploading}
        />
      </MobileChatFooter>
      <ConsoleModal
        key={consoleOpen ? 'console-open' : 'console-closed'}
        open={consoleOpen}
        logs={logs}
        onClose={() => setConsoleOpen(false)}
        onAuthCheck={handleConsoleAuthCheck}
      />
    </motion.div>
  )
}