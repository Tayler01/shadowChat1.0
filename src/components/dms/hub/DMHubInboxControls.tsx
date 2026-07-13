import { Plus, Search, UserPlus, X } from 'lucide-react'
import { cn } from '../../../lib/utils'

export type DMHubInboxMode = 'inbox' | 'unread' | 'archived'

type DMHubInboxControlsProps = {
  query: string
  onQueryChange: (query: string) => void
  mode: DMHubInboxMode
  onModeChange: (mode: DMHubInboxMode) => void
  counts?: Partial<Record<DMHubInboxMode, number>>
  disabled?: boolean
  searchInputRef?: React.Ref<HTMLInputElement>
  onStartConversation?: () => void
  onOpenConnections?: () => void
  connectionRequestCount?: number
}

const modes: Array<{ id: DMHubInboxMode; label: string }> = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'unread', label: 'Unread' },
  { id: 'archived', label: 'Archived' },
]

export function DMHubInboxControls({
  query,
  onQueryChange,
  mode,
  onModeChange,
  counts,
  disabled = false,
  searchInputRef,
  onStartConversation,
  onOpenConnections,
  connectionRequestCount = 0,
}: DMHubInboxControlsProps) {
  return (
    <section className="border-b border-[var(--border-panel)] px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] sm:px-4 md:pt-2" aria-label="Direct message inbox controls">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <label htmlFor="dm-hub-inbox-search" className="sr-only">Search conversations</label>
          <input
            ref={searchInputRef}
            id="dm-hub-inbox-search"
            type="search"
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Search conversations"
            autoComplete="off"
            disabled={disabled}
            className="obsidian-input h-12 w-full rounded-2xl pl-11 pr-12 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none disabled:cursor-wait disabled:opacity-60"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              disabled={disabled}
              aria-label="Clear conversation search"
              className="absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center rounded-2xl text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--theme-focus-ring)] disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {onOpenConnections && (
          <button
            type="button"
            onClick={onOpenConnections}
            className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] text-[var(--text-secondary)] transition-[border-color,background-color,color] hover:border-[var(--border-glow)] hover:bg-[var(--theme-accent-soft)] hover:text-[var(--theme-accent-readable)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
            aria-label={`Open Connections${connectionRequestCount > 0 ? `, ${connectionRequestCount} pending request${connectionRequestCount === 1 ? '' : 's'}` : ''}`}
          >
            <UserPlus className="h-5 w-5" />
            {connectionRequestCount > 0 && (
              <span aria-hidden="true" className="theme-unread-badge absolute -right-1 -top-1 min-w-5 rounded-full px-1 text-center text-[0.625rem] leading-5">
                {connectionRequestCount > 99 ? '99+' : connectionRequestCount}
              </span>
            )}
          </button>
        )}
        {onStartConversation && (
          <button
            type="button"
            onClick={onStartConversation}
            className="theme-floating-action inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full md:hidden"
            aria-label="Start new conversation"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)] p-1" role="group" aria-label="Conversation mode">
        {modes.map(item => {
          const selected = item.id === mode
          const count = counts?.[item.id]
          const countLabel = typeof count === 'number' ? `, ${count}` : ''

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onModeChange(item.id)}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`${item.label}${countLabel}`}
              className={cn(
                'inline-flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition-[background-color,border-color,color,box-shadow] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] disabled:opacity-50',
                selected
                  ? 'border border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)] shadow-[var(--shadow-panel)]'
                  : 'border border-transparent text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]'
              )}
            >
              <span className="truncate">{item.label}</span>
              {typeof count === 'number' && (
                <span className={cn(
                  'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[0.65rem] leading-4',
                  selected ? 'bg-[rgba(var(--theme-accent-rgb),0.16)]' : 'bg-[rgba(255,255,255,0.06)]'
                )} aria-hidden="true">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
