import { Check, Search, UsersRound } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/utils'
import { InnerCircleSheet } from './InnerCircleSheet'
import type { InnerCirclePerson } from './types'

export function InnerCircleMemberPickerSheet({
  open,
  circleName,
  connections,
  selectedMemberIds,
  query,
  onQueryChange,
  onToggleMember,
  onSave,
  onClose,
  pending = false,
  loading = false,
  saveDisabled = false,
  error = null,
  memberLimit = 50,
}: {
  open: boolean
  circleName: string
  connections: InnerCirclePerson[]
  selectedMemberIds: ReadonlySet<string>
  query: string
  onQueryChange: (query: string) => void
  onToggleMember: (member: InnerCirclePerson) => void
  onSave: () => void
  onClose: () => void
  pending?: boolean
  loading?: boolean
  saveDisabled?: boolean
  error?: string | null
  memberLimit?: number
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleConnections = normalizedQuery
    ? connections.filter(person => `${person.display_name} ${person.username}`.toLocaleLowerCase().includes(normalizedQuery))
    : connections
  const selectedCount = selectedMemberIds.size
  const atLimit = selectedCount >= memberLimit

  return (
    <InnerCircleSheet
      open={open}
      onClose={onClose}
      dismissible={!pending}
      title={`Add to ${circleName}`}
      eyebrow="Accepted Connections only"
      description={`${selectedCount} of ${memberLimit} members selected.`}
      testId="inner-circle-member-picker"
      className="sm:max-w-2xl"
      footer={(
        <div className="grid grid-cols-2 gap-3" data-testid="inner-circle-member-picker-footer">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={onSave} loading={pending} disabled={saveDisabled || loading}>Save Members</Button>
        </div>
      )}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
        <label htmlFor="inner-circle-member-search" className="sr-only">Search accepted Connections</label>
        <input
          id="inner-circle-member-search"
          type="search"
          value={query}
          onChange={event => onQueryChange(event.target.value.slice(0, 100))}
          placeholder="Search Connections"
          autoComplete="off"
          className="obsidian-input h-12 w-full min-w-0 rounded-2xl pl-11 pr-4 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
        />
      </div>

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {selectedCount} of {memberLimit} members selected
      </p>

      {atLimit && <p role="status" className="mt-2 text-xs text-[var(--text-muted)]">This circle has reached its {memberLimit}-member limit. Remove someone before adding another Connection.</p>}
      {error && <p role="alert" className="mt-3 rounded-[var(--radius-md)] border border-red-400/25 bg-red-950/20 p-3 text-sm text-red-100">{error}</p>}

      {loading ? (
        <div className="flex min-h-40 items-center justify-center text-sm text-[var(--text-muted)]" role="status">Loading accepted Connections</div>
      ) : visibleConnections.length === 0 ? (
        <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] px-5 py-8 text-center text-[var(--text-muted)]">
          <UsersRound className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
          <p className="font-semibold text-[var(--text-primary)]">{connections.length === 0 ? 'No accepted Connections yet' : 'No matching Connections'}</p>
          <p className="mt-1 text-sm">Only current, accepted Connections can belong to a circle.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2" role="list" aria-label="Accepted Connections">
          {visibleConnections.map(person => {
            const selected = selectedMemberIds.has(person.id)
            const disabled = pending || (!selected && atLimit)
            const name = person.display_name || person.username || 'ShadowChat member'
            return (
              <button
                key={person.id}
                type="button"
                role="checkbox"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onToggleMember(person)}
                className={cn(
                  'flex min-h-14 w-full min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border p-3 text-left transition-[background-color,border-color,color] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] disabled:cursor-not-allowed disabled:opacity-45',
                  selected ? 'border-[var(--theme-accent-border)] bg-[var(--theme-accent-soft)]' : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] hover:border-[var(--border-glow)]'
                )}
              >
                <span className="min-w-0 flex-1"><span className="block break-words font-semibold text-[var(--text-primary)]">{name}</span>{person.username && <span className="block truncate text-xs text-[var(--text-muted)]">@{person.username}</span>}</span>
                <span aria-hidden="true" className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border', selected ? 'border-[var(--theme-accent-border)] bg-[var(--theme-accent)] text-[var(--theme-accent-text)]' : 'border-[var(--border-subtle)] text-transparent')}><Check className="h-4 w-4" /></span>
              </button>
            )
          })}
        </div>
      )}
    </InnerCircleSheet>
  )
}
