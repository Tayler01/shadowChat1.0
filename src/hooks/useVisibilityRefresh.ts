import { useEffect } from 'react'

export function useVisibilityRefresh(onVisible?: () => void) {
  useEffect(() => {
    const handler = () => {
      if (!document.hidden) {
        onVisible?.()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [onVisible])
}
