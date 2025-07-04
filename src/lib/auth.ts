import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

const AVATAR_BUCKET = 'avatars'
const BANNER_BUCKET = 'banners'

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

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    // Handle the specific "user not found" error from invalid JWT
    if (authError && authError.message?.includes('User from sub claim in JWT does not exist')) {
      await supabase.auth.signOut();
      return null;
    }
    
    if (authError) {
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
        // If user already exists (race condition), just fetch it
        if (insertError.code === '23505') {
          const { data: existingProfile, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single()
          
          if (fetchError) {
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
        return null
      }
      
      return newProfile
    } else if (error) {
      return null;
    }

    return profile
  } catch {
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
  display_name: string;
  status_message: string;
  color: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  avatar_url: string;
  banner_url: string;
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

export const uploadUserAvatar = async (file: File) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const filePath = `${user.id}/${Date.now()}_${file.name}`
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(filePath, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath)
  await updateUserProfile({ avatar_url: data.publicUrl })
  return data.publicUrl
}

export const uploadUserBanner = async (file: File) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const filePath = `${user.id}/${Date.now()}_${file.name}`
  const { error } = await supabase.storage.from(BANNER_BUCKET).upload(filePath, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from(BANNER_BUCKET).getPublicUrl(filePath)
  await updateUserProfile({ banner_url: data.publicUrl })
  return data.publicUrl
}
