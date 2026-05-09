import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Brain,
  ChevronRight,
  Check,
  Database,
  Download,
  KeyRound,
  LayoutGrid,
  Menu,
  MessageSquarePlus,
  Newspaper,
  Palette,
  Plus,
  Power,
  Search,
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
import { AdminFeedbackReview } from './AdminFeedbackReview'
import { WeatherLocationSettings } from './WeatherLocationSettings'
import { ProfileView } from '../profile/ProfileView'
import { useNewsAdmin } from '../../hooks/useNewsAdmin'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { UserRoleBadge } from '../ui/UserRoleBadge'
import { UserPresenceBadge } from '../ui/UserPresenceBadge'

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

type AdminSectionId = 'access' | 'bridge-pairing' | 'news-sources' | 'feedback-review'

type AdminSection = {
  id: AdminSectionId
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  fullAdminOnly?: boolean
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

const SETTINGS_SECTION_STORAGE_KEY = 'shadowchat:settings-section'

const isSettingsSectionId = (value: string | null): value is SettingsSectionId => (
  sections.some(section => section.id === value)
)

const getInitialSettingsSection = (): SettingsSectionId | null => {
  if (typeof window === 'undefined') return null

  const urlSection = new URL(window.location.href).searchParams.get('settingsSection')
  if (isSettingsSectionId(urlSection)) {
    return urlSection
  }

  const requestedSection = window.sessionStorage.getItem(SETTINGS_SECTION_STORAGE_KEY)
  if (isSettingsSectionId(requestedSection)) {
    window.sessionStorage.removeItem(SETTINGS_SECTION_STORAGE_KEY)
    return requestedSection
  }

  return null
}

const adminSections: AdminSection[] = [
  {
    id: 'access',
    title: 'Admin Access',
    description: 'Grant or remove sub-admin access from the complete user list.',
    icon: Shield,
    fullAdminOnly: true,
  },
  {
    id: 'bridge-pairing',
    title: 'ESP Bridge Pairing',
    description: 'Approve bridge pairing codes for operator-owned devices.',
    icon: KeyRound,
  },
  {
    id: 'news-sources',
    title: 'News Sources',
    description: 'Manage tracked X and Truth accounts for the Today Board.',
    icon: Newspaper,
  },
  {
    id: 'feedback-review',
    title: 'Feedback Review',
    description: 'View submitted bugs, suggestions, descriptions, and images.',
    icon: MessageSquarePlus,
  },
]

const normalizeNewsHandleInput = (value: string) =>
  value
    .trim()
    .replace(/^@+\s*/, '@')
    .trim()

const getNewsSourceHealthClass = (status: string) => {
  if (status === 'ok') {
    return 'border-[rgba(215,170,70,0.22)] bg-[rgba(215,170,70,0.08)] text-[var(--text-gold)]'
  }

  if (status === 'blocked') {
    return 'border-[rgba(224,164,62,0.28)] bg-[rgba(224,164,62,0.1)] text-amber-100'
  }

  if (status === 'pending') {
    return 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] text-[var(--text-muted)]'
  }

  return 'border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] text-red-100'
}

const getNewsSourceMessageClass = (status: string) =>
  status === 'blocked' ? 'text-amber-100/85' : 'text-red-200/80'

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
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition-[background-color,border-color,box-shadow,opacity] ${
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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [activeSection, setActiveSection] = useState<SettingsSectionId | null>(() => getInitialSettingsSection())
  const [activeAdminSection, setActiveAdminSection] = useState<AdminSectionId | null>(null)
  const [showDangerZone, setShowDangerZone] = useState(false)
  const [showNotificationSetup, setShowNotificationSetup] = useState(false)
  const [showPhoneInstallGuide, setShowPhoneInstallGuide] = useState(false)
  const [showFeedbackSubmission, setShowFeedbackSubmission] = useState(false)
  const [bridgePairingCode, setBridgePairingCode] = useState('')
  const [bridgePairingLoading, setBridgePairingLoading] = useState(false)
  const [lastBridgeDeviceId, setLastBridgeDeviceId] = useState('')
  const [newsPlatform, setNewsPlatform] = useState<'x' | 'truth'>('x')
  const [newsHandle, setNewsHandle] = useState('')
  const [newsDisplayName, setNewsDisplayName] = useState('')
  const [newsProfileUrl, setNewsProfileUrl] = useState('')
  const [adminUserSearch, setAdminUserSearch] = useState('')
  const { scheme, setScheme } = useTheme()
  const isDesktop = useIsDesktop()
  const { signOut, user: currentUser } = useAuth()
  const {
    role: adminRole,
    isAdmin: isFullAdmin,
    isOperator: isAdminOperator,
    users: adminAccessUsers,
    loading: adminAccessLoading,
    savingUserId: adminSavingUserId,
    error: adminAccessError,
    updateSubAdmin,
  } = useAdminAccess()
  const {
    isAdmin: canManageNewsSources,
    sources: newsSources,
    loading: newsAdminLoading,
    saving: newsAdminSaving,
    error: newsAdminError,
    upsertSource,
    setSourceEnabled,
    deleteSource,
  } = useNewsAdmin()
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
  } = usePushNotifications()

  const devicePushEnabled = subscribed
  const visibleSections = useMemo(
    () => sections.filter(section => section.id !== 'admin' || isAdminOperator),
    [isAdminOperator]
  )
  const visibleAdminSections = useMemo(
    () => adminSections.filter(section => !section.fullAdminOnly || isFullAdmin),
    [isFullAdmin]
  )
  const activeSectionConfig = sections.find(section => section.id === activeSection) ?? null
  const activeAdminSectionConfig =
    visibleAdminSections.find(section => section.id === activeAdminSection) ?? null
  const adminFilteredUsers = useMemo(() => {
    const normalizedSearch = adminUserSearch.trim().toLowerCase()
    if (!normalizedSearch) return adminAccessUsers

    return adminAccessUsers.filter(adminUser => (
      adminUser.display_name?.toLowerCase().includes(normalizedSearch) ||
      adminUser.username?.toLowerCase().includes(normalizedSearch) ||
      adminUser.email?.toLowerCase().includes(normalizedSearch)
    ))
  }, [adminAccessUsers, adminUserSearch])
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

  useEffect(() => {
    if (activeSection !== 'admin') {
      setActiveAdminSection(null)
    }
  }, [activeSection])

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    if (typeof scrollContainer.scrollTo === 'function') {
      scrollContainer.scrollTo({ top: 0 })
      return
    }

    scrollContainer.scrollTop = 0
  }, [activeAdminSection, activeSection])

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

  const handleAddNewsSource = async () => {
    const normalizedHandle = normalizeNewsHandleInput(newsHandle)
    if (!normalizedHandle) return

    try {
      await upsertSource({
        platform: newsPlatform,
        handle: normalizedHandle,
        displayName: newsDisplayName.trim() || undefined,
        profileUrl: newsProfileUrl.trim() || undefined,
      })
      setNewsHandle('')
      setNewsDisplayName('')
      setNewsProfileUrl('')
      toast.success('News source saved')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to save news source')
    }
  }

  const handleToggleNewsSource = async (sourceId: string, enabled: boolean) => {
    try {
      await setSourceEnabled(sourceId, enabled)
      toast.success(enabled ? 'News source enabled' : 'News source paused')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to update news source')
    }
  }

  const handleDeleteNewsSource = async (sourceId: string, label: string) => {
    const confirmed = window.confirm(`Delete ${label} from the news tracker? Existing feed items will stay, but this account will no longer be tracked.`)
    if (!confirmed) return

    try {
      await deleteSource(sourceId)
      toast.success('News source deleted')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to delete news source')
    }
  }

  const handleSubAdminToggle = async (targetUserId: string, enabled: boolean) => {
    try {
      await updateSubAdmin(targetUserId, enabled)
      toast.success(enabled ? 'Sub-admin access granted' : 'Sub-admin access removed')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to update admin access')
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
        {visibleSections.map(section => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id)}
            className="group relative grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-left shadow-[var(--shadow-panel)] transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[var(--border-glow)] hover:bg-[rgba(255,255,255,0.05)] sm:min-h-36 sm:grid-cols-1 sm:items-stretch sm:rounded-[var(--radius-lg)] sm:p-5"
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
              <div className="mt-4">
                <Button onClick={() => setShowNotificationSetup(true)} variant="secondary" size="sm" className="justify-center">
                  Notification Setup
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

  const renderAdminAccessPanel = () => {
    if (!isFullAdmin) return null

    return (
      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 text-[var(--text-muted)]" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Admin Access</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Manage sub-admin access from the complete user list.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Find user</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={adminUserSearch}
                onChange={event => setAdminUserSearch(event.target.value)}
                placeholder="Search name, username, or email"
                className="obsidian-input w-full rounded-[var(--radius-md)] py-3 pl-9 pr-3.5 text-sm"
              />
            </div>
          </label>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em]">
            <span className="rounded-full border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.08)] px-3 py-1 text-[var(--text-gold)]">
              Role: {adminRole === 'admin' ? 'Full admin' : 'Sub-admin'}
            </span>
            <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[var(--text-muted)]">
              Users: {adminFilteredUsers.length}
            </span>
          </div>
        </div>

        {adminAccessLoading ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
            Loading admin access.
          </div>
        ) : adminAccessError ? (
          <div className="rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-4 text-sm text-red-100">
            {adminAccessError}
          </div>
        ) : (
          <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
            {adminFilteredUsers.map(adminUser => {
              const isCurrentFullAdmin = adminUser.admin_role === 'admin'
              const isSubAdmin = adminUser.admin_role === 'sub_admin'
              const isCurrentUser = adminUser.id === currentUser?.id
              const saving = adminSavingUserId === adminUser.id

              return (
                <div
                  key={adminUser.id}
                  className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-[var(--text-primary)]">{adminUser.display_name}</span>
                      <UserRoleBadge role={adminUser.admin_role} />
                      <UserPresenceBadge userId={adminUser.id} presenceVisibility={adminUser.presence_visibility} />
                      <span className="truncate text-sm text-[var(--text-muted)]">@{adminUser.username}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-[var(--text-muted)]">{adminUser.email}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Joined {new Date(adminUser.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <span className={`w-fit rounded-full border px-3 py-1 text-xs uppercase tracking-[0.12em] ${
                    isCurrentFullAdmin
                      ? 'border-[rgba(215,170,70,0.28)] bg-[rgba(215,170,70,0.1)] text-[var(--text-gold)]'
                      : isSubAdmin
                        ? 'border-zinc-400/30 bg-zinc-300/10 text-zinc-200'
                        : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)]'
                  }`}>
                    {isCurrentFullAdmin ? 'Full admin' : isSubAdmin ? 'Sub-admin' : 'Member'}
                  </span>

                  {isCurrentFullAdmin ? (
                    <Button type="button" variant="ghost" size="sm" disabled className="w-full justify-center lg:w-auto">
                      Locked
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant={isSubAdmin ? 'danger' : 'secondary'}
                      size="sm"
                      onClick={() => void handleSubAdminToggle(adminUser.id, !isSubAdmin)}
                      disabled={isCurrentUser}
                      loading={saving}
                      className="w-full justify-center lg:w-auto"
                    >
                      {isSubAdmin ? 'Remove' : 'Grant'}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const getAdminSectionMeta = (sectionId: AdminSectionId) => {
    if (sectionId === 'access') {
      return adminAccessLoading ? 'Loading users' : `${adminAccessUsers.length} users`
    }

    if (sectionId === 'bridge-pairing') {
      return lastBridgeDeviceId ? 'Recently approved' : 'Pair device'
    }

    if (sectionId === 'feedback-review') {
      return 'Bugs & ideas'
    }

    if (newsAdminLoading) {
      return 'Loading sources'
    }

    return `${newsSources.length} sources`
  }

  const renderAdminHub = () => {
    if (adminAccessLoading && !isAdminOperator) {
      return (
        <div className="glass-panel rounded-[var(--radius-lg)] p-5 text-sm leading-6 text-[var(--text-muted)]">
          Loading admin tools.
        </div>
      )
    }

    if (!isAdminOperator) {
      return (
        <div className="glass-panel rounded-[var(--radius-lg)] p-5 text-sm leading-6 text-[var(--text-muted)]">
          Admin tools are limited to admin-class accounts.
        </div>
      )
    }

    return (
      <div className="space-y-5">
        <div className="glass-panel rounded-[var(--radius-lg)] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Admin Sections</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                Open one operator tool at a time for a cleaner workspace.
              </p>
            </div>
            <span className="w-fit rounded-full border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-gold)]">
              Role: {adminRole === 'admin' ? 'Full admin' : 'Sub-admin'}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visibleAdminSections.map(adminSection => (
              <button
                key={adminSection.id}
                type="button"
                onClick={() => setActiveAdminSection(adminSection.id)}
                className="group relative grid min-h-32 grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-left transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-[var(--border-glow)] hover:bg-[rgba(255,255,255,0.05)] md:grid-cols-1 md:items-stretch"
              >
                <span className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] p-2.5 text-[var(--text-gold)] md:w-fit md:rounded-[var(--radius-md)] md:p-3">
                  <adminSection.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 md:mt-auto">
                  <span className="block text-base font-semibold text-[var(--text-primary)]">{adminSection.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-[var(--text-muted)]">{adminSection.description}</span>
                  <span className="mt-3 inline-flex rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    {getAdminSectionMeta(adminSection.id)}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--text-gold)] md:absolute md:right-5 md:top-5" />
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const renderBridgePairingPanel = () => (
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

  const renderNewsSourcesPanel = () => (
      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Newspaper className="h-5 w-5 text-[var(--text-muted)]" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">News Sources</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Tracked X and Truth accounts for the Today Board.</p>
            </div>
          </div>
        </div>

        {newsAdminLoading ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
            Loading source controls.
          </div>
        ) : !canManageNewsSources ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm leading-6 text-[var(--text-muted)]">
            News source management is limited to admin-class accounts.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 lg:grid-cols-[8rem_1fr_1fr_1fr_auto] lg:items-end">
              <label>
                <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Platform</span>
                <select
                  value={newsPlatform}
                  onChange={event => setNewsPlatform(event.target.value as 'x' | 'truth')}
                  className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm"
                >
                  <option value="x">X</option>
                  <option value="truth">Truth</option>
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Handle</span>
                <input
                  value={newsHandle}
                  onChange={event => setNewsHandle(event.target.value)}
                  onBlur={() => setNewsHandle(prev => normalizeNewsHandleInput(prev))}
                  placeholder="@account"
                  className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm"
                />
              </label>
              <label>
                <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Display</span>
                <input
                  value={newsDisplayName}
                  onChange={event => setNewsDisplayName(event.target.value)}
                  placeholder="Optional"
                  className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm"
                />
              </label>
              <label>
                <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Profile URL</span>
                <input
                  value={newsProfileUrl}
                  onChange={event => setNewsProfileUrl(event.target.value)}
                  placeholder="Optional"
                  className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm"
                />
              </label>
              <Button
                type="button"
                onClick={() => void handleAddNewsSource()}
                disabled={!normalizeNewsHandleInput(newsHandle) || newsAdminSaving}
                loading={newsAdminSaving}
                className="w-full justify-center lg:w-auto"
              >
                <Plus className="mr-2 h-4 w-4" />
                Save
              </Button>
            </div>

            {newsAdminError && (
              <div className="rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-3 text-sm text-red-100">
                {newsAdminError}
              </div>
            )}

            <div className="space-y-2">
              {newsSources.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
                  No sources configured.
                </div>
              ) : (
                newsSources.map(source => (
                  <div
                    key={source.id}
                    className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.08)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-gold)]">
                          {source.platform === 'x' ? 'X' : 'Truth'}
                        </span>
                        <h3 className="truncate font-medium text-[var(--text-primary)]">
                          {source.display_name || source.handle}
                        </h3>
                        <span className="text-sm text-[var(--text-muted)]">@{source.normalized_handle || source.handle}</span>
                      </div>
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className={`rounded-full border px-2 py-0.5 uppercase tracking-[0.12em] ${getNewsSourceHealthClass(source.health_status)}`}>
                          {source.health_status}
                        </span>
                        {source.last_success_at ? ` / last ok ${new Date(source.last_success_at).toLocaleString()}` : ''}
                      </p>
                      {source.last_error && (
                        <p className={`mt-1 line-clamp-2 text-xs ${getNewsSourceMessageClass(source.health_status)}`}>{source.last_error}</p>
                      )}
                    </div>
                    <span className={`w-fit rounded-full border px-3 py-1 text-xs uppercase tracking-[0.12em] ${
                      source.enabled
                        ? 'border-[rgba(215,170,70,0.22)] bg-[rgba(215,170,70,0.08)] text-[var(--text-gold)]'
                        : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)]'
                    }`}>
                      {source.enabled ? 'Enabled' : 'Paused'}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleToggleNewsSource(source.id, !source.enabled)}
                      disabled={newsAdminSaving}
                      className="w-full justify-center lg:w-auto"
                    >
                      <Power className="mr-2 h-4 w-4" />
                      {source.enabled ? 'Pause' : 'Enable'}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => void handleDeleteNewsSource(
                        source.id,
                        source.display_name || `@${source.normalized_handle || source.handle}`
                      )}
                      disabled={newsAdminSaving}
                      className="w-full justify-center lg:w-auto"
                      aria-label={`Delete ${source.display_name || source.handle} from news tracker`}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
  )

  const renderFeedbackReviewPanel = () => (
    <AdminFeedbackReview />
  )

  const renderAdmin = () => {
    if (!activeAdminSection) {
      return renderAdminHub()
    }

    if (!activeAdminSectionConfig) {
      return renderAdminHub()
    }

    const content = {
      access: renderAdminAccessPanel,
      'bridge-pairing': renderBridgePairingPanel,
      'news-sources': renderNewsSourcesPanel,
      'feedback-review': renderFeedbackReviewPanel,
    }[activeAdminSection]()

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setActiveAdminSection(null)}
          className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]"
          aria-label="Back to admin sections"
        >
          <ArrowLeft className="h-4 w-4" />
          Admin
        </button>
        {content}
      </div>
    )
  }

  const renderColorLayout = () => (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="mb-4 flex items-center gap-3">
        <LayoutGrid className="h-5 w-5 text-[var(--text-muted)]" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Color Scheme</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-5">
        {(Object.keys(colorSchemes) as ColorScheme[]).map(key => (
          <button
            key={key}
            type="button"
            onClick={() => setScheme(key)}
            aria-pressed={scheme === key}
            className={`rounded-[var(--radius-md)] border p-3 text-left transition-[background-color,border-color,box-shadow] ${
              scheme === key
                ? 'border-[var(--border-glow)] bg-[rgba(255,255,255,0.06)] shadow-[var(--shadow-gold-soft)]'
                : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--border-panel)] hover:bg-[rgba(255,255,255,0.05)]'
            }`}
            aria-label={`Select ${key} color scheme`}
          >
            <span
              className="relative mb-2 block h-12 rounded-[var(--radius-sm)] border border-[var(--border-subtle)]"
              style={{ background: `linear-gradient(135deg, ${colorSchemes[key].start}, ${colorSchemes[key].end})` }}
            >
              {scheme === key && (
                <span className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-glow)] bg-[var(--bg-panel-strong)] text-[var(--text-gold)] shadow-[var(--shadow-panel)]">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </span>
            <span className="flex items-center justify-between gap-2 text-sm font-medium text-[var(--text-primary)]">
              {colorSchemes[key].label}
              <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {colorSchemes[key].mode}
              </span>
            </span>
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
      <WeatherLocationSettings />
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
      ref={scrollContainerRef}
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
