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
  getWorkingClient,
  ensureSession,
  resetRealtimeConnection,
  getStoredRefreshToken,
  localStorageKey,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  recreateSupabaseClient,
  forceSessionRestore,
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
    appendLog('📋 Supabase Configuration:')
    appendLog(`URL: ${SUPABASE_URL}`)
    appendLog(`Anon Key: ${SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.substring(0, 20)}...` : 'Not set'}`)
    appendLog(`Local Storage Key: ${localStorageKey}`)
    appendLog('---')
  }

  const handleCheckAuth = async () => {
    setConsoleOpen(true)
    setLogs([])
    appendSupabaseInfo()

    // Test client responsiveness with detailed diagnostics
    appendLog('🔍 Testing Supabase client responsiveness...')
    try {
      const workingClient = await getWorkingClient()
      const testPromise = workingClient.from('users').select('id').limit(1)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Client responsiveness timeout')), 3000)
      )
      
      await Promise.race([testPromise, timeoutPromise])
      const isResponsive = true
      if (isResponsive) {
        appendLog('✅ Main client is responsive')
        
        // Test a simple query
        appendLog('🔍 Testing simple database query...')
        try {
          const queryPromise = workingClient.from('users').select('id').limit(1)
          const queryTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Query timeout')), 5000)
          )
          const { data, error } = await Promise.race([queryPromise, queryTimeout]) as any
          if (error) {
            appendLog(`❌ Database query failed: ${error.message}`)
          } else {
            appendLog('✅ Database query succeeded')
          }
        } catch (queryError) {
          appendLog(`❌ Database query timeout: ${(queryError as Error).message}`)
        }
      }
    } catch (clientError) {
        appendLog('❌ Main client is unresponsive')
        
        // Try resetting the client
        appendLog('🔄 Testing client reset...')
        try {
          const freshClient = await recreateSupabaseClient()
          const resetTestPromise = freshClient.from('users').select('id').limit(1)
          const resetTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Reset client timeout')), 5000)
          )
          
          await Promise.race([resetTestPromise, resetTimeoutPromise])
            appendLog('✅ Client responsive after reset!')
            
            // Test a query after reset
            const { data, error } = await freshClient.from('users').select('id').limit(1)
            if (error) {
              appendLog(`❌ Reset client query failed: ${error.message}`)
            } else {
              appendLog('✅ Reset client query succeeded')
            }
        } catch (resetError) {
          appendLog(`❌ Client reset error: ${(resetError as Error).message}`)
        }
    }
    
    // Network diagnostics
    appendLog('🌐 Testing network connectivity...')
    try {
      const networkTest = fetch('https://httpbin.org/status/200', { 
        method: 'HEAD',
        signal: AbortSignal.timeout(3000)
      })
      const networkResult = await networkTest
      appendLog(`✅ Network test: SUCCESS (${networkResult.status})`)
    } catch (err) {
      appendLog(`❌ Network test failed: ${(err as Error).message}`)
      
      // Try alternative network test
      appendLog('🔄 Trying alternative network test...')
      try {
        const altTest = fetch('https://jsonplaceholder.typicode.com/posts/1', { 
          method: 'HEAD',
          signal: AbortSignal.timeout(3000)
        })
        const altResult = await altTest
        appendLog(`✅ Alternative network test: SUCCESS (${altResult.status})`)
      } catch (altErr) {
        appendLog(`❌ Alternative network test also failed: ${(altErr as Error).message}`)
      }
    }

    // Environment diagnostics
    appendLog('🔧 Environment diagnostics...')
    try {
      appendLog(`User agent: ${navigator.userAgent}`)
      appendLog(`Online status: ${navigator.onLine}`)
      appendLog(`Connection type: ${(navigator as any).connection?.effectiveType || 'unknown'}`)
      appendLog(`WebContainer URL: ${window.location.href}`)
    } catch (err) {
      appendLog(`Environment test failed: ${(err as Error).message}`)
    }

    // Direct API tests
    appendLog('🔗 Testing direct Supabase API access...')
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
      appendLog(`✅ Supabase REST API: SUCCESS (${supabaseResult.status})`)
      if (!supabaseResult.ok) {
        const errorText = await supabaseResult.text()
        appendLog(`Supabase URL error: ${errorText}`)
      }
    } catch (err) {
      appendLog(`Supabase URL test failed: ${(err as Error).message}`)
    }

    appendLog('🔐 Testing Supabase auth endpoint...')
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
      appendLog(`✅ Auth endpoint: SUCCESS (${authResult.status})`)
      if (!authResult.ok) {
        const errorText = await authResult.text()
        appendLog(`Auth endpoint error: ${errorText}`)
      }
    } catch (err) {
      appendLog(`Auth endpoint test failed: ${(err as Error).message}`)
    }

    // Direct database test
    appendLog('📊 Testing direct database access...')
    try {
      const directDbTest = fetch(`${SUPABASE_URL}/rest/v1/users?select=id&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      })
      const dbResult = await directDbTest
      if (dbResult.ok) {
        const data = await dbResult.text()
        appendLog(`✅ Direct DB access: SUCCESS - ${data}`)
      } else {
        appendLog(`❌ Direct DB access failed: ${dbResult.status}`)
      }
    } catch (err) {
      appendLog(`❌ Direct DB test failed: ${(err as Error).message}`)
    }

    // Final comprehensive test
    appendLog('🧪 Final comprehensive test...')
    try {
      appendLog('Using main client for final test')
      
      // Test session with timeout
      try {
        const workingClient = await getWorkingClient()
        const sessionPromise = workingClient.auth.getSession()
        const sessionTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session timeout')), 5000)
        )
        const { data: sessionData, error: sessionError } = await Promise.race([sessionPromise, sessionTimeout]) as any
        if (sessionError) {
          appendLog(`❌ Session check failed: ${sessionError.message}`)
        } else {
          appendLog(`✅ Session check: ${sessionData.session ? 'Authenticated' : 'Not authenticated'}`)
        }
      } catch (sessionErr) {
        appendLog(`❌ Session check timeout: ${(sessionErr as Error).message}`)
      }
      
      // Test database with timeout
      try {
        const workingClient = await getWorkingClient()
        const dbPromise = workingClient.from('users').select('id').limit(1)
        const dbTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database timeout')), 5000)
        )
        const { data: dbData, error: dbError } = await Promise.race([dbPromise, dbTimeout]) as any
        if (dbError) {
          appendLog(`❌ Database query failed: ${dbError.message}`)
        } else {
          appendLog(`✅ Database query succeeded`)
        }
      } catch (dbErr) {
        appendLog(`❌ Database query timeout: ${(dbErr as Error).message}`)
      }
    } catch (err) {
      appendLog(`❌ Final test failed: ${(err as Error).message}`)
    }

    appendLog('🏁 Diagnostics complete!')
  }

  const handleConsoleAuthCheck = async () => {
    appendSupabaseInfo()
    appendLog('Running authentication checks...')
    const workingClient = await getWorkingClient()
    const { data: before, error } = await workingClient.auth.getSession()

    if (error) {
      appendLog(`Failed to get session: ${error.message}`)
      return
    }

    if (!before.session) {
      appendLog('No active session found')
      
      // Trigger session restoration when no active session is found
      appendLog('🔄 Attempting to restore session from localStorage...')
      const restored = await forceSessionRestore()
      
      if (restored) {
        appendLog('✅ Session successfully restored!')
        
        // Re-check session after restoration
        const { data: after, error: afterError } = await workingClient.auth.getSession()
        if (!afterError && after.session) {
          const session = after.session
          appendLog(`✅ Restored session expires at: ${session.expires_at}`)
          const now = Math.floor(Date.now() / 1000)
          appendLog(
            now < (session.expires_at ?? 0)
              ? 'Restored access token is valid ✅'
              : 'Restored access token is expired ❌'
          )
          appendLog(`Restored refresh token: ${session.refresh_token ? 'present' : 'null'}`)
        } else {
          appendLog('❌ Session restoration appeared to succeed but no session found')
        }
      } else {
        appendLog('❌ Session restoration failed')
        appendLog('💡 This could mean:')
        appendLog('  - No valid refresh token in localStorage')
        appendLog('  - Refresh token has expired')
        appendLog('  - Network connectivity issues')
        appendLog('  - User needs to sign in again')
      }
    } else {
      const session = before.session
      appendLog(`Current session expires at: ${session.expires_at}`)
      const now = Math.floor(Date.now() / 1000)
      appendLog(
        now < (session.expires_at ?? 0)
          ? 'Access token valid ✅'
          : 'Access token expired ❌'
      )
      appendLog(`Memory refresh token: ${session.refresh_token ?? 'null'}`)
      
      const storedToken = getStoredRefreshToken()
      appendLog(
        `Stored refresh token (${localStorageKey}): ${storedToken ?? 'null'}`
      )

      if (session.refresh_token) {
        appendLog(
          storedToken === session.refresh_token
            ? 'Stored and memory refresh tokens match ✅'
            : 'Stored and memory refresh tokens differ ❌'
        )
      }
    }
  }

  const handleFocusRefresh = async () => {
    // Let the visibility refresh hook handle client reset
    try {
      await ensureSession()
    } catch (error) {
      console.warn('Visibility refresh failed:', error)
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
        onAuthCheck={handleConsoleAuthCheck}
      />
    </motion.div>
  )
}