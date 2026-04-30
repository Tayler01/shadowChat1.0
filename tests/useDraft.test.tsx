import { renderHook, act, waitFor } from '@testing-library/react'
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

test('treats whitespace-only stored draft as empty', () => {
  localStorage.setItem('draft-general', '   ')
  const { result } = renderHook(() => useDraft('general'))

  expect(result.current.draft).toBe('')
  expect(localStorage.getItem('draft-general')).toBeNull()
})

test('removes draft when updated to whitespace only', async () => {
  const { result } = renderHook(() => useDraft('general'))

  act(() => {
    result.current.setDraft('hello')
  })

  await waitFor(() => {
    expect(localStorage.getItem('draft-general')).toBe('hello')
  })

  act(() => {
    result.current.setDraft('   ')
  })

  expect(result.current.draft).toBe('')
  await waitFor(() => {
    expect(localStorage.getItem('draft-general')).toBeNull()
  })
})

test('syncs updates across mounted hooks with the same draft key', async () => {
  const { result: first } = renderHook(() => useDraft('general'))
  const { result: second } = renderHook(() => useDraft('general'))

  act(() => {
    first.current.setDraft('shared draft')
  })

  await waitFor(() => {
    expect(second.current.draft).toBe('shared draft')
  })

  act(() => {
    second.current.clear()
  })

  await waitFor(() => {
    expect(first.current.draft).toBe('')
  })
})
