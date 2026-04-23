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
  const count = payload.badgeCount ?? payload.unreadCount ?? payload.data?.badgeCount ?? payload.data?.unreadCount
  if (count === undefined || count === null) {
    return null
  }

  return normalizeBadgeCount(count)
}

const updateAppBadge = async (count) => {
  if (!self.navigator) {
    return
  }

  const normalizedCount = normalizeBadgeCount(count)

  try {
    if (normalizedCount > 0 && 'setAppBadge' in self.navigator) {
      await self.navigator.setAppBadge(normalizedCount)
    } else if (normalizedCount === 0 && 'clearAppBadge' in self.navigator) {
      await self.navigator.clearAppBadge()
    }
  } catch {
    // Badging is best-effort; notification delivery should continue.
  }
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
    icon: payload.icon || '/icons/icon-192.svg',
    badge: payload.badge || '/icons/badge.svg',
    tag: payload.tag || undefined,
    data: payload.data || payload,
  }

  const tasks = [self.registration.showNotification(title, options)]
  const badgeCount = getPayloadBadgeCount(payload)
  if (badgeCount !== null) {
    tasks.push(updateAppBadge(badgeCount))
  }

  event.waitUntil(Promise.all(tasks))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const targetUrl = data.url || data.route || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl)
          }
          return client.focus()
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
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
  }
})
