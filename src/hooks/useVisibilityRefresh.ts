import { useEffect } from 'react'
import { recreateSupabaseClient, forceSessionRestore, getWorkingClient } from '../lib/supabase'
export function useVisibilityRefresh(onVisible?: () => void, delayMs = 200) {
  useEffect(() => {
    const handler = async () => {
      if (!document.hidden) {

        try {
          // Give the client reset process a moment to complete
          if (delayMs > 0) {
            await new Promise(res => setTimeout(res, delayMs))
          }

          // The comprehensive reset is now handled by useClientResetStatus
          // This just triggers the component callbacks for message refetch, etc.
          onVisible?.()
          
          
        } catch {
          // Still try to call the callback even if something failed
          onVisible?.()
        }
      }
    }
    
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [onVisible])
}
