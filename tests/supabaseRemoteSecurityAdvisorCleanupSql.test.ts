import fs from 'node:fs'
import path from 'node:path'

const migration = fs
  .readFileSync(
    path.join(
      process.cwd(),
      'supabase/migrations/20260710002000_remote_security_advisor_cleanup.sql'
    ),
    'utf8'
  )
  .replace(/\s+/g, ' ')
  .toLowerCase()

describe('hosted Supabase security advisor cleanup', () => {
  it('removes current and future anonymous definer execution by default', () => {
    expect(migration).toContain(
      'alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated'
    )
    expect(migration).toContain('and procedures.prosecdef')
    expect(migration).toContain(
      "'revoke all on function %s from public, anon'"
    )
  })

  it('keeps only the pre-signup username check intentionally anonymous', () => {
    expect(migration).toContain(
      'grant execute on function public.is_username_available(text) to anon, authenticated, service_role'
    )
  })

  it('guards reaction aggregates and ban expiry before crossing RLS', () => {
    for (const signature of [
      'count_user_reactions(target_user_id uuid)',
      'count_reactions_to_user_messages_v2(target_user_id uuid)',
      'count_reactions_to_user_dm_messages_v2(target_user_id uuid)',
      'expire_user_channel_bans()',
    ]) {
      expect(migration).toContain(`create or replace function public.${signature}`)
    }

    expect(migration.match(/user not authenticated/g)).toHaveLength(4)
  })

  it('removes authenticated mutation access from paused product RPCs', () => {
    for (const signature of [
      'create_art_board_link(uuid, uuid, text)',
      'delete_art_board_item(uuid)',
      'delete_art_board_link(uuid)',
      'toggle_art_board_reaction(uuid, text)',
      'update_art_board_link(uuid, text)',
      'toggle_board_chat_pin(uuid)',
      'toggle_board_chat_reaction(uuid, text)',
      'toggle_news_chat_reaction(uuid, text)',
      'toggle_news_feed_reaction(uuid, text)',
    ]) {
      expect(migration).toContain(`revoke all on function public.${signature}`)
    }
  })

  it('removes bucket listing and browser access to the paused bridge schema', () => {
    expect(migration).toContain(
      'drop policy if exists "public read for art board images" on storage.objects'
    )
    expect(migration).toContain(
      'drop policy if exists "public read for shadow pin images" on storage.objects'
    )
    expect(migration).toContain(
      'revoke all privileges on table public.bridge_devices from anon, authenticated'
    )
  })
})
