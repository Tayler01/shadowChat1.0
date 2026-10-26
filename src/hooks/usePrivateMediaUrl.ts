import { useEffect, useState } from 'react'
import {
  getPrivateMediaGeneration,
  PRIVATE_MEDIA_ENABLED,
  PRIVATE_MEDIA_REFRESH_MARGIN_MS,
  requiresPrivateMediaUrl,
  resolvePrivateMediaSource,
  subscribePrivateMediaInvalidation,
} from '../lib/privateMediaUrls'

type ResolvedSource = { source: string; url: string; generation: number }
type PrivateMediaHookOptions = { enabled?: boolean }

/** Undefined means pending/denied. Never replace it with the original public URL. */
const useSignedPrivateMediaUrl = (source?: string | null, options: PrivateMediaHookOptions = {}) => {
  const [resolved, setResolved] = useState<ResolvedSource | null>(null)
  const enabled = options.enabled !== false
  const requiresSigning = requiresPrivateMediaUrl(source)

  useEffect(() => {
    if (!enabled || !source || !requiresSigning) return
    let disposed = false
    let revision = 0
    let refreshTimer: ReturnType<typeof setTimeout> | undefined

    const refresh = async (clear: boolean) => {
      const currentRevision = ++revision
      if (refreshTimer) clearTimeout(refreshTimer)
      if (clear) setResolved(null)
      try {
        const result = await resolvePrivateMediaSource(source)
        if (disposed || currentRevision !== revision) return
        setResolved({ source, url: result.url, generation: getPrivateMediaGeneration() })
        if (result.expiresAt) {
          refreshTimer = setTimeout(() => { void refresh(false) }, Math.max(1000, result.expiresAt - Date.now() - PRIVATE_MEDIA_REFRESH_MARGIN_MS))
        }
      } catch {
        if (!disposed && currentRevision === revision) setResolved(null)
      }
    }
    const unsubscribe = subscribePrivateMediaInvalidation(() => { void refresh(true) })
    const resume = () => {
      if (document.visibilityState === 'visible') void refresh(false)
    }
    document.addEventListener('visibilitychange', resume)
    void refresh(false)
    return () => {
      disposed = true
      revision += 1
      if (refreshTimer) clearTimeout(refreshTimer)
      unsubscribe()
      document.removeEventListener('visibilitychange', resume)
    }
  }, [enabled, source, requiresSigning])

  if (!enabled || !source) return undefined
  if (!requiresSigning) return source
  return resolved?.source === source && resolved.generation === getPrivateMediaGeneration() ? resolved.url : undefined
}

const usePublicMediaUrl = (source?: string | null, options: PrivateMediaHookOptions = {}) =>
  options.enabled !== false && source ? source : undefined

// The rollout flag is fixed for the lifetime of a build, so hook order never changes.
// Keep the dormant signing lifecycle outside the default application's runtime.
export const usePrivateMediaUrl = PRIVATE_MEDIA_ENABLED ? useSignedPrivateMediaUrl : usePublicMediaUrl
