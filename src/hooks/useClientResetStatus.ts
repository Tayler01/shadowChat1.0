import { useState, useEffect, useCallback, useRef } from 'react'
import {
  recreateSupabaseClient,
  forceSessionRestore,
  getWorkingClient,
  promoteFallbackToMain,
  ensureSession,
} from '../lib/supabase'

// Promise used to queue reset requests across hook instances
let resetPromise: Promise<boolean> | null = null

export type ClientResetStatus = 'idle' | 'resetting' | 'success' | 'error'

export function useClientResetStatus() {
  const [status, setStatus] = useState<ClientResetStatus>('idle')
  const [lastResetTime, setLastResetTime] = useState<Date | null>(null)
  const isResettingRef = useRef(false)

  // Comprehensive reset function that matches the Test Auth button logic
  const performComprehensiveReset = useCallback(async (): Promise<boolean> => {
    if (resetPromise) {
      return resetPromise
    }

    isResettingRef.current = true

    resetPromise = (async () => {
      try {
        // Step 1: Recreate the client (delete old, create new)
        await recreateSupabaseClient()

        // Step 2: Run auth restoration logic (like Check Auth button)
        const authRestored = await forceSessionRestore()
        if (authRestored) {
        } else {
        }

        // Step 3: Verify the working client is ready
        const sessionReady = await ensureSession()

        if (sessionReady) {
          const workingClient = await getWorkingClient()

          // Step 4: Test basic database connectivity
          try {
            const testPromise = workingClient.from('users').select('id').limit(1)
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Database test timeout')), 3000)
            )

            await Promise.race([testPromise, timeoutPromise])

            // Step 5: Promote the working fallback client to be the main client
            await promoteFallbackToMain()

            return true
          } catch (dbError) {
            return false
          }
        } else {
          return false
        }
      } catch {
        return false
      } finally {
        isResettingRef.current = false
        resetPromise = null
      }
    })()

    return resetPromise
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setLastResetTime(new Date())
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const manualReset = useCallback(async () => {
    setStatus('resetting')
    setLastResetTime(new Date())
    
    const resetSuccess = await performComprehensiveReset()
    
    if (resetSuccess) {
      setStatus('success')
      setTimeout(() => setStatus('idle'), 3000)
    } else {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }, [performComprehensiveReset])

  return {
    status,
    lastResetTime,
    manualReset
  }
}
