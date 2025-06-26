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

  // Create profile in users table
  if (data.user) {
    const { error: profileError } = await supabase
      .from('users')
      .upsert({
        id: data.user.id,
        email,
        username,
        display_name: displayName,
        status: 'online'
      }, { onConflict: 'id' })

    if (profileError) {
      console.error('Error creating user profile:', profileError)
      throw new Error('Failed to create user profile')
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

  // Update user status to online
  if (data.user && data.session) {
    const { error: updateError } = await supabase
      .from('users')
      .update({ status: 'online', last_active: new Date().toISOString() })
      .eq('id', data.user.id)
    
    if (updateError) {
      console.warn('Could not update user status:', updateError)
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

export const clearAllSessions = async () => {
  try {
    // Sign out from Supabase (this clears the session)
    await supabase.auth.signOut()
    
    // Clear any remaining localStorage items related to Supabase
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('supabase.auth.token')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
    
    // Clear session storage as well
    const sessionKeysToRemove = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith('supabase.auth.token')) {
        sessionKeysToRemove.push(key)
      }
    }
    sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key))
    
    // Force reload to ensure clean state
    window.location.reload()
  } catch (error) {
    console.error('Error clearing sessions:', error)
    // Force reload even if there's an error
    window.location.reload()
  }
}

export const AuthService = {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  getUserProfile,
  updateProfile: updateUserProfile,
  updatePresence,
  clearAllSessions,
}