import { VITE_WEB_PUSH_PUBLIC_KEY } from './env'
import { getWorkingClient } from './supabase'

export interface NotificationPreferences {
  user_id: string
  dm_enabled: boolean
  mention_enabled: boolean
  reply_enabled: boolean
  reaction_enabled: boolean
  group_enabled: boolean
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  mute_until: string | null
}

export interface PushSupportStatus {
  supported: boolean
  canPrompt: boolean
  reason: string | null
}

export interface ClientPlatformInfo {
  os: 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown'
  browser: 'safari' | 'chrome' | 'edge' | 'firefox' | 'other'
  isStandalone: boolean
  isSecureContext: boolean
}

export interface NotificationGuidance {
  title: string
  summary: string
  steps: string[]
  canRequestNow: boolean
  requiresInstall: boolean
}

const DEFAULT_PREFERENCES = {
  dm_enabled: true,
  mention_enabled: true,
  reply_enabled: true,
  reaction_enabled: false,
  group_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  mute_until: null,
}

const SW_PATH = '/sw.js'

export const getDefaultNotificationPreferences = (
  userId: string
): NotificationPreferences => ({
  user_id: userId,
  ...DEFAULT_PREFERENCES,
})

export const getNotificationPermission = (): NotificationPermission | 'unsupported' => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }

  return Notification.permission
}

export const isIosDevice = () => {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export const isStandaloneDisplayMode = () => {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export const getPushSupportStatus = (): PushSupportStatus => {
  if (typeof window === 'undefined') {
    return { supported: false, canPrompt: false, reason: 'Push notifications are only available in the browser.' }
  }

  if (!window.isSecureContext) {
    return { supported: false, canPrompt: false, reason: 'Push notifications require a secure HTTPS origin.' }
  }

  if (!('serviceWorker' in navigator)) {
    return { supported: false, canPrompt: false, reason: 'This browser does not support service workers.' }
  }

  if (!('PushManager' in window)) {
    return { supported: false, canPrompt: false, reason: 'This browser does not support Web Push.' }
  }

  if (!('Notification' in window)) {
    return { supported: false, canPrompt: false, reason: 'This browser does not support notifications.' }
  }

  if (isIosDevice() && !isStandaloneDisplayMode()) {
    return {
      supported: false,
      canPrompt: false,
      reason: 'On iPhone and iPad, push works after installing the app to the Home Screen.',
    }
  }

  return { supported: true, canPrompt: true, reason: null }
}

export const registerPushServiceWorker = async () => {
  const support = getPushSupportStatus()
  if (!support.supported) return null

  const registration = await navigator.serviceWorker.register(SW_PATH, { scope: '/' })
  return registration
}

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

const inferPlatform = () => {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios'
  if (ua.includes('android')) return 'android'
  if (ua.includes('windows')) return 'windows'
  if (ua.includes('mac os')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

export const getClientPlatformInfo = (): ClientPlatformInfo => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      os: 'unknown',
      browser: 'other',
      isStandalone: false,
      isSecureContext: false,
    }
  }

  const ua = navigator.userAgent.toLowerCase()
  const browser: ClientPlatformInfo['browser'] =
    ua.includes('edg/')
      ? 'edge'
      : ua.includes('firefox')
        ? 'firefox'
        : ua.includes('chrome') || ua.includes('crios')
          ? 'chrome'
          : ua.includes('safari')
            ? 'safari'
            : 'other'

  return {
    os: inferPlatform() as ClientPlatformInfo['os'],
    browser,
    isStandalone: isStandaloneDisplayMode(),
    isSecureContext: window.isSecureContext,
  }
}

const getSiteSettingsStep = (platform: ClientPlatformInfo) => {
  if (platform.browser === 'safari') {
    return 'Open the website settings for this page in Safari and allow Notifications for Shadow Chat.'
  }

  if (platform.browser === 'firefox') {
    return 'Open the site permissions for this page in Firefox and change Notifications to Allow.'
  }

  return 'Open the site settings for this page in your browser and change Notifications to Allow for Shadow Chat.'
}

const getSystemSettingsStep = (platform: ClientPlatformInfo) => {
  if (platform.os === 'ios') {
    return 'Open Settings > Notifications > Shadow Chat and make sure Allow Notifications is turned on.'
  }

  if (platform.os === 'android') {
    return 'Open Android Settings > Notifications and allow notifications for your browser or installed Shadow Chat app.'
  }

  if (platform.os === 'windows') {
    return 'Open Windows Settings > System > Notifications and allow notifications for your browser or installed Shadow Chat app.'
  }

  if (platform.os === 'macos') {
    return 'Open System Settings > Notifications and allow notifications for your browser or installed Shadow Chat app.'
  }

  return 'Open your device notification settings and allow notifications for your browser or installed Shadow Chat app.'
}

export const getNotificationGuidance = (
  permission: NotificationPermission | 'unsupported',
  support: PushSupportStatus
): NotificationGuidance => {
  const platform = getClientPlatformInfo()

  if (platform.os === 'ios' && !platform.isStandalone) {
    return {
      title: 'Install Shadow Chat First',
      summary: 'On iPhone and iPad, push notifications work after you install Shadow Chat to your Home Screen and open it from there.',
      steps: [
        'Open Shadow Chat in Safari.',
        'Tap Share, then choose Add to Home Screen.',
        'Launch Shadow Chat from your Home Screen.',
        'Return here and enable notifications from the installed app.',
      ],
      canRequestNow: false,
      requiresInstall: true,
    }
  }

  if (!support.supported) {
    return {
      title: 'Notifications Are Not Available Yet',
      summary: support.reason || 'This device or browser is not ready for push notifications yet.',
      steps: [
        'Make sure you are using a supported browser on a secure HTTPS connection.',
        getSystemSettingsStep(platform),
      ],
      canRequestNow: false,
      requiresInstall: false,
    }
  }

  if (permission === 'granted') {
    return {
      title: 'Notifications Are Enabled',
      summary: 'This device is ready to receive Shadow Chat notifications.',
      steps: [
        'Keep notifications allowed for this site in browser settings.',
        getSystemSettingsStep(platform),
      ],
      canRequestNow: false,
      requiresInstall: false,
    }
  }

  if (permission === 'denied') {
    return {
      title: 'Turn Notifications Back On',
      summary: 'This browser has blocked notifications for Shadow Chat. Web apps cannot jump straight into OS settings, so follow these steps to re-enable them.',
      steps: [
        getSiteSettingsStep(platform),
        getSystemSettingsStep(platform),
        'Return to Shadow Chat and tap Refresh Status after changing the settings.',
      ],
      canRequestNow: false,
      requiresInstall: false,
    }
  }

  return {
    title: 'Enable Notifications',
    summary: 'Turn on push notifications so Shadow Chat can alert you about direct messages and important activity on this device.',
    steps: [
      'Tap Enable Notifications below.',
      'Approve the browser permission prompt when it appears.',
      getSystemSettingsStep(platform),
    ],
    canRequestNow: true,
    requiresInstall: false,
  }
}

export const getNotificationGuidanceText = (guidance: NotificationGuidance) =>
  `${guidance.title}\n\n${guidance.summary}\n\n${guidance.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`

export const fetchNotificationPreferences = async (userId: string) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient
    .from('notification_preferences')
    .select(
      'user_id, dm_enabled, mention_enabled, reply_enabled, reaction_enabled, group_enabled, quiet_hours_start, quiet_hours_end, mute_until'
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (data) {
    return data as NotificationPreferences
  }

  return upsertNotificationPreferences(userId, {})
}

export const upsertNotificationPreferences = async (
  userId: string,
  updates: Partial<Omit<NotificationPreferences, 'user_id'>>
) => {
  const workingClient = await getWorkingClient()
  const payload = {
    ...DEFAULT_PREFERENCES,
    ...updates,
    user_id: userId,
  }

  const { data, error } = await workingClient
    .from('notification_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select(
      'user_id, dm_enabled, mention_enabled, reply_enabled, reaction_enabled, group_enabled, quiet_hours_start, quiet_hours_end, mute_until'
    )
    .single()

  if (error) {
    throw error
  }

  return data as NotificationPreferences
}

export const getCurrentPushSubscription = async () => {
  const support = getPushSupportStatus()
  if (!support.supported) return null

  const registration = await registerPushServiceWorker()
  if (!registration) return null

  return registration.pushManager.getSubscription()
}

export const syncPushSubscription = async (
  userId: string,
  subscription: PushSubscription,
  enabled = true
) => {
  const workingClient = await getWorkingClient()
  const keys = subscription.toJSON().keys

  if (!keys?.p256dh || !keys.auth) {
    throw new Error('Push subscription keys are missing.')
  }

  const { error } = await workingClient
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        platform: inferPlatform(),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        enabled,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    )

  if (error) {
    throw error
  }
}

export const enablePushForCurrentDevice = async (userId: string) => {
  const support = getPushSupportStatus()
  if (!support.supported) {
    throw new Error(support.reason || 'Push notifications are not supported on this device.')
  }

  if (!VITE_WEB_PUSH_PUBLIC_KEY) {
    throw new Error('Missing VITE_WEB_PUSH_PUBLIC_KEY. Add the public VAPID key before enabling push.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const registration = await registerPushServiceWorker()
  if (!registration) {
    throw new Error('Service worker registration failed.')
  }

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VITE_WEB_PUSH_PUBLIC_KEY),
    })
  }

  await syncPushSubscription(userId, subscription, true)

  return subscription
}

export const disablePushForCurrentDevice = async (userId: string) => {
  const workingClient = await getWorkingClient()
  const subscription = await getCurrentPushSubscription()

  if (subscription) {
    const { error } = await workingClient
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', subscription.endpoint)

    if (error) {
      throw error
    }

    await subscription.unsubscribe().catch(() => false)
  }
}

export const syncCurrentDeviceSubscription = async (userId: string) => {
  const support = getPushSupportStatus()
  if (!support.supported || getNotificationPermission() !== 'granted' || !VITE_WEB_PUSH_PUBLIC_KEY) {
    return false
  }

  const subscription = await getCurrentPushSubscription()
  if (!subscription) {
    return false
  }

  await syncPushSubscription(userId, subscription, true)
  return true
}

export const triggerDMPushNotification = async (messageId: string) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.functions.invoke('send-push', {
    body: {
      type: 'dm_message',
      messageId,
    },
  })

  if (error) {
    throw error
  }

  return data
}

export const triggerGroupPushNotification = async (messageId: string) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.functions.invoke('send-push', {
    body: {
      type: 'group_message',
      messageId,
    },
  })

  if (error) {
    throw error
  }

  return data
}
