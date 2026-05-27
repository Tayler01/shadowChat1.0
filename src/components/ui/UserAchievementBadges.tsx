import { CheckersCrownBadge } from '../../features/games/shadow-checkers/components/CheckersCrownBadge'
import { ShadowWarSwordBadge } from '../../features/games/shadow-war/components/ShadowWarSwordBadge'
import { ShadowPinGoldPinBadge } from '../../features/shadow-pin/components/ShadowPinGoldPinBadge'
import {
  shouldShowLegacyAchievementBadges,
  type AchievementBadgeUser,
} from '../../lib/achievementBadges'
import { GoldEasterEggBadge } from './GoldEasterEggBadge'

interface UserAchievementBadgesProps {
  user?: AchievementBadgeUser | null
  className?: string
}

export function UserAchievementBadges({ user, className }: UserAchievementBadgesProps) {
  if (!user) return null

  const showLegacyBadges = shouldShowLegacyAchievementBadges(user)

  return (
    <>
      {showLegacyBadges && (
        <>
          <CheckersCrownBadge active={user.checkers_crown} className={className} />
          <ShadowWarSwordBadge active={user.war_sword} className={className} />
          <ShadowPinGoldPinBadge active={user.shadow_pin_gold_pin} className={className} />
        </>
      )}
      <GoldEasterEggBadge active={user.gold_easter_egg} className={className} />
    </>
  )
}
