import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

export interface AuthUser extends User {
  user_metadata: {
    username?: string
    display_name?: string
    avatar_url?: string
  }
}

export interface SignUpData {
  email: string
  password: string
  username: string
  displayName: string
}

export interface SignInData {
  email: string
  password: string
}

export const signUp = async ({ email, password, username, displayName }: SignUpData) => {
  // First check if username is taken
  const { data: existingUser } = await supabase
    .from('users')
    .select('username')
    .eq('username', username)
    .maybeSingle()

  if (existingUser) {
    throw new Error('Username is already taken')
  }

  // Create auth user
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        display_name: displayName,
      }
    }
  })

  if (error) throw error

  // Create profile in users table
  if (data.user) {
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: data.user.id,
        email: data.user.email!,
        username,
        display_name: displayName,
        status: 'online'
      })

    if (profileError) {
      console.error('Error creating user profile:', profileError)
      // Ignore duplicate key errors caused by race conditions with the
      // auth state change handler which may also insert the profile.
      if (profileError.code !== '23505') {
        throw profileError
      }
    }

    // If user is confirmed (auto-login), fetch and return the profile
    if (data.session) {
      const profile = await getUserProfile(data.user.id)
      return { user: data.user, profile, session: data.session }
    }

    // If email confirmation is required, return user data without profile
    return { user: data.user, profile: null, session: null }
  }

  return { user: null, profile: null, session: null }
}

export const signIn = async ({ email, password }: SignInData) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) throw error

  // Update user status to online
  if (data.user) {
    await supabase
      .from('users')
      .update({ status: 'online', last_active: new Date().toISOString() })
      .eq('id', data.user.id)
  }

  return data
}

export const signOut = async () => {
  console.log('🚪 [AUTH] signOut: Function started');
  
  const { data: { user } } = await supabase.auth.getUser()
  console.log('🚪 [AUTH] signOut: Current user retrieved:', {
    hasUser: !!user,
    userId: user?.id,
    email: user?.email
  });
  
  if (user) {
    console.log('🚪 [AUTH] signOut: Updating user status to offline');
    // Update status to offline before signing out
    const { error: updateError } = await supabase
      .from('users')
      .update({ status: 'offline' })
      .eq('id', user.id)
    
    if (updateError) {
      console.error('🚪 [AUTH] signOut: Error updating user status:', updateError);
    } else {
      console.log('🚪 [AUTH] signOut: User status updated to offline successfully');
    }
  } else {
    console.log('🚪 [AUTH] signOut: No user found, skipping status update');
  }

  console.log('🚪 [AUTH] signOut: Calling supabase.auth.signOut()');
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    console.error('🚪 [AUTH] signOut: Supabase signOut error:', error);
    throw error
  }
  
  console.log('🚪 [AUTH] signOut: Supabase signOut completed successfully');
  console.log('🚪 [AUTH] signOut: Function completed');
}

export const getCurrentUser = async () => {
  console.log('🔍 [getCurrentUser] Function started');

  try {
    console.log('🔍 [getCurrentUser] Getting user from auth');
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    console.log('🔍 [getCurrentUser] Auth user result:', {
      hasUser: !!user,
      userId: user?.id,
      hasAuthError: !!authError,
      authErrorMessage: authError?.message
    });
    
    // Handle the specific "user not found" error from invalid JWT
    if (authError && authError.message?.includes('User from sub claim in JWT does not exist')) {
      console.log('🔍 [getCurrentUser] Invalid JWT detected, signing out');
      await supabase.auth.signOut();
      return null;
    }
    
    if (authError) {
      console.error('Auth error in getCurrentUser:', authError);
      return null;
    }
    
    if (!user) {
      console.log('🔍 [getCurrentUser] No user found in auth');
      return null;
    }

    console.log('🔍 [getCurrentUser] Fetching user profile from database');
    
    // Add timeout and retry logic for the database query
    let profile = null;
    let error = null;
    
    try {
      const profileQuery = supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      
      // Add a timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout')), 10000)
      );
      
      const result = await Promise.race([profileQuery, timeoutPromise]) as any;
      profile = result.data;
      error = result.error;
      
      console.log('🔍 [getCurrentUser] Profile query result:', {
        hasProfile: !!profile,
        hasError: !!error,
        errorCode: error?.code,
        errorMessage: error?.message
      });
    } catch (fetchError) {
      console.error('🔍 [getCurrentUser] Database fetch error:', fetchError);
      
      // If it's a network error, return a minimal user object to prevent app crash
      if (fetchError instanceof Error && (
        fetchError.message.includes('Failed to fetch') ||
        fetchError.message.includes('Network') ||
        fetchError.message.includes('timeout')
      )) {
        console.warn('🔍 [getCurrentUser] Network error detected, returning minimal user object');
        return {
          id: user.id,
          email: user.email!,
          username: user.user_metadata?.username || user.email?.split('@')[0] || `user_${user.id.slice(0, 8)}`,
          display_name: user.user_metadata?.display_name || user.user_metadata?.full_name || 'User',
          status: 'online',
          color: '#3B82F6',
          status_message: '',
          last_active: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
      
      throw fetchError;
    }


    if (error && error.code === 'PGRST116') {
      // Profile doesn't exist, create it
      console.log('🔍 [getCurrentUser] Profile not found, creating new profile');
      
      const userData = {
        id: user.id,
        email: user.email!,
        username: user.user_metadata?.username || user.email?.split('@')[0] || `user_${user.id.slice(0, 8)}`,
        display_name: user.user_metadata?.display_name || user.user_metadata?.full_name || 'User',
        status: 'online'
      };
      
      console.log('🔍 [getCurrentUser] Inserting new user profile:', userData);
      
      try {
        const { error: insertError } = await supabase
          .from('users')
          .insert(userData)
        
        if (insertError) {
          console.error('🔍 [getCurrentUser] Error creating user profile:', insertError)
          // If user already exists (race condition), just fetch it
          if (insertError.code === '23505') {
            console.log('🔍 [getCurrentUser] Profile already exists, fetching existing profile');
            const { data: existingProfile, error: fetchError } = await supabase
              .from('users')
              .select('*')
              .eq('id', user.id)
              .single()
            
            if (fetchError) {
              console.error('🔍 [getCurrentUser] Error fetching existing profile:', fetchError);
              return null;
            }
            
            return existingProfile;
          } else {
            return null;
          }
        }
        
        console.log('🔍 [getCurrentUser] Profile created successfully, fetching new profile');
        
        // Fetch the newly created profile
        const { data: newProfile, error: fetchError } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single()
        
        if (fetchError) {
          console.error('🔍 [getCurrentUser] Error fetching newly created profile:', fetchError);
          return null
        }
        
        return newProfile
      } catch (insertError) {
        console.error('🔍 [getCurrentUser] Exception during profile creation:', insertError);
        
        // If there's a network error during profile creation, return minimal user object
        if (insertError instanceof Error && (
          insertError.message.includes('Failed to fetch') ||
          insertError.message.includes('Network') ||
          insertError.message.includes('timeout')
        )) {
          console.warn('🔍 [getCurrentUser] Network error during profile creation, returning minimal user object');
          return {
            id: user.id,
            email: user.email!,
            username: user.user_metadata?.username || user.email?.split('@')[0] || `user_${user.id.slice(0, 8)}`,
            display_name: user.user_metadata?.display_name || user.user_metadata?.full_name || 'User',
            status: 'online',
            color: '#3B82F6',
            status_message: '',
            last_active: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        }
        
        return null;
      }
      
      if (insertError) {
        console.error('Error creating user profile:', insertError)
        // If user already exists (race condition), just fetch it
        if (insertError.code === '23505') {
          const { data: existingProfile, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single()
          
          if (fetchError) {
            console.error('Error fetching existing profile:', fetchError);
            return null;
          }
          
          return existingProfile;
        } else {
          return null;
        }
      }
      
      
      // Fetch the newly created profile
      const { data: newProfile, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (fetchError) {
        console.error('Error fetching newly created profile:', fetchError);
        return null
      }
      
      return newProfile
    } else if (error) {
      console.error('🔍 [getCurrentUser] Unexpected error fetching profile:', error);
      
      // If it's a network error, return minimal user object
      if (error.message && (
        error.message.includes('Failed to fetch') ||
        error.message.includes('Network') ||
        error.message.includes('timeout')
      )) {
        console.warn('🔍 [getCurrentUser] Network error in profile fetch, returning minimal user object');
        return {
          id: user.id,
          email: user.email!,
          username: user.user_metadata?.username || user.email?.split('@')[0] || `user_${user.id.slice(0, 8)}`,
          display_name: user.user_metadata?.display_name || user.user_metadata?.full_name || 'User',
          status: 'online',
          color: '#3B82F6',
          status_message: '',
          last_active: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
      
      return null;
    }

    console.log('🔍 [getCurrentUser] Successfully fetched profile:', {
      userId: profile?.id,
      username: profile?.username,
      displayName: profile?.display_name
    });
    
    return profile
  } catch (error) {
    console.error('🔍 [getCurrentUser] Exception caught:', error);
    
    // If it's a network error, try to return a minimal user object if we have auth user
    if (error instanceof Error && (
      error.message.includes('Failed to fetch') ||
      error.message.includes('Network') ||
      error.message.includes('timeout')
    )) {
      console.warn('🔍 [getCurrentUser] Network error in main try/catch, attempting to get auth user');
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.warn('🔍 [getCurrentUser] Returning minimal user object due to network error');
          return {
            id: user.id,
            email: user.email!,
            username: user.user_metadata?.username || user.email?.split('@')[0] || `user_${user.id.slice(0, 8)}`,
            display_name: user.user_metadata?.display_name || user.user_metadata?.full_name || 'User',
            status: 'online',
            color: '#3B82F6',
            status_message: '',
            last_active: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        }
      } catch (authError) {
        console.error('🔍 [getCurrentUser] Failed to get auth user for fallback:', authError);
      }
    }
    
    return null;
  }
}

export const getUserProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export const updateUserProfile = async (updates: Partial<{
  display_name: string
  status_message: string
  color: string
  status: 'online' | 'away' | 'busy' | 'offline'
}>) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const data = await fetchUpdate(
    'users',
    updates,
    { id: user.id },
    { select: '*' }
  );

  return data
}