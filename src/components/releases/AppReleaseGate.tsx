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
  type AppReleaseSection,
  type VisibleAppRelease,
} from '../../lib/supabase'
import { runRealtimeRecovery } from '../../lib/realtimeRecovery'
import { useRealtimeRecovery } from '../../hooks/useRealtimeRecovery'
import {
  APP_RELEASE_CHECKS_ENABLED,
  CURRENT_APP_BUILD_ID,
  canAutoRestartRelease,
  chooseVisibleAppRelease,
  getAppReleasePresentation,
  getClientUserAgent,
  restartAppForRelease,
} from '../../lib/appReleases'
import { cn } from '../../lib/utils'

const RELEASE_POLL_MS = 60000
const CRITICAL_RESTART_SECONDS = 15
const THEME_RELEASE_PATTERN = /\b(blush bloom|mint fizz|silver halo)\b/i
const RELEASE_REALTIME_TOPIC = 'app-release-updates'
const RELEASE_BROADCAST_EVENT = 'app_release_published'
const RELEASE_LOCAL_STORAGE_KEY = 'shadowchat:app-release-update-signal'
const RELEASE_REFRESH_DEBOUNCE_MS = 150

const RELEASE_THEME_PREVIEWS = [
  {
    label: 'Blush Bloom',
    caption: 'Pearl blush',
    preview: '/themes/blush-bloom/preview.webp',
    pattern: /\bblush bloom\b/i,
  },
  {
    label: 'Mint Fizz',
    caption: 'Fresh mint',
    preview: '/themes/mint-fizz/preview.webp',
    pattern: /\bmint fizz\b/i,
  },
  {
    label: 'Silver Halo',
    caption: 'Chrome glow',
    preview: '/themes/silver-halo/preview.webp',
    pattern: /\bsilver halo\b/i,
  },
] as const

const PROFILE_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

const getRecognitionAccentColor = (value?: string | null) => {
  const color = value?.trim() || ''
  return PROFILE_COLOR_PATTERN.test(color) ? color : '#c9972f'
}

const getRecognitionName = (section: AppReleaseSection) => (
  section.recognition?.displayName ||
  section.recognition?.username ||
  'ShadowChat member'
)

const getRecognitionInitial = (section: AppReleaseSection) => {
  const name = getRecognitionName(section).trim()
  return name.charAt(0).toUpperCase() || 'S'
}

const getRecognitionHandle = (section: AppReleaseSection) => {
  const username = section.recognition?.username?.trim()
  return username ? `@${username}` : ''
}

const StandardReleaseSection = ({ section }: { section: AppReleaseSection }) => (
  <section className="app-release-section rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{section.heading}</h3>
    {section.items.length > 0 && (
      <ul className="mt-3 space-y-2 text-sm leading-5 text-[var(--text-secondary)]">
        {section.items.map(item => (
          <li key={item} className="flex gap-2">
            <CheckCircle2 className="app-release-check mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--text-gold)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    )}
  </section>
)

const RecognitionReleaseSection = ({ section }: { section: AppReleaseSection }) => {
  const recognition = section.recognition
  if (!recognition) {
    return <StandardReleaseSection section={section} />
  }

  const accentColor = getRecognitionAccentColor(recognition.profileColor)
  const bannerSrc = recognition.bannerThumbnailUrl || recognition.bannerUrl
  const avatarSrc = recognition.avatarThumbnailUrl || recognition.avatarUrl
  const handle = getRecognitionHandle(section)

  return (
    <section className="app-release-section app-release-recognition overflow-hidden rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.2)] bg-[rgba(255,255,255,0.035)]">
      <div className="relative h-28 overflow-hidden sm:h-36">
        {bannerSrc ? (
          <img
            src={bannerSrc}
            alt={`${getRecognitionName(section)} banner`}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(135deg, ${accentColor}66, rgba(255,255,255,0.04))`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,8,9,0.92)] via-[rgba(7,8,9,0.28)] to-[rgba(7,8,9,0.08)]" />
      </div>

      <div className="relative px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
        <div className="-mt-9 flex min-w-0 items-end gap-3">
          <div
            className="flex h-[4.5rem] w-[4.5rem] flex-shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[rgba(255,255,255,0.28)] bg-[rgba(9,10,11,0.88)] text-2xl font-semibold text-[var(--text-primary)] shadow-[0_12px_28px_rgba(0,0,0,0.35)]"
            style={{ boxShadow: `0 0 0 1px ${accentColor}66, 0 12px 28px rgba(0,0,0,0.35)` }}
          >
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={`${getRecognitionName(section)} avatar`}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <span>{getRecognitionInitial(section)}</span>
            )}
          </div>
          <div className="min-w-0 pb-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-gold)]">
              Community request shipped
            </p>
            <h3 className="truncate text-lg font-semibold leading-tight text-[var(--text-primary)]">
              {getRecognitionName(section)}
            </h3>
            {handle && (
              <p className="truncate text-xs text-[var(--text-muted)]">{handle}</p>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {recognition.featureTitle && (
            <p className="text-sm font-medium leading-5 text-[var(--text-primary)]">
              {recognition.featureTitle}
            </p>
          )}
          {section.items.length > 0 && (
            <ul className="space-y-2 text-sm leading-5 text-[var(--text-secondary)]">
              {section.items.map(item => (
                <li key={item} className="flex gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--text-gold)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

const ReleaseSection = ({ section }: { section: AppReleaseSection }) => (
  section.kind === 'recognition' && section.recognition
    ? <RecognitionReleaseSection section={section} />
    : <StandardReleaseSection section={section} />
)

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

const getReleaseSearchContent = (release: VisibleAppRelease) => (
  [
    release.title,
    release.summary,
    ...release.sections.flatMap(section => [section.heading, ...section.items]),
  ].join(' ')
)

const isThemeRelease = (release: VisibleAppRelease) => (
  THEME_RELEASE_PATTERN.test(getReleaseSearchContent(release))
)

const getReleaseThemePreviews = (release: VisibleAppRelease) => {
  const content = getReleaseSearchContent(release)
  return RELEASE_THEME_PREVIEWS.filter(theme => theme.pattern.test(content))
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
  const themeLaunchAnnouncement = useMemo(
    () => release ? isThemeRelease(release) : false,
    [release]
  )
  const themeLaunchPreviews = useMemo(
    () => release ? getReleaseThemePreviews(release) : [],
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

  useRealtimeRecovery(() => {
    void refreshReleases()
  })

  useEffect(() => {
    if (!user || !APP_RELEASE_CHECKS_ENABLED) {
      setRelease(null)
      return
    }

    let disposed = false
    let channel: any = null
    let localChannel: BroadcastChannel | null = null
    let refreshTimeoutId: number | null = null

    const safeRefresh = (immediate = false) => {
      if (disposed) {
        return
      }

      if (refreshTimeoutId !== null) {
        window.clearTimeout(refreshTimeoutId)
        refreshTimeoutId = null
      }

      if (immediate) {
        void refreshReleases()
        return
      }

      refreshTimeoutId = window.setTimeout(() => {
        refreshTimeoutId = null
        if (!disposed) {
          void refreshReleases()
        }
      }, RELEASE_REFRESH_DEBOUNCE_MS)
    }

    const fanOutReleaseSignal = (payload: unknown) => {
      localChannel?.postMessage(payload)
      try {
        window.localStorage.setItem(
          RELEASE_LOCAL_STORAGE_KEY,
          JSON.stringify({
            payload,
            signaled_at: new Date().toISOString(),
          })
        )
      } catch {
        // local fanout is best-effort; the current tab still refreshes directly.
      }
    }

    const handleReleasePush = (payload: unknown) => {
      fanOutReleaseSignal(payload)
      safeRefresh(true)
    }

    const handleStorageSignal = (event: StorageEvent) => {
      if (event.key === RELEASE_LOCAL_STORAGE_KEY && event.newValue) {
        safeRefresh(true)
      }
    }
    const scheduleRefresh = () => safeRefresh()

    safeRefresh(true)
    const intervalId = window.setInterval(safeRefresh, RELEASE_POLL_MS)
    window.addEventListener('focus', scheduleRefresh)
    window.addEventListener('pageshow', scheduleRefresh)
    window.addEventListener('online', scheduleRefresh)
    window.addEventListener('storage', handleStorageSignal)
    document.addEventListener('visibilitychange', scheduleRefresh)

    try {
      if ('BroadcastChannel' in window) {
        localChannel = new BroadcastChannel(RELEASE_REALTIME_TOPIC)
        localChannel.onmessage = () => safeRefresh(true)
      }

      const client = getRealtimeClient()
      channel = client
        ?.channel(RELEASE_REALTIME_TOPIC, {
          config: { broadcast: { self: false } },
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'app_releases' },
          (payload: unknown) => handleReleasePush(payload)
        )
        .on(
          'broadcast',
          { event: RELEASE_BROADCAST_EVENT },
          (payload: unknown) => handleReleasePush(payload)
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            safeRefresh(true)
            return
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            void runRealtimeRecovery('channel-error', { sessionReady: true }).finally(() => {
              safeRefresh()
            })
          }
        })
    } catch {
      channel = null
    }

    return () => {
      disposed = true
      if (refreshTimeoutId !== null) {
        window.clearTimeout(refreshTimeoutId)
      }
      window.clearInterval(intervalId)
      window.removeEventListener('focus', scheduleRefresh)
      window.removeEventListener('pageshow', scheduleRefresh)
      window.removeEventListener('online', scheduleRefresh)
      window.removeEventListener('storage', handleStorageSignal)
      document.removeEventListener('visibilitychange', scheduleRefresh)
      localChannel?.close()
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
    <div
      className={cn(
        'fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(4,5,6,0.76)] p-3 backdrop-blur-md sm:items-center sm:p-6',
        themeLaunchAnnouncement && 'app-release-overlay--theme-launch'
      )}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-release-title"
        className={cn(
          'popup-surface app-release-dialog flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] sm:max-h-[calc(100dvh-3rem)]',
          themeLaunchAnnouncement && 'app-release-dialog--theme-launch'
        )}
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

          {themeLaunchPreviews.length > 0 && (
            <div
              className={cn(
                'app-release-preview mt-5 overflow-hidden rounded-[var(--radius-md)]',
                themeLaunchPreviews.length > 1 && 'app-release-preview--multi'
              )}
            >
              <div className={cn(themeLaunchPreviews.length > 1 && 'app-release-preview__grid')}>
                {themeLaunchPreviews.map(item => (
                  <img
                    key={item.preview}
                    src={item.preview}
                    alt={`${item.label} theme preview`}
                    title={`${item.label} - ${item.caption}`}
                    className={cn(
                      'app-release-preview__image',
                      themeLaunchPreviews.length > 1 && 'app-release-preview__image--tile'
                    )}
                    draggable={false}
                  />
                ))}
              </div>
              <div className="app-release-preview__caption">
                <span>{themeLaunchPreviews.length > 1 ? 'Theme Drop' : 'Theme Launch'}</span>
                <span>{themeLaunchPreviews.length > 1 ? 'New themes in Settings' : 'Now in Settings'}</span>
              </div>
            </div>
          )}

          {(presentation.wantsRestart || criticalCountdown !== null) && (
            <div className="app-release-restart mt-5 rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.07)] p-3.5 text-sm leading-5 text-[var(--text-secondary)]">
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
            {release.sections.length > 0 ? release.sections.map((section, index) => (
              <ReleaseSection
                key={`${section.kind || 'standard'}-${section.heading}-${index}`}
                section={section}
              />
            )) : (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
                Shadow Chat has been updated.
              </div>
            )}
          </div>
        </div>

        <div className="app-release-footer mt-5 border-t border-[var(--border-subtle)] bg-[rgba(10,11,12,0.82)] p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
            {releaseDate && <span>{releaseDate}</span>}
            {release.commit_sha && <span>Build {release.commit_sha.slice(0, 7)}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {presentation.wantsRestart && (
              <Button
                onClick={() => void restartForRelease(release)}
                loading={loadingRestart}
                className={cn(
                  'app-release-primary-action w-full justify-center',
                  presentation.blocksDismiss && 'sm:col-span-2'
                )}
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
