import { readFileSync } from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260713235745_inner_circles_foundation.sql'
)
const sql = readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase()
const verifier = readFileSync(
  path.join(process.cwd(), 'scripts/verify-supabase-security-contract.mjs'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()
const allowlist = JSON.parse(readFileSync(
  path.join(process.cwd(), 'supabase/security-definer-allowlist.json'),
  'utf8'
)) as {
  unexposed_security_definers: string[]
  required_active_table_privileges: string[]
}

describe('Inner Circles SQL contract', () => {
  test('stores owner-private circles and member identities with 10/50 bounds', () => {
    expect(sql).toContain('create table public.inner_circles')
    expect(sql).toContain('create table public.inner_circle_members')
    expect(sql).toContain('primary key (circle_id, member_id)')
    expect(sql).toContain('member_id uuid not null references public.users(id) on delete cascade')
    expect(sql).not.toMatch(/inner_circle_members[\s\S]*connection_id uuid/)
    expect(sql).toContain('owned_circle_count >= 10')
    expect(sql).toContain('current_member_count >= 50')
    expect(sql).toContain('unique (owner_id, name_key)')
  })

  test('gives browser roles no table authority or raw Realtime graph', () => {
    expect(sql).toContain('alter table public.inner_circles enable row level security')
    expect(sql).toContain('alter table public.inner_circle_members enable row level security')
    expect(sql).toMatch(/revoke all on table public\.inner_circles from public, anon, authenticated, service_role/)
    expect(sql).toMatch(/revoke all on table public\.inner_circle_members from public, anon, authenticated, service_role/)
    expect(sql).not.toMatch(/grant (?:select|insert|update|delete).*inner_circle(?:s|_members) to authenticated/)
    expect(sql).not.toMatch(/alter publication supabase_realtime[\s\S]*inner_circle/)
    expect(allowlist.required_active_table_privileges).toEqual(expect.arrayContaining([
      'service_role:inner_circles:SELECT',
      'service_role:inner_circle_members:SELECT',
    ]))
  })

  test('uses invoker wrappers and reviewed unexposed implementations', () => {
    for (const publicFunction of [
      'public.list_my_inner_circles',
      'public.list_my_inner_circle_members',
      'public.mutate_my_inner_circle',
      'public.mutate_my_inner_circle_member',
      'public.set_my_inner_circle_members',
      'public.list_my_shadow_pin_circle_feed',
      'public.get_my_shadow_pin_circle_feed_window',
    ]) {
      expect(sql).toMatch(new RegExp(`function ${publicFunction.replace('.', '\\.')}[\\s\\S]*?security invoker`, 'i'))
    }

    for (const signature of [
      'inner_circles_private.get_my_shadow_pin_circle_feed_window_impl(uuid,uuid)',
      'inner_circles_private.list_my_inner_circle_members_impl(uuid)',
      'inner_circles_private.list_my_inner_circles_impl()',
      'inner_circles_private.list_my_shadow_pin_circle_feed_impl(uuid,integer,timestamp with time zone,uuid)',
      'inner_circles_private.mutate_my_inner_circle_impl(uuid,text,text,integer)',
      'inner_circles_private.mutate_my_inner_circle_member_impl(uuid,uuid,text)',
      'inner_circles_private.set_my_inner_circle_members_impl(uuid,uuid[])',
      'inner_circles_private.teardown_pair_memberships()',
    ]) {
      expect(allowlist.unexposed_security_definers).toContain(signature)
    }

    expect(verifier).toContain("'inner_circles_private'")
    expect(sql).toMatch(/security definer set search_path = ''/)
  })

  test('supports an atomic bounded member-set Save with deterministic pair locking', () => {
    expect(sql).toContain('create function public.set_my_inner_circle_members')
    expect(sql).toContain('create function inner_circles_private.set_my_inner_circle_members_impl')
    expect(sql).toContain('cardinality(normalized_member_ids) > 50')
    expect(sql).toContain('one or more connections are unavailable for this inner circle')
    expect(sql).toContain('order by candidates.member_id')
    expect(sql).toContain('current_member_ids = normalized_member_ids')
    expect(sql).toContain('not (memberships.member_id = any(normalized_member_ids))')
    expect(sql).toContain('set revision = circles.revision + 1')
  })

  test('hard-removes both membership directions when a Connection ends or is blocked', () => {
    expect(sql).toMatch(/function inner_circles_private\.teardown_pair_memberships\(\)[\s\S]*delete from public\.inner_circle_members/)
    expect(sql).toContain('circles.owner_id = first_user_id and memberships.member_id = second_user_id')
    expect(sql).toContain('circles.owner_id = second_user_id and memberships.member_id = first_user_id')
    expect(sql).toContain("old.status = 'accepted' and new.status <> 'accepted'")
    expect(sql).toContain('after delete on public.user_connections')
    expect(sql).toContain('after insert on public.user_blocks')
    expect(sql).toContain('private.users_are_connected(circle_owner_id, new.member_id)')
    expect(sql).toContain('pg_advisory_xact_lock')
  })

  test('circle feed only narrows current Connection eligibility with keyset and target windows', () => {
    expect(sql).toContain('private.users_are_connected(caller_id, memberships.member_id)')
    expect(sql).toContain('(images.created_at, images.id) < (before_created_at, before_id)')
    expect(sql).toContain('order by images.created_at desc, images.id desc')
    expect(sql).toContain('limit bounded_limit + 1')
    expect(sql).toContain('cross join lateral')
    expect(sql).toContain("'newer'::text as window_position")
    expect(sql).toContain("'target'::text")
    expect(sql).toContain("'older'::text as window_position")
    expect(sql).toContain('images.deleted_at is null')
    expect(sql).toContain('categories.deleted_at is null')
    expect(sql).toContain("images.processing_status = 'ready'")
  })
})
