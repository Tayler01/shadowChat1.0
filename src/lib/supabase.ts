import { createClient } from '@supabase/supabase-js'

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

  console.log('📡 [Supabase] Request:', { url, method, headers, body })

  try {
    const response = await fetch(input, init)
    const clone = response.clone()
    let responseBody: string | undefined
    try {
      responseBody = await clone.text()
    } catch {
      responseBody = '<unreadable>'
    }
    console.log('📡 [Supabase] Response:', {
      url,
      status: response.status,
      body: responseBody,
    })
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
  console.log('ensureSession: Starting...');
  try {
    console.log('ensureSession: Calling supabase.auth.getSession()...');
    
    // Add timeout to getSession call to detect if it's hanging
    const getSessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('getSession timeout after 10 seconds')), 10000)
    );
    
    const { data: { session }, error } = await Promise.race([getSessionPromise, timeoutPromise]) as any;
    console.log('ensureSession: supabase.auth.getSession() returned.');

    if (error) {
      console.error('ensureSession: Error getting session:', error)
      return false
    }

    if (!session) {
      console.warn('ensureSession: No active session found')
      return false
    }

    console.log('ensureSession: current session details', {
      userId: session.user?.id,
      expiresAt: session.expires_at,
      currentTime: Math.floor(Date.now() / 1000),
    })
    
    // Check if session is expired or about to expire (within 5 minutes)
    const expiresAt = session.expires_at
    const now = Math.floor(Date.now() / 1000)
    const fiveMinutes = 5 * 60
    
    console.log('ensureSession: Session expiry check', {
      expiresAt,
      now,
      timeUntilExpiry: expiresAt ? (expiresAt - now) : 'unknown',
      needsRefresh: expiresAt && (expiresAt - now) < fiveMinutes
    });
    
    if (expiresAt && (expiresAt - now) < fiveMinutes) {
      console.log('ensureSession: Session is about to expire, refreshing...');
      
      // Also add timeout to refreshSession call
      const refreshSessionPromise = supabase.auth.refreshSession();
      const refreshTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('refreshSession timeout after 10 seconds')), 10000)
      );
      
      const { data: refreshData, error: refreshError } = await Promise.race([refreshSessionPromise, refreshTimeoutPromise]) as any;
      console.log('ensureSession: supabase.auth.refreshSession() returned.');

      if (refreshError) {
        console.error('ensureSession: Error refreshing session:', refreshError)
        return false
      }

      if (!refreshData.session) {
        console.warn('ensureSession: Failed to refresh session')
        return false
      }

      console.log('ensureSession: session refreshed successfully', {
        userId: refreshData.session.user?.id,
        expiresAt: refreshData.session.expires_at,
      })
    } else {
      console.log('ensureSession: Session is still valid, no refresh needed');
    }
    
    console.log('ensureSession: Session validation complete - returning true');
    return true
  } catch (error) {
    console.error('ensureSession: Exception caught:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error
    });
    return false
  }
}
