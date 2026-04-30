import { useState, useCallback, useRef } from 'react'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { runSessionRecovery } from '../lib/sessionRecovery'

// Promise used to queue reset requests across hook instances
let resetPromise: Promise<boolean> | null = null

export type ClientResetStatus = 'idle' | 'resetting' | 'success' | 'error'

export function useClientResetStatus() {
  const [status, setStatus] = useState<ClientResetStatus>('idle')
  const [lastResetTime, setLastResetTime] = useState<Date | null>(null)
  const isResettingRef = useRef(false)

  const performRecovery = useCallback(async (): Promise<boolean> => {
    if (resetPromise) {
      return resetPromise
    }

    isResettingRef.current = true

    resetPromise = (async () => {
      try {
        const sessionRecovery = await runSessionRecovery('manual')
        if (!sessionRecovery.ok) {
          return false
        }

        const realtimeRecovery = await runRealtimeRecovery('manual', { sessionReady: true })
        return realtimeRecovery.ok
      } catch {
        return false
      } finally {
        isResettingRef.current = false
        resetPromise = null
      }
    })()

    return resetPromise
  }, [])

  const manualReset = useCallback(async () => {
    setStatus('resetting')
    setLastResetTime(new Date())
    
    const resetSuccess = await performRecovery()
    
    if (resetSuccess) {
      setStatus('success')
      setTimeout(() => setStatus('idle'), 3000)
    } else {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }, [performRecovery])

  return {
    status,
    lastResetTime,
    manualReset
  }
}
