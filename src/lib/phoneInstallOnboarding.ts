import type { AuthenticatedUser } from './supabase'

const STORAGE_PREFIX = 'shadowchat:phone-install-onboarding'
export const PHONE_INSTALL_ONBOARDING_VERSION = 'v2'

type PhoneInstallProfile = Pick<AuthenticatedUser, 'id' | 'email' | 'created_at'>
const SIGNUP_MARKER_MATCH_WINDOW_MS = 30 * 60 * 1000

const normalizeEmail = (email?: string | null) => email?.trim().toLowerCase() || ''

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

const pendingUserKey = (userId: string) =>
  `${STORAGE_PREFIX}:pending-user:${PHONE_INSTALL_ONBOARDING_VERSION}:${userId}`

const pendingEmailKey = (email: string) =>
  `${STORAGE_PREFIX}:pending-email:${PHONE_INSTALL_ONBOARDING_VERSION}:${email}`

const seenUserKey = (userId: string) =>
  `${STORAGE_PREFIX}:seen:${PHONE_INSTALL_ONBOARDING_VERSION}:${userId}`

export const markPhoneInstallOnboardingPending = (
  email?: string | null,
  userId?: string | null
) => {
  const storage = getStorage()
  if (!storage) {
    return
  }

  const normalizedEmail = normalizeEmail(email)
  const createdAt = new Date().toISOString()

  try {
    if (userId) {
      storage.setItem(pendingUserKey(userId), createdAt)
    }
    if (normalizedEmail) {
      storage.setItem(pendingEmailKey(normalizedEmail), createdAt)
    }
  } catch {
    // localStorage can be blocked in private modes; onboarding still remains optional.
  }
}

export const markPhoneInstallOnboardingSeen = (profile: PhoneInstallProfile) => {
  const storage = getStorage()
  if (!storage) {
    return
  }

  const normalizedEmail = normalizeEmail(profile.email)

  try {
    storage.setItem(seenUserKey(profile.id), new Date().toISOString())
    storage.removeItem(pendingUserKey(profile.id))
    if (normalizedEmail) {
      storage.removeItem(pendingEmailKey(normalizedEmail))
    }
  } catch {
    // ignore storage errors
  }
}

export const isPhoneInstallOnboardingSeen = (profile: PhoneInstallProfile) => {
  const storage = getStorage()
  if (!storage) {
    return false
  }

  try {
    return Boolean(storage.getItem(seenUserKey(profile.id)))
  } catch {
    return false
  }
}

export const hasPhoneInstallOnboardingPending = (profile: PhoneInstallProfile) => {
  const storage = getStorage()
  if (!storage) {
    return false
  }

  const normalizedEmail = normalizeEmail(profile.email)

  try {
    const marker = storage.getItem(pendingUserKey(profile.id)) ||
      (normalizedEmail ? storage.getItem(pendingEmailKey(normalizedEmail)) : null)
    const markerTime = marker ? Date.parse(marker) : Number.NaN
    const accountTime = Date.parse(profile.created_at)
    return Number.isFinite(markerTime) &&
      Number.isFinite(accountTime) &&
      Math.abs(markerTime - accountTime) <= SIGNUP_MARKER_MATCH_WINDOW_MS
  } catch {
    return false
  }
}

export const shouldShowPhoneInstallOnboarding = (
  profile: PhoneInstallProfile | null,
  isInstalled: boolean,
  isPhoneLikeDevice = true
) => {
  if (!profile || isInstalled || !isPhoneLikeDevice || isPhoneInstallOnboardingSeen(profile)) {
    return false
  }

  // Signup is the only automatic entry point. Existing accounts that sign in
  // again (or on another device) must not be treated as newly created.
  return hasPhoneInstallOnboardingPending(profile)
}
