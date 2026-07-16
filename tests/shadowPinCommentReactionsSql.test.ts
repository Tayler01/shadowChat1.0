import { readFileSync } from 'node:fs'
import path from 'node:path'
import { normalizeShadowPinCommentRecord } from '../src/features/shadow-pin/api/shadowPinApi'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260716213000_shadow_pin_comment_reactions.sql'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()

const clientApi = readFileSync(
  path.join(process.cwd(), 'src/features/shadow-pin/api/shadowPinApi.ts'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()

describe('ShadowPin comment reactions', () => {
  test('stores one reaction per member, comment, and emoji with cascade cleanup', () => {
    expect(migration).toContain('create table public.shadow_pin_comment_reactions')
    expect(migration).toContain('comment_id uuid not null references public.shadow_pin_comments(id) on delete cascade')
    expect(migration).toContain('unique (comment_id, user_id, emoji)')
    expect(migration).toContain('char_length(emoji) between 1 and 32')
  })

  test('inherits visible-comment and personal-block authority through invoker RLS', () => {
    expect(migration).toContain('alter table public.shadow_pin_comment_reactions enable row level security')
    expect(migration).toContain('from public.shadow_pin_comments comments where comments.id = shadow_pin_comment_reactions.comment_id')
    expect(migration).toContain('not private.users_have_block((select auth.uid()), user_id)')
    expect(migration).toContain('not private.users_have_block((select auth.uid()), comments.author_id)')
    expect(migration).toContain('not private.users_have_block(auth.uid(), comments.author_id)')
    expect(migration).toContain('user_id = (select auth.uid())')
    expect(migration).toContain('security invoker')
    expect(migration).not.toContain('security definer')
  })

  test('validates nullable emoji input and grants only the mutation privileges the RPC needs', () => {
    expect(migration).toContain('normalized_emoji is null or normalized_emoji =')
    expect(migration).toContain('grant select, insert, delete on table public.shadow_pin_comment_reactions to authenticated')
    expect(migration).toContain('grant select, insert, delete on table public.shadow_pin_comment_reactions to service_role')
    expect(migration).not.toContain('grant all privileges on table public.shadow_pin_comment_reactions')
  })

  test('loads reaction rows with comments and toggles through the guarded RPC', () => {
    expect(clientApi).toContain('reaction_rows:shadow_pin_comment_reactions(emoji, user_id)')
    expect(clientApi).toContain("client.rpc('toggle_shadow_pin_comment_reaction'")
    expect(clientApi).toContain('normalizeshadowpincommentrecord')
  })

  test('normalizes reaction rows into the shared count and member summary', () => {
    const comment = normalizeShadowPinCommentRecord({
      id: 'comment-1',
      image_id: 'pin-1',
      author_id: 'author-1',
      parent_comment_id: null,
      body: 'A compact comment',
      created_at: '2026-07-16T20:00:00.000Z',
      updated_at: '2026-07-16T20:00:00.000Z',
      reaction_rows: [
        { emoji: '👍', user_id: 'user-1' },
        { emoji: '👍', user_id: 'user-2' },
        { emoji: '👍', user_id: 'user-1' },
        { emoji: '❤️', user_id: 'user-3' },
      ],
    })

    expect(comment.reactions).toEqual({
      '👍': { count: 2, users: ['user-1', 'user-2'] },
      '❤️': { count: 1, users: ['user-3'] },
    })
  })
})
