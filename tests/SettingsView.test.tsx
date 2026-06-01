import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { SettingsView } from '../src/components/settings/SettingsView'

const mockUpsertSource = jest.fn()
const mockSetSourceEnabled = jest.fn()
const mockDeleteSource = jest.fn()
const mockRefreshNewsAdmin = jest.fn()
const mockUpdateSubAdmin = jest.fn()
const mockUpdatePreference = jest.fn()
const mockDeleteAccount = jest.fn()
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
  deleteSource: mockDeleteSource,
}))

jest.mock('../src/hooks/useIsDesktop', () => ({
  useIsDesktop: () => true,
}))

jest.mock('../src/components/chat/WeatherWidget', () => ({
  WeatherWidget: () => <div data-testid="weather-widget" />,
}))

jest.mock('../src/hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({ enabled: true, setEnabled: jest.fn() }),
}))

jest.mock('../src/hooks/useTheme', () => ({
  useTheme: () => ({ scheme: 'obsidian-gold', setScheme: jest.fn() }),
  colorSchemes: {
    'obsidian-gold': { label: 'Obsidian Gold', description: 'Gold glass', start: '#111111', end: '#d7aa46', mode: 'dark', preview: '/themes/obsidian-gold/preview.webp' },
    'aurora-veil': { label: 'Aurora Veil', description: 'Aurora glass', start: '#112233', end: '#58d7d5', mode: 'dark', preview: '/themes/aurora-veil/preview.webp' },
    'neon-circuit': { label: 'Neon Circuit', description: 'Neon glass', start: '#071020', end: '#ff4fd8', mode: 'dark', preview: '/themes/neon-circuit/preview.webp' },
    'moonstone-light': { label: 'Moonstone Light', description: 'Pearl daylight', start: '#fff8e8', end: '#5c82c8', mode: 'light', preview: '/themes/moonstone-light/preview.webp' },
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
    updatePreference: mockUpdatePreference,
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
  useAuth: () => ({
    signOut: jest.fn(),
    deleteAccount: mockDeleteAccount,
    user: { id: 'admin-1', username: 'caleb', display_name: 'Caleb', admin_role: 'admin' },
  }),
}))

jest.mock('../src/hooks/useNewsAdmin', () => ({
  useNewsAdmin: () => mockUseNewsAdmin(),
}))

jest.mock('../src/hooks/useAdminAccess', () => ({
  useAdminAccess: () => ({
    role: 'admin',
    isAdmin: true,
    isOperator: true,
    users: [
      {
        id: 'admin-1',
        email: 'caleb@example.com',
        username: 'caleb',
        display_name: 'Caleb',
        avatar_url: null,
        banner_url: null,
        status: 'online',
        status_message: '',
        color: '#d7aa46',
        admin_role: 'admin',
        last_active: '2026-04-30T00:00:00.000Z',
        created_at: '2026-04-30T00:00:00.000Z',
        updated_at: '2026-04-30T00:00:00.000Z',
      },
      {
        id: 'user-2',
        email: 'shadow@example.com',
        username: 'shadow',
        display_name: 'Shadow',
        avatar_url: null,
        banner_url: null,
        status: 'online',
        status_message: '',
        color: '#d7aa46',
        admin_role: null,
        last_active: '2026-04-30T00:00:00.000Z',
        created_at: '2026-04-30T00:00:00.000Z',
        updated_at: '2026-04-30T00:00:00.000Z',
      },
    ],
    loading: false,
    savingUserId: null,
    error: null,
    refresh: jest.fn(),
    updateSubAdmin: mockUpdateSubAdmin,
  }),
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

jest.mock('../src/components/settings/AdminFeedbackReview', () => ({
  AdminFeedbackReview: () => <div data-testid="admin-feedback-review">Feedback review panel</div>,
}))

jest.mock('../src/components/settings/ShadowPinActivityAdmin', () => ({
  ShadowPinActivityAdmin: () => <div data-testid="shadow-pin-activity-admin">Shadow Pin activity panel</div>,
}))

jest.mock('../src/components/settings/WeatherLocationSettings', () => ({
  WeatherLocationSettings: () => <div data-testid="weather-location-settings">Weather location settings</div>,
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

beforeEach(() => {
  jest.clearAllMocks()
  window.scrollTo = jest.fn()
  window.sessionStorage.clear()
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('settings renders section hub and opens account profile detail', () => {
  render(<SettingsView onToggleSidebar={jest.fn()} />)

  expect(screen.getByRole('button', { name: /notifications & audio/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /app setup & user guide/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /account & profile/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^ai$/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /data & privacy/i })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /account & profile/i }))

  expect(screen.getByRole('heading', { name: 'Account & Profile' })).toBeInTheDocument()
  expect(screen.getByTestId('embedded-profile')).toHaveAttribute('data-embedded', 'true')
  expect(screen.queryByRole('button', { name: /back to settings/i })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
  expect(screen.getByRole('button', { name: /notifications & audio/i })).toBeInTheDocument()
})

test('settings notification toggles save independently', () => {
  render(<SettingsView onToggleSidebar={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: /notifications & audio/i }))
  fireEvent.click(screen.getByRole('switch', { name: /toggle reactions/i }))
  fireEvent.click(screen.getByRole('switch', { name: /toggle group chat/i }))

  expect(mockUpdatePreference).toHaveBeenCalledWith('reaction_enabled', true)
  expect(mockUpdatePreference).toHaveBeenCalledWith('group_enabled', false)
})

test('settings protects account deletion behind typed confirmation', async () => {
  jest.spyOn(window, 'confirm').mockReturnValueOnce(true)
  mockDeleteAccount.mockResolvedValueOnce(undefined)

  render(<SettingsView onToggleSidebar={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: /account & profile/i }))
  fireEvent.click(screen.getByRole('button', { name: /^delete account$/i }))
  fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } })
  fireEvent.click(screen.getByRole('button', { name: /permanently delete/i }))

  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Permanently delete your Shadow Chat account'))
  await waitFor(() => {
    expect(mockDeleteAccount).toHaveBeenCalled()
  })
})

test('settings opens account profile from requested weather settings section', () => {
  window.sessionStorage.setItem('shadowchat:settings-section', 'account-profile')

  render(<SettingsView onToggleSidebar={jest.fn()} />)

  expect(screen.getByRole('heading', { name: 'Account & Profile' })).toBeInTheDocument()
  expect(screen.getByTestId('weather-location-settings')).toBeInTheDocument()
  expect(window.sessionStorage.getItem('shadowchat:settings-section')).toBeNull()
})

test('settings admin panel manages news sources', async () => {
  render(<SettingsView onToggleSidebar={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: /admin/i }))

  expect(screen.getByRole('heading', { name: 'Admin Sections' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /admin access/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /esp bridge pairing/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /shadow pin activity/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /news sources/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /feedback review/i })).toBeInTheDocument()
  expect(screen.queryByText('shadow@example.com')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /admin access/i }))

  expect(screen.getByRole('heading', { name: 'Admin Access' })).toBeInTheDocument()
  expect(screen.getByText('shadow@example.com')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /back to admin sections/i }))
  fireEvent.click(screen.getByRole('button', { name: /news sources/i }))

  expect(screen.getByRole('heading', { name: 'News Sources' })).toBeInTheDocument()
  expect(screen.getByText('@openai')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/handle/i), { target: { value: 'ShadoNews' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))

  await waitFor(() => {
    expect(mockUpsertSource).toHaveBeenCalledWith({
      platform: 'x',
      handle: 'ShadoNews',
      displayName: undefined,
      profileUrl: undefined,
    })
  })
})

test('settings admin panel deletes news tracker accounts after confirmation', async () => {
  jest.spyOn(window, 'confirm').mockReturnValueOnce(true)
  mockDeleteSource.mockResolvedValueOnce(undefined)

  render(<SettingsView onToggleSidebar={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: /admin/i }))
  fireEvent.click(screen.getByRole('button', { name: /news sources/i }))
  fireEvent.click(screen.getByRole('button', { name: /delete openai from news tracker/i }))

  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Delete OpenAI from the news tracker'))
  await waitFor(() => {
    expect(mockDeleteSource).toHaveBeenCalledWith('source-1')
  })
})

test('settings admin panel opens feedback review', () => {
  render(<SettingsView onToggleSidebar={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: /admin/i }))
  fireEvent.click(screen.getByRole('button', { name: /feedback review/i }))

  expect(screen.getByTestId('admin-feedback-review')).toBeInTheDocument()
})

test('settings admin panel opens Shadow Pin activity', async () => {
  render(<SettingsView onToggleSidebar={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: /admin/i }))
  fireEvent.click(screen.getByRole('button', { name: /shadow pin activity/i }))

  expect(await screen.findByTestId('shadow-pin-activity-admin')).toBeInTheDocument()
})
