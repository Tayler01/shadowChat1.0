import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260711225923_dm_conversation_hub_backend.sql'),
  'utf8'
)
const sql = migration.replace(/\s+/g, ' ').toLowerCase()

describe('DM Conversation Hub backend migration', () => {
  test('fails closed before enforcing canonical one-to-one conversation identity', () => {
    expect(sql).toContain('lock table public.dm_conversations in share row exclusive mode')
    expect(sql).toContain('dm hub migration blocked: malformed or noncanonical conversation participants')
    expect(sql).toContain('dm hub migration blocked: duplicate one-to-one conversations exist')
    expect(sql).toContain('constraint dm_conversations_two_sorted_participants_check check')
    expect(sql).toContain('create unique index if not exists dm_conversations_participants_pair_key')
  })

  test('preserves the v1 create RPC while removing direct conversation mutation', () => {
    expect(sql).toContain('create or replace function public.get_or_create_dm_conversation(other_user_id uuid)')
    expect(sql).toContain('pg_catalog.pg_advisory_xact_lock')
    expect(sql).toContain('on conflict (participants) do nothing')
    expect(sql).toContain('security definer set search_path =')
    expect(sql).toContain('revoke insert, update on table public.dm_conversations from authenticated')
    expect(sql).toContain('create or replace function public.update_conversation_last_message()')
    expect(sql).toContain('set last_message_at = greatest')
    expect(sql).toContain('create trigger update_dm_conversation_after_delete after delete on public.dm_messages')
    expect(sql).not.toContain('drop function if exists public.get_dm_conversations')
  })

  test('narrows direct message edits to the production frontend contract', () => {
    expect(sql).toContain('revoke update on table public.dm_messages from authenticated')
    expect(sql).toContain('grant update (content, edited_at) on table public.dm_messages to authenticated')
  })

  test('adds owner-private participant-validated preferences without duplicating mute state', () => {
    expect(sql).toContain('create table public.dm_conversation_preferences')
    expect(sql).toContain('pinned_at timestamptz')
    expect(sql).toContain('archived_at timestamptz')
    expect(sql).toContain('marked_unread_at timestamptz')
    expect(sql).toContain('alter table public.dm_conversation_preferences enable row level security')
    expect(sql).toContain('user_id = (select auth.uid())')
    expect(sql).toContain('(select auth.uid()) = any (conversations.participants)')
    expect(sql).toContain('for each row execute function public.update_updated_at_column()')
    expect(sql).toContain('create function private.unarchive_dm_conversation_on_message()')
    expect(sql).toContain('preferences.user_id = any (conversations.participants)')
    expect(sql).toContain('create trigger unarchive_dm_conversation_on_message after insert on public.dm_messages')
    expect(sql).toContain("where pubname = 'supabase_realtime'")
    expect(sql).toContain("and tablename = 'dm_conversation_preferences'")
    expect(sql).toContain('alter publication supabase_realtime add table public.dm_conversation_preferences')
    expect(sql).not.toContain('create table public.notification_conversation_mutes')
  })

  test('exposes only bounded invoker retrieval RPCs with paired keyset cursors', () => {
    for (const signature of [
      'public.search_dm_conversation_messages(',
      'public.list_dm_shared_content(',
      'public.get_dm_message_window(',
    ]) {
      expect(sql).toContain(`create function ${signature}`)
    }

    expect(sql.match(/security invoker/g)).toHaveLength(3)
    expect(sql).toContain("greatest(1, least(coalesce(result_limit, 30), 50))")
    expect(sql).toContain("raise exception 'dm search cursor must include both created_at and id'")
    expect(sql).toContain("raise exception 'shared content cursor must include both created_at and id'")
    expect(sql).toContain("target_status=missing")
    expect(sql).toContain('public.user_public_profile_json(profiles)')
  })

  test('locks every new RPC ACL to authenticated callers', () => {
    expect(sql).toContain(
      'revoke all on function public.search_dm_conversation_messages(uuid, text, integer, timestamptz, uuid) from public, anon, authenticated, service_role'
    )
    expect(sql).toContain(
      'revoke all on function public.list_dm_shared_content(uuid, text, integer, timestamptz, uuid) from public, anon, authenticated, service_role'
    )
    expect(sql).toContain(
      'revoke all on function public.get_dm_message_window(uuid, uuid, integer) from public, anon, authenticated, service_role'
    )
  })
})
