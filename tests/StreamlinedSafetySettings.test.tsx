jest.mock('../src/hooks/useAuth', () => jest.requireMock('../apps/streamlined/src-overrides/hooks/useAuth'))
jest.mock('../src/lib/supabase', () => jest.requireMock('../apps/streamlined/src-overrides/lib/supabase'))
import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StreamlinedAccountSettings, StreamlinedSettings } from '../src/streamlined/StreamlinedSettings'
import { useAuth } from '../apps/streamlined/src-overrides/hooks/useAuth'
import { useAdminAccess } from '../src/hooks/useAdminAccess'
import { listMyModerationReports } from '../src/lib/moderationCases'
import { getWorkingClient } from '../apps/streamlined/src-overrides/lib/supabase'

jest.mock('../apps/streamlined/src-overrides/hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../src/hooks/useAdminAccess', () => ({ useAdminAccess: jest.fn() }))
jest.mock('../src/hooks/usePwaInstallPrompt', () => ({ usePwaInstallPrompt: () => ({}) }))
jest.mock('../src/hooks/usePushNotifications', () => ({ usePushNotifications: () => ({}) }))
jest.mock('../src/lib/push', () => ({ getBrowserTimeZone: () => 'UTC' }))
jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({ getWorkingClient: jest.fn(), getRealtimeClient: jest.fn() }))
jest.mock('../src/lib/moderationCases', () => ({
  listMyModerationReports: jest.fn(),
  formatModerationCaseReference: (value: number) => `SC-${String(value).padStart(6, '0')}`,
  MODERATION_REPORT_REASONS: [{ value: 'harassment', label: 'Harassment or bullying' }],
}))
jest.mock('../src/components/layout/MobileAppHeader', () => ({
  MobileAppHeader: ({ title, onBack, backLabel }: { title: string; onBack: () => void; backLabel: string }) => (
    <header><h1>{title}</h1><button onClick={onBack}>{backLabel}</button></header>
  ),
}))
jest.mock('../src/components/profile/ProfileView', () => ({ ProfileView: () => <div>Profile controls</div> }))
jest.mock('../src/components/settings/BlockedUsersSettings', () => ({ BlockedUsersSettings: () => <div>Blocked member controls</div> }))
jest.mock('../src/components/settings/AccessibilityComfortPanel', () => ({ AccessibilityComfortPanel: () => <div>Comfort controls</div> }))

const deleteAccount = jest.fn()
const onViewChange = jest.fn()
const reportSubscription = { on: jest.fn(), subscribe: jest.fn() }
const client = { channel: jest.fn(), removeChannel: jest.fn() }

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState({}, '', '/?view=settings')
  window.sessionStorage.clear()
  jest.mocked(useAuth).mockReturnValue({
    user: { id: 'member-1', email: 'member@example.test' },
    sendPasswordReset: jest.fn(),
    signOut: jest.fn(),
    deleteAccount,
  } as unknown as ReturnType<typeof useAuth>)
  jest.mocked(useAdminAccess).mockReturnValue({ isOperator: false } as ReturnType<typeof useAdminAccess>)
  jest.mocked(listMyModerationReports).mockResolvedValue([{
    reportId: 'report-1',
    caseNumber: 73,
    targetType: 'general_message',
    category: 'harassment',
    status: 'investigating',
    targetPreview: 'The message you reported',
    reporterSummary: 'Your report is being reviewed.',
    submittedAt: '2026-10-22T12:00:00.000Z',
    updatedAt: '2026-10-22T12:10:00.000Z',
  }])
  reportSubscription.on.mockReturnValue(reportSubscription)
  reportSubscription.subscribe.mockReturnValue(reportSubscription)
  client.channel.mockReturnValue(reportSubscription)
  jest.mocked(getWorkingClient).mockResolvedValue(client)
})

test('restricted account access permits leaving or deleting without profile uploads or edits', () => {
  render(<StreamlinedAccountSettings allowProfileEditing={false} />)
  expect(screen.queryByText('Profile controls')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument()
  expect(deleteAccount).not.toHaveBeenCalled()
})

test('main settings has no app header or redundant back navigation', () => {
  const { container } = render(<StreamlinedSettings currentView="settings" onViewChange={onViewChange} />)
  expect(container.querySelector('header')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Settings' })).toHaveClass('sr-only')
  expect(screen.queryByRole('button', { name: /Back to/ })).not.toBeInTheDocument()
})

test('opens private report history and subscribes only to this member updates', async () => {
  render(<StreamlinedSettings currentView="settings" onViewChange={onViewChange} fullAppUrl="https://shadochat.online" />)
  fireEvent.click(screen.getByRole('button', { name: /^Safety reports/i }))

  expect(await screen.findByRole('heading', { name: 'My Safety Reports' })).toBeInTheDocument()
  expect(screen.getByText('SC-000073')).toBeInTheDocument()
  expect(screen.getByText('Your report is being reviewed.')).toBeInTheDocument()
  expect(reportSubscription.on).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({
    table: 'moderation_report_updates',
    filter: 'recipient_user_id=eq.member-1',
  }), expect.any(Function))
  expect(screen.queryByRole('link', { name: /Open full app admin/i })).not.toBeInTheDocument()
})

test('accepts the safety deep link and preserves operator-only case-center access', async () => {
  window.history.replaceState({}, '', '/?view=settings&settingsSection=safety')
  jest.mocked(useAdminAccess).mockReturnValue({ isOperator: true } as ReturnType<typeof useAdminAccess>)
  render(<StreamlinedSettings currentView="settings" onViewChange={onViewChange} fullAppUrl="https://shadochat.online" />)

  expect(await screen.findByRole('heading', { name: 'My Safety Reports' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Open full app admin/i })).toHaveAttribute('href', 'https://shadochat.online/?view=settings&settingsSection=admin')
})

test('lands account deep links on actual account deletion without taking any destructive action', async () => {
  window.history.replaceState({}, '', '/?view=settings&settingsSection=account')
  render(<StreamlinedSettings currentView="settings" onViewChange={onViewChange} />)

  expect(await screen.findByRole('heading', { name: 'Delete account' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
  expect(screen.getByRole('button', { name: 'Permanently delete account' })).toBeDisabled()
  expect(deleteAccount).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Back to settings' }))
  await waitFor(() => expect(new URL(window.location.href).searchParams.has('settingsSection')).toBe(false))
})

test('keeps blocking and local policy links in the privacy section', async () => {
  window.history.replaceState({}, '', '/?view=settings&settingsSection=privacy')
  render(<StreamlinedSettings currentView="settings" onViewChange={onViewChange} />)

  expect(await screen.findByText('Blocked member controls')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/?legal=privacy')
  expect(screen.getByRole('link', { name: 'Terms of use' })).toHaveAttribute('href', '/?legal=terms')
})

test('consumes supported legacy storage navigation after StrictMode initialization', async () => {
  window.sessionStorage.setItem('shadowchat:settings-section', 'account-profile')
  render(<StrictMode><StreamlinedSettings currentView="settings" onViewChange={onViewChange} /></StrictMode>)

  expect(await screen.findByRole('heading', { name: 'Delete account' })).toBeInTheDocument()
  expect(window.sessionStorage.getItem('shadowchat:settings-section')).toBeNull()
})

test.each(['admin', 'games', '__proto__'])('ignores unsupported settings section %s', value => {
  window.history.replaceState({}, '', `/?view=settings&settingsSection=${value}`)
  render(<StreamlinedSettings currentView="settings" onViewChange={onViewChange} />)

  expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Account/i })).toBeInTheDocument()
  expect(deleteAccount).not.toHaveBeenCalled()
})
