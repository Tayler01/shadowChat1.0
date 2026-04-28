import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'

// Keep the tone-analysis/mood emoji code dormant while the feature gets redesigned.
const TONE_ANALYSIS_AVAILABLE = false

export function useToneAnalysisEnabled() {
  const [enabled, setEnabled] = useState(() => {
    if (!TONE_ANALYSIS_AVAILABLE) return false

    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('toneAnalysisEnabled')
      if (stored === null) return false
      return stored === 'true'
    }
    return false
  })

  useEffect(() => {
    try {
      localStorage.setItem('toneAnalysisEnabled', String(enabled))
    } catch {
      // ignore
    }
  }, [enabled])

  const setToneAnalysisEnabled = useCallback<Dispatch<SetStateAction<boolean>>>((nextEnabled) => {
    setEnabled((current) => {
      if (!TONE_ANALYSIS_AVAILABLE) return false
      return typeof nextEnabled === 'function' ? nextEnabled(current) : nextEnabled
    })
  }, [])

  return { enabled, setEnabled: setToneAnalysisEnabled }
}
