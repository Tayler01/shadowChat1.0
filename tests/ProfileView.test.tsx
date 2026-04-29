import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProfileView } from '../src/components/profile/ProfileView'
import type { User } from '../src/lib/supabase'

const updateProfile = jest.fn()
const uploadAvatar = jest.fn()
const uploadBanner = jest.fn()

const profile = {
  id: 'u1',
  email: 'smoke@example.com',
  username: 'smoke',
  display_name: 'Smoke User',
  avatar_url: '',
  banner_url: '',
  status: 'online',
  status_message: 'Existing bio',
  color: '#d7aa46',
  last_active: '2026-04-28T00:00:00.000Z',
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-28T00:00:00.000Z',
} as User

jest.mock('../src/hooks/useIsDesktop', () => ({
  useIsDesktop: () => true,
}))

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    profile,
    updateProfile,
    uploadAvatar,
    uploadBanner,
  }),
}))

jest.mock('../src/lib/supabase', () => ({
  fetchUserStats: jest.fn(() => new Promise(() => {})),
}))

jest.mock('react-hot-toast', () => {
  const toastFn = jest.fn() as any
  toastFn.error = jest.fn()
  toastFn.success = jest.fn()
  return { __esModule: true, default: toastFn }
})

beforeEach(() => {
  jest.clearAllMocks()
})

test('edits bio through the profile form', async () => {
  render(<ProfileView onToggleSidebar={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: /edit profile/i }))
  fireEvent.change(screen.getByLabelText(/bio/i), {
    target: { value: 'Updated public bio' },
  })
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

  await waitFor(() => {
    expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      status_message: 'Updated public bio',
    }))
  })
})

test('keeps profile image controls visually anchored and visible', () => {
  render(<ProfileView onToggleSidebar={jest.fn()} />)

  expect(screen.getByRole('button', { name: /change avatar/i })).toHaveClass('-bottom-2')
  expect(screen.getByRole('button', { name: /change avatar/i })).toHaveClass('right-1')
  expect(screen.getByRole('button', { name: /change banner image/i }).className).toContain('rgba(255,240,184,0.46)')
})
