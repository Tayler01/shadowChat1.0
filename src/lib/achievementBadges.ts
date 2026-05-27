import type { AdminRole } from './supabase'

export interface AchievementBadgeUser {
  admin_role?: AdminRole | null
  checkers_crown?: boolean | null
  war_sword?: boolean | null
  shadow_pin_gold_pin?: boolean | null
  gold_easter_egg?: boolean | null
}

export const shouldShowLegacyAchievementBadges = (user?: AchievementBadgeUser | null) =>
  user?.admin_role !== 'admin'
