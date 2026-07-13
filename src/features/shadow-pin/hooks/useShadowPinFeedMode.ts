import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../../hooks/useAuth'
import { getMyShadowPinFeedMode, setMyShadowPinFeedMode } from '../api/shadowPinApi'
import type { ShadowPinFeedMode } from '../types'

const MODE_CACHE_MS = 2 * 60 * 1000
const modeByUserId = new Map<string, { mode: ShadowPinFeedMode; fetchedAt: number }>()

export function useShadowPinFeedMode(
  routeMode: ShadowPinFeedMode | null,
  onRouteModeChange: (mode: ShadowPinFeedMode) => void
) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const cachedEntry = userId ? modeByUserId.get(userId) : undefined
  const cachedMode = cachedEntry && Date.now() - cachedEntry.fetchedAt < MODE_CACHE_MS
    ? cachedEntry.mode
    : undefined
  const [mode, setMode] = useState<ShadowPinFeedMode>(() => routeMode ?? cachedMode ?? 'discover')
  const [loading, setLoading] = useState(Boolean(userId && !routeMode && !cachedMode))
  const [saveError, setSaveError] = useState<string | null>(null)
  const requestGenerationRef = useRef(0)
  const previousRouteModeRef = useRef<ShadowPinFeedMode | null>(routeMode)
  const activeUserIdRef = useRef<string | null>(userId)
  const desiredModeRef = useRef<ShadowPinFeedMode>(mode)
  const saveGenerationRef = useRef(0)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingSaveCountRef = useRef(0)
  const routeWasExplicitRef = useRef(Boolean(routeMode))

  const enqueueSave = useCallback((nextMode: ShadowPinFeedMode, targetUserId: string) => {
    desiredModeRef.current = nextMode
    const generation = ++saveGenerationRef.current
    pendingSaveCountRef.current += 1
    setSaveError(null)
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (activeUserIdRef.current !== targetUserId) {
          pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1)
          return
        }
        try {
          await setMyShadowPinFeedMode(nextMode)
          if (activeUserIdRef.current === targetUserId && saveGenerationRef.current === generation) {
            setSaveError(null)
          }
        } catch {
          if (activeUserIdRef.current === targetUserId && saveGenerationRef.current === generation) {
            setSaveError("Couldn't save this as your default")
            toast.error("Couldn't save this as your default")
          }
        } finally {
          pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1)
        }
      })
  }, [])

  useEffect(() => {
    const userChanged = activeUserIdRef.current !== userId
    activeUserIdRef.current = userId
    if (userChanged) {
      requestGenerationRef.current += 1
      saveGenerationRef.current += 1
      setSaveError(null)
    }

    if (!userId) {
      setMode('discover')
      desiredModeRef.current = 'discover'
      setLoading(false)
      return
    }

    if (routeMode) {
      requestGenerationRef.current += 1
      if (!routeWasExplicitRef.current) {
        modeByUserId.set(userId, { mode: routeMode, fetchedAt: Date.now() })
      }
      setMode(routeMode)
      desiredModeRef.current = routeMode
      setLoading(false)
      previousRouteModeRef.current = routeMode
      return
    }

    if (previousRouteModeRef.current === 'connections') {
      previousRouteModeRef.current = null
      modeByUserId.set(userId, { mode: 'discover', fetchedAt: Date.now() })
      setMode('discover')
      desiredModeRef.current = 'discover'
      setLoading(false)
      return
    }
    previousRouteModeRef.current = null

    const cached = modeByUserId.get(userId)
    if (cached && Date.now() - cached.fetchedAt < MODE_CACHE_MS) {
      setMode(cached.mode)
      desiredModeRef.current = cached.mode
      setLoading(false)
      if (cached.mode === 'connections') onRouteModeChange(cached.mode)
      return
    }

    const generation = ++requestGenerationRef.current
    if (userChanged) {
      setMode('discover')
      desiredModeRef.current = 'discover'
    }
    setLoading(true)
    void getMyShadowPinFeedMode()
      .then(preference => {
        if (requestGenerationRef.current !== generation) return
        modeByUserId.set(userId, { mode: preference.mode, fetchedAt: Date.now() })
        setMode(preference.mode)
        desiredModeRef.current = preference.mode
        if (preference.mode === 'connections') onRouteModeChange(preference.mode)
      })
      .catch(() => {
        if (requestGenerationRef.current !== generation) return
        modeByUserId.set(userId, { mode: 'discover', fetchedAt: Date.now() })
        setMode('discover')
        desiredModeRef.current = 'discover'
      })
      .finally(() => {
        if (requestGenerationRef.current === generation) setLoading(false)
      })
  }, [onRouteModeChange, routeMode, userId])

  useEffect(() => {
    if (!userId) return
    const refreshPreference = () => {
      if (routeWasExplicitRef.current || pendingSaveCountRef.current > 0) return
      const generation = ++requestGenerationRef.current
      void getMyShadowPinFeedMode().then(preference => {
        if (requestGenerationRef.current !== generation || activeUserIdRef.current !== userId) return
        modeByUserId.set(userId, { mode: preference.mode, fetchedAt: Date.now() })
        desiredModeRef.current = preference.mode
        setMode(preference.mode)
        onRouteModeChange(preference.mode)
      }).catch(() => undefined)
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshPreference()
    }
    window.addEventListener('focus', refreshPreference)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', refreshPreference)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [onRouteModeChange, userId])

  const selectMode = useCallback((nextMode: ShadowPinFeedMode) => {
    if (!userId || nextMode === mode) return
    requestGenerationRef.current += 1
    routeWasExplicitRef.current = false
    modeByUserId.set(userId, { mode: nextMode, fetchedAt: Date.now() })
    setMode(nextMode)
    onRouteModeChange(nextMode)
    enqueueSave(nextMode, userId)
  }, [enqueueSave, mode, onRouteModeChange, userId])

  const retrySave = useCallback(() => {
    if (!userId) return
    enqueueSave(desiredModeRef.current, userId)
  }, [enqueueSave, userId])

  return { mode, loading, saveError, selectMode, retrySave }
}
