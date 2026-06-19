import type { AchievementBadgeUser } from '../../lib/achievementBadges'
import { getUserAchievementMedals } from './userAchievementMedals'

interface UserAchievementBadgesProps {
  user?: AchievementBadgeUser | null
  className?: string
}

export function UserAchievementBadges({ user, className }: UserAchievementBadgesProps) {
  if (!user) return null

  const medals = getUserAchievementMedals(user)

  return (
    <>
      {medals.map(medal => (
        <span key={medal.key} className="inline-flex">
          {medal.renderIcon(className)}
        </span>
      ))}
    </>
  )
}
