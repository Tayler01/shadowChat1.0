import { useEffect, useState } from 'react'

export function useToneAnalysisEnabled() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('toneAnalysisEnabled')
      if (stored === null) return true
      return stored === 'true'
    }
    return true
  })

  useEffect(() => {
    try {
      localStorage.setItem('toneAnalysisEnabled', String(enabled))
    } catch {
      // ignore
    }
  }, [enabled])

  return { enabled, setEnabled }
}
