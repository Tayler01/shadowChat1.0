import fs from 'node:fs'
import path from 'node:path'

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260711194211_shadowchat_activity_events.sql'
  ),
  'utf8'
)

describe('ShadowChat 2.0 Activity HQ database contract', () => {
  test('uses a separate recipient-owned ledger with bounded source shapes', () => {
    expect(sql).toMatch(/create table public\.activity_events/i)
    expect(sql).toMatch(/user_id uuid not null references public\.users/i)
    expect(sql).toMatch(/actor_id uuid not null references public\.users/i)
    expect(sql).toMatch(/activity_events_body_preview_length/i)
    expect(sql).toMatch(/activity_events_metadata_object/i)
    expect(sql).toMatch(/activity_events_source_shape/i)
    expect(sql).not.toMatch(/alter table public\.notification_events[\s\S]*add column/i)
  })

  test('keeps Activity reads owner-only, block-aware, and least privilege', () => {
    expect(sql).toMatch(/alter table public\.activity_events enable row level security/i)
    expect(sql).toMatch(/\(select auth\.uid\(\)\) = user_id/i)
    expect(sql).toMatch(/not private\.users_have_block\(user_id, actor_id\)/i)
    expect(sql).toMatch(/revoke all on table public\.activity_events from public, anon, authenticated/i)
    expect(sql).toMatch(/grant select on table public\.activity_events to authenticated/i)
    expect(sql).toMatch(/grant update \(read_at\) on table public\.activity_events to authenticated/i)
    expect(sql).not.toMatch(/grant (?:insert|delete) on table public\.activity_events to authenticated/i)
  })

  test('narrows the legacy browser mutation without changing its read semantics', () => {
    expect(sql).toMatch(/revoke update on table public\.notification_events from authenticated/i)
    expect(sql).toMatch(/grant update \(read_at\) on table public\.notification_events to authenticated/i)
    expect(sql).not.toMatch(/update public\.notification_events[\s\S]*set read_at/i)
  })

  test('creates push-independent source triggers with private pinned definers', () => {
    for (const signature of [
      'create_dm_activity_event',
      'create_group_activity_events',
      'create_reaction_activity_event',
      'create_hype_activity_event',
      'mirror_shadow_pin_activity_event',
      'cleanup_activity_events',
    ]) {
      expect(sql).toMatch(new RegExp(`function private\\.${signature}\\(\\)[\\s\\S]*security definer[\\s\\S]*set search_path = ''`, 'i'))
      expect(sql).toMatch(new RegExp(`revoke all on function private\\.${signature}\\(\\)[\\s\\S]*from public, anon, authenticated`, 'i'))
    }

    expect(sql).toMatch(/after insert on public\.dm_messages/i)
    expect(sql).toMatch(/after insert on public\.messages/i)
    expect(sql).toMatch(/after insert on public\.message_reactions/i)
    expect(sql).toMatch(/after insert on public\.hype_events/i)
    expect(sql).toMatch(/after insert on public\.notification_events/i)
  })

  test('supports stable keyset and unread queries and publishes realtime events', () => {
    expect(sql).toMatch(/activity_events_user_occurred_idx[\s\S]*user_id, occurred_at desc, id desc/i)
    expect(sql).toMatch(/activity_events_user_unread_idx[\s\S]*where read_at is null/i)
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.activity_events/i)
  })

  test('keeps blocking on new reactions without breaking source cascades', () => {
    expect(sql).toMatch(/drop trigger if exists enforce_dm_reaction_not_blocked on public\.message_reactions/i)
    expect(sql).toMatch(/create trigger enforce_dm_reaction_not_blocked\s+before insert on public\.message_reactions/i)
    expect(sql).not.toMatch(/create trigger enforce_dm_reaction_not_blocked\s+before insert or delete/i)
  })

  test('avoids historical backfill and arbitrary navigation URLs', () => {
    expect(sql).not.toMatch(/insert into public\.activity_events[\s\S]*select[\s\S]*from public\.notification_events/i)
    expect(sql).not.toMatch(/\b(route|href)\s+text\b/i)
  })
})
