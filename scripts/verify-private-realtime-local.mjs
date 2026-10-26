/** Local PostgreSQL policy execution only. No network or production mutation. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { securityActivationSection } from '../tests/helpers/securityMigrationPhases.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = process.env.SHADOWCHAT_PGLITE_MODULE_PATH || path.join(root, 'node_modules/@electric-sql/pglite/dist/index.js')
const { PGlite } = await import(pathToFileURL(runtime).href)
const db = new PGlite()
const first = '10000000-0000-4000-8000-000000000001'
const second = '10000000-0000-4000-8000-000000000002'
const stranger = '10000000-0000-4000-8000-000000000003'
let assertions = 0
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions += 1 }
const denied = async (sql, params = [], label = 'Expected access denial') => { await assert.rejects(db.query(sql, params), undefined, label); assertions += 1 }
const asMember = async id => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role','authenticated',false)", [id])
  await db.exec('set role authenticated')
}
const realtimeRows = async topic => {
  await db.query("select set_config('realtime.topic',$1,false)", [topic])
  return (await db.query('select extension from realtime.messages order by extension')).rows.map(row => row.extension)
}
const roster = async () => (await db.query('select * from public.list_shadow_war_lobby_presence()')).rows
const setPresence = value => db.query('select public.set_shadow_war_lobby_presence($1)', [value])

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
    create schema auth; create schema private; create schema realtime;
    revoke all on schema private from public,anon,authenticated;
    grant usage on schema public,auth,realtime to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    create function realtime.topic() returns text language sql stable as
      $$ select nullif(current_setting('realtime.topic',true),'') $$;
    create table auth.users(id uuid primary key);
    create table public.users(id uuid primary key references auth.users(id) on delete cascade,username text,display_name text,avatar_url text,presence_visibility text default 'tracked');
    create table public.user_blocks(blocker_id uuid,blocked_id uuid);
    create function private.users_have_block(first_id uuid,second_id uuid) returns boolean language sql stable security definer set search_path='' as
      $$ select exists(select 1 from public.user_blocks where (blocker_id=first_id and blocked_id=second_id) or (blocker_id=second_id and blocked_id=first_id)) $$;
    revoke all on function private.users_have_block(uuid,uuid) from public,anon;
    grant execute on function private.users_have_block(uuid,uuid) to authenticated;
    alter table public.users enable row level security;
    create policy visible_profiles on public.users for select to authenticated using (not private.users_have_block(auth.uid(),id));
    grant select on public.users to authenticated;
    grant all on public.users to service_role;
    create table realtime.messages(id bigint generated always as identity primary key,extension text,topic text);
    alter table realtime.messages enable row level security;
    grant select,insert on realtime.messages to anon,authenticated;
    grant all on realtime.messages to service_role;
    grant usage on sequence realtime.messages_id_seq to anon,authenticated,service_role;
    -- Simulate permissive old rules: new restrictive policies must still win.
    create policy old_read on realtime.messages for select to anon,authenticated using(true);
    create policy old_write on realtime.messages for insert to anon,authenticated with check(true);
    insert into realtime.messages(extension,topic) values ('broadcast','fixture'),('presence','fixture');
    insert into auth.users values ('${first}'),('${second}');
    insert into public.users(id,username,display_name,avatar_url) values ('${first}','first','First','https://example.test/avatar.png'),('${second}','second','Second',null);
    create publication supabase_realtime;
  `)
  for (const migration of ['20261023001140_active_member_access_boundary.sql','20261023004930_private_realtime_authorization.sql','20261023004931_shadow_war_lobby_presence.sql']) {
    await db.exec(await readFile(path.join(root,'supabase/migrations',migration),'utf8'))
  }
  await db.exec(await securityActivationSection('realtime_private_channels'))

  await asMember(first)
  equal(await realtimeRows('shadowchat:db:public:messages:fixture'), ['broadcast'], 'Active members can join private database channels but not Presence')
  equal(await realtimeRows('shadowchat:db:dm_messages:fixture'), ['broadcast'], 'DM database channel has the same read gate; row RLS remains separate')
  equal(await realtimeRows('app-release-updates'), ['broadcast'], 'Exact server release lane is readable')
  for (const topic of ['typing:general','app-release-updates-forged','shadow-war:lobby-presence','other-private-topic']) equal(await realtimeRows(topic), [], `Unknown/private legacy topic ${topic} denied`)
  await realtimeRows('shadowchat:db:public:messages:fixture')
  await denied("insert into realtime.messages(extension,topic) values ('broadcast','shadowchat:db:public:messages:fixture')", [], 'Browser Broadcast denied despite old permissive policy')
  await denied("insert into realtime.messages(extension,topic) values ('presence','shadowchat:db:public:messages:fixture')", [], 'Browser Presence denied despite old permissive policy')
  await realtimeRows('app-release-updates')
  await denied("insert into realtime.messages(extension,topic) values ('broadcast','app-release-updates')", [], 'Member cannot spoof release publisher')
  await asMember(stranger)
  equal(await realtimeRows('shadowchat:db:public:messages:fixture'), [], 'JWT without approved profile cannot join')
  await db.exec('reset role; set role anon')
  equal(await realtimeRows('app-release-updates'), [], 'Anonymous cannot receive private release data')
  await denied("insert into realtime.messages(extension,topic) values ('broadcast','app-release-updates')")

  await asMember(first)
  await setPresence(true)
  let rows = await roster()
  equal(rows.map(row=>row.user_id), [first], 'Lobby identity comes from JWT')
  equal(rows[0].display_name, 'First', 'Lobby labels come from authorized canonical profile')
  const stored = (await db.query('select * from public.shadow_war_lobby_presence')).rows[0]
  equal(new Date(stored.expires_at).getTime()-new Date(stored.updated_at).getTime(),45_000,'Server owns forty-five-second lease')
  await setPresence(true)
  equal((await db.query('select updated_at from public.shadow_war_lobby_presence')).rows[0].updated_at,stored.updated_at,'Heartbeat is server-throttled')
  await denied('insert into public.shadow_war_lobby_presence(user_id,joined_at,updated_at,expires_at) values ($1,now(),now(),now())',[second],'Identity spoofing cannot write table')
  await denied('update public.shadow_war_lobby_presence set expires_at=now()',[], 'Direct expiry mutation denied')
  await asMember(second)
  equal((await roster()).map(row=>row.user_id),[first],'Approved peer sees roster')
  await db.exec('reset role')
  await db.query('insert into public.user_blocks values ($1,$2)',[first,second])
  await asMember(second)
  equal(await roster(),[],'Blocked peer sees no roster entry')
  await asMember(first)
  await setPresence(true)
  await db.exec('reset role; delete from public.user_blocks')
  await db.query('insert into public.user_blocks values ($1,$2)',[second,first])
  await asMember(second)
  equal(await roster(),[],'Reciprocal block hides roster')
  await db.exec('reset role; delete from public.user_blocks')
  await db.query("update public.users set presence_visibility='invisible' where id=$1",[first])
  await asMember(second)
  equal(await roster(),[],'Invisible members are hidden even with unexpired lease')
  await db.exec('reset role')
  await db.query("update public.users set presence_visibility='tracked' where id=$1",[first])
  await asMember(first)
  await setPresence(false)
  await asMember(second)
  equal(await roster(),[],'Stop expires through UPDATE')
  await asMember(first)
  await setPresence(true)
  await db.exec('reset role')
  await db.query("insert into private.account_deletion_jobs(user_id,receipt_digest) values ($1,$2)",[first,'a'.repeat(64)])
  await asMember(second)
  equal(await roster(),[],'Pending deletion actor immediately hidden')
  await asMember(first)
  equal(await realtimeRows('shadowchat:db:public:messages:fixture'),[],'Issued JWT loses new private channel authorization after deletion starts')
  equal(await roster(),[],'Pending deletion reader denied')
  await denied('select public.set_shadow_war_lobby_presence(true)')
  await asMember(stranger)
  await denied('select public.set_shadow_war_lobby_presence(true)')
  await db.exec('reset role; set role anon')
  await denied('select * from public.list_shadow_war_lobby_presence()')
  await denied('select public.set_shadow_war_lobby_presence(true)')
  await db.exec('reset role')
  await db.query('delete from auth.users where id=$1',[first])
  equal((await db.query('select count(*)::int as count from public.shadow_war_lobby_presence')).rows[0].count,0,'Deleting Auth user cascades lobby lease')
  equal((await db.query("select array_agg(a.attname order by ordinality) as names from pg_constraint c cross join unnest(c.conkey) with ordinality as key(attnum,ordinality) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=key.attnum where c.conrelid='public.shadow_war_lobby_presence'::regclass and c.contype='p'")).rows[0].names,['id'],'DELETE primary key is opaque')
  equal((await db.query("select relreplident from pg_class where oid='public.shadow_war_lobby_presence'::regclass")).rows[0].relreplident,'d','Replica identity is DEFAULT')
  equal((await db.query("select count(*)::int as count from pg_publication_tables where pubname='supabase_realtime' and tablename='shadow_war_lobby_presence'")).rows[0].count,1,'Roster is published for RLS-filtered INSERT/UPDATE')
  await db.exec('set role service_role')
  await db.query("insert into realtime.messages(extension,topic) values ('broadcast','app-release-updates')")
  assertions += 1
  console.log(`Private Realtime and lobby SQL: ${assertions} local assertions passed. Hosted socket disconnect/PrivateOnly behavior still requires rollout verification.`)
} finally { await db.close() }
