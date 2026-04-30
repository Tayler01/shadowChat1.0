import { renderHook, act } from '@testing-library/react'
import { useClientResetStatus } from '../src/hooks/useClientResetStatus'
import { runRealtimeRecovery } from '../src/lib/realtimeRecovery'
import { runSessionRecovery } from '../src/lib/sessionRecovery'

jest.mock('../src/lib/sessionRecovery', () => ({
  runSessionRecovery: jest.fn().mockResolvedValue({ ok: true, skipped: false, reason: 'manual' }),
}))

jest.mock('../src/lib/realtimeRecovery', () => ({
  runRealtimeRecovery: jest.fn().mockResolvedValue({ ok: true, skipped: false, reason: 'manual' }),
}))

beforeEach(() => {
  jest.resetAllMocks()
  ;(runSessionRecovery as jest.Mock).mockResolvedValue({ ok: true, skipped: false, reason: 'manual' })
  ;(runRealtimeRecovery as jest.Mock).mockResolvedValue({ ok: true, skipped: false, reason: 'manual' })
})

test('queues simultaneous manual recoveries', async () => {
  const { result } = renderHook(() => useClientResetStatus())

  await act(async () => {
    await Promise.all([result.current.manualReset(), result.current.manualReset()])
  })

  expect(runSessionRecovery).toHaveBeenCalledTimes(1)
  expect(runSessionRecovery).toHaveBeenCalledWith('manual')
  expect(runRealtimeRecovery).toHaveBeenCalledTimes(1)
  expect(runRealtimeRecovery).toHaveBeenCalledWith('manual', { sessionReady: true })
})

test('visibility change no longer triggers recovery work', async () => {
  renderHook(() => useClientResetStatus())

  await act(async () => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  expect(runSessionRecovery).not.toHaveBeenCalled()
  expect(runRealtimeRecovery).not.toHaveBeenCalled()
})
