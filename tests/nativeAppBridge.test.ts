import {
  NATIVE_APP_MESSAGE_EVENT,
  requestNativeNotificationEnable,
} from '../src/lib/nativeAppBridge'

const session = {
  accessToken: 'access-token-value-long-enough-for-native-bridge',
  refreshToken: 'refresh-token-value-long-enough-for-native-bridge',
  expiresAt: 1_900_000_000,
  userId: '11111111-1111-4111-8111-111111111111',
}

const publishState = (
  state: {
    enabled: boolean
    permission: 'granted' | 'denied' | 'undetermined' | 'unknown'
    busy: boolean
    error: string | null
  }
) => {
  window.dispatchEvent(new CustomEvent(NATIVE_APP_MESSAGE_EVENT, {
    detail: {
      version: 1,
      type: 'notifications_state',
      ...state,
    },
  }))
}

describe('native app notification bridge', () => {
  const postMessage = jest.fn()

  beforeEach(() => {
    jest.useFakeTimers()
    postMessage.mockClear()
    window.__SHADOWCHAT_NATIVE_APP__ = true
    window.ReactNativeWebView = { postMessage }
  })

  afterEach(() => {
    delete window.__SHADOWCHAT_NATIVE_APP__
    delete window.ReactNativeWebView
    jest.useRealTimers()
  })

  it('sends the authenticated session and resolves after native registration succeeds', async () => {
    const request = requestNativeNotificationEnable(session)
    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
      version: 1,
      type: 'auth_session',
      session,
    })

    await jest.advanceTimersByTimeAsync(1_000)
    expect(JSON.parse(postMessage.mock.calls[1][0])).toEqual({
      version: 1,
      type: 'notifications_enable',
      session,
    })

    publishState({
      enabled: false,
      permission: 'undetermined',
      busy: true,
      error: null,
    })
    publishState({
      enabled: true,
      permission: 'granted',
      busy: false,
      error: null,
    })

    await expect(request).resolves.toMatchObject({
      enabled: true,
      permission: 'granted',
    })
  })

  it('ignores stale idle state but resolves an undetermined result after a real enable cycle', async () => {
    const request = requestNativeNotificationEnable(null)

    publishState({
      enabled: false,
      permission: 'undetermined',
      busy: false,
      error: null,
    })

    let settled = false
    void request.finally(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    publishState({
      enabled: false,
      permission: 'undetermined',
      busy: true,
      error: null,
    })
    publishState({
      enabled: false,
      permission: 'undetermined',
      busy: false,
      error: null,
    })

    await expect(request).resolves.toMatchObject({
      enabled: false,
      permission: 'undetermined',
    })
  })

  it('rejects the current request when native registration reports an error', async () => {
    const request = requestNativeNotificationEnable(null)

    publishState({
      enabled: false,
      permission: 'unknown',
      busy: false,
      error: 'Native registration failed.',
    })

    await expect(request).rejects.toThrow('Native registration failed.')
  })
})
