import { ShieldOff } from 'lucide-react'
import { useBlockedUsers } from '../../hooks/useBlockedUsers'
import { Avatar } from '../ui/Avatar'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { BlockUserControl } from '../profile/BlockUserControl'

export function BlockedUsersSettings() {
  const { entries, loading } = useBlockedUsers()

  return (
    <section className="glass-panel rounded-[var(--radius-lg)] p-5" aria-labelledby="blocked-users-title">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(215,170,70,0.2)] bg-[rgba(215,170,70,0.08)] text-[var(--text-gold)]">
          <ShieldOff className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 id="blocked-users-title" className="text-lg font-semibold text-[var(--text-primary)]">
            Blocked users
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
            Blocked pairs cannot find each other, exchange DMs, see each other in General Chat or presence, or receive each other's notifications. Existing DM data stays saved and returns if you unblock.
          </p>
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <div className="mt-5 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] px-4 py-4 text-sm text-[var(--text-muted)]">
          <LoadingSpinner size="sm" />
          Loading blocked users...
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-5 rounded-[var(--radius-md)] border border-dashed border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] px-4 py-4 text-sm text-[var(--text-muted)]">
          You have not blocked anyone.
        </p>
      ) : (
        <ul className="mt-5 space-y-2" aria-label="Blocked users">
          {entries.map(entry => (
            <li
              key={entry.user.id}
              className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-3 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar
                  src={entry.user.avatar_thumbnail_url || entry.user.avatar_url}
                  alt={entry.user.display_name || entry.user.username || 'Blocked user'}
                  size="sm"
                  color={entry.user.color}
                  loading="lazy"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--text-primary)]">
                    {entry.user.display_name || entry.user.username || 'Blocked user'}
                  </p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    @{entry.user.username || 'unknown'}
                  </p>
                </div>
              </div>
              <BlockUserControl user={entry.user} blockedByMe compact />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

