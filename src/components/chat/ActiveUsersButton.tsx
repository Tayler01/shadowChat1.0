import { Users } from 'lucide-react'
import { useActiveUsers } from '../../hooks/usePresence'
import { ClientResetIndicator } from '../ui/ClientResetIndicator'
import type { ClientResetStatus } from '../../hooks/useClientResetStatus'

interface ActiveUsersButtonProps {
  resetStatus: ClientResetStatus
  onOpen: () => void
  variant?: 'compact' | 'nav'
  active?: boolean
}

export function ActiveUsersButton({
  resetStatus,
  onOpen,
  variant = 'compact',
  active = false,
}: ActiveUsersButtonProps) {
  const activeUsers = useActiveUsers()
  const countLabel = activeUsers.length > 99 ? '99+' : activeUsers.length

  return (
    <button
      type="button"
      onClick={onOpen}
      className={variant === 'nav'
        ? `shadowchat-mobile-nav-button flex h-full min-h-11 w-full flex-col items-center justify-center rounded-[var(--radius-md)] px-0.5 py-1.5 text-[0.625rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-accent)] ${active ? 'bg-[var(--nav-active-bg)] text-[var(--theme-accent-readable)] shadow-[var(--shadow-accent-soft)]' : 'text-[var(--text-muted)]'}`
        : 'inline-flex min-h-7 items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[rgba(215,170,70,0.28)] hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(215,170,70,0.28)] sm:min-h-8 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs'}
      aria-label={`${activeUsers.length} active users`}
      aria-current={active ? 'page' : undefined}
    >
      {variant === 'nav' ? (
        <>
          <span className="relative mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-icon-bg)]">
            <Users className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
            <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-panel-strong)] bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.7)]" aria-hidden="true" />
            <span className="theme-unread-badge absolute -right-1 -top-1 rounded-full px-1 text-[0.625rem] leading-none" aria-hidden="true">
              {countLabel}
            </span>
          </span>
          <span>Active</span>
        </>
      ) : (
        <>
          <span className="relative">
            <Users className="h-4 w-4" aria-hidden="true" />
            <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[#22c55e] shadow-[0_0_7px_rgba(34,197,94,0.75)]" aria-hidden="true" />
          </span>
          <span className="min-w-[1rem] rounded-full border border-[rgba(215,170,70,0.24)] bg-[rgba(215,170,70,0.1)] px-1.5 text-center text-[10px] font-semibold leading-4 text-[var(--text-gold)]">
            {countLabel}
          </span>
          <ClientResetIndicator status={resetStatus} />
        </>
      )}
    </button>
  )
}
