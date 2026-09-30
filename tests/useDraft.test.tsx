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
  expect(localStorage.getItem('draft-general')).toBe('hello')
  expect(localStorage.getItem('draft-other')).toBe('world')
})

test('switching draft keys never writes the previous conversation into the new key', () => {
  localStorage.setItem('draft-dm-a', 'hello from A')
  localStorage.setItem('draft-dm-b', 'hello from B')
  const { result, rerender } = renderHook((props: { key: string }) => useDraft(props.key), {
    initialProps: { key: 'dm-a' },
  })
  expect(result.current.draft).toBe('hello from A')
  rerender({ key: 'dm-b' })
  expect(result.current.draft).toBe('hello from B')
  expect(localStorage.getItem('draft-dm-a')).toBe('hello from A')
  expect(localStorage.getItem('draft-dm-b')).toBe('hello from B')
  rerender({ key: 'dm-a' })
  expect(result.current.draft).toBe('hello from A')
})

test('account-scoped drafts retain each account text without exposing unowned legacy data', () => {
  localStorage.setItem('draft-general', 'legacy with unknown owner')
  const { result, rerender } = renderHook((props: { owner: string | null }) => useDraft('general', props.owner), {
    initialProps: { owner: 'account-a' } as { owner: string | null },
  })
  expect(result.current.draft).toBe('')
  act(() => result.current.setDraft('Account A text'))
  expect(localStorage.getItem('draft-account:account-a:general')).toBe('Account A text')
  rerender({ owner: 'account-b' })
  expect(result.current.draft).toBe('')
  act(() => result.current.setDraft('Account B text'))
  rerender({ owner: 'account-a' })
  expect(result.current.draft).toBe('Account A text')
  rerender({ owner: null })
  expect(result.current.draft).toBe('')
  expect(localStorage.getItem('draft-general')).toBe('legacy with unknown owner')
  expect(localStorage.getItem('draft-account:account-b:general')).toBe('Account B text')
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
