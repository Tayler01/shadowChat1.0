import { renderHook, act } from '@testing-library/react'
import { useToneAnalysisEnabled } from '../src/hooks/useToneAnalysisEnabled'

beforeEach(() => {
  localStorage.clear()
})

test('defaults to enabled', () => {
  const { result } = renderHook(() => useToneAnalysisEnabled())
  expect(result.current.enabled).toBe(true)
})

test('toggle updates localStorage', () => {
  const { result } = renderHook(() => useToneAnalysisEnabled())
  act(() => {
    result.current.setEnabled(false)
  })
  expect(localStorage.getItem('toneAnalysisEnabled')).toBe('false')
  expect(result.current.enabled).toBe(false)
})
