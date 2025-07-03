import { useEffect } from 'react'
import { recreateSupabaseClient, DEBUG } from '../lib/supabase'

export function useVisibilityRefresh(onVisible?: () => void) {
  useEffect(() => {
    const handler = async () => {
      if (!document.hidden) {
        if (DEBUG) console.log('📱 Page became visible - resetting client state to ensure freshness')
        
        // Recreate client when page becomes visible (simulates page reload)
        try {
          await recreateSupabaseClient()
        } catch (error) {
          console.warn('Client reset failed on visibility change:', error)
        }
        
        onVisible?.()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [onVisible])
}
