import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Accessibility,
  Activity,
  ArrowLeft,
  Bell,
  Clock3,
  BookOpen,
  ChevronRight,
  Check,
  Film,
  BarChart3,
  KeyRound,
  LayoutGrid,
  ListChecks,
  Menu,
  MessageSquarePlus,
  Palette,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  Smartphone,
  Ticket,
  Trash2,
  Volume2,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'
import { useTheme, colorSchemes, ColorScheme } from '../../hooks/useTheme'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useSoundEffects } from '../../hooks/useSoundEffects'
import { usePushNotifications } from '../../hooks/usePushNotifications'
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt'
import { NotificationSetupModal } from './NotificationSetupModal'
import { PhoneInstallGuide } from '../onboarding/PhoneInstallGuide'
import { FeedbackSubmissionModal } from './FeedbackSubmissionModal'
import { AdminAutomationApprovals } from './AdminAutomationApprovals'
import { AdminFeedbackReview } from './AdminFeedbackReview'
import { AdminInvitesPanel } from './AdminInvitesPanel'
import { ShadoTvStudio } from './ShadoTvStudio'
import { WeatherLocationSettings } from './WeatherLocationSettings'
import { BlockedUsersSettings } from './BlockedUsersSettings'
import { ProfileView } from '../profile/ProfileView'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { UserRoleBadge } from '../ui/UserRoleBadge'
import { UserPresenceBadge } from '../ui/UserPresenceBadge'
import { MobileAppHeader } from '../layout/MobileAppHeader'
import {
  BOARDS_FEATURE_ENABLED,
  ESP_ADMIN_FEATURE_ENABLED,
  MEMBER_REPORTING_FEATURE_ENABLED,
  SHADO_LIVE_REAL_ENABLED,
} from '../../config/featureFlags'
import type { AppView } from '../../types/navigation'
import { getBrowserTimeZone } from '../../lib/push'
import { COMFORT_RESET_EVENT } from '../../lib/comfortPreferences'
import { requestAppBadgeRefresh } from '../../lib/appBadge'
import { NotificationBannerV2 } from '../../features/notifications/NotificationBannerV2'
import {
  NOTIFICATION_CATEGORY_PRESENTATION_OPTIONS,
  NOTIFICATION_SOUND_OPTIONS,
  fetchNotificationCategoryPresentationPreferences,
  getDefaultNotificationSoundMap,
  updateNotificationCategorySound,
} from '../../features/notifications/notificationPresentationPreferences'
import type {
  NotificationEnvelopeV2,
  NotificationPresentationCategory,
  NotificationSoundId,
} from '../../features/notifications/notificationEnvelopeV2'

const ShadowPinActivityAdmin = React.lazy(() =>
  import('./ShadowPinActivityAdmin').then(module => ({ default: module.ShadowPinActivityAdmin }))
)

const OperationsHealthCenter = React.lazy(() =>
  import('./OperationsHealthCenter').then(module => ({ default: module.OperationsHealthCenter }))
)

const ShadowMysteryStudio = React.lazy(() =>
  import('./ShadowMysteryStudio').then(module => ({ default: module.ShadowMysteryStudio }))
)

const MyReportsPanel = MEMBER_REPORTING_FEATURE_ENABLED
  ? React.lazy(() =>
      import('../../features/moderation/MyReportsPanel').then(module => ({ default: module.MyReportsPanel }))
    )
  : null

const ModerationCaseCenter = React.lazy(() =>
  import('../../features/moderation/ModerationCaseCenter').then(module => ({ default: module.ModerationCaseCenter }))
)

const ShadoLiveCaseCenter = SHADO_LIVE_REAL_ENABLED
  ? React.lazy(() => import('../../features/moderation/ShadoLiveCaseCenter'))
  : null

const AccessibilityComfortPanel = React.lazy(() =>
  import('./AccessibilityComfortPanel').then(module => ({ default: module.AccessibilityComfortPanel }))
)

const BridgePairingAdminPanel = ESP_ADMIN_FEATURE_ENABLED
  ? React.lazy(() =>
      import('./BridgePairingAdminPanel').then(module => ({ default: module.BridgePairingAdminPanel }))
    )
  : null

const NewsSourcesAdminPanel = BOARDS_FEATURE_ENABLED
  ? React.lazy(() =>
      import('./NewsSourcesAdminPanel').then(module => ({ default: module.NewsSourcesAdminPanel }))
    )
  : null

interface SettingsViewProps {
  onToggleSidebar: () => void
  currentView?: AppView
  onViewChange?: (view: AppView) => void
}

type SettingsSectionId =
  | 'notifications-audio'
  | 'accessibility-comfort'
  | 'feedback'
  | 'safety-reports'
  | 'app-setup-guide'
  | 'admin'
  | 'color-layout'
  | 'account-profile'

type SettingsSection = {
  id: SettingsSectionId
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

type AdminSectionId =
  | 'access'
  | 'invites'
  | 'operations-health'
  | 'automation-approvals'
  | 'bridge-pairing'
  | 'shado-tv-studio'
  | 'shadow-mystery-studio'
  | 'shadow-pin-activity'
  | 'news-sources'
  | 'feedback-review'
  | 'case-center'

type AdminSection = {
  id: AdminSectionId
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  fullAdminOnly?: boolean
}

const sections: SettingsSection[] = [
  {
    id: 'accessibility-comfort',
    title: 'Accessibility & Comfort',
    description: 'Comfort profiles for motion, readability, touch, media, and sensory feedback.',
    icon: Accessibility,
  },
  {
    id: 'notifications-audio',
    title: 'Notifications & Audio',
    description: 'Push delivery, notification types, and sound effects.',
    icon: Bell,
  },
  {
    id: 'feedback',
    title: 'Feedback',
    description: 'Submit bugs, feature ideas, screenshots, and concepts.',
    icon: MessageSquarePlus,
  },
  ...(MEMBER_REPORTING_FEATURE_ENABLED ? [{
    id: 'safety-reports',
    title: 'Safety Reports',
    description: 'Review private status and operator updates for concerns you submitted.',
    icon: ShieldAlert,
  } as const] : []),
  {
    id: 'app-setup-guide',
    title: 'App Setup & User Guide',
    description: 'Phone install help and practical app guidance.',
    icon: BookOpen,
  },
  {
    id: 'admin',
    title: 'Admin',
    description: 'Production health and operator-only tools.',
    icon: KeyRound,
  },
  {
    id: 'color-layout',
    title: 'Color & Layout',
    description: 'Theme palette and interface appearance.',
    icon: Palette,
  },
  {
    id: 'account-profile',
    title: 'Account & Profile',
    description: 'Profile editor, public identity, presence, and session.',
    icon: Shield,
  },
]

const SETTINGS_SECTION_STORAGE_KEY = 'shadowchat:settings-section'
const SETTINGS_MAIN_EVENT = 'shadowchat:settings-main'

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
    id: 'invites',
    title: 'Invites',
    description: 'Generate, email-lock, revoke, and review signup invites.',
    icon: Ticket,
  },
  {
    id: 'operations-health',
    title: 'Operations Health',
    description: 'Review frontend, backend, smoke, push, and paused-domain release evidence.',
    icon: Activity,
  },
  {
    id: 'automation-approvals',
    title: 'Automation Approvals',
    description: 'Review scan, build, docs, and batch packets before action.',
    icon: ListChecks,
    fullAdminOnly: true,
  },
  ...(ESP_ADMIN_FEATURE_ENABLED ? [{
    id: 'bridge-pairing' as const,
    title: 'ESP Bridge Pairing',
    description: 'Approve bridge pairing codes for operator-owned devices.',
    icon: KeyRound,
  }] : []),
  {
    id: 'shado-tv-studio',
    title: 'Shado TV Studio',
    description: 'Manage Crimp & Shrimp episodes, trailers, cast, updates, dates, visibility, and covers.',
    icon: Film,
  },
  {
    id: 'shadow-mystery-studio',
    title: 'Shadow Mystery Studio',
    description: 'Draft, source, illustrate, validate, and publish long-form mystery stories.',
    icon: BookOpen,
  },
  {
    id: 'shadow-pin-activity',
    title: 'Shadow Pin Activity',
    description: 'Review user activity, category interest, pin engagement, and drilldown timelines.',
    icon: BarChart3,
  },
  ...(BOARDS_FEATURE_ENABLED ? [{
    id: 'news-sources' as const,
    title: 'News Sources',
    description: 'Manage tracked X and Truth accounts for the Today Board.',
    icon: KeyRound,
  }] : []),
  {
    id: 'case-center',
    title: 'Safety Case Center',
    description: 'Triage member reports, inspect evidence, and apply audited safety actions.',
    icon: ShieldAlert,
  },
  {
    id: 'feedback-review',
    title: 'Feedback Review',
    description: 'View submitted bugs, suggestions, descriptions, and images.',
    icon: MessageSquarePlus,
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
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition-[background-color,border-color,box-shadow,opacity] ${
          enabled
            ? 'border-[rgba(215,170,70,0.58)] bg-[rgba(215,170,70,0.18)] shadow-[inset_0_0_0_1px_rgba(255,240,184,0.12),0_0_14px_rgba(215,170,70,0.18)]'
            : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.05)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)]'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
            enabled
              ? 'translate-x-6 bg-[rgb(255,240,184)] shadow-[0_0_10px_rgba(255,240,184,0.48)]'
              : 'translate-x-1 bg-[var(--text-secondary)]'
          }`}
        />
      </button>
    </div>
  )
}

function SectionHeader({
  section,
}: {
  section: SettingsSection
}) {
  return (
    <div className="mb-5">
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

function SettingsPanelLoading({ label }: { label: string }) {
  return (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5 text-sm text-[var(--text-muted)]">
      {label}
    </div>
  )
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onToggleSidebar,
  currentView = 'settings',
  onViewChange = () => {},
}) => {
  const {
    enabled: sounds,
    setEnabled: setSounds,
    hypeEnabled: hypeSounds,
    setHypeEnabled: setHypeSounds,
    playNotificationCue,
  } = useSoundEffects()
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [activeSection, setActiveSection] = useState<SettingsSectionId | null>(() => getInitialSettingsSection())
  const [activeAdminSection, setActiveAdminSection] = useState<AdminSectionId | null>(null)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('')
  const [deleteAccountSaving, setDeleteAccountSaving] = useState(false)
  const [showNotificationSetup, setShowNotificationSetup] = useState(false)
  const [showPhoneInstallGuide, setShowPhoneInstallGuide] = useState(false)
  const [showFeedbackSubmission, setShowFeedbackSubmission] = useState(false)
  const [adminUserSearch, setAdminUserSearch] = useState('')
  const [notificationSoundMap, setNotificationSoundMap] = useState(
    getDefaultNotificationSoundMap,
  )
  const [savingNotificationSound, setSavingNotificationSound] =
    useState<NotificationPresentationCategory | null>(null)
  const { scheme, setScheme } = useTheme()
  const isDesktop = useIsDesktop()
  const { signOut, deleteAccount, user: currentUser } = useAuth()
  const shouldLoadAdminUsers = activeSection === 'admin' && activeAdminSection === 'access'
  const shouldLoadPushSettings = activeSection === 'notifications-audio'
  const {
    role: adminRole,
    isAdmin: isFullAdmin,
    isOperator: isAdminOperator,
    users: adminAccessUsers,
    loading: adminAccessLoading,
    savingUserId: adminSavingUserId,
    error: adminAccessError,
    updateSubAdmin,
  } = useAdminAccess({ includeUsers: shouldLoadAdminUsers })
  const { canInstall, promptInstall } = usePwaInstallPrompt()
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
    updatePreferences,
  } = usePushNotifications({ enabled: shouldLoadPushSettings })

  const updateBadgePreference = async (
    key: 'badge_dm_enabled' | 'badge_group_enabled' | 'badge_interactions_enabled' | 'badge_connections_enabled' | 'badge_shadow_pin_enabled' | 'badge_games_enabled',
    enabled: boolean
  ) => {
    await updatePreference(key, enabled)
    requestAppBadgeRefresh()
  }

  const devicePushEnabled = subscribed
  const quietHoursEnabled = Boolean(preferences?.quiet_hours_start && preferences?.quiet_hours_end)
  const snoozedUntil = preferences?.mute_until && new Date(preferences.mute_until).getTime() > Date.now()
    ? new Date(preferences.mute_until)
    : null
  const notificationPreviewEnvelope = useMemo<NotificationEnvelopeV2>(() => ({
    schemaVersion: 2,
    eventId: 'settings-preview',
    eventIds: ['settings-preview'],
    type: 'shadow_pin_comment',
    category: 'shadow_pin',
    entityId: 'settings-preview',
    route: '/?view=pins',
    groupKey: 'settings:preview',
    priority: 'normal',
    privacy: preferences?.notification_preview_mode ?? 'full',
    actor: {
      id: currentUser?.id ?? 'shadowchat-preview',
      label: 'JJ',
      avatarUrl: null,
    },
    content: {
      eyebrow: 'ShadowPin conversation',
      title: 'JJ commented on your ShadowPin',
      body: 'This is how a rich foreground notification will look.',
      privateTitle: 'New ShadowChat notification',
      privateBody: 'Open ShadowChat to view it.',
    },
    media: preferences?.notification_media_enabled === false
      ? null
      : {
          kind: 'image',
          thumbnailUrl: '/icons/app-icon-192.png',
          alt: 'ShadowPin preview',
        },
    actions: ['open', 'mark_read'],
    soundId: notificationSoundMap.shadow_pin,
    androidChannelKey: 'social_v1',
    badgeCategory: 'shadow_pin',
    autoRead: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90_000).toISOString(),
  }), [
    currentUser?.id,
    notificationSoundMap.shadow_pin,
    preferences?.notification_media_enabled,
    preferences?.notification_preview_mode,
  ])
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
  const headerTitle = activeAdminSectionConfig?.title
    || (activeSection === 'accessibility-comfort' ? 'Comfort' : activeSectionConfig?.title)
    || 'Settings'
  const headerEyebrow = activeAdminSectionConfig ? 'Admin' : activeSectionConfig ? 'Settings' : undefined
  const adminFilteredUsers = useMemo(() => {
    const normalizedSearch = adminUserSearch.trim().toLowerCase()
    if (!normalizedSearch) return adminAccessUsers

    return adminAccessUsers.filter(adminUser => (
      adminUser.display_name?.toLowerCase().includes(normalizedSearch) ||
      adminUser.username?.toLowerCase().includes(normalizedSearch) ||
      adminUser.email?.toLowerCase().includes(normalizedSearch)
    ))
  }, [adminAccessUsers, adminUserSearch])
  const notificationPreferenceGroups = useMemo(
    () => (
      preferences
        ? [
            {
              title: 'Messages',
              description: 'Direct conversations and General Chat activity.',
              settings: [
                {
                  label: 'Direct Messages',
                  description: 'Notify when you get a new direct message.',
                  enabled: preferences.dm_enabled,
                  onChange: (enabled: boolean) => updatePreference('dm_enabled', enabled),
                },
                {
                  label: 'Group Chat',
                  description: 'Notify for every General Chat message, not only targeted activity.',
                  enabled: preferences.group_enabled,
                  onChange: (enabled: boolean) => updatePreference('group_enabled', enabled),
                },
                {
                  label: 'Mentions',
                  description: 'Notify when someone @mentions you in General Chat.',
                  enabled: preferences.mention_enabled,
                  onChange: (enabled: boolean) => updatePreference('mention_enabled', enabled),
                },
                {
                  label: 'Replies',
                  description: 'Notify when someone replies to your General Chat message.',
                  enabled: preferences.reply_enabled,
                  onChange: (enabled: boolean) => updatePreference('reply_enabled', enabled),
                },
                {
                  label: 'Reactions',
                  description: 'Notify when someone reacts to your General Chat or DM messages.',
                  enabled: preferences.reaction_enabled,
                  onChange: (enabled: boolean) => updatePreference('reaction_enabled', enabled),
                },
                {
                  label: 'Hype',
                  description: 'Notify when the room starts celebrating.',
                  enabled: preferences.hype_enabled,
                  onChange: (enabled: boolean) => updatePreference('hype_enabled', enabled),
                },
              ],
            },
            {
              title: 'ShadowPin & Connections',
              description: 'New posts, conversations on your pins, and connection activity.',
              settings: [
                {
                  label: 'New ShadowPin Posts',
                  description: 'Notify when another member publishes a new pin.',
                  enabled: preferences.shadow_pin_new_post_enabled,
                  onChange: (enabled: boolean) => updatePreference('shadow_pin_new_post_enabled', enabled),
                },
                {
                  label: 'ShadowPin Comments',
                  description: 'Notify when someone comments on one of your pins.',
                  enabled: preferences.shadow_pin_comment_enabled,
                  onChange: (enabled: boolean) => updatePreference('shadow_pin_comment_enabled', enabled),
                },
                {
                  label: 'ShadowPin Replies',
                  description: 'Notify when someone replies to your ShadowPin comment.',
                  enabled: preferences.shadow_pin_reply_enabled,
                  onChange: (enabled: boolean) => updatePreference('shadow_pin_reply_enabled', enabled),
                },
                {
                  label: 'Connections',
                  description: 'Notify when someone sends or accepts a connection request.',
                  enabled: preferences.connection_notifications_enabled,
                  onChange: (enabled: boolean) => updatePreference('connection_notifications_enabled', enabled),
                },
              ],
            },
            {
              title: 'Live & Play',
              description: 'Rooms and turns that are ready for you.',
              settings: [
                ...(SHADO_LIVE_REAL_ENABLED ? [{
                  label: 'Shado Live',
                  description: 'Notify for eligible room starts, stage changes, and room endings.',
                  enabled: preferences.shado_live_in_app_enabled,
                  onChange: (enabled: boolean) => updatePreference('shado_live_in_app_enabled', enabled),
                }] : []),
                {
                  label: 'Shadow Checkers Turns',
                  description: 'Notify when an active match is waiting for your move.',
                  enabled: preferences.checkers_turn_enabled,
                  onChange: (enabled: boolean) => updatePreference('checkers_turn_enabled', enabled),
                },
              ],
            },
            {
              title: 'Active Users',
              description: 'Choose how presence alerts reach you.',
              settings: [
                {
                  label: 'In-app alerts',
                  description: 'Show a banner while ShadowChat is in the foreground.',
                  enabled: preferences.presence_in_app_enabled,
                  onChange: (enabled: boolean) => updatePreference('presence_in_app_enabled', enabled),
                },
                {
                  label: 'Phone alerts',
                  description: 'Send a push while ShadowChat is in the background or closed.',
                  enabled: preferences.presence_push_enabled,
                  onChange: (enabled: boolean) => updatePreference('presence_push_enabled', enabled),
                },
              ],
            },
          ]
        : []
    ),
    [preferences, updatePreference]
  )

  useEffect(() => {
    const handleSettingsMain = () => {
      setActiveSection(null)
      setActiveAdminSection(null)
      requestAnimationFrame(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      })
    }

    window.addEventListener(SETTINGS_MAIN_EVENT, handleSettingsMain)
    return () => window.removeEventListener(SETTINGS_MAIN_EVENT, handleSettingsMain)
  }, [])

  useEffect(() => {
    if (activeSection !== 'admin') {
      setActiveAdminSection(null)
    }
  }, [activeSection])

  useEffect(() => {
    if (
      activeSection !== 'notifications-audio' ||
      !currentUser?.id
    ) return

    let active = true
    void fetchNotificationCategoryPresentationPreferences(currentUser.id)
      .then(next => {
        if (active) setNotificationSoundMap(next)
      })
      .catch(() => {
        if (active) setNotificationSoundMap(getDefaultNotificationSoundMap())
      })
    return () => {
      active = false
    }
  }, [activeSection, currentUser?.id])

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    if (typeof scrollContainer.scrollTo === 'function') {
      scrollContainer.scrollTo({ top: 0 })
      return
    }

    scrollContainer.scrollTop = 0
  }, [activeAdminSection, activeSection])

  const handleNotificationSoundChange = async (
    category: NotificationPresentationCategory,
    soundId: NotificationSoundId,
  ) => {
    if (!currentUser?.id) return
    const previous = notificationSoundMap[category]
    setNotificationSoundMap(current => ({ ...current, [category]: soundId }))
    setSavingNotificationSound(category)
    if (soundId !== 'silent') playNotificationCue(soundId)
    try {
      await updateNotificationCategorySound(currentUser.id, category, soundId)
    } catch (error) {
      setNotificationSoundMap(current => ({ ...current, [category]: previous }))
      toast.error(error instanceof Error ? error.message : 'Failed to save notification sound')
    } finally {
      setSavingNotificationSound(null)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteAccountConfirmText.trim().toUpperCase() !== 'DELETE') {
      toast.error('Type DELETE to confirm account deletion')
      return
    }

    const confirmed = window.confirm('Permanently delete your Shadow Chat account? This removes your login and cannot be undone.')
    if (!confirmed) return

    try {
      setDeleteAccountSaving(true)
      await deleteAccount()
      toast.success('Account deleted')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to delete account')
    } finally {
      setDeleteAccountSaving(false)
    }
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

  const handleQuietHoursToggle = async (enabled: boolean) => {
    try {
      await updatePreferences(enabled
        ? {
            quiet_hours_start: '22:00',
            quiet_hours_end: '07:00',
            quiet_hours_timezone: getBrowserTimeZone(),
          }
        : {
            quiet_hours_start: null,
            quiet_hours_end: null,
          })
      toast.success(enabled ? 'Quiet hours enabled' : 'Quiet hours disabled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update quiet hours')
    }
  }

  const handleNotificationSnooze = async (hours: number | null) => {
    try {
      await updatePreference(
        'mute_until',
        hours === null ? null : new Date(Date.now() + (hours * 60 * 60 * 1000)).toISOString()
      )
      toast.success(hours === null ? 'Notification snooze cleared' : `Notifications snoozed for ${hours} hour${hours === 1 ? '' : 's'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update notification snooze')
    }
  }

  const handleQuietHoursTimeChange = async (
    key: 'quiet_hours_start' | 'quiet_hours_end',
    value: string
  ) => {
    if (!value || !preferences) return
    const otherValue = key === 'quiet_hours_start'
      ? preferences.quiet_hours_end
      : preferences.quiet_hours_start
    if (value === otherValue?.slice(0, 5)) {
      toast.error('Quiet hours start and end must be different')
      return
    }

    try {
      await updatePreference(key, value)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update quiet hours')
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
      {isDesktop && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={onToggleSidebar}
            className="rounded-[var(--radius-sm)] p-2 text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      )}

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
      <div className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <Bell className="h-5 w-5 text-[var(--text-muted)]" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Delivery on this device</h2>
            <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
              While you are using ShadowChat, alerts stay in the app. When it is in the background or closed, eligible alerts use phone push - never both for the same event.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <ToggleRow
            label="Phone Push Notifications"
            description="Allow background alerts on this browser or installed app."
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

      {preferences && (
        <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby="notification-presentation-heading">
          <div className="mb-4">
            <h2 id="notification-presentation-heading" className="text-lg font-semibold text-[var(--text-primary)]">
              Presentation & Privacy
            </h2>
            <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
              Control what appears in rich notifications. Your phone's lock-screen privacy, silent mode, Focus, and Do Not Disturb still have final control.
            </p>
          </div>

          <div className="space-y-3">
            <ToggleRow
              label="Foreground Obsidian Sounds"
              description="Play the selected branded cue while ShadowChat is open. Background PWA sound is controlled by your phone."
              enabled={preferences.notification_foreground_sounds_enabled}
              disabled={pushSaving}
              onChange={enabled => updatePreference('notification_foreground_sounds_enabled', enabled)}
            />
            <ToggleRow
              label="Media Previews"
              description="Show eligible public ShadowPin and event thumbnails in rich notifications."
              enabled={preferences.notification_media_enabled}
              disabled={pushSaving}
              onChange={enabled => updatePreference('notification_media_enabled', enabled)}
            />
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-semibold text-[var(--text-primary)]">Preview privacy</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {([
                ['full', 'Full', 'Member, message, and media'],
                ['sender_only', 'Sender only', 'Member with private content'],
                ['private', 'Private', 'Generic lock-screen copy'],
              ] as const).map(([value, label, description]) => {
                const selected = preferences.notification_preview_mode === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={pushSaving}
                    onClick={() => void updatePreference('notification_preview_mode', value)}
                    className={`min-h-12 rounded-[var(--radius-sm)] border px-3 py-2 text-left transition-[background-color,border-color,color] ${
                      selected
                        ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]'
                        : 'border-[var(--border-subtle)] bg-[rgba(0,0,0,0.18)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="mt-0.5 block text-[0.6875rem] leading-4 opacity-80">{description}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.18)] p-3">
            <p className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Live preview
            </p>
            <NotificationBannerV2
              envelope={notificationPreviewEnvelope}
              desktop={false}
              queuedCount={2}
              autoDismiss={false}
              onDismiss={() => toast.success('Foreground dismiss keeps the source unread')}
              onOpen={() => toast.success('The real banner opens its exact source')}
              onOpenProfile={() => toast.success('The real PFP opens the member profile')}
            />
          </div>
        </section>
      )}

      <div className="space-y-4">
        <div className="px-1">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">What you hear about</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Every alert type uses the same foreground-or-push delivery rule above.</p>
        </div>
        {notificationPreferenceGroups.map(group => (
          <section key={group.title} className="glass-panel min-w-0 rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby={`notification-group-${group.title.replace(/\W+/g, '-').toLowerCase()}`}>
            <div className="mb-4">
              <h3 id={`notification-group-${group.title.replace(/\W+/g, '-').toLowerCase()}`} className="font-semibold text-[var(--text-primary)]">{group.title}</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{group.description}</p>
            </div>
            <div className="space-y-3">
              {group.settings.map(setting => (
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
          </section>
        ))}

        {preferences && (
          <div className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Who can trigger Active User notifications?</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              A member must have been offline for at least 15 minutes. You can receive at most one alert from the same member per rolling hour.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Active user notification audience">
              {([
                ['connections', 'Connections only'],
                ['all', 'Everyone'],
              ] as const).map(([value, label]) => {
                const selected = preferences.presence_notification_scope === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={pushSaving}
                    onClick={() => void updatePreference('presence_notification_scope', value)}
                    className={`min-h-11 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-semibold transition-[background-color,border-color,color] ${
                      selected
                        ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]'
                        : 'border-[var(--border-subtle)] bg-[rgba(0,0,0,0.18)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {preferences && (
        <div className="glass-panel min-w-0 rounded-[var(--radius-lg)] p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Home Screen Badge</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Choose which unread activity counts toward the app icon. The visible count is capped at 99 and clears only after content is read.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow
              label="Direct Messages"
              description="Count unread messages in your DM conversations."
              enabled={preferences.badge_dm_enabled}
              disabled={pushSaving}
              onChange={enabled => updateBadgePreference('badge_dm_enabled', enabled)}
            />
            <ToggleRow
              label="General Chat"
              description="Count unread General Chat messages when Group Chat notifications are enabled."
              enabled={preferences.badge_group_enabled}
              disabled={pushSaving}
              onChange={enabled => updateBadgePreference('badge_group_enabled', enabled)}
            />
            <ToggleRow
              label="Mentions & Interactions"
              description="Count unread mentions, replies, reactions, and Hype activity."
              enabled={preferences.badge_interactions_enabled}
              disabled={pushSaving}
              onChange={enabled => updateBadgePreference('badge_interactions_enabled', enabled)}
            />
            <ToggleRow
              label="Connections"
              description="Count unread connection requests and accepted connections."
              enabled={preferences.badge_connections_enabled}
              disabled={pushSaving}
              onChange={enabled => updateBadgePreference('badge_connections_enabled', enabled)}
            />
            <ToggleRow
              label="ShadowPin"
              description="Count unread ShadowPin posts, comments, and replies."
              enabled={preferences.badge_shadow_pin_enabled}
              disabled={pushSaving}
              onChange={enabled => updateBadgePreference('badge_shadow_pin_enabled', enabled)}
            />
            <ToggleRow
              label="Games"
              description="Count active Shadow Checkers matches waiting for your move."
              enabled={preferences.badge_games_enabled}
              disabled={pushSaving}
              onChange={enabled => updateBadgePreference('badge_games_enabled', enabled)}
            />
          </div>
        </div>
      )}

      {preferences && (
        <div className="glass-panel min-w-0 rounded-[var(--radius-lg)] p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <Clock3 className="h-5 w-5 text-[var(--text-muted)]" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Delivery Schedule & Mutes</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">These controls are enforced by the push service for every active notification type.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow
              label="Mute All Notifications"
              description="Stop every push alert across ShadowChat until you turn this off."
              enabled={!preferences.notifications_enabled}
              disabled={pushSaving}
              onChange={muted => updatePreference('notifications_enabled', !muted)}
            />
            <ToggleRow
              label="Mute General Chat"
              description="Suppress General Chat messages, mentions, replies, reactions, and Hype."
              enabled={preferences.general_chat_muted}
              disabled={pushSaving}
              onChange={muted => updatePreference('general_chat_muted', muted)}
            />
            <ToggleRow
              label="Quiet Hours"
              description="Hold every push alert during a daily window in your local time zone."
              enabled={quietHoursEnabled}
              disabled={pushSaving}
              onChange={handleQuietHoursToggle}
            />
          </div>

          {quietHoursEnabled && (
            <div className="mt-4 grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 sm:grid-cols-2">
              <label className="text-sm text-[var(--text-secondary)]">
                Quiet hours start
                <input
                  type="time"
                  value={preferences.quiet_hours_start?.slice(0, 5) || ''}
                  disabled={pushSaving}
                  onChange={event => void handleQuietHoursTimeChange('quiet_hours_start', event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--border-glow)]"
                />
              </label>
              <label className="text-sm text-[var(--text-secondary)]">
                Quiet hours end
                <input
                  type="time"
                  value={preferences.quiet_hours_end?.slice(0, 5) || ''}
                  disabled={pushSaving}
                  onChange={event => void handleQuietHoursTimeChange('quiet_hours_end', event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--border-glow)]"
                />
              </label>
              <p className="text-xs text-[var(--text-muted)] sm:col-span-2">
                Time zone: {preferences.quiet_hours_timezone}. Disable and re-enable Quiet Hours to refresh it from this device.
              </p>
            </div>
          )}

          <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {snoozedUntil ? `Snoozed until ${snoozedUntil.toLocaleString()}` : 'Temporary snooze is off'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">A snooze pauses every push alert without changing your notification type choices.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={pushSaving} onClick={() => void handleNotificationSnooze(1)}>
                Snooze 1 hour
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={pushSaving} onClick={() => void handleNotificationSnooze(8)}>
                Snooze 8 hours
              </Button>
              {snoozedUntil && (
                <Button type="button" size="sm" disabled={pushSaving} onClick={() => void handleNotificationSnooze(null)}>
                  Resume now
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <Volume2 className="h-5 w-5 text-[var(--text-muted)]" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sounds</h2>
        </div>
        <div className="space-y-3">
          <ToggleRow
            label="Sound Effects"
            description="Play sounds for message notifications and app feedback."
            enabled={sounds}
            onChange={setSounds}
          />
          <ToggleRow
            label="Hype Sounds"
            description="Play dedicated bell and message celebration sounds."
            enabled={hypeSounds}
            onChange={setHypeSounds}
          />
        </div>

        {preferences && (
          <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Notification sound by category</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              These original cues play for foreground notifications and ship as bundled sounds in the native app. Installed PWA background alerts use your phone's configured notification sound.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {NOTIFICATION_CATEGORY_PRESENTATION_OPTIONS.map(option => (
                <label
                  key={option.category}
                  className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.18)] p-3 text-sm text-[var(--text-secondary)]"
                >
                  <span className="block font-semibold text-[var(--text-primary)]">{option.label}</span>
                  <span className="mt-0.5 block text-[0.6875rem] leading-4 text-[var(--text-muted)]">{option.description}</span>
                  <select
                    value={notificationSoundMap[option.category]}
                    disabled={savingNotificationSound === option.category}
                    onChange={event => void handleNotificationSoundChange(
                      option.category,
                      event.target.value as NotificationSoundId,
                    )}
                    className="mt-2 min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-panel-strong)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-glow)]"
                    aria-label={`${option.label} notification sound`}
                  >
                    {NOTIFICATION_SOUND_OPTIONS.map(sound => (
                      <option key={sound.id} value={sound.id}>{sound.label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
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
            <h3 className="font-medium text-[var(--text-primary)]">Watch the phone setup tutorial</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Reopen the iPhone or Android video guide for Home Screen install and notification setup.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={() => setShowPhoneInstallGuide(true)} variant="secondary" className="w-full justify-center">
              <Film className="mr-3 h-4 w-4" />
              Watch Tutorial
            </Button>
            <Button onClick={() => setShowNotificationSetup(true)} variant="ghost" className="w-full justify-center">
              <Bell className="mr-3 h-4 w-4" />
              Notification Setup
            </Button>
          </div>
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
            ['Settings', 'Use these sections to keep notification, account, app setup, and operator controls organized.'],
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
          <div className="max-h-[min(36rem,calc(var(--shadowchat-visual-viewport-height,100dvh)-15rem))] space-y-2 overflow-y-auto overscroll-contain pr-1">
            {adminFilteredUsers.map(adminUser => {
              const isCurrentFullAdmin = adminUser.admin_role === 'admin'
              const isSubAdmin = adminUser.admin_role === 'sub_admin'
              const isCurrentUser = adminUser.id === currentUser?.id
              const saving = adminSavingUserId === adminUser.id

              return (
                <div
                  key={adminUser.id}
                  className="grid min-w-0 gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="min-w-0 max-w-full truncate font-medium text-[var(--text-primary)]">{adminUser.display_name}</span>
                      <UserRoleBadge role={adminUser.admin_role} />
                      <UserPresenceBadge userId={adminUser.id} presenceVisibility={adminUser.presence_visibility} />
                      <span className="min-w-0 max-w-full truncate text-sm text-[var(--text-muted)]">@{adminUser.username}</span>
                    </div>
                    <p className="mt-1 break-all text-sm text-[var(--text-muted)]">{adminUser.email}</p>
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
      if (shouldLoadAdminUsers && adminAccessLoading) return 'Loading users'
      return adminAccessUsers.length > 0 ? `${adminAccessUsers.length} users` : 'Open to load'
    }

    if (sectionId === 'bridge-pairing') {
      return 'Pair device'
    }

    if (sectionId === 'invites') {
      return 'Signup codes'
    }

    if (sectionId === 'automation-approvals') {
      return 'Review queue'
    }

    if (sectionId === 'operations-health') {
      return 'Release status'
    }

    if (sectionId === 'feedback-review') {
      return 'Bugs & ideas'
    }

    if (sectionId === 'shado-tv-studio') {
      return 'Episodes'
    }

    if (sectionId === 'case-center') {
      return 'Report queue'
    }

    if (sectionId === 'shadow-mystery-studio') {
      return 'Stories'
    }

    if (sectionId === 'shadow-pin-activity') {
      return 'Analytics'
    }

    if (sectionId === 'news-sources') {
      return 'Source tracker'
    }

    return 'Open'
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
    BridgePairingAdminPanel ? (
      <React.Suspense fallback={<SettingsPanelLoading label="Loading bridge pairing..." />}>
        <BridgePairingAdminPanel />
      </React.Suspense>
    ) : null
  )

  const renderNewsSourcesPanel = () => (
    NewsSourcesAdminPanel ? (
      <React.Suspense fallback={<SettingsPanelLoading label="Loading news sources..." />}>
        <NewsSourcesAdminPanel />
      </React.Suspense>
    ) : null
  )

  const renderFeedbackReviewPanel = () => (
    <AdminFeedbackReview />
  )

  const renderAutomationApprovalsPanel = () => (
    <AdminAutomationApprovals />
  )

  const renderModerationCaseCenter = () => (
    <>
      <React.Suspense fallback={<SettingsPanelLoading label="Loading safety cases..." />}>
        <ModerationCaseCenter />
      </React.Suspense>
      {SHADO_LIVE_REAL_ENABLED && ShadoLiveCaseCenter && (
        <React.Suspense fallback={<SettingsPanelLoading label="Loading Shado Live safety cases..." />}>
          <ShadoLiveCaseCenter />
        </React.Suspense>
      )}
    </>
  )

  const renderMyReports = () => (
    MyReportsPanel ? (
      <React.Suspense fallback={<SettingsPanelLoading label="Loading safety reports..." />}>
        <MyReportsPanel />
      </React.Suspense>
    ) : null
  )

  const renderOperationsHealthPanel = () => (
    <React.Suspense fallback={<SettingsPanelLoading label="Loading operations health..." />}>
      <OperationsHealthCenter />
    </React.Suspense>
  )

  const renderShadowPinActivityPanel = () => (
    <React.Suspense fallback={<SettingsPanelLoading label="Loading Shadow Pin activity..." />}>
      <ShadowPinActivityAdmin />
    </React.Suspense>
  )

  const renderShadowMysteryStudioPanel = () => (
    <React.Suspense fallback={<SettingsPanelLoading label="Loading Shadow Mystery studio..." />}>
      <ShadowMysteryStudio />
    </React.Suspense>
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
      invites: () => <AdminInvitesPanel />,
      'operations-health': renderOperationsHealthPanel,
      'automation-approvals': renderAutomationApprovalsPanel,
      'bridge-pairing': renderBridgePairingPanel,
      'shado-tv-studio': () => <ShadoTvStudio />,
      'shadow-mystery-studio': renderShadowMysteryStudioPanel,
      'shadow-pin-activity': renderShadowPinActivityPanel,
      'news-sources': renderNewsSourcesPanel,
      'feedback-review': renderFeedbackReviewPanel,
      'case-center': renderModerationCaseCenter,
    }[activeAdminSection]()

    return (
      <div className="space-y-4">{content}</div>
    )
  }

  const renderColorLayout = () => (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="mb-4 flex items-center gap-3">
        <LayoutGrid className="h-5 w-5 text-[var(--text-muted)]" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Color Scheme</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(colorSchemes) as ColorScheme[]).map(key => {
          const option = colorSchemes[key]
          const previewImage = option.backdrop || option.preview
          const previewBackground = previewImage
            ? `linear-gradient(135deg, rgba(0,0,0,0.08), rgba(0,0,0,0.34)), url(${previewImage}), linear-gradient(135deg, ${option.start}, ${option.end})`
            : `radial-gradient(circle at 50% 0%, rgba(215,170,70,0.16), transparent 34%), linear-gradient(135deg, ${option.start}, ${option.end})`

          return (
            <button
              key={key}
              type="button"
              onClick={() => setScheme(key)}
              aria-pressed={scheme === key}
              className={`rounded-[var(--radius-md)] border p-3 text-left transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-0.5 ${
                scheme === key
                  ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] shadow-[var(--shadow-accent-soft)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] hover:border-[var(--border-panel)] hover:bg-[var(--theme-surface-hover)]'
              }`}
              aria-label={`Select ${option.label} color scheme`}
            >
              <span
                className="relative mb-3 block h-16 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-cover bg-center"
                style={{
                  backgroundImage: previewBackground,
                }}
              >
                {scheme === key && (
                  <span className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-glow)] bg-[var(--bg-panel-strong)] text-[var(--theme-accent-readable)] shadow-[var(--shadow-panel)]">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </span>
              <span className="flex items-center justify-between gap-2 text-sm font-medium text-[var(--text-primary)]">
                {option.label}
                <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {option.mode}
                </span>
              </span>
              <span className="mt-2 block text-xs leading-5 text-[var(--text-muted)]">
                {option.description}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const renderAccessibilityComfort = () => (
    <React.Suspense fallback={<SettingsPanelLoading label="Loading comfort controls..." />}>
      <AccessibilityComfortPanel />
    </React.Suspense>
  )

  const renderAccountProfile = () => (
    <div className="space-y-5">
      <ProfileView onToggleSidebar={onToggleSidebar} embedded />
      <WeatherLocationSettings />
      <BlockedUsersSettings />
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

      <div className="glass-panel rounded-[var(--radius-lg)] border border-[rgba(190,52,85,0.24)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-red-100">Delete Account</h2>
            <p className="mt-1 text-sm leading-6 text-red-200/80">
              Permanently removes your login and profile data from Shadow Chat. This cannot be undone.
            </p>
          </div>
          <Button
            onClick={() => {
              setDeleteAccountOpen(open => !open)
              setDeleteAccountConfirmText('')
            }}
            variant="danger"
            className="w-full justify-center sm:w-auto"
          >
            <Trash2 className="mr-3 h-4 w-4" />
            {deleteAccountOpen ? 'Cancel Delete' : 'Delete Account'}
          </Button>
        </div>

        {deleteAccountOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.36)] bg-[rgba(87,14,28,0.18)] p-4"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-red-100">
                Type DELETE to confirm
              </span>
              <input
                value={deleteAccountConfirmText}
                onChange={event => setDeleteAccountConfirmText(event.target.value)}
                autoCapitalize="characters"
                spellCheck={false}
                className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 font-mono text-sm uppercase tracking-[0.18em]"
                placeholder="DELETE"
              />
            </label>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-red-200/75">
                You will see one final browser confirmation before the account is deleted.
              </p>
              <Button
                onClick={() => void handleDeleteAccount()}
                variant="danger"
                disabled={deleteAccountConfirmText.trim().toUpperCase() !== 'DELETE'}
                loading={deleteAccountSaving}
                className="w-full justify-center sm:w-auto"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Permanently Delete
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )

  const renderSection = () => {
    if (!activeSection || !activeSectionConfig) return renderHub()

    const content = {
      'notifications-audio': renderNotificationsAudio,
      'accessibility-comfort': renderAccessibilityComfort,
      feedback: renderFeedback,
      'safety-reports': renderMyReports,
      'app-setup-guide': renderAppSetupGuide,
      admin: renderAdmin,
      'color-layout': renderColorLayout,
      'account-profile': renderAccountProfile,
    }[activeSection]()
    const showSectionHeader = !(
      (activeSection === 'admin' && activeAdminSection)
      || activeSection === 'accessibility-comfort'
    )

    return (
      <>
        {showSectionHeader && <SectionHeader section={activeSectionConfig} />}
        {content}
      </>
    )
  }

  const handleHeaderBack = () => {
    if (activeAdminSection) {
      setActiveAdminSection(null)
      return
    }

    setActiveSection(null)
  }

  return (
    <div className="theme-app-surface relative flex h-full min-h-0 flex-col text-sm">
      {isDesktop && (
        <MobileAppHeader
          currentView={currentView}
          onViewChange={onViewChange}
          title={headerTitle}
          eyebrow={headerEyebrow}
          logo={!activeSectionConfig}
          titleElement={activeSectionConfig ? 'p' : undefined}
          onBack={activeSection ? handleHeaderBack : undefined}
          backLabel={activeAdminSection ? 'Back to admin sections' : 'Back'}
          actions={activeSection === 'accessibility-comfort' ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(COMFORT_RESET_EVENT))}
              className="inline-flex h-11 min-h-[var(--comfort-control-min-size)] w-11 min-w-[var(--comfort-control-min-size)] shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--theme-accent-readable)]"
              aria-label="Reset comfort settings"
              title="Reset comfort settings"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : undefined}
          showSettings={activeSection !== 'accessibility-comfort'}
        />
      )}
      {!isDesktop && activeSection && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex items-center justify-between px-3">
          <button
            type="button"
            onClick={handleHeaderBack}
            className="theme-floating-action pointer-events-auto inline-flex h-12 min-h-[var(--comfort-control-min-size)] w-12 min-w-[var(--comfort-control-min-size)] items-center justify-center rounded-full"
            aria-label={activeAdminSection ? 'Back to admin sections' : 'Back'}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          {activeSection === 'accessibility-comfort' && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(COMFORT_RESET_EVENT))}
              className="theme-floating-action pointer-events-auto inline-flex h-12 min-h-[var(--comfort-control-min-size)] w-12 min-w-[var(--comfort-control-min-size)] items-center justify-center rounded-full"
              aria-label="Reset comfort settings"
              title="Reset comfort settings"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      <motion.div
        ref={scrollContainerRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`min-h-0 flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)_+_8rem)] ${activeSection ? 'pt-[calc(env(safe-area-inset-top)+3.5rem)]' : 'pt-[env(safe-area-inset-top)]'} md:pb-[calc(env(safe-area-inset-bottom)_+_4rem)] md:pt-0`}
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
    </div>
  )
}
