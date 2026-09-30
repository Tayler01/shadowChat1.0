import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { useAuth } from '../../hooks/useAuth'
import {
  fetchVisibleAppReleases,
  getRealtimeClient,
  recordAppReleaseReceipt,
  type VisibleAppRelease,
} from '../../lib/supabase'
import { runRealtimeRecovery } from '../../lib/realtimeRecovery'
import { useRealtimeRecovery } from '../../hooks/useRealtimeRecovery'
import {
  APP_RELEASE_CHECKS_ENABLED,
  shouldDeferAppReleaseRefresh,
  CURRENT_APP_BUILD_ID,
  canAutoRestartRelease,
  chooseVisibleAppRelease,
  getAppReleasePresentation,
  getClientUserAgent,
  restartAppForRelease,
} from '../../lib/appReleases'

const LazyAppReleaseDialog = lazy(() => import('./AppReleaseDialog').then(module => ({ default: module.AppReleaseDialog })))

const RELEASE_POLL_MS = 60000
const CRITICAL_RESTART_SECONDS = 15
const RELEASE_REALTIME_TOPIC = 'app-release-updates'
const RELEASE_BROADCAST_EVENT = 'app_release_published'
const RELEASE_LOCAL_STORAGE_KEY = 'shadowchat:app-release-update-signal'
const RELEASE_REFRESH_DEBOUNCE_MS = 150

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

      if (shouldDeferAppReleaseRefresh(document.visibilityState, immediate)) {
        if (refreshTimeoutId !== null) {
          window.clearTimeout(refreshTimeoutId)
          refreshTimeoutId = null
        }
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
        if (!disposed && !shouldDeferAppReleaseRefresh(document.visibilityState, false)) {
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
    const intervalId = window.setInterval(() => {
      if (!shouldDeferAppReleaseRefresh(document.visibilityState, false)) {
        safeRefresh()
      }
    }, RELEASE_POLL_MS)
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

  return (
    <Suspense fallback={(
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(4,5,6,0.76)] p-6" role="dialog" aria-modal="true" aria-label="Loading update details">
        <div className="popup-surface space-y-4 rounded-[var(--radius-lg)] p-6 text-[var(--text-primary)]">
          <p role="status">Loading update details…</p>
          {presentation.wantsRestart && <Button loading={loadingRestart} onClick={() => void restartForRelease(release)}>{presentation.restartLabel}</Button>}
          {!presentation.blocksDismiss && <Button variant="secondary" onClick={() => void closeRelease()}>{presentation.closeLabel}</Button>}
        </div>
      </div>
    )}>
      <LazyAppReleaseDialog release={release} presentation={presentation} loadingRestart={loadingRestart} criticalCountdown={criticalCountdown} restartForRelease={restartForRelease} closeRelease={closeRelease} />
    </Suspense>
  )
}
