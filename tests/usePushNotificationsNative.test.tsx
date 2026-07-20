import { act, renderHook, waitFor } from '@testing-library/react'

import { usePushNotifications } from '../src/hooks/usePushNotifications'
import { useAuth } from '../src/hooks/useAuth'
import {
  fetchNotificationPreferences,
  getNotificationPermission,
} from '../src/lib/push'
import {
  requestNativeNotificationEnable,
  requestNativeNotificationState,
  subscribeToNativeNotificationState,
  type NativeNotificationState,
} from '../src/lib/nativeAppBridge'
import { supabase } from '../src/lib/supabase'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../src/lib/push', () => ({
  disablePushForCurrentDevice: jest.fn(),
  enablePushForCurrentDevice: jest.fn(),
  fetchNotificationPreferences: jest.fn(),
  getDefaultNotificationPreferences: jest.fn((userId: string) => ({
    user_id: userId,
  })),
  getNotificationGuidance: jest.fn(() => 'supported'),
  getNotificationGuidanceText: jest.fn(() => ''),
  getNotificationPermission: jest.fn(() => 'unsupported'),
  getPushSupportStatus: jest.fn(() => ({
    supported: false,
    canPrompt: false,
    reason: 'Browser notifications are unavailable.',
  })),
  syncCurrentDeviceSubscription: jest.fn(),
  upsertNotificationPreferences: jest.fn(),
}))

jest.mock('../src/lib/nativeAppBridge', () => ({
  isNativeAppWebView: jest.fn(() => true),
  openNativeNotificationSettings: jest.fn(() => true),
  requestNativeNotificationDisable: jest.fn(),
  requestNativeNotificationEnable: jest.fn(),
  requestNativeNotificationState: jest.fn(),
  subscribeToNativeNotificationState: jest.fn(),
}))

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}))

const mockedUseAuth = useAuth as jest.Mock
const mockedFetchNotificationPreferences =
  fetchNotificationPreferences as jest.Mock
const mockedGetNotificationPermission =
  getNotificationPermission as jest.Mock
const mockedRequestNativeNotificationEnable =
  requestNativeNotificationEnable as jest.Mock
const mockedRequestNativeNotificationState =
  requestNativeNotificationState as jest.Mock
const mockedSubscribeToNativeNotificationState =
  subscribeToNativeNotificationState as jest.Mock
const mockedGetSession = supabase.auth.getSession as jest.Mock

const user = { id: '11111111-1111-4111-8111-111111111111' }
const session = {
  access_token: 'access-token-value-long-enough-for-native-bridge',
  refresh_token: 'refresh-token-value-long-enough-for-native-bridge',
  expires_at: 1_900_000_000,
  user,
}

let nativeStateListener:
  | ((state: NativeNotificationState) => void)
  | null = null

describe('usePushNotifications in the native container', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    nativeStateListener = null
    mockedUseAuth.mockReturnValue({ user })
    mockedFetchNotificationPreferences.mockResolvedValue({ user_id: user.id })
    mockedGetSession.mockResolvedValue({
      data: { session },
      error: null,
    })
    mockedSubscribeToNativeNotificationState.mockImplementation(
      (listener: (state: NativeNotificationState) => void) => {
        nativeStateListener = listener
        return jest.fn()
      }
    )
  })

  it('preserves a denied native permission instead of replacing it with unsupported', async () => {
    const deniedState: NativeNotificationState = {
      enabled: false,
      permission: 'denied',
      busy: false,
      error: null,
    }
    mockedRequestNativeNotificationEnable.mockImplementation(async () => {
      nativeStateListener?.(deniedState)
      return deniedState
    })

    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))
    mockedGetNotificationPermission.mockClear()

    await act(async () => {
      await expect(result.current.enablePush()).rejects.toThrow(
        'Notifications are disabled in your phone settings.'
      )
    })

    expect(result.current.permission).toBe('denied')
    expect(result.current.subscribed).toBe(false)
    expect(mockedGetNotificationPermission).not.toHaveBeenCalled()
    expect(mockedRequestNativeNotificationState).toHaveBeenCalled()
  })

  it('never sends a signed-out enable command while the web session is still syncing', async () => {
    mockedGetSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    })

    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await expect(result.current.enablePush()).rejects.toThrow(
        'Your secure ShadoChat session is still syncing.'
      )
    })

    expect(mockedRequestNativeNotificationEnable).not.toHaveBeenCalled()
    expect(mockedRequestNativeNotificationState).toHaveBeenCalled()
  })
})
