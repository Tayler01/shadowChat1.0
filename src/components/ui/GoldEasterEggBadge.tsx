import { cn } from '../../lib/utils'
import { ACHIEVEMENT_MEDAL_ASSETS, type AchievementMedalIconVariant } from '../../lib/achievementMedalAssets'

interface GoldEasterEggBadgeProps {
  active?: boolean | null
  className?: string
  variant?: AchievementMedalIconVariant
}

export function GoldEasterEggBadge({ active, className, variant = 'inline' }: GoldEasterEggBadgeProps) {
  if (!active) return null

  return (
    <span
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle text-[#f8d86c] drop-shadow-[0_0_9px_rgba(248,216,108,0.58)]',
        className
      )}
      title="Golden egg found"
      aria-label="Golden egg found"
    >
      <img
        src={ACHIEVEMENT_MEDAL_ASSETS.goldenEgg[variant]}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-full w-full select-none object-contain"
      />
    </span>
  )
}
