import { readFileSync } from 'node:fs'
import path from 'node:path'

const originalSql = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260717233421_notification_destination_badges.sql'
  ),
  'utf8'
)
const hardeningSql = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260805112141_harden_web_notification_recovery.sql'
  ),
  'utf8'
)
const sql = `${originalSql}\n${hardeningSql}`.replace(/\s+/g, ' ').toLowerCase()

describe('notification destination badge database contract', () => {
  test('derives Play from unread canonical events instead of active source rows alone', () => {
    expect(sql).toContain('create or replace function public.get_app_badge_state_v2(')
    expect(sql).toContain("events.type = 'shadow_checkers_turn'")
    expect(sql).toContain("events.category = 'live'")
    expect(sql).toContain('events.read_at is null')
    expect(sql).toContain('events.resolved_at is null')
    expect(sql).toContain("'game_destinations', game_destinations")
    expect(sql).not.toMatch(/into games_count from public\.shadow_checkers_matches/)
  })

  test('rehydrates ShadowPin destinations from current visible source rows', () => {
    expect(sql).toContain('join public.shadow_pin_images images')
    expect(sql).toContain('join public.shadow_pin_categories categories')
    expect(sql).toContain('images.deleted_at is null')
    expect(sql).toContain('categories.deleted_at is null')
    expect(sql).toContain("'shadow_pin_destinations', pin_destinations")
    expect(sql).toContain("'post_event_ids', grouped.post_event_ids")
    expect(sql).toContain("'discussion_event_ids', grouped.discussion_event_ids")
  })

  test('keeps owner isolation and the existing reviewed RPC signature', () => {
    expect(sql).toContain('target_user_id is distinct from caller_user_id')
    expect(sql).toContain(
      'grant execute on function public.get_app_badge_state_v2(uuid) to authenticated, service_role'
    )
    expect(sql).toContain('on conflict (dedupe_key) do nothing')
  })

  test('loads reciprocal block ids once instead of calling the block RPC per unread row', () => {
    const latestDefinition = sql.slice(sql.lastIndexOf(
      'create or replace function public.get_app_badge_state_v2('
    ))
    expect(latestDefinition).toContain("blocked_user_ids uuid[] := '{}'::uuid[]")
    expect(latestDefinition).toContain('select blocks.blocked_id as user_id')
    expect(latestDefinition).toContain('select blocks.blocker_id as user_id')
    expect(latestDefinition).toContain('not (events.actor_id = any(blocked_user_ids))')
    expect(latestDefinition).not.toContain('private.users_have_block')
  })
})
