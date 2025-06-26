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
  // Create auth user
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        display_name: displayName
      }
    }
  })

  if (error) throw error
  return data
}

export const signIn = async ({ email, password }: SignInData) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) throw error

  // Ensure user profile exists and update status
  if (data.user) {
    // First try to get existing profile
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id')
      .eq('id', data.user.id)
      .single()

    if (!existingProfile) {
      // Create profile if it doesn't exist (handles email confirmation flow)
      const userData = data.user.user_metadata
      await supabase
        .from('users')
        .insert({
          id: data.user.id,
          email: data.user.email!,
          username: userData.username,
          display_name: userData.display_name,
          status: 'online'
        })
    } else {
      // Update existing profile status
      await supabase
        .from('users')
        .update({ status: 'online', last_active: new Date().toISOString() })
        .eq('id', data.user.id)
    }
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

  // Get the user profile from our users table
  const { data: profile, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Error fetching user profile:', error)
    return null
  }

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

export const AuthService = {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  getUserProfile,
  updateUserProfile
}