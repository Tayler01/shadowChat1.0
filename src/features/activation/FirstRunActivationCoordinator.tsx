import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { useAuth } from '../../hooks/useAuth'
import { useComfortPreferences } from '../../hooks/useComfortPreferences'
import { usePushNotifications } from '../../hooks/usePushNotifications'
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt'
import type { AppView } from '../../types/navigation'
import { getMyActivationJourney, updateMyActivationJourney } from './activationApi'
import {
  closeActivationHistory,
  enterActivationHistory,
  isActivationHistoryEntry,
  replaceActivationHistory,
} from './activationHistory'
import type {
  ActivationInstallChoice,
  ActivationJourney,
  ActivationNotificationChoice,
} from './activationTypes'
import type {
  ActivationIdentityInput,
  ActivationJourneyFirstAction,
  ActivationJourneyVisibleStep,
} from './FirstRunActivationJourney'

const LazyFirstRunActivationJourney = lazy(() => import('./FirstRunActivationJourney').then(module => ({
  default: module.FirstRunActivationJourney,
})))

const PhoneInstallGuide = lazy(() => import('../../components/onboarding/PhoneInstallGuide').then(module => ({
  default: module.PhoneInstallGuide,
})))

const LazyActivationStatusCard = lazy(() => import('./ActivationStatusCard').then(module => ({
  default: module.ActivationStatusCard,
})))

type FirstRunActivationCoordinatorProps = {
  currentView: AppView
  onNavigate: (view: Extract<AppView, 'chat' | 'dms' | 'pins'>) => void
  onEnrollmentStateChange?: (state: 'checking' | 'enrolled' | 'unenrolled') => void
}

const ACTIVATION_LOOKUP_RETRY_MS = [750, 2_000, 5_000, 15_000, 30_000]
const FIRST_ACTION_REFRESH_FALLBACK_MS = 60_000

const ACTION_DESTINATIONS: Record<ActivationJourneyFirstAction, Extract<AppView, 'chat' | 'dms' | 'pins'>> = {
  group_message: 'chat',
  direct_message: 'dms',
  shadow_pin_heart: 'pins',
}

const isInstalledApp = () => {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true
}

const browserNotificationPermission = (): NotificationPermission | 'unsupported' => (
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
)

export function FirstRunActivationCoordinator({
  currentView,
  onNavigate,
  onEnrollmentStateChange,
}: FirstRunActivationCoordinatorProps) {
  const { profile, updateProfile, uploadAvatar } = useAuth()
  const { preferences, applyPreset } = useComfortPreferences()
  const push = usePushNotifications({ enabled: false })
  const { canInstall, promptInstall } = usePwaInstallPrompt()
  const [journey, setJourney] = useState<ActivationJourney | null>(null)
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installGuideOpen, setInstallGuideOpen] = useState(false)
  const journeyRef = useRef<ActivationJourney | null>(null)
  const requestTokenRef = useRef(0)
  const popstateActionRef = useRef<() => void>(() => undefined)
  const selectedPreset = preferences.preset

  const applyJourney = useCallback((next: ActivationJourney | null) => {
    journeyRef.current = next
    setJourney(next)
  }, [])

  const refresh = useCallback(async () => {
    const requestToken = ++requestTokenRef.current
    const next = await getMyActivationJourney()
    if (next === undefined) return undefined
    if (requestToken !== requestTokenRef.current) return next
    applyJourney(next)
    if (profile?.id) setCheckedUserId(profile.id)
    onEnrollmentStateChange?.(next ? 'enrolled' : 'unenrolled')
    return next
  }, [applyJourney, onEnrollmentStateChange, profile?.id])

  useEffect(() => {
    requestTokenRef.current += 1
    applyJourney(null)
    setCheckedUserId(null)
    setError(null)
    setInstallGuideOpen(false)
    onEnrollmentStateChange?.('checking')
    if (!profile?.id) return

    let cancelled = false
    let retryTimer: number | null = null
    const checkEnrollment = async (attempt = 0) => {
      const next = await refresh()
      if (cancelled || next !== undefined) return
      const retryDelay = ACTIVATION_LOOKUP_RETRY_MS[Math.min(attempt, ACTIVATION_LOOKUP_RETRY_MS.length - 1)]
      retryTimer = window.setTimeout(() => void checkEnrollment(attempt + 1), retryDelay)
    }
    void checkEnrollment()
    return () => {
      cancelled = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
    }
  }, [applyJourney, onEnrollmentStateChange, profile?.id, refresh])

  const updateJourney = useCallback(async (
    step: Parameters<typeof updateMyActivationJourney>[1],
    choice: Parameters<typeof updateMyActivationJourney>[2] = null
  ) => {
    const current = journeyRef.current
    if (!current) throw new Error('Activation setup is not available.')
    const updated = await updateMyActivationJourney(current, step, choice)
    applyJourney(updated)
    return updated
  }, [applyJourney])

  useEffect(() => {
    const current = journey
    if (!current || current.currentStep === 'complete' || current.presentationState !== 'expanded') return
    enterActivationHistory()
  }, [journey])

  useEffect(() => {
    if (!journey) return
    const handlePopState = () => popstateActionRef.current()
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [journey])

  popstateActionRef.current = () => {
    if (installGuideOpen) {
      setInstallGuideOpen(false)
      void (async () => {
        try {
          setBusy(true)
          await updateJourney('install', 'later')
          await updateJourney('presentation', 'minimized')
        } catch {
          await refresh()
        } finally {
          setBusy(false)
        }
      })()
      return
    }
    if (journeyRef.current?.presentationState === 'expanded') {
      void (async () => {
        try {
          const updated = await updateJourney('presentation', 'minimized')
          applyJourney(updated)
        } catch {
          await refresh()
        }
      })()
    }
  }

  useEffect(() => {
    if (!journey || journey.currentStep !== 'first_action') return
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'hidden') return
      void refresh()
    }
    const interval = window.setInterval(refreshWhenVisible, FIRST_ACTION_REFRESH_FALLBACK_MS)
    window.addEventListener('focus', refreshWhenVisible)
    window.addEventListener('pageshow', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshWhenVisible)
      window.removeEventListener('pageshow', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [journey, refresh])

  const minimize = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await updateJourney('presentation', 'minimized')
      closeActivationHistory(() => undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save setup progress.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, updateJourney])

  const expand = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await updateJourney('presentation', 'expanded')
      enterActivationHistory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to resume setup.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, updateJourney])

  const saveIdentity = useCallback(async (input: ActivationIdentityInput) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await updateProfile({
        display_name: input.displayName,
        status_message: input.statusMessage,
      })
      if (input.avatarFile) await uploadAvatar(input.avatarFile)
      await updateJourney('identity')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save your identity.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, updateJourney, updateProfile, uploadAvatar])

  const saveNotificationChoice = useCallback(async (choice: ActivationNotificationChoice) => {
    await updateJourney('preferences', choice)
  }, [updateJourney])

  const enableNotifications = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (!push.supported) {
        await saveNotificationChoice('notifications_unsupported')
      } else if (push.subscribed || browserNotificationPermission() === 'granted') {
        if (!push.subscribed) await push.enablePush()
        await saveNotificationChoice('notifications_enabled')
      } else {
        // This is the only activation path that may request browser permission,
        // and it runs directly from the member's button click.
        await push.enablePush()
        await saveNotificationChoice('notifications_enabled')
      }
    } catch (cause) {
      if (browserNotificationPermission() === 'denied') {
        try {
          await saveNotificationChoice('notifications_denied')
        } catch (saveCause) {
          setError(saveCause instanceof Error ? saveCause.message : 'Unable to save notification choice.')
        }
      } else {
        setError(cause instanceof Error ? cause.message : 'Unable to enable notifications.')
      }
      // Enabling push may have succeeded before a revision conflict on the
      // journey receipt. Reconcile server progress so retries do not reuse a
      // stale revision while leaving the real device subscription intact.
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, push, refresh, saveNotificationChoice])

  const notificationsLater = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await saveNotificationChoice('notifications_later')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save notification choice.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, saveNotificationChoice])

  const chooseFirstAction = useCallback(async (action: ActivationJourneyFirstAction) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await updateJourney('first_action', action)
      await updateJourney('presentation', 'minimized')
      replaceActivationHistory()
      onNavigate(ACTION_DESTINATIONS[action])
      void refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open your first action.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, onNavigate, refresh, updateJourney])

  const continueSelectedAction = useCallback(() => {
    const action = journeyRef.current?.selectedFirstActionKind
    if (!action) {
      void expand()
      return
    }
    onNavigate(ACTION_DESTINATIONS[action])
    void refresh()
  }, [expand, onNavigate, refresh])

  const recordInstallChoice = useCallback(async (choice: ActivationInstallChoice) => {
    await updateJourney('install', choice)
    await updateJourney('presentation', 'minimized')
  }, [updateJourney])

  const completeInstallFlow = useCallback(async (choice: ActivationInstallChoice) => {
    await recordInstallChoice(choice)
    setInstallGuideOpen(false)
    if (isActivationHistoryEntry()) closeActivationHistory(() => undefined)
  }, [recordInstallChoice])

  const finishInstall = useCallback(async (choice: ActivationInstallChoice) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await completeInstallFlow(choice)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save install choice.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, completeInstallFlow, refresh])

  const promptAndRecordInstall = useCallback(async () => {
    if (busy) return null
    setBusy(true)
    setError(null)
    try {
      const outcome = await promptInstall()
      if (outcome === 'accepted') await completeInstallFlow('installed')
      return outcome
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open the install prompt.')
      return null
    } finally {
      setBusy(false)
    }
  }, [busy, completeInstallFlow, promptInstall])

  const startInstall = useCallback(async () => {
    if (busy) return
    if (isInstalledApp()) {
      await finishInstall('installed')
      return
    }
    if (canInstall) {
      await promptAndRecordInstall()
      return
    }
    enterActivationHistory()
    setInstallGuideOpen(true)
  }, [busy, canInstall, finishInstall, promptAndRecordInstall])

  if (!profile || checkedUserId !== profile.id || !journey) return null

  const isComplete = journey.currentStep === 'complete'
  const expanded = journey.presentationState === 'expanded'

  return (
    <>
      {!isComplete && expanded && (
        <Suspense fallback={<div className="fixed inset-0 z-[140] flex items-center justify-center bg-[var(--bg-app)]" aria-label="Opening first-run setup"><LoadingSpinner /></div>}>
          <LazyFirstRunActivationJourney
            open
            step={journey.currentStep as ActivationJourneyVisibleStep}
            profile={profile}
            selectedPreset={selectedPreset}
            notificationsSupported={push.supported}
            notificationsSubscribed={push.subscribed}
            busy={busy}
            error={error}
            onClose={() => void minimize()}
            onIdentity={saveIdentity}
            onPresetChange={applyPreset}
            onEnableNotifications={enableNotifications}
            onNotificationsLater={notificationsLater}
            onFirstAction={chooseFirstAction}
          />
        </Suspense>
      )}

      {((!isComplete && !expanded) || (isComplete && expanded)) && (
        <Suspense fallback={null}>
          <LazyActivationStatusCard
            currentView={currentView}
            complete={isComplete}
            selectedFirstActionKind={journey.selectedFirstActionKind}
            busy={busy}
            error={error}
            onContinue={continueSelectedAction}
            onReview={() => void expand()}
            onDismiss={() => void finishInstall(journey.installChoice ?? 'later')}
            onInstall={() => void startInstall()}
            onLater={() => void finishInstall('later')}
          />
        </Suspense>
      )}

      {installGuideOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-[140] flex items-center justify-center bg-[var(--bg-app)]" role="status" aria-label="Opening phone setup"><LoadingSpinner /></div>}>
          <PhoneInstallGuide
            open
            canInstall={canInstall}
            onClose={() => void finishInstall('later')}
            onComplete={() => void finishInstall(isInstalledApp() ? 'installed' : 'later')}
            onInstall={promptAndRecordInstall}
          />
        </Suspense>
      )}
    </>
  )
}
