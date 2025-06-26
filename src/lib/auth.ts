import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

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
  const { data: existingUser, error: checkError } = await supabase
    .from('users')
    .select('username')
    .eq('username', username)
    .maybeSingle()

  if (checkError && checkError.code !== 'PGRST116') {
    throw new Error('Error checking username availability')
  }

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

  // Create profile in users table after a short delay to ensure auth context is ready
  if (data.user && data.session) {
    // Wait a moment for the auth session to be fully established
    await new Promise(resolve => setTimeout(resolve, 100))
    
    try {
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: data.user.id,
          email,
          username,
          display_name: displayName,
          status: 'online'
        })

      if (profileError) {
        console.error('Error creating user profile:', profileError)
        // If profile creation fails, clean up the auth user
        await supabase.auth.signOut()
        throw new Error('Failed to create user profile')
      }
    } catch (error) {
      console.error('Error in profile creation:', error)
      await supabase.auth.signOut()
      throw error
    }
  }

  return data
}

export const signIn = async ({ email, password }: SignInData) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) throw error

  if (data.user && data.session) {
    // Check if a profile row already exists
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle()

    if (profileError && profileError.code !== 'PGRST116') {
      console.warn('Could not fetch user profile:', profileError)
    }

    if (!profile) {
      // Create the profile using metadata from the auth user
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: data.user.id,
          email: data.user.email,
          username: data.user.user_metadata?.username,
          display_name: data.user.user_metadata?.display_name,
          status: 'online'
        })

      if (insertError) {
        console.error('Error creating user profile on sign in:', insertError)
      }
    } else {
      // Update user status to online if profile exists
      const { error: updateError } = await supabase
        .from('users')
        .update({ status: 'online', last_active: new Date().toISOString() })
        .eq('id', data.user.id)

      if (updateError) {
        console.warn('Could not update user status:', updateError)
      }
    }
  }

  return data
}

export const signOut = async () => {
  const { data: { user }, error: getUserError } = await supabase.auth.getUser()
  
  if (user && !getUserError) {
    // Update status to offline before signing out
    const { error: updateError } = await supabase
      .from('users')
      .update({ status: 'offline' })
      .eq('id', user.id)
    
    if (updateError) {
      console.warn('Could not update user status to offline:', updateError)
    }
  }

  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  
  if (!user) return null
  
  // Get profile from users table
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()
  
  if (profileError) throw profileError
  return profile
}

export const getUserProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}

export const updateUserProfile = async (updates: any) => {
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

export const updatePresence = async () => {
  const { error } = await supabase.rpc('update_user_last_active')
  if (error) console.error('Error updating presence:', error)
}

export const AuthService = {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  getUserProfile,
  updateProfile: updateUserProfile,
  updatePresence,
}