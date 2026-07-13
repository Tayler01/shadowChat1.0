import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260712003000_member_reporting_case_center.sql'),
  'utf8'
)
const sql = migration.replace(/\s+/g, ' ').toLowerCase()
const storagePolicyRepair = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260713051830_restore_moderation_storage_policy_helper_execution.sql'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()

describe('member reporting and Safety Case Center migration', () => {
  test('keeps reporting additive and limited to active production surfaces', () => {
    for (const table of [
      'member_reports',
      'moderation_cases',
      'moderation_case_reports',
      'moderation_evidence',
      'moderation_case_events',
      'moderation_case_actions',
      'moderation_action_channel_bans',
      'moderation_report_attachments',
      'moderation_report_updates',
    ]) {
      expect(sql).toContain(`create table public.${table}`)
    }
    expect(sql).toContain("'user', 'general_message', 'dm_message', 'shadow_pin_image', 'shadow_pin_comment'")
    expect(sql).not.toContain("'board_")
    expect(sql).not.toContain("'news_")
    expect(sql).not.toContain("'esp_")
  })

  test('captures evidence server-side and validates target visibility', () => {
    expect(sql).toContain('create or replace function public.submit_member_report(')
    expect(sql).toContain("elsif normalized_target_type = 'dm_message' then")
    expect(sql).toContain('from public.dm_messages messages')
    expect(sql).toContain('caller_id = any(conversations.participants)')
    expect(sql).toContain("raise exception 'you cannot report your own content or profile'")
    expect(sql).toContain('content_hash')
    expect(sql).toContain("extensions.digest(target_snapshot::text, 'sha256')")
    expect(sql).toContain('unique (reporter_user_id, client_report_id)')
  })

  test('protects private records behind bounded RPC projections', () => {
    for (const table of [
      'member_reports',
      'moderation_case_reports',
      'moderation_evidence',
      'moderation_case_events',
      'moderation_case_actions',
      'moderation_action_channel_bans',
      'moderation_report_attachments',
    ]) {
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`)
      expect(sql).not.toContain(`grant select on table public.${table} to authenticated`)
    }
    expect(sql).toContain('create or replace function private.can_operator_access_moderation_case(')
    expect(sql).toContain('cases.full_admin_only is false')
    expect(sql).toContain('security definer')
    expect(sql).toContain("set search_path = ''")
  })

  test('uses optimistic concurrency and append-only audit controls', () => {
    expect(sql).toContain('p_expected_version integer')
    expect(sql).toContain('for update')
    expect(sql).toContain("raise exception 'case changed. refresh before saving'")
    expect(sql).toContain("raise exception 'case changed. refresh before applying an action'")
    expect(sql).toContain('create or replace function private.reject_moderation_audit_mutation()')
    expect(sql).toContain('before update or delete on public.moderation_case_events')
    expect(sql).toContain('before update or delete on public.moderation_case_actions')
    expect(sql).toContain('before update or delete on public.moderation_evidence')
  })

  test('reuses existing moderation authority without widening DM access', () => {
    expect(sql).toContain('from public.set_user_channel_bans(')
    expect(sql).toContain('perform public.delete_shadow_pin_image(target_case.target_id)')
    expect(sql).toContain("raise exception 'content removal is not supported for this target'")
    expect(sql).not.toContain('grant select on table public.dm_messages')
  })

  test('keeps attachments private and realtime payloads sanitized', () => {
    expect(sql).toContain("values ( 'moderation-evidence', 'moderation-evidence', false, 10485760")
    expect(sql).toContain('private.can_read_moderation_attachment')
    expect(sql).toContain('private.is_submitted_moderation_attachment')
    expect(sql).toContain('alter publication supabase_realtime add table public.moderation_cases')
    expect(sql).toContain('alter publication supabase_realtime add table public.moderation_report_updates')
    expect(sql).not.toContain('alter publication supabase_realtime add table public.moderation_evidence')
    expect(sql).not.toContain('alter publication supabase_realtime add table public.member_reports')
  })

  test('keeps authenticated Storage policy helpers executable without exposing the private schema', () => {
    expect(storagePolicyRepair).toContain(
      'grant execute on function private.can_read_moderation_attachment(uuid, text) to authenticated'
    )
    expect(storagePolicyRepair).toContain(
      'grant execute on function private.is_submitted_moderation_attachment(text) to authenticated'
    )
    expect(storagePolicyRepair).not.toContain('grant usage on schema private to authenticated')
  })
})
