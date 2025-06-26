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
        email: data.user.email,
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
      console.log('✅ User auto-confirmed, fetching profile...')
      const profile = await getUserProfile(data.user.id)
      return { user: data.user, profile, session: data.session }
    }
    
    // If email confirmation is required, return user data without profile
    console.log('📧 Email confirmation required')
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
  const { data: { user } } = await supabase.auth.getUser()
  
  if (user) {
    // Update status to offline before signing out
    await supabase
      .from('users')
      .update({ status: 'offline' })
      .eq('id', user.id)
  }

  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const getCurrentUser = async () => {
  console.log('🔍 getCurrentUser called');
  
  // Add timeout to prevent hanging - increased to 30 seconds for better diagnostics
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('getCurrentUser timeout after 30s')), 30000);
  });
  
  const getUserPromise = async () => {
    try {
      console.log('🔐 Checking auth user...');
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      // Handle the specific "user not found" error from invalid JWT
      if (authError && authError.message?.includes('User from sub claim in JWT does not exist')) {
        console.log('🧹 Invalid JWT detected in getCurrentUser, clearing session...');
        await supabase.auth.signOut();
        return null;
      }
      
      if (authError) {
        console.error('Auth error in getCurrentUser:', authError);
        return null;
      }
      
      console.log('👤 Auth user:', user ? `User ID: ${user.id}` : 'No auth user');
      if (!user) return null

      console.log('📋 Fetching user profile from database...');
      
      // Add a separate timeout for the database query
      const profilePromise = supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
        
      const profileTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Profile query timeout')), 15000);
      });
      
      const { data: profile, error } = await Promise.race([profilePromise, profileTimeout]);

      console.log('📝 Profile query result:', { profile: !!profile, error: error?.code });

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist, create it
        console.error('Error fetching user profile:', error)
        console.log('Creating missing user profile...')
        
        const userData = {
          id: user.id,
          email: user.email!,
          username: user.user_metadata?.username || user.email?.split('@')[0] || `user_${user.id.slice(0, 8)}`,
          display_name: user.user_metadata?.display_name || user.user_metadata?.full_name || 'User',
          status: 'online'
        };
        
        console.log('📝 Creating profile with data:', userData);
        
        const { error: insertError } = await supabase
          .from('users')
          .insert(userData)
        
        if (insertError) {
          console.error('Error creating user profile:', insertError)
          // If user already exists (race condition), just fetch it
          if (insertError.code === '23505') {
            console.log('Profile already exists (race condition), fetching existing profile...');
            const { data: existingProfile, error: fetchError } = await supabase
              .from('users')
              .select('*')
              .eq('id', user.id)
              .single()
            
            if (fetchError) {
              console.error('Error fetching existing profile:', fetchError);
              return null;
            }
            
            console.log('✅ Existing profile fetched successfully');
            return existingProfile;
          } else {
            return null;
          }
        }
        
        console.log('✅ Profile created, fetching...');
        
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
        
        console.log('✅ New profile fetched successfully');
        return newProfile
      } else if (error) {
        console.error('Unexpected error fetching profile:', error);
        return null;
      }

      console.log('✅ Profile found and returned');
      return profile
    } catch (error) {
      console.error('Error in getUserPromise:', error);
      
      // If it's a timeout error, provide more specific information
      if (error instanceof Error && error.message.includes('timeout')) {
        console.error('Database query timed out - check network connectivity and Supabase status');
      }
      
      return null;
    }
  }
  
  try {
    return await Promise.race([getUserPromise(), timeoutPromise]);
  } catch (error) {
    console.error('getCurrentUser failed or timed out:', error);
    
    // If it's a timeout, provide helpful debugging information
    if (error instanceof Error && error.message.includes('timeout')) {
      console.error('🚨 Authentication timeout detected. Please check:');
      console.error('1. Network connectivity');
      console.error('2. Supabase project status');
      console.error('3. Environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)');
      console.error('4. Database RLS policies on users table');
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

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', user.id)
    .select()
    .maybeSingle()

  if (error) throw error
  return data
}