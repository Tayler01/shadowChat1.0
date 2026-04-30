import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Brain,
  ChevronRight,
  Database,
  Download,
  KeyRound,
  LayoutGrid,
  Menu,
  MessageSquarePlus,
  Palette,
  Shield,
  Smartphone,
  Trash2,
  Volume2,
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
import { ProfileView } from '../profile/ProfileView'

interface SettingsViewProps {
  onToggleSidebar: () => void
}

type SettingsSectionId =
  | 'notifications-audio'
  | 'ai'
  | 'feedback'
  | 'app-setup-guide'
  | 'admin'
  | 'color-layout'
  | 'data-privacy'
  | 'account-profile'

type SettingsSection = {
  id: SettingsSectionId
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const sections: SettingsSection[] = [
  {
    id: 'notifications-audio',
    title: 'Notifications & Audio',
    description: 'Push delivery, notification types, and sound effects.',
    icon: Bell,
  },
  {
    id: 'ai',
    title: 'AI',
    description: 'Assistant and suggestion preferences.',
    icon: Brain,
  },
  {
    id: 'feedback',
    title: 'Feedback',
    description: 'Submit bugs, feature ideas, screenshots, and concepts.',
    icon: MessageSquarePlus,
  },
  {
    id: 'app-setup-guide',
    title: 'App Setup & User Guide',
    description: 'Phone install help and practical app guidance.',
    icon: BookOpen,
  },
  {
    id: 'admin',
    title: 'Admin',
    description: 'Bridge approval and operator-only tools.',
    icon: KeyRound,
  },
  {
    id: 'color-layout',
    title: 'Color & Layout',
    description: 'Theme palette and interface appearance.',
    icon: Palette,
  },
  {
    id: 'data-privacy',
    title: 'Data & Privacy',
    description: 'Data export, privacy controls, and destructive actions.',
    icon: Database,
  },
  {
    id: 'account-profile',
    title: 'Account & Profile',
    description: 'Profile editor, public identity, presence, and session.',
    icon: Shield,
  },
]

function ToggleRow({
  label,
  description,
  enabled,
  disabled = false,
  onChange,
}: {
  label: string
  description: string
  enabled: boolean
  disabled?: boolean
  onChange: (enabled: boolean) => void | Promise<void>
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
      <div className="min-w-0">
        <h3 className="font-medium text-[var(--text-primary)]">{label}</h3>
        <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => void onChange(!enabled)}
        disabled={disabled}
        role="switch"
        aria-checked={enabled}
        aria-label={`Toggle ${label}`}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition-all ${
          enabled
            ? 'border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(255,240,184,0.18),rgba(215,170,70,0.12)_36%,rgba(122,89,24,0.5)_100%)] shadow-[var(--shadow-gold-soft)]'
            : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.05)]'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
            enabled ? 'translate-x-6 bg-[var(--gold-5)]' : 'translate-x-1 bg-[var(--text-secondary)]'
          }`}
        />
      </button>
    </div>
  )
}

function SectionHeader({
  section,
  onBack,
}: {
  section: SettingsSection
  onBack: () => void
}) {
  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]"
        aria-label="Back to settings"
      >
        <ArrowLeft className="h-4 w-4" />
        Settings
      </button>
      <div className="flex items-start gap-3">
        <span className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] p-3 text-[var(--text-gold)]">
          <section.icon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{section.title}</h1>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{section.description}</p>
        </div>
      </div>
    </div>
  )
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onToggleSidebar }) => {
  const { enabled: sounds, setEnabled: setSounds } = useSoundEffects()
  const [activeSection, setActiveSection] = useState<SettingsSectionId | null>(null)
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
  const activeSectionConfig = sections.find(section => section.id === activeSection) ?? null
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
        return
      }

      if ((permission === 'default' && supported && canPrompt) || permission === 'denied' || !supported || !canPrompt) {
        setShowNotificationSetup(true)
        return
      }

      await enablePush()
      toast.success('Push notifications enabled on this device')
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

  const renderHub = () => (
    <>
      <div className="mb-6 sm:mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Choose a section to manage a specific part of ShadowChat.
            </p>
          </div>
          {isDesktop && (
            <button
              onClick={onToggleSidebar}
              className="rounded-[var(--radius-sm)] p-2 text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
              aria-label="Toggle sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {pushLoading ? 'Checking device' : devicePushEnabled ? 'This device subscribed' : 'This device muted'}
          </span>
          <span className="rounded-full border border-[rgba(215,170,70,0.16)] bg-[rgba(215,170,70,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-gold)]">
            Theme: {scheme.replace('-', ' ')}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map(section => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id)}
            className="group relative grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-left shadow-[var(--shadow-panel)] transition-all hover:-translate-y-0.5 hover:border-[var(--border-glow)] hover:bg-[rgba(255,255,255,0.05)] sm:min-h-36 sm:grid-cols-1 sm:items-stretch sm:rounded-[var(--radius-lg)] sm:p-5"
          >
            <span className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] p-2.5 text-[var(--text-gold)] sm:w-fit sm:rounded-[var(--radius-md)] sm:p-3">
              <section.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 sm:mt-auto">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{section.title}</h2>
              <p className="mt-1 text-sm leading-5 text-[var(--text-muted)] sm:mt-2">{section.description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--text-gold)] sm:absolute sm:right-5 sm:top-5" />
          </button>
        ))}
      </div>
    </>
  )

  const renderNotificationsAudio = () => (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="glass-panel rounded-[var(--radius-lg)] p-5">
          <div className="mb-4 flex items-center gap-3">
            <Bell className="h-5 w-5 text-[var(--text-muted)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Notifications</h2>
          </div>
          <div className="space-y-4">
            <ToggleRow
              label="Push Notifications"
              description="Turn notifications on for this browser or installed app."
              enabled={devicePushEnabled}
              onChange={handlePushToggle}
            />
            <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm">
              <p className="text-[var(--text-primary)]">
                Status: {pushLoading ? 'Checking this device...' : devicePushEnabled ? 'Enabled on this device' : 'Not enabled on this device'}
              </p>
              <p className="mt-1 text-[var(--text-muted)]">Permission: {permission === 'unsupported' ? 'Unsupported' : permission}</p>
              {supportReason && (!supported || !canPrompt) && (
                <p className="mt-2 text-[var(--gold-4)]">{supportReason}</p>
              )}
              {pushError && <p className="mt-2 text-red-200/90">{pushError}</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Button onClick={() => setShowNotificationSetup(true)} variant="secondary" size="sm" className="justify-center">
                  Notification Setup
                </Button>
                <Button onClick={() => void refreshState()} variant="secondary" size="sm" className="justify-center">
                  Refresh Status
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-[var(--radius-lg)] p-5">
          <div className="mb-4 flex items-center gap-3">
            <Volume2 className="h-5 w-5 text-[var(--text-muted)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Audio</h2>
          </div>
          <ToggleRow
            label="Sound Effects"
            description="Play sounds for message notifications and app feedback."
            enabled={sounds}
            onChange={setSounds}
          />
        </div>
      </div>

      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Notification Types</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {notificationPreferenceSettings.map(setting => (
            <ToggleRow
              key={setting.label}
              label={setting.label}
              description={setting.description}
              enabled={setting.enabled}
              disabled={pushSaving}
              onChange={setting.onChange}
            />
          ))}
        </div>
      </div>
    </div>
  )

  const renderAI = () => (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="mb-4 flex items-center gap-3">
        <Brain className="h-5 w-5 text-[var(--text-muted)]" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Assistant Settings</h2>
      </div>
      <ToggleRow
        label="Suggested Replies"
        description="Show AI generated reply suggestions in the composer."
        enabled={suggestionsEnabled}
        onChange={setSuggestionsEnabled}
      />
      <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
        <p className="text-sm text-[var(--text-secondary)]">
          Mood emoji is disabled in production while it gets more design and behavior work.
        </p>
      </div>
    </div>
  )

  const renderFeedback = () => (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="mb-4 flex items-center gap-3">
        <MessageSquarePlus className="h-5 w-5 text-[var(--text-muted)]" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Feedback</h2>
      </div>
      <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-medium text-[var(--text-primary)]">Report a bug or suggest a feature</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Send a short request with optional screenshots or concept images.
            </p>
          </div>
          <Button onClick={() => setShowFeedbackSubmission(true)} variant="secondary" className="w-full justify-center sm:w-auto">
            <MessageSquarePlus className="mr-3 h-4 w-4" />
            Send Feedback
          </Button>
        </div>
      </div>
    </div>
  )

  const renderAppSetupGuide = () => (
    <div className="space-y-5">
      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="mb-4 flex items-center gap-3">
          <Smartphone className="h-5 w-5 text-[var(--text-muted)]" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Phone App Setup</h2>
        </div>
        <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-medium text-[var(--text-primary)]">Add Shadow Chat to this phone</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Reopen the guided iPhone or Android Home Screen setup any time.
            </p>
          </div>
          <Button onClick={() => setShowPhoneInstallGuide(true)} variant="secondary" className="w-full justify-center sm:w-auto">
            Open Phone Setup
          </Button>
        </div>
      </div>

      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="mb-4 flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-[var(--text-muted)]" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">User Guide</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['Chat', 'Use the main feed for shared conversation, replies, pins, reactions, and link previews.'],
            ['DMs', 'Use Direct Messages for private threads and unread tracking.'],
            ['Settings', 'Use these sections to keep notification, AI, account, and privacy controls organized.'],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
              <h3 className="font-medium text-[var(--text-primary)]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderAdmin = () => (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="mb-4 flex items-center gap-3">
        <KeyRound className="h-5 w-5 text-[var(--text-muted)]" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">ESP Bridge Pairing</h2>
      </div>
      <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Pairing code</span>
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
          Enter the code shown by the ESP bridge to approve this account as owner.
        </p>
        {lastBridgeDeviceId && (
          <p className="mt-3 break-all text-xs uppercase tracking-[0.14em] text-[var(--text-gold)]">
            Approved: {lastBridgeDeviceId}
          </p>
        )}
      </div>
    </div>
  )

  const renderColorLayout = () => (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="mb-4 flex items-center gap-3">
        <LayoutGrid className="h-5 w-5 text-[var(--text-muted)]" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Color Scheme</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(colorSchemes) as ColorScheme[]).map(key => (
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
              style={{ background: `linear-gradient(135deg, ${colorSchemes[key].start}, ${colorSchemes[key].end})` }}
            />
            <span className="block text-sm font-medium text-[var(--text-primary)]">{colorSchemes[key].label}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const renderDataPrivacy = () => (
    <div className="space-y-5">
      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="mb-4 flex items-center gap-3">
          <Database className="h-5 w-5 text-[var(--text-muted)]" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Data Export</h2>
        </div>
        <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-medium text-[var(--text-primary)]">Export My Data</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Download a copy of your account data and message history.</p>
          </div>
          <Button onClick={handleExportData} variant="secondary" className="w-full justify-center sm:w-auto">
            <Download className="mr-3 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="glass-panel rounded-[var(--radius-lg)] border border-[rgba(190,52,85,0.28)] p-5">
        <div className="mb-4 flex items-center gap-3">
          <Trash2 className="h-5 w-5 text-red-200" />
          <h2 className="text-lg font-semibold text-red-100">Danger Zone</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowDangerZone(!showDangerZone)}
          className="w-full rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.28)] bg-[rgba(87,14,28,0.16)] px-4 py-3 text-left text-sm text-red-200 transition-colors hover:border-[rgba(190,52,85,0.42)]"
        >
          {showDangerZone ? 'Hide destructive account actions' : 'Show destructive account actions'}
        </button>
        {showDangerZone && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.42)] bg-[rgba(87,14,28,0.28)] p-4"
          >
            <h3 className="mb-2 font-medium text-red-100">Delete Account</h3>
            <p className="mb-4 text-sm text-red-200/80">
              This action cannot be undone. All your messages and data will be permanently deleted.
            </p>
            <Button onClick={handleDeleteAccount} variant="danger" size="sm">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Account
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  )

  const renderAccountProfile = () => (
    <div className="space-y-5">
      <ProfileView onToggleSidebar={onToggleSidebar} embedded />
      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Session</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">End your current session on this device.</p>
          </div>
          <Button onClick={handleSignOut} variant="secondary" className="w-full justify-center sm:w-auto">
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  )

  const renderSection = () => {
    if (!activeSection || !activeSectionConfig) return renderHub()

    const content = {
      'notifications-audio': renderNotificationsAudio,
      ai: renderAI,
      feedback: renderFeedback,
      'app-setup-guide': renderAppSetupGuide,
      admin: renderAdmin,
      'color-layout': renderColorLayout,
      'data-privacy': renderDataPrivacy,
      'account-profile': renderAccountProfile,
    }[activeSection]()

    return (
      <>
        <SectionHeader section={activeSectionConfig} onBack={() => setActiveSection(null)} />
        {content}
      </>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.08),transparent_26%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))] pb-[calc(env(safe-area-inset-bottom)_+_8rem)] md:pb-[calc(env(safe-area-inset-bottom)_+_4rem)]"
    >
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        {renderSection()}
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
        onInstall={async () => {
          await handleInstallApp()
        }}
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
