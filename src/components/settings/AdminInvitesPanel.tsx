import React, { useMemo, useState } from 'react'
import { Check, Clock, Copy, Mail, RefreshCw, Ticket, Trash2, UserCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import { useAdminInvites } from '../../hooks/useAdminInvites'
import type { AdminInviteRecord, AdminInviteStatus } from '../../lib/adminInvites'
import { Button } from '../ui/Button'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const normalizeEmailLock = (value: string) => value.trim().toLowerCase()

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return date.toLocaleString()
}

const getInviteStatus = (invite: AdminInviteRecord): AdminInviteStatus => {
  if (invite.status) return invite.status
  if (invite.redeemedAt) return 'redeemed'
  if (invite.revokedAt) return 'revoked'
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) return 'expired'
  return 'active'
}

const getStatusClass = (status: AdminInviteStatus) => {
  if (status === 'active') {
    return 'border-[rgba(215,170,70,0.22)] bg-[rgba(215,170,70,0.08)] text-[var(--text-gold)]'
  }

  if (status === 'redeemed') {
    return 'border-zinc-400/30 bg-zinc-300/10 text-zinc-200'
  }

  if (status === 'expired') {
    return 'border-[rgba(224,164,62,0.28)] bg-[rgba(224,164,62,0.1)] text-amber-100'
  }

  return 'border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] text-red-100'
}

const getPersonLabel = (
  displayName: string | null,
  username: string | null,
  email: string | null,
  fallback: string
) => displayName || (username ? `@${username}` : email) || fallback

function InvitePolicyPill({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
      <Icon className="mr-2 h-3.5 w-3.5 text-[var(--text-gold)]" />
      {label}
    </span>
  )
}

function InviteMeta({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</span>
      <span className="mt-1 block truncate text-sm text-[var(--text-secondary)]">{value}</span>
    </span>
  )
}

function InviteStatusBadge({ status }: { status: AdminInviteStatus }) {
  return (
    <span className={`w-fit rounded-full border px-3 py-1 text-xs uppercase tracking-[0.12em] ${getStatusClass(status)}`}>
      {status}
    </span>
  )
}

function InviteCard({
  invite,
  onRevoke,
  revoking,
}: {
  invite: AdminInviteRecord
  onRevoke: (invite: AdminInviteRecord) => void
  revoking: boolean
}) {
  const status = getInviteStatus(invite)
  const creator = getPersonLabel(invite.createdByDisplayName, invite.createdByUsername, invite.createdByEmail, 'Unknown creator')
  const redeemedUser = getPersonLabel(invite.redeemedByDisplayName, invite.redeemedByUsername, invite.redeemedByEmail, 'Not redeemed')
  const canRevoke = status === 'active' && !invite.redeemedAt
  const targetLabel = invite.emailLock || invite.id

  return (
    <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <InviteStatusBadge status={status} />
          <h3 className="truncate font-medium text-[var(--text-primary)]">
            {invite.emailLock || 'Open invite'}
          </h3>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InviteMeta label="Created by" value={creator} />
          <InviteMeta label="Expires" value={formatDateTime(invite.expiresAt)} />
          <InviteMeta label="Created" value={formatDateTime(invite.createdAt)} />
          {invite.redeemedAt && (
            <>
              <InviteMeta label="Redeemed by" value={redeemedUser} />
              <InviteMeta label="Redeemed email" value={invite.redeemedByEmail || 'Not recorded'} />
              <InviteMeta label="Redeemed" value={formatDateTime(invite.redeemedAt)} />
            </>
          )}
        </div>
      </div>
      {canRevoke && (
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={() => onRevoke(invite)}
          loading={revoking}
          className="w-full justify-center lg:w-auto"
          aria-label={`Revoke invite for ${targetLabel}`}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Revoke
        </Button>
      )}
    </div>
  )
}

export function AdminInvitesPanel() {
  const { isOperator, loading: accessLoading } = useAdminAccess({ includeUsers: false })
  const {
    invites,
    lastCreatedInvite,
    loading,
    creating,
    revokingInviteId,
    error,
    refresh,
    generateInvite,
    revokeInvite,
  } = useAdminInvites({ enabled: isOperator })
  const [emailLock, setEmailLock] = useState('')

  const normalizedEmailLock = normalizeEmailLock(emailLock)
  const emailLockIsValid = !normalizedEmailLock || EMAIL_PATTERN.test(normalizedEmailLock)
  const unusedInvites = useMemo(
    () => invites.filter(invite => !invite.redeemedAt),
    [invites]
  )
  const redeemedInvites = useMemo(
    () => invites.filter(invite => Boolean(invite.redeemedAt)),
    [invites]
  )

  const handleGenerateInvite = async () => {
    if (!emailLockIsValid) {
      toast.error('Enter a valid email address or leave the lock blank')
      return
    }

    try {
      await generateInvite(normalizedEmailLock || null)
      setEmailLock('')
      toast.success('Invite generated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate invite')
    }
  }

  const handleCopyInvite = async () => {
    const code = lastCreatedInvite?.code
    if (!code) return

    try {
      await navigator.clipboard.writeText(code)
      toast.success('Invite code copied')
    } catch {
      toast.error('Copy failed')
    }
  }

  const handleRevokeInvite = async (invite: AdminInviteRecord) => {
    const confirmed = window.confirm(`Revoke this unused invite${invite.emailLock ? ` for ${invite.emailLock}` : ''}?`)
    if (!confirmed) return

    try {
      await revokeInvite(invite.id)
      toast.success('Invite revoked')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke invite')
    }
  }

  if (accessLoading) {
    return (
      <div className="glass-panel rounded-[var(--radius-lg)] p-5 text-sm text-[var(--text-muted)]">
        Loading invite controls.
      </div>
    )
  }

  if (!isOperator) {
    return (
      <div className="glass-panel rounded-[var(--radius-lg)] p-5 text-sm leading-6 text-[var(--text-muted)]">
        Invite management is limited to admin-class accounts.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Ticket className="mt-0.5 h-5 w-5 text-[var(--text-muted)]" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Invites</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                Generate one-time signup codes for new Shadow Chat accounts.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void refresh(true)}
            disabled={loading}
            className="w-full justify-center sm:w-auto"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <InvitePolicyPill icon={UserCheck} label="Admin or sub-admin" />
          <InvitePolicyPill icon={Clock} label="24-hour expiry" />
          <InvitePolicyPill icon={Check} label="Single-use" />
          <InvitePolicyPill icon={Mail} label="Optional email lock" />
        </div>

        <div className="mt-5 grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="min-w-0">
            <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Email lock</span>
            <input
              type="email"
              value={emailLock}
              onChange={event => setEmailLock(event.target.value)}
              placeholder="Optional new-user email"
              className={`obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm ${
                emailLockIsValid ? '' : 'border-[rgba(190,52,85,0.45)]'
              }`}
            />
            <p className={`mt-2 text-xs ${emailLockIsValid ? 'text-[var(--text-muted)]' : 'text-red-100'}`}>
              {emailLockIsValid
                ? 'Leave blank to let any email redeem the code.'
                : 'Use a complete email address, or clear this field.'}
            </p>
          </label>
          <Button
            type="button"
            onClick={() => void handleGenerateInvite()}
            disabled={creating || !emailLockIsValid}
            loading={creating}
            className="w-full justify-center lg:w-auto"
          >
            <Ticket className="mr-2 h-4 w-4" />
            Generate
          </Button>
        </div>

        {lastCreatedInvite?.code && (
          <div className="mt-4 rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.28)] bg-[rgba(215,170,70,0.08)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="block text-[10px] uppercase tracking-[0.14em] text-[var(--text-gold)]">New invite code</span>
                <code className="mt-2 block break-all font-mono text-sm text-[var(--text-primary)]">
                  {lastCreatedInvite.code}
                </code>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Expires {formatDateTime(lastCreatedInvite.invite.expiresAt)}.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleCopyInvite()}
                className="w-full justify-center sm:w-auto"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-4 text-sm text-red-100">
            {error}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Unused Invites</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Active, expired, and revoked codes that were not redeemed.</p>
          </div>
          <span className="w-fit rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {unusedInvites.length} total
          </span>
        </div>
        {loading ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
            Loading invites.
          </div>
        ) : unusedInvites.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
            No unused invites.
          </div>
        ) : (
          <div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
            {unusedInvites.map(invite => (
              <InviteCard
                key={invite.id}
                invite={invite}
                onRevoke={handleRevokeInvite}
                revoking={revokingInviteId === invite.id}
              />
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Redeemed History</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Completed invites with creator and redeemed account details.</p>
          </div>
          <span className="w-fit rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {redeemedInvites.length} redeemed
          </span>
        </div>
        {loading ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
            Loading history.
          </div>
        ) : redeemedInvites.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
            No redeemed invites yet.
          </div>
        ) : (
          <div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
            {redeemedInvites.map(invite => (
              <InviteCard
                key={invite.id}
                invite={invite}
                onRevoke={handleRevokeInvite}
                revoking={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
