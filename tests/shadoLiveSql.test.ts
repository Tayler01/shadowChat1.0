import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260716005427_shado_live_foundation.sql'
)
const sql = fs.readFileSync(migrationPath, 'utf8')
const verifier = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'verify-shado-live-local.sql'),
  'utf8'
)
const betaAccessSql = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260716030000_shado_live_beta_access.sql'
  ),
  'utf8'
)
const allowlist = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'supabase', 'security-definer-allowlist.json'),
  'utf8'
)) as {
  private_security_definers: string[]
  unexposed_security_definers: string[]
}

describe('Shado Live database foundation', () => {
  test('is audio-first, Connections-only, revisioned, and disabled by default', () => {
    expect(sql).toMatch(/access_mode text not null default 'disabled'/i)
    expect(sql).toContain("CHECK (access_mode IN ('disabled', 'allowlist', 'enabled'))")
    expect(sql).toMatch(/create table public\.shado_live_access_members/i)
    expect(sql).toMatch(/create table public\.live_rooms/i)
    expect(sql).toMatch(/audience text not null default 'connections'/i)
    expect(sql).toMatch(/listener_limit integer not null default 100/i)
    expect(sql).toMatch(/provider_room_name text not null unique/i)
    expect(sql).toMatch(/provider_identity text not null check \(provider_identity = user_id::text\)/i)
    expect(sql).toMatch(/token_version integer not null default 1/i)
    expect(sql).toMatch(/speaker_count >= 3/i)
    expect(sql).toMatch(/jsonb_build_array\('microphone'\)/i)
    expect(sql).toMatch(/'canPublishData', false/i)
    expect(sql).toMatch(/recordingAllowed', false/i)
  })

  test('keeps beta access explicit and fail-closed for every caller-facing path', () => {
    expect(sql).toMatch(/function private\.shado_live_is_enabled_for\(target_user_id uuid\)/i)
    expect(sql).toMatch(/state\.access_mode = 'allowlist'[\s\S]*public\.shado_live_access_members/i)
    expect(sql).toMatch(/state\.access_mode = 'enabled'/i)
    expect(sql).toMatch(/shado_live_is_enabled_for\(caller_id\)/i)
    expect(sql).toMatch(/shado_live_is_enabled_for\(actor_user_id\)/i)
    expect(sql).toMatch(/shado_live_is_enabled_for\(target_user_id\)/i)
    expect(sql).toMatch(/function public\.shado_live_set_access_mode\(/i)
    expect(sql).toMatch(/function public\.shado_live_set_access_member\(/i)
    expect(sql).toMatch(/grant execute on function public\.shado_live_prepare_session[\s\S]*public\.shado_live_set_access_member[\s\S]*to service_role/i)
    expect(sql).not.toMatch(/grant (?:select|insert|update|delete).*shado_live_access_members to authenticated/i)
    expect(verifier).toMatch(/'allowlist', 'local beta verification'/i)
    expect(verifier).toMatch(/live-outsider@local\.test/i)
  })

  test('ships the isolated rollout in allowlist mode for selected testers only', () => {
    expect(betaAccessSql).toMatch(/access_mode = 'allowlist'/i)
    expect(betaAccessSql).toMatch(/from beta_members[\s\S]*join public\.users/i)
    expect(betaAccessSql).toMatch(/on conflict \(user_id\) do update/i)
    expect(betaAccessSql).not.toMatch(/access_mode = 'enabled'/i)
    expect(betaAccessSql).not.toMatch(/insert into auth\./i)
    expect(betaAccessSql.match(/::uuid\)/gi)).toHaveLength(7)
  })

  test('exposes narrow invoker RPCs through a dedicated unexposed authority schema', () => {
    expect(sql).toMatch(/create schema shado_live_private/i)
    expect(sql).toMatch(/revoke all on schema shado_live_private from public, anon, authenticated, service_role/i)
    expect(sql).toMatch(/grant usage on schema shado_live_private to authenticated, service_role/i)
    for (const functionName of [
      'list_my_shado_live_rooms',
      'get_my_shado_live_room',
      'list_my_shado_live_messages',
      'send_my_shado_live_message',
      'mutate_my_shado_live_stage_request',
      'shado_live_prepare_session',
      'shado_live_prepare_command',
      'shado_live_complete_provider_operation',
      'shado_live_ingest_provider_webhook',
    ]) {
      expect(sql).toMatch(new RegExp(
        `function public\\.${functionName}[\\s\\S]*?security invoker`,
        'i'
      ))
    }
    expect(sql).toMatch(/shado_live_prepare_command\([\s\S]*p_action text/i)
    expect(sql).toMatch(/shado_live_complete_provider_operation\([\s\S]*p_operation_id uuid[\s\S]*p_operation_status text/i)
    expect(sql).toMatch(/shado_live_ingest_provider_webhook\([\s\S]*p_room_id uuid[\s\S]*p_participant_user_id uuid/i)
    expect(sql).toMatch(/revoke all on function public\.shado_live_prepare_session[\s\S]*from public, anon, authenticated, service_role/i)
    expect(sql).toMatch(/grant execute on function public\.shado_live_prepare_session[\s\S]*to service_role/i)
  })

  test('returns canonical snapshots and preserves a host green room across reload', () => {
    expect(sql).toMatch(/rooms\.status = 'green_room' and rooms\.host_user_id = caller_id/i)
    expect(sql).toMatch(/'participants', participants_json/i)
    expect(sql).toMatch(/'stageRequests', stage_requests_json/i)
    expect(sql).toMatch(/'messages', recent_messages/i)
    expect(sql).toMatch(/limit 50/i)
    expect(sql).toMatch(/'handRaised', exists/i)
    expect(sql).toMatch(/'response', coalesce\(shado_live_private\.get_shado_live_room_for_actor_impl/i)
    expect(verifier).toMatch(/host green room disappeared from the lobby summary/i)
  })

  test('uses a retryable provider outbox with claims, leases, and verified webhook idempotence', () => {
    expect(sql).toMatch(/create table public\.live_provider_operations/i)
    expect(sql).toMatch(/available_at timestamptz not null default now\(\)/i)
    expect(sql).toMatch(/for update of operations skip locked/i)
    expect(sql).toMatch(/lease_expires_at = now\(\) \+ interval '60 seconds'/i)
    expect(sql).toMatch(/operations\.actor_user_id = shado_live_claim_provider_operations_impl\.actor_user_id/i)
    expect(sql).toMatch(/target_participant\.token_version/i)
    expect(sql).toMatch(/create table public\.live_provider_webhook_receipts/i)
    expect(sql).toMatch(/on conflict on constraint live_provider_webhook_receipts_pkey do nothing/i)
    expect(sql).toMatch(/event_token_version[\s\S]*participant_row\.token_version/i)
    expect(sql).not.toMatch(/http_(?:get|post)|net\.http|extensions\.http/i)
  })

  test('publishes only a privacy-safe RLS invalidation signal for realtime refetches', () => {
    expect(sql).toMatch(/create table public\.live_room_signals/i)
    expect(sql).toMatch(/alter table public\.live_room_signals enable row level security/i)
    expect(sql).toMatch(
      /using \(shado_live_private\.can_receive_shado_live_signal\(\(select auth\.uid\(\)\), room_id\)\)/i,
    )
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.live_room_signals/i)
    expect(sql).not.toMatch(/alter publication supabase_realtime add table public\.live_room_events/i)
    expect(sql).toMatch(/touch_shado_live_(?:room|participant|stage|message)_signal/i)
  })

  test('enforces optimistic host commands, three speakers, and personal-block teardown', () => {
    expect(sql).toMatch(/expected room version is required/i)
    expect(sql).toMatch(/room_row\.revision <> expected_version/i)
    expect(sql).toMatch(/normalized_command = 'start'[\s\S]*room_row\.status <> 'green_room'/i)
    expect(sql).toMatch(/speaker_count >= 3/i)
    expect(sql).toMatch(/after insert on public\.user_blocks[\s\S]*private\.teardown_shado_live_on_block/i)
    expect(sql).toMatch(/removal_reason = 'personal_block'/i)
    expect(sql).toMatch(/'block_teardown'/i)
    expect(verifier).toMatch(/fourth additional speaker was accepted/i)
    expect(verifier).toMatch(/personal-block live teardown failed/i)
  })

  test('registers every new definer in the reviewed allowlist', () => {
    expect(allowlist.private_security_definers).toEqual(expect.arrayContaining([
      'private.reject_shado_live_append_only_mutation()',
      'private.teardown_shado_live_on_block()',
      'private.touch_shado_live_room_signal()',
    ]))
    expect(allowlist.unexposed_security_definers).toEqual(expect.arrayContaining([
      'shado_live_private.get_my_shado_live_room_impl(uuid)',
      'shado_live_private.get_shado_live_room_for_actor_impl(uuid,uuid)',
      'shado_live_private.shado_live_prepare_session_impl(uuid,text,uuid,uuid,jsonb)',
      'shado_live_private.shado_live_prepare_command_impl(uuid,text,uuid,uuid,integer,uuid,jsonb)',
      'shado_live_private.shado_live_set_access_member_impl(uuid,uuid,boolean,timestamp with time zone,text)',
      'shado_live_private.shado_live_set_access_mode_impl(uuid,text,text)',
    ]))
  })
})
