import { useCallback, useEffect, useState } from 'react'
import {
  deleteAdminFeedbackSubmission,
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
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const deleteSubmission = useCallback(async (submission: AdminFeedbackSubmission) => {
    setDeletingId(submission.id)
    try {
      await deleteAdminFeedbackSubmission(submission)
      setSubmissions(current => current.filter(item => item.id !== submission.id))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete feedback submission')
      throw err
    } finally {
      setDeletingId(null)
    }
  }, [])

  return {
    submissions,
    loading,
    error,
    deletingId,
    refresh,
    deleteSubmission,
  }
}
