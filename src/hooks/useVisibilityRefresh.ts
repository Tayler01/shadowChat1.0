import { useEffect } from 'react'
import { recreateSupabaseClient, DEBUG, forceSessionRestore, getWorkingClient } from '../lib/supabase'
export function useVisibilityRefresh(onVisible?: () => void, delayMs = 200) {
  useEffect(() => {
    const handler = async () => {
      if (!document.hidden) {
        if (DEBUG) console.log('📱 [VISIBILITY] Page became visible - triggering component callbacks...')

        try {
          // Give the client reset process a moment to complete
          if (delayMs > 0) {
            await new Promise(res => setTimeout(res, delayMs))
          }

          // The comprehensive reset is now handled by useClientResetStatus
          // This just triggers the component callbacks for message refetch, etc.
          if (DEBUG) console.log('🎯 [VISIBILITY] Triggering component callbacks...')
          onVisible?.()
          if (DEBUG) console.log('✅ [VISIBILITY] Component callbacks complete')
          
          if (DEBUG) console.log('🎉 [VISIBILITY] Visibility refresh complete!')
          
        } catch (error) {
          console.error('❌ [VISIBILITY] Component callback failed:', error)
          // Still try to call the callback even if something failed
          if (DEBUG) console.log('🔄 [VISIBILITY] Attempting fallback callback...')
          onVisible?.()
        }
      }
    }
    
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [onVisible])
}