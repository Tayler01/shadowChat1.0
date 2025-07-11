import { renderHook, act } from '@testing-library/react'
import { useMessageSounds } from '../src/hooks/useMessageSounds'

afterEach(() => {
  localStorage.clear()
})

test('defaults to enabled with chime', () => {
  const { result } = renderHook(() => useMessageSounds())
  expect(result.current.enabled).toBe(true)
  expect(result.current.sound).toBe('chime')
})

test('updates settings in localStorage', () => {
  const { result } = renderHook(() => useMessageSounds())
  act(() => {
    result.current.setEnabled(false)
    result.current.setSound('pop')
  })
  expect(localStorage.getItem('messageSoundsEnabled')).toBe('false')
  expect(localStorage.getItem('messageSoundChoice')).toBe('pop')
})
