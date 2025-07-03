import { useEffect } from 'react'
import { recreateSupabaseClient, DEBUG, forceSessionRestore, getWorkingClient } from '../lib/supabase'

export function useVisibilityRefresh(onVisible?: () => void) {
  useEffect(() => {
    const handler = async () => {
      if (!document.hidden) {
        if (DEBUG) console.log('📱 Page became visible - starting comprehensive client reset...')
        
        try {
          // Step 1: Recreate the client (delete old, create new)
          if (DEBUG) console.log('🔄 Step 1: Recreating Supabase client...')
          await recreateSupabaseClient()
          if (DEBUG) console.log('✅ Step 1 complete: Fresh client created')
          
          // Step 2: Run auth restoration logic (like Check Auth button)
          if (DEBUG) console.log('🔐 Step 2: Running authentication restoration...')
          const authRestored = await forceSessionRestore()
          if (authRestored) {
            if (DEBUG) console.log('✅ Step 2 complete: Authentication restored')
          } else {
            if (DEBUG) console.log('⚠️ Step 2 warning: Authentication restoration failed')
          }
          
          // Step 3: Verify the working client is ready
          if (DEBUG) console.log('🧪 Step 3: Verifying working client...')
          const workingClient = await getWorkingClient()
          const { data: { session }, error } = await workingClient.auth.getSession()
          
          if (!error && session) {
            if (DEBUG) console.log('✅ Step 3 complete: Working client has valid session')
          } else {
            if (DEBUG) console.log('⚠️ Step 3 warning: Working client session issues')
          }
          
          // Step 4: Trigger the callback to reset message input and other components
          if (DEBUG) console.log('🎯 Step 4: Triggering component reset...')
          onVisible?.()
          if (DEBUG) console.log('✅ Step 4 complete: Components notified')
          
          if (DEBUG) console.log('🎉 BOOM! Comprehensive refocus handler complete!')
          
        } catch (error) {
          console.error('❌ Comprehensive refocus handler failed:', error)
          // Still try to call the callback even if something failed
          onVisible?.()
        }
      }
    }
    
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [onVisible])
}