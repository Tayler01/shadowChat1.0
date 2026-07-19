const STATIC_ASSET_CACHE = 'shadowchat-static-assets-v5'
const STATIC_ASSET_CACHE_PREFIX = 'shadowchat-static-assets-'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

const cleanupOldStaticAssetCaches = async () => {
  if (typeof caches === 'undefined' || !caches.keys || !caches.delete) {
    return
  }

  const cacheNames = await caches.keys()
  await Promise.all(
    cacheNames
      .filter((cacheName) => (
        cacheName.startsWith(STATIC_ASSET_CACHE_PREFIX) &&
        cacheName !== STATIC_ASSET_CACHE
      ))
      .map((cacheName) => caches.delete(cacheName))
  )
}

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    cleanupOldStaticAssetCaches(),
  ]))
})

const normalizeBadgeCount = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0
  }

  return Math.min(99, Math.floor(numeric))
}

const getPayloadBadgeCount = (payload) => {
  const count = payload.badgeCount ?? payload.unreadCount ?? payload.data?.badgeCount ?? payload.data?.unreadCount
  if (count === undefined || count === null) {
    return null
  }

  return normalizeBadgeCount(count)
}

const asObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
)

const asBoundedString = (value, maxLength) => (
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : null
)

const normalizeSameOriginRoute = (value) => {
  const candidate = asBoundedString(value, 1024)
  if (!candidate) return '/'
  try {
    const parsed = new URL(candidate, self.location.origin)
    if (
      parsed.origin !== self.location.origin ||
      !parsed.pathname.startsWith('/') ||
      parsed.pathname.startsWith('//')
    ) {
      return '/'
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/'
  }
}

const normalizeEnvelopeV2 = (payload) => {
  const data = asObject(payload.data)
  const candidate = asObject(
    payload.envelopeV2 ??
    data.envelopeV2 ??
    data.notificationEnvelopeV2
  )
  if (
    candidate.schemaVersion !== 2 ||
    typeof candidate.eventId !== 'string' ||
    typeof candidate.type !== 'string' ||
    typeof candidate.groupKey !== 'string'
  ) {
    return null
  }

  const expiresAt = Date.parse(candidate.expiresAt)
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    return { expired: true }
  }

  const content = asObject(candidate.content)
  const actor = asObject(candidate.actor)
  const media = asObject(candidate.media)
  const eventIds = Array.isArray(candidate.eventIds)
    ? candidate.eventIds.filter(value => typeof value === 'string').slice(0, 32)
    : [candidate.eventId]
  const actionKeys = Array.isArray(candidate.actions)
    ? candidate.actions.filter(value => value === 'open' || value === 'mark_read')
    : []

  return {
    expired: false,
    eventId: candidate.eventId,
    eventIds: eventIds.length ? eventIds : [candidate.eventId],
    type: candidate.type,
    category: asBoundedString(candidate.category, 64) || 'system',
    entityId: asBoundedString(candidate.entityId, 128),
    route: normalizeSameOriginRoute(candidate.route),
    groupKey: asBoundedString(candidate.groupKey, 160) || `notification:${candidate.eventId}`,
    priority: asBoundedString(candidate.priority, 16) || 'normal',
    title: asBoundedString(content.title, 120) || 'ShadowChat',
    body: asBoundedString(content.body, 240) || '',
    icon: asBoundedString(actor.avatarUrl, 2048),
    image: asBoundedString(media.thumbnailUrl, 2048),
    actions: actionKeys,
    soundId: asBoundedString(candidate.soundId, 64) || 'system_default',
    createdAt: asBoundedString(candidate.createdAt, 64),
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let badgeUpdateVersion = 0

const applyAppBadge = async (count) => {
  try {
    if (count > 0 && typeof self.navigator?.setAppBadge === 'function') {
      await self.navigator.setAppBadge(count)
    } else if (count === 0 && typeof self.navigator?.clearAppBadge === 'function') {
      await self.navigator.clearAppBadge()
    }
  } catch {
    // Badging is best-effort: install state and OS policy can still reject it.
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
      (notificationType === 'reaction' && data.isDm === true) ||
      tag.startsWith('dm:') ||
      tag.startsWith('bridge-dm:') ||
      tag.startsWith('reaction:dm:')

    if (!isDM) {
      return false
    }
  } else if (request.notificationType === 'group_message') {
    const isGroup =
      notificationType === 'group_message' ||
      notificationType === 'mention' ||
      notificationType === 'reply' ||
      (notificationType === 'reaction' && data.isDm !== true) ||
      tag.startsWith('group:') ||
      tag.startsWith('bridge-group:') ||
      tag.startsWith('reaction:group:')

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

  if (Array.isArray(request.messageIds) && request.messageIds.length > 0 && !request.messageIds.includes(data.messageId)) {
    return false
  }

  if (request.threadId && data.threadId !== request.threadId) {
    return false
  }

  if (request.eventId && data.eventId !== request.eventId) {
    return false
  }

  if (request.imageId && data.imageId !== request.imageId) {
    return false
  }

  if (request.commentId && data.commentId !== request.commentId) {
    return false
  }

  if (request.matchId && data.matchId !== request.matchId) {
    return false
  }

  if (request.roomId && data.roomId !== request.roomId) {
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

  event.waitUntil((async () => {
    const data = payload.data || payload
    const envelopeV2 = normalizeEnvelopeV2(payload)
    if (envelopeV2?.expired) return
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const visibleAppClients = clients.filter((client) => {
      try {
        return client.visibilityState === 'visible' && new URL(client.url).origin === self.location.origin
      } catch {
        return false
      }
    })
    if (visibleAppClients.length > 0) {
      visibleAppClients.forEach((client) => {
        if ('postMessage' in client) {
          client.postMessage({
            type: 'SHADOWCHAT_FOREGROUND_PUSH_SUPPRESSED',
            data,
          })
        }
      })
      return
    }

    const title = envelopeV2?.title || payload.title || 'Shadow Chat'
    const notificationData = envelopeV2
      ? {
          ...data,
          type: envelopeV2.type,
          eventId: envelopeV2.eventId,
          eventIds: envelopeV2.eventIds,
          entityId: envelopeV2.entityId,
          route: envelopeV2.route,
          url: envelopeV2.route,
          category: envelopeV2.category,
          envelopeV2,
        }
      : data
    const options = {
      body: envelopeV2?.body || payload.body || '',
      icon: envelopeV2?.icon || payload.icon || '/icons/app-icon-192.png',
      badge: payload.badge || '/icons/badge.svg',
      image: envelopeV2?.image || payload.image || undefined,
      tag: envelopeV2?.groupKey || payload.tag || undefined,
      timestamp: envelopeV2?.createdAt
        ? Date.parse(envelopeV2.createdAt)
        : undefined,
      renotify: envelopeV2?.priority === 'urgent',
      silent: envelopeV2?.soundId === 'silent',
      actions: envelopeV2?.actions.includes('mark_read')
        ? [{ action: 'mark_read', title: 'Mark read' }]
        : undefined,
      data: notificationData,
    }

    const tasks = [self.registration.showNotification(title, options)]
    const badgeCount = getPayloadBadgeCount(payload)
    if (badgeCount !== null) {
      tasks.push(settleAppBadge(badgeCount))
    }
    await Promise.allSettled(tasks)
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const envelopeV2 = data.envelopeV2 && data.envelopeV2.schemaVersion === 2
    ? data.envelopeV2
    : null
  const action = event.action === 'mark_read' ? 'mark_read' : 'open'
  let targetUrl = envelopeV2
    ? normalizeSameOriginRoute(envelopeV2.route)
    : data.url || data.route || '/'
  if (!envelopeV2 && data.type === 'dm_message' && data.conversationId && data.messageId) {
    targetUrl = `/?view=dms&conversation=${encodeURIComponent(data.conversationId)}&message=${encodeURIComponent(data.messageId)}`
  } else if (!envelopeV2 && (
    (data.type === 'group_message' || data.type === 'mention' || data.type === 'reply') &&
    data.messageId
  )) {
    targetUrl = `/?view=chat&message=${encodeURIComponent(data.messageId)}`
  } else if (!envelopeV2 && data.type === 'reaction' && data.messageId) {
    targetUrl = data.isDm && data.conversationId
      ? `/?view=dms&conversation=${encodeURIComponent(data.conversationId)}&message=${encodeURIComponent(data.messageId)}`
      : `/?view=chat&message=${encodeURIComponent(data.messageId)}`
  } else if (!envelopeV2 && data.type === 'hype_event') {
    targetUrl = data.messageId
      ? `/?view=chat&message=${encodeURIComponent(data.messageId)}`
      : '/?view=chat'
  } else if (!envelopeV2 && data.type === 'presence_active') {
    targetUrl = '/?view=active-users'
  } else if (!envelopeV2 && (
    (data.type === 'shadow_pin_post' ||
      data.type === 'shadow_pin_comment' ||
      data.type === 'shadow_pin_reply') &&
    data.imageId
  )) {
    targetUrl = `/?view=pins&pin=${encodeURIComponent(data.imageId)}`
    if (data.type !== 'shadow_pin_post') {
      targetUrl += '&panel=comments'
      if (data.commentId) {
        targetUrl += `&comment=${encodeURIComponent(data.commentId)}`
      }
    }
  } else if (!envelopeV2 && data.type === 'shadow_checkers_turn' && data.matchId) {
    targetUrl = `/?view=games&experience=shadow-checkers&item=${encodeURIComponent(data.matchId)}`
  }
  targetUrl = normalizeSameOriginRoute(targetUrl)
  if (action === 'mark_read') {
    const actionUrl = new URL(targetUrl, self.location.origin)
    actionUrl.searchParams.set('notificationAction', 'mark_read')
    const actionEventIds = envelopeV2?.eventIds || data.eventIds || [data.eventId]
    actionUrl.searchParams.set(
      'notificationEvents',
      actionEventIds.filter(value => typeof value === 'string').slice(0, 32).join(',')
    )
    targetUrl = `${actionUrl.pathname}${actionUrl.search}${actionUrl.hash}`
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
      action,
      eventId: envelopeV2?.eventId || data.eventId,
      eventIds: envelopeV2?.eventIds || data.eventIds,
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
