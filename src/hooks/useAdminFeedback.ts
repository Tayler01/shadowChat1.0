import { useCallback, useEffect, useState } from 'react'
import {
  fetchAdminFeedbackSubmissions,
  type AdminFeedbackSubmission,
} from '../lib/feedback'

type UseAdminFeedbackOptions = {
  enabled?: boolean
}

export function useAdminFeedback(options: UseAdminFeedbackOptions = {}) {
  const { enabled = true } = options
  const [submissions, setSubmissions] = useState<AdminFeedbackSubmission[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSubmissions([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    try {
      const nextSubmissions = await fetchAdminFeedbackSubmissions()
      setSubmissions(nextSubmissions)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load feedback submissions')
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    submissions,
    loading,
    error,
    refresh,
  }
}
