import { renderHook, act } from '@testing-library/react'
import { useAllUsers } from '../src/hooks/useAllUsers'
import { fetchAllUsers } from '../src/lib/supabase'

jest.mock('../src/lib/supabase', () => {
  return {
    fetchAllUsers: jest.fn(),
  }
})

type FetchAllUsersMock = jest.MockedFunction<typeof fetchAllUsers>

beforeEach(() => {
  jest.resetAllMocks()
})

test('fetches users on mount', async () => {
  const fetchMock = fetchAllUsers as FetchAllUsersMock
  fetchMock.mockResolvedValue([
    { id: 'u1', username: 'bob', display_name: 'Bob', avatar_url: null, color: '#fff', status: 'online' } as any,
  ])

  const { result } = renderHook(() => useAllUsers())
  await act(async () => {
    await Promise.resolve()
  })

  expect(fetchMock).toHaveBeenCalled()
  expect(result.current.users).toEqual([
    { id: 'u1', username: 'bob', display_name: 'Bob', avatar_url: null, color: '#fff', status: 'online' },
  ])
  expect(result.current.error).toBeNull()
})

test('handles fetch error', async () => {
  const fetchMock = fetchAllUsers as FetchAllUsersMock
  fetchMock.mockRejectedValue(new Error('fail'))

  const { result } = renderHook(() => useAllUsers())
  await act(async () => {
    await Promise.resolve()
  })

  expect(result.current.users).toEqual([])
  expect(result.current.error).toBe('Failed to load users')
})

