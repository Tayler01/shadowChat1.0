import { cn } from '../../../../lib/utils'
import { ACHIEVEMENT_MEDAL_ASSETS, type AchievementMedalIconVariant } from '../../../../lib/achievementMedalAssets'

interface ShadowRunnerKnightBadgeProps {
  active?: boolean | null
  className?: string
  variant?: AchievementMedalIconVariant
}

export function ShadowRunnerKnightBadge({ active, className, variant = 'inline' }: ShadowRunnerKnightBadgeProps) {
  if (!active) return null

  return (
    <span
      className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle', className)}
      title="Shadow Runner knight"
      aria-label="Shadow Runner knight"
    >
      <img
        src={ACHIEVEMENT_MEDAL_ASSETS.shadowRunnerKnight[variant]}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-full w-full select-none object-contain"
      />
    </span>
  )
}
