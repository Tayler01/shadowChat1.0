import { cn } from '../../../../lib/utils'
import { ACHIEVEMENT_MEDAL_ASSETS, type AchievementMedalIconVariant } from '../../../../lib/achievementMedalAssets'

interface ShadowRunnerSprintBadgeProps {
  active?: boolean | null
  className?: string
  variant?: AchievementMedalIconVariant
}

export function ShadowRunnerSprintBadge({ active, className, variant = 'inline' }: ShadowRunnerSprintBadgeProps) {
  if (!active) return null

  return (
    <span
      className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle', className)}
      title="Shadow Runner runner"
      aria-label="Shadow Runner runner"
    >
      <img
        src={ACHIEVEMENT_MEDAL_ASSETS.shadowRunnerSprint[variant]}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-full w-full select-none object-contain"
      />
    </span>
  )
}
