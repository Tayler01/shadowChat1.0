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
    listeners,
    notifications,
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

  it('leaves launcher badge painting to the foreground page', async () => {
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
    expect(setAppBadge).not.toHaveBeenCalled()

    listeners.message({
      data: {
        count: 0,
        type: 'SHADOWCHAT_BADGE_UPDATE',
      },
      waitUntil: (task: Promise<unknown>) => pending.push(task),
    })

    await flushPromises()
    expect(clearAppBadge).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(3000)
    await Promise.allSettled(pending)

    expect(setAppBadge).not.toHaveBeenCalled()
    expect(clearAppBadge).not.toHaveBeenCalled()
  })

  it('does not invoke worker badge APIs during repeated pushes', async () => {
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
    pushBadge(2)
    await flushPromises()

    await jest.advanceTimersByTimeAsync(3000)
    await Promise.allSettled(pending)

    expect(setAppBadge).not.toHaveBeenCalled()
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
