import { renderHook, act } from '@testing-library/react'
import { resetAllUsersCacheForTests, useAllUsers } from '../src/hooks/useAllUsers'
import { fetchAllUsers } from '../src/lib/supabase'

jest.mock('../src/lib/supabase', () => {
  return {
    fetchAllUsers: jest.fn(),
  }
})

type FetchAllUsersMock = jest.MockedFunction<typeof fetchAllUsers>

beforeEach(() => {
  jest.resetAllMocks()
  resetAllUsersCacheForTests()
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

test('does not fetch users while disabled', async () => {
  const fetchMock = fetchAllUsers as FetchAllUsersMock

  const { result } = renderHook(() => useAllUsers({ enabled: false }))
  await act(async () => {
    await Promise.resolve()
  })

  expect(fetchMock).not.toHaveBeenCalled()
  expect(result.current.users).toEqual([])
  expect(result.current.loading).toBe(false)
})

test('reuses the in-memory user directory cache on remount', async () => {
  const fetchMock = fetchAllUsers as FetchAllUsersMock
  fetchMock.mockResolvedValue([
    { id: 'u1', username: 'bob', display_name: 'Bob', avatar_url: null, color: '#fff', status: 'online' } as any,
  ])

  const first = renderHook(() => useAllUsers())
  await act(async () => {
    await Promise.resolve()
  })
  first.unmount()

  const second = renderHook(() => useAllUsers())
  await act(async () => {
    await Promise.resolve()
  })

  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(second.result.current.users).toHaveLength(1)
})

