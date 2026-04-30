import { useEffect, useRef } from 'react'
import { getStoredRefreshToken } from '../lib/supabase'
import { runSessionRecovery, type SessionRecoveryReason } from '../lib/sessionRecovery'

export function useSessionResumeRecovery(enabled = true, delayMs = 750) {
  const inFlightRef = useRef<Promise<void> | null>(null)
  const timeoutRef = useRef<number | null>(null)

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

    const scheduleRecovery = (reason: SessionRecoveryReason = 'resume') => {
      if (typeof document !== 'undefined' && document.hidden) {
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

        inFlightRef.current = runSessionRecovery(reason)
          .catch(() => undefined)
          .then(() => undefined)
          .finally(() => {
            inFlightRef.current = null
          })
      }, delayMs)
    }

    const handleVisible = () => scheduleRecovery('resume')
    const handlePageShow = () => scheduleRecovery('resume')
    const handleFocus = () => scheduleRecovery('focus')
    const handleOnline = () => scheduleRecovery('online')
    const handleResume = () => scheduleRecovery('resume')

    document.addEventListener('visibilitychange', handleVisible)
    document.addEventListener('resume', handleResume)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)

    return () => {
      clearScheduledRecovery()
      document.removeEventListener('visibilitychange', handleVisible)
      document.removeEventListener('resume', handleResume)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
    }
  }, [delayMs, enabled])
}
