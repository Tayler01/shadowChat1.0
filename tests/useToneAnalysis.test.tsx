import { renderHook } from '@testing-library/react'
import { useToneAnalysis } from '../src/hooks/useToneAnalysis'

test('detects positive tone', () => {
  const { result } = renderHook(() => useToneAnalysis())
  expect(result.current('I love this').tone).toBe('positive')
})

test('detects negative tone', () => {
  const { result } = renderHook(() => useToneAnalysis())
  expect(result.current('I hate this').tone).toBe('negative')
})

