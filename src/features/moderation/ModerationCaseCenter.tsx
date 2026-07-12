import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { getRealtimeClient, getWorkingClient } from '../../lib/supabase'
import {
  applyModerationCaseAction,
  assignModerationCase,
  formatModerationCaseReference,
  getModerationCase,
  listModerationCases,
  transitionModerationCase,
  type ModerationCaseDetail,
  type ModerationCaseOutcome,
  type ModerationCaseQueue,
  type ModerationCaseSeverity,
  type ModerationCaseStatus,
  type ModerationCaseSummary,
  type ModerationReportCategory,
  type ModerationTargetType,
  MODERATION_REPORT_REASONS,
} from '../../lib/moderationCases'

const queues: Array<{ value: ModerationCaseQueue; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'mine', label: 'Mine' },
  { value: 'in_review', label: 'In review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
]

const statuses: ModerationCaseStatus[] = ['new', 'triaged', 'investigating', 'waiting', 'actioned', 'resolved', 'dismissed', 'closed']
const severities: ModerationCaseSeverity[] = ['low', 'medium', 'high', 'critical']
const outcomes: ModerationCaseOutcome[] = ['no_violation', 'content_removed', 'channel_restricted', 'member_warned', 'duplicate', 'insufficient_evidence', 'other']

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : '—'
const displayName = (display?: string | null, username?: string | null) => display || (username ? `@${username}` : 'Unknown member')
const dueState = (value: string) => new Date(value).getTime() < Date.now() ? 'overdue' : 'due'

export function ModerationCaseCenter() {
  const { user } = useAuth()
  const [queue, setQueue] = useState<ModerationCaseQueue>('new')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ModerationCaseStatus | ''>('')
  const [severityFilter, setSeverityFilter] = useState<ModerationCaseSeverity | ''>('')
  const [targetFilter, setTargetFilter] = useState<ModerationTargetType | ''>('')
  const [categoryFilter, setCategoryFilter] = useState<ModerationReportCategory | ''>('')
  const [cases, setCases] = useState<ModerationCaseSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ModerationCaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const realtimeRefreshTimerRef = useRef<number | null>(null)

  const loadCases = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCases(await listModerationCases({
        queue,
        search,
        status: statusFilter || null,
        severity: severityFilter || null,
        targetType: targetFilter || null,
        category: categoryFilter || null,
      }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Safety cases could not be loaded')
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, queue, search, severityFilter, statusFilter, targetFilter])

  const loadDetail = useCallback(async (caseId: string) => {
    setSelectedId(caseId)
    setDetailLoading(true)
    setError(null)
    try {
      setDetail(await getModerationCase(caseId))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Case detail could not be loaded')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => { void loadCases() }, [loadCases])

  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let currentClient: Awaited<ReturnType<typeof getWorkingClient>> | null = null
    let cancelled = false

    const subscribe = async () => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      if (cancelled || !currentClient?.channel) return
      const refreshSoon = () => {
        if (realtimeRefreshTimerRef.current !== null) window.clearTimeout(realtimeRefreshTimerRef.current)
        realtimeRefreshTimerRef.current = window.setTimeout(() => {
          realtimeRefreshTimerRef.current = null
          void loadCases()
          if (selectedId) void loadDetail(selectedId)
        }, 120)
      }
      channel = currentClient
        .channel(`public:moderation-cases:${user?.id ?? 'operator'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'moderation_cases' }, refreshSoon)
        .subscribe()
    }

    void subscribe()
    return () => {
      cancelled = true
      if (realtimeRefreshTimerRef.current !== null) {
        window.clearTimeout(realtimeRefreshTimerRef.current)
        realtimeRefreshTimerRef.current = null
      }
      if (channel && currentClient?.removeChannel) currentClient.removeChannel(channel)
    }
  }, [loadCases, loadDetail, selectedId, user?.id])

  const applyAndRefresh = useCallback(async (operation: () => Promise<unknown>, successMessage: string) => {
    setSaving(true)
    try {
      await operation()
      toast.success(successMessage)
      if (selectedId) await loadDetail(selectedId)
      await loadCases()
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'The case changed before this update could be saved'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }, [loadCases, loadDetail, selectedId])

  if (selectedId) {
    return (
      <CaseDetail
        detail={detail}
        loading={detailLoading}
        saving={saving}
        currentUserId={user?.id ?? null}
        onBack={() => { setSelectedId(null); setDetail(null) }}
        onRefresh={() => void loadDetail(selectedId)}
        applyAndRefresh={applyAndRefresh}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"><ShieldAlert className="h-5 w-5 text-[var(--theme-accent-readable)]" />Safety Case Center</h2>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--text-muted)]">Private reports, immutable evidence, assignment, SLA tracking, and audited operator actions.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void loadCases()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Safety case queues">
        {queues.map(item => <button key={item.value} type="button" role="tab" aria-selected={queue === item.value} onClick={() => setQueue(item.value)} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] ${queue === item.value ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]' : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)]'}`}>{item.label}</button>)}
      </div>

      <form onSubmit={event => { event.preventDefault(); void loadCases() }} className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search case, member, or reason" className="h-12 w-full rounded-2xl border border-[var(--border-panel)] bg-[var(--input-bg)] pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" />
      </form>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Safety case filters">
        <QueueFilter label="Status" value={statusFilter} onChange={value => setStatusFilter(value as ModerationCaseStatus | '')} values={statuses} />
        <QueueFilter label="Severity" value={severityFilter} onChange={value => setSeverityFilter(value as ModerationCaseSeverity | '')} values={severities} />
        <QueueFilter label="Surface" value={targetFilter} onChange={value => setTargetFilter(value as ModerationTargetType | '')} values={['user', 'general_message', 'dm_message', 'shadow_pin_image', 'shadow_pin_comment']} />
        <QueueFilter label="Reason" value={categoryFilter} onChange={value => setCategoryFilter(value as ModerationReportCategory | '')} values={MODERATION_REPORT_REASONS.map(reason => reason.value)} />
      </div>

      {error && <div className="flex gap-2 rounded-2xl border border-red-400/25 bg-red-500/8 p-4 text-sm text-red-100"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
      {loading && cases.length === 0 ? <div className="grid min-h-52 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--theme-accent-readable)]" /></div> : cases.length === 0 ? (
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-8 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-[var(--theme-accent-readable)]" /><h3 className="mt-3 font-semibold text-[var(--text-primary)]">Queue clear</h3><p className="mt-1 text-sm text-[var(--text-muted)]">There are no cases matching this view.</p></div>
      ) : (
        <div className="grid gap-3">
          {cases.map(item => (
            <button key={item.id} type="button" onClick={() => void loadDetail(item.id)} className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 text-left transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-[var(--border-glow)] hover:bg-[var(--theme-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-sm font-semibold text-[var(--theme-accent-readable)]">{formatModerationCaseReference(item.caseNumber)}</span><div className="flex gap-2"><Pill value={item.severity} /><Pill value={item.status} /></div></div>
              <p className="mt-3 font-medium text-[var(--text-primary)]">{displayName(item.subjectDisplayName, item.subjectUsername)}</p>
              <p className="mt-1 text-sm capitalize text-[var(--text-secondary)]">{item.targetType.replace(/_/g, ' ')} · {item.primaryCategory.replace(/_/g, ' ')} · {item.reportCount} report{item.reportCount === 1 ? '' : 's'}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]"><span>Owner: {displayName(item.assigneeDisplayName, item.assigneeUsername)}</span><span className={dueState(item.resolveDueAt) === 'overdue' ? 'text-red-300' : ''}>Resolve by {formatDate(item.resolveDueAt)}</span></div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Pill({ value }: { value: string }) {
  return <span className="rounded-full border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] px-2.5 py-1 text-xs font-medium capitalize text-[var(--theme-accent-readable)]">{value.replace(/_/g, ' ')}</span>
}

function CaseDetail({ detail, loading, saving, currentUserId, onBack, onRefresh, applyAndRefresh }: {
  detail: ModerationCaseDetail | null
  loading: boolean
  saving: boolean
  currentUserId: string | null
  onBack: () => void
  onRefresh: () => void
  applyAndRefresh: (operation: () => Promise<unknown>, successMessage: string) => Promise<void>
}) {
  const [status, setStatus] = useState<ModerationCaseStatus>('new')
  const [severity, setSeverity] = useState<ModerationCaseSeverity>('medium')
  const [outcome, setOutcome] = useState<ModerationCaseOutcome>('other')
  const [internalNote, setInternalNote] = useState('')
  const [reporterSummary, setReporterSummary] = useState('')
  const [publicReason, setPublicReason] = useState('')
  const [durationHours, setDurationHours] = useState('24')
  const [banScopes, setBanScopes] = useState<string[]>(['general_chat'])

  useEffect(() => {
    if (!detail) return
    setStatus(detail.case.status)
    setSeverity(detail.case.severity)
    setOutcome(detail.case.outcomeCode ?? 'other')
    setInternalNote('')
    setReporterSummary('')
  }, [detail])

  if (loading || !detail) return <div className="grid min-h-72 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--theme-accent-readable)]" /></div>
  const record = detail.case
  const firstEvidence = detail.evidence[0]
  const snapshot = firstEvidence?.snapshot ?? {}
  const evidenceText = String(snapshot.content ?? snapshot.message ?? snapshot.caption ?? snapshot.comment ?? snapshot.display_name ?? 'Evidence snapshot captured')
  const saveTransition = () => applyAndRefresh(() => transitionModerationCase({ caseId: record.id, expectedVersion: record.version, status, severity, outcomeCode: ['resolved', 'dismissed', 'closed'].includes(status) ? outcome : null, internalNote, reporterSummary }), 'Case updated')

  const confirmAction = async (action: 'remove_content' | 'channel_ban' | 'no_action') => {
    const label = action === 'remove_content' ? 'remove the reported content' : action === 'channel_ban' ? 'replace this member’s active channel restrictions' : 'record no action'
    if (!window.confirm(`Confirm that you want to ${label}. This will be written to the permanent case audit.`)) return
    if (action === 'channel_ban' && !publicReason.trim()) {
      toast.error('A member-visible public reason is required for channel restrictions')
      return
    }
    await applyAndRefresh(async () => {
      const result = await applyModerationCaseAction({
        caseId: record.id,
        expectedVersion: record.version,
        actionType: action,
        requestedScopes: action === 'channel_ban' ? banScopes : [],
        durationMinutes: action === 'channel_ban' ? Math.max(1, Number(durationHours) || 24) * 60 : null,
        publicReason: action === 'channel_ban' ? publicReason : null,
        internalNote,
      })
      if (!result.ok) throw new Error(result.error || 'The audited action could not be applied')
      return result
    }, action === 'remove_content' ? 'Content action recorded' : action === 'channel_ban' ? 'Channel restrictions updated' : 'No-action outcome recorded')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3"><Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Queue</Button><Button variant="ghost" size="sm" onClick={onRefresh}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
      <div className="rounded-3xl border border-[var(--border-panel)] bg-[var(--bg-panel)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-mono text-lg font-semibold text-[var(--theme-accent-readable)]">{formatModerationCaseReference(record.caseNumber)}</h2><div className="flex gap-2"><Pill value={record.severity} /><Pill value={record.status} /></div></div>
        <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{displayName(record.subject?.display_name, record.subject?.username)}</p>
        <p className="mt-1 text-sm capitalize text-[var(--text-secondary)]">{record.targetType.replace(/_/g, ' ')} · {record.primaryCategory.replace(/_/g, ' ')}</p>
        <div className="mt-4 grid gap-2 text-xs text-[var(--text-muted)] sm:grid-cols-2"><span><Clock3 className="mr-1 inline h-3.5 w-3.5" />Acknowledge by {formatDate(record.ackDueAt)}</span><span>Resolve by {formatDate(record.resolveDueAt)}</span><span>Created {formatDate(record.createdAt)}</span><span>Version {record.version}</span></div>
      </div>

      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5">
        <h3 className="font-semibold text-[var(--text-primary)]">Immutable evidence</h3>
        <p className="mt-3 whitespace-pre-wrap rounded-2xl border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.18)] p-4 text-sm leading-6 text-[var(--text-secondary)]">{evidenceText}</p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Captured {formatDate(firstEvidence?.captured_at)} · Source is not trusted from the reporting client.</p>
        {detail.reports.flatMap(report => report.attachments ?? []).map(attachment => attachment.signedUrl ? <a key={attachment.id} href={attachment.signedUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[var(--border-panel)] px-3 py-2 text-sm text-[var(--theme-accent-readable)]"><ExternalLink className="h-4 w-4" />{attachment.name}</a> : null)}
      </section>

      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-[var(--text-primary)]">Ownership</h3>{record.assignedTo !== currentUserId && currentUserId && <Button size="sm" onClick={() => void applyAndRefresh(() => assignModerationCase(record.id, record.version, currentUserId), 'Case assigned to you')} loading={saving}><UserCheck className="mr-2 h-4 w-4" />Claim case</Button>}</div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{record.assignee ? displayName(record.assignee.display_name, record.assignee.username) : 'Unassigned'}</p>
      </section>

      <section className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5">
        <h3 className="font-semibold text-[var(--text-primary)]">Review decision</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Status" value={status} onChange={value => setStatus(value as ModerationCaseStatus)} values={statuses} />
          <SelectField label="Severity" value={severity} onChange={value => setSeverity(value as ModerationCaseSeverity)} values={severities} />
          <SelectField label="Outcome" value={outcome} onChange={value => setOutcome(value as ModerationCaseOutcome)} values={outcomes} />
        </div>
        <label className="block text-sm text-[var(--text-secondary)]">Private operator note<textarea value={internalNote} onChange={event => setInternalNote(event.target.value.slice(0, 4000))} rows={3} className="mt-2 w-full rounded-2xl border border-[var(--border-panel)] bg-[var(--input-bg)] p-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" /></label>
        <label className="block text-sm text-[var(--text-secondary)]">Reporter-visible update<textarea value={reporterSummary} onChange={event => setReporterSummary(event.target.value.slice(0, 1000))} rows={3} className="mt-2 w-full rounded-2xl border border-[var(--border-panel)] bg-[var(--input-bg)] p-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" /></label>
        <Button onClick={() => void saveTransition()} loading={saving}>Save review update</Button>
      </section>

      <section className="space-y-4 rounded-3xl border border-red-400/20 bg-red-500/[0.035] p-5">
        <h3 className="font-semibold text-[var(--text-primary)]">Audited actions</h3>
        <p className="text-xs leading-5 text-[var(--text-muted)]">Actions are confirmed, applied server-side, and permanently recorded. DM cases never expose or remove conversation history.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-[var(--text-secondary)] sm:col-span-2">Public restriction reason<input value={publicReason} onChange={event => setPublicReason(event.target.value.slice(0, 500))} className="mt-2 h-11 w-full rounded-xl border border-[var(--border-panel)] bg-[var(--input-bg)] px-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" /></label>
          <label className="block text-sm text-[var(--text-secondary)]">Duration (hours)<input type="number" min="1" max="8760" value={durationHours} onChange={event => setDurationHours(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[var(--border-panel)] bg-[var(--input-bg)] px-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" /></label>
          <div className="text-sm text-[var(--text-secondary)]"><span className="block">Desired active scopes</span><div className="mt-2 flex gap-2">{['general_chat', 'all_interaction'].map(scope => <label key={scope} className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3"><input type="checkbox" checked={banScopes.includes(scope)} onChange={() => setBanScopes(current => current.includes(scope) ? current.filter(item => item !== scope) : [...current, scope])} />{scope.replace(/_/g, ' ')}</label>)}</div></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="danger" size="sm" onClick={() => void confirmAction('remove_content')} loading={saving}>Remove reported content</Button><Button variant="danger" size="sm" onClick={() => void confirmAction('channel_ban')} loading={saving}>Apply channel restrictions</Button><Button variant="secondary" size="sm" onClick={() => void confirmAction('no_action')} loading={saving}>Record no action</Button></div>
      </section>

      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5"><h3 className="font-semibold text-[var(--text-primary)]">Case timeline</h3><div className="mt-4 space-y-4">{detail.events.map(event => <div key={event.id} className="border-l border-[var(--theme-accent-border-soft)] pl-4"><div className="flex flex-wrap items-center gap-2"><Pill value={event.event_type} /><span className="text-xs text-[var(--text-muted)]">{formatDate(event.created_at)}</span></div>{event.internal_note && <p className="mt-2 text-sm text-[var(--text-secondary)]">{event.internal_note}</p>}{event.reporter_summary && <p className="mt-2 rounded-xl bg-[var(--theme-accent-soft)] p-3 text-sm text-[var(--text-secondary)]">Reporter update: {event.reporter_summary}</p>}</div>)}</div></section>
    </div>
  )
}

function SelectField({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className="block text-sm text-[var(--text-secondary)]">{label}<select value={value} onChange={event => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[var(--border-panel)] bg-[var(--input-bg)] px-3 capitalize text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]">{values.map(item => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}</select></label>
}

function QueueFilter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className="block text-xs font-medium text-[var(--text-muted)]">{label}<select value={value} onChange={event => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--input-bg)] px-3 text-sm capitalize text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"><option value="">Any {label.toLowerCase()}</option>{values.map(item => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}</select></label>
}
