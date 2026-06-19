import type { ReactNode } from 'react'
import { CheckersCrownBadge } from '../../features/games/shadow-checkers/components/CheckersCrownBadge'
import { ShadowRunnerKnightBadge } from '../../features/games/shadow-runner/components/ShadowRunnerKnightBadge'
import { ShadowRunnerSprintBadge } from '../../features/games/shadow-runner/components/ShadowRunnerSprintBadge'
import { ShadowWarSwordBadge } from '../../features/games/shadow-war/components/ShadowWarSwordBadge'
import { ShadowPinGoldPinBadge } from '../../features/shadow-pin/components/ShadowPinGoldPinBadge'
import {
  shouldShowLegacyAchievementBadges,
  type AchievementBadgeUser,
} from '../../lib/achievementBadges'
import { GoldEasterEggBadge } from './GoldEasterEggBadge'

export interface UserAchievementMedal {
  key: string
  name: string
  detail: string
  earnedText: string
  renderIcon: (className?: string) => ReactNode
}

interface UserAchievementMedalDefinition extends UserAchievementMedal {
  legacy?: boolean
  isActive: (user: AchievementBadgeUser) => boolean | null | undefined
}

const ACHIEVEMENT_MEDAL_DEFINITIONS: UserAchievementMedalDefinition[] = [
  {
    key: 'checkers-crown',
    name: 'Shadow Checkers Crown',
    detail: 'Current Shadow Checkers champion medal.',
    earnedText: 'Earned by holding the top Shadow Checkers champion slot.',
    legacy: true,
    isActive: user => user.checkers_crown,
    renderIcon: className => <CheckersCrownBadge active className={className} />,
  },
  {
    key: 'shadow-war-sword',
    name: 'Shadow War Sword',
    detail: 'Current Shadow War champion medal.',
    earnedText: 'Earned by holding the top Shadow War champion slot.',
    legacy: true,
    isActive: user => user.war_sword,
    renderIcon: className => <ShadowWarSwordBadge active className={className} />,
  },
  {
    key: 'shadow-pin-gold-pin',
    name: 'Shadow Pin Gold Pin',
    detail: 'Current hidden ShadowPin top scorer medal.',
    earnedText: 'Earned by leading the hidden ShadowPin activity score.',
    legacy: true,
    isActive: user => user.shadow_pin_gold_pin,
    renderIcon: className => <ShadowPinGoldPinBadge active className={className} />,
  },
  {
    key: 'shadow-runner-sprint',
    name: 'Shadow Runner Sprint Medal',
    detail: 'Shadow Runner tutorial completion medal.',
    earnedText: 'Earned by completing the tutorial route.',
    isActive: user => user.shadow_runner_sprint_medal,
    renderIcon: className => <ShadowRunnerSprintBadge active className={className} />,
  },
  {
    key: 'shadow-runner-knight',
    name: 'Shadow Runner Knight Medal',
    detail: 'Hardest-route Shadow Runner medal.',
    earnedText: 'Earned by completing the currently hardest available campaign route.',
    isActive: user => user.shadow_runner_knight_medal,
    renderIcon: className => <ShadowRunnerKnightBadge active className={className} />,
  },
  {
    key: 'golden-egg',
    name: 'Golden Egg Medal',
    detail: 'Permanent discovery medal.',
    earnedText: 'Earned by finding the mobile-only golden egg.',
    isActive: user => user.gold_easter_egg,
    renderIcon: className => <GoldEasterEggBadge active className={className} />,
  },
]

export const getUserAchievementMedals = (user?: AchievementBadgeUser | null): UserAchievementMedal[] => {
  if (!user) return []

  const showLegacyBadges = shouldShowLegacyAchievementBadges(user)

  return ACHIEVEMENT_MEDAL_DEFINITIONS
    .filter(medal => (!medal.legacy || showLegacyBadges) && Boolean(medal.isActive(user)))
    .map(({ isActive, legacy, ...medal }) => medal)
}
