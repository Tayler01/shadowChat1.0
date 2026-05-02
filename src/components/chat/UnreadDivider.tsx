import { cn } from '../../lib/utils'

interface UnreadDividerProps {
  className?: string
}

export function UnreadDivider({ className }: UnreadDividerProps) {
  return (
    <div className={cn('my-3 flex items-center gap-3', className)}>
      <hr className="flex-grow border-t border-[rgba(148,163,184,0.22)]" />
      <span className="rounded-full border border-[rgba(148,163,184,0.22)] bg-[rgba(255,255,255,0.035)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
        Unread
      </span>
      <hr className="flex-grow border-t border-[rgba(148,163,184,0.22)]" />
    </div>
  )
}
