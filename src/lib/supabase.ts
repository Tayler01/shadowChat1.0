import { createClient } from '@supabase/supabase-js'

// Global debug flag used to gate verbose logging
export const DEBUG = import.meta.env.VITE_DEBUG_LOGS === 'true'

// Custom fetch that logs all request and response details for debugging
const loggingFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url
  const method = init?.method ?? 'GET'
  let headers: Record<string, string> = {}
  if (init?.headers instanceof Headers) {
    headers = Object.fromEntries(init.headers.entries())
  } else if (init?.headers) {
    headers = init.headers as Record<string, string>
  }
  const body = init?.body

  if (DEBUG) {
    console.log('📡 [Supabase] Request:', { url, method, headers, body })
  }

  try {
    const response = await fetch(input, init)
    const clone = response.clone()
    let responseBody: string | undefined
    try {
      responseBody = await clone.text()
    } catch {
      responseBody = '<unreadable>'
    }
    if (DEBUG) {
      console.log('📡 [Supabase] Response:', {
        url,
        status: response.status,
        body: responseBody,
      })
    }
    return response
  } catch (err) {
    console.error('📡 [Supabase] Fetch error:', err)
    throw err
  }
}

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const supabaseUrl = SUPABASE_URL
const supabaseAnonKey = SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Extract project ref for storage key
const projectRefMatch = supabaseUrl.match(/https?:\/\/(.*?)\./)
const projectRef = projectRefMatch ? projectRefMatch[1] : ''
export const localStorageKey = `sb-${projectRef}-auth-token`

// Create fresh client with unique storage key to avoid conflicts
export function createFreshSupabaseClient() {
  const uniqueStorageKey = `sb-${projectRef}-auth-token-fresh-${Date.now()}`
  
  if (DEBUG) {
    console.log('🆕 Creating fresh Supabase client with storage key:', uniqueStorageKey)
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: uniqueStorageKey, // unique per instance
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 50,
      },
    },
    global: {
      fetch: loggingFetch,
    },
  })
}

// Main client with default storage key
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 50,
    },
  },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: loggingFetch,
  },
})

export const getStoredRefreshToken = (): string | null => {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(localStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return (
      parsed?.currentSession?.refresh_token ||
      parsed?.refresh_token ||
      parsed?.refreshToken ||
      null
    )
  } catch (err) {
    console.error('[Supabase] Failed to read stored refresh token', err)
    return null
  }
}

// Client management
let currentSupabaseClient = supabase
let fallbackClient: ReturnType<typeof createClient> | null = null
let lastHealthCheck = 0
const HEALTH_CHECK_INTERVAL = 10000 // 10 seconds

// Timeout helper
const timeout = (ms: number) => new Promise((_, reject) => 
  setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
)

// Test client responsiveness
const testClientResponsiveness = async (client: ReturnType<typeof createClient>, timeoutMs = 2000): Promise<boolean> => {
  try {
    await Promise.race([
      client.from('users').select('id').limit(1),
      timeout(timeoutMs),
    ])
    return true
  } catch (error) {
    if (DEBUG) {
      console.log('🔍 Client responsiveness test failed:', (error as Error).message)
    }
    return false
  }
}

// Destroy stale client before creating new ones
const destroyClient = async (client: ReturnType<typeof createClient>) => {
  if (!client) return
  
  try {
    await client.realtime.disconnect()
    // @ts-expect-error - forcibly clear internal state
    delete client.auth
    delete client.realtime
  } catch (e) {
    console.warn('Failed to clean up previous Supabase client:', e)
  }
}

// Recreate client using stored token (mimics page reload)
const recreateClientWithStoredToken = async (): Promise<ReturnType<typeof createClient>> => {
  if (DEBUG) console.log('🔄 Recreating client with stored token...')
  
  // Destroy old fallback client if it exists
  if (fallbackClient) {
    await destroyClient(fallbackClient)
    fallbackClient = null
  }
  
  // Get session from localStorage manually (don't use stuck client)
  const raw = localStorage.getItem(localStorageKey)
  const session = raw ? JSON.parse(raw) : null
  
  // Create new client with unique storage key
  const newClient = createFreshSupabaseClient()
  
  // Restore session if available
  if (session?.currentSession?.access_token && session?.currentSession?.refresh_token) {
    try {
      await newClient.auth.setSession({
        access_token: session.currentSession.access_token,
        refresh_token: session.currentSession.refresh_token,
      })
      if (DEBUG) console.log('✅ Session restored to fresh client')
    } catch (err) {
      if (DEBUG) console.warn('⚠️ Failed to restore session to fresh client:', err)
    }
  }
  
  return newClient
}

// Centralized getWorkingClient that tracks and rotates clients
export const getWorkingClient = async (): Promise<ReturnType<typeof createClient>> => {
  const now = Date.now()
  
  // Only check health periodically to avoid excessive testing
  if (now - lastHealthCheck > HEALTH_CHECK_INTERVAL) {
    lastHealthCheck = now
    
    try {
      // Test main client first
      const mainClientWorks = await testClientResponsiveness(currentSupabaseClient, 2000)
      
      if (mainClientWorks) {
        if (DEBUG && fallbackClient) {
          console.log('✅ Main client recovered, cleaning up fallback')
          await destroyClient(fallbackClient)
          fallbackClient = null
        }
        return currentSupabaseClient
      }
      
      if (DEBUG) console.log('❌ Main client unresponsive, switching to fallback')
      
      // Main client is stuck, create/use fallback
      if (!fallbackClient) {
        fallbackClient = await recreateClientWithStoredToken()
      }
      
      // Test fallback client
      const fallbackWorks = await testClientResponsiveness(fallbackClient, 2000)
      
      if (fallbackWorks) {
        if (DEBUG) console.log('✅ Using working fallback client')
        return fallbackClient
      } else {
        if (DEBUG) console.log('❌ Fallback client also unresponsive, recreating...')
        await destroyClient(fallbackClient)
        fallbackClient = await recreateClientWithStoredToken()
        return fallbackClient
      }
      
    } catch (error) {
      if (DEBUG) console.error('❌ Error in getWorkingClient:', error)
      return currentSupabaseClient // fallback to main client
    }
  }
  
  // Return current working client (main or fallback)
  return fallbackClient || currentSupabaseClient
}

// Force client recreation (simulates page reload)
export const recreateSupabaseClient = async (): Promise<ReturnType<typeof createClient>> => {
  if (DEBUG) console.log('🔄 Force recreating Supabase client...')
  
  lastHealthCheck = 0 // Force health check on next call
  
  // Destroy old fallback client
  if (fallbackClient) {
    await destroyClient(fallbackClient)
  }
  
  // Create new fallback client
  fallbackClient = await recreateClientWithStoredToken()
  
  // Test the new client
  const isResponsive = await testClientResponsiveness(fallbackClient, 3000)
  
  if (DEBUG) {
    console.log(isResponsive ? '✅ Fresh client is responsive' : '❌ Fresh client is also unresponsive')
  }
  
  return fallbackClient
}

// --- Refresh session locking -------------------------------------------------
// Prevent multiple concurrent refreshSession calls from triggering duplicate
// network requests. Any callers will await the same promise while a refresh is
// in flight.
let refreshSessionPromise: Promise<{ data: any; error: any }> | null = null

export const clearRefreshSessionPromise = () => {
  refreshSessionPromise = null
}

// Helper function to implement retry logic with exponential backoff
const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      
      if (attempt === maxRetries) {
        throw lastError
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, attempt)
      if (DEBUG) {
        console.log(`[retryWithBackoff] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message)
      }
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError!
}

export const refreshSessionLocked = async () => {
  if (!refreshSessionPromise) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return Promise.reject(new Error('Offline: cannot refresh session'))
    }

    // Wrap the entire refresh operation in retry logic
    refreshSessionPromise = retryWithBackoff(async () => {
      const workingClient = await getWorkingClient()
      const { data: { session }, error } = await workingClient.auth.getSession()
      const storedToken = getStoredRefreshToken()
      if (DEBUG) {
        console.log('[refreshSessionLocked] starting refresh', {
          memoryRefreshToken: session?.refresh_token,
          storedRefreshToken: storedToken,
          expiresAt: session?.expires_at,
        })
      }

      if (DEBUG) {
        console.log('[refreshSessionLocked] calling workingClient.auth.refreshSession')
      }
      
      // Create refresh operation with timeout
      const refresh = workingClient.auth
        .refreshSession()
        .then((res) => {
          if (DEBUG) {
            console.log('[refreshSessionLocked] refresh result', res)
          }
          if (res.data?.session) {
            workingClient.realtime.setAuth(res.data.session?.access_token || '')
            // Reconnect websocket in case it was closed on token expiry
            try {
              workingClient.realtime.connect()
            } catch (err) {
              if (DEBUG) console.error('realtime.connect error', err)
            }
          }
          return res
        })
        .catch((err) => {
          console.error('[refreshSessionLocked] refresh error', err)
          throw err
        })
      
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Session refresh timeout after 30 seconds')),
          30000
        )
      )
      
      return Promise.race([refresh, timeoutPromise]) as Promise<{
        data: any
        error: any
      }>
    }, 3, 1000) // Retry up to 3 times with 1s, 2s, 4s delays
      .then((res) => {
        if (DEBUG) {
          console.log('[refreshSessionLocked] final result', res)
        }
        return res
      })
      .finally(() => {
        refreshSessionPromise = null
      })
  }
  return refreshSessionPromise
}

export const forceRefreshSession = async () => {
  if (DEBUG) {
    console.log('[forceRefreshSession] invoked')
  }
  return refreshSessionLocked()
}

export const resetRealtimeConnection = async () => {
  const workingClient = await getWorkingClient()
  const {
    data: { session },
  } = await workingClient.auth.getSession()
  workingClient.realtime.setAuth(session?.access_token || '')
  try {
    workingClient.realtime.disconnect()
  } catch (err) {
    if (DEBUG) console.error('realtime.disconnect error', err)
  }
  try {
    workingClient.realtime.connect()
  } catch (err) {
    if (DEBUG) console.error('realtime.connect error', err)
  }
}

export const VOICE_BUCKET = 'message-media'
export const UPLOADS_BUCKET = 'chat-uploads'

export const uploadVoiceMessage = async (blob: Blob) => {
  const workingClient = await getWorkingClient()
  const { data: { user } } = await workingClient.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const filePath = `${user.id}/${Date.now()}.webm`
  const { error } = await workingClient.storage.from(VOICE_BUCKET).upload(filePath, blob)
  if (error) throw error
  const { data } = workingClient.storage.from(VOICE_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

export const uploadChatFile = async (file: File) => {
  const workingClient = await getWorkingClient()
  const { data: { user } } = await workingClient.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const filePath = `${user.id}/${Date.now()}_${file.name}`
  const { error } = await workingClient.storage.from(UPLOADS_BUCKET).upload(filePath, file)
  if (error) throw error
  const { data } = workingClient.storage.from(UPLOADS_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

// Database types matching the actual schema
import type { UserStatus } from '../types'

export interface User {
  id: string
  email: string
  username: string
  display_name: string
  avatar_url?: string
  banner_url?: string
  status: UserStatus
  status_message: string
  color: string
  last_active: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  user_id: string
  content: string
  audio_url?: string
  audio_duration?: number
  file_url?: string
  reactions: Record<string, { count: number; users: string[] }>
  pinned: boolean
  edited_at?: string
  reply_to?: string
  created_at: string
  updated_at: string
  user?: User
}

export interface DMConversation {
  id: string
  participants: string[]
  last_message_at: string
  created_at: string
  other_user?: User
  unread_count?: number
  last_message?: DMMessage
}

export interface DMMessage {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  audio_url?: string
  audio_duration?: number
  file_url?: string
  read_at?: string
  reactions: Record<string, { count: number; users: string[] }>
  edited_at?: string
  created_at: string
  sender?: User
}

export interface BasicUser
  extends Pick<
    User,
    'id' | 'username' | 'display_name' | 'avatar_url' | 'color' | 'status'
  > {}

export type ChatMessage = Message | DMMessage

export interface UserSession {
  id: string
  user_id: string
  session_token: string
  last_ping: string
  created_at: string
}

// Helper functions
export const updateUserPresence = async () => {
  const workingClient = await getWorkingClient()
  const { error } = await workingClient.rpc('update_user_last_active')
  if (error) console.error('Error updating presence:', error)
}

export const toggleReaction = async (messageId: string, emoji: string, isDM = false) => {
  const workingClient = await getWorkingClient()
  const { error } = await workingClient.rpc('toggle_message_reaction', {
    message_id: messageId,
    emoji: emoji,
    is_dm: isDM
  })
  if (error) console.error('Error toggling reaction:', error)
}

export const fetchDMConversations = async () => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('get_dm_conversations')
  if (error) {
    console.error('Error fetching DM conversations:', error)
    return [] as DMConversation[]
  }

  const rows = (data ?? []) as any[]

  const missingIds = rows
    .filter(r => !r.other_user && r.other_user_id)
    .map(r => r.other_user_id as string)

  let usersMap: Record<string, User> = {}
  if (missingIds.length) {
    const { data: usersData, error: userErr } = await workingClient
      .from('users')
      .select('id, username, display_name, avatar_url, color, status')
      .in('id', missingIds)
    if (userErr) {
      console.error('Error fetching conversation users:', userErr)
    } else {
      usersMap = Object.fromEntries(
        (usersData ?? []).map(u => [u.id, u as User])
      )
    }
  }

  return rows.map((row) => {
    const lastMsg = row.last_message ||
      (row.last_message_id && {
        id: row.last_message_id,
        conversation_id: row.id,
        sender_id: row.last_message_sender_id,
        content: row.last_message_content,
        created_at: row.last_message_created_at,
      })

    const otherUser = row.other_user ||
      usersMap[row.other_user_id] ||
      (row.other_user_id && {
        id: row.other_user_id,
        username: row.other_user_username,
        display_name: row.other_user_display_name,
      })

    return {
      id: row.id,
      participants: row.participants,
      last_message_at: row.last_message_at,
      created_at: row.created_at,
      other_user: otherUser,
      unread_count: row.unread_count,
      last_message: lastMsg,
    } as DMConversation
  })
}

export const getOrCreateDMConversation = async (otherUserId: string) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('get_or_create_dm_conversation', {
    other_user_id: otherUserId
  })
  if (error) {
    console.error('Error getting/creating DM conversation:', error)
    return null
  }
  return data
}

export const markDMMessagesRead = async (conversationId: string) => {
  const workingClient = await getWorkingClient()
  const { error } = await workingClient.rpc('mark_dm_messages_read', {
    conversation_id: conversationId
  })
  if (error) console.error('Error marking messages as read:', error)
}

export const searchUsers = async (
  term: string,
  options?: { signal?: AbortSignal }
) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc(
    'search_users',
    { term },
    options
  )
  if (error) {
    console.error('Error searching users:', error)
    return [] as BasicUser[]
  }
  return (data ?? []) as BasicUser[]
}

// Helper function to ensure valid session before database operations
export const ensureSession = async (force = false) => {
  try {
    const workingClient = await getWorkingClient()
    const { data: { session }, error } = await workingClient.auth.getSession()

    if (error) {
      console.error('Error getting session:', error)
      return false
    }

    if (!session) {
      if (DEBUG) {
        console.warn('No active session found - user is not authenticated')
      }
      return false
    }

    // Verify we have a valid user in the session
    if (!session.user) {
      if (DEBUG) {
        console.warn('Session exists but no user found')
      }
      return false
    }

    // Check if we have required tokens for refresh
    if (!session.access_token || !session.refresh_token) {
      if (DEBUG) {
        console.warn('Session missing required tokens')
      }
      return false
    }

    if (DEBUG) {
      console.log('ensureSession: current session', {
        userId: session.user?.id,
        expiresAt: session.expires_at,
        hasAccessToken: !!session.access_token,
        hasRefreshToken: !!session.refresh_token,
      })
    }
    
    // Check if session is expired or about to expire (within 5 minutes)
    const expiresAt = session.expires_at
    const now = Math.floor(Date.now() / 1000)
    const fiveMinutes = 5 * 60

    if (force || (expiresAt && (expiresAt - now) < fiveMinutes)) {
      if (DEBUG && force) {
        console.log('ensureSession: forcing refresh regardless of expiry')
      } else if (DEBUG) {
        console.log('ensureSession: session expires soon, refreshing', {
          expiresAt,
          now,
          timeUntilExpiry: expiresAt ? (expiresAt - now) : 'unknown'
        })
      }
      
      const { data: refreshData, error: refreshError } = await refreshSessionLocked()

      if (refreshError) {
        console.error('Error refreshing session:', refreshError)
        return false
      }

      if (!refreshData.session) {
        console.warn('Failed to refresh session')
        return false
      }

      if (DEBUG) {
        console.log('ensureSession: session refreshed', {
          userId: refreshData.session.user?.id,
          expiresAt: refreshData.session.expires_at,
        })
      }
    } else if (DEBUG) {
      console.log('ensureSession: session is still valid, no refresh needed')
    }
    
    return true
  } catch (error) {
    console.error('Exception in ensureSession:', error)
    return false
  }
}

export interface UserStats {
  messages: number
  reactions: number
  friends: number
}

export const fetchUserStats = async (userId: string): Promise<UserStats> => {
  const sessionValid = await ensureSession()

  if (!sessionValid) {
    return { messages: 0, reactions: 0, friends: 0 }
  }

  const workingClient = await getWorkingClient()

  const [messagesRes, reactionsRes, friendsRes] = await Promise.all([
    workingClient
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    workingClient
      .from('message_reactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    workingClient
      .from('dm_conversations')
      .select('id', { count: 'exact', head: true })
      .contains('participants', [userId]),
  ])

  return {
    messages: messagesRes.count || 0,
    reactions: reactionsRes.count || 0,
    friends: friendsRes.count || 0,
  }
}