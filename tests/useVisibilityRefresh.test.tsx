import { renderHook, act } from '@testing-library/react'
import { useVisibilityRefresh } from '../src/hooks/useVisibilityRefresh'

test('runs callback on visibility change when document becomes visible', async () => {
  jest.useFakeTimers()
  const cb = jest.fn()
  renderHook(() => useVisibilityRefresh(cb, 200))
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await act(async () => {
    jest.advanceTimersByTime(200)
    await Promise.resolve()
  })
  expect(cb).toHaveBeenCalled()
  jest.useRealTimers()
})
