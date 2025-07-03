import { useState, useEffect, useCallback } from 'react'
import { DEBUG, recreateSupabaseClient, forceSessionRestore, getWorkingClient, promoteFallbackToMain } from '../lib/supabase'

export type ClientResetStatus = 'idle' | 'resetting' | 'success' | 'error'

export function useClientResetStatus() {
  const [status, setStatus] = useState<ClientResetStatus>('idle')
  const [lastResetTime, setLastResetTime] = useState<Date | null>(null)

  // Comprehensive reset function that matches the Test Auth button logic
  const performComprehensiveReset = useCallback(async (): Promise<boolean> => {
    if (DEBUG) console.log('🔄 [CLIENT_RESET] performComprehensiveReset: Starting...')
    
    try {
      // Step 1: Recreate the client (delete old, create new)
      if (DEBUG) console.log('🔄 [CLIENT_RESET] Step 1: Recreating Supabase client...')
      await recreateSupabaseClient()
      if (DEBUG) console.log('✅ [CLIENT_RESET] Step 1 complete: Fresh client created')
      
      // Step 2: Run auth restoration logic (like Check Auth button)
      if (DEBUG) console.log('🔐 [CLIENT_RESET] Step 2: Running authentication restoration...')
      const authRestored = await forceSessionRestore()
      if (authRestored) {
        if (DEBUG) console.log('✅ [CLIENT_RESET] Step 2 complete: Authentication restored')
      } else {
        if (DEBUG) console.log('⚠️ [CLIENT_RESET] Step 2 warning: Authentication restoration failed')
      }
      
      // Step 3: Verify the working client is ready
      if (DEBUG) console.log('🧪 [CLIENT_RESET] Step 3: Verifying working client...')
      const workingClient = await getWorkingClient()
      const { data: { session }, error } = await workingClient.auth.getSession()
      
      if (!error && session) {
        if (DEBUG) console.log('✅ [CLIENT_RESET] Step 3 complete: Working client has valid session:', {
          userId: session.user?.id,
          expiresAt: session.expires_at
        })
        
        // Step 4: Test basic database connectivity
        if (DEBUG) console.log('🧪 [CLIENT_RESET] Step 4: Testing database connectivity...')
        try {
          const testPromise = workingClient.from('users').select('id').limit(1)
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database test timeout')), 3000)
          )
          
          await Promise.race([testPromise, timeoutPromise])
          if (DEBUG) console.log('✅ [CLIENT_RESET] Step 4 complete: Database connectivity verified')
          
          // Step 5: Promote the working fallback client to be the main client
          if (DEBUG) console.log('🔄 [CLIENT_RESET] Step 5: Promoting fallback client to main...')
          await promoteFallbackToMain()
          if (DEBUG) console.log('✅ [CLIENT_RESET] Step 5 complete: Client promotion successful')
          
          if (DEBUG) console.log('🎉 [CLIENT_RESET] BOOM! Comprehensive reset complete!')
          return true
        } catch (dbError) {
          if (DEBUG) console.error('❌ [CLIENT_RESET] Step 4 failed: Database test failed:', dbError)
          return false
        }
      } else {
        if (DEBUG) console.log('⚠️ [CLIENT_RESET] Step 3 warning: Working client session issues:', {
          hasError: !!error,
          errorMessage: error?.message,
          hasSession: !!session
        })
        return false
      }
    } catch (error) {
      if (DEBUG) console.error('❌ [CLIENT_RESET] Comprehensive reset failed:', error)
      return false
    }
  }, [])

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        if (DEBUG) console.log('🔴 [CLIENT_RESET] Page became visible - starting reset...')
        setStatus('resetting')
        setLastResetTime(new Date())
        
        // Perform the actual comprehensive reset
        const resetSuccess = await performComprehensiveReset()
        
        if (resetSuccess) {
          if (DEBUG) console.log('🟢 [CLIENT_RESET] Reset successful')
          setStatus('success')
          
          // Auto-hide after 3 seconds
          setTimeout(() => {
            setStatus('idle')
          }, 3000)
        } else {
          if (DEBUG) console.log('🔴 [CLIENT_RESET] Reset failed')
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
    if (DEBUG) console.log('🔄 [CLIENT_RESET] Manual reset triggered...')
    setStatus('resetting')
    setLastResetTime(new Date())
    
    const resetSuccess = await performComprehensiveReset()
    
    if (resetSuccess) {
      if (DEBUG) console.log('🟢 [CLIENT_RESET] Manual reset successful')
      setStatus('success')
      setTimeout(() => setStatus('idle'), 3000)
    } else {
      if (DEBUG) console.log('🔴 [CLIENT_RESET] Manual reset failed')
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