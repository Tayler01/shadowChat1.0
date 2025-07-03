import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Hash, Users, Pin } from 'lucide-react'
import { useMessages } from '../../hooks/useMessages'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { MobileChatFooter } from '../layout/MobileChatFooter'
import toast from 'react-hot-toast'
import { Button } from '../ui/Button'
import { ConsoleModal } from '../ui/ConsoleModal'
import {
  supabase,
  ensureSession,
  refreshSessionLocked,
  resetRealtimeConnection,
  getStoredRefreshToken,
  localStorageKey,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from '../../lib/supabase'
import { useVisibilityRefresh } from '../../hooks/useVisibilityRefresh'

interface ChatViewProps {
  onToggleSidebar: () => void
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
}

export const ChatView: React.FC<ChatViewProps> = ({ onToggleSidebar, currentView, onViewChange }) => {
  const { sendMessage, messages, loading } = useMessages()

  const [consoleOpen, setConsoleOpen] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const appendLog = (msg: string) =>
    setLogs((l) => [...l, `${new Date().toLocaleTimeString()} ${msg}`])

  const appendSupabaseInfo = () => {
    appendLog(`Supabase URL: ${SUPABASE_URL}`)
    appendLog(`Supabase Key: ${SUPABASE_ANON_KEY}`)
  }

  useEffect(() => {
    setConsoleOpen(true)
    setLogs([])
    appendSupabaseInfo()
  }, [])

  const handleCheckAuth = async () => {
    setConsoleOpen(true)
    setLogs([])
    appendSupabaseInfo()

    appendLog('Testing Supabase connectivity...')
    try {
      const { error: pingError } = await supabase.from('users').select('id').limit(1)
      if (pingError) {
        appendLog(`Connectivity check failed: ${pingError.message}`)
      } else {
        appendLog('Connectivity check succeeded ✅')
      }
    } catch (err) {
      appendLog(`Connectivity check threw: ${(err as Error).message}`)
    }

    appendLog('Running basic feature tests...')
    try {
      const { error: msgError } = await supabase.from('messages').select('id').limit(1)
      if (msgError) {
        appendLog(`Messages query failed: ${msgError.message}`)
      } else {
        appendLog('Messages query succeeded ✅')
      }

      const { error: presenceError } = await supabase.rpc('update_user_last_active')
      if (presenceError) {
        appendLog(`Presence RPC failed: ${presenceError.message}`)
      } else {
        appendLog('Presence RPC succeeded ✅')
      }
    } catch (err) {
      appendLog(`Basic tests threw: ${(err as Error).message}`)
    }

    appendLog('Checking session...')
    const { data: before } = await supabase.auth.getSession()
    appendLog(
      before.session
        ? `Current session expires at: ${before.session.expires_at}`
        : 'No active session'
    )

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
    appendLog(data.session ? 'Session still valid ✅' : 'Session missing ❌')
  }

  const handleRefreshSession = async () => {
    appendSupabaseInfo()
    appendLog('Starting forced session refresh...')
    const { data: before } = await supabase.auth.getSession()
    appendLog(
      before.session
        ? `Current session expires at: ${before.session.expires_at}`
        : 'No active session before refresh'
    )
    appendLog(
      `Memory refresh token: ${before.session?.refresh_token ?? 'null'}`
    )
    const storedToken = getStoredRefreshToken()
    appendLog(
      `Stored refresh token (${localStorageKey}): ${storedToken ?? 'null'}`
    )
    appendLog('Calling supabase.auth.refreshSession()')

    let result
    try {
      result = await refreshSessionLocked()
    } catch (err) {
      console.error('Forced session restore threw:', err)
      appendLog(`Refresh threw: ${(err as Error).message}`)
      return
    }

    const { data, error } = result
    const { session, user } = data

    if (error) {
      console.error('Forced session restore failed:', error.message)
      appendLog(`Refresh failed: ${error.message}`)
      return
    }

    appendLog('Session refresh successful ✅')
    appendLog(`New session expires at: ${session?.expires_at}`)
    appendLog(`User id: ${user?.id}`)
    appendLog(`Full response: ${JSON.stringify(data, null, 2)}`)

    const storedAfter = getStoredRefreshToken()
    appendLog(
      `Stored refresh token (${localStorageKey}) after refresh: ${
        storedAfter ?? 'null'
      }`
    )
    appendLog(
      `Memory refresh token after refresh: ${session?.refresh_token ?? 'null'}`
    )

    const { data: after, error: checkError } = await supabase.auth.getSession()
    if (after.session) {
      appendLog(`Post-refresh expires at: ${after.session.expires_at}`)
    }
    if (checkError) {
      appendLog(`Session check failed: ${checkError.message}`)
    } else {
      appendLog(after.session ? 'Session valid ✅' : 'Session invalid ❌')
    }

    // Force a session refresh to ensure tokens are valid
    const valid = await ensureSession(true)
    if (valid) await resetRealtimeConnection()
  }

  const handleFocusRefresh = async () => {
    setConsoleOpen(true)
    setLogs([])
    appendSupabaseInfo()
    appendLog('Page became visible - refreshing session')
    const { data: before } = await supabase.auth.getSession()
    appendLog(
      before.session
        ? `Current session expires at: ${before.session.expires_at}`
        : 'No active session before refresh'
    )
    appendLog(
      `Memory refresh token: ${before.session?.refresh_token ?? 'null'}`
    )
    const storedToken = getStoredRefreshToken()
    appendLog(
      `Stored refresh token (${localStorageKey}): ${storedToken ?? 'null'}`
    )
    appendLog('Calling supabase.auth.refreshSession()')

    let result
    try {
      result = await refreshSessionLocked()
    } catch (err) {
      console.error('Visibility session refresh threw:', err)
      appendLog(`Refresh threw: ${(err as Error).message}`)
      const { data: checkData, error: checkError } =
        await supabase.auth.getSession()
      if (checkError) {
        appendLog(`Session check failed: ${checkError.message}`)
      } else {
        appendLog(
          checkData.session ? 'Session valid ✅' : 'Session invalid ❌'
        )
      }
      return
    }

    const { data, error } = result
    const { session, user } = data

    if (error) {
      appendLog(`Refresh failed: ${error.message}`)
    } else {
      appendLog('Session refresh successful ✅')
      appendLog(`New session expires at: ${session?.expires_at}`)
      appendLog(`User id: ${user?.id}`)
      appendLog(`Full response: ${JSON.stringify(data, null, 2)}`)
      const storedAfter = getStoredRefreshToken()
      appendLog(
        `Stored refresh token (${localStorageKey}) after refresh: ${
          storedAfter ?? 'null'
        }`
      )
      appendLog(
        `Memory refresh token after refresh: ${session?.refresh_token ?? 'null'}`
      )
    }

    const { data: after, error: checkError } = await supabase.auth.getSession()
    if (after.session) {
      appendLog(`Post-refresh expires at: ${after.session.expires_at}`)
    }
    if (checkError) {
      appendLog(`Session check failed: ${checkError.message}`)
    } else {
      appendLog(after.session ? 'Session valid ✅' : 'Session invalid ❌')
    }

    // Force a session refresh to ensure tokens are valid
    const valid = await ensureSession(true)
    if (valid) await resetRealtimeConnection()
  }

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
       key={consoleOpen ? 'console-open' : 'console-closed'}
        open={consoleOpen}
        logs={logs}
        onClose={() => setConsoleOpen(false)}
        onRefresh={handleRefreshSession}
      />
    </motion.div>
  )
}
