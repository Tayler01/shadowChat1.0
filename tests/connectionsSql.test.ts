import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260713190000_connections_foundation.sql'
)
const sql = fs.readFileSync(migrationPath, 'utf8')
const allowlist = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'supabase', 'security-definer-allowlist.json'),
  'utf8'
)) as {
  private_security_definers: string[]
  unexposed_security_definers: string[]
  required_active_table_privileges: string[]
}
const verifier = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'verify-supabase-security-contract.mjs'),
  'utf8'
)

describe('Connections database contract', () => {
  test('stores one canonical reciprocal pair with a revisioned retained lifecycle', () => {
    expect(sql).toMatch(/create table public\.user_connections/i)
    expect(sql).toMatch(/check \(member_low_id < member_high_id\)/i)
    expect(sql).toMatch(/unique \(member_low_id, member_high_id\)/i)
    expect(sql).toContain("CHECK (status IN ('pending', 'accepted', 'inactive'))")
    expect(sql).toMatch(/revision integer not null default 1 check \(revision > 0\)/i)
    expect(sql).toMatch(/user_connections_status_timestamps_check/i)
    expect(sql).toMatch(/user_connections_outgoing_pending_idx[\s\S]*where status = 'pending'/i)
  })

  test('gives browser roles no direct connection-table authority or Realtime publication', () => {
    expect(sql).toMatch(/alter table public\.user_connections enable row level security/i)
    expect(sql).toMatch(/revoke all on table public\.user_connections[\s\S]*from public, anon, authenticated, service_role/i)
    expect(sql).toMatch(/grant select on table public\.user_connections to service_role/i)
    expect(sql).not.toMatch(/grant (?:select|insert|update|delete).*user_connections to authenticated/i)
    expect(sql).not.toMatch(/alter publication supabase_realtime[\s\S]*user_connections/i)
    expect(allowlist.required_active_table_privileges).toContain('service_role:user_connections:SELECT')
  })

  test('keeps public APIs invoker-only and privileged implementations unexposed', () => {
    for (const signature of [
      'public.get_my_connection_state',
      'public.get_my_connection_summary',
      'public.list_my_connections',
      'public.mutate_connection',
    ]) {
      expect(sql).toMatch(new RegExp(`function ${signature.replace('.', '\\.')}[\\s\\S]*?security invoker`, 'i'))
    }
    expect(sql).toMatch(/create schema if not exists connections_private/i)
    expect(sql).toMatch(/revoke all on schema connections_private from public, anon, authenticated/i)
    expect(sql).toMatch(/connections_private\.mutate_connection_impl[\s\S]*security definer[\s\S]*set search_path = ''/i)
    expect(sql).toMatch(/connections_private\.get_my_connection_state_impl[\s\S]*security definer/i)
    expect(sql).toMatch(/connections_private\.get_my_connection_summary_impl[\s\S]*security definer/i)
    expect(sql).toMatch(/connections_private\.list_my_connections_impl[\s\S]*security definer/i)
    expect(verifier).toMatch(/n\.nspname in \([\s\S]*?'connections_private'[\s\S]*?\)/)
    expect(allowlist.unexposed_security_definers).toEqual(expect.arrayContaining([
      'connections_private.mutate_connection_impl(uuid,text)',
      'connections_private.remove_connection_on_block()',
    ]))
  })

  test('enforces actor authority, bounded requests, pair locking, idempotence, and cooldown', () => {
    expect(sql).toMatch(/auth\.uid\(\)/i)
    expect(sql).toMatch(/private\.users_have_block\(caller_id, target_user_id\)/i)
    expect(sql).toMatch(/pg_advisory_xact_lock/i)
    expect(sql).toMatch(/outgoing_pending_count >= 50/i)
    expect(sql).toMatch(/hashtextextended\('connection-outgoing:' \|\| caller_id::text, 0\)/i)
    expect(sql).toMatch(/interval '24 hours'/i)
    expect(sql).toMatch(/only the request recipient can accept/i)
    expect(sql).toMatch(/only the request recipient can decline/i)
    expect(sql).toMatch(/only the requester can cancel/i)
    expect(sql).toMatch(/status = 'accepted'[\s\S]*revision = connections\.revision \+ 1/i)
    expect(sql).toMatch(/connection_row\.status = 'pending'[\s\S]*connection_row\.requested_by = caller_id[\s\S]*null;/i)
  })

  test('hard-deletes a blocked pair and suppresses its unread connection events', () => {
    expect(sql).toMatch(/function connections_private\.remove_connection_on_block\(\)[\s\S]*delete from public\.user_connections/i)
    expect(sql).toMatch(/remove_connection_on_block\(\)[\s\S]*pg_advisory_xact_lock/i)
    expect(sql).toMatch(/pg_advisory_xact_lock[\s\S]*if private\.users_have_block\(caller_id, target_user_id\)/i)
    expect(sql).toMatch(/after insert on public\.user_blocks[\s\S]*connections_private\.remove_connection_on_block\(\)/i)
    expect(sql).toMatch(/events\.type in \('connection_request', 'connection_accepted', 'connection_changed'\)/i)
    expect(sql).toMatch(/notification_events_unread_connection_entity_idx[\s\S]*on public\.notification_events \(entity_id\)/i)
    expect(sql).toMatch(/events\.entity_id = (?:connection_row\.id|removed_connection_id)/i)
    expect(sql).not.toMatch(/events\.payload ->> 'connection_id'/i)
    expect(sql).toMatch(/set read_at = coalesce\(events\.read_at, now\(\)\)/i)
    expect(sql).not.toMatch(/remove_connection_on_block[\s\S]*status = 'inactive'/i)
  })

  test('creates safe recipient-owned connection notification events without OS push', () => {
    expect(sql).toMatch(/connection_notifications_enabled boolean not null default true/i)
    expect(sql).toMatch(/event_type not in \('connection_request', 'connection_accepted', 'connection_changed'\)/i)
    expect(sql).toMatch(/public\.user_public_profile_json\(profiles\)/i)
    expect(sql).toMatch(/'revision', connection_row\.revision/i)
    expect(sql).toMatch(/event_type \|\| ':' \|\| connection_row\.id::text \|\| ':'[\s\S]*connection_row\.revision::text/i)
    expect(sql).toMatch(/'notify', case[\s\S]*connection_changed[\s\S]*false/i)
    expect(sql).toMatch(/if changed then[\s\S]*caller_id[\s\S]*'connection_changed'/i)
    expect(sql).not.toMatch(/send-push|push_subscriptions/i)
  })

  test('provides a private accepted-pair helper for feed modes and Inner Circles', () => {
    expect(sql).toMatch(/function private\.users_are_connected\(/i)
    expect(sql).toMatch(/connections\.status = 'accepted'/i)
    expect(sql).toMatch(/private\.users_have_block\(first_user_id, second_user_id\)/i)
    expect(sql).toMatch(/revoke all on function private\.users_are_connected\(uuid, uuid\)[\s\S]*from public, anon, authenticated/i)
    expect(allowlist.private_security_definers).toContain('private.users_are_connected(uuid,uuid)')
  })
})
