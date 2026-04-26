import { readFileSync } from 'node:fs'
import vm from 'node:vm'

type ListenerMap = Record<string, (event: any) => void>

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const loadServiceWorker = () => {
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

  it('does not repaint a stale Android launcher badge after the app clears unread DMs', async () => {
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
    expect(setAppBadge).toHaveBeenCalledTimes(1)
    expect(setAppBadge).toHaveBeenLastCalledWith(1)

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

    expect(setAppBadge).toHaveBeenCalledTimes(1)
    expect(clearAppBadge).toHaveBeenCalledTimes(1)
  })

  it('lets a newer push supersede older delayed badge retries', async () => {
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

    expect(setAppBadge).toHaveBeenCalledWith(1)
    expect(setAppBadge).toHaveBeenCalledWith(2)
    expect(setAppBadge.mock.calls.filter(([count]) => count === 1)).toHaveLength(1)
    expect(setAppBadge.mock.calls.filter(([count]) => count === 2)).toHaveLength(3)
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
})
