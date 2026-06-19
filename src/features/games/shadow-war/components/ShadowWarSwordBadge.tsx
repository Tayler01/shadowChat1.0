import { cn } from '../../../../lib/utils'
import { ACHIEVEMENT_MEDAL_ASSETS, type AchievementMedalIconVariant } from '../../../../lib/achievementMedalAssets'

interface ShadowWarSwordBadgeProps {
  active?: boolean | null
  className?: string
  variant?: AchievementMedalIconVariant
}

export function ShadowWarSwordBadge({ active, className, variant = 'inline' }: ShadowWarSwordBadgeProps) {
  if (!active) return null

  return (
    <span
      className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle', className)}
      title="Shadow War champion"
      aria-label="Shadow War champion"
    >
      <img
        src={ACHIEVEMENT_MEDAL_ASSETS.shadowWarSword[variant]}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-full w-full select-none object-contain"
      />
    </span>
  )
}
