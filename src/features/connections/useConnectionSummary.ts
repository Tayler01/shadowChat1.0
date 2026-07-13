import { useCallback, useEffect, useRef, useState } from 'react'
import { getMyConnectionSummary } from './connectionsApi'
import { CONNECTIONS_CHANGED_EVENT, type ConnectionSummary } from './connectionModel'

const EMPTY_SUMMARY: ConnectionSummary = {
  acceptedCount: 0,
  incomingCount: 0,
  outgoingCount: 0,
}

export const useConnectionSummary = () => {
  const mountedRef = useRef(true)
  const refreshingRef = useRef(false)
  const pendingRefreshRef = useRef(false)
  const [summary, setSummary] = useState<ConnectionSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (showLoading = false) => {
    if (refreshingRef.current) {
      pendingRefreshRef.current = true
      return
    }
    refreshingRef.current = true
    if (showLoading) setLoading(true)
    try {
      do {
        pendingRefreshRef.current = false
        try {
          const nextSummary = await getMyConnectionSummary()
          if (!mountedRef.current) return
          setSummary(nextSummary)
          setError(null)
        } catch (caught) {
          if (!mountedRef.current) return
          setError(caught instanceof Error ? caught.message : 'Connections are unavailable right now.')
        }
      } while (pendingRefreshRef.current && mountedRef.current)
    } finally {
      refreshingRef.current = false
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void refresh(true)
    const handleChanged = () => void refresh(false)
    const handleFocus = () => void refresh(false)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh(false)
    }
    window.addEventListener(CONNECTIONS_CHANGED_EVENT, handleChanged)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      mountedRef.current = false
      window.removeEventListener(CONNECTIONS_CHANGED_EVENT, handleChanged)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refresh])

  return { summary, loading, error, refresh }
}
