import { fireEvent, render, screen } from '@testing-library/react'
import { FirstRunActivationJourney } from '../src/features/activation/FirstRunActivationJourney'

const baseProps = {
  open: true,
  step: 'identity' as const,
  profile: {
    id: 'user-1', username: 'new_member', display_name: '', status_message: '', avatar_url: null,
  },
  selectedPreset: 'follow-device' as const,
  notificationsSupported: true,
  notificationsSubscribed: false,
  busy: false,
  error: null,
  onClose: jest.fn(),
  onIdentity: jest.fn().mockResolvedValue(undefined),
  onPresetChange: jest.fn(),
  onEnableNotifications: jest.fn().mockResolvedValue(undefined),
  onNotificationsLater: jest.fn().mockResolvedValue(undefined),
  onFirstAction: jest.fn().mockResolvedValue(undefined),
}

beforeEach(() => jest.clearAllMocks())

test('requires a display name and keeps optional identity controls phone-sized', () => {
  render(<FirstRunActivationJourney {...baseProps} />)
  const continueButton = screen.getByRole('button', { name: 'Continue' })
  expect(continueButton).toBeDisabled()
  expect(screen.getByText('Add a photo').closest('label')).toHaveClass('min-h-12')
  fireEvent.change(screen.getByRole('textbox', { name: /display name/i }), { target: { value: 'New Member' } })
  fireEvent.click(continueButton)
  expect(baseProps.onIdentity).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'New Member' }))
})

test('applies shared Comfort presets and exposes notifications as explicit choices', () => {
  render(<FirstRunActivationJourney {...baseProps} step="preferences" notificationsSupported={false} />)
  fireEvent.click(screen.getByRole('button', { name: /Calm/i }))
  expect(baseProps.onPresetChange).toHaveBeenCalledWith('calm')
  fireEvent.click(screen.getByRole('button', { name: /continue without notifications/i }))
  expect(baseProps.onEnableNotifications).toHaveBeenCalledTimes(1)
  expect(screen.getByText(/permission prompt appears only/i)).toBeInTheDocument()
})

test('presents existing custom Comfort settings truthfully without replacing them', () => {
  render(<FirstRunActivationJourney {...baseProps} step="preferences" selectedPreset="custom" />)
  expect(screen.getByText('Custom settings active')).toBeInTheDocument()
  expect(screen.getByText(/will stay unchanged unless you choose a preset/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Follow my phone/i })).toHaveAttribute('aria-pressed', 'false')
})

test('hands first-move selection outward without claiming completion', () => {
  render(<FirstRunActivationJourney {...baseProps} step="first_action" />)
  fireEvent.click(screen.getByRole('button', { name: /Heart a Pin/i }))
  expect(baseProps.onFirstAction).toHaveBeenCalledWith('shadow_pin_heart')
  expect(screen.getByText(/confirmed by the server/i)).toBeInTheDocument()
})
