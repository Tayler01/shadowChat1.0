import {
  createNativeNotificationRequestId,
  NATIVE_APP_MESSAGE_EVENT,
  prepareNativeNotificationEnrollment,
  requestNativeNotificationEnable,
} from '../src/lib/nativeAppBridge'

const requestId = '11111111-1111-4111-8111-111111111111'
const ticket = `${requestId}.${'a'.repeat(64)}`
const userId = '22222222-2222-4222-8222-222222222222'

const publishState = (
  state: {
    enabled: boolean
    permission: 'granted' | 'denied' | 'undetermined' | 'unknown'
    busy: boolean
    error: string | null
    requestId?: string | null
    stage?:
      | 'idle'
      | 'syncing_session'
      | 'reading_permission'
      | 'requesting_permission'
      | 'registering_installation'
      | 'requesting_device_token'
      | 'requesting_expo_token'
      | 'registering_token'
      | 'ready'
      | 'failed'
  }
) => {
  window.dispatchEvent(
    new CustomEvent(NATIVE_APP_MESSAGE_EVENT, {
      detail: {
        version: 1,
        type: 'notifications_state',
        requestId: state.requestId ?? null,
        stage: state.stage ?? 'idle',
        ...state,
      },
    })
  )
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

  it('sends a single-use enrollment ticket and resolves after native registration succeeds', async () => {
    const request = requestNativeNotificationEnable(requestId, ticket, userId)
    const outbound = JSON.parse(postMessage.mock.calls[0][0])
    expect(outbound).toEqual({
      version: 1,
      type: 'notifications_enable',
      requestId,
      ticket,
      userId,
    })
    expect(outbound).not.toHaveProperty('session')

    publishState({
      enabled: false,
      permission: 'undetermined',
      busy: true,
      error: null,
      requestId: outbound.requestId,
      stage: 'requesting_permission',
    })
    publishState({
      enabled: true,
      permission: 'granted',
      busy: false,
      error: null,
      requestId: outbound.requestId,
      stage: 'ready',
    })

    await expect(request).resolves.toMatchObject({
      enabled: true,
      permission: 'granted',
    })
  })

  it('prepares a device-bound challenge before a ticket is minted', async () => {
    const preparation = prepareNativeNotificationEnrollment(requestId)
    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
      version: 1,
      type: 'notifications_enrollment_prepare',
      requestId,
    })

    window.dispatchEvent(new CustomEvent(NATIVE_APP_MESSAGE_EVENT, {
      detail: {
        version: 1,
        type: 'notification_enrollment_challenge',
        requestId,
        installationKey: requestId,
        challenge: 'b'.repeat(64),
        credentialChallenge: 'c'.repeat(64),
      },
    }))

    await expect(preparation).resolves.toEqual({
      requestId,
      installationKey: requestId,
      challenge: 'b'.repeat(64),
      credentialChallenge: 'c'.repeat(64),
    })
  })

  it('retries the in-process bridge without putting the ticket in a URL', async () => {
    const request = requestNativeNotificationEnable(requestId, ticket, userId)
    publishState({
      enabled: false,
      permission: 'undetermined',
      busy: false,
      error: null,
      requestId: null,
    })
    jest.advanceTimersByTime(800)
    expect(postMessage).toHaveBeenCalledTimes(2)
    expect(window.location.href).not.toContain(ticket)
    publishState({
      enabled: true,
      permission: 'granted',
      busy: false,
      error: null,
      requestId,
      stage: 'ready',
    })
    await expect(request).resolves.toMatchObject({ enabled: true })
  })

  it('ignores stale idle state but resolves an undetermined result after a real enable cycle', async () => {
    const request = requestNativeNotificationEnable(requestId, ticket, userId)
    const outbound = JSON.parse(postMessage.mock.calls[0][0])

    publishState({
      enabled: false,
      permission: 'undetermined',
      busy: false,
      error: null,
      requestId: outbound.requestId,
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
      requestId: outbound.requestId,
      stage: 'requesting_permission',
    })
    publishState({
      enabled: false,
      permission: 'undetermined',
      busy: false,
      error: null,
      requestId: outbound.requestId,
    })

    await expect(request).resolves.toMatchObject({
      enabled: false,
      permission: 'undetermined',
    })
  })

  it('rejects the current request when native registration reports an error', async () => {
    const request = requestNativeNotificationEnable(requestId, ticket, userId)
    const outbound = JSON.parse(postMessage.mock.calls[0][0])

    publishState({
      enabled: false,
      permission: 'unknown',
      busy: false,
      error: 'Native registration failed.',
      requestId: outbound.requestId,
      stage: 'failed',
    })

    await expect(request).rejects.toThrow('Native registration failed.')
  })

  it('ignores terminal state from an older native request', async () => {
    const request = requestNativeNotificationEnable(requestId, ticket, userId)
    const outbound = JSON.parse(postMessage.mock.calls[0][0])
    let settled = false
    void request.finally(() => {
      settled = true
    })

    publishState({
      enabled: true,
      permission: 'granted',
      busy: false,
      error: null,
      requestId: 'older-request',
      stage: 'ready',
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    publishState({
      enabled: true,
      permission: 'granted',
      busy: false,
      error: null,
      requestId: outbound.requestId,
      stage: 'ready',
    })
    await expect(request).resolves.toMatchObject({ enabled: true })
  })

  it('creates bridge-safe request ids', () => {
    expect(createNativeNotificationRequestId()).toMatch(/^[A-Za-z0-9._:-]{16,160}$/)
  })
})
