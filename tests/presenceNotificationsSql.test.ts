import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260715214707_presence_notifications_unified_badges.sql'
)
const sql = fs.readFileSync(migrationPath, 'utf8')
const conflictFixSql = fs.readFileSync(path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260715231400_fix_presence_claim_conflict_target.sql'
), 'utf8')
const lintFixSql = fs.readFileSync(path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260715232500_clean_presence_claim_lint.sql'
), 'utf8')
const contract = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'supabase', 'security-definer-allowlist.json'),
  'utf8'
)) as {
  expected_total_security_definers: number
  private_security_definers: string[]
  internal_signatures: string[]
  required_active_table_privileges: string[]
  domains: Array<{ signatures: string[] }>
}

describe('presence notification and unified badge database contract', () => {
  test('uses server-owned offline eligibility and a rolling recipient/actor cooldown', () => {
    expect(sql).toMatch(/create table if not exists public\.presence_notification_state/i)
    expect(sql).toMatch(/create table if not exists public\.presence_activation_events/i)
    expect(sql).toMatch(/create table if not exists public\.presence_notification_cooldowns/i)
    expect(sql).toMatch(/prior_heartbeat_at <= now\(\) - interval '15 minutes'/i)
    expect(sql).toMatch(/primary key \(recipient_id, actor_id\)/i)
    expect(sql).toMatch(/last_notified_at[\s\S]*interval '1 hour'/i)
    expect(sql).toMatch(/for update/i)
    expect(sql).toMatch(/presence_notification_scope in \('connections', 'all'\)/i)
    expect(conflictFixSql).toMatch(/on conflict on constraint presence_notification_cooldowns_pkey do update/i)
    expect(lintFixSql).toMatch(/perform 1[\s\S]*presence_activation_events[\s\S]*for update/i)
    expect(lintFixSql).not.toMatch(/activation_row/i)
  })

  test('keeps activation clocks private and resolves eligibility server-side', () => {
    for (const table of [
      'presence_notification_state',
      'presence_activation_events',
      'presence_notification_cooldowns',
    ]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated`, 'i'))
    }
    expect(sql).toMatch(/private\.users_have_block\(preferences\.user_id, target_actor_id\)/i)
    expect(sql).toMatch(/private\.users_are_connected\(preferences\.user_id, target_actor_id\)/i)
    expect(sql).toMatch(/users\.presence_visibility = 'tracked'/i)
    expect(sql).not.toMatch(/grant .*presence_activation_events.*authenticated/i)
  })

  test('preserves legacy presence while v2 returns a single activation identifier', () => {
    expect(sql).toMatch(/function public\.update_user_last_active\(\)[\s\S]*returns void/i)
    expect(sql).toMatch(/perform private\.record_presence_heartbeat\(false\)/i)
    expect(sql).toMatch(/function public\.update_user_last_active_v2\(\)[\s\S]*returns uuid/i)
    expect(sql).toMatch(/private\.record_presence_heartbeat\(true\)/i)
  })

  test('marks DM and General Chat state only through the presented message', () => {
    expect(sql).toMatch(/function public\.mark_dm_messages_read_through\(/i)
    expect(sql).toMatch(/messages\.created_at < target_created_at/i)
    expect(sql).toMatch(/messages\.id <= through_message_id/i)
    expect(sql).toMatch(/function public\.mark_general_notification_events_read_through\(/i)
    expect(sql).toMatch(/target_thread_id is null[\s\S]*general_chat_thread_replies/i)
  })

  test('builds a preference-gated cross-surface launcher badge without presence noise', () => {
    for (const preference of [
      'badge_dm_enabled',
      'badge_group_enabled',
      'badge_interactions_enabled',
      'badge_connections_enabled',
      'badge_shadow_pin_enabled',
    ]) {
      expect(sql).toMatch(new RegExp(`${preference} boolean not null default true`, 'i'))
    }
    expect(sql).toMatch(/function public\.get_app_badge_state\(/i)
    expect(sql).toMatch(/'total', dm_count \+ group_count \+ interaction_count \+ connection_count \+ shadow_pin_count/i)
    expect(sql).not.toMatch(/presence_active[^\n]*interaction_count/i)
  })

  test('records the reviewed definer and active-table surfaces', () => {
    const authenticated = contract.domains.flatMap(domain => domain.signatures)
    expect(contract.expected_total_security_definers).toBe(149)
    expect(contract.private_security_definers).toContain('private.record_presence_heartbeat(boolean)')
    expect(contract.internal_signatures).toEqual(expect.arrayContaining([
      'claim_presence_activation_recipients(uuid,uuid)',
      'finish_presence_activation_dispatch(uuid,uuid)',
    ]))
    expect(authenticated).toEqual(expect.arrayContaining([
      'get_app_badge_state(uuid)',
      'mark_dm_messages_read_through(uuid,uuid)',
      'mark_general_notification_events_read_through(uuid,uuid)',
      'update_user_last_active_v2()',
    ]))
    expect(contract.required_active_table_privileges).toContain('service_role:presence_activation_events:SELECT')
  })
})
