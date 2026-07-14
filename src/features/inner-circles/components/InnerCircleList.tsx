import { CircleUserRound, LockKeyhole, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import type { InnerCircleSummary } from './types'

export function InnerCircleList({
  circles,
  onCreate,
  onOpen,
  onRename,
  onDelete,
  loading = false,
  error = null,
  onRetry,
  maxCircles = 10,
}: {
  circles: InnerCircleSummary[]
  onCreate: () => void
  onOpen: (circle: InnerCircleSummary) => void
  onRename: (circle: InnerCircleSummary) => void
  onDelete: (circle: InnerCircleSummary) => void
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  maxCircles?: number
}) {
  const atLimit = circles.length >= maxCircles

  return (
    <section className="min-w-0" aria-labelledby="inner-circles-heading">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 id="inner-circles-heading" className="font-semibold text-[var(--text-primary)]">Inner Circles</h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{circles.length} of {maxCircles} circles</p>
        </div>
        <Button type="button" size="sm" onClick={onCreate} disabled={atLimit || loading} aria-describedby={atLimit ? 'inner-circles-limit' : undefined}>
          <Plus className="mr-1.5 h-4 w-4" />New Circle
        </Button>
      </div>

      <div className="mt-3 flex gap-3 rounded-[var(--radius-lg)] border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] p-3 text-sm leading-5 text-[var(--text-secondary)]">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[var(--theme-accent-readable)]" aria-hidden="true" />
        <p>Only you can see your circles, their names, and who belongs to them. Members are never notified.</p>
      </div>

      {atLimit && <p id="inner-circles-limit" role="status" className="mt-2 text-xs text-[var(--text-muted)]">You have reached the {maxCircles}-circle limit.</p>}

      {loading && circles.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center text-sm text-[var(--text-muted)]" role="status">Loading circles</div>
      ) : error && circles.length === 0 ? (
        <div role="alert" className="mt-3 rounded-[var(--radius-lg)] border border-red-400/25 bg-red-950/20 p-4 text-sm text-red-100">
          <p>{error}</p>
          {onRetry && <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}
        </div>
      ) : circles.length === 0 ? (
        <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] px-5 py-8 text-center text-[var(--text-muted)]">
          <CircleUserRound className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
          <p className="font-semibold text-[var(--text-primary)]">Create your first Inner Circle</p>
          <p className="mt-1 text-sm leading-5">Privately organize the Connections you want to find quickly.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2" role="list" aria-label="Your Inner Circles">
          {error && <p role="status" className="rounded-[var(--radius-md)] border border-amber-300/20 bg-amber-950/15 px-3 py-2 text-xs text-amber-100">Could not refresh. Showing the last loaded circles.</p>}
          {circles.map(circle => (
            <article key={circle.id} role="listitem" className="flex min-w-0 items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-2">
              <button
                type="button"
                onClick={() => onOpen(circle)}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-md)] px-2 text-left focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
                aria-label={`Open ${circle.name}, ${circle.memberCount} ${circle.memberCount === 1 ? 'member' : 'members'}`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]"><CircleUserRound className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block break-words font-semibold text-[var(--text-primary)]">{circle.name}</span><span className="block text-xs text-[var(--text-muted)]">{circle.memberCount} {circle.memberCount === 1 ? 'member' : 'members'}</span></span>
              </button>
              <button type="button" onClick={() => onRename(circle)} aria-label={`Rename ${circle.name}`} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--theme-accent-soft)] hover:text-[var(--theme-accent-readable)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"><Pencil className="h-4 w-4" /></button>
              <button type="button" onClick={() => onDelete(circle)} aria-label={`Delete ${circle.name}`} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-red-950/25 hover:text-red-100 focus:outline-none focus:ring-2 focus:ring-red-300"><Trash2 className="h-4 w-4" /></button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
