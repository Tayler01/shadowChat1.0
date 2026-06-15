import { render, waitFor } from '@testing-library/react'
import { PushSubscriptionSync } from '../src/components/notifications/PushSubscriptionSync'
import { useAuth } from '../src/hooks/useAuth'
import {
  getNotificationPermission,
  getPushSupportStatus,
  syncCurrentDeviceSubscription,
} from '../src/lib/push'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../src/lib/push', () => ({
  getNotificationPermission: jest.fn(),
  getPushSupportStatus: jest.fn(),
  syncCurrentDeviceSubscription: jest.fn(),
}))

const mockedUseAuth = useAuth as jest.Mock
const mockedGetNotificationPermission = getNotificationPermission as jest.Mock
const mockedGetPushSupportStatus = getPushSupportStatus as jest.Mock
const mockedSyncCurrentDeviceSubscription = syncCurrentDeviceSubscription as jest.Mock

const syncStorageKey = 'shadowchat:push-subscription-sync:user-1'

const setVisibleDocument = () => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
}

describe('PushSubscriptionSync', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.localStorage.clear()
    setVisibleDocument()
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1' } })
    mockedGetNotificationPermission.mockReturnValue('granted')
    mockedGetPushSupportStatus.mockReturnValue({
      supported: true,
      canPrompt: true,
      reason: null,
    })
    mockedSyncCurrentDeviceSubscription.mockResolvedValue(true)
  })

  it('repairs an already-granted push subscription after sign in', async () => {
    render(<PushSubscriptionSync />)

    await waitFor(() => {
      expect(mockedSyncCurrentDeviceSubscription).toHaveBeenCalledWith('user-1')
    })
    expect(Number(window.localStorage.getItem(syncStorageKey))).toBeGreaterThan(0)
  })

  it('does not prompt or sync before permission is granted', async () => {
    mockedGetNotificationPermission.mockReturnValue('default')

    render(<PushSubscriptionSync />)
    await Promise.resolve()

    expect(mockedSyncCurrentDeviceSubscription).not.toHaveBeenCalled()
  })

  it('does not sync when the platform cannot support push', async () => {
    mockedGetPushSupportStatus.mockReturnValue({
      supported: false,
      canPrompt: false,
      reason: 'Push notifications are not supported on this device.',
    })

    render(<PushSubscriptionSync />)
    await Promise.resolve()

    expect(mockedSyncCurrentDeviceSubscription).not.toHaveBeenCalled()
  })

  it('throttles recent successful syncs', async () => {
    window.localStorage.setItem(syncStorageKey, String(Date.now()))

    render(<PushSubscriptionSync />)
    window.dispatchEvent(new Event('focus'))
    await Promise.resolve()

    expect(mockedSyncCurrentDeviceSubscription).not.toHaveBeenCalled()
  })

  it('syncs again on foreground resume after the saved sync is stale', async () => {
    const staleSync = Date.now() - 7 * 60 * 60 * 1000
    window.localStorage.setItem(syncStorageKey, String(staleSync))

    render(<PushSubscriptionSync />)

    await waitFor(() => {
      expect(mockedSyncCurrentDeviceSubscription).toHaveBeenCalledTimes(1)
    })
  })
})
