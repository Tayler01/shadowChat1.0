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
      throw profileError
    }

    // Fetch the profile after creation
    const profile = await getUserProfile(data.user.id)
    return profile
  }

  return null
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  try {
    // Get the user profile from the users table
    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Error fetching user profile:', error)
      
      // If profile doesn't exist, create it from auth user metadata
      if (error.code === 'PGRST116') {
        console.log('Creating missing user profile...')
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            email: user.email!,
            username: user.user_metadata?.username || user.email?.split('@')[0] || 'user',
            display_name: user.user_metadata?.display_name || user.user_metadata?.full_name || 'User',
            status: 'online'
          })
        
        if (insertError) {
          console.error('Error creating user profile:', insertError)
          return null
        }
        
        // Fetch the newly created profile
        const { data: newProfile } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single()
        
        return newProfile
      }
      
      return null
    }

    return profile
  } catch (error) {
    console.error('Unexpected error in getCurrentUser:', error)
    return null
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