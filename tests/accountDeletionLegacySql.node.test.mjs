import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const { PGlite } = process.env.SHADOWCHAT_PGLITE_MODULE_PATH
  ? await import(pathToFileURL(path.resolve(process.env.SHADOWCHAT_PGLITE_MODULE_PATH)).href)
  : await import('@electric-sql/pglite')
const member = '10000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000002'
const admin = '30000000-0000-4000-8000-000000000003'
const receipt = 'a'.repeat(64)
const bearer = 'b'.repeat(64)
const refreshedBearer = 'c'.repeat(64)
const generatedReceipt = 'd'.repeat(64)
const readMigration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
const section = (source, start, end) => {
  assert.ok(source.indexOf(start) >= 0 && source.indexOf(end) > source.indexOf(start))
  return source.slice(source.indexOf(start), source.indexOf(end))
}

// Load real durable-job creation and receipt lookup functions, with only their
// unrelated application tables represented by an empty synthetic schema.
async function fixture() {
  const db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema storage;
    grant usage on schema public,storage to anon,authenticated,service_role;
    create table public.users(id uuid primary key);
    create table public.user_roles(user_id uuid,role text);
    create table public.shadow_pin_categories(id uuid,creator_id uuid,image_path text,thumbnail_path text,medium_path text);
    create table public.shadow_pin_images(id uuid,creator_id uuid,provider text,provider_asset_id text,thumbnail_path text,medium_path text);
    create table public.shadow_pin_draft_assets(id uuid,creator_id uuid,provider text,provider_asset_id text);
    create table public.shado_tv_videos(id uuid,created_by uuid,provider text,provider_asset_id text);
    create table private.bunny_media_assets(library_id text,asset_id uuid,owner_id uuid,source_type text,source_id uuid);
    create table storage.objects(bucket_id text,name text,owner uuid,owner_id text);
    create table public.moderation_report_attachments(bucket text,path text);
    create table public.moderation_evidence(id uuid);
    -- This receipt-focused fixture models capture availability only. Actual
    -- trigger enforcement and the disabled-handover case run in phase SQL tests.
    create function private.fixture_capture_ready() returns trigger language plpgsql as $$begin return new; end;$$;
    create trigger queue_reported_media after insert on public.moderation_evidence for each row execute function private.fixture_capture_ready();
    create trigger queue_report_attachment after insert on public.moderation_report_attachments for each row execute function private.fixture_capture_ready();
    create trigger guard_reported_media_storage before update on storage.objects for each row execute function private.fixture_capture_ready();
    create table public.live_rooms(id uuid,host_user_id uuid,provider_room_name text);
    create table public.live_room_participants(room_id uuid,user_id uuid);
    grant select on all tables in schema public,storage,private to service_role;
    grant update on public.users,public.user_roles to service_role;
    insert into public.users values('${member}'),('${other}'),('${admin}');
    insert into public.user_roles values('${admin}','admin');
  `)
  const access = await readMigration('20261023001140_active_member_access_boundary.sql')
  await db.exec(section(access, 'create table private.account_deletion_jobs', 'create function private.is_active_member'))
  const deletion = await readMigration('20261023001141_complete_account_deletion.sql')
  await db.exec(section(deletion, 'create function public.begin_account_deletion', 'create function public.checkpoint_account_deletion'))
  await db.exec(section(deletion, 'create function public.prune_account_deletion_receipts()', 'revoke all on function public.begin_account_deletion'))
  await db.exec(`
    revoke all on function public.begin_account_deletion(uuid,text), public.get_account_deletion_job(text), public.prune_account_deletion_receipts() from public,anon,authenticated;
    grant execute on function public.begin_account_deletion(uuid,text), public.get_account_deletion_job(text), public.prune_account_deletion_receipts() to service_role;
  `)
  await db.exec(await readMigration('20261023223132_legacy_account_deletion_compatibility.sql'))
  const scalar = async (sql, parameters = []) => Object.values((await db.query(sql, parameters)).rows[0])[0]
  const service = () => db.exec('reset role; set role service_role')
  const start = (id = member, tokenDigest = bearer, newReceipt = generatedReceipt) => scalar('select public.begin_legacy_account_deletion($1,$2,$3)', [id, tokenDigest, newReceipt])
  const get = tokenDigest => scalar('select public.get_legacy_account_deletion_job($1)', [tokenDigest])
  await service()
  return { db, scalar, service, start, get }
}

test('pre-activation legacy requests leave both durable jobs and bearer bindings absent', async () => {
  const fx = await fixture()
  try {
    await fx.db.exec('reset role; drop trigger queue_reported_media on public.moderation_evidence; set role service_role')
    await assert.rejects(fx.start(), /being upgraded/)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_jobs'), 0)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_legacy_bearers'), 0)
    assert.equal(await fx.scalar('select count(*)::int from public.users'), 3)
  } finally { await fx.db.close() }
})

test('legacy start creates the real durable manifest and repeated/refreshed bearers preserve an explicit receipt', async () => {
  const fx = await fixture()
  try {
    await fx.scalar('select public.begin_account_deletion($1,$2)', [member, receipt])
    assert.equal((await fx.start()).state, 'requested')
    await fx.start(member, refreshedBearer, 'e'.repeat(64))
    await fx.start()
    assert.equal(await fx.scalar('select receipt_digest from private.account_deletion_jobs where user_id=$1', [member]), receipt)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_jobs'), 1)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_legacy_bearers'), 2)
    assert.deepEqual(await fx.get(bearer), await fx.get(refreshedBearer))
    assert.deepEqual(await fx.get(bearer), await fx.scalar('select public.get_account_deletion_job($1)', [receipt]))
    assert.equal(Object.keys(await fx.get(bearer)).includes('receipt_digest'), false)
  } finally { await fx.db.close() }
})

test('new legacy start enforces the real full-admin and ownership guards before binding a credential', async () => {
  const fx = await fixture()
  try {
    await assert.rejects(() => fx.start(admin), /Transfer full admin/)
    await fx.db.exec('reset role')
    await fx.db.query('insert into public.shadow_pin_categories values($1,$2,$3,null,null)', [other, other, `${member}/shared-cover.jpg`])
    await fx.service()
    await assert.rejects(() => fx.start(), /re-homed/)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_jobs'), 0)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_legacy_bearers'), 0)
  } finally { await fx.db.close() }
})

test('a credential cannot switch accounts and a failed bind rolls back a newly created second job', async () => {
  const fx = await fixture()
  try {
    await fx.start()
    await assert.rejects(() => fx.start(other, bearer, 'f'.repeat(64)), /already bound/)
    assert.equal((await fx.get(bearer)).user_id, member)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_jobs'), 1)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_jobs where user_id=$1', [other]), 0)
    assert.equal(await fx.get('0'.repeat(64)), null)
  } finally { await fx.db.close() }
})

test('browser roles cannot invoke legacy RPCs, enumerate hashes or bind their own aliases', async () => {
  const fx = await fixture()
  try {
    await fx.start()
    for (const role of ['anon', 'authenticated']) {
      await fx.db.exec(`reset role; set role ${role}`)
      await assert.rejects(() => fx.start(), /permission denied/)
      await assert.rejects(() => fx.get(bearer), /permission denied/)
      await assert.rejects(() => fx.db.query('select * from private.account_deletion_legacy_bearers'), /permission denied/)
      await assert.rejects(() => fx.db.query('insert into private.account_deletion_legacy_bearers values($1,$2,now())', [refreshedBearer, member]), /permission denied/)
    }
    await fx.service()
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_legacy_bearers'), 1)
  } finally { await fx.db.close() }
})

test('completed legacy aliases honor receipt expiry and are removed by the existing prune cascade', async () => {
  const fx = await fixture()
  try {
    await fx.start()
    await fx.db.query("update private.account_deletion_jobs set state='completed',manifest='{}',completed_at=now()-interval '2 days',receipt_expires_at=now()+interval '1 minute' where user_id=$1", [member])
    assert.deepEqual(await fx.get(bearer), { user_id: member, state: 'completed', manifest: {} })
    await fx.db.query("update private.account_deletion_jobs set receipt_expires_at=now()-interval '1 day' where user_id=$1", [member])
    assert.equal(await fx.get(bearer), null)
    assert.equal(await fx.scalar('select public.prune_account_deletion_receipts()'), 1)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_legacy_bearers'), 0)
  } finally { await fx.db.close() }
})

test('null, malformed and unknown-user starts fail without a durable job or credential', async () => {
  const fx = await fixture()
  try {
    for (const input of [[null, bearer, generatedReceipt], [member, null, generatedReceipt], [member, bearer, null], [member, 'bad', generatedReceipt], [member, bearer, 'bad']]) {
      await assert.rejects(() => fx.start(...input), /Invalid deletion request/)
    }
    await assert.rejects(() => fx.start('40000000-0000-4000-8000-000000000004'), /profile is missing/)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_jobs'), 0)
    assert.equal(await fx.scalar('select count(*)::int from private.account_deletion_legacy_bearers'), 0)
  } finally { await fx.db.close() }
})
