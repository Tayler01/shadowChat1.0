import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('🔧 [Supabase Config]', {
  url: supabaseUrl,
  hasAnonKey: !!supabaseAnonKey,
  anonKeyLength: supabaseAnonKey?.length || 0
})

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables:', {
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey ? '[REDACTED]' : 'undefined'
  })
  throw new Error(`Missing Supabase environment variables. URL: ${supabaseUrl}, Key: ${supabaseAnonKey ? 'present' : 'missing'}`)
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
      if (error?.message === 'Auth session missing!' || error?.message?.includes('Auth session missing')) {
        console.warn('🔥 [NUCLEAR_REFRESH] ⚠️ setSession failed - Auth session missing (expected, will sign out):', error?.message);
      } else {
        console.error('🔥 [NUCLEAR_REFRESH] ❌ setSession failed:', error?.message);
      }
      
      // If the session is missing on the server, clear local storage and sign out
      if (error?.message === 'Auth session missing!' || error?.message?.includes('Auth session missing')) {
        console.log('🔥 [NUCLEAR_REFRESH] Session missing on server, clearing local auth state...');
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error('🔥 [NUCLEAR_REFRESH] Error during signOut:', signOutError);
          // Clear localStorage manually if signOut fails
          const authKey = 'sb-' + supabaseUrl.split('//')[1].split('.')[0] + '-auth-token';
          localStorage.removeItem(authKey);
          localStorage.removeItem('supabase.auth.token'); // Legacy key
        }
      }
      
      return false;
    }

    console.log('🔥 [NUCLEAR_REFRESH] ✅ Session forcibly refreshed via setSession()', {
      userId: data.session.user.id,
      expires: data.session.expires_at,
    });

    return true;
  } catch (e) {
    if (e instanceof Error && (e.message === 'Auth session missing!' || e.message?.includes('Auth session missing'))) {
      console.warn('🔥 [NUCLEAR_REFRESH] ⚠️ Exception during forced session re-auth - Auth session missing (expected, will sign out)', e);
    } else {
      console.error('🔥 [NUCLEAR_REFRESH] ❌ Exception during forced session re-auth', e);
    }
    
    // If we get an auth session missing error in the exception, handle it
    if (e instanceof Error && (e.message === 'Auth session missing!' || e.message?.includes('Auth session missing'))) {
      console.log('🔥 [NUCLEAR_REFRESH] Auth session missing in exception, clearing local auth state...');
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.error('🔥 [NUCLEAR_REFRESH] Error during signOut in exception handler:', signOutError);
        // Clear localStorage manually if signOut fails
        const authKey = 'sb-' + supabaseUrl.split('//')[1].split('.')[0] + '-auth-token';
        localStorage.removeItem(authKey);
        localStorage.removeItem('supabase.auth.token'); // Legacy key
      }
    }
    
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

// Helper function to check if session is usable without calling getSession()
async function isSessionUsable(): Promise<boolean> {
  try {
    const stored = localStorage.getItem('sb-' + supabaseUrl.split('//')[1].split('.')[0] + '-auth-token');
    if (!stored) return false;

    const parsed = JSON.parse(stored);
    const access_token = parsed?.access_token;
    const refresh_token = parsed?.refresh_token;
    const expires_at = parsed?.expires_at;

    const now = Math.floor(Date.now() / 1000);

    if (!access_token || !expires_at) return false;

    if (now > expires_at - 30) {
      console.warn('⚠️ Token expired or near expiry');
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

// Helper function to ensure valid session before database operations
export const ensureSession = async () => {
  console.log('🔒 [ENSURE_SESSION] Starting session validation...');
  
  try {
    // Step 1: Check if session is usable without calling getSession()
    console.log('🔒 [ENSURE_SESSION] Checking session usability from localStorage...');
    const usable = await isSessionUsable();
    
    if (!usable) {
      console.warn('🔒 [ENSURE_SESSION] ⚠️ Session not usable, triggering nuclear refresh');
      // 🧼 Use the cleaner refreshSession() approach instead of manual setSession
      const refreshSuccess = await forceSessionRefresh();
      
      if (!refreshSuccess) {
        console.error('🔒 [ENSURE_SESSION] ❌ Clean refresh failed (page should reload)');
        return false;
      }
      
      console.log('🔒 [ENSURE_SESSION] ✅ Nuclear refresh completed successfully');
      
      // Verify the refresh worked by checking localStorage again
      const usableAfterRefresh = await isSessionUsable();
      if (!usableAfterRefresh) {
        console.error('🔒 [ENSURE_SESSION] ❌ Session still not usable after refresh');
        return false;
      }
      
      console.log('🔒 [ENSURE_SESSION] ✅ Session confirmed usable after refresh');
    } else {
      console.log('🔒 [ENSURE_SESSION] ✅ Session is already usable, no refresh needed');
    }

    console.log('🔒 [ENSURE_SESSION] ✅ Session validation complete - returning true');
    return true;
  } catch (error) {
    console.error('🔒 [ENSURE_SESSION] ❌ Exception caught:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error
    });
    return false;
  }