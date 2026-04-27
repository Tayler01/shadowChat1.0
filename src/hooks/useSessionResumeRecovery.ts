import { useEffect, useRef } from 'react'
import { ensureSession, getStoredRefreshToken } from '../lib/supabase'

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

    const scheduleRecovery = () => {
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

        inFlightRef.current = ensureSession()
          .catch(() => undefined)
          .then(() => undefined)
          .finally(() => {
            inFlightRef.current = null
          })
      }, delayMs)
    }

    document.addEventListener('visibilitychange', scheduleRecovery)
    window.addEventListener('pageshow', scheduleRecovery)
    window.addEventListener('focus', scheduleRecovery)
    window.addEventListener('online', scheduleRecovery)

    return () => {
      clearScheduledRecovery()
      document.removeEventListener('visibilitychange', scheduleRecovery)
      window.removeEventListener('pageshow', scheduleRecovery)
      window.removeEventListener('focus', scheduleRecovery)
      window.removeEventListener('online', scheduleRecovery)
    }
  }, [delayMs, enabled])
}
