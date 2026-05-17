import { supabase } from './supabase'
import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import type { User as AppUser } from './supabase'
import { optimizeImageFile } from './imageOptimization'
import { createStoredImageAsset } from './mediaAssets'

const AVATAR_BUCKET = 'avatars'
const BANNER_BUCKET = 'banners'

const PROFILE_RETRY_DELAY_MS = 250
const PROFILE_RETRY_ATTEMPTS = 8
const AUTH_USER_LOOKUP_TIMEOUT_MS = 5000
const PROFILE_LOOKUP_TIMEOUT_MS = 6000

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

const withTimeout = async <T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> => (
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      globalThis.setTimeout(() => reject(new Error(message)), ms)
    }),
  ]) as Promise<T>
)

const fetchUserProfileWithRetry = async (userId: string): Promise<AppUser | null> => {
  for (let attempt = 0; attempt < PROFILE_RETRY_ATTEMPTS; attempt += 1) {
    const { data, error } = await withTimeout<{ data: AppUser | null; error: any }>(
      supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle() as PromiseLike<{ data: AppUser | null; error: any }>,
      PROFILE_LOOKUP_TIMEOUT_MS,
      `Profile lookup timeout after ${PROFILE_LOOKUP_TIMEOUT_MS}ms`
    )

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
    try {
      await supabase.rpc('update_user_last_active')
    } catch {
      // The foreground heartbeat will retry; sign-in should not fail on presence.
    }
  }

  return data
}

export const signOut = async () => {
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    await supabase
      .from('user_presence')
      .update({
        status: 'offline',
        last_seen: null,
        current_channel: null,
        typing_in: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
  }

  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const getCurrentUser = async (): Promise<AppUser | null> => {
  try {
    const { data: { user }, error: authError } = await withTimeout<{
      data: { user: SupabaseAuthUser | null }
      error: any
    }>(
      supabase.auth.getUser() as PromiseLike<{
        data: { user: SupabaseAuthUser | null }
        error: any
      }>,
      AUTH_USER_LOOKUP_TIMEOUT_MS,
      `Auth user lookup timeout after ${AUTH_USER_LOOKUP_TIMEOUT_MS}ms`
    )

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
  presence_visibility: 'tracked' | 'invisible';
  avatar_url: string;
  avatar_thumbnail_url: string | null;
  avatar_thumbnail_path: string | null;
  banner_url: string;
  banner_thumbnail_url: string | null;
  banner_thumbnail_path: string | null;
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

  const uploadFile = await optimizeImageFile(file, {
    maxWidth: 512,
    maxHeight: 512,
    minBytes: 80 * 1024,
    quality: 0.84,
    fileNamePrefix: 'avatar',
  })
  const filePath = `${user.id}/${Date.now()}_${uploadFile.name}`
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(filePath, uploadFile, {
    upsert: true,
    contentType: uploadFile.type,
    cacheControl: '31536000',
  })
  if (error) throw error

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath)
  const asset = createStoredImageAsset(filePath, data.publicUrl, 'avatar')
  await updateUserProfile({
    avatar_url: asset.publicUrl,
    avatar_thumbnail_url: asset.thumbnailUrl,
    avatar_thumbnail_path: asset.thumbnailPath,
  })
  return asset.publicUrl
}

export const uploadUserBanner = async (file: File) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const uploadFile = await optimizeImageFile(file, {
    maxWidth: 1600,
    maxHeight: 900,
    quality: 0.82,
    fileNamePrefix: 'banner',
  })
  const filePath = `${user.id}/${Date.now()}_${uploadFile.name}`
  const { error } = await supabase.storage.from(BANNER_BUCKET).upload(filePath, uploadFile, {
    upsert: true,
    contentType: uploadFile.type,
    cacheControl: '31536000',
  })
  if (error) throw error

  const { data } = supabase.storage.from(BANNER_BUCKET).getPublicUrl(filePath)
  const asset = createStoredImageAsset(filePath, data.publicUrl, 'banner')
  await updateUserProfile({
    banner_url: asset.publicUrl,
    banner_thumbnail_url: asset.thumbnailUrl,
    banner_thumbnail_path: asset.thumbnailPath,
  })
  return asset.publicUrl
}
