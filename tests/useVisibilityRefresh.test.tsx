import { renderHook, act } from '@testing-library/react'
import { waitFor } from '@testing-library/react'
import { useVisibilityRefresh } from '../src/hooks/useVisibilityRefresh'

jest.mock('../src/lib/supabase', () => ({
  getRealtimeClient: jest.fn(() => ({
    realtime: {
      connect: jest.fn(),
    },
  })),
  recreateSupabaseClient: jest.fn().mockResolvedValue(undefined),
  recoverSessionAfterResume: jest.fn().mockResolvedValue(true),
}))

test('runs callback on visibility change when document becomes visible', async () => {
  jest.useFakeTimers()
  const cb = jest.fn()
  renderHook(() => useVisibilityRefresh(cb, 200))
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await act(async () => {
    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(200)
  })
  await waitFor(() => expect(cb).toHaveBeenCalled())
  jest.useRealTimers()
})
