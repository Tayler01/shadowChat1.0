import { createClient } from '@supabase/supabase-js'
import {
  VITE_SUPABASE_ANON_KEY,
  VITE_SUPABASE_URL,
} from './env'

type AnySupabaseClient = any
type SessionResponse = {
  data: { session: any }
  error: any
}
type RefreshSessionResponse = {
  data: { session: any }
  error: any
}

const loggingFetch: typeof fetch = async (input, init) => {
  return fetch(input, init)
}

const shouldUseRealtimeWorker =
  typeof window !== 'undefined' && typeof Worker !== 'undefined'

export const SUPABASE_URL = VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = VITE_SUPABASE_ANON_KEY

const supabaseUrl = SUPABASE_URL
const supabaseAnonKey = SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Extract project ref for storage key
const projectRefMatch = supabaseUrl.match(/https?:\/\/(.*?)\./)
const projectRef = projectRefMatch ? projectRefMatch[1] : ''
export const localStorageKey = `sb-${projectRef}-auth-token`

// Remove stale auth keys left over from previous fresh clients
export const purgeOldAuthKeys = (activeKey?: string) => {
  if (typeof localStorage === 'undefined') return
  const prefix = `sb-${projectRef}-auth-token-fresh-`
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix) && key !== activeKey) {
      toRemove.push(key)
    }
  }
  toRemove.forEach(k => {
    try {
      localStorage.removeItem(k)
    } catch {
      // ignore
    }
  })
}

const attachRealtimeHeartbeat = (client: AnySupabaseClient) => {
  try {
    client.realtime.onHeartbeat?.((status: string) => {
      if (
        (status === 'disconnected' || status === 'timeout') &&
        (typeof navigator === 'undefined' || navigator.onLine)
      ) {
        client.realtime.connect?.()
      }
    })
  } catch {
    // ignore heartbeat hook failures on unsupported runtimes
  }
}

// Create fresh client with unique storage key to avoid conflicts
export function createFreshSupabaseClient() {
  const uniqueStorageKey = `sb-${projectRef}-auth-token-fresh-${
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  }`
  purgeOldAuthKeys(uniqueStorageKey)
  
  try {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: uniqueStorageKey, // unique per instance
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        worker: shouldUseRealtimeWorker,
        params: {
          eventsPerSecond: 50,
        },
      },
      global: {
        fetch: loggingFetch,
      },
    })
    attachRealtimeHeartbeat(client)
    ;(client as any).__storageKey = uniqueStorageKey
    return client
  } catch {
    // Return a minimal client object to prevent null reference errors
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: uniqueStorageKey,
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        worker: shouldUseRealtimeWorker,
      },
    })
    attachRealtimeHeartbeat(client)
    ;(client as any).__storageKey = uniqueStorageKey
    return client
  }
}

// Main client with default storage key
export let supabase: AnySupabaseClient

declare global {
  // eslint-disable-next-line no-var
  var __supabaseClient: AnySupabaseClient | undefined
}

const globalRef = globalThis as typeof globalThis & {
  __supabaseClient?: AnySupabaseClient
}

if (!globalRef.__supabaseClient) {
  try {
    globalRef.__supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        worker: shouldUseRealtimeWorker,
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
    attachRealtimeHeartbeat(globalRef.__supabaseClient)
  } catch {
    // Create a minimal fallback client
    globalRef.__supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      realtime: {
        worker: shouldUseRealtimeWorker,
      },
    })
    attachRealtimeHeartbeat(globalRef.__supabaseClient)
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
  } catch {
    return null
  }
}

// Client management
let currentSupabaseClient = supabase
export const setSupabaseClient = (client: AnySupabaseClient) => {
  supabase = client
  currentSupabaseClient = client
}
let fallbackClient: AnySupabaseClient | null = null

export const getRealtimeClient = (): AnySupabaseClient | null => {
  return (
    currentSupabaseClient ||
    fallbackClient ||
    globalRef.__supabaseClient ||
    supabase ||
    null
  )
}

// Timeout helper
const timeout = (ms: number) => new Promise((_, reject) => 
  setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
)

const SESSION_LOOKUP_TIMEOUT_MS = 4000
const SESSION_REFRESH_TIMEOUT_MS = 10000
const SESSION_SET_TIMEOUT_MS = 5000

export const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]) as Promise<T>
}

export const getSessionWithTimeout = async (
  client?: AnySupabaseClient,
  timeoutMs = SESSION_LOOKUP_TIMEOUT_MS
): Promise<SessionResponse> => {
  const targetClient = client ?? (await getWorkingClient())
  return withTimeout(
    targetClient.auth.getSession(),
    timeoutMs,
    `Session lookup timeout after ${timeoutMs}ms`
  ) as Promise<SessionResponse>
}

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
    purgeOldAuthKeys((currentSupabaseClient as any).__storageKey)
  } catch {
  }
}

// Test client responsiveness
const testClientResponsiveness = async (client: AnySupabaseClient, timeoutMs = 2000): Promise<boolean> => {
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
    return false
  }
}

// Destroy stale client before creating new ones
const destroyClient = async (client: AnySupabaseClient | null) => {
  if (!client) return
  
  try {
    if (client.realtime && typeof client.realtime.disconnect === 'function') {
      await client.realtime.disconnect()
    }
  } catch (e) {
  }
}

// Recreate client using stored token (mimics page reload)
const recreateClientWithStoredToken = async (): Promise<AnySupabaseClient> => {
  
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
export const getWorkingClient = async (): Promise<AnySupabaseClient> => {
  const client =
    currentSupabaseClient ||
    fallbackClient ||
    globalRef.__supabaseClient ||
    supabase

  if (!client) {
    throw new Error('No Supabase client available')
  }

  return client
}

// Force client recreation (simulates page reload)
export const recreateSupabaseClient = async (): Promise<AnySupabaseClient> => {
  const client = await getWorkingClient()

  try {
    const channels = client.getChannels?.() || []
    channels.forEach((channel: any) => {
      try {
        client.removeChannel?.(channel)
      } catch {
        // ignore cleanup failures
      }
    })
  } catch {
    // ignore channel lookup failures
  }

  try {
    client.realtime?.disconnect?.()
  } catch {
    // ignore disconnect failures
  }

  const restored = await restoreSessionIfNeeded(client)
  if (!restored) {
    const storedToken = getStoredRefreshToken()
    if (storedToken) {
      try {
        const refreshResult = (await withTimeout(
          client.auth.refreshSession(),
          SESSION_REFRESH_TIMEOUT_MS,
          `Session refresh timeout after ${SESSION_REFRESH_TIMEOUT_MS}ms`
        )) as RefreshSessionResponse
        client.realtime?.setAuth?.(refreshResult.data?.session?.access_token || '')
      } catch {
        // ignore refresh failures during client recreation
      }
    }
  }

  try {
    client.realtime?.connect?.()
  } catch {
    // ignore reconnect failures
  }

  return client
}

// Restore session from localStorage to a fresh client
export const restoreSessionIfNeeded = async (client: AnySupabaseClient): Promise<boolean> => {
  
  try {
    const raw = localStorage.getItem(localStorageKey)
    const stored = raw ? JSON.parse(raw) : null
    
    if (!stored?.currentSession?.refresh_token && !stored?.refresh_token) {
      return false
    }

    const refreshToken = stored.currentSession?.refresh_token || stored.refresh_token
    const accessToken = stored.currentSession?.access_token || stored.access_token || ''

    
    const { data, error } = (await withTimeout(
      client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
      SESSION_SET_TIMEOUT_MS,
      `Session set timeout after ${SESSION_SET_TIMEOUT_MS}ms`
    )) as RefreshSessionResponse

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
    const { data: { session }, error } = await getSessionWithTimeout(workingClient)
    if (!error && session) {
      return true
    }
    
    // Try to restore from localStorage
    const restored = await restoreSessionIfNeeded(workingClient)
    if (restored) {
      return true
    }

    return false
  } catch {
    return false
  }
}
// --- Refresh session locking -------------------------------------------------
// Prevent multiple concurrent refreshSession calls from triggering duplicate
// network requests. Any callers will await the same promise while a refresh is
// in flight.
let refreshSessionPromise: Promise<{ data: any; error: any }> | null = null
let resumeRecoveryPromise: Promise<boolean> | null = null

export const clearRefreshSessionPromise = () => {
  refreshSessionPromise = null
}

export const recoverSessionAfterResume = async (): Promise<boolean> => {
  if (resumeRecoveryPromise) {
    return resumeRecoveryPromise
  }

  resumeRecoveryPromise = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false
    }

    const storedToken = getStoredRefreshToken()

    const applyRecoveredSession = async (client: AnySupabaseClient, accessToken?: string | null) => {
      try {
        client.realtime.setAuth(accessToken || '')
      } catch {
        // ignore auth propagation failures
      }
      try {
        client.realtime.connect?.()
      } catch {
        // ignore reconnect failures
      }
      return true
    }

    const attemptRecovery = async (client: AnySupabaseClient) => {
      if (storedToken) {
        try {
          const refreshResult = (await withTimeout(
            client.auth.refreshSession(),
            SESSION_REFRESH_TIMEOUT_MS,
            `Session refresh timeout after ${SESSION_REFRESH_TIMEOUT_MS}ms`
          )) as RefreshSessionResponse

          if (refreshResult.data?.session) {
            return applyRecoveredSession(client, refreshResult.data.session.access_token)
          }
        } catch {
          // ignore refresh failures and fall through to local restore
        }
      }

      const restored = await restoreSessionIfNeeded(client)
      if (restored) {
        try {
          const { data: { session } } = await getSessionWithTimeout(client)
          return applyRecoveredSession(client, session?.access_token)
        } catch {
          return applyRecoveredSession(client)
        }
      }

      return false
    }

    try {
      const currentClient = await getWorkingClient()
      if (await attemptRecovery(currentClient)) {
        return true
      }
    } catch {
      // ignore and try a client recreation below
    }

    try {
      await recreateSupabaseClient()
      const refreshedClient = await getWorkingClient()
      return attemptRecovery(refreshedClient)
    } catch {
      return false
    }
  })().finally(() => {
    resumeRecoveryPromise = null
  })

  return resumeRecoveryPromise
}

export const refreshSessionLocked = async () => {
  if (!refreshSessionPromise) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return Promise.reject(new Error('Offline: cannot refresh session'))
    }

    let workingClient = await getWorkingClient()
    let session: any = null
    let error: any = null

    try {
      const sessionResult = await getSessionWithTimeout(workingClient)
      session = sessionResult.data.session
      error = sessionResult.error
    } catch (sessionError) {
      const recovered = await recoverSessionAfterResume()
      if (!recovered) {
        return Promise.reject(sessionError)
      }

      workingClient = await getWorkingClient()
      const sessionResult = await getSessionWithTimeout(workingClient)
      session = sessionResult.data.session
      error = sessionResult.error
    }

    const storedToken = getStoredRefreshToken()
    
    if (!session && !storedToken) {
      return Promise.reject(new Error('No session to refresh'))
    }

    const refresh = workingClient.auth
      .refreshSession()
      .then((res: any) => {
        if (!res.data?.session) {
          throw new Error('Failed to refresh session')
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
      .catch((err: any) => {
        throw err
      })
    refreshSessionPromise = (withTimeout(
      refresh,
      SESSION_REFRESH_TIMEOUT_MS,
      `Session refresh timeout after ${SESSION_REFRESH_TIMEOUT_MS}ms`
    ) as Promise<{
      data: any
      error: any
    }>)
      .then((res) => {
        clearRefreshSessionPromise()
        return res
      })
      .finally(() => {
        refreshSessionPromise = null
      })
  }
  return refreshSessionPromise
}

export const forceRefreshSession = async () => {
  clearRefreshSessionPromise()
  return refreshSessionLocked()
}

export const resetRealtimeConnection = async () => {
  
  // Get current session before recreating client
  const currentClient = await getWorkingClient()
  if (!currentClient) {
    return
  }
  
  const { data: { session } } = await getSessionWithTimeout(currentClient)
  
  // Clean up existing channels on current client
  try {
    const channels = currentClient.getChannels?.() || []
    channels.forEach((ch: any) => {
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
  
  // Reuse the existing client instead of creating another auth instance
  await recreateSupabaseClient()
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

export const uploadVoiceMessage = async (blob: Blob, mimeType = 'audio/webm') => {
  const workingClient = await getWorkingClient()
  const { data: { user } } = await workingClient.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const ext = mimeType.split('/')[1]?.split(';')[0] || 'webm'
  const filePath = `${user.id}/${Date.now()}.${ext}`
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
  message_type: 'text' | 'command' | 'audio' | 'image' | 'file'
  audio_url?: string
  audio_duration?: number
  file_url?: string
  reactions: Record<string, { count: number; users: string[] }>
  pinned: boolean
  pinned_by?: string | null
  pinned_at?: string | null
  edited_at?: string
  reply_to?: string
  created_at: string
  updated_at: string
  user?: User
}

export type NewsPlatform = 'x' | 'truth'

export type NewsReactionSummary = Record<string, { count: number; users: string[] }>

export interface NewsSource {
  id: string
  platform: NewsPlatform
  handle: string
  normalized_handle?: string
  display_name?: string | null
  profile_url?: string | null
  external_account_id?: string | null
  enabled: boolean
  scrape_interval_seconds: number
  last_seen_external_id?: string | null
  last_seen_at?: string | null
  last_checked_at?: string | null
  last_success_at?: string | null
  health_status: 'pending' | 'ok' | 'degraded' | 'blocked' | 'error'
  last_error?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface NewsFeedMedia {
  type?: 'image' | 'video' | 'link'
  url: string
  thumbnail_url?: string
  alt?: string
}

export interface NewsFeedItem {
  id: string
  source_id?: string | null
  platform: NewsPlatform
  external_id: string
  post_kind: 'post' | 'reply' | 'repost' | 'quote' | 'retruth' | 'unknown'
  author_handle: string
  author_display_name?: string | null
  author_avatar_url?: string | null
  headline: string
  body_text: string
  source_url: string
  canonical_url?: string | null
  media: NewsFeedMedia[]
  metrics: Record<string, unknown>
  raw: Record<string, unknown>
  reactions: NewsReactionSummary
  posted_at?: string | null
  detected_at: string
  visible_day: string
  hidden: boolean
  hidden_by?: string | null
  hidden_at?: string | null
  created_at: string
  updated_at: string
  source?: NewsSource | null
}

export interface NewsChatMessage {
  id: string
  user_id: string
  content: string
  edited_at?: string | null
  reactions: NewsReactionSummary
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
  message_type: 'text' | 'command' | 'audio' | 'image' | 'file'
  audio_url?: string
  audio_duration?: number
  file_url?: string
  read_at?: string
  read_by?: string[]
  reactions: Record<string, { count: number; users: string[] }>
  edited_at?: string
  created_at: string
  updated_at: string
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
        (usersData ?? []).map((u: any) => [u.id, u as User])
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

  if (error) {
    throw error
  }
}

export const searchUsers = async (
  term: string,
  options?: { signal?: AbortSignal }
) => {
  const workingClient = await getWorkingClient()
  let query = workingClient.rpc('search_users', { term })
  if (options?.signal && typeof query.abortSignal === 'function') {
    query = query.abortSignal(options.signal)
  }
  const { data, error } = await query
  if (error) {
    return [] as BasicUser[]
  }
  return (data ?? []) as BasicUser[]
}

export const fetchAllUsers = async (options?: { signal?: AbortSignal }) => {
  const workingClient = await getWorkingClient()
  let query = workingClient
    .from('users')
    .select('id, username, display_name, avatar_url, color, status')
  if (options?.signal && typeof query.abortSignal === 'function') {
    query = query.abortSignal(options.signal)
  }
  const { data, error } = await query
  if (error) {
    return [] as BasicUser[]
  }
  return (data ?? []) as BasicUser[]
}

// Helper function to ensure valid session before database operations
export const ensureSession = async (force = false) => {
  try {
    let workingClient = await getWorkingClient()
    let session: any = null
    let error: any = null

    try {
      const sessionResult = await getSessionWithTimeout(workingClient)
      session = sessionResult.data.session
      error = sessionResult.error
    } catch {
      const recovered = await recoverSessionAfterResume()
      if (!recovered) {
        return false
      }
      workingClient = await getWorkingClient()
      const sessionResult = await getSessionWithTimeout(workingClient)
      session = sessionResult.data.session
      error = sessionResult.error
    }

    if (error) {
      return false
    }

    if (!session) {
      const recovered = await recoverSessionAfterResume()
      if (!recovered) {
        return false
      }
      const recoveredClient = await getWorkingClient()
      const recoveredSessionResult = await getSessionWithTimeout(recoveredClient)
      session = recoveredSessionResult.data.session
      if (!session) {
        return false
      }
    }
    
    // Check if session is expired or about to expire (within 5 minutes)
    const expiresAt = session.expires_at
    const now = Math.floor(Date.now() / 1000)
    const fiveMinutes = 5 * 60

    if (force || (expiresAt && (expiresAt - now) < fiveMinutes)) {
      const { data: refreshData, error: refreshError } = await refreshSessionLocked()

      if (refreshError) {
        return false
      }

      if (!refreshData.session) {
        return false
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

  const [messagesRes, reactionsGivenRes, channelReactionsRes, dmReactionsRes, friendsRes] = await Promise.all([
    workingClient
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    workingClient.rpc('count_user_reactions', { target_user_id: userId }),
    workingClient.rpc('count_reactions_to_user_messages_v2', { target_user_id: userId }),
    workingClient.rpc('count_reactions_to_user_dm_messages_v2', { target_user_id: userId }),
    workingClient
      .from('dm_conversations')
      .select('id', { count: 'exact', head: true })
      .contains('participants', [userId]),
  ])

  return {
    messages: messagesRes.count || 0,
    reactions:
      (reactionsGivenRes.data as number || 0) +
      (channelReactionsRes.data as number || 0) +
      (dmReactionsRes.data as number || 0),
    friends: friendsRes.count || 0,
  }
}
