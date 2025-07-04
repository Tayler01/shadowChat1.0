import { renderHook, act } from '@testing-library/react'
import { useDraft } from '../src/hooks/useDraft'

beforeEach(() => {
  localStorage.clear()
})

test('persists draft across mounts', () => {
  const { result, unmount } = renderHook(() => useDraft('general'))
  act(() => {
    result.current.setDraft('hello')
  })
  unmount()
  const { result: result2 } = renderHook(() => useDraft('general'))
  expect(result2.current.draft).toBe('hello')
})

test('updates draft when key changes', () => {
  localStorage.setItem('draft-other', 'world')
  const { result, rerender } = renderHook((props: {key: string}) => useDraft(props.key), {
    initialProps: { key: 'general' }
  })
  act(() => {
    result.current.setDraft('hello')
  })
  rerender({ key: 'other' })
  expect(result.current.draft).toBe('world')
})
