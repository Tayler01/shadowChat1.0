import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  BellRing,
  CheckCircle2,
  Database,
  ExternalLink,
  GitCommit,
  PauseCircle,
  RefreshCw,
  Server,
} from 'lucide-react'

import { CURRENT_APP_COMMIT_SHA } from '../../lib/appReleases'
import {
  fetchOperationsHealthSnapshot,
  isOperationsSmokeFresh,
  type OperationsHealthSnapshot,
} from '../../lib/operationsHealth'
import { Button } from '../ui/Button'

type HealthTone = 'ready' | 'warning' | 'error' | 'paused'

const toneClasses: Record<HealthTone, string> = {
  ready: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
  warning: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  error: 'border-red-400/25 bg-red-400/10 text-red-100',
  paused: 'border-zinc-400/25 bg-zinc-400/10 text-zinc-200',
}

function StatusBadge({ label, tone }: { label: string; tone: HealthTone }) {
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${toneClasses[tone]}`}>
      {tone === 'ready' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}

function EvidenceCard({
  children,
  icon: Icon,
  label,
  status,
  tone,
}: {
  children: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  label: string
  status: string
  tone: HealthTone
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] p-2 text-[var(--text-gold)]">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="font-medium text-[var(--text-primary)]">{label}</h3>
        </div>
        <StatusBadge label={status} tone={tone} />
      </div>
      <div className="mt-3 space-y-1.5 text-sm leading-5 text-[var(--text-muted)]">
        {children}
      </div>
    </section>
  )
}

const shortSha = (value: string | null) => value ? value.slice(0, 7) : 'Unavailable'

const formatTimestamp = (value: string | null) => {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Invalid timestamp' : date.toLocaleString()
}

export function OperationsHealthCenter() {
  const [snapshot, setSnapshot] = useState<OperationsHealthSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSnapshot(await fetchOperationsHealthSnapshot())
    } catch {
      setError('Operations evidence could not be loaded. Confirm this account still has operator access and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchOperationsHealthSnapshot()
      .then(nextSnapshot => {
        if (active) setSnapshot(nextSnapshot)
      })
      .catch(() => {
        if (active) {
          setError('Operations evidence could not be loaded. Confirm this account still has operator access and try again.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  if (loading && !snapshot) {
    return (
      <div className="glass-panel rounded-[var(--radius-lg)] p-5 text-sm text-[var(--text-muted)]" role="status">
        Loading production health evidence.
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="flex items-start gap-3">
          <Activity className="mt-0.5 h-5 w-5 text-[var(--text-gold)]" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Operations Health</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              {error || 'No production snapshot exists yet. The next backend-first release will create it automatically.'}
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={() => void refresh()} className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const clientSha = CURRENT_APP_COMMIT_SHA || null
  const frontendAligned = clientSha ? clientSha === snapshot.frontend_sha : null
  const smokeFresh = isOperationsSmokeFresh(snapshot.smoke_checked_at)
  const smokeReady = snapshot.smoke_status === 'passed' && smokeFresh
  const pausedDomainsSafe = snapshot.news_state === 'paused' && snapshot.bridge_state === 'paused'
  const allReady = snapshot.migrations_current
    && snapshot.functions_current
    && smokeReady
    && snapshot.push_ready
    && frontendAligned !== false
    && pausedDomainsSafe

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Activity className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--text-gold)]" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Operations Health</h2>
                <StatusBadge
                  label={allReady ? 'Ready' : 'Needs attention'}
                  tone={allReady ? 'ready' : 'warning'}
                />
              </div>
              <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                Sanitized release evidence from GitHub, Netlify, Supabase, and the production monitor. No credential values or user data are exposed here.
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Monitor checked {formatTimestamp(snapshot.smoke_checked_at)}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void refresh()}
            loading={loading}
            className="w-full justify-center sm:w-auto"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
        {error && (
          <p className="mt-4 rounded-[var(--radius-sm)] border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            {error} Showing the last loaded snapshot.
          </p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <EvidenceCard
          icon={GitCommit}
          label="Frontend release"
          status={frontendAligned === false ? 'Mismatch' : 'Aligned'}
          tone={frontendAligned === false ? 'error' : frontendAligned === null ? 'warning' : 'ready'}
        >
          <p>App: <span className="font-mono text-[var(--text-primary)]">{shortSha(clientSha)}</span></p>
          <p>Deployed: <span className="font-mono text-[var(--text-primary)]">{shortSha(snapshot.frontend_sha)}</span></p>
          <p>Published: {formatTimestamp(snapshot.deployed_at)}</p>
          {snapshot.deploy_url && (
            <a className="inline-flex items-center gap-1 text-[var(--text-gold)] hover:underline" href={snapshot.deploy_url} target="_blank" rel="noreferrer">
              Open deploy <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </EvidenceCard>

        <EvidenceCard
          icon={Database}
          label="Database migrations"
          status={snapshot.migrations_current ? 'Current' : 'Drift'}
          tone={snapshot.migrations_current ? 'ready' : 'error'}
        >
          <p>Latest version: <span className="font-mono text-[var(--text-primary)]">{snapshot.migration_version || 'Unavailable'}</span></p>
          <p>Verified: {formatTimestamp(snapshot.backend_checked_at)}</p>
        </EvidenceCard>

        <EvidenceCard
          icon={Server}
          label="Edge Functions"
          status={snapshot.functions_current ? 'Current' : 'Drift'}
          tone={snapshot.functions_current ? 'ready' : 'error'}
        >
          <p>{snapshot.active_function_count} active · {snapshot.paused_function_count} default-deny paused · {snapshot.removed_function_count} removed</p>
          <p>Manifest: <span className="font-mono text-[var(--text-primary)]">{shortSha(snapshot.function_manifest_sha256)}</span></p>
        </EvidenceCard>

        <EvidenceCard
          icon={CheckCircle2}
          label="Production smoke"
          status={smokeReady ? 'Passed' : snapshot.smoke_status === 'failed' ? 'Failed' : smokeFresh ? 'Pending' : 'Stale'}
          tone={smokeReady ? 'ready' : snapshot.smoke_status === 'failed' ? 'error' : 'warning'}
        >
          <p>App HTTP: <span className="text-[var(--text-primary)]">{snapshot.app_http_status || 'Unavailable'}</span></p>
          <p>Checked: {formatTimestamp(snapshot.smoke_checked_at)}</p>
          {!smokeFresh && <p className="text-amber-100">The 15-minute monitor has not reported recently.</p>}
        </EvidenceCard>

        <EvidenceCard
          icon={BellRing}
          label="Push delivery"
          status={snapshot.push_ready ? 'Ready' : 'Config needed'}
          tone={snapshot.push_ready ? 'ready' : 'warning'}
        >
          {snapshot.push_ready ? (
            <p>Frontend key, server key names, and the deployed send path were present at release.</p>
          ) : (
            <p>Missing: {snapshot.push_missing_requirements.join(', ') || 'release verification evidence'}</p>
          )}
        </EvidenceCard>

        <EvidenceCard
          icon={PauseCircle}
          label="Paused domains"
          status={pausedDomainsSafe ? 'Safely paused' : 'Review'}
          tone={pausedDomainsSafe ? 'paused' : 'error'}
        >
          <p>News: paused; Render worker and production runtime stay off.</p>
          <p>ESP Bridge: paused; deployed endpoints remain default-deny.</p>
        </EvidenceCard>
      </div>

      {snapshot.release_workflow_url && (
        <a
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 text-sm text-[var(--text-gold)] hover:border-[var(--border-glow)]"
          href={snapshot.release_workflow_url}
          target="_blank"
          rel="noreferrer"
        >
          View release workflow evidence <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  )
}
