import { useEffect } from 'react'
import { attemptClientRecovery } from '../lib/supabase'

export function useVisibilityRefresh(onVisible?: () => void) {
  useEffect(() => {
    const handler = async () => {
      if (!document.hidden) {
        // Attempt to recover the client when page becomes visible
        try {
          await attemptClientRecovery()
        } catch (error) {
          console.warn('Client recovery failed on visibility change:', error)
        }
        
        onVisible?.()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [onVisible])
}
