import { SHADOW_RUNNER_ASSETS } from '../assets/manifest'
import { cn } from '../../../../lib/utils'

interface ShadowRunnerSprintBadgeProps {
  active?: boolean | null
  className?: string
}

export function ShadowRunnerSprintBadge({ active, className }: ShadowRunnerSprintBadgeProps) {
  if (!active) return null

  return (
    <span
      className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle', className)}
      title="Shadow Runner runner"
      aria-label="Shadow Runner runner"
    >
      <img src={SHADOW_RUNNER_ASSETS.badges.sprintTransparent} alt="" className="h-full w-full" />
    </span>
  )
}
