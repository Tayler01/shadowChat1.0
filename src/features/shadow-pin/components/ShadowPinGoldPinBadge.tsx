import { Pin } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface ShadowPinGoldPinBadgeProps {
  active?: boolean | null
  className?: string
}

export function ShadowPinGoldPinBadge({ active, className }: ShadowPinGoldPinBadgeProps) {
  if (!active) return null

  return (
    <span
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle text-[var(--theme-accent-strong)] drop-shadow-[0_0_8px_rgba(var(--theme-accent-strong-rgb),0.42)]',
        className
      )}
      title="Shadow Pin top scorer"
      aria-label="Shadow Pin top scorer"
    >
      <Pin className="h-3.5 w-3.5 -rotate-12 fill-[var(--theme-accent)] stroke-[2.4]" />
    </span>
  )
}
