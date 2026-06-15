import type { AdminRole } from './supabase'

export interface AchievementBadgeUser {
  admin_role?: AdminRole | null
  checkers_crown?: boolean | null
  war_sword?: boolean | null
  shadow_pin_gold_pin?: boolean | null
  shadow_runner_sprint_medal?: boolean | null
  shadow_runner_knight_medal?: boolean | null
  shadow_runner_knight_level_id?: string | null
  gold_easter_egg?: boolean | null
}

export const shouldShowLegacyAchievementBadges = (user?: AchievementBadgeUser | null) =>
  user?.admin_role !== 'admin'
