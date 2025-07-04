import { createClient } from '@supabase/supabase-js'

// Global debug flag used to gate verbose logging
export const DEBUG = import.meta.env.VITE_DEBUG_LOGS === 'true' || import.meta.env.DEV === true

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
export let supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
export const setSupabaseClient = (client: ReturnType<typeof createClient>) => {
  supabase = client
}
let fallbackClient: ReturnType<typeof createClient> | null = null
let lastHealthCheck = 0
const HEALTH_CHECK_INTERVAL = 10000 // 10 seconds

// Timeout helper
const timeout = (ms: number) => new Promise((_, reject) => 
  setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
)

// Promote fallback client to main client
export const promoteFallbackToMain = async (): Promise<void> => {
  if (DEBUG) console.log('🔄 [SUPABASE] promoteFallbackToMain: Starting...')
  
  if (!fallbackClient) {
    if (DEBUG) console.log('⚠️ [SUPABASE] promoteFallbackToMain: No fallback client to promote')
    return
  }
  
  try {
    // Test that fallback client is actually working
    if (DEBUG) console.log('🧪 [SUPABASE] Testing fallback client before promotion...')
    const isResponsive = await testClientResponsiveness(fallbackClient, 2000)
    
    if (!isResponsive) {
      if (DEBUG) console.log('❌ [SUPABASE] Fallback client is not responsive, cannot promote')
      return
    }
    
    if (DEBUG) console.log('✅ [SUPABASE] Fallback client is responsive, promoting to main...')
    
    // Destroy old main client
    if (DEBUG) console.log('🗑️ [SUPABASE] Destroying old main client...')
    await destroyClient(currentSupabaseClient)
    
    // Promote fallback to main
    currentSupabaseClient = fallbackClient
    fallbackClient = null
    setSupabaseClient(currentSupabaseClient)
    
    // Reset health check timer to force immediate use of new main client
    lastHealthCheck = 0
    
    if (DEBUG) console.log('✅ [SUPABASE] promoteFallbackToMain: Complete - fallback is now main client')
  } catch (error) {
    if (DEBUG) console.error('❌ [SUPABASE] promoteFallbackToMain: Failed:', error)
  }
}

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
  if (DEBUG) console.log('🔄 [SUPABASE] recreateClientWithStoredToken: Starting...')
  
  // Destroy old fallback client if it exists
  if (fallbackClient) {
    if (DEBUG) console.log('🗑️ [SUPABASE] Destroying old fallback client...')
    await destroyClient(fallbackClient)
    fallbackClient = null
    if (DEBUG) console.log('✅ [SUPABASE] Old fallback client destroyed')
  }
  
  // Create new client with unique storage key
  if (DEBUG) console.log('🆕 [SUPABASE] Creating fresh client...')
  const newClient = createFreshSupabaseClient()
  if (DEBUG) console.log('✅ [SUPABASE] Fresh client created')
  
  // Attempt to restore session from localStorage
  if (DEBUG) console.log('🔐 [SUPABASE] Attempting session restoration...')
  await restoreSessionIfNeeded(newClient)
  if (DEBUG) console.log('✅ [SUPABASE] recreateClientWithStoredToken: Complete')
  
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
  if (DEBUG) console.log('🔄 [SUPABASE] recreateSupabaseClient: Starting force recreation...')
  
  lastHealthCheck = 0 // Force health check on next call
  if (DEBUG) console.log('🔄 [SUPABASE] Health check timer reset')
  
  // Destroy old fallback client
  if (fallbackClient) {
    if (DEBUG) console.log('🗑️ [SUPABASE] Destroying existing fallback client...')
    await destroyClient(fallbackClient)
    if (DEBUG) console.log('✅ [SUPABASE] Existing fallback client destroyed')
  }
  
  // Create new fallback client
  if (DEBUG) console.log('🆕 [SUPABASE] Creating new fallback client...')
  fallbackClient = await recreateClientWithStoredToken()
  if (DEBUG) console.log('✅ [SUPABASE] New fallback client created')
  
  // Test the new client
  if (DEBUG) console.log('🧪 [SUPABASE] Testing new client responsiveness...')
  const isResponsive = await testClientResponsiveness(fallbackClient, 3000)
  
  if (DEBUG) {
    console.log(isResponsive ? '✅ [SUPABASE] Fresh client is responsive' : '❌ [SUPABASE] Fresh client is also unresponsive')
  }
  
  if (DEBUG) console.log('✅ [SUPABASE] recreateSupabaseClient: Complete')
  return fallbackClient
}

// Restore session from localStorage to a fresh client
export const restoreSessionIfNeeded = async (client: ReturnType<typeof createClient>): Promise<boolean> => {
  if (DEBUG) console.log('🔐 [SUPABASE] restoreSessionIfNeeded: Starting...')
  
  try {
    if (DEBUG) console.log('📖 [SUPABASE] Reading localStorage for session data...')
    const raw = localStorage.getItem(localStorageKey)
    const stored = raw ? JSON.parse(raw) : null
    
    if (!stored?.currentSession?.refresh_token && !stored?.refresh_token) {
      if (DEBUG) console.log('❌ [SUPABASE] No stored refresh token found in localStorage')
      return false
    }

    const refreshToken = stored.currentSession?.refresh_token || stored.refresh_token
    const accessToken = stored.currentSession?.access_token || stored.access_token || ''

    if (DEBUG) console.log('🔄 [SUPABASE] Found tokens, calling setSession...', {
      hasRefreshToken: !!refreshToken,
      hasAccessToken: !!accessToken,
      refreshTokenLength: refreshToken?.length || 0,
      accessTokenLength: accessToken?.length || 0
    })
    
    const { data, error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    if (error) {
      if (DEBUG) console.warn('❌ [SUPABASE] setSession failed:', {
        message: error.message,
        code: error.status,
        details: error
      })
      return false
    } else {
      if (DEBUG) console.log('✅ [SUPABASE] setSession successful:', {
        hasSession: !!data.session,
        userId: data.session?.user?.id,
        expiresAt: data.session?.expires_at
      })
      // Update realtime auth token
      client.realtime.setAuth(data.session?.access_token || '')
      if (DEBUG) console.log('✅ [SUPABASE] Realtime auth token updated')
      return true
    }
  } catch (error) {
    if (DEBUG) console.error('❌ [SUPABASE] Exception during session restoration:', error)
    return false
  }
}

// Force session restoration for diagnostics
export const forceSessionRestore = async (): Promise<boolean> => {
  if (DEBUG) console.log('🔐 [SUPABASE] forceSessionRestore: Starting...')
  
  try {
    if (DEBUG) console.log('🔍 [SUPABASE] Getting working client...')
    const workingClient = await getWorkingClient()
    if (DEBUG) console.log('✅ [SUPABASE] Working client obtained')
    
    // First check if we already have a session
    if (DEBUG) console.log('🔍 [SUPABASE] Checking for existing session...')
    const { data: { session }, error } = await workingClient.auth.getSession()
    if (!error && session) {
      if (DEBUG) console.log('✅ [SUPABASE] Active session already exists:', {
        userId: session.user?.id,
        expiresAt: session.expires_at
      })
      return true
    }
    
    if (DEBUG) console.log('🔍 [SUPABASE] No active session found, attempting restoration...')
    
    // Try to restore from localStorage
    if (DEBUG) console.log('🔄 [SUPABASE] Trying restoration with current working client...')
    const restored = await restoreSessionIfNeeded(workingClient)
    if (restored) {
      if (DEBUG) console.log('✅ [SUPABASE] Session restored with working client')
      return true
    }
    
    // If restoration failed, try with a fresh client
    if (DEBUG) console.log('🔄 [SUPABASE] Working client restoration failed, trying with fresh client...')
    const freshClient = await recreateSupabaseClient()
    const restoredWithFresh = await restoreSessionIfNeeded(freshClient)
    
    if (DEBUG) console.log(restoredWithFresh ? 
      '✅ [SUPABASE] Session restored with fresh client' : 
      '❌ [SUPABASE] Session restoration failed with fresh client'
    )
    
    return restoredWithFresh
  } catch (error) {
    if (DEBUG) console.error('❌ [SUPABASE] forceSessionRestore failed:', error)
    return false
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

export const refreshSessionLocked = async () => {
  if (!refreshSessionPromise) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return Promise.reject(new Error('Offline: cannot refresh session'))
    }

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
        () => reject(new Error('Session refresh timeout after 10 seconds')),
        10000
      )
    )
    refreshSessionPromise = (Promise.race([refresh, timeoutPromise]) as Promise<{
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
  if (DEBUG) console.log('🔄 [SUPABASE] resetRealtimeConnection: Starting comprehensive reset...')
  
  // Get current session before recreating client
  const currentClient = await getWorkingClient()
  const { data: { session } } = await currentClient.auth.getSession()
  
  if (DEBUG) console.log('🔄 [SUPABASE] Current session:', {
    hasSession: !!session,
    userId: session?.user?.id,
    expiresAt: session?.expires_at
  })
  
  // Clean up existing channels on current client
  try {
    const channels = currentClient.getChannels()
    if (DEBUG) console.log('🗑️ [SUPABASE] Removing existing channels:', channels.length)
    channels.forEach(ch => {
      try {
        currentClient.removeChannel(ch)
      } catch (removeErr) {
        if (DEBUG) console.warn('removeChannel error', removeErr)
      }
    })
  } catch (err) {
    if (DEBUG) console.warn('failed to clean channels', err)
  }
  
  // Disconnect current realtime connection
  try {
    if (DEBUG) console.log('🔌 [SUPABASE] Disconnecting current realtime...')
    currentClient.realtime.disconnect()
  } catch (err) {
    if (DEBUG) console.error('realtime.disconnect error', err)
  }
  
  // Force recreation of client to get fresh bindings
  if (DEBUG) console.log('🆕 [SUPABASE] Creating fresh client to resolve binding mismatch...')
  const freshClient = await recreateSupabaseClient()
  
  // Promote the fresh client to main if it's working
  if (DEBUG) console.log('🔄 [SUPABASE] Testing fresh client and promoting if working...')
  const isResponsive = await testClientResponsiveness(freshClient, 3000)
  
  if (isResponsive) {
    if (DEBUG) console.log('✅ [SUPABASE] Fresh client is responsive, promoting to main...')
    await promoteFallbackToMain()
  } else {
    if (DEBUG) console.log('⚠️ [SUPABASE] Fresh client not responsive, keeping current setup')
  }
  
  // Get the working client (either the promoted fresh one or current)
  const workingClient = await getWorkingClient()
  
  // Set auth token on realtime
  if (DEBUG) console.log('🔐 [SUPABASE] Setting realtime auth token...')
  workingClient.realtime.setAuth(session?.access_token || '')
  
  // Connect realtime with fresh bindings
  try {
    if (DEBUG) console.log('🔌 [SUPABASE] Connecting realtime with fresh bindings...')
    workingClient.realtime.connect()
    if (DEBUG) console.log('✅ [SUPABASE] resetRealtimeConnection: Complete')
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

export const fetchAllUsers = async (options?: { signal?: AbortSignal }) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient
    .from('users')
    .select(
      'id, username, display_name, avatar_url, color, status',
      options
    )
  if (error) {
    console.error('Error fetching users:', error)
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