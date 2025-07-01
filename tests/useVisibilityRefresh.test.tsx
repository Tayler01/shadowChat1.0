import { renderHook } from '@testing-library/react'
import { useVisibilityRefresh } from '../src/hooks/useVisibilityRefresh'

test('runs callback on visibility change when document becomes visible', () => {
  const cb = jest.fn()
  renderHook(() => useVisibilityRefresh(cb))
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(cb).toHaveBeenCalled()
})
