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
  resetSupabaseClient,
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

    // First, test if the Supabase client is responsive
    appendLog('Testing Supabase client responsiveness...')
    try {
      const testPromise = supabase.auth.getSession()
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Client responsiveness test timeout')), 2000)
      )
      
      const { data: { session }, error } = await Promise.race([testPromise, timeoutPromise]) as any
      
      if (error) {
        appendLog(`Client responsiveness test failed: ${error.message}`)
        appendLog('Client has error, attempting reset...')
        await attemptClientReset()
      } else {
        appendLog('Client responsiveness test passed ✅')
      }
    } catch (error) {
      if ((error as Error).message.includes('timeout')) {
        appendLog('Client appears stuck/unresponsive - resetting...')
        await attemptClientReset()
      } else {
        appendLog(`Client test error: ${(error as Error).message}`)
      }
    }
    
    // Helper function to attempt client reset with timeout
    async function attemptClientReset() {
      try {
        appendLog('Starting client reset process...')
        const resetPromise = resetSupabaseClient()
        const resetTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Reset timeout after 10 seconds')), 10000)
        )
        
        const resetSuccess = await Promise.race([resetPromise, resetTimeout])
        appendLog(`Client reset ${resetSuccess ? 'succeeded ✅' : 'failed ❌'}`)
        
        // Test if reset worked with a simple query
        appendLog('Testing client after reset...')
        const testAfterReset = supabase.from('users').select('id').limit(1)
        const testTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Post-reset test timeout')), 3000)
        )
        
        const { error: testError } = await Promise.race([testAfterReset, testTimeout]) as any
        if (testError) {
          appendLog(`Post-reset test failed: ${testError.message}`)
        } else {
          appendLog('Client responsive after reset ✅')
        }
        
        // Also test auth after reset
        appendLog('Testing auth after reset...')
        const authTestPromise = supabase.auth.getSession()
        const authTestTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth test timeout')), 3000)
        )
        
        const { data: authData, error: authError } = await Promise.race([authTestPromise, authTestTimeout]) as any
        if (authError) {
          appendLog(`Auth test failed: ${authError.message}`)
        } else {
          appendLog(`Auth test passed: ${authData.session ? 'Session found' : 'No session'}`)
        }
        
      } catch (err) {
        appendLog(`Reset failed: ${(err as Error).message}`)
        if ((err as Error).message.includes('timeout')) {
          appendLog('Reset process timed out - client may be completely stuck')
          appendLog('This suggests a deeper connectivity issue')
        }
      }
    }

    // Additional network connectivity test
    appendLog('Testing basic network connectivity...')
    try {
      const networkTest = fetch('https://www.google.com/favicon.ico', { 
        method: 'HEAD',
        signal: AbortSignal.timeout(3000)
      })
      const networkResult = await networkTest
      appendLog(`Network test: ${networkResult.ok ? 'SUCCESS' : 'FAILED'} (${networkResult.status})`)
    } catch (err) {
      appendLog(`Network test failed: ${(err as Error).message}`)
      appendLog('This suggests a broader network connectivity issue')
    }

    // Test if the issue is WebContainer-specific
    appendLog('Testing WebContainer environment...')
    try {
      appendLog(`User agent: ${navigator.userAgent}`)
      appendLog(`Online status: ${navigator.onLine}`)
      appendLog(`Connection type: ${(navigator as any).connection?.effectiveType || 'unknown'}`)
      appendLog(`Current URL: ${window.location.href}`)
    } catch (err) {
      appendLog(`Environment test failed: ${(err as Error).message}`)
    }
        appendLog('Client responsive after reset ✅')
        
      } catch (err) {
        appendLog(`Reset failed: ${(err as Error).message}`)
        if ((err as Error).message.includes('timeout')) {
          appendLog('Reset process timed out - client may be completely stuck')
        }
      }
    }

    // Test Supabase URL accessibility
    appendLog('Testing Supabase URL accessibility...')
    try {
      const supabaseUrlTest = fetch(`${SUPABASE_URL}/rest/v1/`, { 
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        signal: AbortSignal.timeout(5000)
      })
      const supabaseResult = await supabaseUrlTest
      appendLog(`Supabase URL test: ${supabaseResult.ok ? 'SUCCESS' : 'FAILED'} (${supabaseResult.status})`)
      if (!supabaseResult.ok) {
        const errorText = await supabaseResult.text()
        appendLog(`Supabase URL error: ${errorText}`)
      }
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

    // Check current auth state before testing
    appendLog('Checking current auth state...')
    try {
      const sessionCheck = supabase.auth.getSession()
      const sessionTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session check timeout after 10 seconds')), 10000)
      )
      const { data: sessionData, error: sessionError } = await Promise.race([sessionCheck, sessionTimeout]) as any
      
      if (sessionError) {
        appendLog(`Session error: ${sessionError.message}`)
      } else if (sessionData.session) {
        appendLog(`Current session: User ${sessionData.session.user?.id}, expires ${sessionData.session.expires_at}`)
      } else {
        appendLog('No current session found')
      }
    } catch (err) {
      appendLog(`Session check failed: ${(err as Error).message}`)
      appendLog(`Session check error stack: ${(err as Error).stack}`)
    }
    appendLog('Testing Supabase connectivity...')
    
    // First, let's check if the supabase client is properly initialized
    appendLog('Checking Supabase client configuration...')
    try {
      appendLog(`Supabase client URL: ${supabase.supabaseUrl}`)
      appendLog(`Supabase client key: ${supabase.supabaseKey}`)
      appendLog(`Supabase client auth: ${typeof supabase.auth}`)
      appendLog(`Supabase client from: ${typeof supabase.from}`)
      appendLog(`Supabase client realtime: ${typeof supabase.realtime}`)
    } catch (err) {
      appendLog(`Client config check failed: ${(err as Error).message}`)
    }
    
    // Try a direct REST API call to bypass the client
    appendLog('Testing direct REST API call...')
    try {
      const directApiCall = fetch(`${SUPABASE_URL}/rest/v1/users?select=id&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        signal: AbortSignal.timeout(5000)
      })
      const directResult = await directApiCall
      appendLog(`Direct API call: ${directResult.ok ? 'SUCCESS' : 'FAILED'} (${directResult.status})`)
      if (!directResult.ok) {
        const errorText = await directResult.text()
        appendLog(`Direct API error: ${errorText}`)
      } else {
        const responseText = await directResult.text()
        appendLog(`Direct API response: ${responseText}`)
      }
    } catch (err) {
      appendLog(`Direct API call failed: ${(err as Error).message}`)
    }
    
    // Now try the Supabase client
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

    // Test if the issue is specific to the 'users' table
    appendLog('Testing alternative table access...')
    try {
      const altTest = supabase.from('messages').select('id').limit(1)
      const altTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Alternative table test timeout after 5 seconds')), 5000)
      )
      const { error: altError } = await Promise.race([altTest, altTimeout]) as any
      
      if (altError) {
        appendLog(`Alternative table test failed: ${altError.message}`)
      } else {
        appendLog('Alternative table test succeeded ✅')
      }
    } catch (err) {
      appendLog(`Alternative table test threw: ${(err as Error).message}`)
    }
    
    // Test auth methods specifically
    appendLog('Testing auth methods...')
    try {
      appendLog('Testing auth.getUser()...')
      const getUserTest = supabase.auth.getUser()
      const getUserTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getUser timeout after 5 seconds')), 5000)
      )
      const { data: userData, error: userError } = await Promise.race([getUserTest, getUserTimeout]) as any
      
      if (userError) {
        appendLog(`getUser failed: ${userError.message}`)
      } else {
        appendLog(`getUser succeeded: ${userData.user ? 'User found' : 'No user'}`)
      }
    } catch (err) {
      appendLog(`getUser threw: ${(err as Error).message}`)
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
    try {
      const beforeSessionCheck = supabase.auth.getSession()
      const beforeTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Before session check timeout after 10 seconds')), 10000)
      )
      const { data: before } = await Promise.race([beforeSessionCheck, beforeTimeout]) as any
      appendLog(
        before.session
          ? `Current session expires at: ${before.session.expires_at}`
          : 'No active session'
      )
    } catch (err) {
      appendLog(`Before session check failed: ${(err as Error).message}`)
    }

    try {
      appendLog('Clearing any stuck refresh promises before session check...')
      clearRefreshSessionPromise()
      
      appendLog('Starting ensureSession call...')
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
        appendLog(`ensureSession error: ${(err as Error).message}`)
        appendLog(`ensureSession error stack: ${(err as Error).stack}`)
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

      appendLog('Final session check...')
      const finalSessionCheck = supabase.auth.getSession()
      const finalSessionTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Final session check timeout after 10 seconds')), 10000)
      )
      const { data } = await Promise.race([finalSessionCheck, finalSessionTimeout]) as any
      appendLog(`Token expires at: ${data.session?.expires_at}`)
      appendLog(data.session ? 'Session still valid ✅' : 'Session missing ❌')
    } catch (err) {
      appendLog(`Database test threw: ${(err as Error).message}`)
      appendLog(`Database test error stack: ${(err as Error).stack}`)
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
    setConsoleOpen(true)
    setLogs([])
    appendSupabaseInfo()
    appendLog('Page became visible - checking client health...')
    
    try {
      // Quick test to see if the client is responsive (2 second timeout)
      const testPromise = supabase.auth.getSession()
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Client test timeout')), 2000)
      )
      
      appendLog('Testing client responsiveness...')
      const { data: { session }, error } = await Promise.race([testPromise, timeoutPromise]) as any
      
      if (error) {
        appendLog(`Session check failed: ${error.message}`)
        appendLog('Resetting Supabase client...')
        const resetSuccess = await resetSupabaseClient()
        appendLog(`Client reset ${resetSuccess ? 'succeeded ✅' : 'failed ❌'}`)
      } else if (!session) {
        appendLog('No session found - client responsive but not authenticated')
      } else {
        appendLog('Client responsive ✅')
        // Client is responsive, check if session needs refresh
        const now = Math.floor(Date.now() / 1000)
        const expiresAt = session.expires_at
        const fiveMinutes = 5 * 60
        
        if (expiresAt && (expiresAt - now) < fiveMinutes) {
          appendLog('Session close to expiring, refreshing...')
          clearRefreshSessionPromise()
          const valid = await ensureSession(true)
          if (valid) {
            appendLog('Session refreshed and realtime reconnected ✅')
            await resetRealtimeConnection()
          } else {
            appendLog('Session refresh failed ❌')
          }
        } else {
          appendLog('Session still valid, resetting realtime connection...')
          // Session is still valid, just reset realtime connection
          await resetRealtimeConnection()
          appendLog('Realtime connection reset ✅')
        }
      }
    } catch (error) {
      if ((error as Error).message.includes('timeout')) {
        appendLog('Supabase client appears stuck/unresponsive!')
        appendLog('Attempting aggressive client reset...')
        const resetSuccess = await resetSupabaseClient()
        appendLog(`Aggressive reset ${resetSuccess ? 'succeeded ✅' : 'failed ❌'}`)
      } else {
        appendLog(`Unexpected error: ${(error as Error).message}`)
      }
    }
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
