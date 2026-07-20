import { createNativeNotificationEnrollmentTicket } from '../src/lib/nativeNotificationEnrollment'
import {
  ensureSession,
  getSessionWithTimeout,
  getWorkingClient,
} from '../src/lib/supabase'

jest.mock('../src/lib/supabase', () => ({
  ensureSession: jest.fn(),
  getSessionWithTimeout: jest.fn(),
  getWorkingClient: jest.fn(),
}))

const mockedEnsureSession = ensureSession as jest.Mock
const mockedGetSessionWithTimeout = getSessionWithTimeout as jest.Mock
const mockedGetWorkingClient = getWorkingClient as jest.Mock

const userId = '11111111-1111-4111-8111-111111111111'
const requestId = '22222222-2222-4222-8222-222222222222'
const installationKey = '33333333-3333-4333-8333-333333333333'
const ticket = `${requestId}.${'a'.repeat(64)}`

describe('native notification enrollment ticket authority', () => {
  const rpc = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedEnsureSession.mockResolvedValue(true)
    mockedGetWorkingClient.mockResolvedValue({ rpc })
    mockedGetSessionWithTimeout.mockResolvedValue({
      data: { session: { user: { id: userId } } },
      error: null,
    })
    rpc.mockResolvedValue({
      data: {
        ticket,
        expires_at: '2099-01-01T00:00:00.000Z',
      },
      error: null,
    })
  })

  it('recovers and verifies the hosted session before minting', async () => {
    await expect(createNativeNotificationEnrollmentTicket(
      userId,
      requestId,
      installationKey,
      'b'.repeat(64),
      'c'.repeat(64),
    )).resolves.toEqual({
      ticket,
      expiresAt: '2099-01-01T00:00:00.000Z',
    })

    expect(mockedEnsureSession).toHaveBeenCalledTimes(1)
    expect(mockedGetSessionWithTimeout).toHaveBeenCalledWith({ rpc })
    expect(rpc).toHaveBeenCalledWith(
      'create_my_native_notification_enrollment_ticket_v2',
      {
        target_request_id: requestId,
        target_installation_key: installationKey,
        target_challenge: 'b'.repeat(64),
        target_credential_challenge: 'c'.repeat(64),
      },
    )
  })

  it('does not mint when the recoverable session is unavailable', async () => {
    mockedEnsureSession.mockResolvedValue(false)

    await expect(createNativeNotificationEnrollmentTicket(
      userId,
      requestId,
      installationKey,
      'b'.repeat(64),
      'c'.repeat(64),
    )).rejects.toThrow('session could not be verified')

    expect(mockedGetWorkingClient).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects an account change before minting', async () => {
    mockedGetSessionWithTimeout.mockResolvedValue({
      data: {
        session: {
          user: { id: '44444444-4444-4444-8444-444444444444' },
        },
      },
      error: null,
    })

    await expect(createNativeNotificationEnrollmentTicket(
      userId,
      requestId,
      installationKey,
      'b'.repeat(64),
      'c'.repeat(64),
    )).rejects.toThrow('session changed')

    expect(rpc).not.toHaveBeenCalled()
  })
})
