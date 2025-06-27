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

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    // Handle the specific "user not found" error from invalid JWT
    if (authError && authError.message?.includes('User from sub claim in JWT does not exist')) {
      await supabase.auth.signOut();
      return null;
    }
    
    if (authError) {
      console.error('Auth error in getCurrentUser:', authError);
      return null;
    }
    
    if (!user) return null

    
    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();


    if (error && error.code === 'PGRST116') {
      // Profile doesn't exist, create it
      console.error('Error fetching user profile:', error)
      
      const userData = {
        id: user.id,
        email: user.email!,
        username: user.user_metadata?.username || user.email?.split('@')[0] || `user_${user.id.slice(0, 8)}`,
        display_name: user.user_metadata?.display_name || user.user_metadata?.full_name || 'User',
        status: 'online'
      };
      
      
      const { error: insertError } = await supabase
        .from('users')
        .insert(userData)
      
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
      console.error('Unexpected error fetching profile:', error);
      return null;
    }

    return profile
  } catch (error) {
    console.error('Error in getCurrentUser:', error);
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

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single()

  if (error) throw error
  return data
}
