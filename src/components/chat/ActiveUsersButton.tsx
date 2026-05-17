import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
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

  const activeUsersPopup = open ? (
    <div
      ref={popupRef}
      role="dialog"
      aria-label="Active users"
      className="popup-surface fixed left-1/2 top-[calc(env(safe-area-inset-top)_+_4.75rem)] z-[90] w-64 -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] shadow-[var(--shadow-panel-strong)]"
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
  ) : null

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="inline-flex min-h-7 items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[rgba(215,170,70,0.28)] hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[rgba(215,170,70,0.28)] sm:min-h-8 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs"
        aria-label={`${activeUsers.length} active users`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Users className="h-4 w-4" />
        <span className="min-w-[1rem] rounded-full border border-[rgba(215,170,70,0.24)] bg-[rgba(215,170,70,0.1)] px-1.5 text-center text-[10px] font-semibold leading-4 text-[var(--text-gold)]">
          {activeUsers.length}
        </span>
        <ClientResetIndicator status={resetStatus} />
      </button>

      {activeUsersPopup && (typeof document === 'undefined' ? activeUsersPopup : createPortal(activeUsersPopup, document.body))}
    </div>
  )
}
