import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260710042701_personal_blocking_privacy_contract.sql'
)
const sql = fs.readFileSync(migrationPath, 'utf8')

describe('personal blocking database contract', () => {
  test('stores private self-owned block rows with least-privilege grants', () => {
    expect(sql).toMatch(/create table public\.user_blocks/i)
    expect(sql).toMatch(/primary key \(blocker_id, blocked_id\)/i)
    expect(sql).toMatch(/check \(blocker_id <> blocked_id\)/i)
    expect(sql).toMatch(/alter table public\.user_blocks enable row level security/i)
    expect(sql).toMatch(/using \(\(select auth\.uid\(\)\) = blocker_id\)/i)
    expect(sql).toMatch(/grant select, insert, delete on table public\.user_blocks to authenticated/i)
    expect(sql).toMatch(/grant select on table public\.user_blocks to service_role/i)
    expect(sql).toMatch(/user_blocks_blocked_blocker_idx[\s\S]*\(blocked_id, blocker_id\)/i)
  })

  test('uses an indexed reciprocal pair check without exposing block direction', () => {
    expect(sql).toMatch(/function private\.users_have_block/i)
    expect(sql).toMatch(/blocks\.blocker_id = first_user_id and blocks\.blocked_id = second_user_id/i)
    expect(sql).toMatch(/blocks\.blocker_id = second_user_id and blocks\.blocked_id = first_user_id/i)
    expect(sql).toMatch(/set search_path = ''/i)
    expect(sql).not.toMatch(/create or replace function public\.users_have_block/i)
  })

  test('enforces discovery, General Chat, presence, Hype, and DM visibility with restrictive policies', () => {
    for (const policy of [
      'Blocked pairs cannot read each other profiles',
      'Blocked pairs cannot read each other presence',
      'Blocked users are hidden from General Chat',
      'Blocked users are hidden from Hype events',
      'Blocked users are hidden from message Hype',
      'Blocked users are hidden from reaction rows',
      'Blocked users are hidden from direct message history',
      'Blocked pairs cannot create conversations',
      'Blocked pairs cannot send direct messages',
    ]) {
      expect(sql).toContain(`create policy "${policy}"`)
    }
    expect(sql.match(/as restrictive/gi)?.length).toBeGreaterThanOrEqual(9)
  })

  test('blocks trusted DM inserts and reactions while preserving existing rows', () => {
    expect(sql).toMatch(/before insert on public\.dm_conversations[\s\S]*private\.enforce_dm_conversation_not_blocked/i)
    expect(sql).toMatch(/before insert on public\.dm_messages[\s\S]*private\.enforce_dm_message_not_blocked/i)
    expect(sql).toMatch(/before insert on public\.message_reactions[\s\S]*private\.enforce_dm_reaction_not_blocked/i)
    expect(sql).not.toMatch(/delete from public\.dm_(?:messages|conversations)/i)
  })

  test('keeps existing threads generic and suppresses blocked previews and unread counts', () => {
    expect(sql).toMatch(/returns table[\s\S]*is_blocked boolean,[\s\S]*blocked_by_me boolean/i)
    expect(sql).toMatch(/when relationship\.is_blocked then null/i)
    expect(sql).toMatch(/when relationship\.is_blocked then 0/i)
    expect(sql).toMatch(/not private\.users_have_block\(target_user_id, message\.sender_id\)/i)
    expect(sql).toMatch(/public\.user_public_profile_json\(other_user_row\)/i)
  })

  test('filters search and presence APIs and keeps block mutations caller-owned', () => {
    expect(sql).toMatch(/function public\.block_user\(target_user_id uuid\)[\s\S]*security invoker/i)
    expect(sql).toMatch(/function public\.unblock_user\(target_user_id uuid\)[\s\S]*security invoker/i)
    expect(sql).toMatch(/function public\.search_users\(term text\)[\s\S]*not private\.users_have_block\(caller_user_id, users\.id\)/i)
    expect(sql).toMatch(/function public\.list_presence_states\(\)[\s\S]*not private\.users_have_block\(caller_user_id, users\.id\)/i)
    expect(sql).toMatch(/function public\.get_active_users\(\)[\s\S]*not private\.users_have_block\(caller_user_id, users\.id\)/i)
  })
})
