import { readFileSync } from 'node:fs'
import path from 'node:path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260710043132_universal_search_saved_collections.sql'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()

describe('message library database contract', () => {
  test('keeps search under the caller existing General Chat and DM RLS', () => {
    expect(sql).toContain('create or replace function public.search_my_messages')
    expect(sql).toContain('security invoker')
    expect(sql).toContain("websearch_to_tsquery('simple'")
    expect(sql).toContain('from public.dm_messages direct_messages')
    expect(sql).not.toMatch(/search_my_messages[\s\S]*security definer/)
  })

  test('stores saves and collections as private owner-scoped rows', () => {
    expect(sql).toContain('alter table public.message_collections enable row level security')
    expect(sql).toContain('alter table public.saved_messages enable row level security')
    expect(sql).toContain('using (user_id = (select auth.uid()))')
    expect(sql).toContain('members can create visible saved messages')
    expect(sql).toContain('(select auth.uid()) = any(conversations.participants)')
    expect(sql).toContain('revoke all on table public.message_collections, public.saved_messages from public, anon')
  })

  test('adds indexed full-text search and source-safe foreign keys', () => {
    expect(sql).toContain('messages_search_document_idx')
    expect(sql).toContain('dm_messages_search_document_idx')
    expect(sql).toContain('general_message_id uuid references public.messages(id) on delete cascade')
    expect(sql).toContain('dm_message_id uuid references public.dm_messages(id) on delete cascade')
    expect(sql).toContain('saved_messages_source_target_check')
  })
})
