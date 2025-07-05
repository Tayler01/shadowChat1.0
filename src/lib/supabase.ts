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
    }
    return response
  } catch (err) {
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
  
  }
  
  try {
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
  } catch {
    // Return a minimal client object to prevent null reference errors
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: uniqueStorageKey,
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }
}

// Main client with default storage key
export let supabase: ReturnType<typeof createClient>

declare global {
  // eslint-disable-next-line no-var
  var __supabaseClient: ReturnType<typeof createClient> | undefined
}

const globalRef = globalThis as typeof globalThis & {
  __supabaseClient?: ReturnType<typeof createClient>
}

if (!globalRef.__supabaseClient) {
  try {
    globalRef.__supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
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
  } catch {
    // Create a minimal fallback client
    globalRef.__supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  }
}

supabase = globalRef.__supabaseClient!

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
  
  if (!fallbackClient) {
    return
  }
  
  try {
    // Test that fallback client is actually working
    const isResponsive = await testClientResponsiveness(fallbackClient, 2000)
    
    if (!isResponsive) {
      return
    }
    
    
    // Destroy old main client
    await destroyClient(currentSupabaseClient)
    
    // Promote fallback to main
    currentSupabaseClient = fallbackClient
    fallbackClient = null
    setSupabaseClient(currentSupabaseClient)
    
    // Reset health check timer to force immediate use of new main client
    lastHealthCheck = 0
    
  } catch {
  }
}

// Test client responsiveness
const testClientResponsiveness = async (client: ReturnType<typeof createClient>, timeoutMs = 2000): Promise<boolean> => {
  if (!client) {
    return false
  }
  
  try {
    await Promise.race([
      client.from('users').select('id').limit(1),
      timeout(timeoutMs),
    ])
    return true
  } catch {
    }
    return false
  }
}

// Destroy stale client before creating new ones
const destroyClient = async (client: ReturnType<typeof createClient>) => {
  if (!client) return
  
  try {
    if (client.realtime && typeof client.realtime.disconnect === 'function') {
      await client.realtime.disconnect()
    }
  } catch (e) {
  }
}

// Recreate client using stored token (mimics page reload)
const recreateClientWithStoredToken = async (): Promise<ReturnType<typeof createClient>> => {
  
  // Destroy old fallback client if it exists
  if (fallbackClient) {
    await destroyClient(fallbackClient)
    fallbackClient = null
  }
  
  // Create new client with unique storage key
  const newClient = createFreshSupabaseClient()
  
  // Attempt to restore session from localStorage
  await restoreSessionIfNeeded(newClient)
  
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
          await destroyClient(fallbackClient)
          fallbackClient = null
        }
        return currentSupabaseClient
      }
      
      
      // Main client is stuck, create/use fallback
      if (!fallbackClient) {
        fallbackClient = await recreateClientWithStoredToken()
      }
      
      // Test fallback client
      const fallbackWorks = await testClientResponsiveness(fallbackClient, 2000)
      
      if (fallbackWorks) {
        return fallbackClient
      } else {
        await destroyClient(fallbackClient)
        fallbackClient = await recreateClientWithStoredToken()
        return fallbackClient
      }
      
    } catch {
      return currentSupabaseClient // fallback to main client
    }
  }
  
  // Return current working client (main or fallback)
  return fallbackClient || currentSupabaseClient
}

// Force client recreation (simulates page reload)
export const recreateSupabaseClient = async (): Promise<ReturnType<typeof createClient>> => {
  
  lastHealthCheck = 0 // Force health check on next call
  
  // Destroy old fallback client
  if (fallbackClient) {
    await destroyClient(fallbackClient)
  }
  
  // Create new fallback client
  fallbackClient = await recreateClientWithStoredToken()
  
  // Test the new client
  const isResponsive = await testClientResponsiveness(fallbackClient, 3000)
  
  }
  
  return fallbackClient
}

// Restore session from localStorage to a fresh client
export const restoreSessionIfNeeded = async (client: ReturnType<typeof createClient>): Promise<boolean> => {
  
  try {
    const raw = localStorage.getItem(localStorageKey)
    const stored = raw ? JSON.parse(raw) : null
    
    if (!stored?.currentSession?.refresh_token && !stored?.refresh_token) {
      return false
    }

    const refreshToken = stored.currentSession?.refresh_token || stored.refresh_token
    const accessToken = stored.currentSession?.access_token || stored.access_token || ''

    
    const { data, error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    if (error) {
      return false
    } else {
      // Update realtime auth token
      client.realtime.setAuth(data.session?.access_token || '')
      return true
    }
  } catch {
    return false
  }
}

// Force session restoration for diagnostics
export const forceSessionRestore = async (): Promise<boolean> => {
  
  try {
    const workingClient = await getWorkingClient()
    
    // First check if we already have a session
    const { data: { session }, error } = await workingClient.auth.getSession()
    if (!error && session) {
      return true
    }
    
    
    // Try to restore from localStorage
    const restored = await restoreSessionIfNeeded(workingClient)
    if (restored) {
      return true
    }
    
    // If restoration failed, try with a fresh client
    const freshClient = await recreateSupabaseClient()
    const restoredWithFresh = await restoreSessionIfNeeded(freshClient)
    
    
    return restoredWithFresh
  } catch {
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
    }

    }
    const refresh = workingClient.auth
      .refreshSession()
      .then((res) => {
        }
        if (res.data?.session) {
          workingClient.realtime.setAuth(res.data.session?.access_token || '')
          // Reconnect websocket in case it was closed on token expiry
          try {
            workingClient.realtime.connect()
          } catch (err) {
          }
        }
        return res
      })
      .catch((err) => {
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
  }
  return refreshSessionLocked()
}

export const resetRealtimeConnection = async () => {
  
  // Get current session before recreating client
  const currentClient = await getWorkingClient()
  if (!currentClient) {
    return
  }
  
  const { data: { session } } = await currentClient.auth.getSession()
  
  
  // Clean up existing channels on current client
  try {
    const channels = currentClient.getChannels?.() || []
    channels.forEach(ch => {
      try {
        if (currentClient.removeChannel && typeof currentClient.removeChannel === 'function') {
          currentClient.removeChannel(ch)
        }
      } catch (removeErr) {
      }
    })
  } catch (err) {
  }
  
  // Disconnect current realtime connection
  try {
    if (currentClient.realtime && typeof currentClient.realtime.disconnect === 'function') {
      currentClient.realtime.disconnect()
    }
  } catch (err) {
  }
  
  // Force recreation of client to get fresh bindings
  const freshClient = await recreateSupabaseClient()
  
  if (!freshClient) {
    return
  }
  
  // Promote the fresh client to main if it's working
  const isResponsive = await testClientResponsiveness(freshClient, 3000)
  
  if (isResponsive) {
    await promoteFallbackToMain()
  } else {
  }
  
  // Get the working client (either the promoted fresh one or current)
  const workingClient = await getWorkingClient()
  
  if (!workingClient) {
    return
  }
  
  // Set auth token on realtime
  if (workingClient.realtime && typeof workingClient.realtime.setAuth === 'function') {
    workingClient.realtime.setAuth(session?.access_token || '')
  }
  
  // Connect realtime with fresh bindings
  try {
    if (workingClient.realtime && typeof workingClient.realtime.connect === 'function') {
      workingClient.realtime.connect()
    }
  } catch (err) {
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
  try {
    const workingClient = await getWorkingClient()
    if (!workingClient) {
      return
    }
    
    const { error } = await workingClient.rpc('update_user_last_active')
  } catch {
  }
}

export const toggleReaction = async (messageId: string, emoji: string, isDM = false) => {
  const workingClient = await getWorkingClient()
  const { error } = await workingClient.rpc('toggle_message_reaction', {
    message_id: messageId,
    emoji: emoji,
    is_dm: isDM
  })
}

export const fetchDMConversations = async () => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('get_dm_conversations')
  if (error) {
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
    return null
  }
  return data
}

export const markDMMessagesRead = async (conversationId: string) => {
  const workingClient = await getWorkingClient()
  const { error } = await workingClient.rpc('mark_dm_messages_read', {
    conversation_id: conversationId
  })
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
      return false
    }

    if (!session) {
      return false
    }

    }
    
    // Check if session is expired or about to expire (within 5 minutes)
    const expiresAt = session.expires_at
    const now = Math.floor(Date.now() / 1000)
    const fiveMinutes = 5 * 60

    if (force || (expiresAt && (expiresAt - now) < fiveMinutes)) {
      }
      const { data: refreshData, error: refreshError } = await refreshSessionLocked()

      if (refreshError) {
        return false
      }

      if (!refreshData.session) {
        return false
      }

      }
    }
    
    return true
  } catch {
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
