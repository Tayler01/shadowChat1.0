import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { AlertCircle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import {
  formatModerationCaseReference,
  listMyModerationReports,
  MODERATION_REPORT_REASONS,
  type MyModerationReport,
  type ModerationReportCategory,
} from '../../lib/moderationCases'
import { useAuth } from '../../hooks/useAuth'
import { getRealtimeClient, getWorkingClient } from '../../lib/supabase'

const reasonLabel = new Map<ModerationReportCategory, string>(MODERATION_REPORT_REASONS.map(reason => [reason.value, reason.label]))

export function MyReportsPanel() {
  const { user } = useAuth()
  const [reports, setReports] = useState<MyModerationReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshTimerRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReports(await listMyModerationReports())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Reports could not be loaded')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const handleSubmitted = () => void refresh()
    window.addEventListener('shadowchat:moderation-report-submitted', handleSubmitted)
    return () => window.removeEventListener('shadowchat:moderation-report-submitted', handleSubmitted)
  }, [refresh])

  useEffect(() => {
    if (!user?.id) return
    let channel: RealtimeChannel | null = null
    let currentClient: Awaited<ReturnType<typeof getWorkingClient>> | null = null
    let cancelled = false
    const subscribe = async () => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      if (cancelled || !currentClient?.channel) return
      channel = currentClient
        .channel(`public:moderation-report-updates:${user.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'moderation_report_updates',
          filter: `recipient_user_id=eq.${user.id}`,
        }, () => {
          if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
          refreshTimerRef.current = window.setTimeout(() => {
            refreshTimerRef.current = null
            void refresh()
          }, 120)
        })
        .subscribe()
    }
    void subscribe()
    return () => {
      cancelled = true
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      if (channel && currentClient?.removeChannel) currentClient.removeChannel(channel)
    }
  }, [refresh, user?.id])

  if (loading && reports.length === 0) return <div className="grid min-h-52 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--theme-accent-readable)]" aria-label="Loading safety reports" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">My Safety Reports</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">Private status and operator updates for concerns you submitted.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>

      {error && <div className="flex gap-2 rounded-2xl border border-red-400/25 bg-red-500/8 p-4 text-sm text-red-100"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}

      {!loading && reports.length === 0 ? (
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-[var(--theme-accent-readable)]" />
          <h3 className="mt-3 font-semibold text-[var(--text-primary)]">No safety reports</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Use Report from a message, pin, comment, or member profile when something needs review.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {reports.map(report => (
            <article key={report.reportId} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-[var(--theme-accent-readable)]">{formatModerationCaseReference(report.caseNumber)}</span>
                <span className="rounded-full border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] px-2.5 py-1 text-xs font-medium capitalize text-[var(--theme-accent-readable)]">{report.status.replace('_', ' ')}</span>
              </div>
              <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">{reasonLabel.get(report.category) ?? report.category}</p>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{report.targetPreview || 'Reported content'}</p>
              {report.reporterSummary && <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-3 text-sm leading-5 text-[var(--text-secondary)]"><span className="block text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Operator update</span>{report.reporterSummary}</div>}
              <p className="mt-3 text-xs text-[var(--text-muted)]">Submitted {new Date(report.submittedAt).toLocaleString()}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
