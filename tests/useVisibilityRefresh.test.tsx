import { renderHook } from '@testing-library/react'
import { useVisibilityRefresh } from '../src/hooks/useVisibilityRefresh'

Object.defineProperty(window, 'location', {
  value: { reload: jest.fn() },
  writable: true,
})

test('reloads page and runs callback on visibility change', () => {
  const cb = jest.fn()
  renderHook(() => useVisibilityRefresh(cb))
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(window.location.reload).toHaveBeenCalled()
  expect(cb).toHaveBeenCalled()
})
