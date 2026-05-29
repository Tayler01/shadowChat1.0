import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuth } from '../../hooks/useAuth'
import {
  fetchVisibleAppReleases,
  getRealtimeClient,
  recordAppReleaseReceipt,
  type VisibleAppRelease,
} from '../../lib/supabase'
import { createRealtimeChannelName } from '../../lib/realtimeChannelName'
import {
  APP_RELEASE_CHECKS_ENABLED,
  CURRENT_APP_BUILD_ID,
  canAutoRestartRelease,
  chooseVisibleAppRelease,
  getAppReleasePresentation,
  getClientUserAgent,
  restartAppForRelease,
} from '../../lib/appReleases'

const RELEASE_POLL_MS = 60000
const CRITICAL_RESTART_SECONDS = 15

const formatReleaseDate = (value: string) => {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

const getReleaseBadge = (release: VisibleAppRelease, wantsRestart: boolean) => {
  if (release.restart_policy === 'critical_force_restart') {
    return 'Critical update'
  }

  if (release.restart_policy === 'required_restart') {
    return 'Restart required'
  }

  if (wantsRestart) {
    return 'Update available'
  }

  return "What's new"
}

export function AppReleaseGate() {
  const { user } = useAuth()
  const [release, setRelease] = useState<VisibleAppRelease | null>(null)
  const [loadingRestart, setLoadingRestart] = useState(false)
  const [criticalCountdown, setCriticalCountdown] = useState<number | null>(null)
  const deliveredRef = useRef<Set<string>>(new Set())
  const seenRef = useRef<Set<string>>(new Set())

  const presentation = useMemo(
    () => release ? getAppReleasePresentation(release) : null,
    [release]
  )

  const refreshReleases = useCallback(async () => {
    if (!user || !APP_RELEASE_CHECKS_ENABLED) {
      setRelease(null)
      return
    }

    const visibleReleases = await fetchVisibleAppReleases().catch(() => [])
    setRelease(chooseVisibleAppRelease(visibleReleases))
  }, [user])

  useEffect(() => {
    if (!user || !APP_RELEASE_CHECKS_ENABLED) {
      setRelease(null)
      return
    }

    let disposed = false
    let channel: any = null

    const safeRefresh = () => {
      if (!disposed) {
        void refreshReleases()
      }
    }

    safeRefresh()
    const intervalId = window.setInterval(safeRefresh, RELEASE_POLL_MS)
    window.addEventListener('focus', safeRefresh)
    window.addEventListener('pageshow', safeRefresh)
    window.addEventListener('online', safeRefresh)
    document.addEventListener('visibilitychange', safeRefresh)

    try {
      const client = getRealtimeClient()
      channel = client
        ?.channel(createRealtimeChannelName('public:app_releases:gate'))
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'app_releases' },
          safeRefresh
        )
        .subscribe()
    } catch {
      channel = null
    }

    return () => {
      disposed = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', safeRefresh)
      window.removeEventListener('pageshow', safeRefresh)
      window.removeEventListener('online', safeRefresh)
      document.removeEventListener('visibilitychange', safeRefresh)
      if (channel) {
        getRealtimeClient()?.removeChannel?.(channel)
      }
    }
  }, [refreshReleases, user])

  useEffect(() => {
    if (!release || !APP_RELEASE_CHECKS_ENABLED) {
      return
    }

    if (!deliveredRef.current.has(release.id)) {
      deliveredRef.current.add(release.id)
      void recordAppReleaseReceipt(
        release.id,
        'delivered',
        CURRENT_APP_BUILD_ID,
        getClientUserAgent()
      ).catch(() => undefined)
    }

    if (!seenRef.current.has(release.id)) {
      seenRef.current.add(release.id)
      void recordAppReleaseReceipt(
        release.id,
        'seen',
        CURRENT_APP_BUILD_ID,
        getClientUserAgent()
      ).catch(() => undefined)
    }
  }, [release])

  const restartForRelease = useCallback(async (targetRelease: VisibleAppRelease) => {
    setLoadingRestart(true)
    await recordAppReleaseReceipt(
      targetRelease.id,
      'restarted',
      CURRENT_APP_BUILD_ID,
      getClientUserAgent()
    ).catch(() => undefined)
    await restartAppForRelease()
  }, [])

  useEffect(() => {
    if (!release || !presentation?.autoRestart) {
      setCriticalCountdown(null)
      return
    }

    if (!canAutoRestartRelease(release.id)) {
      setCriticalCountdown(null)
      return
    }

    let remaining = CRITICAL_RESTART_SECONDS
    setCriticalCountdown(remaining)
    const intervalId = window.setInterval(() => {
      remaining -= 1
      setCriticalCountdown(Math.max(remaining, 0))
    }, 1000)
    const timeoutId = window.setTimeout(() => {
      void restartForRelease(release)
    }, CRITICAL_RESTART_SECONDS * 1000)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [presentation?.autoRestart, release, restartForRelease])

  const closeRelease = async () => {
    if (!release || !presentation || presentation.blocksDismiss) {
      return
    }

    const event = presentation.wantsRestart && !presentation.isCurrentBuild
      ? 'dismissed'
      : 'acknowledged'

    await recordAppReleaseReceipt(
      release.id,
      event,
      CURRENT_APP_BUILD_ID,
      getClientUserAgent()
    ).catch(() => undefined)
    setRelease(null)
  }

  if (!release || !presentation?.shouldShow) {
    return null
  }

  const releaseDate = formatReleaseDate(release.published_at)
  const badge = getReleaseBadge(release, presentation.wantsRestart)
  const summary = release.summary.trim()

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(4,5,6,0.76)] p-3 backdrop-blur-md sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-release-title"
        className="popup-surface flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] sm:max-h-[calc(100dvh-3rem)]"
      >
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[rgba(215,170,70,0.2)] bg-[rgba(215,170,70,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-gold)]">
                {release.severity === 'critical' || presentation.blocksDismiss ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {badge}
              </div>
              <h2 id="app-release-title" className="text-2xl font-semibold leading-tight text-[var(--text-primary)]">
                {release.title}
              </h2>
              {summary && (
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {summary}
                </p>
              )}
            </div>

            {!presentation.blocksDismiss && (
              <button
                type="button"
                onClick={() => void closeRelease()}
                className="popup-close flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
                aria-label="Close update notes"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {(presentation.wantsRestart || criticalCountdown !== null) && (
            <div className="mt-5 rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.07)] p-3.5 text-sm leading-5 text-[var(--text-secondary)]">
              {presentation.autoRestart ? (
                <p>
                  This update is critical. Shadow Chat will restart{criticalCountdown !== null ? ` in ${criticalCountdown}s` : ''}.
                </p>
              ) : presentation.blocksDismiss ? (
                <p>This update needs a restart before Shadow Chat can keep running smoothly.</p>
              ) : (
                <p>A quick restart will load the newest version now.</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex-1 overflow-y-auto px-5 sm:px-6">
          <div className="space-y-3">
            {release.sections.length > 0 ? release.sections.map(section => (
              <section
                key={section.heading}
                className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4"
              >
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{section.heading}</h3>
                {section.items.length > 0 && (
                  <ul className="mt-3 space-y-2 text-sm leading-5 text-[var(--text-secondary)]">
                    {section.items.map(item => (
                      <li key={item} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--text-gold)]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )) : (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
                Shadow Chat has been updated.
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 border-t border-[var(--border-subtle)] bg-[rgba(10,11,12,0.82)] p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
            {releaseDate && <span>{releaseDate}</span>}
            {release.commit_sha && <span>Build {release.commit_sha.slice(0, 7)}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {presentation.wantsRestart && (
              <Button
                onClick={() => void restartForRelease(release)}
                loading={loadingRestart}
                className="w-full justify-center"
              >
                <RefreshCw className="mr-3 h-4 w-4" />
                {presentation.restartLabel}
              </Button>
            )}

            {!presentation.blocksDismiss && (
              <Button
                onClick={() => void closeRelease()}
                variant={presentation.wantsRestart ? 'secondary' : 'primary'}
                className="w-full justify-center"
              >
                {presentation.closeLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
