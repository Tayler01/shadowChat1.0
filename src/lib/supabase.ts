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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

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

// Database types matching the actual schema
export interface User {
  id: string
  email: string
  username: string
  display_name: string
  avatar_url?: string
  banner_url?: string
  status: 'online' | 'away' | 'busy' | 'offline'
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
  read_at?: string
  reactions: Record<string, { count: number; users: string[] }>
  edited_at?: string
  created_at: string
  sender?: User
}

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
  return (data ?? []) as DMConversation[]
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

// Helper function to ensure valid session before database operations
export const ensureSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()

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
    
    if (expiresAt && (expiresAt - now) < fiveMinutes) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()

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
