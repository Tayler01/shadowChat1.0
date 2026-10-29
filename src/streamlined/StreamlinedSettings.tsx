import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { Accessibility, Bell, ChevronRight, ExternalLink, RotateCcw, Shield, ShieldAlert, UserRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { NotificationSetupModal } from '../components/settings/NotificationSetupModal'
import { Button } from '../components/ui/Button'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { useAuth } from '../../apps/streamlined/src-overrides/hooks/useAuth'
import { useAdminAccess } from '../hooks/useAdminAccess'
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { COMFORT_RESET_EVENT } from '../lib/comfortPreferences'
import { getBrowserTimeZone, type NotificationPreferences } from '../lib/push'
import type { AppView } from '../types/navigation'
import { canChangeNativeCommunity, requestNativeCommunityChooser } from './nativeCommunity'

const ProfileView = lazy(() => import('../components/profile/ProfileView').then(module => ({ default: module.ProfileView })))
const BlockedUsersSettings = lazy(() => import('../components/settings/BlockedUsersSettings').then(module => ({ default: module.BlockedUsersSettings })))
const AccessibilityComfortPanel = lazy(() => import('../components/settings/AccessibilityComfortPanel').then(module => ({ default: module.AccessibilityComfortPanel })))
const MyReportsPanel = lazy(() => import('../features/moderation/MyReportsPanel').then(module => ({ default: module.MyReportsPanel })))

const sections = [
  { id: 'account', title: 'Account', description: 'Profile, password and sign-in.', icon: UserRound },
  { id: 'notifications', title: 'Notifications', description: 'Messages, ShadowPin and notification privacy.', icon: Bell },
  { id: 'privacy', title: 'Privacy', description: 'Manage the people you have blocked.', icon: Shield },
  { id: 'safety-reports', title: 'Safety reports', description: 'Your private reports and operator updates.', icon: ShieldAlert },
  { id: 'comfort', title: 'Accessibility & comfort', description: 'Text, touch, motion, media and sounds.', icon: Accessibility },
] as const

type SettingsSection = typeof sections[number]['id']

const SETTINGS_SECTION_STORAGE_KEY = 'shadowchat:settings-section'
const settingsAliases: Record<string, SettingsSection> = {
  safety: 'safety-reports',
  'account-profile': 'account',
  'notifications-audio': 'notifications',
  'accessibility-comfort': 'comfort',
}

const parseSettingsSection = (value: string | null): SettingsSection | null => {
  if (!value) return null
  const alias = Object.prototype.hasOwnProperty.call(settingsAliases, value) ? settingsAliases[value] : null
  if (alias) return alias
  return sections.some(section => section.id === value) ? value as SettingsSection : null
}

const getInitialSettingsSection = (): SettingsSection | null => {
  if (typeof window === 'undefined') return null
  const requestedSection = parseSettingsSection(new URL(window.location.href).searchParams.get('settingsSection'))
  if (requestedSection) return requestedSection
  try {
    return parseSettingsSection(window.sessionStorage.getItem(SETTINGS_SECTION_STORAGE_KEY))
  } catch {
    return null
  }
}

interface StreamlinedSettingsProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  fullAppUrl?: string
  privacyUrl?: string
  termsUrl?: string
}

function PanelLoading() {
  return <div className="flex items-center gap-3 p-5 text-[var(--text-muted)]" role="status"><LoadingSpinner size="sm" />Loading settings...</div>
}

function SettingToggle({ label, description, checked, disabled, onChange }: {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block font-medium text-[var(--text-primary)]">{label}</span>
        {description && <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{description}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} className="h-6 w-6 shrink-0 accent-[var(--theme-accent-readable)]" />
    </label>
  )
}

function NotificationsSettings() {
  const push = usePushNotifications()
  const { canInstall, promptInstall } = usePwaInstallPrompt()
  const [setupOpen, setSetupOpen] = useState(false)
  const preferences = push.preferences
  const busy = push.loading || push.saving

  const savePreferences = async (updates: Partial<Omit<NotificationPreferences, 'user_id'>>) => {
    try {
      await push.updatePreferences(updates)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save notification settings')
    }
  }

  const enablePush = async () => {
    try {
      await push.enablePush()
      setSetupOpen(false)
      toast.success('Notifications enabled on this device')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not enable notifications')
    }
  }

  const togglePush = async () => {
    try {
      if (push.subscribed) {
        await push.disablePush()
        toast.success('Notifications disabled on this device')
      } else if (push.nativeApp && push.permission === 'denied') {
        if (!push.openDeviceNotificationSettings()) throw new Error('Could not open device notification settings')
      } else if (push.nativeApp || (push.permission === 'granted' && push.supported && push.canPrompt)) {
        await enablePush()
      } else {
        setSetupOpen(true)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update device notifications')
    }
  }

  const quietHoursEnabled = Boolean(preferences?.quiet_hours_start && preferences?.quiet_hours_end)
  const snoozedUntil = preferences?.mute_until && new Date(preferences.mute_until).getTime() > Date.now()
    ? new Date(preferences.mute_until)
    : null
  const alertTypes = [
    ['dm_enabled', 'Direct messages'],
    ['group_enabled', 'Every group chat message'],
    ['mention_enabled', 'Mentions'],
    ['reply_enabled', 'Replies'],
    ['reaction_enabled', 'Reactions'],
    ['hype_enabled', 'Hype'],
    ['shadow_pin_new_post_enabled', 'New ShadowPin posts'],
    ['shadow_pin_comment_enabled', 'ShadowPin comments'],
    ['shadow_pin_reply_enabled', 'ShadowPin replies'],
  ] as const

  return (
    <div className="space-y-4">
      <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby="streamlined-device-notifications">
        <h2 id="streamlined-device-notifications" className="text-lg font-semibold">This device</h2>
        <SettingToggle label="Push notifications" description={busy ? 'Checking notification access...' : push.subscribed ? 'Enabled on this device.' : 'Get alerts when the app is in the background.'} checked={push.subscribed} disabled={busy} onChange={() => void togglePush()} />
        {push.supportReason && <p className="mb-3 text-sm text-[var(--text-muted)]">{push.supportReason}</p>}
        {push.error && <p className="mb-3 text-sm text-red-200" role="alert">{push.error}</p>}
        {!push.nativeApp && <Button variant="secondary" onClick={() => setSetupOpen(true)}>Notification setup</Button>}
      </section>

      {preferences && <>
        <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby="streamlined-alert-settings">
          <h2 id="streamlined-alert-settings" className="text-lg font-semibold">Alerts</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">These choices also apply to your account in the full app.</p>
          <SettingToggle label="Notifications" checked={preferences.notifications_enabled} disabled={busy} onChange={value => void savePreferences({ notifications_enabled: value })} />
          <SettingToggle label="Mute group chat" description="Pause group chat alerts while keeping direct messages available." checked={preferences.general_chat_muted} disabled={busy} onChange={value => void savePreferences({ general_chat_muted: value })} />
          <label className="mt-3 block">
            <span className="mb-2 block font-medium">Notification previews</span>
            <select value={preferences.notification_preview_mode} disabled={busy} onChange={event => void savePreferences({ notification_preview_mode: event.target.value as NotificationPreferences['notification_preview_mode'] })} className="obsidian-input min-h-12 w-full rounded-[var(--radius-sm)] px-3">
              <option value="full">Show sender and message</option>
              <option value="sender_only">Show sender only</option>
              <option value="private">Keep sender and message private</option>
            </select>
          </label>
          <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Your phone's lock-screen privacy and Focus settings also apply.</p>
          <details className="mt-4 border-t border-[var(--border-subtle)] pt-2">
            <summary className="min-h-12 cursor-pointer py-3 font-medium">Choose alerts</summary>
            <div className="divide-y divide-[var(--border-subtle)]">
              {alertTypes.map(([key, label]) => <SettingToggle key={key} label={label} checked={preferences[key]} disabled={busy} onChange={value => void savePreferences({ [key]: value })} />)}
            </div>
          </details>
        </section>

        <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby="streamlined-quiet-settings">
          <h2 id="streamlined-quiet-settings" className="text-lg font-semibold">Quiet time</h2>
          <SettingToggle label="Daily quiet hours" checked={quietHoursEnabled} disabled={busy} onChange={value => void savePreferences(value ? { quiet_hours_start: '22:00', quiet_hours_end: '07:00', quiet_hours_timezone: getBrowserTimeZone() } : { quiet_hours_start: null, quiet_hours_end: null })} />
          {quietHoursEnabled && <>
            <div className="grid grid-cols-2 gap-3">
              {(['quiet_hours_start', 'quiet_hours_end'] as const).map((key, index) => <label key={key} className="min-w-0">
                <span className="mb-2 block text-sm">{index === 0 ? 'Start' : 'End'}</span>
                <input type="time" value={preferences[key]?.slice(0, 5) ?? ''} disabled={busy} onChange={event => { if (event.target.value) void savePreferences({ [key]: event.target.value }) }} className="obsidian-input min-h-12 w-full min-w-0 rounded-[var(--radius-sm)] px-3" />
              </label>)}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">Time zone: {preferences.quiet_hours_timezone}</p>
          </>}
          <div className="mt-4">
            {snoozedUntil && <p className="mb-3 text-sm text-[var(--text-muted)]">Snoozed until {snoozedUntil.toLocaleString()}.</p>}
            <Button variant="secondary" disabled={busy} onClick={() => void savePreferences({ mute_until: snoozedUntil ? null : new Date(Date.now() + 60 * 60 * 1000).toISOString() })}>{snoozedUntil ? 'Resume notifications' : 'Snooze for one hour'}</Button>
          </div>
        </section>
      </>}
      {!push.nativeApp && <NotificationSetupModal open={setupOpen} guidance={push.guidance} guidanceText={push.guidanceText} saving={push.saving} canInstall={canInstall} onClose={() => setSetupOpen(false)} onEnable={enablePush} onInstall={async () => { await promptInstall() }} />}
    </div>
  )
}

export function StreamlinedAccountSettings({ allowProfileEditing = true }: { allowProfileEditing?: boolean }) {
  const { user, sendPasswordReset, signOut, deleteAccount } = useAuth()
  const [deleting, setDeleting] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState<'password' | 'signout' | 'delete' | 'community' | null>(null)

  const changeCommunity = async () => {
    if (busy || !canChangeNativeCommunity()) return
    if (!window.confirm('Sign out of this community and choose another?')) return
    setBusy('community')
    try {
      await signOut()
      if (!requestNativeCommunityChooser()) throw new Error('Open sign-in Settings to change community.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change community')
    } finally {
      setBusy(null)
    }
  }

  const resetPassword = async () => {
    if (!user?.email || busy) return
    setBusy('password')
    try {
      await sendPasswordReset(user.email)
      toast.success('Check your email for a password reset link')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send a password reset link')
    } finally {
      setBusy(null)
    }
  }

  const endSession = async () => {
    if (busy) return
    setBusy('signout')
    try {
      await signOut()
      toast.success('Signed out')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not sign out')
    } finally {
      setBusy(null)
    }
  }

  const removeAccount = async () => {
    if (busy || confirmation.trim().toUpperCase() !== 'DELETE') return
    if (!window.confirm('Permanently delete your ShadowChat account in both the streamlined and full app? This removes your login and cannot be undone.')) return
    setBusy('delete')
    try {
      await deleteAccount()
      toast.success('Account deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete your account')
    } finally {
      setBusy(null)
    }
  }

  return <div className="space-y-4">
    {allowProfileEditing && <ProfileView onToggleSidebar={() => {}} embedded />}
    <section className="glass-panel space-y-4 rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby="streamlined-signin-settings">
      <h2 id="streamlined-signin-settings" className="text-lg font-semibold">Sign-in</h2>
      {user?.email && <p className="break-words text-sm text-[var(--text-muted)]">{user.email}</p>}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" disabled={Boolean(busy) || !user?.email} loading={busy === 'password'} onClick={() => void resetPassword()}>Reset password</Button>
        <Button variant="secondary" disabled={Boolean(busy)} loading={busy === 'signout'} onClick={() => void endSession()}>Sign out</Button>
        {canChangeNativeCommunity() && <Button variant="secondary" style={{ minHeight: 'max(48px, var(--comfort-control-min-size))' }} disabled={Boolean(busy)} loading={busy === 'community'} onClick={() => void changeCommunity()}>Change community</Button>}
      </div>
    </section>
    <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby="streamlined-delete-account">
      <h2 id="streamlined-delete-account" className="text-lg font-semibold">Delete account</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Permanently delete your shared ShadowChat account. You will lose access to both the streamlined and full app. This cannot be undone.</p>
      <Button className="mt-4" variant={deleting ? 'secondary' : 'danger'} disabled={Boolean(busy)} onClick={() => { setDeleting(value => !value); setConfirmation('') }}>{deleting ? 'Cancel deletion' : 'Delete account'}</Button>
      {deleting && <div className="mt-4 space-y-4">
        <label className="block"><span className="mb-2 block font-medium">Type DELETE to confirm</span><input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoCapitalize="characters" spellCheck={false} autoComplete="off" disabled={Boolean(busy)} className="obsidian-input min-h-12 w-full rounded-[var(--radius-sm)] px-3" /></label>
        <Button variant="danger" disabled={Boolean(busy) || confirmation.trim().toUpperCase() !== 'DELETE'} loading={busy === 'delete'} onClick={() => void removeAccount()}>Permanently delete account</Button>
      </div>}
    </section>
  </div>
}

function OperatorToolsLink({ fullAppUrl }: { fullAppUrl: string }) {
  const { isOperator } = useAdminAccess({ includeUsers: false })
  if (!isOperator) return null
  const url = new URL(fullAppUrl)
  url.searchParams.set('view', 'settings')
  url.searchParams.set('settingsSection', 'admin')
  return <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5">
    <h2 className="font-semibold">Operator tools</h2>
    <p className="my-2 text-sm leading-6 text-[var(--text-muted)]">Invitations and the Safety Case Center are available under Settings &gt; Admin in the full app.</p>
    <a href={url.toString()} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 text-[var(--theme-accent-readable)] underline underline-offset-4">Open full app admin<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
  </section>
}

export function StreamlinedSettings({ fullAppUrl, privacyUrl = '/?legal=privacy', termsUrl = '/?legal=terms' }: StreamlinedSettingsProps) {
  const [section, setSection] = useState<SettingsSection | null>(getInitialSettingsSection)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeSection = sections.find(item => item.id === section)

  useEffect(() => {
    const openMain = () => setSection(null)
    window.addEventListener('shadowchat:settings-main', openMain)
    return () => window.removeEventListener('shadowchat:settings-main', openMain)
  }, [])

  useEffect(() => {
    try {
      if (parseSettingsSection(window.sessionStorage.getItem(SETTINGS_SECTION_STORAGE_KEY))) {
        window.sessionStorage.removeItem(SETTINGS_SECTION_STORAGE_KEY)
      }
    } catch {
      // The settings route remains usable when browser storage is unavailable.
    }
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('view') !== 'settings') return
    if (section) url.searchParams.set('settingsSection', section === 'safety-reports' ? 'safety' : section)
    else url.searchParams.delete('settingsSection')
    window.history.replaceState(window.history.state ?? {}, '', url)
  }, [section])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [section])

  return <div data-streamlined-settings="true" className="theme-app-surface flex h-full min-h-0 flex-col text-sm text-[var(--text-primary)]">
    <h1 className="sr-only">{activeSection?.title ?? 'Settings'}</h1>
    <div ref={scrollRef} className="streamlined-settings-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
      <div className="mx-auto w-full max-w-3xl">
        {section && <div className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-3 bg-[var(--bg-app)]">
          <button type="button" onClick={() => setSection(null)} className="inline-flex min-h-11 items-center rounded-full px-2 text-sm text-[var(--theme-accent-readable)]">Back to settings</button>
          {section === 'comfort' && <button type="button" onClick={() => window.dispatchEvent(new Event(COMFORT_RESET_EVENT))} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--theme-accent-readable)]" aria-label="Reset comfort settings"><RotateCcw className="h-5 w-5" aria-hidden="true" /></button>}
        </div>}
        {!section ? <div className="space-y-2">
          {sections.map(item => <button key={item.id} type="button" onClick={() => setSection(item.id)} className="glass-panel flex min-h-20 w-full items-center gap-3 rounded-[var(--radius-lg)] p-4 text-left transition-colors hover:border-[var(--border-glow)]">
            <item.icon className="h-5 w-5 shrink-0 text-[var(--theme-accent-readable)]" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block font-semibold">{item.title}</span><span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{item.description}</span></span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          </button>)}
        </div> : <Suspense fallback={<PanelLoading />}>
          {section === 'account' && <StreamlinedAccountSettings />}
          {section === 'notifications' && <NotificationsSettings />}
          {section === 'comfort' && <AccessibilityComfortPanel />}
          {section === 'safety-reports' && <div className="space-y-4">
            <MyReportsPanel />
            {fullAppUrl && <OperatorToolsLink fullAppUrl={fullAppUrl} />}
          </div>}
          {section === 'privacy' && <div className="space-y-4">
            <BlockedUsersSettings />
            {(privacyUrl || termsUrl) && <nav aria-label="Privacy and terms" className="glass-panel flex flex-wrap gap-x-6 rounded-[var(--radius-lg)] p-4">
              {privacyUrl && <a href={privacyUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center text-[var(--theme-accent-readable)] underline underline-offset-4">Privacy policy</a>}
              {termsUrl && <a href={termsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center text-[var(--theme-accent-readable)] underline underline-offset-4">Terms of use</a>}
            </nav>}
          </div>}
        </Suspense>}
      </div>
    </div>
  </div>
}
