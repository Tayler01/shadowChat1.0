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
  clearRefreshSessionPromise,
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

  const handleCheckAuth = async () => {
    setConsoleOpen(true)
    setLogs([])
    appendSupabaseInfo()

    // Test basic network connectivity first
    appendLog('Testing basic network connectivity...')
    try {
      const networkTest = fetch('https://httpbin.org/get', { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      const networkResult = await networkTest
      appendLog(`Network test: ${networkResult.ok ? 'SUCCESS' : 'FAILED'} (${networkResult.status})`)
    } catch (err) {
      appendLog(`Network test failed: ${(err as Error).message}`)
    }

    // Test Supabase URL accessibility
    appendLog('Testing Supabase URL accessibility...')
    try {
      const supabaseUrlTest = fetch(SUPABASE_URL, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      const supabaseResult = await supabaseUrlTest
      appendLog(`Supabase URL test: ${supabaseResult.ok ? 'SUCCESS' : 'FAILED'} (${supabaseResult.status})`)
    } catch (err) {
      appendLog(`Supabase URL test failed: ${(err as Error).message}`)
    }

    // Test auth endpoint specifically
    appendLog('Testing Supabase auth endpoint...')
    try {
      const authTest = fetch(`${SUPABASE_URL}/auth/v1/settings`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        signal: AbortSignal.timeout(5000)
      })
      const authResult = await authTest
      appendLog(`Auth endpoint test: ${authResult.ok ? 'SUCCESS' : 'FAILED'} (${authResult.status})`)
      if (!authResult.ok) {
        const errorText = await authResult.text()
        appendLog(`Auth endpoint error: ${errorText}`)
      }
    } catch (err) {
      appendLog(`Auth endpoint test failed: ${(err as Error).message}`)
    }

    // Test REST API endpoint
    appendLog('Testing Supabase REST API endpoint...')
    try {
      const restTest = fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        signal: AbortSignal.timeout(5000)
      })
      const restResult = await restTest
      appendLog(`REST API test: ${restResult.ok ? 'SUCCESS' : 'FAILED'} (${restResult.status})`)
      if (!restResult.ok) {
        const errorText = await restResult.text()
        appendLog(`REST API error: ${errorText}`)
      }
    } catch (err) {
      appendLog(`REST API test failed: ${(err as Error).message}`)
    }

    // Check current auth state before testing
    appendLog('Checking current auth state...')
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        appendLog(`Session error: ${sessionError.message}`)
      } else if (sessionData.session) {
        appendLog(`Current session: User ${sessionData.session.user?.id}, expires ${sessionData.session.expires_at}`)
      } else {
        appendLog('No current session found')
      }
    } catch (err) {
      appendLog(`Session check failed: ${(err as Error).message}`)
    }
    appendLog('Testing Supabase connectivity...')
    try {
      appendLog('Creating users query...')
      // Add timeout to prevent hanging
      const connectivityTest = supabase.from('users').select('id').limit(1)
      appendLog('Query created, executing with timeout...')
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connectivity test timeout after 10 seconds')), 10000)
      )
      
      appendLog('Awaiting query result...')
      const { error: pingError } = await Promise.race([connectivityTest, timeout]) as any
      appendLog('Query completed')
      if (pingError) {
        appendLog(`Connectivity check failed: ${pingError.message}`)
        appendLog(`Error details: ${JSON.stringify(pingError, null, 2)}`)
      } else {
        appendLog('Connectivity check succeeded ✅')
      }
    } catch (err) {
      const errorMsg = (err as Error).message
      appendLog(`Connectivity check threw: ${errorMsg}`)
      appendLog(`Error stack: ${(err as Error).stack}`)
      
      // If it's a timeout, try to clear any stuck promises and retry
      if (errorMsg.includes('timeout')) {
        appendLog('Clearing stuck promises and retrying...')
        clearRefreshSessionPromise()
        
        try {
          appendLog('Creating retry query...')
          const retryTest = supabase.from('users').select('id').limit(1)
          const retryTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Retry timeout after 5 seconds')), 5000)
          )
          appendLog('Executing retry query...')
          const { error: retryError } = await Promise.race([retryTest, retryTimeout]) as any
          
          if (retryError) {
            appendLog(`Retry failed: ${retryError.message}`)
            appendLog(`Retry error details: ${JSON.stringify(retryError, null, 2)}`)
          } else {
            appendLog('Retry succeeded ✅')
          }
        } catch (retryErr) {
          appendLog(`Retry threw: ${(retryErr as Error).message}`)
          appendLog(`Retry error stack: ${(retryErr as Error).stack}`)
        }
      }
    }

    appendLog('Running basic feature tests...')
    try {
      appendLog('Testing messages table access...')
      const messagesTest = supabase.from('messages').select('id').limit(1)
      const msgTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Messages test timeout after 10 seconds')), 10000)
      )
      const { error: msgError } = await Promise.race([messagesTest, msgTimeout]) as any
      
      if (msgError) {
        appendLog(`Messages query failed: ${msgError.message}`)
        appendLog(`Messages error details: ${JSON.stringify(msgError, null, 2)}`)
      } else {
        appendLog('Messages query succeeded ✅')
      }

      appendLog('Testing RPC function call...')
      const presenceTest = supabase.rpc('update_user_last_active')
      const presenceTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Presence test timeout after 10 seconds')), 10000)
      )
      const { error: presenceError } = await Promise.race([presenceTest, presenceTimeout]) as any
      
      if (presenceError) {
        appendLog(`Presence RPC failed: ${presenceError.message}`)
        appendLog(`Presence error details: ${JSON.stringify(presenceError, null, 2)}`)
      } else {
        appendLog('Presence RPC succeeded ✅')
      }
    } catch (err) {
      appendLog(`Basic tests threw: ${(err as Error).message}`)
      appendLog(`Basic tests error stack: ${(err as Error).stack}`)
    }

    appendLog('Checking session...')
    const { data: before } = await supabase.auth.getSession()
    appendLog(
      before.session
        ? `Current session expires at: ${before.session.expires_at}`
        : 'No active session'
    )

    try {
      appendLog('Clearing any stuck refresh promises before session check...')
      clearRefreshSessionPromise()
      
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
    try {
      const finalTest = supabase.from('users').select('id').limit(1)
      const finalTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Final test timeout after 10 seconds')), 10000)
      )
      const { error } = await Promise.race([finalTest, finalTimeout]) as any
      
      if (error) {
        appendLog(`Database query failed: ${error.message}`)
      } else {
        appendLog('Database query succeeded ✅')
      }

      const { data } = await supabase.auth.getSession()
      appendLog(`Token expires at: ${data.session?.expires_at}`)
      appendLog(data.session ? 'Session still valid ✅' : 'Session missing ❌')
    } catch (err) {
      appendLog(`Database test threw: ${(err as Error).message}`)
    }
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
    // Clear any stuck refresh promises and refresh session silently
    clearRefreshSessionPromise()
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
