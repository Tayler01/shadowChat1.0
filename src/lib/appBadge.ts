import { getWorkingClient } from './supabase'

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

const normalizeBadgeCount = (count: number) => {
  if (!Number.isFinite(count) || count <= 0) {
    return 0
  }

  return Math.min(99, Math.floor(count))
}

export const APP_BADGE_REFRESH_EVENT = 'shadowchat:app-badge-refresh'

export interface AppBadgeState {
  total: number
  dm: number
  group: number
  interactions: number
  connections: number
  shadow_pin: number
}

const EMPTY_BADGE_STATE: AppBadgeState = {
  total: 0,
  dm: 0,
  group: 0,
  interactions: 0,
  connections: 0,
  shadow_pin: 0,
}

const postMessageToServiceWorker = async (message: Record<string, unknown>) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  navigator.serviceWorker.controller?.postMessage(message)

  try {
    const registration = await navigator.serviceWorker.getRegistration?.()
    registration?.active?.postMessage(message)
  } catch {
    // Service worker messaging is best-effort and should never block chat.
  }
}

const postBadgeCountToServiceWorker = async (count: number) => {
  await postMessageToServiceWorker({
    type: 'SHADOWCHAT_BADGE_UPDATE',
    count,
  })
}

const postServiceWorkerMessage = async (message: Record<string, unknown>) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return
  }

  await postMessageToServiceWorker(message)
}

export const updateAppBadge = async (count: number) => {
  const normalizedCount = normalizeBadgeCount(count)

  if (typeof navigator === 'undefined') {
    return
  }

  const badgeNavigator = navigator as BadgeNavigator

  try {
    if (normalizedCount > 0 && badgeNavigator.setAppBadge) {
      await badgeNavigator.setAppBadge(normalizedCount)
    } else if (normalizedCount === 0 && badgeNavigator.clearAppBadge) {
      await badgeNavigator.clearAppBadge()
    }
  } catch {
    // Some platforms expose the API but still reject depending on install or OS settings.
  }

  await postBadgeCountToServiceWorker(normalizedCount)
}

export const clearDMNotifications = async (
  conversationId: string,
  messageId?: string,
  messageIds?: string[]
) => {
  await postServiceWorkerMessage({
    type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
    notificationType: 'dm_message',
    conversationId,
    ...(messageId ? { messageId } : {}),
    ...(messageIds?.length ? { messageIds } : {}),
  })
}

export const clearGroupNotifications = async (
  messageId?: string,
  messageIds?: string[],
  threadId?: string
) => {
  await postServiceWorkerMessage({
    type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
    notificationType: 'group_message',
    ...(messageId ? { messageId } : {}),
    ...(messageIds?.length ? { messageIds } : {}),
    ...(threadId ? { threadId } : {}),
  })
}

export const fetchUnreadAppBadgeCount = async () => {
  const workingClient = await getWorkingClient()
  const {
    data: { user },
    error: userError,
  } = await workingClient.auth.getUser()

  if (userError || !user) {
    return 0
  }

  const { data, error } = await workingClient.rpc('get_app_badge_state', {
    target_user_id: user.id,
  })

  if (error) {
    throw error
  }

  const state = data && typeof data === 'object'
    ? data as Partial<AppBadgeState>
    : EMPTY_BADGE_STATE
  return normalizeBadgeCount(Number(state.total ?? 0))
}

export const refreshAppBadge = async (fallbackCount = 0) => {
  try {
    const count = await fetchUnreadAppBadgeCount()
    await updateAppBadge(count)
    return count
  } catch {
    await updateAppBadge(fallbackCount)
    return normalizeBadgeCount(fallbackCount)
  }
}

export const requestAppBadgeRefresh = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(APP_BADGE_REFRESH_EVENT))
}
