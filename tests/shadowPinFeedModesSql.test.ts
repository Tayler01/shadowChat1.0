import { readFileSync } from 'node:fs'
import path from 'node:path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260713223200_shadow_pin_feed_modes.sql'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()

const securityVerifier = readFileSync(
  path.join(process.cwd(), 'scripts/verify-supabase-security-contract.mjs'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()

const allowlist = JSON.parse(readFileSync(
  path.join(process.cwd(), 'supabase/security-definer-allowlist.json'),
  'utf8'
)) as { unexposed_security_definers: string[] }

describe('ShadowPin Feed Modes SQL contract', () => {
  test('stores an owner-private account preference behind guarded invoker wrappers', () => {
    expect(migration).toContain('create table public.shadow_pin_feed_preferences')
    expect(migration).toContain("check (feed_mode in ('discover', 'connections'))")
    expect(migration).toContain('alter table public.shadow_pin_feed_preferences enable row level security')
    expect(migration).toMatch(/revoke all on table public\.shadow_pin_feed_preferences from public, anon, authenticated, service_role/)
    expect(migration).toMatch(/function public\.get_my_shadow_pin_feed_mode\(\)[\s\S]*security invoker/)
    expect(migration).toMatch(/function public\.set_my_shadow_pin_feed_mode\(target_mode text\)[\s\S]*security invoker/)
    expect(migration).toContain('revision = preferences.revision + 1')
  })

  test('filters Connections server-side through the canonical accepted and block predicates', () => {
    expect(migration).toContain("connections.status = 'accepted'")
    expect(migration).toContain('connections.member_low_id = caller_id')
    expect(migration).toContain('connections.member_high_id = caller_id')
    expect(migration).toContain('blocked_user_ids as materialized')
    expect(migration).toContain('where connections.creator_id <> caller_id')
    expect(migration).toContain('blocked.user_id is null')
    expect(migration).toContain('images.deleted_at is null')
    expect(migration).toContain('categories.deleted_at is null')
    expect(migration).toContain('blocked_category_owner.user_id = categories.creator_id')
    expect(migration).toContain("images.media_type = 'image'")
    expect(migration).toContain("images.processing_status = 'ready'")
    expect(migration).not.toMatch(/grant execute on function private\.users_are_connected[\s\S]*to authenticated/)
  })

  test('uses bounded tuple-keyset pagination and a deterministic target window', () => {
    expect(migration).toContain('(images.created_at, images.id) < (before_created_at, before_id)')
    expect(migration).toContain('order by images.created_at desc, images.id desc')
    expect(migration).toContain('limit bounded_limit + 1')
    expect(migration).toContain('cross join lateral')
    expect(migration).toContain("'newer'::text as window_position")
    expect(migration).toContain("'target'::text")
    expect(migration).toContain("'older'::text as window_position")
    expect(migration).toContain('shadow_pin_images_creator_connections_feed_idx')
    expect(migration).toContain('shadow_pin_images_protect_feed_identity')
    expect(migration).toContain('shadowpin image id and created_at are immutable')
  })

  test('keeps privileged implementations unexposed and security-manifest reviewed', () => {
    for (const signature of [
      'shadow_pin_private.get_my_connection_feed_window_impl(uuid)',
      'shadow_pin_private.get_my_feed_mode_impl()',
      'shadow_pin_private.list_my_connection_feed_impl(integer,timestamp with time zone,uuid)',
      'shadow_pin_private.set_my_feed_mode_impl(text)',
    ]) {
      expect(allowlist.unexposed_security_definers).toContain(signature)
    }
    expect(securityVerifier).toContain("'shadow_pin_private'")
    expect(migration).toMatch(/security definer set search_path = ''/)
    expect(migration).toMatch(/revoke all on schema shadow_pin_private from public, anon, authenticated/)
  })
})
