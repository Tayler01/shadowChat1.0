import {
  NativeNotificationStageTimeoutError,
  runNotificationStage,
} from '../apps/mobile/src/lib/notifications/registrationPipeline'

describe('native notification registration stages', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('turns a poisoned native token request into a bounded, actionable failure', async () => {
    const operation = runNotificationStage({
      stage: 'requesting_device_token',
      operation: () => new Promise<string>(() => undefined),
      timeoutMs: 1_000,
    })
    const rejection = expect(operation).rejects.toMatchObject({
      name: 'NativeNotificationStageTimeoutError',
      stage: 'requesting_device_token',
      message: expect.stringContaining(
        'connecting to Apple Push Notification service'
      ),
    })

    await jest.advanceTimersByTimeAsync(1_000)
    await rejection
  })

  it('allows a new attempt to succeed after an older attempt timed out', async () => {
    const first = runNotificationStage({
      stage: 'requesting_device_token',
      operation: () => new Promise<string>(() => undefined),
      timeoutMs: 100,
    })
    const firstRejection = expect(first).rejects.toBeInstanceOf(
      NativeNotificationStageTimeoutError
    )

    await jest.advanceTimersByTimeAsync(100)
    await firstRejection

    await expect(
      runNotificationStage({
        stage: 'requesting_device_token',
        operation: async () => 'fresh-apns-token',
        timeoutMs: 100,
      })
    ).resolves.toBe('fresh-apns-token')
  })
})
