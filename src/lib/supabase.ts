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

// Community-validated workaround for broken session refresh cycle
export const forceSessionRefresh = async (): Promise<boolean> => {
  console.log('🔥 [NUCLEAR_REFRESH] Starting nuclear session refresh...');
  
  try {
    const stored = localStorage.getItem('sb-' + supabaseUrl.split('//')[1].split('.')[0] + '-auth-token');
    if (!stored) {
      console.warn('🔥 [NUCLEAR_REFRESH] ❌ No refresh token found in storage');
      return false;
    }

    const parsed = JSON.parse(stored);
    const refresh_token = parsed?.refresh_token;
    if (!refresh_token) {
      console.warn('🔥 [NUCLEAR_REFRESH] ❌ Could not parse refresh token');
      return false;
    }

    console.log('🔥 [NUCLEAR_REFRESH] Using refresh token to re-auth via setSession');

    // 🔥 NUCLEAR FIX: Use setSession with empty access_token to force re-auth
    const { data, error } = await supabase.auth.setSession({
      refresh_token,
      access_token: '', // forces Supabase to issue a new session
    });

    if (error || !data?.session) {
      console.error('🔥 [NUCLEAR_REFRESH] ❌ setSession failed:', error?.message);
      return false;
    }

    console.log('🔥 [NUCLEAR_REFRESH] ✅ Session forcibly refreshed via setSession()', {
      userId: data.session.user.id,
      expires: data.session.expires_at,
    });

    return true;
  } catch (e) {
    console.error('🔥 [NUCLEAR_REFRESH] ❌ Exception during forced session re-auth', e);
    return false;
  }
};

// Legacy function kept for compatibility - now uses nuclear refresh
export const legacyForceSessionRefresh = async (): Promise<boolean> => {
  console.log('🔄 [LEGACY_REFRESH] Starting legacy session refresh...');
    
  try {
    // Get refresh token from localStorage
    const authData = localStorage.getItem('sb-' + supabaseUrl.split('//')[1].split('.')[0] + '-auth-token');
    let refresh_token = null;
    
    if (authData) {
      try {
        const parsed = JSON.parse(authData);
        refresh_token = parsed?.refresh_token;
        console.log('🔄 [LEGACY_REFRESH] Found refresh token in localStorage:', {
          hasToken: !!refresh_token,
          tokenLength: refresh_token?.length || 0
        });
      } catch (parseError) {
        console.error('🔄 [LEGACY_REFRESH] Failed to parse auth data from localStorage:', parseError);
      }
    }
    
    // Fallback: try the old format
    if (!refresh_token) {
      const oldAuthData = localStorage.getItem('supabase.auth.token');
      if (oldAuthData) {
        try {
          const parsed = JSON.parse(oldAuthData);
          refresh_token = parsed?.refresh_token;
          console.log('🔄 [LEGACY_REFRESH] Found refresh token in old localStorage format:', {
            hasToken: !!refresh_token,
            tokenLength: refresh_token?.length || 0
          });
        } catch (parseError) {
          console.error('🔄 [LEGACY_REFRESH] Failed to parse old auth data from localStorage:', parseError);
        }
      }
    }

    if (!refresh_token) {
      console.warn('🔄 [LEGACY_REFRESH] ❌ No refresh token found in localStorage');
      return false;
    }

    console.log('🔄 [LEGACY_REFRESH] Calling supabase.auth.refreshSession with stored token...');
    const { data, error } = await supabase.auth.refreshSession({ refresh_token });

    if (error) {
      console.error('🔄 [LEGACY_REFRESH] ❌ refreshSession failed:', error.message);
      return false;
    }

    if (!data.session) {
      console.warn('🔄 [LEGACY_REFRESH] ❌ No session returned from refresh');
      return false;
    }

    // 🔥 CRITICAL: Force Supabase to use the new tokens by calling setSession
    console.log('🔄 [LEGACY_REFRESH] Injecting new session tokens via setSession...');
    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    if (setSessionError) {
      console.error('🔄 [LEGACY_REFRESH] ❌ setSession failed:', setSessionError.message);
      return false;
    }

    console.log('🔄 [LEGACY_REFRESH] ✅ Session manually injected via setSession');

    console.log('🔄 [LEGACY_REFRESH] ✅ Session manually refreshed successfully:', {
      userId: data.session.user?.id,
      expiresAt: data.session.expires_at,
      hasAccessToken: !!data.session.access_token,
      hasRefreshToken: !!data.session.refresh_token,
      sessionInjected: !setSessionError
    });
    
    return true;
  } catch (error) {
    console.error('🔄 [LEGACY_REFRESH] ❌ Exception during forced refresh:', error);
    return false;
  }
};

// Helper function to ensure valid session before database operations
export const ensureSession = async () => {
  console.log('ensureSession: Starting...');
  try {
    console.log('ensureSession: Calling supabase.auth.getSession()...');
    
    // Add timeout to getSession call to detect if it's hanging (increased to 30 seconds)
    const getSessionPromise = supabase.auth.getSession();
    
    // Log the promise state and properties
    console.log('ensureSession: getSessionPromise created', {
      promiseType: typeof getSessionPromise,
      isPromise: getSessionPromise instanceof Promise,
      promiseState: getSessionPromise.constructor.name,
      timestamp: new Date().toISOString()
    });
    
    // Add a promise inspector to see if it resolves/rejects
    getSessionPromise
      .then((result) => {
        console.log('ensureSession: getSessionPromise resolved successfully', {
          hasData: !!result?.data,
          hasSession: !!result?.data?.session,
          hasError: !!result?.error,
          timestamp: new Date().toISOString()
        });
      })
      .catch((error) => {
        console.log('ensureSession: getSessionPromise rejected', {
          error: error?.message || 'Unknown error',
          timestamp: new Date().toISOString()
        });
      });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => {
        console.log('ensureSession: Timeout triggered - getSession took longer than 10 seconds, trying forceSessionRefresh');
        reject(new Error('getSession timeout after 10 seconds'));
      }, 10000)
    );
    
    console.log('ensureSession: Starting Promise.race between getSession and 10-second timeout...');
    
    let session, error;
    try {
      const result = await Promise.race([getSessionPromise, timeoutPromise]) as any;
      session = result.data?.session;
      error = result.error;
      
      console.log('ensureSession: Promise.race completed - getSession returned successfully', {
        hasSession: !!session,
        hasError: !!error,
        sessionUserId: session?.user?.id,
        sessionExpiresAt: session?.expires_at,
        errorMessage: error?.message,
        timestamp: new Date().toISOString()
      });
    } catch (timeoutError) {
      console.log('ensureSession: getSession timed out, attempting forceSessionRefresh...');
      
      const refreshSuccess = await forceSessionRefresh();
      if (!refreshSuccess) {
        console.error('ensureSession: forceSessionRefresh failed');
        return false;
      }
      
      // Try getSession again after forced refresh
      console.log('ensureSession: Retrying getSession after forced refresh...');
      const retryResult = await supabase.auth.getSession();
      session = retryResult.data?.session;
      error = retryResult.error;
      
      console.log('ensureSession: Retry getSession result:', {
        hasSession: !!session,
        hasError: !!error,
        sessionUserId: session?.user?.id,
        sessionExpiresAt: session?.expires_at
      });
    }

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
      
      const refreshSuccess = await forceSessionRefresh();
      if (!refreshSuccess) {
        console.error('ensureSession: forceSessionRefresh failed during expiry refresh')
        return false
      }
      
      console.log('ensureSession: Session refreshed successfully using forceSessionRefresh');
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
