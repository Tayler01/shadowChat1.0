import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (relativePath: string) =>
  readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

const sql = read(
  'supabase/migrations/20260717193835_notification_reliability_rebuild.sql'
)
const compact = sql.replace(/\s+/g, ' ').toLowerCase()
const catchUpPersistenceSql = read(
  'supabase/migrations/20260718134454_catch_up_notification_persistence.sql'
)
const catchUpPersistenceCompact = catchUpPersistenceSql.replace(/\s+/g, ' ').toLowerCase()
const backlogBaselineSql = read(
  'supabase/migrations/20260718135109_notification_backlog_baseline.sql'
)
const backlogBaselineCompact = backlogBaselineSql.replace(/\s+/g, ' ').toLowerCase()
const allowlist = JSON.parse(read('supabase/security-definer-allowlist.json')) as {
  expected_total_security_definers: number
  private_security_definers: string[]
  internal_signatures: string[]
  required_active_table_privileges: string[]
  domains: Array<{ signatures: string[] }>
}

describe('notification reliability database contract', () => {
  test('separates short-lived presentation claims from durable unread state', () => {
    expect(compact).toContain('add column if not exists presentation_expires_at timestamptz')
    expect(compact).toContain('add column if not exists presented_at timestamptz')
    expect(compact).toContain('add column if not exists resolved_at timestamptz')
    expect(compact).toContain('create or replace function public.claim_my_notification_event(')
    expect(compact).toContain('and events.presentation_expires_at > now()')
    expect(compact).not.toMatch(/payload\s*->>\s*'image_id'[^;]+::uuid/)
    expect(compact).not.toMatch(/payload\s*->>\s*'move_count'[^;]+::integer/)
  })

  test('keeps delivery jobs and per-device attempts service-role only', () => {
    expect(compact).toContain('create table if not exists public.notification_delivery_jobs')
    expect(compact).toContain('create table if not exists public.notification_delivery_attempts')
    expect(compact).toContain('alter table public.notification_delivery_jobs enable row level security')
    expect(compact).toContain('alter table public.notification_delivery_attempts enable row level security')
    expect(compact).toMatch(
      /revoke all on table public\.notification_delivery_jobs from public, anon, authenticated/
    )
    expect(compact).toMatch(
      /revoke all on table public\.notification_delivery_attempts from public, anon, authenticated/
    )
    expect(compact).toContain('create or replace function private.sync_notification_delivery_job()')
    expect(compact).toContain('and new.presentation_expires_at > now()')
    expect(compact).toContain(
      'create or replace function public.claim_notification_delivery_jobs('
    )
    expect(compact).toContain("coalesce(auth.jwt() ->> 'role', '') <> 'service_role'")
    expect(compact).toContain('for update of jobs skip locked')
    expect(compact).toContain(
      'grant execute on function public.claim_notification_delivery_jobs(integer) to service_role'
    )
  })

  test('mirrors Shado Live into the canonical ledger without enabling push delivery', () => {
    expect(compact).toContain(
      'create or replace function private.mirror_shado_live_notification()'
    )
    expect(compact).toContain(
      'create or replace function private.sync_shado_live_source_read()'
    )
    expect(compact).toContain("'shado_live_room_started'")
    expect(compact).toContain("'shado_live_participant_removed'")
    expect(compact).toContain(
      "'/?view=games&experience=shado-live&item=' || new.room_id::text"
    )
    expect(compact).toContain("'source_notification_id', new.id")
    expect(compact).toContain("new.occurred_at + interval '90 seconds'")
    expect(compact).toContain("when new.type like 'shado_live_%' then 'live'")

    const deliveryTypes = compact.slice(
      compact.indexOf('create or replace function private.sync_notification_delivery_job()'),
      compact.indexOf('create or replace function public.claim_notification_delivery_jobs(')
    )
    expect(deliveryTypes).not.toContain('shado_live_room_started')
    expect(deliveryTypes).not.toContain('shado_live_speaker_promoted')
  })

  test('creates one server-owned Checkers event for the current turn', () => {
    expect(compact).toContain(
      'create or replace function private.create_shadow_checkers_turn_notification()'
    )
    expect(compact).toContain('create trigger create_shadow_checkers_turn_notification_insert after insert')
    expect(compact).toContain(
      'create trigger create_shadow_checkers_turn_notification_update after update of status, current_turn_user_id, move_count, player_two_id'
    )
    expect(compact).not.toContain('after insert or update of status')
    expect(compact).toContain("'shadow_checkers_turn'")
    expect(compact).toContain(
      "'/?view=games&experience=shadow-checkers&item=%s'"
    )
    expect(compact).toContain(
      "'shadow_checkers_turn:', new.id, ':', new.move_count, ':', recipient_id"
    )
    expect(compact).toContain(
      "'body', 'it is your turn. open the match to make your play.'"
    )
  })

  test('publishes reviewed RPC and definer surfaces', () => {
    const publicSignatures = allowlist.domains.flatMap(domain => domain.signatures)
    expect(allowlist.expected_total_security_definers).toBe(139)
    expect(allowlist.private_security_definers).toEqual(expect.arrayContaining([
      'private.create_shadow_checkers_turn_notification()',
      'private.materialize_notification_envelope_v2()',
      'private.mirror_shado_live_notification()',
      'private.normalize_notification_event()',
      'private.sync_dm_notification_reads()',
      'private.sync_notification_delivery_job()',
      'private.sync_shado_live_source_read()',
    ]))
    expect(publicSignatures).toEqual(expect.arrayContaining([
      'claim_my_notification_event(uuid)',
      'get_app_badge_state_v2(uuid)',
      'mark_all_my_notification_events_read()',
      'mark_my_checkers_turn_read(uuid)',
      'mark_my_notification_event_read(uuid)',
      'mark_my_shadow_pin_notifications_read(uuid,uuid)',
      'register_my_notification_installation_v2(uuid,text,text,text,text,text,text,text,text,integer)',
    ]))
    expect(allowlist.internal_signatures).toContain(
      'claim_notification_delivery_jobs(integer)'
    )
    expect(allowlist.internal_signatures).toContain(
      'claim_notification_outbox_v2(integer,integer)'
    )
    expect(allowlist.required_active_table_privileges).toEqual(expect.arrayContaining([
      'service_role:notification_delivery_attempts:INSERT',
      'service_role:notification_delivery_jobs:UPDATE',
    ]))
  })

  test('clears the complete caller-owned notification backlog without deleting source content', () => {
    expect(catchUpPersistenceCompact).toContain(
      'create or replace function public.mark_all_my_notification_events_read()'
    )
    expect(catchUpPersistenceCompact).toContain('current_user_id uuid := auth.uid()')
    expect(catchUpPersistenceCompact).toContain('where events.user_id = current_user_id')
    expect(catchUpPersistenceCompact).toContain('and events.read_at is null')
    expect(catchUpPersistenceCompact).toContain('and events.resolved_at is null')
    expect(catchUpPersistenceCompact).toContain(
      'grant execute on function public.mark_all_my_notification_events_read() to authenticated'
    )
    expect(catchUpPersistenceCompact).not.toMatch(/\bdelete\s+from\b/)
  })

  test('sets one deterministic pre-rebuild notification baseline without changing source rows', () => {
    expect(backlogBaselineCompact).toContain(
      "events.created_at < timestamptz '2026-07-18 00:00:00 america/new_york'"
    )
    expect(backlogBaselineCompact).toContain('update public.notification_events events')
    expect(backlogBaselineCompact).toContain('update public.activity_events events')
    expect(backlogBaselineCompact).toContain(
      'returning events.user_id, events.type, events.entity_id'
    )
    expect(backlogBaselineCompact).not.toMatch(/\bdelete\s+from\b/)
    expect(backlogBaselineCompact).not.toMatch(
      /update public\.(messages|dm_messages|shadow_pin_images|shadow_checkers_matches|live_rooms)/
    )
  })
})
