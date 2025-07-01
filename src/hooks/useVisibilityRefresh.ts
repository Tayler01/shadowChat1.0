import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useVisibilityRefresh(onVisible?: () => void) {
  useEffect(() => {
    const handler = async () => {
      if (!document.hidden) {
        try {
          await supabase.auth.refreshSession()
        } catch (err) {
          console.error('Error refreshing session on visibility change:', err)
        }
        onVisible?.()
      }
    }

    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [onVisible])
}
