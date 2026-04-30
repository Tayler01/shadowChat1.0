import { runRealtimeRecovery, REALTIME_RECOVERY_EVENT } from '../src/lib/realtimeRecovery'
import {
  ensureSession,
  getSessionWithTimeout,
  getStoredRefreshToken,
  getWorkingClient,
} from '../src/lib/supabase'

const realtime = {
  setAuth: jest.fn(),
  connect: jest.fn(),
}

jest.mock('../src/lib/supabase', () => ({
  ensureSession: jest.fn(),
  getSessionWithTimeout: jest.fn(),
  getStoredRefreshToken: jest.fn(),
  getWorkingClient: jest.fn(),
}))

beforeEach(() => {
  jest.resetAllMocks()
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  })
  ;(getStoredRefreshToken as jest.Mock).mockReturnValue('saved-refresh-token')
  ;(ensureSession as jest.Mock).mockResolvedValue(true)
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ realtime })
  ;(getSessionWithTimeout as jest.Mock).mockResolvedValue({
    data: { session: { access_token: 'access-token' } },
    error: null,
  })
})

test('sets realtime auth and dispatches one locked recovery event', async () => {
  const events: unknown[] = []
  window.addEventListener(REALTIME_RECOVERY_EVENT, (event) => {
    events.push((event as CustomEvent).detail)
  }, { once: true })

  const [first, second] = await Promise.all([
    runRealtimeRecovery('channel-error'),
    runRealtimeRecovery('send-error'),
  ])

  expect(first).toEqual({ ok: true, skipped: false, reason: 'channel-error' })
  expect(second).toEqual(first)
  expect(ensureSession).toHaveBeenCalledTimes(1)
  expect(realtime.setAuth).toHaveBeenCalledWith('access-token')
  expect(realtime.connect).toHaveBeenCalledTimes(1)
  expect(events).toEqual([first])
})

test('can reuse a session already recovered by the session coordinator', async () => {
  await expect(runRealtimeRecovery('session-recovery', { sessionReady: true })).resolves.toEqual({
    ok: true,
    skipped: false,
    reason: 'session-recovery',
  })

  expect(ensureSession).not.toHaveBeenCalled()
  expect(realtime.setAuth).toHaveBeenCalledWith('access-token')
})

