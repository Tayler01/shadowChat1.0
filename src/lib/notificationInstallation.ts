import { getWorkingClient } from './supabase'
import {
  VITE_APP_BUILD_ID,
  VITE_APP_COMMIT_SHA,
  VITE_APP_DEPLOY_CONTEXT,
} from './env'

const INSTALLATION_KEY_STORAGE = 'shadowchat:notification-installation-v2'
let installationKeyMemory: string | null = null
let activeInstallationUserId: string | null = null
let installationGeneration = 0
let installationRegistration: { userId: string; loadedAt: number; result: { id: string | null; key: string } } | null = null
let registrationRequest: { userId: string; promise: Promise<{ id: string | null; key: string } | null> } | null = null

export const resetWebNotificationInstallationForUser = (userId: string | null) => {
  if (activeInstallationUserId === userId) return
  installationGeneration += 1
  activeInstallationUserId = userId
  installationRegistration = null
  registrationRequest = null
}

const createInstallationKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16)
    const nibble = character === 'x' ? value : (value & 0x3) | 0x8
    return nibble.toString(16)
  })
}

export const getNotificationInstallationKey = () => {
  if (installationKeyMemory) return installationKeyMemory
  try {
    const stored = localStorage.getItem(INSTALLATION_KEY_STORAGE)
    if (
      stored &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)
    ) {
      installationKeyMemory = stored
      return stored
    }
  } catch {
    // Device-scoped storage can be unavailable in private browsing.
  }

  const created = createInstallationKey()
  installationKeyMemory = created
  try {
    localStorage.setItem(INSTALLATION_KEY_STORAGE, created)
  } catch {
    // The in-memory installation remains valid for this visible session.
  }
  return created
}

const isMissingV2Rpc = (error: { code?: string; message?: string } | null) => (
  error?.code === 'PGRST202' ||
  error?.code === '42883' ||
  Boolean(error?.message?.includes('notification_installation'))
)

const registerInstallation = async () => {
  const generation = installationGeneration
  const client = await getWorkingClient()
  if (generation !== installationGeneration) return null
  const installationKey = getNotificationInstallationKey()
  const { data, error } = await client.rpc(
    'register_my_notification_installation_v2',
    {
      target_installation_key: installationKey,
      target_platform: 'web',
      target_app_id: 'shadowchat-pwa',
      target_project_id: null,
      target_environment: VITE_APP_DEPLOY_CONTEXT === 'production'
        ? 'production'
        : 'preview',
      target_app_version: VITE_APP_BUILD_ID || null,
      target_build_number: VITE_APP_COMMIT_SHA || null,
      target_locale: typeof navigator !== 'undefined' ? navigator.language : null,
      target_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      target_channel_schema_version: 1,
    },
  )

  if (generation !== installationGeneration) return null
  if (error) {
    if (isMissingV2Rpc(error)) return null
    throw error
  }
  return {
    id: typeof data === 'string' ? data : null,
    key: installationKey,
  }
}

export const registerWebNotificationInstallation = async (userId = activeInstallationUserId) => {
  if (!userId) return registerInstallation()
  if (installationRegistration?.userId === userId && Date.now() - installationRegistration.loadedAt < 5 * 60_000) {
    return installationRegistration.result
  }
  if (registrationRequest?.userId === userId) return registrationRequest.promise
  const request = registerInstallation().then(result => {
    if (result && activeInstallationUserId === userId) {
      installationRegistration = { userId, loadedAt: Date.now(), result }
    }
    return result
  }).finally(() => {
    if (registrationRequest?.promise === request) registrationRequest = null
  })
  registrationRequest = { userId, promise: request }
  return request
}

export const updateWebNotificationInstallationForeground = async (
  foreground: boolean,
) => {
  const generation = installationGeneration
  const client = await getWorkingClient()
  if (generation !== installationGeneration) return false
  const installationKey = getNotificationInstallationKey()
  const { data, error } = await client.rpc(
    'set_my_notification_installation_foreground_v2',
    {
      target_installation_key: installationKey,
      target_foreground_until: foreground
        ? new Date(Date.now() + 90_000).toISOString()
        : null,
    },
  )

  if (generation !== installationGeneration) return false
  if (error) {
    if (isMissingV2Rpc(error)) return false
    throw error
  }
  return data === true
}

export const claimWebNotificationPresentation = async (eventId: string) => {
  const generation = installationGeneration
  const client = await getWorkingClient()
  if (generation !== installationGeneration) return null
  const registration = await registerWebNotificationInstallation()
  if (generation !== installationGeneration || !registration) return null

  const { data, error } = await client.rpc(
    'claim_my_notification_presentation_v2',
    {
      target_event_id: eventId,
      target_installation_key: registration.key,
      target_presentation_family: 'foreground',
    },
  )
  if (generation !== installationGeneration) return null
  if (error) {
    if (isMissingV2Rpc(error)) return null
    throw error
  }
  return data === true
}
