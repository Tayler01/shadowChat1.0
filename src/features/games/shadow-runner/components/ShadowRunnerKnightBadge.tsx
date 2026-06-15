import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import { cn } from '../../../../lib/utils'

interface ShadowRunnerKnightBadgeProps {
  active?: boolean | null
  className?: string
}

export function ShadowRunnerKnightBadge({ active, className }: ShadowRunnerKnightBadgeProps) {
  if (!active) return null

  return (
    <span
      className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle', className)}
      title="Shadow Runner knight"
      aria-label="Shadow Runner knight"
    >
      <img src={SHADOW_RUNNER_ASSETS.badges.mainMedal} alt="" className="h-full w-full" />
    </span>
  )
}
