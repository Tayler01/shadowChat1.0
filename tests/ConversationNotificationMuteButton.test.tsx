import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConversationNotificationMuteButton } from '../src/components/notifications/ConversationNotificationMuteButton'
import {
  fetchConversationNotificationMute,
  setConversationNotificationMute,
} from '../src/lib/push'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

jest.mock('../src/lib/push', () => ({
  fetchConversationNotificationMute: jest.fn(),
  setConversationNotificationMute: jest.fn(),
}))

jest.mock('react-hot-toast', () => {
  const toast = jest.fn() as any
  toast.success = jest.fn()
  toast.error = jest.fn()
  return { __esModule: true, default: toast }
})

const mockFetchMute = fetchConversationNotificationMute as jest.Mock
const mockSetMute = setConversationNotificationMute as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchMute.mockResolvedValue(false)
  mockSetMute.mockResolvedValue(true)
})

test('loads and toggles the private mute for the selected DM thread', async () => {
  render(
    <ConversationNotificationMuteButton
      conversationId="conversation-1"
      conversationLabel="Caleb"
    />
  )

  const button = await screen.findByRole('button', { name: 'Mute notifications for Caleb' })
  await waitFor(() => expect(button).not.toBeDisabled())
  fireEvent.click(button)

  await waitFor(() => {
    expect(mockSetMute).toHaveBeenCalledWith('user-1', 'conversation-1', true)
  })
  expect(screen.getByRole('button', { name: 'Resume notifications for Caleb' }))
    .toHaveAttribute('aria-pressed', 'true')
})

test('shows the muted state returned by the backend', async () => {
  mockFetchMute.mockResolvedValue(true)

  render(
    <ConversationNotificationMuteButton
      conversationId="conversation-1"
      conversationLabel="Caleb"
    />
  )

  expect(await screen.findByRole('button', { name: 'Resume notifications for Caleb' }))
    .toHaveAttribute('aria-pressed', 'true')
})
