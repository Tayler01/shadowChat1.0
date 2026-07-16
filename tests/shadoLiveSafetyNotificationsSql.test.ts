import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260716013443_shado_live_safety_notifications.sql'),
  'utf8',
)
const foundation = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260716005427_shado_live_foundation.sql'),
  'utf8',
)
const definerAllowlist = JSON.parse(readFileSync(
  resolve(process.cwd(), 'supabase/security-definer-allowlist.json'),
  'utf8',
)) as { unexposed_security_definers: string[] }

describe('Shado Live safety and notification SQL contract', () => {
  test('is a forward migration layered on the unchanged foundation', () => {
    expect(migration).toMatch(/^\/\*[\s\S]*BEGIN;/)
    expect(migration.trim()).toMatch(/COMMIT;$/)
    expect(migration).not.toMatch(/DROP TABLE\s+public\.live_/i)
    expect(foundation).toContain('# Shado Live audio-first foundation')
    expect(foundation).not.toContain('shado_live_notifications')
  })

  test('extends existing moderation checks without removing old-client values', () => {
    for (const value of [
      'user', 'general_message', 'dm_message', 'shadow_pin_image', 'shadow_pin_comment',
      'live_room', 'live_participant', 'live_message',
    ]) {
      expect(migration).toContain(`'${value}'`)
    }
    for (const action of [
      'no_action', 'remove_content', 'channel_ban', 'end_live_room',
      'remove_live_participant', 'mute_live_participant',
      'set_live_restriction', 'revoke_live_restriction',
    ]) {
      expect(migration).toContain(`'${action}'`)
    }
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.list_my_member_reports[\s\S]*reports\.target_type NOT IN \('live_room', 'live_participant', 'live_message'\)/,
    )
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.list_moderation_cases[\s\S]*cases\.target_type NOT IN \('live_room', 'live_participant', 'live_message'\)/,
    )
    expect(migration).toMatch(/CREATE FUNCTION public\.list_my_shado_live_reports/)
    expect(migration).toMatch(/CREATE FUNCTION public\.list_shado_live_moderation_cases/)
  })

  test('captures live report evidence on the server behind Connections and block privacy', () => {
    expect(migration).toMatch(/normalized_target_type NOT IN \('live_room', 'live_participant', 'live_message'\)/)
    expect(migration).toMatch(/FROM public\.live_rooms rooms[\s\S]*shado_live_private\.can_access_shado_live_room/)
    expect(migration).toMatch(/FROM public\.live_room_participants participants/)
    expect(migration).toMatch(/FROM public\.live_room_messages messages/)
    expect(migration).toMatch(/private\.users_have_block\(caller_id, (rooms\.host_user_id|participants\.user_id|messages\.sender_user_id)\)/)
    expect(migration).toContain('private.users_are_connected(caller_id')
    expect(migration).toContain('You cannot report your own Shado Live room, participation, or message')
    expect(migration).toContain("extensions.digest(target_snapshot::text, 'sha256')")
    expect(migration).toMatch(/INSERT INTO public\.moderation_evidence/)
    expect(migration).toMatch(/INSERT INTO public\.moderation_case_events/)
    expect(migration).not.toMatch(/p_(room_id|participant_user_id|message_body|source_author_id)/)
  })

  test('derives operator targets from evidence and queues revision-guarded provider work', () => {
    const signature = migration.match(
      /CREATE FUNCTION shado_live_private\.apply_shado_live_case_action_impl\(([\s\S]*?)\)\nRETURNS jsonb/,
    )?.[1] ?? ''
    expect(signature).not.toMatch(/p_(room_id|participant_id|target_user_id)/)
    expect(migration).toContain("evidence_snapshot ->> 'roomId'")
    expect(migration).toContain('target_case.subject_user_id')
    expect(migration).toContain('target_case.version <> p_expected_version')
    expect(migration).toContain('private.can_operator_access_moderation_case')
    expect(migration).toContain('Only the full admin can sanction a sub-admin')
    expect(migration).toContain('The full admin account cannot be sanctioned')
    expect(migration).toMatch(/'delete_room', gen_random_uuid\(\),\s*room_row\.revision/)
    expect(migration).toMatch(/'remove_participant', gen_random_uuid\(\), room_row\.revision/)
    expect(migration).toMatch(/'mute_track', gen_random_uuid\(\), room_row\.revision/)
    expect(migration).toContain('shado_live_private.shado_live_set_restriction_impl(')
    expect(migration).toContain("'room_ending'")
    expect(migration).toContain("'participant_removed'")
    expect(migration).toContain("'participant_muted'")
    expect(migration).toContain("'action_failed'")
  })

  test('keeps live notifications recipient-owned and outside Activity HQ and legacy push', () => {
    expect(migration).toMatch(/CREATE TABLE public\.shado_live_notifications/)
    expect(migration).toContain('shado_live_in_app_enabled boolean NOT NULL DEFAULT true')
    expect(migration).toMatch(/recipient_user_id = \(SELECT auth\.uid\(\)\)/)
    expect(migration).toContain('NOT private.users_have_block(recipient_user_id, actor_user_id)')
    expect(migration).toContain('private.users_are_connected(target_recipient_id, target_room.host_user_id)')
    expect(migration).toContain("target_room.audience <> 'connections'")
    expect(migration).not.toMatch(/INSERT INTO public\.(activity_events|notification_events)/)
    expect(migration).not.toMatch(/ALTER TABLE public\.activity_events/)
    expect(migration).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*shado_live_notifications[^;]*authenticated/i)
    expect(migration).toMatch(/CREATE FUNCTION public\.mark_my_shado_live_notifications_read/)
    expect(migration).toContain("'url', '/?view=games&experience=shado-live&item='")
    expect(migration).toContain("'legacy_url', '/?view=games'")
    expect(migration).toContain("'view', 'games'")
    expect(migration).toContain("'experience', 'shado-live'")
    expect(migration).toMatch(/'item', (target_room\.id|resolved_room_id)/)
    expect(migration).not.toMatch(/view=play|view', 'play'|'game', 'shado-live'|'room_id', target_room\.id\s*\n\s*\)/)
    expect(migration).toContain('Push delivery is intentionally not wired')
  })

  test('uses private definers, public invokers, explicit grants, and guarded realtime', () => {
    for (const wrapper of [
      'list_my_shado_live_notifications',
      'mark_my_shado_live_notifications_read',
      'submit_shado_live_report',
      'list_my_shado_live_reports',
      'list_shado_live_moderation_cases',
      'get_shado_live_moderation_case',
      'apply_shado_live_case_action',
    ]) {
      expect(migration).toMatch(new RegExp(
        `CREATE FUNCTION public\\.${wrapper}[\\s\\S]*?SECURITY INVOKER`,
      ))
      expect(migration).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${wrapper}`,
      ))
    }
    expect(migration).toMatch(/pg_catalog\.pg_publication_tables[\s\S]*ALTER PUBLICATION supabase_realtime ADD TABLE public\.shado_live_notifications/)

    for (const signature of [
      'shado_live_private.apply_shado_live_case_action_impl(uuid,integer,text,text[],integer,text,text)',
      'shado_live_private.list_my_shado_live_notifications_impl(integer,timestamp with time zone,uuid)',
      'shado_live_private.submit_shado_live_report_impl(text,uuid,text,uuid,text)',
    ]) {
      expect(definerAllowlist.unexposed_security_definers).toContain(signature)
    }
  })
})
