/**
 * The complete browser/API-safe projection of public.users.
 *
 * Keep this as the single TypeScript contract for every public profile select
 * and embedded users relationship. Authentication-only identity (email) and
 * the legacy full_name column are deliberately excluded.
 */
export const PUBLIC_PROFILE_COLUMNS = [
  'id',
  'username',
  'display_name',
  'avatar_url',
  'avatar_thumbnail_url',
  'avatar_thumbnail_path',
  'banner_url',
  'banner_thumbnail_url',
  'banner_thumbnail_path',
  'status',
  'status_message',
  'presence_visibility',
  'color',
  'chat_color',
  'admin_role',
  'checkers_crown',
  'war_sword',
  'shadow_pin_gold_pin',
  'shadow_runner_sprint_medal',
  'shadow_runner_knight_medal',
  'shadow_runner_knight_level_id',
  'gold_easter_egg',
  'dm_discoverable',
  'last_active',
  'created_at',
  'updated_at',
] as const

export const PUBLIC_PROFILE_SELECT = PUBLIC_PROFILE_COLUMNS.join(', ')

export const pickPublicProfile = (value: Record<string, unknown>) =>
  Object.fromEntries(
    PUBLIC_PROFILE_COLUMNS.map(column => [column, value[column]])
  ) as Record<(typeof PUBLIC_PROFILE_COLUMNS)[number], unknown>

export const embedPublicProfile = (alias: string, relationship: string) =>
  `${alias}:${relationship}(${PUBLIC_PROFILE_SELECT})`
