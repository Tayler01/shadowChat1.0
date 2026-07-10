const invoke = jest.fn()

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(async () => ({
    functions: { invoke },
  })),
}))

import {
  triggerDMPushNotification,
  triggerShadowPinPostPushNotification,
} from '../src/lib/push'

describe('push delivery retry contract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('retries a transient provider response and preserves the same idempotency body', async () => {
    invoke
      .mockResolvedValueOnce({
        data: null,
        error: { context: { status: 503 } },
      })
      .mockResolvedValueOnce({
        data: { deliveredCount: 1 },
        error: null,
      })

    await expect(triggerShadowPinPostPushNotification('pin-1')).resolves.toEqual({ deliveredCount: 1 })

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenNthCalledWith(1, 'send-push', {
      body: { type: 'shadow_pin_post', messageId: 'pin-1' },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'send-push', {
      body: { type: 'shadow_pin_post', messageId: 'pin-1' },
    })
  })

  test('does not retry a permanent client or authorization failure', async () => {
    const error = { context: { status: 403 } }
    invoke.mockResolvedValue({ data: null, error })

    await expect(triggerDMPushNotification('dm-1')).rejects.toBe(error)
    expect(invoke).toHaveBeenCalledTimes(1)
  })
})
