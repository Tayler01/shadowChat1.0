import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { SettingsView } from '../src/components/settings/SettingsView'

const mockUpsertSource = jest.fn()
const mockSetSourceEnabled = jest.fn()
const mockRefreshNewsAdmin = jest.fn()
const mockUseNewsAdmin = jest.fn(() => ({
  isAdmin: true,
  sources: [
    {
      id: 'source-1',
      platform: 'x',
      handle: 'OpenAI',
      normalized_handle: 'openai',
      display_name: 'OpenAI',
      profile_url: 'https://x.com/OpenAI',
      external_account_id: null,
      enabled: true,
      last_checked_at: null,
      last_success_at: null,
      last_error: null,
      health_status: 'pending',
      scrape_config: {},
      created_by: null,
      created_at: '2026-04-30T00:00:00.000Z',
      updated_at: '2026-04-30T00:00:00.000Z',
    },
  ],
  loading: false,
  saving: false,
  error: null,
  refresh: mockRefreshNewsAdmin,
  upsertSource: mockUpsertSource,
  setSourceEnabled: mockSetSourceEnabled,
}))

jest.mock('../src/hooks/useIsDesktop', () => ({
  useIsDesktop: () => true,
}))

jest.mock('../src/hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({ enabled: true, setEnabled: jest.fn() }),
}))

jest.mock('../src/hooks/useSuggestedReplies', () => ({
  useSuggestionsEnabled: () => ({ enabled: false, setEnabled: jest.fn() }),
}))

jest.mock('../src/hooks/useTheme', () => ({
  useTheme: () => ({ scheme: 'obsidian-gold', setScheme: jest.fn() }),
  colorSchemes: {
    'obsidian-gold': { label: 'Obsidian Gold', start: '#111111', end: '#d7aa46' },
    'carbon-ivory': { label: 'Carbon Ivory', start: '#111111', end: '#c8b08a' },
  },
}))

jest.mock('../src/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    supported: true,
    canPrompt: true,
    supportReason: '',
    permission: 'granted',
    guidance: 'supported',
    guidanceText: '',
    preferences: {
      dm_enabled: true,
      mention_enabled: true,
      reply_enabled: true,
      reaction_enabled: false,
      group_enabled: true,
    },
    subscribed: true,
    loading: false,
    saving: false,
    error: '',
    enablePush: jest.fn(),
    disablePush: jest.fn(),
    updatePreference: jest.fn(),
    refreshState: jest.fn(),
  }),
}))

jest.mock('../src/hooks/usePwaInstallPrompt', () => ({
  usePwaInstallPrompt: () => ({
    canInstall: false,
    promptInstall: jest.fn().mockResolvedValue(null),
  }),
}))

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ signOut: jest.fn() }),
}))

jest.mock('../src/hooks/useNewsAdmin', () => ({
  useNewsAdmin: () => mockUseNewsAdmin(),
}))

jest.mock('../src/lib/bridge', () => ({
  approveBridgePairing: jest.fn(),
}))

jest.mock('../src/components/profile/ProfileView', () => ({
  ProfileView: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="embedded-profile" data-embedded={embedded ? 'true' : 'false'} />
  ),
}))

jest.mock('../src/components/settings/NotificationSetupModal', () => ({
  NotificationSetupModal: () => null,
}))

jest.mock('../src/components/settings/FeedbackSubmissionModal', () => ({
  FeedbackSubmissionModal: () => null,
}))

jest.mock('../src/components/onboarding/PhoneInstallGuide', () => ({
  PhoneInstallGuide: () => null,
}))

jest.mock('react-hot-toast', () => {
  const toastFn = jest.fn() as any
  toastFn.error = jest.fn()
  toastFn.success = jest.fn()
  return { __esModule: true, default: toastFn }
})

test('settings renders section hub and opens account profile detail', () => {
  render(<SettingsView onToggleSidebar={jest.fn()} />)

  expect(screen.getByRole('button', { name: /notifications & audio/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /app setup & user guide/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /account & profile/i })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /account & profile/i }))

  expect(screen.getByRole('heading', { name: 'Account & Profile' })).toBeInTheDocument()
  expect(screen.getByTestId('embedded-profile')).toHaveAttribute('data-embedded', 'true')

  fireEvent.click(screen.getByRole('button', { name: /settings/i }))
  expect(screen.getByRole('button', { name: /notifications & audio/i })).toBeInTheDocument()
})

test('settings admin panel manages news sources', () => {
  render(<SettingsView onToggleSidebar={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: /admin/i }))

  expect(screen.getByRole('heading', { name: 'News Sources' })).toBeInTheDocument()
  expect(screen.getByText('@openai')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/handle/i), { target: { value: 'ShadoNews' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))

  return waitFor(() => {
    expect(mockUpsertSource).toHaveBeenCalledWith({
      platform: 'x',
      handle: 'ShadoNews',
      displayName: undefined,
      profileUrl: undefined,
    })
  })
})
