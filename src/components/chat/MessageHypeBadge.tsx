import { useState } from 'react'
import { cn } from '../../lib/utils'

export function MessageHypeBadge({
  count = 0,
  users = [],
  className = '',
}: {
  count?: number
  users?: Array<{ user_id?: string; display_name?: string; username?: string | null }>
  className?: string
}) {
  const [open, setOpen] = useState(false)
  if (count <= 0) return null

  const names = users
    .map(user => user.display_name || user.username)
    .filter(Boolean) as string[]
  const title = names.length
    ? `Hyped by ${names.join(', ')}`
    : `${count} Hype${count === 1 ? '' : 's'}`

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="hype-message-chip"
        onClick={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        aria-label={title}
        title={title}
      >
        <span aria-hidden="true">{'\u{1F389}'}</span>
        <span>{count}</span>
      </button>
      {open && names.length > 0 && (
        <span className="glass-panel-strong absolute right-0 top-full z-30 mt-1 min-w-40 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-xs text-[var(--text-secondary)] shadow-[var(--shadow-panel-strong)]">
          <span className="mb-1 block font-semibold text-[var(--theme-accent-readable)]">Hyped by</span>
          {names.slice(0, 8).map(name => (
            <span key={name} className="block truncate">{name}</span>
          ))}
          {names.length < count && (
            <span className="mt-1 block text-[var(--text-muted)]">and {count - names.length} more</span>
          )}
        </span>
      )}
    </span>
  )
}
