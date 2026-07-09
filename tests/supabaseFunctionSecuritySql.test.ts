import fs from 'node:fs'
import path from 'node:path'

const migration = fs
  .readFileSync(
    path.join(
      process.cwd(),
      'supabase/migrations/20260709215321_security_definer_and_database_lint_cleanup.sql'
    ),
    'utf8'
  )
  .replace(/\s+/g, ' ')
  .toLowerCase()

describe('Supabase function security cleanup', () => {
  it('removes the unauthenticated legacy DM creation entry point', () => {
    expect(migration).toContain(
      'drop function if exists public.create_dm_conversation(uuid)'
    )
    expect(migration).toContain(
      'create or replace function public.get_or_create_dm_conversation(other_user_id uuid)'
    )
    expect(migration).toContain("if current_user_id is null then raise exception 'user not authenticated'")
    expect(migration).toContain(
      'revoke all on function public.get_or_create_dm_conversation(uuid) from public, anon, authenticated'
    )
  })

  it('requires authenticated callers for pinning and user search', () => {
    expect(migration).toContain(
      'create or replace function public.toggle_message_pin(message_id uuid)'
    )
    expect(migration).toContain(
      'create or replace function public.search_users(term text)'
    )
    expect(migration).toContain(
      'revoke all on function public.toggle_message_pin(uuid) from public, anon, authenticated'
    )
    expect(migration).toContain(
      'revoke all on function public.search_users(text) from public, anon, authenticated'
    )
  })

  it('limits unread counts to the caller or trusted service role', () => {
    expect(migration).toContain(
      "caller_role is distinct from 'service_role' and (caller_user_id is null or target_user_id is distinct from caller_user_id)"
    )
    expect(migration).toContain(
      'grant execute on function public.count_unread_dm_messages(uuid) to authenticated, service_role'
    )
  })

  it('removes implicit PUBLIC execution from current and future definer functions', () => {
    expect(migration).toContain('and procedures.prosecdef')
    expect(migration).toContain(
      "execute format('revoke all on function %s from public', function_signature)"
    )
    expect(migration).toContain(
      'alter default privileges for role postgres in schema public revoke execute on functions from public'
    )
  })

  it('sets deterministic search paths on every function flagged by the local advisor', () => {
    const hardenedSignatures = [
      'update_updated_at_column()',
      'update_conversation_last_message()',
      'update_conversation_timestamp()',
      'validate_storage_url(text, text)',
      'count_reactions_to_user_dm_messages(uuid)',
      'count_reactions_to_user_messages(uuid)',
      'get_dm_conversations()',
      'count_user_reactions(uuid)',
      'count_reactions_to_user_messages_v2(uuid)',
      'count_reactions_to_user_dm_messages_v2(uuid)',
      'shadow_checkers_apply_move_state(jsonb, text, text, jsonb)',
      'shadow_checkers_initial_board()',
    ]

    for (const signature of hardenedSignatures) {
      expect(migration).toContain(
        `alter function public.${signature} set search_path = public, pg_temp`
      )
    }
  })
})
