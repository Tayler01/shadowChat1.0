import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PublicProfileDialog } from '../src/components/profile/PublicProfileDialog'
import type { User } from '../src/lib/supabase'

const mockUseAuth = jest.fn()
const mockListUserChannelBans = jest.fn()
const mockSetUserChannelBans = jest.fn()
const mockToastSuccess = jest.fn()
const mockToastError = jest.fn()

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

jest.mock('../src/lib/moderation', () => ({
  CHANNEL_BAN_OPTIONS: [
    {
      scope: 'general_chat',
      label: 'General Chat',
      description: 'Blocks group channel messages, edits, and reactions.',
    },
    {
      scope: 'news_chat',
      label: 'News Chat',
      description: 'Blocks News channel messages, edits, and reactions.',
    },
    {
      scope: 'news_feed',
      label: 'News Feed',
      description: 'Blocks reactions on News Feed articles.',
    },
  ],
  CHANNEL_BAN_DURATIONS: [
    { value: '60', label: '1 hour' },
    { value: '1440', label: '24 hours' },
    { value: '10080', label: '7 days' },
    { value: '43200', label: '30 days' },
    { value: 'permanent', label: 'Permanent' },
  ],
  getChannelBanLabel: (scope: string) => ({
    general_chat: 'General Chat',
    news_chat: 'News Chat',
    news_feed: 'News Feed',
  }[scope] ?? scope),
  listUserChannelBans: (...args: unknown[]) => mockListUserChannelBans(...args),
  setUserChannelBans: (...args: unknown[]) => mockSetUserChannelBans(...args),
}))

jest.mock('react-hot-toast', () => ({
  success: (...args: unknown[]) => mockToastSuccess(...args),
  error: (...args: unknown[]) => mockToastError(...args),
}))

const user = {
  id: 'u2',
  email: 'hidden@example.com',
  username: 'caleb',
  display_name: 'Caleb Polder',
  avatar_url: 'https://example.com/avatar.png',
  banner_url: 'https://example.com/banner.png',
  status: 'online',
  status_message: 'Building in the shadows.',
  color: '#22c55e',
  last_active: '2026-04-28T00:00:00.000Z',
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-28T00:00:00.000Z',
} as User

const adminUser = {
  ...user,
  id: 'admin-1',
  username: 'admin',
  display_name: 'Admin',
  admin_role: 'admin',
} as User

beforeEach(() => {
  jest.clearAllMocks()
  mockUseAuth.mockReturnValue({ profile: null })
  mockListUserChannelBans.mockResolvedValue([])
  mockSetUserChannelBans.mockResolvedValue([])
})

test('renders public profile details in a dialog', () => {
  render(<PublicProfileDialog user={user} open onClose={jest.fn()} />)

  expect(screen.getByRole('dialog', { name: /caleb polder/i })).toBeInTheDocument()
  expect(screen.getAllByText('@caleb')).toHaveLength(2)
  expect(screen.getByText('Building in the shadows.')).toBeInTheDocument()
  expect(screen.getByText('Member since')).toBeInTheDocument()
  expect(screen.queryByText(user.email)).toBeNull()
})

test('closes with the clear close button', async () => {
  const onClose = jest.fn()
  render(<PublicProfileDialog user={user} open onClose={onClose} />)

  await userEvent.click(screen.getByRole('button', { name: /close profile/i }))

  expect(onClose).toHaveBeenCalled()
})

test('lets admins save channel ban selections from the profile dialog', async () => {
  const browserUser = userEvent.setup()
  mockUseAuth.mockReturnValue({ profile: adminUser })
  mockSetUserChannelBans.mockResolvedValue([
    {
      id: 'ban-1',
      target_user_id: user.id,
      scope: 'general_chat',
      created_at: '2026-05-02T00:00:00.000Z',
      updated_at: '2026-05-02T00:00:00.000Z',
    },
  ])

  render(<PublicProfileDialog user={user} open onClose={jest.fn()} />)

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /channel bans/i })).not.toBeDisabled()
  })

  await act(async () => {
    await browserUser.click(screen.getByRole('button', { name: /channel bans/i }))
  })
  await act(async () => {
    await browserUser.click(screen.getByLabelText(/general chat/i))
  })
  await act(async () => {
    await browserUser.click(screen.getByRole('button', { name: /save bans/i }))
  })

  await waitFor(() => {
    expect(mockSetUserChannelBans).toHaveBeenCalledWith(user.id, ['general_chat'], 1440)
  })
  expect(mockToastSuccess).toHaveBeenCalledWith('Channel bans updated')
})
