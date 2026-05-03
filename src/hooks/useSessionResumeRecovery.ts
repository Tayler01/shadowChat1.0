import { useEffect, useRef } from 'react'
import { getStoredRefreshToken } from '../lib/supabase'
import { runSessionRecovery, type SessionRecoveryReason } from '../lib/sessionRecovery'

export function useSessionResumeRecovery(enabled = true, delayMs = 750) {
  const inFlightRef = useRef<Promise<void> | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const wasBackgroundedRef = useRef(false)
  const wasBlurredRef = useRef(false)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return
    }

    const clearScheduledRecovery = () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }

    const scheduleRecovery = (
      reason: SessionRecoveryReason = 'resume',
      options: { allowInitial?: boolean } = {}
    ) => {
      if (typeof document !== 'undefined' && document.hidden) {
        return
      }

      if (!options.allowInitial && !wasBackgroundedRef.current && !wasBlurredRef.current) {
        return
      }

      if (!getStoredRefreshToken()) {
        return
      }

      clearScheduledRecovery()
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null

        if (inFlightRef.current) {
          return
        }

        wasBackgroundedRef.current = false
        wasBlurredRef.current = false

        inFlightRef.current = runSessionRecovery(reason)
          .catch(() => undefined)
          .then(() => undefined)
          .finally(() => {
            inFlightRef.current = null
          })
      }, delayMs)
    }

    const markBackgrounded = () => {
      wasBackgroundedRef.current = true
      clearScheduledRecovery()
    }

    const handleVisible = () => {
      if (document.hidden) {
        markBackgrounded()
        return
      }

      scheduleRecovery('resume')
    }
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted || wasBackgroundedRef.current) {
        scheduleRecovery('resume', { allowInitial: event.persisted })
      }
    }
    const handlePageHide = () => markBackgrounded()
    const handleBlur = () => {
      wasBlurredRef.current = true
    }
    const handleFocus = () => scheduleRecovery('focus')
    const handleOnline = () => scheduleRecovery('online', { allowInitial: true })
    const handleResume = () => scheduleRecovery('resume', { allowInitial: true })

    document.addEventListener('visibilitychange', handleVisible)
    document.addEventListener('resume', handleResume)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)

    return () => {
      clearScheduledRecovery()
      document.removeEventListener('visibilitychange', handleVisible)
      document.removeEventListener('resume', handleResume)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
    }
  }, [delayMs, enabled])
}
