import { getWorkingClient } from './supabase'

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

const normalizeBadgeCount = (count: number) => {
  if (!Number.isFinite(count) || count <= 0) {
    return 0
  }

  return Math.floor(count)
}

const postBadgeCountToServiceWorker = async (count: number) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  const message = {
    type: 'SHADOWCHAT_BADGE_UPDATE',
    count,
  }

  navigator.serviceWorker.controller?.postMessage(message)

  try {
    const registration = await navigator.serviceWorker.ready
    registration.active?.postMessage(message)
  } catch {
    // Badge support is best-effort and should never block chat.
  }
}

const postServiceWorkerMessage = async (message: Record<string, unknown>) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  navigator.serviceWorker.controller?.postMessage(message)

  try {
    const registration = await navigator.serviceWorker.ready
    registration.active?.postMessage(message)
  } catch {
    // Service worker messaging is best-effort and should never block chat.
  }
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

export const clearDMNotifications = async (conversationId: string, messageId?: string) => {
  await postServiceWorkerMessage({
    type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
    notificationType: 'dm_message',
    conversationId,
    ...(messageId ? { messageId } : {}),
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

  const { data, error } = await workingClient.rpc('count_unread_dm_messages', {
    target_user_id: user.id,
  })

  if (error) {
    throw error
  }

  return normalizeBadgeCount(Number(data ?? 0))
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
