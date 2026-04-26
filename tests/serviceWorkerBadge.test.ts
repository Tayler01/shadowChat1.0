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
})
