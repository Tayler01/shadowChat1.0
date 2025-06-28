import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useVisibilityRefresh(onVisible?: () => void) {
  useEffect(() => {
    const handler = () => {
      if (!document.hidden) {
        supabase.auth.refreshSession().catch(err => {
          console.error('Error refreshing session on visibility change:', err)
        })
        onVisible?.()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [onVisible])
}
