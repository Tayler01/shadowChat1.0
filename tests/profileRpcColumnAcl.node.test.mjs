import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { installProfileRpcFixtures, profileRpcManifest } from './helpers/profileRpcFixtures.mjs'
import { securityActivationSection } from './helpers/securityMigrationPhases.mjs'

const repair = await securityActivationSection('safe_profile_rpc_arguments')
const restrict = await securityActivationSection('profile_identity')
const columns = profileRpcManifest.columns
const reviewedFunctions = [...profileRpcManifest.functions, ...profileRpcManifest.internalFunctions]
const scalarSignature = `public.user_public_profile_json(${columns.map(column => column.type).join(',')})`
const args = alias => columns.map(column => `${alias}.${column.field}`).join(', ')
const uid = value => `51000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const reader = uid(1)
const author = uid(2)
const outsider = uid(3)
const hidden = uid(4)
const missing = uid(5)
const root = uid(10)
const reply = uid(11)
const conversation = uid(20)
const dm = uid(21)
const category = uid(30)
const pin = uid(31)

async function actor(db, id = reader) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: id })])
  await db.exec('set role authenticated')
}

async function setup() {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create schema private;
      grant usage on schema public,auth,private to authenticated,service_role;
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      create table public.user_blocks(blocker_id uuid,blocked_id uuid);
      create function private.users_have_block(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.user_blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a)) $$;
      revoke all on function private.users_have_block(uuid,uuid) from public,anon;
      grant execute on function private.users_have_block(uuid,uuid) to authenticated;
    `)
    await installProfileRpcFixtures(db)
    await db.exec(`
      grant select on all tables in schema public to authenticated;
      alter table public.users enable row level security;
      create policy profiles on public.users for select to authenticated using (
        id <> '${hidden}'::uuid and not private.users_have_block(auth.uid(),id));
      alter table public.messages enable row level security;
      create policy messages on public.messages for select to authenticated using (not private.users_have_block(auth.uid(),user_id));
      alter table public.dm_conversations enable row level security;
      create policy conversations on public.dm_conversations for select to authenticated using (
        auth.uid()=any(participants) and not private.users_have_block(participants[1],participants[2]));
      alter table public.dm_messages enable row level security;
      create policy dm_messages on public.dm_messages for select to authenticated using (
        exists(select 1 from public.dm_conversations c where c.id=conversation_id));
      alter table public.saved_messages enable row level security;
      create policy saved_messages on public.saved_messages for select to authenticated using(user_id=auth.uid());
      alter table public.saved_discovery_items enable row level security;
      create policy saved_discovery on public.saved_discovery_items for select to authenticated using(user_id=auth.uid());
      alter table public.activity_events enable row level security;
      create policy activity on public.activity_events for select to authenticated using(user_id=auth.uid());
      alter table public.user_read_cursors enable row level security;
      create policy cursors on public.user_read_cursors for select to authenticated using(user_id=auth.uid());
    `)
    for (const [id, username, display] of [[reader, 'reader', 'Reader'], [author, 'author', null], [outsider, 'outsider', 'Outsider'], [hidden, 'hidden', null]]) {
      await db.query(`insert into public.users(id,username,display_name,email,full_name,created_at,updated_at,last_active)
        values($1,$2,$3,'private@example.invalid','Private Name',now()-interval '2 days',now(),now())`, [id, username, display])
    }
    for (const item of [
      [root, reader, 'needle root', null, false], [reply, author, 'needle reply', root, false],
      [uid(12), author, 'needle older', null, false], [uid(13), reader, 'needle pinned', null, true],
      [uid(14), hidden, 'hidden author', null, false], [uid(15), missing, 'missing author', null, false],
    ]) await db.query(`insert into public.messages(id,user_id,content,reply_to,pinned,message_type,created_at,updated_at)
      values($1,$2,$3,$4,$5,'text',now()-interval '1 hour'+($6*interval '1 minute'),now())`, [...item, Number(item[0].slice(-2))])
    await db.query('insert into public.general_chat_thread_replies(message_id,thread_id) values($1,$2)', [reply, root])
    await db.query('insert into public.dm_conversations(id,participants,created_at,updated_at) values($1,$2,now(),now())', [conversation, [reader, author]])
    await db.query(`insert into public.dm_messages(id,conversation_id,sender_id,content,message_type,file_url,read_by,created_at,updated_at)
      values($1,$2,$3,'needle image','image','https://example.invalid/image.png','{}',now()-interval '30 minutes',now()),
        ($4,$2,$5,'needle response','text',null,'{}',now()-interval '10 minutes',now())`, [dm, conversation, author, uid(22), reader])
    await db.query('insert into public.shadow_pin_categories(id,creator_id,title) values($1,$2,$3)', [category, author, 'Fixture category'])
    await db.query(`insert into public.shadow_pin_images(id,category_id,creator_id,title,description,image_url,created_at)
      values($1,$2,$3,'Fixture Pin','Description','https://example.invalid/pin.png',now())`, [pin, category, author])
    await db.query(`insert into public.saved_discovery_items(id,user_id,target_kind,shadow_pin_image_id,created_at)
      values($1,$2,'shadow_pin',$3,now())`, [uid(32), reader, pin])
    await db.query(`insert into public.saved_messages(id,user_id,message_source,general_message_id,dm_message_id,created_at)
      values($1,$2,'general',$3,null,now()),($4,$2,'dm',null,$5,now()-interval '1 minute'),
        ($6,$7,'general',$3,null,now())`, [uid(40), reader, root, uid(41), dm, uid(42), outsider])
    await db.query(`insert into public.activity_events(id,user_id,actor_id,type,message_id,occurred_at,metadata)
      values($1,$2,$3,'mention',$4,now(),'{}')`, [uid(50), reader, author, reply])
    // Fix now() for byte-for-byte before/after Catch-Up timestamps. A failed
    // expected query is isolated by savepoint rather than aborting this test.
    await db.exec('begin')
    return db
  } catch (error) { await db.close(); throw error }
}

const calls = [
  ['get_dm_message_window', 'select * from public.get_dm_message_window($1,$2,50)', [conversation, dm]],
  ['get_dm_read_window', 'select * from public.get_dm_read_window($1,null,null,null,null,null,true,50)', [conversation]],
  ['get_general_chat_message_window', 'select * from public.get_general_chat_message_window(null,null,null,50)', []],
  ['get_general_chat_thread', 'select * from public.get_general_chat_thread($1,null,null,null,50)', [root]],
  ['get_general_chat_thread_read_window', 'select * from public.get_general_chat_thread_read_window($1,null,null,null,null,null,true,50)', [root]],
  ['get_general_chat_thread_summaries', 'select * from public.get_general_chat_thread_summaries($1)', [[root]]],
  ['get_general_chat_threaded_window', 'select * from public.get_general_chat_threaded_window(null,null,null,50)', []],
  ['get_my_catch_up_v1', 'select public.get_my_catch_up_v1(6,168) as result', []],
  ['list_dm_shared_content', "select * from public.list_dm_shared_content($1,'all',30,null,null)", [conversation]],
  ['list_my_saved_discovery_items', 'select * from public.list_my_saved_discovery_items(null,100)', []],
  ['list_my_saved_messages', 'select * from public.list_my_saved_messages(null,100)', []],
  ['search_dm_conversation_messages', "select * from public.search_dm_conversation_messages($1,'needle',30,null,null)", [conversation]],
  ['search_my_messages', "select * from public.search_my_messages('needle',40,null)", []],
]

async function allOutputs(db) {
  const result = {}
  for (const [name, sql, parameters] of calls) {
    try { result[name] = (await db.query(sql, parameters)).rows }
    catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }) }
    assert.ok(result[name].length > 0, `${name} exercises a result row`)
  }
  return result
}

async function rejected(db, operation, pattern) {
  await db.exec('savepoint expected_failure')
  try { await assert.rejects(operation, pattern) }
  finally { await db.exec('rollback to expected_failure; release expected_failure') }
}

async function metadata(db) {
  await db.exec('reset role')
  return (await db.query(`select p.oid,p.proname,p.proowner,p.proacl,p.prosecdef,p.provolatile,p.proisstrict,
    p.proconfig,p.procost,p.prorows,p.prolang,pg_get_function_identity_arguments(p.oid) identity,
    pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,
    obj_description(p.oid,'pg_proc') description,p.prosrc
    from pg_proc p where p.oid in(select to_regprocedure(value) from unnest($1::text[]) value)
    order by p.proname`, [reviewedFunctions.map(item => `${item.schema ?? 'public'}.${item.signature}`)])).rows
}

test('all 13 real INVOKER RPCs preserve their results under restricted profile columns', async () => {
  const db = await setup()
  try {
    const beforeCatalog = await metadata(db)
    await actor(db)
    const before = await allOutputs(db)
    assert.equal(before.get_general_chat_thread_summaries[0].summary.latest_reply_author.id, author)
    assert.equal(before.list_my_saved_messages.length, 2)
    assert.equal(before.list_my_saved_discovery_items[0].creator.id, author)
    await db.exec('reset role')
    await db.exec(restrict)
    await actor(db)
    assert.equal((await db.query(`select ${columns.map(column => column.field).join(',')} from public.users`)).rows.length, 3)
    await rejected(db, () => db.query(calls[5][1], calls[5][2]), { code: '42501' })
    await db.exec('reset role')
    await db.exec(repair)
    const afterCatalog = await metadata(db)
    const withoutSource = rows => rows.map(({ prosrc: _source, ...row }) => row)
    assert.deepEqual(withoutSource(afterCatalog), withoutSource(beforeCatalog), 'Signatures, ACLs, owner, RLS execution mode and settings are unchanged')
    for (const row of afterCatalog) {
      const expected = reviewedFunctions.find(item => item.signature.startsWith(`${row.proname}(`))
      assert.equal(createHash('sha256').update(row.prosrc).digest('hex'), expected.afterProsrcSha256, row.proname)
      assert.equal(row.prosecdef, false)
    }
    await actor(db)
    assert.deepEqual(await allOutputs(db), before)
    for (const column of ['email', 'full_name']) await rejected(db, () => db.query(`select ${column} from public.users`), { code: '42501' })
    assert.doesNotMatch(JSON.stringify(before), /private@example\.invalid|Private Name|"email"|"full_name"/)
  } finally { await db.close() }
})

test('scalar profiles preserve nullable fields and absent/RLS-hidden left joins', async () => {
  const db = await setup()
  try {
    await actor(db)
    const old = (await db.query('select public.user_public_profile_json(u) profile from public.users u where id=$1', [author])).rows[0].profile
    await db.exec('reset role')
    await db.exec(repair + restrict)
    await actor(db)
    const current = (await db.query(`select public.user_public_profile_json(${args('u')}) profile from public.users u where id=$1`, [author])).rows[0].profile
    assert.deepEqual(current, old)
    assert.equal(current.display_name, null)
    assert.equal(Object.keys(current).length, 26)
    for (const id of [hidden, missing]) {
      const rows = (await db.query(`select public.user_public_profile_json(${args('u')}) profile from (select $1::uuid id) requested
        left join public.users u on u.id=requested.id`, [id])).rows
      assert.deepEqual(rows, [{ profile: null }])
    }
    const metadata = (await db.query(`select prosecdef,provolatile,proisstrict,proconfig,
      has_function_privilege('anon',oid,'execute') anon from pg_proc where oid=$1::regprocedure`, [scalarSignature])).rows[0]
    assert.deepEqual(metadata, { prosecdef: false, provolatile: 's', proisstrict: false, proconfig: ['search_path=""'], anon: false })
  } finally { await db.close() }
})

test('stable scalar serialization respects TimeZone after prepared-plan reuse', async () => {
  const db = await setup()
  try {
    await db.exec(repair)
    const literals = columns.map(column => column.field === 'id' ? `'${reader}'::uuid`
      : column.field === 'last_active' ? "'2026-10-23 12:00:00+00'::timestamptz" : `null::${column.type}`)
    await db.exec(`set time zone 'UTC'; prepare profile_timezone as select public.user_public_profile_json(${literals.join(',')}) ->> 'last_active' as value`)
    assert.equal((await db.query('execute profile_timezone')).rows[0].value, '2026-10-23T12:00:00+00:00')
    await db.exec("set time zone 'America/New_York'")
    assert.equal((await db.query('execute profile_timezone')).rows[0].value, '2026-10-23T08:00:00-04:00')
    await db.exec("set time zone 'UTC'")
    assert.equal((await db.query('execute profile_timezone')).rows[0].value, '2026-10-23T12:00:00+00:00')
  } finally { await db.close() }
})

test('DM nonparticipants, reciprocal blocks and private saves remain excluded', async () => {
  const db = await setup()
  try {
    await db.exec(repair + restrict)
    await actor(db, outsider)
    for (const name of ['get_dm_message_window', 'get_dm_read_window', 'list_dm_shared_content', 'search_dm_conversation_messages']) {
      const [, sql, parameters] = calls.find(item => item[0] === name)
      await rejected(db, () => db.query(sql, parameters), { code: '42501' })
    }
    assert.equal((await db.query('select * from public.list_my_saved_messages()')).rows.length, 1)
    assert.equal((await db.query('select * from public.list_my_saved_discovery_items()')).rows.length, 0)
    await db.exec('reset role')
    await db.query('insert into public.user_blocks(blocker_id,blocked_id) values($1,$2)', [author, reader])
    await actor(db)
    assert.equal((await db.query('select id from public.users where id=$1', [author])).rows.length, 0)
    await rejected(db, () => db.query(calls[1][1], calls[1][2]), { code: '42501' })
    const summary = (await db.query(calls[5][1], calls[5][2])).rows[0].summary
    assert.equal(summary.reply_count, 0)
    assert.equal(summary.latest_reply_author, null)
    assert.equal((await db.query('select * from public.list_my_saved_discovery_items()')).rows.length, 0)
    const saved = (await db.query('select * from public.list_my_saved_messages()')).rows
    assert.equal(saved.length, 1)
    assert.equal(saved[0].message_source, 'general')
    const search = (await db.query("select * from public.search_my_messages('needle')")).rows
    assert.ok(search.every(row => row.author.id !== author && row.message_source !== 'dm'))
  } finally { await db.close() }
})

test('the guarded repair is idempotent with all 14 exact accepted source hashes', async () => {
  const db = await setup()
  try {
    const before = await metadata(db)
    for (const row of before) {
      const expected = reviewedFunctions.find(item => item.signature.startsWith(`${row.proname}(`))
      assert.equal(createHash('sha256').update(row.prosrc).digest('hex'), expected.beforeProsrcSha256)
    }
    await db.exec(repair)
    const once = await metadata(db)
    await db.exec(repair)
    assert.deepEqual(await metadata(db), once)
  } finally { await db.close() }
})

test('owner-only Connection notifications preserve payload, dedupe and blocked/missing-actor behavior', async () => {
  const db = await setup()
  const connection = uid(60)
  try {
    await db.query("insert into public.user_connections(id,member_low_id,member_high_id,revision,status) values($1,$2,$3,1,'pending')", [connection, reader, author])
    await db.query('insert into public.notification_preferences(user_id,connection_notifications_enabled) values($1,false)', [reader])
    // Mirrors the existing definer caller's inherited owner context; the
    // internal emitter itself stays INVOKER with no API-role execution grant.
    await db.exec(`create function public.fixture_emit_connection(target_actor uuid,event_type text) returns void
      language sql security definer set search_path='' as $$
        select connections_private.emit_connection_notification(c,'${reader}',target_actor,event_type)
        from public.user_connections c where c.id='${connection}' $$`)
    await actor(db)
    await db.query("select public.fixture_emit_connection($1,'connection_request')", [author])
    await db.exec('reset role')
    const before = (await db.query('select user_id,type,entity_id,payload,dedupe_key from public.notification_events')).rows
    assert.equal(before.length, 1)
    assert.equal(before[0].payload.notify, false)
    assert.equal(before[0].payload.actor.id, author)
    await db.exec('delete from public.notification_events')
    await db.exec(repair + restrict)
    await actor(db)
    await db.query("select public.fixture_emit_connection($1,'connection_request')", [author])
    await db.query("select public.fixture_emit_connection($1,'connection_request')", [author])
    await rejected(db, () => db.query(`select connections_private.emit_connection_notification(c,$1,$2,'connection_request')
      from public.user_connections c where id=$3`, [reader, author, connection]), { code: '42501' })
    await db.exec('reset role')
    assert.deepEqual((await db.query('select user_id,type,entity_id,payload,dedupe_key from public.notification_events')).rows, before)
    const access = (await db.query(`select prosecdef,has_function_privilege('authenticated',oid,'execute') authenticated,
      has_function_privilege('anon',oid,'execute') anon,has_function_privilege('service_role',oid,'execute') service_role
      from pg_proc where oid='connections_private.emit_connection_notification(public.user_connections,uuid,uuid,text,text)'::regprocedure`)).rows[0]
    assert.deepEqual(access, { prosecdef: false, authenticated: false, anon: false, service_role: false })
    await db.exec('delete from public.notification_events')
    await db.query('insert into public.user_blocks(blocker_id,blocked_id) values($1,$2)', [author, reader])
    await actor(db)
    await db.query("select public.fixture_emit_connection($1,'connection_accepted')", [author])
    await db.query("select public.fixture_emit_connection($1,'connection_accepted')", [missing])
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int count from public.notification_events')).rows[0].count, 0)
  } finally { await db.close() }
})

for (const mode of ['source drift', 'missing RPC', 'unreviewed whole-row caller']) {
  test(`repair fails atomically on ${mode}`, async () => {
    const db = await setup()
    try {
      if (mode === 'source drift') {
        const signature = profileRpcManifest.functions[0].signature
        const { rows } = await db.query('select pg_get_functiondef($1::regprocedure) definition', [`public.${signature}`])
        await db.exec(rows[0].definition.replace('declare', 'declare\n-- unexpected source revision'))
      } else if (mode === 'missing RPC') {
        await db.exec(`drop function public.${profileRpcManifest.functions[0].signature}`)
      } else {
        await db.exec('create function public.unreviewed_profile_caller() returns jsonb language sql as $$select public.user_public_profile_json(u) from public.users u limit 1$$')
      }
      const before = await metadata(db)
      await rejected(db, () => db.exec(repair), /source drift|is missing|unreviewed INVOKER/)
      assert.deepEqual(await metadata(db), before)
      assert.equal((await db.query('select to_regprocedure($1) value', [scalarSignature])).rows[0].value, null)
    } finally { await db.close() }
  })
}

test('hosted rollback probe executes all 13 RPCs as the exact synthetic member without writes', async () => {
  const db = await setup()
  try {
    const token = 'qa-1792798510354-1234abcd'
    await db.exec(repair + restrict)
    await db.exec('create table auth.users(id uuid,email text)')
    for (const [id, index] of [[reader, 1], [author, 2]]) {
      const email = `${token}.${index}@example.invalid`
      await db.query('insert into auth.users(id,email) values($1,$2)', [id, email])
      await db.query("update public.users set email=$1,username='qa_browser_0123456789' where id=$2", [email, id])
    }
    await db.query('update public.messages set content=$1 where id=$2', [`${token} group text`, uid(12)])
    await db.query('update public.dm_messages set content=$1 where id=$2', [`${token} direct message`, dm])
    await db.exec('commit')
    const fixture = await readFile(new URL('./fixtures/security-phases/profile-rpc-hosted-readonly.sql', import.meta.url), 'utf8')
    const output = await db.exec(fixture.replace('REPLACE_WITH_EXACT_QA_RUN_TOKEN', token))
    assert.ok(output.some(result => result.rows.some(row => row.invoker_rpcs_executed === 13 && row.sensitive_columns_denied === 2)))
    assert.equal((await db.query('select count(*)::int count from public.messages')).rows[0].count, 6)
    assert.equal((await db.query('select current_user name')).rows[0].name, 'postgres')
    await assert.rejects(() => db.exec(fixture), /exact isolated browser fixture run token/)
    await db.exec('rollback')
  } finally { await db.close() }
})
