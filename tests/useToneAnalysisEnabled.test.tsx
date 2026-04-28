import { renderHook, act } from '@testing-library/react'
import { useToneAnalysisEnabled } from '../src/hooks/useToneAnalysisEnabled'

beforeEach(() => {
  localStorage.clear()
})

test('defaults to disabled while the feature is dormant', () => {
  const { result } = renderHook(() => useToneAnalysisEnabled())
  expect(result.current.enabled).toBe(false)
})

test('does not enable the dormant feature', () => {
  const { result } = renderHook(() => useToneAnalysisEnabled())
  act(() => {
    result.current.setEnabled(true)
  })
  expect(localStorage.getItem('toneAnalysisEnabled')).toBe('false')
  expect(result.current.enabled).toBe(false)
})

test('ignores previous enabled localStorage values', () => {
  localStorage.setItem('toneAnalysisEnabled', 'true')

  const { result } = renderHook(() => useToneAnalysisEnabled())

  expect(result.current.enabled).toBe(false)
})
