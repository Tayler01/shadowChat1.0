import React, { useEffect, useRef, useState } from 'react'
import { Users } from 'lucide-react'
import { useActiveUsers } from '../../hooks/usePresence'
import { Avatar } from '../ui/Avatar'
import { ClientResetIndicator } from '../ui/ClientResetIndicator'
import type { ClientResetStatus } from '../../hooks/useClientResetStatus'

interface ActiveUsersButtonProps {
  resetStatus: ClientResetStatus
}

export function ActiveUsersButton({ resetStatus }: ActiveUsersButtonProps) {
  const activeUsers = useActiveUsers()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:border-[rgba(215,170,70,0.28)] hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[rgba(215,170,70,0.28)]"
        aria-label={`${activeUsers.length} active users`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Users className="h-4 w-4" />
        <span className="min-w-[1.1rem] rounded-full border border-[rgba(215,170,70,0.24)] bg-[rgba(215,170,70,0.1)] px-1.5 text-center text-[10px] font-semibold leading-5 text-[var(--text-gold)]">
          {activeUsers.length}
        </span>
        <ClientResetIndicator status={resetStatus} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Active users"
          className="popup-surface absolute right-0 top-full z-[80] mt-2 w-64 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] shadow-[var(--shadow-panel-strong)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Active now
            </span>
            <span className="rounded-full border border-[rgba(34,197,94,0.22)] bg-[rgba(34,197,94,0.08)] px-2 py-0.5 text-[11px] text-[#86efac]">
              {activeUsers.length}
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto py-1">
            {activeUsers.length === 0 ? (
              <div className="px-4 py-5 text-sm text-[var(--text-muted)]">
                No tracked users are active right now.
              </div>
            ) : (
              activeUsers.map(user => (
                <div
                  key={user.user_id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <Avatar
                    src={user.avatar_url || undefined}
                    alt={user.display_name || user.username || 'Active user'}
                    size="sm"
                    color={user.color || undefined}
                    userId={user.user_id}
                    presenceState="online"
                    showStatus
                  />
                  <span className="min-w-0 truncate text-sm font-medium text-[var(--text-primary)]">
                    {user.display_name || user.username || 'Unknown user'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
