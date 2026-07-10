import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BlockUserControl } from '../src/components/profile/BlockUserControl'

const blockUser = jest.fn()
const unblockUser = jest.fn()
const isBlockedByMe = jest.fn()
const toastSuccess = jest.fn()

jest.mock('../src/hooks/useBlockedUsers', () => ({
  useBlockedUsers: () => ({
    blockUser,
    unblockUser,
    isBlockedByMe,
    savingUserIds: new Set<string>(),
  }),
}))

jest.mock('react-hot-toast', () => ({
  success: (...args: unknown[]) => toastSuccess(...args),
  error: jest.fn(),
}))

const target = {
  id: 'target-1',
  username: 'target',
  display_name: 'Target User',
}

beforeEach(() => {
  jest.clearAllMocks()
  blockUser.mockResolvedValue(undefined)
  unblockUser.mockResolvedValue(undefined)
  isBlockedByMe.mockReturnValue(false)
})
test('requires confirmation before blocking', async () => {
  const browserUser = userEvent.setup()
  render(<BlockUserControl user={target} />)

  await browserUser.click(screen.getByRole('button', { name: /block target user/i }))
  expect(blockUser).not.toHaveBeenCalled()
  expect(screen.getByRole('group', { name: /confirm blocking target user/i })).toBeInTheDocument()

  await browserUser.click(screen.getByRole('button', { name: /confirm block/i }))
  await waitFor(() => expect(blockUser).toHaveBeenCalledWith(target.id))
  expect(toastSuccess).toHaveBeenCalledWith('Target User blocked')
})

test('offers an explicit unblock action', async () => {
  const browserUser = userEvent.setup()
  isBlockedByMe.mockReturnValue(true)
  render(<BlockUserControl user={target} />)

  await browserUser.click(screen.getByRole('button', { name: /unblock target user/i }))
  await waitFor(() => expect(unblockUser).toHaveBeenCalledWith(target.id))
  expect(toastSuccess).toHaveBeenCalledWith('Target User unblocked')
})
