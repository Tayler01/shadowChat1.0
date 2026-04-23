import { supabase } from './supabase'
import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import type { User as AppUser } from './supabase'

const AVATAR_BUCKET = 'avatars'
const BANNER_BUCKET = 'banners'

const PROFILE_RETRY_DELAY_MS = 250
const PROFILE_RETRY_ATTEMPTS = 8

export interface AuthUser extends SupabaseAuthUser {
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

export interface SignUpResult {
  user: SupabaseAuthUser | null
  profile: AppUser | null
  session: unknown | null
}

const wait = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms))

const fetchUserProfileWithRetry = async (userId: string): Promise<AppUser | null> => {
  for (let attempt = 0; attempt < PROFILE_RETRY_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (data) {
      return data as unknown as AppUser
    }

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    if (attempt < PROFILE_RETRY_ATTEMPTS - 1) {
      await wait(PROFILE_RETRY_DELAY_MS)
    }
  }

  return null
}

export const signUp = async ({
  email,
  password,
  username,
  displayName,
}: SignUpData): Promise<SignUpResult> => {
  const normalizedUsername = username.trim().toLowerCase()

  if (!normalizedUsername) {
    throw new Error('Username is required')
  }

  const { data: isAvailable, error: availabilityError } = await supabase.rpc(
    'is_username_available',
    { candidate: normalizedUsername }
  )

  if (availabilityError) throw availabilityError
  if (isAvailable === false) {
    throw new Error('Username is already taken')
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: normalizedUsername,
        display_name: displayName.trim(),
      }
    }
  })

  if (error) throw error
  if (!data.user) {
    return { user: null, profile: null, session: null }
  }

  if (data.session) {
    const profile = await fetchUserProfileWithRetry(data.user.id)
    if (!profile) {
      throw new Error('Account created, but profile setup did not complete. Please try signing in again.')
    }

    return { user: data.user, profile, session: data.session }
  }

  return { user: data.user, profile: null, session: null }
}

export const signIn = async ({ email, password }: SignInData) => {
  let { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error && /refresh token|jwt|session|token/i.test(error.message || '')) {
    await supabase.auth.signOut().catch(() => undefined)
    const retry = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    data = retry.data
    error = retry.error
  }

  if (error) throw error

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
    await supabase
      .from('users')
      .update({ status: 'offline' })
      .eq('id', user.id)
  }

  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const getCurrentUser = async (): Promise<AppUser | null> => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError && authError.message?.includes('User from sub claim in JWT does not exist')) {
      await supabase.auth.signOut()
      return null
    }

    if (authError || !user) {
      return null
    }

    return await fetchUserProfileWithRetry(user.id)
  } catch {
    return null
  }
}

export const getUserProfile = async (userId: string): Promise<AppUser | null> => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data as unknown as AppUser | null
}

export const updateUserProfile = async (updates: Partial<{
  display_name: string;
  status_message: string;
  color: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  avatar_url: string;
  banner_url: string;
}>): Promise<AppUser> => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single()

  if (error) throw error
  return data as unknown as AppUser
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
