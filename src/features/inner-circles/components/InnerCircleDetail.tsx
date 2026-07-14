import { ArrowLeft, MessageCircle, Pencil, Plus, Trash2, UserMinus, UsersRound } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import type { InnerCirclePerson, InnerCircleSummary } from './types'

function PersonAvatar({ person }: { person: InnerCirclePerson }) {
  const label = person.display_name || person.username || 'ShadowChat member'
  const src = person.avatar_thumbnail_url || person.avatar_url
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-sm font-semibold text-[var(--theme-accent-readable)]" aria-hidden="true">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : label.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function InnerCircleDetail({
  circle,
  members,
  onBack,
  onAddConnections,
  onMessage,
  onRemove,
  onRename,
  onDelete,
  onRetry,
  loading = false,
  error = null,
}: {
  circle: InnerCircleSummary
  members: InnerCirclePerson[]
  onBack: () => void
  onAddConnections: () => void
  onMessage: (member: InnerCirclePerson) => void
  onRemove: (member: InnerCirclePerson) => void
  onRename?: () => void
  onDelete?: () => void
  onRetry?: () => void
  loading?: boolean
  error?: string | null
}) {
  return (
    <section className="min-w-0" aria-labelledby="inner-circle-detail-heading">
      <div className="flex min-w-0 items-start gap-2">
        <button type="button" onClick={onBack} aria-label="Back to Inner Circles" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--theme-accent-soft)] hover:text-[var(--theme-accent-readable)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1 pt-1">
          <h3 id="inner-circle-detail-heading" className="break-words text-lg font-semibold text-[var(--text-primary)]">{circle.name}</h3>
          <p className="text-sm text-[var(--text-muted)]">{circle.memberCount} {circle.memberCount === 1 ? 'member' : 'members'} · private to you</p>
        </div>
        {onRename && <button type="button" onClick={onRename} aria-label={`Rename ${circle.name}`} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--theme-accent-soft)] hover:text-[var(--theme-accent-readable)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"><Pencil className="h-4 w-4" /></button>}
        {onDelete && <button type="button" onClick={onDelete} aria-label={`Delete ${circle.name}`} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-red-950/25 hover:text-red-100 focus:outline-none focus:ring-2 focus:ring-red-300"><Trash2 className="h-4 w-4" /></button>}
      </div>

      <Button type="button" variant="secondary" className="mt-4 w-full" onClick={onAddConnections} disabled={loading || Boolean(error)}>
        <Plus className="mr-2 h-4 w-4" />Add Connections
      </Button>

      {error && (
        <div role="alert" className="mt-3 rounded-[var(--radius-md)] border border-red-400/25 bg-red-950/20 p-3 text-sm text-red-100">
          <p>{error}</p>
          {onRetry && <Button type="button" variant="ghost" className="mt-2" onClick={onRetry}>Retry members</Button>}
        </div>
      )}

      {loading && members.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center text-sm text-[var(--text-muted)]" role="status">Loading members</div>
      ) : members.length === 0 ? (
        <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] px-5 py-8 text-center text-[var(--text-muted)]">
          <UsersRound className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
          <p className="font-semibold text-[var(--text-primary)]">No one is in this circle yet</p>
          <p className="mt-1 text-sm">Add from your accepted Connections.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2" role="list" aria-label={`${circle.name} members`}>
          {members.map(member => {
            const name = member.display_name || member.username || 'ShadowChat member'
            return (
              <article key={member.id} role="listitem" className="flex min-w-0 flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-3">
                <PersonAvatar person={member} />
                <div className="min-w-[7rem] flex-1"><p className="break-words font-semibold text-[var(--text-primary)]">{name}</p>{member.username && <p className="truncate text-xs text-[var(--text-muted)]">@{member.username}</p>}</div>
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => onMessage(member)} aria-label={`Message ${name}`} className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-glow)] hover:text-[var(--theme-accent-readable)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"><MessageCircle className="h-4 w-4" /></button>
                  <button type="button" onClick={() => onRemove(member)} aria-label={`Remove ${name} from ${circle.name}`} className="inline-flex h-12 w-12 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-red-950/25 hover:text-red-100 focus:outline-none focus:ring-2 focus:ring-red-300"><UserMinus className="h-4 w-4" /></button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
