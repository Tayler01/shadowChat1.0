import { readFileSync } from 'node:fs'
import path from 'node:path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260608132000_harden_dm_read_participant_guard.sql'),
  'utf8'
)

const compactSql = migration.replace(/\s+/g, ' ').toLowerCase()

describe('mark_dm_messages_read hardening migration contract', () => {
  it('keeps the authenticated rpc signature and fixed search path', () => {
    expect(compactSql).toContain('create or replace function public.mark_dm_messages_read(conversation_id uuid)')
    expect(compactSql).toContain('returns void')
    expect(compactSql).toContain('security definer')
    expect(compactSql).toContain('set search_path = public')
  })

  it('requires an authenticated participant before marking messages read', () => {
    expect(compactSql).toContain('current_user_id := auth.uid()')
    expect(compactSql).toContain("raise exception 'user not authenticated'")
    expect(compactSql).toContain('from public.dm_conversations')
    expect(compactSql).toContain('where id = mark_dm_messages_read.conversation_id')
    expect(compactSql).toContain('and current_user_id = any(participants)')
    expect(compactSql).toContain("raise exception 'reader is not a participant in this dm conversation'")
  })

  it('preserves read receipt semantics for messages from the other participant', () => {
    expect(compactSql).toContain('update public.dm_messages')
    expect(compactSql).toContain('set read_at = coalesce(read_at, now())')
    expect(compactSql).toContain('when read_by is null then array[current_user_id]::uuid[]')
    expect(compactSql).toContain('when not (current_user_id = any(read_by)) then array_append(read_by, current_user_id)')
    expect(compactSql).toContain('and sender_id != current_user_id')
    expect(compactSql).toContain('and (read_by is null or not (current_user_id = any(read_by)))')
  })

  it('resets broad grants and allows authenticated callers only', () => {
    expect(compactSql).toContain('revoke all on function public.mark_dm_messages_read(uuid) from public')
    expect(compactSql).toContain('revoke all on function public.mark_dm_messages_read(uuid) from anon')
    expect(compactSql).toContain('grant execute on function public.mark_dm_messages_read(uuid) to authenticated')
  })
})
