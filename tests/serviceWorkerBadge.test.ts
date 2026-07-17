import { readFileSync } from 'node:fs'
import vm from 'node:vm'

type ListenerMap = Record<string, (event: any) => void>

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const loadServiceWorker = (options: { caches?: unknown } = {}) => {
  const listeners: ListenerMap = {}
  const setAppBadge = jest.fn().mockResolvedValue(undefined)
  const clearAppBadge = jest.fn().mockResolvedValue(undefined)
  const notifications: Array<{
    close: jest.Mock
    data?: Record<string, unknown>
    tag?: string
  }> = []

  const selfMock = {
    addEventListener: jest.fn((type: string, listener: (event: any) => void) => {
      listeners[type] = listener
    }),
    clients: {
      claim: jest.fn().mockResolvedValue(undefined),
      matchAll: jest.fn().mockResolvedValue([]),
      openWindow: jest.fn().mockResolvedValue(undefined),
    },
    location: {
      origin: 'https://shadowchat.test',
    },
    navigator: {
      setAppBadge,
      clearAppBadge,
    },
    registration: {
      getNotifications: jest.fn().mockImplementation(() => Promise.resolve(notifications)),
      showNotification: jest.fn().mockResolvedValue(undefined),
    },
    skipWaiting: jest.fn().mockResolvedValue(undefined),
  }

  const context = vm.createContext({
    caches: options.caches,
    clearTimeout,
    navigator: selfMock.navigator,
    Promise,
    self: selfMock,
    setTimeout,
    URL,
  })

  vm.runInContext(readFileSync('public/sw.js', 'utf8'), context)

  return {
    clearAppBadge,
    clients: selfMock.clients,
    listeners,
    notifications,
    showNotification: selfMock.registration.showNotification,
    setAppBadge,
  }
}

describe('service worker app badge handling', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('applies push badge counts in the worker and clears them on page sync', async () => {
    const { clearAppBadge, listeners, setAppBadge } = loadServiceWorker()
    const pending: Promise<unknown>[] = []

    listeners.push({
      data: {
        json: () => ({
          badgeCount: 1,
          body: 'New DM',
          title: 'Shadow Chat',
          type: 'dm_message',
        }),
      },
      waitUntil: (task: Promise<unknown>) => pending.push(task),
    })

    await flushPromises()
    expect(setAppBadge).toHaveBeenCalledWith(1)

    listeners.message({
      data: {
        count: 0,
        type: 'SHADOWCHAT_BADGE_UPDATE',
      },
      waitUntil: (task: Promise<unknown>) => pending.push(task),
    })

    await flushPromises()
    expect(clearAppBadge).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(3000)
    await Promise.allSettled(pending)

    expect(setAppBadge).toHaveBeenCalled()
    expect(clearAppBadge).toHaveBeenCalledTimes(1)
  })

  it('uses the latest capped badge count during repeated pushes', async () => {
    const { listeners, setAppBadge } = loadServiceWorker()
    const pending: Promise<unknown>[] = []

    const pushBadge = (count: number) => {
      listeners.push({
        data: {
          json: () => ({
            badgeCount: count,
            body: 'New DM',
            title: 'Shadow Chat',
            type: 'dm_message',
          }),
        },
        waitUntil: (task: Promise<unknown>) => pending.push(task),
      })
    }

    pushBadge(1)
    await flushPromises()
    pushBadge(120)
    await flushPromises()

    await jest.advanceTimersByTimeAsync(3000)
    await Promise.allSettled(pending)

    expect(setAppBadge).toHaveBeenCalledWith(1)
    expect(setAppBadge).toHaveBeenCalledWith(99)
  })

  it('suppresses every push type when a same-origin app window is visible', async () => {
    const { clients, listeners, showNotification } = loadServiceWorker()
    const postMessage = jest.fn()
    clients.matchAll.mockResolvedValueOnce([{
      url: 'https://shadowchat.test/?view=chat',
      visibilityState: 'visible',
      postMessage,
    }])
    const pending: Promise<unknown>[] = []

    listeners.push({
      data: {
        json: () => ({
          title: 'New DM',
          data: { type: 'dm_message', url: '/?view=dms' },
        }),
      },
      waitUntil: (task: Promise<unknown>) => pending.push(task),
    })

    await Promise.allSettled(pending)
    expect(showNotification).not.toHaveBeenCalled()
    expect(postMessage).toHaveBeenCalledWith({
      type: 'SHADOWCHAT_FOREGROUND_PUSH_SUPPRESSED',
      data: { type: 'dm_message', url: '/?view=dms' },
    })
  })

  it('closes only DM notifications for the conversation that was read', async () => {
    const { listeners, notifications } = loadServiceWorker()
    const closeReadConversation = jest.fn()
    const closeOtherConversation = jest.fn()
    const closeGroup = jest.fn()
    const pending: Promise<unknown>[] = []

    notifications.push(
      {
        close: closeReadConversation,
        data: {
          conversationId: 'conversation-a',
          messageId: 'message-a',
          type: 'dm_message',
        },
        tag: 'dm:conversation-a',
      },
      {
        close: closeOtherConversation,
        data: {
          conversationId: 'conversation-b',
          messageId: 'message-b',
          type: 'dm_message',
        },
        tag: 'dm:conversation-b',
      },
      {
        close: closeGroup,
        data: {
          messageId: 'group-message',
          type: 'group_message',
        },
        tag: 'group:global',
      }
    )

    listeners.message({
      data: {
        conversationId: 'conversation-a',
        notificationType: 'dm_message',
        type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
      },
      waitUntil: (task: Promise<unknown>) => pending.push(task),
    })

    await Promise.allSettled(pending)

    expect(closeReadConversation).toHaveBeenCalledTimes(1)
    expect(closeOtherConversation).not.toHaveBeenCalled()
    expect(closeGroup).not.toHaveBeenCalled()
  })

  it('closes group notifications without closing DM notifications', async () => {
    const { listeners, notifications } = loadServiceWorker()
    const closeGroup = jest.fn()
    const closeBridgeGroup = jest.fn()
    const closeDM = jest.fn()
    const closeUnknown = jest.fn()
    const pending: Promise<unknown>[] = []

    notifications.push(
      {
        close: closeGroup,
        data: {
          messageId: 'group-message-a',
          type: 'group_message',
        },
        tag: 'group:group-message-a',
      },
      {
        close: closeBridgeGroup,
        data: {
          messageId: 'group-message-b',
          type: 'group_message',
        },
        tag: 'bridge-group:group-message-b',
      },
      {
        close: closeDM,
        data: {
          conversationId: 'conversation-a',
          messageId: 'dm-message-a',
          type: 'dm_message',
        },
        tag: 'dm:conversation-a',
      },
      {
        close: closeUnknown,
        data: {},
        tag: 'misc',
      }
    )

    listeners.message({
      data: {
        notificationType: 'group_message',
        type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
      },
      waitUntil: (task: Promise<unknown>) => pending.push(task),
    })

    await Promise.allSettled(pending)

    expect(closeGroup).toHaveBeenCalledTimes(1)
    expect(closeBridgeGroup).toHaveBeenCalledTimes(1)
    expect(closeDM).not.toHaveBeenCalled()
    expect(closeUnknown).not.toHaveBeenCalled()
  })

  it('closes only the presented message ids when advancing a partial read cursor', async () => {
    const { listeners, notifications } = loadServiceWorker()
    const closePresented = jest.fn()
    const closeStillUnread = jest.fn()
    const pending: Promise<unknown>[] = []

    notifications.push(
      { close: closePresented, data: { messageId: 'm-seen', type: 'group_message' }, tag: 'group:m-seen' },
      { close: closeStillUnread, data: { messageId: 'm-new', type: 'group_message' }, tag: 'group:m-new' }
    )
    listeners.message({
      data: {
        messageIds: ['m-seen'],
        notificationType: 'group_message',
        type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
      },
      waitUntil: (task: Promise<unknown>) => pending.push(task),
    })

    await Promise.allSettled(pending)
    expect(closePresented).toHaveBeenCalledTimes(1)
    expect(closeStillUnread).not.toHaveBeenCalled()
  })

  it('closes only the requested Shadow Checkers turn notification', async () => {
    const { listeners, notifications } = loadServiceWorker()
    const closeRequested = jest.fn()
    const closeOther = jest.fn()
    const pending: Promise<unknown>[] = []

    notifications.push(
      {
        close: closeRequested,
        data: { eventId: 'event-a', matchId: 'match-a', type: 'shadow_checkers_turn' },
        tag: 'shadow-checkers-turn:match-a',
      },
      {
        close: closeOther,
        data: { eventId: 'event-b', matchId: 'match-b', type: 'shadow_checkers_turn' },
        tag: 'shadow-checkers-turn:match-b',
      }
    )

    listeners.message({
      data: {
        eventId: 'event-a',
        matchId: 'match-a',
        notificationType: 'shadow_checkers_turn',
        type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
      },
      waitUntil: (task: Promise<unknown>) => pending.push(task),
    })

    await Promise.allSettled(pending)
    expect(closeRequested).toHaveBeenCalledTimes(1)
    expect(closeOther).not.toHaveBeenCalled()
  })

  it('closes only notifications for the Shado Live room that was opened', async () => {
    const { listeners, notifications } = loadServiceWorker()
    const closeRequested = jest.fn()
    const closeOther = jest.fn()
    const pending: Promise<unknown>[] = []

    notifications.push(
      {
        close: closeRequested,
        data: { eventId: 'live-a', roomId: 'room-a', type: 'shado_live_room_started' },
        tag: 'shado-live:room-a',
      },
      {
        close: closeOther,
        data: { eventId: 'live-b', roomId: 'room-b', type: 'shado_live_room_started' },
        tag: 'shado-live:room-b',
      }
    )

    listeners.message({
      data: {
        roomId: 'room-a',
        type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
      },
      waitUntil: (task: Promise<unknown>) => pending.push(task),
    })

    await Promise.allSettled(pending)
    expect(closeRequested).toHaveBeenCalledTimes(1)
    expect(closeOther).not.toHaveBeenCalled()
  })

  it('classifies targeted and reaction notifications by their active chat surface', async () => {
    const { listeners, notifications } = loadServiceWorker()
    const closeMention = jest.fn()
    const closeReply = jest.fn()
    const closeGroupReaction = jest.fn()
    const closeDmReaction = jest.fn()
    const pending: Promise<unknown>[] = []

    notifications.push(
      { close: closeMention, data: { type: 'mention', messageId: 'm1' }, tag: 'group:m1' },
      { close: closeReply, data: { type: 'reply', messageId: 'm2' }, tag: 'group:m2' },
      { close: closeGroupReaction, data: { type: 'reaction', isDm: false, messageId: 'm3' }, tag: 'reaction:group:m3' },
      { close: closeDmReaction, data: { type: 'reaction', isDm: true, conversationId: 'c1', messageId: 'm4' }, tag: 'reaction:dm:m4' }
    )

    listeners.message({
      data: {
        notificationType: 'group_message',
        type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
      },
      waitUntil: (task: Promise<unknown>) => pending.push(task),
    })

    await Promise.allSettled(pending)

    expect(closeMention).toHaveBeenCalledTimes(1)
    expect(closeReply).toHaveBeenCalledTimes(1)
    expect(closeGroupReaction).toHaveBeenCalledTimes(1)
    expect(closeDmReaction).not.toHaveBeenCalled()
  })

  it('cleans up old static asset caches on activation', async () => {
    const caches = {
      delete: jest.fn().mockResolvedValue(true),
      keys: jest.fn().mockResolvedValue([
        'shadowchat-static-assets-v0',
        'shadowchat-static-assets-v1',
        'other-cache',
      ]),
    }
    const { listeners } = loadServiceWorker({ caches })
    const pending: Promise<unknown>[] = []

    listeners.activate({
      waitUntil: (task: Promise<unknown>) => pending.push(task),
    })

    await Promise.allSettled(pending)

    expect(caches.delete).toHaveBeenCalledTimes(2)
    expect(caches.delete).toHaveBeenCalledWith('shadowchat-static-assets-v0')
    expect(caches.delete).toHaveBeenCalledWith('shadowchat-static-assets-v1')
  })
})
