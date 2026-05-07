import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PublicProfileDialog } from '../src/components/profile/PublicProfileDialog'
import type { User } from '../src/lib/supabase'

const mockUseAuth = jest.fn()
const mockUseUserChannelBans = jest.fn()
const mockSetUserChannelBans = jest.fn()
const mockSetSubAdminStatus = jest.fn()
const mockGetOrCreateDMConversation = jest.fn()
const mockNotifyChannelBansChanged = jest.fn()
const mockToastSuccess = jest.fn()
const mockToastError = jest.fn()

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

jest.mock('../src/hooks/useUserChannelBans', () => ({
  useUserChannelBans: (...args: unknown[]) => mockUseUserChannelBans(...args),
}))

jest.mock('../src/lib/supabase', () => ({
  getOrCreateDMConversation: (...args: unknown[]) => mockGetOrCreateDMConversation(...args),
  setSubAdminStatus: (...args: unknown[]) => mockSetSubAdminStatus(...args),
}))

jest.mock('../src/lib/moderation', () => ({
  CHANNEL_BAN_OPTIONS: [
    {
      scope: 'general_chat',
      label: 'General Chat',
      description: 'Blocks group channel messages, edits, and reactions.',
    },
    {
      scope: 'board_news_chat',
      label: 'News Chat',
      description: 'Blocks News Chat messages, edits, deletes, and reactions.',
    },
    {
      scope: 'all_interaction',
      label: 'All Interaction',
      description: 'Blocks posting, editing, deleting, and emoji reactions app-wide while leaving read access open.',
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
    board_news_chat: 'News Chat',
    all_interaction: 'All Interaction',
  }[scope] ?? scope),
  formatChannelBanExpiry: () => 'Until May 2, 8:00 PM',
  describeChannelBanScopes: (bans: Array<{ scope: string }>) => bans.map(ban => ({
    general_chat: 'General Chat',
    board_news_chat: 'News Chat',
    all_interaction: 'All Interaction',
  }[ban.scope] ?? ban.scope)).join(', '),
  notifyChannelBansChanged: (...args: unknown[]) => mockNotifyChannelBansChanged(...args),
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
  mockUseUserChannelBans.mockReturnValue({ bans: [], loading: false, refresh: jest.fn() })
  mockSetUserChannelBans.mockResolvedValue([])
  mockSetSubAdminStatus.mockResolvedValue(undefined)
  mockGetOrCreateDMConversation.mockResolvedValue(null)
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
    await browserUser.type(screen.getByLabelText(/public reason/i), 'Spam in the channel')
  })
  await act(async () => {
    await browserUser.click(screen.getByRole('button', { name: /save bans/i }))
  })

  await waitFor(() => {
    expect(mockSetUserChannelBans).toHaveBeenCalledWith(user.id, ['general_chat'], 1440, 'Spam in the channel')
  })
  expect(mockNotifyChannelBansChanged).toHaveBeenCalledWith(user.id)
  expect(mockToastSuccess).toHaveBeenCalledWith('Channel bans updated')
})

test('lets the full admin grant sub-admin access from the profile dialog', async () => {
  const browserUser = userEvent.setup()
  mockUseAuth.mockReturnValue({ profile: adminUser })

  render(<PublicProfileDialog user={user} open onClose={jest.fn()} />)

  await act(async () => {
    await browserUser.click(screen.getByRole('button', { name: /make sub-admin/i }))
  })

  await waitFor(() => {
    expect(mockSetSubAdminStatus).toHaveBeenCalledWith(user.id, true)
  })
  expect(mockToastSuccess).toHaveBeenCalledWith('Sub-admin access granted')
})

test('offers a Message CTA that jumps into a DM thread', async () => {
  const browserUser = userEvent.setup()
  const onClose = jest.fn()
  mockUseAuth.mockReturnValue({ profile: { ...adminUser, id: 'viewer-1', admin_role: null } })
  mockGetOrCreateDMConversation.mockResolvedValue('conv-1')

  window.history.replaceState({}, '', 'http://localhost/?view=chat')
  render(<PublicProfileDialog user={user} open onClose={onClose} />)
  await act(async () => {
    await browserUser.click(screen.getByRole('button', { name: /message/i }))
  })
  await waitFor(() => {
    expect(mockGetOrCreateDMConversation).toHaveBeenCalledWith(user.id)
  })
  expect(onClose).toHaveBeenCalled()
  expect(window.location.search).toContain('view=dms')
  expect(window.location.search).toContain('conversation=conv-1')
})
