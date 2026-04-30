import { runSessionRecovery, SESSION_RECOVERY_EVENT } from '../src/lib/sessionRecovery'
import {
  ensureSession,
  getStoredRefreshToken,
  updateUserPresence,
} from '../src/lib/supabase'
import { refreshAppBadge } from '../src/lib/appBadge'
import { runRealtimeRecovery } from '../src/lib/realtimeRecovery'

jest.mock('../src/lib/supabase', () => ({
  ensureSession: jest.fn(),
  getStoredRefreshToken: jest.fn(),
  updateUserPresence: jest.fn(),
}))

jest.mock('../src/lib/appBadge', () => ({
  refreshAppBadge: jest.fn(),
}))

jest.mock('../src/lib/realtimeRecovery', () => ({
  runRealtimeRecovery: jest.fn(),
}))

beforeEach(() => {
  jest.resetAllMocks()
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  })
  ;(getStoredRefreshToken as jest.Mock).mockReturnValue('saved-refresh-token')
  ;(ensureSession as jest.Mock).mockResolvedValue(true)
  ;(updateUserPresence as jest.Mock).mockResolvedValue(undefined)
  ;(refreshAppBadge as jest.Mock).mockResolvedValue(0)
  ;(runRealtimeRecovery as jest.Mock).mockResolvedValue({ ok: true, skipped: false, reason: 'session-recovery' })
})

test('runs a single locked session recovery and refreshes visible app state', async () => {
  const events: unknown[] = []
  window.addEventListener(SESSION_RECOVERY_EVENT, (event) => {
    events.push((event as CustomEvent).detail)
  }, { once: true })

  const [first, second] = await Promise.all([
    runSessionRecovery('resume'),
    runSessionRecovery('focus'),
  ])

  expect(first).toEqual({ ok: true, skipped: false, reason: 'resume' })
  expect(second).toEqual(first)
  expect(ensureSession).toHaveBeenCalledTimes(1)
  expect(runRealtimeRecovery).toHaveBeenCalledWith('session-recovery', { sessionReady: true })
  expect(updateUserPresence).toHaveBeenCalledTimes(1)
  expect(refreshAppBadge).toHaveBeenCalledTimes(1)
  expect(events).toEqual([first])
})

test('skips recovery when no refresh token is saved', async () => {
  ;(getStoredRefreshToken as jest.Mock).mockReturnValue(null)

  await expect(runSessionRecovery('resume')).resolves.toEqual({
    ok: false,
    skipped: true,
    reason: 'resume',
    error: 'no-stored-session',
  })

  expect(ensureSession).not.toHaveBeenCalled()
})
