import fs from 'node:fs'
import path from 'node:path'

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260716213100_shado_live_message_reactions.sql'
  ),
  'utf8'
)

test('Shado Live reactions stay isolated and browser table access remains revoked', () => {
  expect(migration).toContain('CREATE TABLE public.live_room_message_reactions')
  expect(migration).toContain('REFERENCES public.live_room_messages(id) ON DELETE CASCADE')
  expect(migration).toContain('ALTER TABLE public.live_room_message_reactions ENABLE ROW LEVEL SECURITY')
  expect(migration).toMatch(
    /REVOKE ALL ON TABLE public\.live_room_message_reactions\s+FROM PUBLIC, anon, authenticated, service_role;/u
  )
  expect(migration).not.toMatch(
    /(?:FROM|JOIN|INSERT INTO|DELETE FROM)\s+public\.message_reactions/iu
  )
})

test('reaction reads and toggles use private definer implementations behind public invokers', () => {
  expect(migration).toContain(
    'CREATE FUNCTION shado_live_private.list_my_shado_live_message_reactions_impl('
  )
  expect(migration).toContain(
    'CREATE FUNCTION shado_live_private.toggle_my_shado_live_message_reaction_impl('
  )
  expect(migration).toMatch(
    /CREATE FUNCTION public\.list_my_shado_live_message_reactions\([\s\S]+?SECURITY INVOKER/u
  )
  expect(migration).toMatch(
    /CREATE FUNCTION public\.toggle_my_shado_live_message_reaction\([\s\S]+?SECURITY INVOKER/u
  )
  expect(migration).toContain(
    'shado_live_private.can_access_shado_live_room(caller_id, message_row.room_id)'
  )
  expect(migration).toContain(
    "private.user_has_shado_live_restriction(caller_id, 'chat')"
  )
  expect(migration).toContain(
    'private.users_have_block(caller_id, message_row.sender_user_id)'
  )
})

test('reaction changes invalidate the canonical room through the existing signal path', () => {
  expect(migration).toContain('CREATE TRIGGER touch_shado_live_message_reaction_signal')
  expect(migration).toContain(
    'FOR EACH ROW EXECUTE FUNCTION private.touch_shado_live_room_signal();'
  )
})
