import { useMemo, useState } from 'react'
import { Archive, Check, ExternalLink, ListChecks, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAutomationApprovals } from '../../hooks/useAutomationApprovals'
import type {
  AutomationApprovalPacket,
  AutomationApprovalPacketEvent,
  AutomationApprovalPacketStatus,
} from '../../lib/automationApprovals'

type PacketStatusFilter = 'open' | 'all'

const openStatuses = new Set<AutomationApprovalPacketStatus>(['pending', 'ready_for_review'])

const statusLabel: Record<AutomationApprovalPacketStatus, string> = {
  pending: 'Pending',
  ready_for_review: 'Ready',
  approved: 'Approved',
  rejected: 'Rejected',
  archived: 'Archived',
}

const statusClass: Record<AutomationApprovalPacketStatus, string> = {
  pending: 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] text-[var(--text-muted)]',
  ready_for_review: 'border-[rgba(215,170,70,0.22)] bg-[rgba(215,170,70,0.08)] text-[var(--text-gold)]',
  approved: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
  rejected: 'border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] text-red-100',
  archived: 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] text-[var(--text-muted)]',
}

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Not recorded'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'

  return date.toLocaleString()
}

const safeHttpUrl = (value?: string | null) => {
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

const renderJsonList = (items: unknown[], emptyLabel: string) => {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyLabel}</p>
  }

  return (
    <ul className="space-y-2">
      {items.slice(0, 8).map((item, index) => (
        <li
          key={index}
          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-3 text-sm leading-6 text-[var(--text-muted)]"
        >
          {typeof item === 'string' ? item : JSON.stringify(item, null, 2)}
        </li>
      ))}
    </ul>
  )
}

const PacketLink = ({ label, href }: { label: string; href?: string | null }) => {
  const safeHref = safeHttpUrl(href)
  if (!safeHref) return null

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  )
}

const PacketEventList = ({ events }: { events: AutomationApprovalPacketEvent[] }) => {
  if (events.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">No audit events yet.</p>
  }

  return (
    <div className="space-y-2">
      {events.map(event => (
        <div
          key={event.id}
          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {event.event_type.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-[var(--text-muted)]">{formatDateTime(event.created_at)}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{event.message}</p>
        </div>
      ))}
    </div>
  )
}

const PacketDetail = ({
  packet,
  events,
  activeActionId,
  onApprove,
  onReject,
  onArchive,
}: {
  packet: AutomationApprovalPacket
  events: AutomationApprovalPacketEvent[]
  activeActionId: string | null
  onApprove: (packet: AutomationApprovalPacket) => void
  onReject: (packet: AutomationApprovalPacket) => void
  onArchive: (packet: AutomationApprovalPacket) => void
}) => {
  const actionBusy = activeActionId === packet.id
  const canApproveOrReject = openStatuses.has(packet.status)
  const canArchive = packet.status !== 'archived'

  return (
    <div className="min-w-0 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${statusClass[packet.status]}`}>
              {statusLabel[packet.status]}
            </span>
            <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {packet.packet_type.replace(/_/g, ' ')}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{packet.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            {[packet.candidate_id, packet.category].filter(Boolean).join(' / ') || 'Uncategorized packet'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onApprove(packet)}
            disabled={!canApproveOrReject || actionBusy}
            loading={actionBusy && canApproveOrReject}
            aria-label={`Approve ${packet.title}`}
          >
            <Check className="mr-2 h-4 w-4" />
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => onReject(packet)}
            disabled={!canApproveOrReject || actionBusy}
            aria-label={`Reject ${packet.title}`}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Reject
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onArchive(packet)}
            disabled={!canArchive || actionBusy}
            aria-label={`Archive ${packet.title}`}
          >
            <Archive className="mr-2 h-4 w-4" />
            Archive
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <PacketLink label="PR" href={packet.pr_url} />
        <PacketLink label="Preview" href={packet.preview_url} />
        <PacketLink label="Artifact" href={packet.artifact_url} />
        <PacketLink label="Packet" href={packet.packet_url} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Summary</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-muted)]">
            {packet.summary || 'No summary recorded.'}
          </p>
        </section>
        <section>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Risk Notes</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-muted)]">
            {packet.risk_notes || 'No risks recorded.'}
          </p>
        </section>
        <section>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Proposed Scope</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-muted)]">
            {packet.proposed_scope || 'No scope recorded.'}
          </p>
        </section>
        <section>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Verification Plan</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-muted)]">
            {packet.verification_plan || 'No verification plan recorded.'}
          </p>
        </section>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Evidence</h4>
          <div className="mt-2">{renderJsonList(packet.evidence, 'No evidence attached.')}</div>
        </section>
        <section>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Audit Events</h4>
          <div className="mt-2"><PacketEventList events={events} /></div>
        </section>
      </div>

      {packet.generated_prompt && (
        <section className="mt-5">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Generated Prompt</h4>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.24)] p-3 text-xs leading-5 text-[var(--text-muted)]">
            {packet.generated_prompt}
          </pre>
        </section>
      )}
    </div>
  )
}

export function AdminAutomationApprovals() {
  const {
    packets,
    eventsByPacketId,
    loading,
    error,
    activeActionId,
    refresh,
    approvePacket,
    rejectPacket,
    archivePacket,
  } = useAutomationApprovals()
  const [filter, setFilter] = useState<PacketStatusFilter>('open')
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null)

  const visiblePackets = useMemo(() => (
    filter === 'open'
      ? packets.filter(packet => openStatuses.has(packet.status))
      : packets
  ), [filter, packets])

  const selectedPacket = useMemo(() => (
    visiblePackets.length > 0
      ? visiblePackets.find(packet => packet.id === selectedPacketId) ?? visiblePackets[0]
      : null
  ), [selectedPacketId, visiblePackets])

  const handleApprove = (packet: AutomationApprovalPacket) => {
    void approvePacket(packet.id)
  }

  const handleReject = (packet: AutomationApprovalPacket) => {
    const reason = window.prompt(`Reason to reject "${packet.title}"?`)?.trim()
    if (reason === undefined) return

    void rejectPacket(packet.id, reason)
  }

  const handleArchive = (packet: AutomationApprovalPacket) => {
    if (!window.confirm(`Archive "${packet.title}"?`)) return

    void archivePacket(packet.id)
  }

  return (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <ListChecks className="mt-0.5 h-5 w-5 text-[var(--text-muted)]" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Automation Approvals</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
              Review-only packets for scans, builds, docs, and batch handoffs. Approval records intent; it does not run or ship code.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh automation approvals"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={filter === 'open'}
          onClick={() => setFilter('open')}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            filter === 'open'
              ? 'border-[rgba(215,170,70,0.3)] bg-[rgba(215,170,70,0.1)] text-[var(--text-gold)]'
              : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          Open
        </button>
        <button
          type="button"
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            filter === 'all'
              ? 'border-[rgba(215,170,70,0.3)] bg-[rgba(215,170,70,0.1)] text-[var(--text-gold)]'
              : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          All
        </button>
      </div>

      {loading ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
          Loading automation approvals.
        </div>
      ) : packets.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
          No automation approval packets yet.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(16rem,22rem)_1fr]">
          <div className="space-y-2">
            {visiblePackets.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
                No open packets.
              </div>
            ) : (
              visiblePackets.map(packet => (
                <button
                  key={packet.id}
                  type="button"
                  onClick={() => setSelectedPacketId(packet.id)}
                  className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
                    selectedPacket?.id === packet.id
                      ? 'border-[var(--border-glow)] bg-[rgba(215,170,70,0.08)]'
                      : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--border-glow)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${statusClass[packet.status]}`}>
                      {statusLabel[packet.status]}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">{formatDateTime(packet.created_at)}</span>
                  </div>
                  <span className="mt-2 block text-sm font-semibold text-[var(--text-primary)]">{packet.title}</span>
                  <span className="mt-1 block truncate text-xs text-[var(--text-muted)]">
                    {[packet.candidate_id, packet.category].filter(Boolean).join(' / ') || packet.packet_type}
                  </span>
                </button>
              ))
            )}
          </div>

          {selectedPacket && (
            <PacketDetail
              packet={selectedPacket}
              events={eventsByPacketId[selectedPacket.id] ?? []}
              activeActionId={activeActionId}
              onApprove={handleApprove}
              onReject={handleReject}
              onArchive={handleArchive}
            />
          )}
        </div>
      )}
    </div>
  )
}
