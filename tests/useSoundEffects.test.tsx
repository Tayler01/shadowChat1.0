import { renderHook, act } from '@testing-library/react'
import { useSoundEffects } from '../src/hooks/useSoundEffects'

beforeEach(() => {
  localStorage.clear()
})

test('defaults to enabled with beep1', () => {
  const { result } = renderHook(() => useSoundEffects())
  expect(result.current.enabled).toBe(true)
  expect(result.current.sound).toBe('beep1')
})

test('toggle updates localStorage', () => {
  const { result } = renderHook(() => useSoundEffects())
  act(() => {
    result.current.setEnabled(false)
    result.current.setSound('beep2')
  })
  expect(localStorage.getItem('soundEffectsEnabled')).toBe('false')
  expect(localStorage.getItem('messageSound')).toBe('beep2')
})
