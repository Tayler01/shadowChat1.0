import { useCallback, useEffect, useState } from 'react'
import {
  approveFeedbackBuildMerge,
  archiveFeedbackBuildRun,
  createFeedbackBuildRun,
  deleteAdminFeedbackSubmission,
  fetchAdminFeedbackSubmissions,
  fetchFeedbackBuildRunLogs,
  fetchFeedbackBuildRuns,
  retryFeedbackBuildRun,
  type AdminFeedbackSubmission,
  type FeedbackBuildRetryInput,
  type FeedbackBuildRun,
  type FeedbackBuildRunInput,
  type FeedbackBuildRunLog,
} from '../lib/feedback'

type UseAdminFeedbackOptions = {
  enabled?: boolean
  buildsEnabled?: boolean
}

export function useAdminFeedback(options: UseAdminFeedbackOptions = {}) {
  const { enabled = true, buildsEnabled = enabled } = options
  const [submissions, setSubmissions] = useState<AdminFeedbackSubmission[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [buildRuns, setBuildRuns] = useState<FeedbackBuildRun[]>([])
  const [buildLogsByRunId, setBuildLogsByRunId] = useState<Record<string, FeedbackBuildRunLog[]>>({})
  const [buildLoading, setBuildLoading] = useState(buildsEnabled)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [activeBuildActionId, setActiveBuildActionId] = useState<string | null>(null)

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

  const refreshBuildRuns = useCallback(async () => {
    if (!buildsEnabled) {
      setBuildRuns([])
      setBuildLogsByRunId({})
      setBuildLoading(false)
      setBuildError(null)
      return
    }

    setBuildLoading(true)
    try {
      const nextRuns = await fetchFeedbackBuildRuns()
      const nextLogs = await fetchFeedbackBuildRunLogs(nextRuns.map(run => run.id))
      const nextLogsByRunId = nextLogs.reduce<Record<string, FeedbackBuildRunLog[]>>((acc, log) => {
        acc[log.run_id] = [...(acc[log.run_id] ?? []), log]
        return acc
      }, {})

      setBuildRuns(nextRuns)
      setBuildLogsByRunId(nextLogsByRunId)
      setBuildError(null)
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Unable to load feedback build runs')
    } finally {
      setBuildLoading(false)
    }
  }, [buildsEnabled])

  useEffect(() => {
    void refreshBuildRuns()
  }, [refreshBuildRuns])

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

  const startBuildRun = useCallback(async (input: FeedbackBuildRunInput) => {
    setActiveBuildActionId(input.feedbackSubmissionId)
    try {
      const nextRun = await createFeedbackBuildRun(input)
      setBuildRuns(current => [nextRun, ...current.filter(run => run.id !== nextRun.id)])
      await Promise.all([refresh(), refreshBuildRuns()])
      return nextRun
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Unable to start feedback build run')
      throw err
    } finally {
      setActiveBuildActionId(null)
    }
  }, [refresh, refreshBuildRuns])

  const retryBuildRun = useCallback(async (input: FeedbackBuildRetryInput) => {
    setActiveBuildActionId(input.previousRunId)
    try {
      const nextRun = await retryFeedbackBuildRun(input)
      setBuildRuns(current => [nextRun, ...current.filter(run => run.id !== nextRun.id)])
      await refreshBuildRuns()
      return nextRun
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Unable to retry feedback build run')
      throw err
    } finally {
      setActiveBuildActionId(null)
    }
  }, [refreshBuildRuns])

  const approveMerge = useCallback(async (runId: string) => {
    setActiveBuildActionId(runId)
    try {
      const nextRun = await approveFeedbackBuildMerge(runId)
      setBuildRuns(current => current.map(run => run.id === nextRun.id ? nextRun : run))
      await refreshBuildRuns()
      return nextRun
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Unable to approve feedback build merge')
      throw err
    } finally {
      setActiveBuildActionId(null)
    }
  }, [refreshBuildRuns])

  const archiveBuildRun = useCallback(async (runId: string) => {
    setActiveBuildActionId(runId)
    try {
      const nextRun = await archiveFeedbackBuildRun(runId)
      setBuildRuns(current => current.map(run => run.id === nextRun.id ? nextRun : run))
      await refreshBuildRuns()
      return nextRun
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Unable to archive feedback build run')
      throw err
    } finally {
      setActiveBuildActionId(null)
    }
  }, [refreshBuildRuns])

  return {
    submissions,
    loading,
    error,
    deletingId,
    buildRuns,
    buildLogsByRunId,
    buildLoading,
    buildError,
    activeBuildActionId,
    refresh,
    refreshBuildRuns,
    deleteSubmission,
    startBuildRun,
    retryBuildRun,
    approveMerge,
    archiveBuildRun,
  }
}
