self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

const normalizeBadgeCount = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0
  }

  return Math.floor(numeric)
}

const getPayloadBadgeCount = (payload) => {
  const notificationType = payload.type ?? payload.data?.type
  if (notificationType === 'group_message') {
    return null
  }

  const count = payload.badgeCount ?? payload.unreadCount ?? payload.data?.badgeCount ?? payload.data?.unreadCount
  if (count === undefined || count === null) {
    return null
  }

  return normalizeBadgeCount(count)
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let badgeUpdateVersion = 0

const applyAppBadge = async (count) => {
  const badgeNavigator =
    self.navigator ||
    (typeof navigator !== 'undefined' ? navigator : null)

  if (!badgeNavigator) {
    return
  }

  const normalizedCount = normalizeBadgeCount(count)

  try {
    if (normalizedCount > 0 && 'setAppBadge' in badgeNavigator) {
      await badgeNavigator.setAppBadge(normalizedCount)
    } else if (normalizedCount === 0 && 'clearAppBadge' in badgeNavigator) {
      await badgeNavigator.clearAppBadge()
    }
  } catch {
    // Badging is best-effort; notification delivery should continue.
  }
}

const updateAppBadge = async (count) => {
  badgeUpdateVersion += 1
  await applyAppBadge(count)
}

const notificationMatchesClearRequest = (notification, request) => {
  const data = notification.data || {}
  const tag = notification.tag || ''
  const notificationType = data.type

  if (request.notificationType === 'dm_message') {
    const isDM =
      notificationType === 'dm_message' ||
      tag.startsWith('dm:') ||
      tag.startsWith('bridge-dm:')

    if (!isDM) {
      return false
    }
  } else if (request.notificationType === 'group_message') {
    const isGroup =
      notificationType === 'group_message' ||
      tag.startsWith('group:') ||
      tag.startsWith('bridge-group:')

    if (!isGroup) {
      return false
    }
  } else if (request.notificationType && notificationType !== request.notificationType) {
    return false
  }

  if (request.conversationId) {
    const conversationTagMatches =
      tag === `dm:${request.conversationId}` ||
      tag === `bridge-dm:${request.conversationId}`

    if (data.conversationId !== request.conversationId && !conversationTagMatches) {
      return false
    }
  }

  if (request.messageId && data.messageId !== request.messageId) {
    return false
  }

  return true
}

const clearNotifications = async (request = {}) => {
  if (!self.registration.getNotifications) {
    return
  }

  const notifications = await self.registration.getNotifications()
  notifications
    .filter((notification) => notificationMatchesClearRequest(notification, request))
    .forEach((notification) => notification.close())
}

const settleAppBadge = async (count) => {
  const normalizedCount = normalizeBadgeCount(count)
  badgeUpdateVersion += 1
  const settleVersion = badgeUpdateVersion
  await applyAppBadge(normalizedCount)

  if (normalizedCount === 0) {
    return
  }

  // iOS can wake a Home Screen web app service worker in stages after a push.
  // Keeping retries inside waitUntil gives the icon badge more chances to stick.
  await wait(650)
  if (settleVersion !== badgeUpdateVersion) {
    return
  }
  await applyAppBadge(normalizedCount)
  await wait(1800)
  if (settleVersion !== badgeUpdateVersion) {
    return
  }
  await applyAppBadge(normalizedCount)
}

self.addEventListener('push', (event) => {
  let payload = {}

  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Shadow Chat', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Shadow Chat'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/app-icon-192.png',
    badge: payload.badge || '/icons/badge.svg',
    tag: payload.tag || undefined,
    data: payload.data || payload,
  }

  const tasks = [self.registration.showNotification(title, options)]
  const badgeCount = getPayloadBadgeCount(payload)
  if (badgeCount !== null) {
    tasks.push(settleAppBadge(badgeCount))
  }

  event.waitUntil(Promise.allSettled(tasks))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  let targetUrl = data.url || data.route || '/'
  if (data.type === 'dm_message' && data.conversationId && data.messageId) {
    targetUrl = `/?view=dms&conversation=${encodeURIComponent(data.conversationId)}&message=${encodeURIComponent(data.messageId)}`
  } else if (data.type === 'group_message' && data.messageId) {
    targetUrl = `/?view=chat&message=${encodeURIComponent(data.messageId)}`
  }
  const targetHref = new URL(targetUrl, self.location.origin).href

  const sendClickIntent = (client) => {
    if (!client || !('postMessage' in client)) {
      return
    }

    client.postMessage({
      type: 'SHADOWCHAT_NOTIFICATION_CLICK',
      targetUrl,
      targetHref,
      data,
    })
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const appClient = clients.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin
        } catch {
          return false
        }
      })

      if (appClient && 'focus' in appClient) {
        sendClickIntent(appClient)

        let focusedClient = appClient
        if ('navigate' in appClient) {
          try {
            focusedClient = await appClient.navigate(targetHref) || appClient
          } catch {
            focusedClient = appClient
          }
        }

        sendClickIntent(focusedClient)
        return focusedClient.focus()
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetHref)
      }

      return undefined
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  } else if (event.data?.type === 'SHADOWCHAT_BADGE_UPDATE') {
    const task = updateAppBadge(event.data.count)
    if (event.waitUntil) {
      event.waitUntil(task)
    }
  } else if (event.data?.type === 'SHADOWCHAT_NOTIFICATIONS_CLEAR') {
    const task = clearNotifications(event.data)
    if (event.waitUntil) {
      event.waitUntil(task)
    }
  }
})
