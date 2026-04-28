import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bell,
  Volume2,
  Palette,
  Shield,
  Database,
  Download,
  Trash2,
  AlertTriangle,
  MessageSquarePlus,
  Menu,
  Brain,
  KeyRound,
  Smartphone
} from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'
import { useTheme, colorSchemes, ColorScheme } from '../../hooks/useTheme'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useSuggestionsEnabled } from '../../hooks/useSuggestedReplies'
import { useSoundEffects } from '../../hooks/useSoundEffects'
import { usePushNotifications } from '../../hooks/usePushNotifications'
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt'
import { approveBridgePairing } from '../../lib/bridge'
import { NotificationSetupModal } from './NotificationSetupModal'
import { PhoneInstallGuide } from '../onboarding/PhoneInstallGuide'
import { FeedbackSubmissionModal } from './FeedbackSubmissionModal'

interface SettingsViewProps {
  onToggleSidebar: () => void
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onToggleSidebar }) => {
  const { enabled: sounds, setEnabled: setSounds } = useSoundEffects()
  const [showDangerZone, setShowDangerZone] = useState(false)
  const [showNotificationSetup, setShowNotificationSetup] = useState(false)
  const [showPhoneInstallGuide, setShowPhoneInstallGuide] = useState(false)
  const [showFeedbackSubmission, setShowFeedbackSubmission] = useState(false)
  const [bridgePairingCode, setBridgePairingCode] = useState('')
  const [bridgePairingLoading, setBridgePairingLoading] = useState(false)
  const [lastBridgeDeviceId, setLastBridgeDeviceId] = useState('')
  const { scheme, setScheme } = useTheme()
  const isDesktop = useIsDesktop()
  const { signOut } = useAuth()
  const { canInstall, promptInstall } = usePwaInstallPrompt()
  const { enabled: suggestionsEnabled, setEnabled: setSuggestionsEnabled } = useSuggestionsEnabled()
  const {
    supported,
    canPrompt,
    supportReason,
    permission,
    guidance,
    guidanceText,
    preferences,
    subscribed,
    loading: pushLoading,
    saving: pushSaving,
    error: pushError,
    enablePush,
    disablePush,
    updatePreference,
    refreshState,
  } = usePushNotifications()

  const devicePushEnabled = subscribed
  const notificationPreferenceSettings = useMemo(
    () => (
      preferences
        ? [
            {
              label: 'Direct Messages',
              description: 'Notify when you get a new direct message.',
              enabled: preferences.dm_enabled,
              onChange: (enabled: boolean) => updatePreference('dm_enabled', enabled),
            },
            {
              label: 'Mentions',
              description: 'Notify when someone mentions you in chat.',
              enabled: preferences.mention_enabled,
              onChange: (enabled: boolean) => updatePreference('mention_enabled', enabled),
            },
            {
              label: 'Replies',
              description: 'Notify when someone replies to your message.',
              enabled: preferences.reply_enabled,
              onChange: (enabled: boolean) => updatePreference('reply_enabled', enabled),
            },
            {
              label: 'Reactions',
              description: 'Notify when someone reacts to your messages.',
              enabled: preferences.reaction_enabled,
              onChange: (enabled: boolean) => updatePreference('reaction_enabled', enabled),
            },
            {
              label: 'Group Chat',
              description: 'Notify when new messages arrive in the main group chat.',
              enabled: preferences.group_enabled,
              onChange: (enabled: boolean) => updatePreference('group_enabled', enabled),
            },
          ]
        : []
    ),
    [preferences, updatePreference]
  )

  const handleExportData = () => {
    toast.success('Data export started - you will receive an email when ready')
  }

  const handleDeleteAccount = () => {
    toast.error('Account deletion is not implemented in this demo')
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Signed out successfully')
    } catch (err) {
      console.error(err)
      toast.error('Failed to sign out')
    }
  }

  const handlePushToggle = async () => {
    try {
      if (devicePushEnabled) {
        await disablePush()
        toast.success('Push notifications disabled on this device')
      } else {
        if (permission === 'default' && supported && canPrompt) {
          setShowNotificationSetup(true)
          return
        }

        if (permission === 'denied' || !supported || !canPrompt) {
          setShowNotificationSetup(true)
          return
        }

        await enablePush()
        toast.success('Push notifications enabled on this device')
      }
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to update push notifications')
    }
  }

  const handleEnableFromModal = async () => {
    try {
      await enablePush()
      toast.success('Push notifications enabled on this device')
      setShowNotificationSetup(false)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to enable push notifications')
    }
  }

  const handleRefreshNotificationStatus = async () => {
    await refreshState()
    toast.success('Notification status refreshed')
  }

  const handleInstallApp = async (): Promise<'accepted' | 'dismissed' | null> => {
    const outcome = await promptInstall()

    if (outcome === 'accepted') {
      toast.success('Shadow Chat install started')
      return outcome
    }

    if (outcome === 'dismissed') {
      toast('Install dismissed. You can reopen phone setup any time.')
      return outcome
    }

    if (!canInstall) {
      toast('Use your browser menu to install Shadow Chat on this device.')
      return null
    }

    return outcome
  }

  const handleNotificationInstall = async () => {
    await handleInstallApp()
  }

  const handleApproveBridgePairing = async () => {
    try {
      setBridgePairingLoading(true)
      const approval = await approveBridgePairing(bridgePairingCode)
      setLastBridgeDeviceId(approval.deviceId)
      setBridgePairingCode('')
      toast.success('Bridge pairing approved')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to approve bridge pairing')
    } finally {
      setBridgePairingLoading(false)
    }
  }

  const settingSections = [
    {
      title: 'Notifications',
      icon: Bell,
      settings: [
        {
          label: 'Push Notifications',
          description: 'Turn notifications on for this browser or installed app.',
          enabled: devicePushEnabled,
          onChange: handlePushToggle
        }
      ]
    },
    {
      title: 'Audio',
      icon: Volume2,
      settings: [
        {
          label: 'Sound Effects',
          description: 'Play sounds for message notifications',
          enabled: sounds,
          onChange: setSounds
        }
      ]
    },
    {
      title: 'AI',
      icon: Brain,
      settings: [
        {
          label: 'Suggested Replies',
          description: 'Show AI generated reply suggestions',
          enabled: suggestionsEnabled,
          onChange: setSuggestionsEnabled
        }
      ]
    }
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.08),transparent_26%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))] pb-[calc(env(safe-area-inset-bottom)_+_8rem)] md:pb-[calc(env(safe-area-inset-bottom)_+_4rem)]"
    >
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        {isDesktop && (
          <button
            onClick={onToggleSidebar}
            className="mb-2 -ml-2 rounded-[var(--radius-sm)] p-2 text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">
            Settings
          </h1>
          <p className="text-[var(--text-secondary)]">
            Manage your account preferences and app settings
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {pushLoading ? 'Checking device' : devicePushEnabled ? 'This device subscribed' : 'This device muted'}
            </span>
            <span className="rounded-full border border-[rgba(215,170,70,0.16)] bg-[rgba(215,170,70,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-gold)]">
              Theme: {scheme.replace('-', ' ')}
            </span>
          </div>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6">
          {settingSections.map((section) => (
            <div
              key={section.title}
              className="glass-panel rounded-[var(--radius-lg)] p-5 sm:p-6"
            >
              <div className="flex items-center space-x-3 mb-4">
                <section.icon className="w-5 h-5 text-[var(--text-muted)]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  {section.title}
                </h2>
              </div>

              <div className="space-y-4">
                {section.settings.map((setting) => (
                  <div key={setting.label} className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                    <div className="min-w-0">
                      <h3 className="font-medium text-[var(--text-primary)]">
                        {setting.label}
                      </h3>
                      <p className="text-sm text-[var(--text-muted)]">
                        {setting.description}
                      </p>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => void setting.onChange(!setting.enabled)}
                      role="switch"
                      aria-checked={setting.enabled}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition-all ${
                        setting.enabled
                          ? 'border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(255,240,184,0.18),rgba(215,170,70,0.12)_36%,rgba(122,89,24,0.5)_100%)] shadow-[var(--shadow-gold-soft)]'
                          : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.05)]'
                      }`}
                      aria-label={`Toggle ${setting.label}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                          setting.enabled
                            ? 'translate-x-6 bg-[var(--gold-5)]'
                            : 'translate-x-1 bg-[var(--text-secondary)]'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              {section.title === 'Notifications' && (
                <div className="mt-5 space-y-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                  <div className="space-y-1 text-sm">
                    <p className="text-[var(--text-primary)]">
                      Status: {pushLoading ? 'Checking this device...' : devicePushEnabled ? 'Enabled on this device' : 'Not enabled on this device'}
                    </p>
                    <p className="text-[var(--text-muted)]">
                      Permission: {permission === 'unsupported' ? 'Unsupported' : permission}
                    </p>
                    {!supported && supportReason && (
                      <p className="text-[var(--gold-4)]">
                        {supportReason}
                      </p>
                    )}
                    {supported && !canPrompt && supportReason && (
                      <p className="text-[var(--gold-4)]">
                        {supportReason}
                      </p>
                    )}
                    {pushError && (
                      <p className="text-red-200/90">
                        {pushError}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      onClick={() => setShowNotificationSetup(true)}
                      variant="secondary"
                      size="sm"
                      className="min-w-[11rem] justify-center"
                    >
                      Notification Setup
                    </Button>
                    <Button
                      onClick={() => void refreshState()}
                      variant="secondary"
                      size="sm"
                      className="min-w-[11rem] justify-center"
                    >
                      Refresh Status
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {notificationPreferenceSettings.map((setting) => (
                      <div key={setting.label} className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                        <div className="mb-3 flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-medium text-[var(--text-primary)]">
                              {setting.label}
                            </h3>
                            <p className="mt-1 text-sm text-[var(--text-muted)]">
                              {setting.description}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => void setting.onChange(!setting.enabled)}
                            disabled={pushSaving}
                            role="switch"
                            aria-checked={setting.enabled}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition-all ${
                              setting.enabled
                                ? 'border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(255,240,184,0.18),rgba(215,170,70,0.12)_36%,rgba(122,89,24,0.5)_100%)] shadow-[var(--shadow-gold-soft)]'
                                : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.05)]'
                            } ${pushSaving ? 'cursor-not-allowed opacity-50' : ''}`}
                            aria-label={`Toggle ${setting.label}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                                setting.enabled
                                  ? 'translate-x-6 bg-[var(--gold-5)]'
                                  : 'translate-x-1 bg-[var(--text-secondary)]'
                              }`}
                            />
                          </button>
                        </div>
                        <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {setting.enabled ? 'Enabled' : 'Muted'}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        Independent controls
                      </p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Message types are saved separately from this device setting, so Group Chat can stay on without changing your DM choices.
                      </p>
                    </div>

                    <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        Apple devices
                      </p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        iPhone and iPad support requires installing Shadow Chat to the Home Screen first.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="glass-panel rounded-[var(--radius-lg)] p-5 sm:p-6">
            <div className="mb-4 flex items-center space-x-3">
              <MessageSquarePlus className="h-5 w-5 text-[var(--text-muted)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Feedback
              </h2>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-medium text-[var(--text-primary)]">
                    Report a bug or suggest a feature
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Send a short request with optional screenshots or concept images.
                  </p>
                </div>
                <Button
                  onClick={() => setShowFeedbackSubmission(true)}
                  variant="secondary"
                  className="w-full justify-center sm:w-auto"
                >
                  <MessageSquarePlus className="mr-3 h-4 w-4" />
                  Send Feedback
                </Button>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-[var(--radius-lg)] p-5 sm:p-6">
            <div className="mb-4 flex items-center space-x-3">
              <Smartphone className="h-5 w-5 text-[var(--text-muted)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Phone App Setup
              </h2>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-medium text-[var(--text-primary)]">
                    Add Shadow Chat to this phone
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Reopen the guided iPhone or Android Home Screen setup any time.
                  </p>
                </div>
                <Button
                  onClick={() => setShowPhoneInstallGuide(true)}
                  variant="secondary"
                  className="w-full justify-center sm:w-auto"
                >
                  <Smartphone className="mr-3 h-4 w-4" />
                  Open Phone Setup
                </Button>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-[var(--radius-lg)] p-5 sm:p-6">
            <div className="mb-4 flex items-center space-x-3">
              <KeyRound className="h-5 w-5 text-[var(--text-muted)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                ESP Bridge
              </h2>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <label className="min-w-0 flex-1">
                  <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
                    Pairing code
                  </span>
                  <input
                    value={bridgePairingCode}
                    onChange={(event) => setBridgePairingCode(event.target.value.toUpperCase())}
                    placeholder="ABCDEFGH"
                    autoCapitalize="characters"
                    spellCheck={false}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.28)] px-4 py-3 font-mono text-sm uppercase tracking-[0.18em] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--border-glow)]"
                  />
                </label>
                <Button
                  onClick={() => void handleApproveBridgePairing()}
                  disabled={bridgePairingLoading || bridgePairingCode.trim().length < 4}
                  variant="secondary"
                  className="w-full justify-center lg:w-auto"
                >
                  <KeyRound className="mr-3 h-4 w-4" />
                  {bridgePairingLoading ? 'Approving' : 'Approve Bridge'}
                </Button>
              </div>

              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Enter the code shown by the ESP bridge to approve this account as owner. The ESP will send as its own device account.
              </p>
              {lastBridgeDeviceId && (
                <p className="mt-3 break-all text-xs uppercase tracking-[0.14em] text-[var(--text-gold)]">
                  Approved: {lastBridgeDeviceId}
                </p>
              )}
            </div>
          </div>

          {/* Appearance */}
          <div className="glass-panel rounded-[var(--radius-lg)] p-5 sm:p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Palette className="w-5 h-5 text-[var(--text-muted)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Color Scheme
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(Object.keys(colorSchemes) as ColorScheme[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setScheme(key)}
                  className={`rounded-[var(--radius-md)] border p-3 text-left transition-all ${
                    scheme === key
                      ? 'border-[var(--border-glow)] bg-[rgba(255,255,255,0.06)] shadow-[var(--shadow-gold-soft)]'
                      : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--border-panel)] hover:bg-[rgba(255,255,255,0.05)]'
                  }`}
                  aria-label={`Select ${key} color scheme`}
                >
                  <span
                    className="mb-2 block h-10 rounded-[var(--radius-sm)] border border-[rgba(255,255,255,0.08)]"
                    style={{
                      background: `linear-gradient(135deg, ${colorSchemes[key].start}, ${colorSchemes[key].end})`,
                    }}
                  />
                  <span className="block text-sm font-medium text-[var(--text-primary)]">
                    {colorSchemes[key].label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Data & Privacy */}
          <div className="glass-panel rounded-[var(--radius-lg)] p-5 sm:p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Database className="w-5 h-5 text-[var(--text-muted)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Data & Privacy
              </h2>
            </div>

            <p className="mb-4 text-sm text-[var(--text-muted)]">
              Control what leaves the app and keep a clean audit trail of your account data.
            </p>

            <div className="space-y-4">
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-medium text-[var(--text-primary)]">Export My Data</h3>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Download a copy of your account data and message history.
                    </p>
                  </div>
                  <Button
                    onClick={handleExportData}
                    variant="secondary"
                    className="w-full sm:w-auto"
                  >
                    <Download className="w-4 h-4 mr-3" />
                    Export
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Account */}
          <div className="glass-panel rounded-[var(--radius-lg)] p-5 sm:p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Shield className="w-5 h-5 text-[var(--text-muted)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Account
              </h2>
            </div>

            <p className="mb-4 text-sm text-[var(--text-muted)]">
              Manage your signed-in session and keep destructive actions clearly separated.
            </p>

            <div className="space-y-4">
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-medium text-[var(--text-primary)]">Sign out</h3>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      End your current session on this device.
                    </p>
                  </div>
                  <Button
                    onClick={handleSignOut}
                    variant="secondary"
                    className="w-full sm:w-auto"
                  >
                    Sign Out
                  </Button>
                </div>
              </div>

              <div className="rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.28)] bg-[rgba(87,14,28,0.16)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-medium text-red-100">Danger zone</h3>
                    <p className="mt-1 text-sm text-red-200/80">
                      Destructive account actions stay tucked away until you intentionally open them.
                    </p>
                  </div>
                  <Button
                    onClick={() => setShowDangerZone(!showDangerZone)}
                    variant="ghost"
                    className="w-full justify-center text-red-300 hover:text-red-100 sm:w-auto"
                  >
                    <AlertTriangle className="w-4 h-4 mr-3" />
                    {showDangerZone ? 'Hide' : 'Open'} Danger Zone
                  </Button>
                </div>
              </div>

              {showDangerZone && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.42)] bg-[rgba(87,14,28,0.28)] p-4"
                >
                  <h3 className="mb-2 font-medium text-red-100">
                    Delete Account
                  </h3>
                  <p className="mb-4 text-sm text-red-200/80">
                    This action cannot be undone. All your messages and data will be permanently deleted.
                  </p>
                  <Button
                    onClick={handleDeleteAccount}
                    variant="danger"
                    size="sm"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Account
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
      <NotificationSetupModal
        open={showNotificationSetup}
        guidance={guidance}
        guidanceText={guidanceText}
        saving={pushSaving}
        canInstall={canInstall}
        onClose={() => setShowNotificationSetup(false)}
        onEnable={handleEnableFromModal}
        onRefresh={handleRefreshNotificationStatus}
        onInstall={handleNotificationInstall}
      />
      <PhoneInstallGuide
        open={showPhoneInstallGuide}
        canInstall={canInstall}
        onClose={() => setShowPhoneInstallGuide(false)}
        onComplete={() => setShowPhoneInstallGuide(false)}
        onInstall={handleInstallApp}
      />
      <FeedbackSubmissionModal
        open={showFeedbackSubmission}
        onClose={() => setShowFeedbackSubmission(false)}
      />
    </motion.div>
  )
}
