import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  BlockedUsersProvider,
  PERSONAL_BLOCKS_CHANGED_EVENT,
  useBlockedUsers,
} from '../src/hooks/useBlockedUsers'
import {
  blockUser as persistBlockUser,
  fetchMyBlockedUsers,
  unblockUser as persistUnblockUser,
} from '../src/lib/personalBlocking'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'viewer-1' } }),
}))

jest.mock('../src/lib/personalBlocking', () => ({
  blockUser: jest.fn(),
  fetchMyBlockedUsers: jest.fn(),
  unblockUser: jest.fn(),
}))

const wrapper = ({ children }: { children: ReactNode }) => (
  <BlockedUsersProvider>{children}</BlockedUsersProvider>
)

const blockedEntry = {
  user: {
    id: 'blocked-1',
    username: 'shadowed',
    display_name: 'Shadowed User',
  },
  blockedAt: '2026-07-10T00:00:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(fetchMyBlockedUsers as jest.Mock).mockResolvedValue([blockedEntry])
  ;(persistBlockUser as jest.Mock).mockResolvedValue(true)
  ;(persistUnblockUser as jest.Mock).mockResolvedValue(true)
})
test('loads only the caller-owned block list', async () => {
  const { result } = renderHook(() => useBlockedUsers(), { wrapper })

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.entries).toEqual([blockedEntry])
  expect(result.current.isBlockedByMe('blocked-1')).toBe(true)
  expect(result.current.isBlockedByMe('other-1')).toBe(false)
})

test('updates local visibility immediately after a successful block', async () => {
  ;(fetchMyBlockedUsers as jest.Mock)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([blockedEntry])
  const changed = jest.fn()
  window.addEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, changed)
  const { result } = renderHook(() => useBlockedUsers(), { wrapper })
  await waitFor(() => expect(result.current.loading).toBe(false))

  await act(async () => {
    await result.current.blockUser('blocked-1')
  })

  expect(persistBlockUser).toHaveBeenCalledWith('blocked-1')
  expect(result.current.isBlockedByMe('blocked-1')).toBe(true)
  expect(changed).toHaveBeenCalledTimes(1)
  window.removeEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, changed)
})

test('unblock is explicit and removes the user from the local list', async () => {
  ;(fetchMyBlockedUsers as jest.Mock)
    .mockResolvedValueOnce([blockedEntry])
    .mockResolvedValueOnce([])
  const { result } = renderHook(() => useBlockedUsers(), { wrapper })
  await waitFor(() => expect(result.current.isBlockedByMe('blocked-1')).toBe(true))

  await act(async () => {
    await result.current.unblockUser('blocked-1')
  })

  expect(persistUnblockUser).toHaveBeenCalledWith('blocked-1')
  expect(result.current.isBlockedByMe('blocked-1')).toBe(false)
  expect(result.current.entries).toEqual([])
})
