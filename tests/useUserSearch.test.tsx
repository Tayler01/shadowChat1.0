import { renderHook, act } from '@testing-library/react'
import { useUserSearch } from '../src/hooks/useUserSearch'
import { searchUsers } from '../src/lib/supabase'

jest.mock('../src/lib/supabase', () => {
  return {
    searchUsers: jest.fn(),
  }
})

type SearchUsersMock = jest.MockedFunction<typeof searchUsers>

beforeEach(() => {
  jest.resetAllMocks()
})

test('searches users by term', async () => {
  const searchMock = searchUsers as SearchUsersMock
  searchMock.mockResolvedValue([
    { id: 'u1', username: 'bob', display_name: 'Bob', avatar_url: null, color: '#fff', status: 'online' } as any,
  ])

  const { result } = renderHook(() => useUserSearch('bob'))
  await act(async () => {
    await Promise.resolve()
  })

  expect(searchMock).toHaveBeenCalledWith('bob', { signal: expect.anything() })
  expect(result.current.results).toEqual([
    { id: 'u1', username: 'bob', display_name: 'Bob', avatar_url: null, color: '#fff', status: 'online' },
  ])
  expect(result.current.error).toBeNull()
})

test('returns error when no users found', async () => {
  const searchMock = searchUsers as SearchUsersMock
  searchMock.mockResolvedValue([])

  const { result } = renderHook(() => useUserSearch('missing'))
  await act(async () => {
    await Promise.resolve()
  })

  expect(result.current.results).toEqual([])
  expect(result.current.error).toBe('User not found')
})
