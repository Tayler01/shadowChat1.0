import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Loader2, RadioTower, RefreshCw, ShieldAlert, UserCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import {
  applyShadoLiveCaseAction,
  assignModerationCase,
  formatModerationCaseReference,
  getShadoLiveModerationCase,
  listShadoLiveModerationCases,
  type ModerationCaseDetail,
  type ModerationCaseSummary,
} from '../../lib/moderationCases'

const formatDate = (value?: string | null) => {
  if (!value) return 'Unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
}

const personLabel = (item: ModerationCaseSummary) => (
  item.subjectDisplayName || (item.subjectUsername ? `@${item.subjectUsername}` : 'Unknown member')
)

export function ShadoLiveCaseCenter() {
  const { user } = useAuth()
  const [cases, setCases] = useState<ModerationCaseSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ModerationCaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [durationHours, setDurationHours] = useState('24')
  const [scopes, setScopes] = useState<Array<'host' | 'join' | 'chat'>>(['join'])

  const loadCases = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCases(await listShadoLiveModerationCases({ queue: 'all', limit: 30 }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load Shado Live safety cases')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (caseId: string) => {
    setSelectedId(caseId)
    setLoading(true)
    setError(null)
    try {
      setDetail(await getShadoLiveModerationCase(caseId))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load this Shado Live case')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCases()
  }, [loadCases])

  const evidence = detail?.evidence[0]?.snapshot ?? null
  const evidenceSummary = useMemo(() => {
    if (!evidence) return 'Authoritative evidence is unavailable.'
    const candidate = evidence.body
      ?? evidence.title
      ?? evidence.roomTitle
      ?? (evidence.subject as Record<string, unknown> | undefined)?.displayName
    return typeof candidate === 'string' && candidate.trim()
      ? candidate
      : 'Authoritative Shado Live state was captured on the server.'
  }, [evidence])

  const runAction = async (
    action: 'no_action' | 'end_live_room' | 'remove_live_participant' | 'mute_live_participant' | 'set_live_restriction' | 'revoke_live_restriction',
  ) => {
    if (!detail) return
    const isRestriction = action === 'set_live_restriction' || action === 'revoke_live_restriction'
    if (isRestriction && (!reason.trim() || scopes.length === 0)) {
      toast.error('Choose a live restriction scope and enter a public reason')
      return
    }
    if (!window.confirm(`Apply ${action.replace(/_/gu, ' ')} to ${formatModerationCaseReference(detail.case.caseNumber)}? This is permanently audited.`)) return
    setSaving(true)
    try {
      const result = await applyShadoLiveCaseAction({
        caseId: detail.case.id,
        expectedVersion: detail.case.version,
        actionType: action,
        requestedScopes: isRestriction ? scopes : [],
        durationMinutes: action === 'set_live_restriction'
          ? Math.max(1, Number(durationHours) || 24) * 60
          : null,
        publicReason: reason,
        internalNote: note,
      })
      if (!result.ok) throw new Error(result.error || 'The live safety action was not applied')
      toast.success('Shado Live safety action applied')
      await loadDetail(detail.case.id)
      await loadCases()
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'The live safety action failed')
    } finally {
      setSaving(false)
    }
  }

  if (selectedId) {
    if (loading || !detail) {
      return <div className="grid min-h-48 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--theme-accent-readable)]" /></div>
    }
    const participantActionable = detail.case.targetType !== 'live_room'
    return (
      <section className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--theme-accent-border-soft)] bg-[var(--bg-panel)] p-4 sm:p-5" aria-labelledby="shado-live-case-title">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedId(null); setDetail(null) }}><ArrowLeft className="mr-2 h-4 w-4" />Live queue</Button>
          <Button variant="ghost" size="sm" onClick={() => void loadDetail(selectedId)}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent-readable)]">{formatModerationCaseReference(detail.case.caseNumber)}</p>
          <h3 id="shado-live-case-title" className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{detail.case.subject?.display_name || detail.case.subject?.username || 'Shado Live safety case'}</h3>
          <p className="mt-1 text-sm capitalize text-[var(--text-muted)]">{detail.case.targetType.replace(/_/gu, ' ')} · {detail.case.primaryCategory.replace(/_/gu, ' ')} · version {detail.case.version}</p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.18)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Server-captured evidence</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{evidenceSummary}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Captured {formatDate(detail.evidence[0]?.captured_at)}</p>
        </div>
        {detail.case.assignedTo !== user?.id && user?.id && (
          <Button size="sm" loading={saving} onClick={() => void (async () => {
            setSaving(true)
            try {
              await assignModerationCase(detail.case.id, detail.case.version, user.id)
              toast.success('Case assigned to you')
              await loadDetail(detail.case.id)
            } catch (nextError) {
              toast.error(nextError instanceof Error ? nextError.message : 'Could not claim case')
            } finally {
              setSaving(false)
            }
          })()}><UserCheck className="mr-2 h-4 w-4" />Claim case</Button>
        )}
        <label className="block text-sm text-[var(--text-secondary)]">Public safety reason<input value={reason} onChange={event => setReason(event.target.value.slice(0, 500))} className="mt-2 h-11 w-full rounded-xl border border-[var(--border-panel)] bg-[var(--input-bg)] px-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" /></label>
        <label className="block text-sm text-[var(--text-secondary)]">Private operator note<textarea value={note} onChange={event => setNote(event.target.value.slice(0, 4000))} rows={3} className="mt-2 w-full rounded-xl border border-[var(--border-panel)] bg-[var(--input-bg)] p-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-[var(--text-secondary)]">Restriction duration (hours)<input type="number" min="1" max="8760" value={durationHours} onChange={event => setDurationHours(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[var(--border-panel)] bg-[var(--input-bg)] px-3 text-[var(--text-primary)]" /></label>
          <div className="text-sm text-[var(--text-secondary)]"><span>Live restriction scopes</span><div className="mt-2 flex flex-wrap gap-2">{(['host', 'join', 'chat'] as const).map(scope => <label key={scope} className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3"><input type="checkbox" checked={scopes.includes(scope)} onChange={() => setScopes(current => current.includes(scope) ? current.filter(item => item !== scope) : [...current, scope])} />{scope}</label>)}</div></div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-4">
          <Button variant="danger" size="sm" loading={saving} onClick={() => void runAction('end_live_room')}>End room</Button>
          {participantActionable && <Button variant="danger" size="sm" loading={saving} onClick={() => void runAction('remove_live_participant')}>Remove participant</Button>}
          {participantActionable && <Button variant="danger" size="sm" loading={saving} onClick={() => void runAction('mute_live_participant')}>Mute speaker</Button>}
          <Button variant="danger" size="sm" loading={saving} onClick={() => void runAction('set_live_restriction')}>Set live restriction</Button>
          <Button variant="secondary" size="sm" loading={saving} onClick={() => void runAction('revoke_live_restriction')}>Revoke restriction</Button>
          <Button variant="secondary" size="sm" loading={saving} onClick={() => void runAction('no_action')}>No action</Button>
        </div>
      </section>
    )
  }

  return (
    <section className="mt-5 space-y-4 rounded-[var(--radius-xl)] border border-[var(--theme-accent-border-soft)] bg-[rgba(215,170,70,0.035)] p-4 sm:p-5" aria-labelledby="shado-live-safety-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="shado-live-safety-title" className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"><RadioTower className="h-5 w-5 text-[var(--theme-accent-readable)]" />Shado Live Safety</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">Live-only reports, server evidence, and audited room or participant controls.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void loadCases()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>
      {error && <p className="rounded-xl border border-red-400/25 bg-red-500/8 p-3 text-sm text-red-100"><ShieldAlert className="mr-2 inline h-4 w-4" />{error}</p>}
      {loading && cases.length === 0 ? <div className="grid min-h-36 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--theme-accent-readable)]" /></div> : cases.length === 0 ? <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 text-center text-sm text-[var(--text-muted)]">No Shado Live safety cases.</p> : (
        <div className="grid gap-3">
          {cases.map(item => (
            <button key={item.id} type="button" onClick={() => void loadDetail(item.id)} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 text-left focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]">
              <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-semibold text-[var(--theme-accent-readable)]">{formatModerationCaseReference(item.caseNumber)}</span><span className="rounded-full border border-[var(--theme-accent-border-soft)] px-2 py-1 text-xs capitalize text-[var(--text-secondary)]">{item.status}</span></div>
              <p className="mt-2 font-semibold text-[var(--text-primary)]">{personLabel(item)}</p>
              <p className="mt-1 text-xs capitalize text-[var(--text-muted)]">{item.targetType.replace(/_/gu, ' ')} · {item.primaryCategory.replace(/_/gu, ' ')} · {item.reportCount} report{item.reportCount === 1 ? '' : 's'}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default ShadoLiveCaseCenter
