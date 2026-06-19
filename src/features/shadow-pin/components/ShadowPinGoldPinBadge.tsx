import { cn } from '../../../lib/utils'
import { ACHIEVEMENT_MEDAL_ASSETS, type AchievementMedalIconVariant } from '../../../lib/achievementMedalAssets'

interface ShadowPinGoldPinBadgeProps {
  active?: boolean | null
  className?: string
  variant?: AchievementMedalIconVariant
}

export function ShadowPinGoldPinBadge({ active, className, variant = 'inline' }: ShadowPinGoldPinBadgeProps) {
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
      <img
        src={ACHIEVEMENT_MEDAL_ASSETS.shadowPinGoldPin[variant]}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-full w-full select-none object-contain"
      />
    </span>
  )
}
