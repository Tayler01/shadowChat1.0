import { useEffect } from 'react'
export function useVisibilityRefresh(onVisible?: () => void, delayMs = 200) {
  useEffect(() => {
    const handler = async () => {
      if (!document.hidden) {

        try {
          // Give the client reset process a moment to complete
          if (delayMs > 0) {
            await new Promise(res => setTimeout(res, delayMs))
          }

          // Keep resume handling lightweight here so message lists can refetch
          // and realtime subscriptions can resubscribe without recreating auth
          // state on every foreground event.
          onVisible?.()
          
          
        } catch {
          // Still try to call the callback even if something failed
          onVisible?.()
        }
      }
    }
    
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [delayMs, onVisible])
}
