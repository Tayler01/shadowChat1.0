import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ActiveUsersView } from '../src/components/chat/ActiveUsersView'
import { getUserProfile } from '../src/lib/auth'

const refresh = jest.fn()
const usePresence = jest.fn()

jest.mock('../src/hooks/usePresence', () => ({
  usePresence: () => usePresence(),
}))

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'self' },
    profile: { id: 'self' },
  }),
}))

jest.mock('../src/lib/auth', () => ({
  getUserProfile: jest.fn(),
}))

jest.mock('../src/features/connections/ConnectionControl', () => ({
  ConnectionControl: ({ user }: { user: { id: string } }) => (
    <button type="button" data-testid={`connection-control-${user.id}`}>Connect</button>
  ),
}))

jest.mock('../src/components/profile/PublicProfileDialog', () => ({
  PublicProfileDialog: ({ user, open }: { user: { display_name: string }; open: boolean }) => (
    open ? <div role="dialog" aria-label="Public profile">{user.display_name}</div> : null
  ),
}))

jest.mock('../src/components/layout/MobileAppHeader', () => ({
  MobileAppHeader: () => null,
}))

jest.mock('../src/components/ui/Avatar', () => ({
  Avatar: ({ alt }: { alt: string }) => <div aria-label={alt} />,
}))

beforeEach(() => {
  jest.clearAllMocks()
  refresh.mockResolvedValue(undefined)
  usePresence.mockReturnValue({
    refresh,
    activeUsers: [
      {
        user_id: 'self',
        username: 'me',
        display_name: 'Me',
        avatar_url: null,
        color: '#d7aa46',
        is_active: true,
      },
      {
        user_id: 'friend',
        username: 'friend',
        display_name: 'Friend',
        avatar_url: null,
        color: '#d7aa46',
        is_active: true,
      },
    ],
  })
  ;(getUserProfile as jest.Mock).mockResolvedValue({
    id: 'friend',
    username: 'friend',
    display_name: 'Friend Canonical',
    status_message: '',
    last_active: '',
    created_at: '',
    updated_at: '',
  })
})

test('shows the live count, keeps self action-free, and opens a canonical profile', async () => {
  render(<ActiveUsersView currentView="active-users" onViewChange={jest.fn()} />)

  expect(screen.getByRole('heading', { name: 'Active now' })).toBeInTheDocument()
  expect(screen.getByText('2', { selector: 'span' })).toBeInTheDocument()
  expect(screen.queryByTestId('connection-control-self')).not.toBeInTheDocument()
  expect(screen.getByTestId('connection-control-friend')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: "Open Friend's profile" }))

  await waitFor(() => expect(getUserProfile).toHaveBeenCalledWith('friend'))
  expect(await screen.findByRole('dialog', { name: 'Public profile' })).toHaveTextContent('Friend Canonical')
})

test('refreshes the shared presence store and renders the quiet state', async () => {
  usePresence.mockReturnValue({ refresh, activeUsers: [] })
  render(<ActiveUsersView currentView="active-users" onViewChange={jest.fn()} />)

  expect(screen.getByText('It is quiet right now')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh active users' }))

  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(screen.getByText('Active users are current.')).toBeInTheDocument()
})
