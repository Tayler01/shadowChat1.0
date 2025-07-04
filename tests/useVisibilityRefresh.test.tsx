import { renderHook, act } from '@testing-library/react'
import { useVisibilityRefresh } from '../src/hooks/useVisibilityRefresh'

test('runs callback on visibility change when document becomes visible', () => {
  jest.useFakeTimers()
  const cb = jest.fn()
  renderHook(() => useVisibilityRefresh(cb, 200))
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  jest.runAllTimers()
  expect(cb).toHaveBeenCalled()
  jest.useRealTimers()
})
