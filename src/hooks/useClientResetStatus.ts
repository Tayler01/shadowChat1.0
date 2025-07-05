import { useState, useEffect, useCallback } from 'react'
import { recreateSupabaseClient, forceSessionRestore, getWorkingClient, promoteFallbackToMain } from '../lib/supabase'

export type ClientResetStatus = 'idle' | 'resetting' | 'success' | 'error'

export function useClientResetStatus() {
  const [status, setStatus] = useState<ClientResetStatus>('idle')
  const [lastResetTime, setLastResetTime] = useState<Date | null>(null)

  // Comprehensive reset function that matches the Test Auth button logic
  const performComprehensiveReset = useCallback(async (): Promise<boolean> => {
    
    try {
      // Step 1: Recreate the client (delete old, create new)
      await recreateSupabaseClient()
      
      // Step 2: Run auth restoration logic (like Check Auth button)
      const authRestored = await forceSessionRestore()
      if (authRestored) {
      } else {
      }
      
      // Step 3: Verify the working client is ready
      const workingClient = await getWorkingClient()
      const { data: { session }, error } = await workingClient.auth.getSession()
      
      if (!error && session) {
        
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
    }
  }, [])

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        setStatus('resetting')
        setLastResetTime(new Date())
        
        // Perform the actual comprehensive reset
        const resetSuccess = await performComprehensiveReset()
        
        if (resetSuccess) {
          setStatus('success')
          
          // Auto-hide after 3 seconds
          setTimeout(() => {
            setStatus('idle')
          }, 3000)
        } else {
          setStatus('error')
          
          // Auto-hide after 5 seconds
          setTimeout(() => {
            setStatus('idle')
          }, 5000)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [performComprehensiveReset])

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
