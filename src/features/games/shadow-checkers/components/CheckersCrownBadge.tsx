import { CHECKERS_CROWN_BADGE } from '../assets/manifest'
import { cn } from '../../../../lib/utils'

interface CheckersCrownBadgeProps {
  active?: boolean | null
  className?: string
}

export function CheckersCrownBadge({ active, className }: CheckersCrownBadgeProps) {
  if (!active) return null

  return (
    <span
      className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle', className)}
      title="Shadow Checkers champion"
      aria-label="Shadow Checkers champion"
    >
      <img src={CHECKERS_CROWN_BADGE} alt="" className="h-full w-full" />
    </span>
  )
}
