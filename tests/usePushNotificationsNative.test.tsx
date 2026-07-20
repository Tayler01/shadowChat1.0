import { act, renderHook, waitFor } from '@testing-library/react'

import { usePushNotifications } from '../src/hooks/usePushNotifications'
import { useAuth } from '../src/hooks/useAuth'
import {
  fetchNotificationPreferences,
  getNotificationPermission,
} from '../src/lib/push'
import {
  createNativeNotificationRequestId,
  prepareNativeNotificationEnrollment,
  requestNativeNotificationEnable,
  requestNativeNotificationState,
  subscribeToNativeNotificationState,
  type NativeNotificationState,
} from '../src/lib/nativeAppBridge'
import { createNativeNotificationEnrollmentTicket } from '../src/lib/nativeNotificationEnrollment'

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
  createNativeNotificationRequestId: jest.fn(),
  isNativeAppWebView: jest.fn(() => true),
  openNativeNotificationSettings: jest.fn(() => true),
  prepareNativeNotificationEnrollment: jest.fn(),
  requestNativeNotificationDisable: jest.fn(),
  requestNativeNotificationEnable: jest.fn(),
  requestNativeNotificationState: jest.fn(),
  subscribeToNativeNotificationState: jest.fn(),
}))

jest.mock('../src/lib/nativeNotificationEnrollment', () => ({
  createNativeNotificationEnrollmentTicket: jest.fn(),
}))

const mockedUseAuth = useAuth as jest.Mock
const mockedFetchNotificationPreferences =
  fetchNotificationPreferences as jest.Mock
const mockedGetNotificationPermission =
  getNotificationPermission as jest.Mock
const mockedRequestNativeNotificationEnable =
  requestNativeNotificationEnable as jest.Mock
const mockedCreateNativeNotificationRequestId =
  createNativeNotificationRequestId as jest.Mock
const mockedPrepareNativeNotificationEnrollment =
  prepareNativeNotificationEnrollment as jest.Mock
const mockedCreateNativeNotificationEnrollmentTicket =
  createNativeNotificationEnrollmentTicket as jest.Mock
const mockedRequestNativeNotificationState =
  requestNativeNotificationState as jest.Mock
const mockedSubscribeToNativeNotificationState =
  subscribeToNativeNotificationState as jest.Mock
const user = { id: '11111111-1111-4111-8111-111111111111' }
const requestId = '22222222-2222-4222-8222-222222222222'
const ticket = `${requestId}.${'a'.repeat(64)}`
const challenge = {
  requestId,
  installationKey: '33333333-3333-4333-8333-333333333333',
  challenge: 'b'.repeat(64),
  credentialChallenge: 'c'.repeat(64),
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
    mockedCreateNativeNotificationRequestId.mockReturnValue(requestId)
    mockedPrepareNativeNotificationEnrollment.mockResolvedValue(challenge)
    mockedCreateNativeNotificationEnrollmentTicket.mockResolvedValue({
      ticket,
      expiresAt: '2099-01-01T00:00:00.000Z',
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
      requestId: 'enable-denied',
      stage: 'failed',
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

  it('uses the authenticated web ticket without waiting for a second native session', async () => {
    const readyState: NativeNotificationState = {
      enabled: true,
      permission: 'granted',
      busy: false,
      error: null,
      requestId,
      stage: 'ready',
    }
    mockedRequestNativeNotificationEnable.mockResolvedValue(readyState)

    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.enablePush()
    })

    expect(mockedPrepareNativeNotificationEnrollment).toHaveBeenCalledWith(requestId)
    expect(mockedCreateNativeNotificationEnrollmentTicket).toHaveBeenCalledWith(
      user.id,
      requestId,
      challenge.installationKey,
      challenge.challenge,
      challenge.credentialChallenge,
    )
    expect(mockedRequestNativeNotificationEnable).toHaveBeenCalledWith(
      requestId,
      ticket,
      user.id,
    )
  })

  it('does not send a native command when secure ticket minting fails', async () => {
    mockedCreateNativeNotificationEnrollmentTicket.mockRejectedValueOnce(
      new Error('Ticket mint failed.')
    )
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await expect(result.current.enablePush()).rejects.toThrow('Ticket mint failed.')
    })

    expect(mockedRequestNativeNotificationEnable).not.toHaveBeenCalled()
  })

  it('keeps a late native busy snapshot from permanently relocking the switch', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      nativeStateListener?.({
        enabled: false,
        permission: 'granted',
        busy: true,
        error: null,
        requestId: 'stale-native-request',
        stage: 'requesting_device_token',
      })
    })

    expect(result.current.saving).toBe(false)
    expect(result.current.nativeBusy).toBe(true)
    expect(result.current.nativeStage).toBe('requesting_device_token')
  })
})
