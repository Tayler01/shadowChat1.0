/** Isolated PostgreSQL runtime checks. No remote connection or real accounts. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = process.env.SHADOWCHAT_PGLITE_MODULE_PATH || path.join(root, 'node_modules/@electric-sql/pglite/dist/index.js')
const { PGlite } = await import(pathToFileURL(runtime).href)
const db = new PGlite()
const first = '10000000-0000-4000-8000-000000000001'
const second = '10000000-0000-4000-8000-000000000002'
const third = '10000000-0000-4000-8000-000000000003'
const conversation = '20000000-0000-4000-8000-000000000001'
const thread = '30000000-0000-4000-8000-000000000001'
const reply = '30000000-0000-4000-8000-000000000002'
let assertions = 0
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions += 1 }
const rejected = async (sql, params, label) => { await assert.rejects(db.query(sql, params), undefined, label); assertions += 1 }
const asMember = async id => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false)", [id])
  await db.exec('set role authenticated')
}
const setTyping = (scope, typing = true) => db.query('select public.set_typing_status($1, $2)', [scope, typing])
const list = async scope => (await db.query('select * from public.list_typing_states($1)', [scope])).rows
const writeDenied = scope => rejected('select public.set_typing_status($1, true)', [scope], `Scope ${scope} must reject this member`)

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create role authenticator;
    create schema auth;
    create schema private;
    revoke all on schema private from public, anon, authenticated;
    grant usage on schema private to authenticated;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    create table auth.users (id uuid primary key);
    create table public.users (id uuid primary key references auth.users(id) on delete cascade, username text, display_name text);
    create table public.user_blocks (blocker_id uuid, blocked_id uuid);
    create table public.channel_bans (user_id uuid primary key);
    create table public.messages (id uuid primary key, user_id uuid references public.users(id) on delete cascade, reply_to uuid references public.messages(id) on delete set null, hidden boolean default false);
    create table public.dm_conversations (id uuid primary key, participants uuid[]);
    create function private.users_have_block(first_id uuid, second_id uuid) returns boolean language sql stable security definer set search_path = '' as
      $$ select exists(select 1 from public.user_blocks where (blocker_id = first_id and blocked_id = second_id) or (blocker_id = second_id and blocked_id = first_id)) $$;
    revoke all on function private.users_have_block(uuid,uuid) from public,anon;
    grant execute on function private.users_have_block(uuid,uuid) to authenticated;
    create function public.is_user_channel_banned(target_user_id uuid, scope text) returns boolean language sql stable security definer set search_path = '' as
      $$ select scope = 'general_chat' and exists(select 1 from public.channel_bans where user_id = target_user_id) $$;
    alter table public.users enable row level security;
    alter table public.messages enable row level security;
    alter table public.dm_conversations enable row level security;
    create policy user_visibility on public.users for select to authenticated using (not private.users_have_block(auth.uid(), id));
    create policy message_visibility on public.messages for select to authenticated using (not hidden and not private.users_have_block(auth.uid(), user_id));
    create policy dm_visibility on public.dm_conversations for select to authenticated using (auth.uid() = any(participants));
    grant select on public.users, public.messages, public.dm_conversations to authenticated;
    grant all on public.users to service_role;
    insert into auth.users values ('${first}'), ('${second}'), ('${third}');
    insert into public.users values ('${first}', 'first', 'First'), ('${second}', 'second', 'Second'), ('${third}', 'third', 'Third');
    insert into public.messages values ('${thread}', '${first}', null, false), ('${reply}', '${second}', '${thread}', false);
    insert into public.dm_conversations values ('${conversation}', array['${first}', '${second}']::uuid[]);
    create publication supabase_realtime;
  `)
  await db.exec(await readFile(path.join(root, 'supabase/migrations/20261023001140_active_member_access_boundary.sql'), 'utf8'))
  await db.exec(await readFile(path.join(root, 'supabase/migrations/20261023002845_authorized_typing_state.sql'), 'utf8'))
  equal((await db.query("select has_schema_privilege('authenticated','private','usage') as legacy, has_schema_privilege('authenticated','member_mutation_private','usage') as guarded")).rows[0],
    { legacy: true, guarded: false }, 'Legacy full-app access remains while forged mutation authorization is denied')

  await asMember(first)
  await db.exec('select public.require_active_member_request()')
  await setTyping('general')
  const initial = (await db.query("select * from public.typing_states where scope_key = 'general'")).rows[0]
  equal(initial.user_id, first, 'Typing identity is derived from JWT')
  equal(new Date(initial.expires_at).getTime() - new Date(initial.updated_at).getTime(), 6000, 'Expiry is server-owned six seconds')
  equal((await list('general')).length, 0, 'Caller is excluded from display list')
  await setTyping('general')
  equal((await db.query("select updated_at from public.typing_states where scope_key = 'general'")).rows[0].updated_at, initial.updated_at, 'Repeated starts within two seconds are throttled')
  await rejected('insert into public.typing_states(user_id,scope_key,expires_at,updated_at) values ($1,$2,now(),now())', [second, 'general'], 'Direct identity forgery is denied')
  await rejected('update public.typing_states set expires_at = now()', [], 'Direct timestamp writes are denied')
  await rejected('delete from public.typing_states', [], 'Direct deletes are denied')
  await rejected("select member_mutation_private.set_typing_status_authorized('general', true, true)", [], 'Private authorization flag cannot be supplied directly')
  for (const scope of ['none', 'board-test', 'dm-invalid', `general-thread:${reply}`, 'general-thread:40000000-0000-4000-8000-000000000001']) await writeDenied(scope)
  await setTyping(`dm-${conversation}`)
  await setTyping(`general-thread:${thread}`)

  await asMember(second)
  equal((await list('general')).map(row => row.user_id), [first], 'Authorized members receive canonical profile labels')
  equal((await list(`dm-${conversation}`)).map(row => row.user_id), [first], 'DM participant receives typing')
  equal((await list(`general-thread:${thread}`)).map(row => row.user_id), [first], 'Visible root authorizes thread typing')
  await asMember(third)
  equal(await list(`dm-${conversation}`), [], 'Guessed DM scope leaks no typing state')
  await writeDenied(`dm-${conversation}`)

  await db.exec('reset role')
  await db.query('insert into public.user_blocks values ($1,$2)', [first, second])
  await asMember(second)
  equal(await list('general'), [], 'Blocked recipient cannot read General typing')
  equal(await list(`dm-${conversation}`), [], 'Reciprocal block hides DM typing')
  equal(await list(`general-thread:${thread}`), [], 'Blocked root is hidden by current message RLS')
  await writeDenied(`dm-${conversation}`)
  await writeDenied(`general-thread:${thread}`)
  await asMember(first)
  await writeDenied(`dm-${conversation}`)
  await db.exec('reset role; delete from public.user_blocks')
  await db.query('update public.messages set hidden = true where id = $1', [thread])
  await asMember(second)
  equal(await list(`general-thread:${thread}`), [], 'Other existing message RLS restrictions are respected')
  await writeDenied(`general-thread:${thread}`)

  await db.exec('reset role')
  await db.query('delete from public.messages where id = $1', [thread])
  await asMember(first)
  await writeDenied(`general-thread:${thread}`)
  await db.exec('reset role')
  await db.query('insert into public.channel_bans values ($1)', [first])
  await asMember(first)
  await writeDenied('general')
  await setTyping(`dm-${conversation}`)
  assertions += 1 // General ban does not prevent an authorized DM hint.
  await setTyping('general', false)
  await asMember(second)
  equal(await list('general'), [], 'Stop expires state immediately without unsafe DELETE data')

  await db.exec('reset role')
  await db.query('update public.typing_states set expires_at = now() - interval \'1 second\' where user_id = $1', [first])
  await asMember(second)
  equal(await list(`dm-${conversation}`), [], 'Expired states are not displayed')
  await db.exec('reset role')
  await db.query('insert into private.account_deletion_jobs(user_id,receipt_digest) values ($1,$2)', [first, 'a'.repeat(64)])
  await db.query('update public.typing_states set expires_at = now() + interval \'6 seconds\' where user_id = $1', [first])
  await asMember(second)
  equal(await list(`dm-${conversation}`), [], 'An actor whose deletion started immediately disappears')
  await asMember(first)
  equal(await list('general'), [], 'Pending deletion cannot read typing with an existing JWT')
  await writeDenied(`dm-${conversation}`)
  await rejected('select public.require_active_member_request()', [], 'PostgREST pre-request rejects pending deletion')
  await db.exec('reset role')
  await db.query('delete from auth.users where id = $1', [first])
  equal((await db.query('select * from public.typing_states where user_id = $1', [first])).rows, [], 'Account deletion cascades all authored typing state')
  await asMember(first)
  await writeDenied('general')
  await db.exec('reset role; set role anon')
  await rejected("select * from public.list_typing_states('general')", [], 'Anonymous reads denied')
  await rejected("select public.set_typing_status('general',true)", [], 'Anonymous writes denied')

  await db.exec('reset role')
  equal((await db.query("select array_agg(a.attname order by ordinality) as names from pg_constraint c cross join unnest(c.conkey) with ordinality as key(attnum, ordinality) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key.attnum where c.conrelid = 'public.typing_states'::regclass and c.contype = 'p'")).rows[0].names, ['id'], 'Only opaque id can appear in DELETE primary-key metadata')
  equal((await db.query("select relreplident from pg_class where oid = 'public.typing_states'::regclass")).rows[0].relreplident, 'd', 'Replica identity remains DEFAULT')
  equal((await db.query("select count(*)::int as count from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'typing_states'")).rows[0].count, 1, 'Typing table is published for authorized INSERT/UPDATE')
  await db.query("insert into public.typing_states(user_id,scope_key,expires_at,updated_at) select $1, 'cleanup-' || i, now() - interval '2 hours', now() - interval '2 hours' from generate_series(1,55) i", [second])
  await asMember(second)
  await setTyping('general')
  await db.exec('reset role')
  equal((await db.query("select count(*)::int as count from public.typing_states where scope_key like 'cleanup-%'")).rows[0].count, 5, 'Cleanup is bounded to fifty old rows per request')
  equal((await db.query("select count(*)::int as count from public.typing_states where scope_key = 'general' and expires_at > now()")).rows[0].count, 1, 'Cleanup preserves active typing state')
  console.log(`Authorized typing SQL: ${assertions} assertions passed; caller RLS, reciprocal blocks, scoped membership, throttling/expiry, stale JWT and opaque delete keys verified locally.`)
} catch (error) {
  console.error({ message: error.message, code: error.code, detail: error.detail, query: error.query, assertions })
  process.exitCode = 1
} finally {
  await db.close()
}
