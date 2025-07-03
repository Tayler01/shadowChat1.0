import { createClient } from '@supabase/supabase-js'

// Global debug flag used to gate verbose logging
export const DEBUG = import.meta.env.VITE_DEBUG_LOGS === 'true'

// Backup fetch function that bypasses the Supabase client when it's stuck
const createBackupSupabaseClient = () => {
  const backupFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    const method = init?.method ?? 'GET'
    
    if (DEBUG) {
      console.log('🔄 [Backup] Request:', { url, method })
    }
    
    try {
      const response = await fetch(input, init)
      if (DEBUG) {
        console.log('🔄 [Backup] Response:', { url, status: response.status })
      }
      return response
    } catch (err) {
      console.error('🔄 [Backup] Fetch error:', err)
      throw err
    }
  }
  
  const { createClient } = require('@supabase/supabase-js')
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: backupFetch,
    },
  })
}

// Test if the main client is responsive
export const testClientResponsiveness = async (timeoutMs = 2000): Promise<boolean> => {
  try {
    const testPromise = supabase.auth.getSession()
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Client responsiveness timeout')), timeoutMs)
    )
    
    await Promise.race([testPromise, timeoutPromise])
    return true
  } catch (error) {
    if (DEBUG) {
      console.log('🔍 Client responsiveness test failed:', (error as Error).message)
    }
    return false
  }
}

// Backup client for when main client is stuck
let backupClient: any = null

export const getWorkingClient = async () => {
  const isResponsive = await testClientResponsiveness()
  
  if (isResponsive) {
    if (DEBUG) console.log('✅ Main client is responsive')
    return supabase
  }
  
  if (DEBUG) console.log('⚠️ Main client unresponsive, using backup')
  
  if (!backupClient) {
    backupClient = createBackupSupabaseClient()
  }
  
  return backupClient
}

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

// Key used by Supabase to persist the auth session in localStorage
const projectRefMatch = supabaseUrl.match(/https?:\/\/(.*?)\./)
const projectRef = projectRefMatch ? projectRefMatch[1] : ''
export const localStorageKey = `sb-${projectRef}-auth-token`

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

// --- Refresh session locking -------------------------------------------------
// Prevent multiple concurrent refreshSession calls from triggering duplicate
// network requests. Any callers will await the same promise while a refresh is
// in flight.
let refreshSessionPromise: Promise<{ data: any; error: any }> | null = null

export const clearRefreshSessionPromise = () => {
  refreshSessionPromise = null
}

// Function to completely reset the Supabase client
export const resetSupabaseClient = async () => {
  try {
    if (DEBUG) console.log('Starting Supabase client reset...')
    
    // Clear backup client if it exists
    backupClient = null
    
    // Try to get session from localStorage directly since client may be stuck
    if (DEBUG) console.log('Getting session from localStorage...')
    let session = null
    try {
      const storedSession = localStorage.getItem(localStorageKey)
      if (storedSession) {
        const parsed = JSON.parse(storedSession)
        session = parsed?.currentSession || parsed
        if (DEBUG) console.log('Session retrieved from localStorage')
      }
    } catch (err) {
      if (DEBUG) console.log('Failed to get session from localStorage:', (err as Error).message)
    }
    
    // Force disconnect everything
    if (DEBUG) console.log('Force disconnecting all connections...')
    try {
      // Try to disconnect realtime, but don't wait if it hangs
      const disconnectPromise = Promise.resolve(supabase.realtime.disconnect())
      const disconnectTimeout = new Promise(resolve => setTimeout(resolve, 1000))
      await Promise.race([disconnectPromise, disconnectTimeout])
      if (DEBUG) console.log('Realtime disconnected (or timed out)')
    } catch (err) {
      if (DEBUG) console.log('Realtime disconnect error (continuing):', (err as Error).message)
    }
    
    // Clear all pending promises and state
    if (DEBUG) console.log('Clearing all pending state...')
    clearRefreshSessionPromise()
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Create a completely new client instance to test if the issue is with the current instance
    if (DEBUG) console.log('Creating test client instance...')
    const testClient = createBackupSupabaseClient()
    
    // Test the new client
    if (DEBUG) console.log('Testing new client instance...')
    try {
      const testPromise = testClient.from('users').select('id').limit(1)
      const testTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test client timeout')), 3000)
      )
      await Promise.race([testPromise, testTimeout])
      if (DEBUG) console.log('New client instance works ✅')
    } catch (err) {
      if (DEBUG) console.log('New client instance also failed:', (err as Error).message)
      return false
    }
    
    // If new client works, the issue is with our main client
    // Reset the main client's auth and realtime
    if (DEBUG) console.log('Resetting main client auth...')
    try {
      // Set auth token from session
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token)
        if (DEBUG) console.log('Auth token restored from session')
      } else {
        supabase.realtime.setAuth('')
        if (DEBUG) console.log('Auth token cleared (no session)')
      }
    } catch (err) {
      if (DEBUG) console.log('Auth reset error:', (err as Error).message)
    }
    
    // Reconnect realtime
    if (DEBUG) console.log('Reconnecting realtime...')
    try {
      const connectPromise = Promise.resolve(supabase.realtime.connect())
      const connectTimeout = new Promise(resolve => setTimeout(resolve, 2000))
      await Promise.race([connectPromise, connectTimeout])
      if (DEBUG) console.log('Realtime reconnected (or timed out)')
    } catch (err) {
      if (DEBUG) console.log('Realtime reconnect error:', (err as Error).message)
    }
    
    if (DEBUG) console.log('Client reset process completed')
    
    return true
  } catch (error) {
    if (DEBUG) console.error('Error in resetSupabaseClient:', error)
    return false
  }
}

export const refreshSessionLocked = async () => {
  if (!refreshSessionPromise) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return Promise.reject(new Error('Offline: cannot refresh session'))
    }

    const { data: { session }, error } = await supabase.auth.getSession()
    const storedToken = getStoredRefreshToken()
    if (DEBUG) {
      console.log('[refreshSessionLocked] starting refresh', {
        memoryRefreshToken: session?.refresh_token,
        storedRefreshToken: storedToken,
        expiresAt: session?.expires_at,
      })
    }

    if (DEBUG) {
      console.log('[refreshSessionLocked] calling supabase.auth.refreshSession')
    }
    const refresh = supabase.auth
      .refreshSession()
      .then((res) => {
        if (DEBUG) {
          console.log('[refreshSessionLocked] refresh result', res)
        }
        if (res.data?.session) {
          supabase.realtime.setAuth(res.data.session?.access_token || '')
          // Reconnect websocket in case it was closed on token expiry
          try {
            supabase.realtime.connect()
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
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Session refresh timeout after 10 seconds')),
        10000
      )
    )
    refreshSessionPromise = (Promise.race([refresh, timeout]) as Promise<{
      data: any
      error: any
    }>)
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
  const {
    data: { session },
  } = await supabase.auth.getSession()
  supabase.realtime.setAuth(session?.access_token || '')
  try {
    supabase.realtime.disconnect()
  } catch (err) {
    if (DEBUG) console.error('realtime.disconnect error', err)
  }
  try {
    supabase.realtime.connect()
  } catch (err) {
    if (DEBUG) console.error('realtime.connect error', err)
  }
}

export const VOICE_BUCKET = 'message-media'
export const UPLOADS_BUCKET = 'chat-uploads'

export const uploadVoiceMessage = async (blob: Blob) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const filePath = `${user.id}/${Date.now()}.webm`
  const { error } = await supabase.storage.from(VOICE_BUCKET).upload(filePath, blob)
  if (error) throw error
  const { data } = supabase.storage.from(VOICE_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

export const uploadChatFile = async (file: File) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const filePath = `${user.id}/${Date.now()}_${file.name}`
  const { error } = await supabase.storage.from(UPLOADS_BUCKET).upload(filePath, file)
  if (error) throw error
  const { data } = supabase.storage.from(UPLOADS_BUCKET).getPublicUrl(filePath)
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
  const { error } = await supabase.rpc('update_user_last_active')
  if (error) console.error('Error updating presence:', error)
}

export const toggleReaction = async (messageId: string, emoji: string, isDM = false) => {
  const { error } = await supabase.rpc('toggle_message_reaction', {
    message_id: messageId,
    emoji: emoji,
    is_dm: isDM
  })
  if (error) console.error('Error toggling reaction:', error)
}

export const fetchDMConversations = async () => {
  const { data, error } = await supabase.rpc('get_dm_conversations')
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
    const { data: usersData, error: userErr } = await supabase
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
  const { data, error } = await supabase.rpc('get_or_create_dm_conversation', {
    other_user_id: otherUserId
  })
  if (error) {
    console.error('Error getting/creating DM conversation:', error)
    return null
  }
  return data
}

export const markDMMessagesRead = async (conversationId: string) => {
  const { error } = await supabase.rpc('mark_dm_messages_read', {
    conversation_id: conversationId
  })
  if (error) console.error('Error marking messages as read:', error)
}

export const searchUsers = async (
  term: string,
  options?: { signal?: AbortSignal }
) => {
  const { data, error } = await supabase.rpc(
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
    const client = await getWorkingClient()
    const { data: { session }, error } = await client.auth.getSession()

    if (error) {
      console.error('Error getting session:', error)
      return false
    }

    if (!session) {
      console.warn('No active session found')
      return false
    }

    if (DEBUG) {
      console.log('ensureSession: current session', {
        userId: session.user?.id,
        expiresAt: session.expires_at,
      })
    }
    
    // Check if session is expired or about to expire (within 5 minutes)
    const expiresAt = session.expires_at
    const now = Math.floor(Date.now() / 1000)
    const fiveMinutes = 5 * 60

    if (force || (expiresAt && (expiresAt - now) < fiveMinutes)) {
      if (DEBUG && force) {
        console.log('ensureSession: forcing refresh regardless of expiry')
      }
      
      // Use working client for refresh
      const workingClient = await getWorkingClient()
      const { data: refreshData, error: refreshError } = await workingClient.auth.refreshSession()

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
  const client = await getWorkingClient()
  const sessionValid = await ensureSession()

  if (!sessionValid) {
    return { messages: 0, reactions: 0, friends: 0 }
  }

  const [messagesRes, reactionsRes, friendsRes] = await Promise.all([
    client
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    client
      .from('message_reactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    client
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

