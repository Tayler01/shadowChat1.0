import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { securityActivationName, securityActivationSection, securityMigrationsUrl } from './helpers/securityMigrationPhases.mjs'
import { installProfileRpcFixtures } from './helpers/profileRpcFixtures.mjs'

const { PGlite } = await import('@electric-sql/pglite')
const fixtures = new URL('./fixtures/security-phases/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('pre-split-manifest.json', fixtures), 'utf8'))
// Independently authorized additive compatibility work is applied identically
// on both sides; this suite detects only accidental changes from phase ordering.
const companionMigrations = [
  '20261023223132_legacy_account_deletion_compatibility.sql',
  '20261023224207_moderation_retention_removal_claims.sql',
  '20261023224356_legacy_account_deletion_reconciliation.sql',
]
const moved = new Set([
  '20261022231053_member_media_visibility_policies.sql',
  '20261022231052_profile_identity_select_containment.sql',
  '20261022231054_account_deletion_pin_reference.sql',
  '20261023001141_complete_account_deletion.sql',
  '20261023004143_private_bunny_media_registry.sql',
  '20261023004930_private_realtime_authorization.sql',
  '20261023005459_reported_media_evidence.sql',
  '20261023002845_authorized_typing_state.sql',
  '20261023004153_report_target_visibility_boundary.sql',
])
const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const category = '20000000-0000-4000-8000-000000000001'
const caseId = '30000000-0000-4000-8000-000000000001'
const reportId = '30000000-0000-4000-8000-000000000002'
const evidenceId = '30000000-0000-4000-8000-000000000003'
const attachmentId = '30000000-0000-4000-8000-000000000004'
const uuid = number => `40000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const scalar = async (db, sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0]
const readSql = name => readFile(new URL(name, securityMigrationsUrl), 'utf8')
const publicProfileSource = await readFile(new URL('../supabase/functions/_shared/public-profile.ts', import.meta.url), 'utf8')
const securityDefinerAllowlist = JSON.parse(await readFile(new URL('../supabase/security-definer-allowlist.json', import.meta.url), 'utf8'))
const profileProjection = [...publicProfileSource.slice(publicProfileSource.indexOf('PUBLIC_PROFILE_COLUMNS = ['), publicProfileSource.indexOf('] as const'))
  .matchAll(/'([a-z_]+)'/g)].map(match => match[1]).join(',')
assert.ok(profileProjection.startsWith('id,username,'), 'Use the shared explicit full/native profile contract')

async function actor(db, role = 'authenticated', id = owner) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role, sub: id })])
  if (role !== 'postgres') await db.exec(`set role ${role}`)
}

function functionSql(sql, signature) {
  const start = sql.indexOf(signature)
  assert.ok(start >= 0, `Historical function exists: ${signature}`)
  const end = sql.indexOf('\n$$;', start)
  assert.ok(end > start, 'Historical function has its original dollar-quoted body')
  return sql.slice(start, end + 4)
}

async function database(snapshot = {}) {
  const db = new PGlite()
  try {
    await db.exec(await readFile(new URL('bootstrap.sql', fixtures), 'utf8'))
    await installProfileRpcFixtures(db)
    const reporting = (await readSql('20260712003000_member_reporting_case_center.sql')).replaceAll('\r\n', '\n')
    await db.exec(reporting.slice(reporting.indexOf('create table public.member_reports'), reporting.indexOf('create or replace function private.can_read_moderation_attachment(')))
    // The real intake is tested separately; this fixture preserves its exact SQL
    // signature so the new visibility wrapper and its ACLs bind normally.
    await db.exec(`
      create function public.submit_member_report(p_target_type text,p_target_id uuid,p_category text,p_client_report_id uuid,p_details text default '',p_attachments jsonb default '[]')
      returns table(report_id uuid,case_id uuid,case_number bigint,case_status text)
      language sql security definer set search_path='' as $$ select p_client_report_id,p_target_id,1::bigint,'new'::text $$;
      grant select,insert,update,delete on all tables in schema public,storage,realtime to service_role;
      grant usage,select on all sequences in schema public,realtime to service_role;
      grant select,insert,update,delete on public.users,public.messages,public.dm_conversations,public.dm_messages,public.shadow_pin_categories,
        public.shadow_pin_images,public.shadow_pin_comments,storage.objects,realtime.messages to authenticated;
      grant select,insert on realtime.messages to anon;
      grant usage on sequence realtime.messages_id_seq to anon,authenticated;
      alter table public.users enable row level security;
      alter table public.messages enable row level security;
      alter table public.dm_conversations enable row level security;
      alter table public.dm_messages enable row level security;
      alter table public.shadow_pin_categories enable row level security;
      alter table public.shadow_pin_images enable row level security;
      alter table public.shadow_pin_comments enable row level security;
      alter table storage.objects enable row level security;
      alter table realtime.messages enable row level security;
      create policy members on public.users to authenticated using(true) with check(true);
      create policy members on public.messages to authenticated using(true) with check(true);
      create policy members on public.dm_conversations to authenticated using(auth.uid()=any(participants)) with check(auth.uid()=any(participants));
      create policy members on public.dm_messages to authenticated using(exists(select 1 from public.dm_conversations where id=conversation_id)) with check(sender_id=auth.uid());
      create policy members on public.shadow_pin_categories to authenticated using(deleted_at is null) with check(creator_id=auth.uid());
      create policy members on public.shadow_pin_images to authenticated using(deleted_at is null) with check(creator_id=auth.uid());
      create policy members on public.shadow_pin_comments to authenticated using(true) with check(creator_id=auth.uid());
      create policy "Public read for launch buckets" on storage.objects for select to public using(bucket_id in ('avatars','banners','chat-uploads','message-media'));
      create policy "Users can read their own shadow pin uploads" on storage.objects for select to authenticated using(bucket_id='shadow-pin' and split_part(name,'/',1)=auth.uid()::text);
      create policy owner_writes on storage.objects for insert to authenticated with check(owner=auth.uid());
      create policy old_read on realtime.messages for select to anon,authenticated using(true);
      create policy old_write on realtime.messages for insert to anon,authenticated with check(true);
      insert into auth.users values('${owner}'),('${other}');
      insert into public.users(id,username,email,full_name) values('${owner}','owner','synthetic@example.invalid','Synthetic Member'),('${other}','other','other@example.invalid','Other Member');
      insert into public.shadow_pin_categories(id,creator_id,title) values('${category}','${owner}','Synthetic category');
      insert into public.member_reports(id,reporter_user_id,subject_user_id,target_type,target_id,category,client_report_id)
        values('${reportId}','${other}','${owner}','user','${owner}','harassment','${reportId}');
      insert into public.moderation_cases(id,subject_user_id,target_type,target_id,primary_category,status,ack_due_at,resolve_due_at)
        values('${caseId}','${owner}','user','${owner}','harassment','new',now(),now());
      insert into public.moderation_case_reports(case_id,report_id) values('${caseId}','${reportId}');
      insert into public.moderation_evidence(id,case_id,report_id,target_type,target_id,source_author_id,snapshot,content_hash)
        values('${evidenceId}','${caseId}','${reportId}','user','${owner}','${owner}','${JSON.stringify(snapshot).replaceAll("'", "''")}','${'b'.repeat(64)}');
      insert into public.moderation_report_attachments(id,report_id,uploader_user_id,path,name,size_bytes,content_type)
        values('${attachmentId}','${reportId}','${other}','${other}/submitted.jpg','submitted.jpg',90,'image/jpeg');
      insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
        values('moderation-evidence','${other}/submitted.jpg','${other}','${other}','{"size":90,"mimetype":"image/jpeg"}');
      insert into storage.buckets(id,name,public) values('chat-uploads','chat-uploads',true),('message-media','message-media',true),('shadow-pin','shadow-pin',true);
    `)
    const creator = (await readSql('20260713003323_shadow_pin_creator_studio_backend.sql')).replaceAll('\r\n', '\n')
    const hardening = (await readSql('20260713042749_shadow_pin_creator_studio_hardening.sql')).replaceAll('\r\n', '\n')
    await db.exec(functionSql(creator, 'CREATE OR REPLACE FUNCTION public.finalize_shadow_pin_creator_draft(')
      .replace('public.finalize_shadow_pin_creator_draft(', 'private.finalize_shadow_pin_creator_draft_v1('))
    await db.exec(functionSql(hardening, 'CREATE OR REPLACE FUNCTION public.finalize_shadow_pin_creator_draft('))
    await db.exec(functionSql(hardening, 'CREATE OR REPLACE FUNCTION public.finalize_shadow_pin_creator_bunny_draft('))
    return db
  } catch (error) {
    await db.close()
    throw error
  }
}

async function apply(db, original = false) {
  for (const { name, sha256 } of manifest) {
    if (!original && name.startsWith('20261022231052_')) continue
    const sql = original && moved.has(name)
      ? await readFile(new URL(`pre-split/${name}`, fixtures), 'utf8')
      : await readSql(name)
    if (original) assert.equal(createHash('sha256').update(sql).digest('hex'), sha256, `Pre-split source remains immutable: ${name}`)
    try { await db.exec(sql) } catch (error) { throw new Error(`Migration ${name}: ${error.message}`, { cause: error }) }
  }
  for (const name of companionMigrations) {
    const sql = await readSql(name)
    assert.match(sql, /\bbegin\s*;/i, `Companion migration is complete: ${name}`)
    assert.match(sql, /\bcommit\s*;/i, `Companion migration is complete: ${name}`)
    await db.exec(sql)
  }
  // The restricted-column RPC repair is independently required on both paths;
  // it changes arguments only and is tested against the live baseline bodies.
  if (original) {
    // Independent least-privilege repair: preserve legacy private USAGE while
    // isolating the two newly introduced privileged member mutations.
    await db.exec(`
      create schema member_mutation_private;
      revoke all on schema member_mutation_private from public,anon,authenticated,service_role;
      alter function private.set_typing_status_authorized(text,boolean,boolean) set schema member_mutation_private;
      alter function private.submit_member_report_impl(text,uuid,text,uuid,text,jsonb) set schema member_mutation_private;
    `)
    // The pinned CLI splits BEGIN ATOMIC at CASE's END. Apply the independently
    // required RETURN-expression spelling to the original catalog too, while
    // keeping the hashed pre-split migration bytes immutable above. Both forms
    // bind dependencies at definition time and preserve caller-RLS execution.
    for (const name of ['20261023002845_authorized_typing_state.sql', '20261023004153_report_target_visibility_boundary.sql']) {
      const sql = await readSql(name)
      const start = sql.indexOf('create function private.')
      const end = sql.indexOf('\nrevoke all on function', start)
      assert.ok(start >= 0 && end > start)
      await db.exec(sql.slice(start, end).replace('create function private.', 'create or replace function private.'))
    }
    // Local PostgreSQL lint also requires the true STABLE volatility of UTF-8
    // conversion and removal of a redundant integer FOR-loop declaration.
    for (const [name, signature] of [
      ['20261022231053_member_media_visibility_policies.sql', 'create or replace function private.can_read_member_media('],
      ['20261023005459_reported_media_evidence.sql', 'create function private.moderation_storage_url('],
    ]) {
      await db.exec(functionSql(await readSql(name), signature)
        .replace('create function private.', 'create or replace function private.'))
    }
    await db.exec(await securityActivationSection('safe_profile_rpc_arguments'))
    // Independently required handover safety is shared by both final catalogs.
    // Immutable pre-split fixtures still prove the original FK/guard behavior.
    const deletion = (await readSql('20261023001141_complete_account_deletion.sql')).replaceAll('\r\n', '\n')
    await db.exec(functionSql(deletion, 'create function public.begin_account_deletion(')
      .replace('create function public.begin_account_deletion(', 'create or replace function public.begin_account_deletion('))
  }
}

async function publishDraft(db, number, registered = false) {
  const draftId = uuid(number)
  const assetId = uuid(number + 1)
  const providerId = uuid(number + 2)
  const key = uuid(number + 3)
  await actor(db, 'service_role')
  await db.query(`insert into public.shadow_pin_creator_drafts(id,creator_id,category_id,title,publish_idempotency_key)
    values($1,$2,$3,'Fixture video',$4)`, [draftId, owner, category, key])
  await db.query(`insert into public.shadow_pin_draft_assets(id,creator_id,draft_id,provider,provider_asset_id,video_embed_url)
    values($1,$2,$3,'bunny_stream',$4,$5)`, [assetId, owner, draftId, providerId, `https://player.mediadelivery.net/embed/123/${providerId}`])
  if (registered) await db.query('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', ['123', providerId, owner, 'shadow_pin_draft_asset', assetId])
  await actor(db)
  const request = [draftId, 1, key, assetId, null, null, null, `https://player.mediadelivery.net/embed/123/${providerId}`]
  const sql = 'select * from public.finalize_shadow_pin_creator_bunny_draft($1,$2,$3,$4,$5,$6,$7,$8)'
  return { sql, request, providerId, draftId, assetId }
}

async function catalog(db) {
  await actor(db, 'postgres')
  const sql = await readFile(new URL('catalog.sql', fixtures), 'utf8')
  return (await db.query(sql)).rows
}

async function definers(db) {
  await actor(db, 'postgres')
  return (await db.query(`select n.nspname as schema,
    (case when n.nspname='public' then p.proname else n.nspname||'.'||p.proname end)
      ||'('||replace(oidvectortypes(p.proargtypes),', ', ',')||')' as signature,
    pg_get_functiondef(p.oid) as definition,
    has_function_privilege('authenticated',p.oid,'execute') as authenticated,
    has_function_privilege('anon',p.oid,'execute') as anon,
    exists(select 1 from unnest(p.proconfig) setting where setting like 'search_path=%') as pinned_path
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private','member_mutation_private') and p.prosecdef order by n.nspname,p.proname`)).rows
}

test('foundation and activation preserve the complete pre-split SQL catalog', async context => {
  const stagedFiles = (await readdir(securityMigrationsUrl)).filter(name => /^202610\d{8}_.*\.sql$/.test(name)).sort()
  const expectedFiles = [...manifest.map(({ name }) => name).filter(name => !name.startsWith('20261022231052_')),
    ...companionMigrations, securityActivationName].sort()
  assert.deepEqual(stagedFiles, expectedFiles, 'Every staged migration is covered and activation remains last')
  assert.equal(expectedFiles.at(-1), securityActivationName)
  const original = await database()
  const staged = await database()
  try {
    await apply(original, true)
    await apply(staged)
    await staged.exec(await readSql(securityActivationName))
    const stagedCatalog = await catalog(staged)
    assert.deepEqual(stagedCatalog, await catalog(original))
    context.diagnostic(`Compared ${stagedCatalog.length} catalog definitions and privilege entries after 18 reviewed migrations plus three additive safety companions`)
    for (const db of [original, staged]) {
      assert.equal(await scalar(db, 'select count(*)::int from private.moderation_media_assets'), 1)
      assert.equal(await scalar(db, "select status from private.moderation_media_assets where media_key=$1", [`attachment:${attachmentId}`]), 'pending')
      assert.equal(await scalar(db, "select bool_and(public) from storage.buckets where id in ('chat-uploads','message-media','shadow-pin')"), true)
    }
  } finally { await original.close(); await staged.close() }
})

test('every staged privileged function has the exact reviewed allowlist category', async () => {
  const db = await database()
  try {
    const before = new Map((await definers(db)).map(row => [`${row.schema}:${row.signature}`, row.definition]))
    await apply(db)
    await db.exec(await readSql(securityActivationName))
    const after = await definers(db)
    const authenticated = new Set(securityDefinerAllowlist.domains.flatMap(domain => domain.signatures))
    const anon = new Set(securityDefinerAllowlist.anon_signatures)
    const internal = new Set(securityDefinerAllowlist.internal_signatures)
    const privateFunctions = new Set(securityDefinerAllowlist.private_security_definers)
    for (const row of after.filter(row => before.get(`${row.schema}:${row.signature}`) !== row.definition)) {
      assert.equal(row.pinned_path, true, `${row.signature} must pin search_path`)
      if (row.schema === 'private') {
        assert.ok(privateFunctions.has(row.signature), `Missing reviewed private helper: ${row.signature}`)
      } else if (row.schema === 'member_mutation_private') {
        assert.ok(securityDefinerAllowlist.unexposed_security_definers.includes(row.signature), `Missing guarded mutation: ${row.signature}`)
      } else {
        assert.equal(authenticated.has(row.signature), row.authenticated, `Authenticated category: ${row.signature}`)
        assert.equal(anon.has(row.signature), row.anon, `Anonymous category: ${row.signature}`)
        assert.equal(internal.has(row.signature), !row.authenticated && !row.anon, `Internal category: ${row.signature}`)
      }
    }
    const remaining = new Set(after.map(row => `${row.schema}:${row.signature}`))
    for (const key of before.keys()) {
      if (remaining.has(key) || !key.startsWith('public:')) continue
      const signature = key.slice('public:'.length)
      assert.equal(authenticated.has(signature) || anon.has(signature) || internal.has(signature), false,
        `Former definer remains incorrectly exposed in the allowlist: ${signature}`)
    }
  } finally { await db.close() }
})

test('foundation preserves legacy projections, Creator RPC and existing realtime policy behavior', async () => {
  const db = await database()
  try {
    await apply(db)
    assert.equal(await scalar(db, "select count(*)::int from pg_trigger where not tgisinternal and tgname in ('guard_bunny_pin_identity','queue_reported_media','queue_report_attachment','guard_reported_media_storage')"), 0)
    assert.equal(await scalar(db, 'select count(*)::int from private.moderation_media_assets'), 0)
    assert.equal(await scalar(db, "select count(*)::int from pg_policies where schemaname='realtime' and policyname in ('Active members join database and release channels','Constrain member realtime topics','No anonymous private realtime reads','No browser Broadcast or Presence writes')"), 0)
    await actor(db)
    assert.equal(await scalar(db, 'select count(*)::int from public.users'), 2)
    assert.equal((await db.query(`select ${profileProjection} from public.users`)).rows.length, 2)
    assert.equal(await scalar(db, 'select email from public.users where id=$1', [owner]), 'synthetic@example.invalid')
    await db.query("insert into public.messages(id,user_id,content) values($1,$2,'legacy group message')", [uuid(10), owner])
    await db.query('insert into public.dm_conversations(id,participants) values($1,$2)', [uuid(11), [owner, other]])
    await db.query("insert into public.dm_messages(id,sender_id,conversation_id,content) values($1,$2,$3,'legacy DM')", [uuid(12), owner, uuid(11)])
    await db.exec("insert into realtime.messages(extension,topic) values('broadcast','typing:general'),('presence','legacy-lobby')")
    await actor(db, 'authenticated', other)
    assert.equal(await scalar(db, 'select count(*)::int from public.messages'), 1)
    assert.equal(await scalar(db, 'select count(*)::int from public.dm_messages'), 1)
    const legacy = await publishDraft(db, 100)
    const result = (await db.query(legacy.sql, legacy.request)).rows[0]
    assert.equal(result.image.provider_asset_id, legacy.providerId)
    assert.equal(result.was_already_published, false)
    assert.equal((await db.query(legacy.sql, legacy.request)).rows[0].was_already_published, true)
    await actor(db, 'service_role')
    assert.equal(await scalar(db, 'select count(*)::int from private.bunny_media_assets'), 0, 'Legacy publishing is not silently promoted to trusted provenance')
    await assert.rejects(db.query('select public.begin_account_deletion($1,$2)', [owner, 'a'.repeat(64)]), /Existing video ownership must be verified/)
    assert.equal(await scalar(db, 'select count(*)::int from private.account_deletion_jobs'), 0, 'Incomplete historical repair cannot revoke the member during foundation')
  } finally { await db.close() }
})

test('activation atomically rejects historical snapshot media without retained provenance', async () => {
  const db = await database({ imageUrl: 'https://synthetic.invalid/storage/v1/object/public/chat-uploads/old.jpg' })
  try {
    await apply(db)
    await assert.rejects(db.exec(await readSql(securityActivationName)), /Historical report media requires reviewed capture/)
    await db.exec('rollback')
    assert.equal(await scalar(db, "select count(*)::int from pg_trigger where not tgisinternal and tgname='queue_reported_media'"), 0)
    assert.equal(await scalar(db, "select has_table_privilege('authenticated','public.users','SELECT')"), true)
    assert.equal(await scalar(db, 'select count(*)::int from private.moderation_media_assets'), 0)
  } finally { await db.close() }
})

test('foundation preserves old deletion constraints and blocks durable cleanup before capture activation', async () => {
  const db = await database()
  try {
    const restrictions = async () => (await db.query(`select conname,pg_get_constraintdef(oid) as definition
      from pg_constraint where conname in ('messages_pinned_by_fkey','shado_tv_captions_created_by_fkey',
      'shado_live_access_members_added_by_fkey','shado_live_restrictions_created_by_fkey','live_rooms_host_user_id_fkey',
      'live_room_messages_sender_user_id_fkey','user_channel_bans_target_user_id_fkey') order by conname`)).rows
    const before = await restrictions()
    const liveGuard = await scalar(db, "select prosrc from pg_proc where oid='private.reject_shado_live_append_only_mutation()'::regprocedure")
    await apply(db)
    assert.deepEqual(await restrictions(), before)
    assert.equal(await scalar(db, "select prosrc from pg_proc where oid='private.reject_shado_live_append_only_mutation()'::regprocedure"), liveGuard)
    await actor(db, 'service_role')
    await assert.rejects(db.query('select public.begin_account_deletion($1,$2)', [other, 'c'.repeat(64)]), /being upgraded/)
    assert.equal(await scalar(db, 'select count(*)::int from private.account_deletion_jobs'), 0)
    await actor(db, 'postgres')
    assert.equal(await scalar(db, 'select count(*)::int from auth.users'), 2)
    await db.query('insert into public.live_rooms(id,host_user_id) values($1,$2)', [uuid(909), owner])
    await assert.rejects(db.query('delete from auth.users where id=$1', [owner]), /foreign key/)
    assert.equal(await scalar(db, 'select count(*)::int from auth.users'), 2)
  } finally { await db.close() }
})

test('activation retains safe projection and registered Creator publish while denying unknown media and browser broadcasts', async () => {
  const db = await database()
  try {
    await apply(db)
    await db.exec(await readSql(securityActivationName))
    await actor(db)
    assert.equal(await scalar(db, 'select username from public.users where id=$1', [owner]), 'owner')
    assert.equal((await db.query(`select ${profileProjection} from public.users`)).rows.length, 2)
    await assert.rejects(db.query('select email from public.users'), /permission denied/)
    await assert.rejects(db.query('select full_name from public.users'), /permission denied/)
    const unknown = await publishDraft(db, 200)
    await assert.rejects(db.query(unknown.sql, unknown.request), /trusted media provenance/)
    const registered = await publishDraft(db, 300, true)
    const result = (await db.query(registered.sql, registered.request)).rows[0]
    assert.equal(result.image.provider_asset_id, registered.providerId)
    await db.query('update public.shadow_pin_images set title=$1 where id=$2', ['Same full-app editing contract', result.image.id])
    assert.equal((await db.query(registered.sql, registered.request)).rows[0].was_already_published, true)
    await assert.rejects(db.query("insert into realtime.messages(extension,topic) values('broadcast','typing:general')"), /row-level security/)
    await actor(db, 'service_role')
    assert.equal(await scalar(db, "select count(*)::int from private.bunny_media_assets where source_type='shadow_pin_image' and source_id=$1", [result.image.id]), 1)
    await assert.rejects(db.query("delete from storage.objects where bucket_id='moderation-evidence'"), /Reported media must be captured/)
  } finally { await db.close() }
})

test('activation is atomic when a deferred constraint cannot be installed', async () => {
  const db = await database()
  try {
    await apply(db)
    await db.exec('create trigger guard_bunny_pin_identity before insert or update on public.shadow_pin_images for each row execute function private.guard_bunny_pin_identity()')
    const before = await catalog(db)
    await assert.rejects(db.exec(await readSql(securityActivationName)), /already exists/)
    await db.exec('rollback')
    assert.deepEqual(await catalog(db), before, 'Failed activation rolls back the preceding profile revocation')
    assert.equal(await scalar(db, "select has_column_privilege('authenticated','public.users','email','SELECT')"), true)
  } finally { await db.close() }
})
