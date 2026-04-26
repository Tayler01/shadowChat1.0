import type { User } from './supabase'

const STORAGE_PREFIX = 'shadowchat:phone-install-onboarding'
export const PHONE_INSTALL_ONBOARDING_VERSION = 'v1'

type PhoneInstallProfile = Pick<User, 'id' | 'email'>

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

  try {
    if (userId) {
      storage.setItem(pendingUserKey(userId), '1')
    }
    if (normalizedEmail) {
      storage.setItem(pendingEmailKey(normalizedEmail), '1')
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
    return Boolean(
      storage.getItem(pendingUserKey(profile.id)) ||
      (normalizedEmail && storage.getItem(pendingEmailKey(normalizedEmail)))
    )
  } catch {
    return false
  }
}

export const shouldShowPhoneInstallOnboarding = (
  profile: PhoneInstallProfile | null,
  isInstalled: boolean
) => {
  if (!profile || isInstalled || isPhoneInstallOnboardingSeen(profile)) {
    return false
  }

  return hasPhoneInstallOnboardingPending(profile)
}
