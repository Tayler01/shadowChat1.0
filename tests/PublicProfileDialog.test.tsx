import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PublicProfileDialog } from '../src/components/profile/PublicProfileDialog'
import type { User } from '../src/lib/supabase'

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
