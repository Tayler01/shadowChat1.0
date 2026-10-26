import { ensureSession, getWorkingClient, supabase, updateUserPresence, SUPABASE_URL, SUPABASE_ANON_KEY, localStorageKey } from './supabase'
import {
  beginAccountDeletionAttempt, confirmAccountDeletion, discardUnstartedAccountDeletion,
  finishAccountDeletionAttempt, getPendingAccountDeletion, prepareAccountDeletion,
  getConfirmedAccountDeletionReloadUrl,
  withAccountDeletionLock,
  type AccountDeletionReceipt,
} from '../../../../src/lib/accountDeletionReceipt'
import { clearLocalOutboxForSender } from './localMessageOutbox'
import { invalidatePrivateMediaUrls } from '../../../../src/lib/privateMediaUrls'
import { cleanupDeletedAccountLocalState, replaceDeletedAccountPage } from '../../../../src/lib/accountDeletionCleanup'
import { requireAccountDeletionProtocol } from '../../../../src/lib/accountDeletionProtocol'
import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import type { AuthenticatedUser, User as PublicUser } from './supabase'
import {
  pickPublicProfile,
  PUBLIC_PROFILE_SELECT,
} from '../../../../supabase/functions/_shared/public-profile'
import { optimizeImageFile } from '../../../../src/lib/imageOptimization'
import { createStoredImageAsset } from '../../../../src/lib/mediaAssets'
import {
  AVATAR_UPLOAD_RULE,
  BANNER_UPLOAD_RULE,
  sanitizeUploadFileName,
  validateUpload,
} from '../../../../src/lib/uploadLimits'

const AVATAR_BUCKET = 'avatars'
const BANNER_BUCKET = 'banners'

const PROFILE_RETRY_DELAY_MS = 250
const PROFILE_RETRY_ATTEMPTS = 8
const AUTH_USER_LOOKUP_TIMEOUT_MS = 5000
const PROFILE_LOOKUP_TIMEOUT_MS = 6000
type DeletionSessionResponse = {
  data: { session: { user: { id: string }; access_token?: string } | null }
  error: unknown
}

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
  inviteCode: string
}

export interface SignInData {
  email: string
  password: string
}

export interface SignUpResult {
  user: SupabaseAuthUser | null
  profile: AuthenticatedUser | null
  session: unknown | null
}

const OFFICIAL_APP_ORIGIN = 'https://shadochat.online'
const LEGACY_NETLIFY_APP_ORIGIN = 'https://shadowchat-1-0.netlify.app'

const getAuthRedirectOrigin = () => {
  if (typeof window === 'undefined') {
    return OFFICIAL_APP_ORIGIN
  }

  const { origin } = window.location
  if (origin === LEGACY_NETLIFY_APP_ORIGIN) {
    return OFFICIAL_APP_ORIGIN
  }

  return origin || OFFICIAL_APP_ORIGIN
}

const getAuthRedirectTo = (mode?: 'verified' | 'reset-password') => {
  const url = new URL(getAuthRedirectOrigin())
  if (mode) {
    url.searchParams.set('auth', mode)
  }
  return url.toString()
}

const wait = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms))

const withTimeout = async <T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) }),
    ])
  } finally { if (timer) clearTimeout(timer) }
}

const fetchUserProfileWithRetry = async (
  userId: string,
  authEmail: string,
  clientOverride?: any
): Promise<AuthenticatedUser | null> => {
  const client = clientOverride ?? await getWorkingClient()

  for (let attempt = 0; attempt < PROFILE_RETRY_ATTEMPTS; attempt += 1) {
    const { data, error } = await withTimeout<{ data: PublicUser | null; error: any }>(
      client
        .from('users')
        .select(PUBLIC_PROFILE_SELECT)
        .eq('id', userId)
        .maybeSingle() as PromiseLike<{ data: PublicUser | null; error: any }>,
      PROFILE_LOOKUP_TIMEOUT_MS,
      `Profile lookup timeout after ${PROFILE_LOOKUP_TIMEOUT_MS}ms`
    )

    if (data) {
      return {
        ...pickPublicProfile(data as unknown as Record<string, unknown>),
        email: authEmail,
      } as unknown as AuthenticatedUser
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
  inviteCode,
}: SignUpData): Promise<SignUpResult> => {
  const normalizedUsername = username.trim().toLowerCase()
  const normalizedInviteCode = inviteCode.trim()

  if (!normalizedUsername) {
    throw new Error('Username is required')
  }

  if (!normalizedInviteCode) {
    throw new Error('Invite code is required')
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
      emailRedirectTo: getAuthRedirectTo('verified'),
      data: {
        username: normalizedUsername,
        invite_code: normalizedInviteCode,
      },
    },
  })

  if (error) throw error
  if (!data.user) {
    return { user: null, profile: null, session: null }
  }

  if (data.session) {
    const profile = await fetchUserProfileWithRetry(data.user.id, data.user.email || email)
    if (!profile) {
      throw new Error('Account created, but profile setup did not complete. Please try signing in again.')
    }

    return { user: data.user, profile, session: data.session }
  }

  return { user: data.user, profile: null, session: null }
}

export const resendVerificationEmail = async (email: string) => {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: getAuthRedirectTo('verified'),
    },
  })

  if (error) throw error
}

export const sendPasswordResetEmail = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthRedirectTo('reset-password'),
  })

  if (error) throw error
}

export const updatePasswordAfterRecovery = async (password: string) => {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
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
      await updateUserPresence()
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

async function requireDeletionConfirmation(data: unknown, error: any, pending: AccountDeletionReceipt) {
  if (error) {
    // FunctionsHttpError keeps the server's useful retry/partial-cleanup detail
    // on its Response. Preserve that message instead of a generic HTTP failure.
    let detail: unknown
    const response = error.context as Response | undefined
    if (response && typeof response.json === 'function') {
      try {
        detail = await (typeof response.clone === 'function' ? response.clone() : response).json()
      } catch {
        // Network/proxy errors may have no JSON body.
      }
    }
    const message = detail && typeof detail === 'object' && 'error' in detail
      ? detail.error
      : null
    // Only an explicit server statement may discard a request. A timeout or
    // generic 401/403 may occur after the durable job was created.
    if (detail && typeof detail === 'object' && 'deletionStarted' in detail && detail.deletionStarted === false) {
      discardUnstartedAccountDeletion(pending.receipt)
    }
    throw new Error(typeof message === 'string' && message.length <= 1000
      ? message
      : error.message || 'Account deletion failed. Try again.')
  }

  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    throw new Error(data.error)
  }

  if (!data || typeof data !== 'object' || !('ok' in data) || data.ok !== true) {
    throw new Error('Account deletion was not confirmed. Try again before signing out.')
  }

  confirmAccountDeletion(pending.receipt)
  const sessionResult = await withTimeout<DeletionSessionResponse>(supabase.auth.getSession(), 2000, 'Session lookup timed out').catch(() => null)
  const current = sessionResult?.error === null ? sessionResult.data : undefined
  clearLocalOutboxForSender(pending.userId)
  const cleanup = cleanupDeletedAccountLocalState(pending.userId, current ? current.session?.user.id ?? null : undefined, localStorageKey)
  if (cleanup.clearedSharedCaches) invalidatePrivateMediaUrls()
  if (cleanup.reloadDeletedSession) {
    const url = getConfirmedAccountDeletionReloadUrl(pending.receipt)
    if (url) replaceDeletedAccountPage(url)
  }
}

export const deleteCurrentAccount = () => withAccountDeletionLock(async () => {
  if (!await withTimeout(ensureSession(true), 20_000, 'Session check timed out. Try again.')) throw new Error('Sign in again before deleting your account.')
  const workingClient = await getWorkingClient()
  const { data: auth, error: authError } = await withTimeout<{ data: { user: { id: string } | null }; error: unknown }>(workingClient.auth.getUser(), 5000, 'Sign-in check timed out. Try again.')
  if (authError || !auth.user?.id) throw new Error('Sign in again before deleting your account.')
  // Never create a recovery receipt or send DELETE to a legacy handler that
  // cannot honor it. The probe contains no deletion confirmation or identity.
  await requireAccountDeletionProtocol(SUPABASE_URL, SUPABASE_ANON_KEY)
  const pending = prepareAccountDeletion(auth.user.id)
  beginAccountDeletionAttempt(pending.receipt)
  try {
    const { data, error } = await withTimeout<{ data: unknown; error: any }>(workingClient.functions.invoke('delete-account', {
      body: { confirm: 'DELETE', receipt: pending.receipt, expectedUserId: pending.userId },
      timeout: 120_000,
    }), 125_000, 'The deletion request timed out. Your saved request can be retried safely.')
    await requireDeletionConfirmation(data, error, pending)
    finishAccountDeletionAttempt(undefined, pending.receipt)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account deletion could not be confirmed. Retry to finish.'
    finishAccountDeletionAttempt(message, pending.receipt)
    throw error
  }
})

/** Continues only the account-deletion intent that the member already confirmed. */
export const retryPendingAccountDeletion = () => withAccountDeletionLock(async () => {
  const pending = getPendingAccountDeletion()
  if (!pending) throw new Error('No pending deletion was found in this browser. Contact privacy@shadochat.online if you need help.')
  beginAccountDeletionAttempt(pending.receipt)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)
  try {
    // Preserve the existing receipt if the backend is unavailable or has rolled
    // back. In particular, do not send a matching account JWT with DELETE first.
    await requireAccountDeletionProtocol(SUPABASE_URL, SUPABASE_ANON_KEY)
    // If the first request never reached the server, the same account may
    // authorize that saved request now. Never attach another account's JWT.
    const sessionResult = await withTimeout<DeletionSessionResponse>(supabase.auth.getSession(), 2000, 'Session lookup timed out').catch(() => null)
    const current = sessionResult?.error === null ? sessionResult.data : undefined
    const headers: Record<string, string> = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }
    if (current?.session?.user.id === pending.userId && current.session.access_token) {
      headers.Authorization = `Bearer ${current.session.access_token}`
    }
    const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ confirm: 'DELETE', receipt: pending.receipt, expectedUserId: pending.userId }),
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    const data = await response.clone().json().catch(() => null)
    await requireDeletionConfirmation(data, response.ok ? null : { context: response, message: 'Account deletion could not be confirmed. Retry to finish.' }, pending)
    finishAccountDeletionAttempt(undefined, pending.receipt)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account deletion could not be confirmed. Retry to finish.'
    finishAccountDeletionAttempt(message, pending.receipt)
    throw error
  } finally {
    clearTimeout(timeout)
  }
})

export const getCurrentUser = async (): Promise<AuthenticatedUser | null> => {
  try {
    const sessionValid = await ensureSession()
    if (!sessionValid) {
      return null
    }

    const workingClient = await getWorkingClient()
    const { data: { user }, error: authError } = await withTimeout<{
      data: { user: SupabaseAuthUser | null }
      error: any
    }>(
      workingClient.auth.getUser() as PromiseLike<{
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

    if (!user.email) {
      return null
    }

    return await fetchUserProfileWithRetry(user.id, user.email, workingClient)
  } catch {
    return null
  }
}

export const getUserProfile = async (userId: string): Promise<PublicUser | null> => {
  const { data, error } = await supabase
    .from('users')
    .select(PUBLIC_PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
    ? pickPublicProfile(data as Record<string, unknown>) as unknown as PublicUser
    : null
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
}>): Promise<AuthenticatedUser> => {
  const sessionValid = await ensureSession(true)
  if (!sessionValid) throw new Error('Not authenticated')

  const workingClient = await getWorkingClient()
  const { data: { user } } = await workingClient.auth.getUser()
  if (!user?.email) throw new Error('Not authenticated')

  const { data, error } = await workingClient
    .from('users')
    .update(updates)
    .eq('id', user.id)
    .select(PUBLIC_PROFILE_SELECT)
    .single()

  if (error) throw error
  return {
    ...pickPublicProfile(data as unknown as Record<string, unknown>),
    email: user.email,
  } as unknown as AuthenticatedUser
}

export const uploadUserAvatar = async (file: File) => {
  validateUpload(file, AVATAR_UPLOAD_RULE)

  const sessionValid = await ensureSession(true)
  if (!sessionValid) throw new Error('Not authenticated')

  const workingClient = await getWorkingClient()
  const { data: { user } } = await workingClient.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const uploadFile = await optimizeImageFile(file, {
    maxWidth: 512,
    maxHeight: 512,
    minBytes: 80 * 1024,
    quality: 0.84,
    fileNamePrefix: 'avatar',
  })
  const contentType = validateUpload(uploadFile, AVATAR_UPLOAD_RULE)
  const safeName = sanitizeUploadFileName(uploadFile.name, 'avatar')
  const filePath = `${user.id}/${Date.now()}_${safeName}`
  const { error } = await workingClient.storage.from(AVATAR_BUCKET).upload(filePath, uploadFile, {
    upsert: true,
    contentType,
    cacheControl: '31536000',
  })
  if (error) throw error

  const { data } = workingClient.storage.from(AVATAR_BUCKET).getPublicUrl(filePath)
  const asset = createStoredImageAsset(filePath, data.publicUrl, 'avatar')
  return updateUserProfile({
    avatar_url: asset.publicUrl,
    avatar_thumbnail_url: asset.thumbnailUrl,
    avatar_thumbnail_path: asset.thumbnailPath,
  })
}

export const uploadUserBanner = async (file: File) => {
  validateUpload(file, BANNER_UPLOAD_RULE)

  const sessionValid = await ensureSession(true)
  if (!sessionValid) throw new Error('Not authenticated')

  const workingClient = await getWorkingClient()
  const { data: { user } } = await workingClient.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const uploadFile = await optimizeImageFile(file, {
    maxWidth: 1600,
    maxHeight: 900,
    quality: 0.82,
    fileNamePrefix: 'banner',
  })
  const contentType = validateUpload(uploadFile, BANNER_UPLOAD_RULE)
  const safeName = sanitizeUploadFileName(uploadFile.name, 'banner')
  const filePath = `${user.id}/${Date.now()}_${safeName}`
  const { error } = await workingClient.storage.from(BANNER_BUCKET).upload(filePath, uploadFile, {
    upsert: true,
    contentType,
    cacheControl: '31536000',
  })
  if (error) throw error

  const { data } = workingClient.storage.from(BANNER_BUCKET).getPublicUrl(filePath)
  const asset = createStoredImageAsset(filePath, data.publicUrl, 'banner')
  return updateUserProfile({
    banner_url: asset.publicUrl,
    banner_thumbnail_url: asset.thumbnailUrl,
    banner_thumbnail_path: asset.thumbnailPath,
  })
}
