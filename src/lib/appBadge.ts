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
