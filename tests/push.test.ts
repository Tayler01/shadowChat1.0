import { enablePushForCurrentDevice, syncCurrentDeviceSubscription } from '../src/lib/push'

const currentVapidKey = new Uint8Array([1, 2, 3, 4]).buffer
const staleVapidKey = new Uint8Array([9, 9, 9, 9]).buffer

const createSubscription = (key: ArrayBuffer | null, expirationTime: number | null = null) => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
  expirationTime,
  options: {
    applicationServerKey: key,
  },
  toJSON: () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
    keys: {
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    },
  }),
  unsubscribe: jest.fn(async () => true),
})

describe('push subscription renewal', () => {
  const subscribe = jest.fn()
  const getSubscription = jest.fn()
  const register = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()

    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    })

    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: function PushManager() {},
    })

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'granted',
        requestPermission: jest.fn(async () => 'granted'),
      },
    })

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register,
      },
    })

    register.mockResolvedValue({
      pushManager: {
        getSubscription,
        subscribe,
      },
    })

    subscribe.mockResolvedValue(createSubscription(currentVapidKey))
  })

  it('reuses a current VAPID subscription', async () => {
    const existing = createSubscription(currentVapidKey)
    getSubscription.mockResolvedValue(existing)

    await enablePushForCurrentDevice('user-1')

    expect(existing.unsubscribe).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('replaces a stale VAPID subscription before syncing Android-style endpoints', async () => {
    const existing = createSubscription(staleVapidKey)
    getSubscription.mockResolvedValue(existing)

    await enablePushForCurrentDevice('user-1')

    expect(existing.unsubscribe).toHaveBeenCalled()
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3, 4]),
    })
  })

  it('repairs stale subscriptions during background sync after permission is granted', async () => {
    const existing = createSubscription(staleVapidKey)
    getSubscription.mockResolvedValue(existing)

    await expect(syncCurrentDeviceSubscription('user-1')).resolves.toBe(true)

    expect(existing.unsubscribe).toHaveBeenCalled()
    expect(subscribe).toHaveBeenCalled()
  })
})
