import { useState, useEffect } from 'react'

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window !== 'undefined') {
      return typeof window.matchMedia === 'function'
        ? window.matchMedia('(min-width: 768px)').matches
        : window.innerWidth >= 768
    }
    return false
  })

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      const handleResize = () => setIsDesktop(window.innerWidth >= 768)
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }

    const mql = window.matchMedia('(min-width: 768px)')
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isDesktop
}
