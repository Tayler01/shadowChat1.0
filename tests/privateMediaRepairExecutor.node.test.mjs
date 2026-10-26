import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { buildPrivateMediaRepairPlan } from '../scripts/prepare-private-media-repair.mjs'
import { bindRepairPlan, executeRepair, sha256, objectSql, readRowSql, proveSql, compareAndSwapSql, inventorySql } from '../scripts/private-media-repair-core.mjs'
import { policyGateSql, validatePolicyGate } from '../scripts/private-media-repair-adapter.mjs'

const { PGlite } = await import(process.env.SHADOWCHAT_PGLITE_MODULE_PATH ? pathToFileURL(process.env.SHADOWCHAT_PGLITE_MODULE_PATH).href : '@electric-sql/pglite')
const inventorySource = await readFile(new URL('../supabase/rollout/private-member-media-inventory.sql', import.meta.url), 'utf8')
const ref = 'abcdefghijklmnopqrst'
const origin = `https://${ref}.supabase.co`
const author = '10000000-0000-4000-8000-000000000001'
const owner = '20000000-0000-4000-8000-000000000002'
const rowId = '30000000-0000-4000-8000-000000000003'
const bytes = Buffer.from('independent original image bytes')
const sourcePath = `${owner}/original.jpg`
const url = `${origin}/storage/v1/object/public/shadow-pin/${sourcePath}`
const makeBound = (patch = {}) => {
  const inventory = { version: 1, observedAt: new Date().toISOString(), projectUrl: origin,
    categoryCovers: [], messageReferences: ['file_url', 'thumbnail_url'].map(field => ({ source: 'messages', row_id: rowId, author_id: author, field, url })), ...patch }
  const inventoryBytes = Buffer.from(JSON.stringify(inventory))
  const planBytes = Buffer.from(JSON.stringify(buildPrivateMediaRepairPlan(inventory)))
  return { input: { inventoryBytes, planBytes, projectRef: ref, inventorySha256: sha256(inventoryBytes), planSha256: sha256(planBytes) }, bound: bindRepairPlan({ inventoryBytes, planBytes, projectRef: ref, inventorySha256: sha256(inventoryBytes), planSha256: sha256(planBytes) }) }
}

async function fixture(patch) {
  const { bound } = makeBound(patch)
  const fixtureCopy = bound.plan.copyRequests[0]
  const fixtureUrl = bound.plan.updates[0].fields[0].oldValue
  const db = new PGlite()
  const files = new Map()
  const calls = { hashes: 0, copies: 0, cas: 0, proofs: 0 }
  await db.exec(`create role authenticated;
    create schema storage; create schema auth; create schema private; revoke all on schema private from public;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.allowed_sources(user_id uuid,bucket text,path text);
    create function private.can_read_member_media(target_bucket text,target_path text) returns boolean language plpgsql stable security invoker set search_path='' as $$begin return exists(select 1 from public.allowed_sources where user_id=auth.uid() and bucket=target_bucket and path=target_path); end$$;
    grant execute on function private.can_read_member_media(text,text) to authenticated;
    create table public.messages(id uuid primary key,user_id uuid,file_url text,thumbnail_url text,audio_url text,content text,message_type text default 'image');
    create table public.dm_messages(id uuid,sender_id uuid,file_url text,thumbnail_url text,audio_url text,content text,message_type text);
    create table public.shadow_pin_categories(id uuid,creator_id uuid,image_url text,image_path text);
    create table storage.objects(id uuid primary key,version text,updated_at timestamptz,metadata jsonb,owner uuid,owner_id text,bucket_id text,name text,unique(bucket_id,name));
    grant usage on schema auth,storage to authenticated;
    grant select on public.allowed_sources,public.messages,storage.objects to authenticated;
    alter table public.messages enable row level security;
    alter table storage.objects enable row level security;
    create policy own_row on public.messages to authenticated using(user_id=auth.uid());
    create policy visible_source on storage.objects to authenticated using(exists(select 1 from public.allowed_sources a where a.user_id=auth.uid() and a.bucket=objects.bucket_id and a.path=objects.name) or split_part(name,'/',1)=auth.uid()::text);
  `)
  await db.query('insert into public.messages(id,user_id,file_url,thumbnail_url) values($1,$2,$3,$3)', [rowId, author, fixtureUrl])
  await db.query('insert into public.allowed_sources values($1,$2,$3)', [author, fixtureCopy.bucketId, fixtureCopy.sourceKey])
  const put = async (bucket, name, content, contentType = 'image/jpeg') => {
    files.set(`${bucket}/${name}`, content)
    await db.query('insert into storage.objects values($1,$2,now(),$3,null,null,$4,$5)', [randomUUID(), randomUUID(), JSON.stringify({ size: content.length, mimetype: contentType }), bucket, name])
  }
  await put(fixtureCopy.bucketId, fixtureCopy.sourceKey, bytes)
  const query = async sql => {
    try {
      const results = await db.exec(sql)
      const found = results.flatMap(result => result.rows).filter(row => Object.hasOwn(row, 'repair_result'))
      assert.equal(found.length, 1)
      return found[0].repair_result
    } catch (error) { await db.exec('rollback; reset role;'); throw error }
  }
  const adapter = {
    gate: async () => ({ verified: true, digest: 'a'.repeat(64) }),
    object: (bucket, name) => query(objectSql(bucket, name)),
    readRow: row => query(readRowSql(row)),
    prove: (copy, row) => { calls.proofs++; return query(proveSql(origin, copy, row)) },
    hashObject: async (bucket, name, maximum) => { calls.hashes++; const content = files.get(`${bucket}/${name}`); assert(content && content.length <= maximum); return { size: content.length, sha256: sha256(content) } },
    copy: async copy => { calls.copies++; if (files.has(`${copy.destinationBucket}/${copy.destinationKey}`)) throw new Error('409 exists'); await put(copy.destinationBucket, copy.destinationKey, Buffer.from(files.get(`${copy.bucketId}/${copy.sourceKey}`))) },
    compareAndSwap: (row, confirmed) => { calls.cas++; return query(compareAndSwapSql(origin, row, confirmed)) },
    inventory: () => query(inventorySql(origin, inventorySource)),
  }
  return { bound, db, files, adapter, calls, put, close: () => db.close() }
}
const verify = fixture => executeRepair(fixture.bound, fixture.adapter)
const apply = (fixture, verification, options = {}) => executeRepair(fixture.bound, fixture.adapter, { mode: 'apply', verification, verificationSha256: sha256(JSON.stringify(verification)), ...options })

test('plan binds every reviewed byte and rejects edited SQL, extra copies, wrong project and mismatched inventory', () => {
  const { input } = makeBound()
  for (const mutate of [plan => { plan.updates[0].sql = 'delete from public.users;' }, plan => { plan.copyRequests.push(plan.copyRequests[0]) }]) {
    const plan = JSON.parse(input.planBytes); mutate(plan)
    const planBytes = Buffer.from(JSON.stringify(plan))
    assert.throws(() => bindRepairPlan({ ...input, planBytes, planSha256: sha256(planBytes) }), /differs/)
  }
  assert.throws(() => bindRepairPlan({ ...input, projectRef: 'z'.repeat(20) }), /Project/)
  assert.throws(() => bindRepairPlan({ ...input, inventorySha256: '0'.repeat(64) }), /hash/)
})

test('real RLS denies forged source before any privileged byte read, copy, or CAS', async () => {
  const fx = await fixture()
  try {
    await fx.db.exec('delete from public.allowed_sources')
    await assert.rejects(verify(fx), /not visible/)
    assert.equal(fx.calls.hashes, 0); assert.equal(fx.calls.copies, 0); assert.equal(fx.calls.cas, 0)
  } finally { await fx.close() }
})

test('a broad Storage SELECT policy cannot override the canonical invoker authorization check', async () => {
  const fx = await fixture()
  try {
    await fx.db.exec('delete from public.allowed_sources; create policy accidental_broad_read on storage.objects for select to authenticated using(true);')
    await assert.rejects(verify(fx), /not visible/)
    assert.equal(fx.calls.hashes, 0); assert.equal(fx.calls.copies, 0); assert.equal(fx.calls.cas, 0)
  } finally { await fx.close() }
})

test('read-only verification and real SQL CAS preserve originals and update both unchanged fields exactly once', async () => {
  const fx = await fixture()
  try {
    const evidence = await verify(fx)
    assert.equal(fx.calls.copies, 0); assert.equal(fx.calls.cas, 0)
    assert.equal(evidence.copies[0].source.sha256, sha256(bytes))
    const completed = await apply(fx, evidence)
    assert.equal(completed.complete, true); assert.equal(fx.calls.copies, 1); assert.equal(fx.calls.cas, 1)
    assert.deepEqual(fx.files.get('shadow-pin/' + sourcePath), bytes)
    const row = await fx.adapter.readRow(fx.bound.plan.updates[0])
    assert.equal(row.values.file_url, fx.bound.plan.updates[0].fields[0].newValue)
    assert.equal(row.values.thumbnail_url, row.values.file_url)
  } finally { await fx.close() }
})

test('lost copy response resumes from matching independently verified destination, never overwriting', async () => {
  const fx = await fixture()
  try {
    const evidence = await verify(fx)
    const copy = fx.adapter.copy
    fx.adapter.copy = async value => { await copy(value); throw new Error('connection lost after server commit') }
    await apply(fx, evidence)
    assert.equal(fx.calls.copies, 1); assert.equal(fx.calls.cas, 1)
    await apply(fx, evidence)
    assert.equal(fx.calls.copies, 1); assert.equal(fx.calls.cas, 1)
  } finally { await fx.close() }
})

test('a destination created concurrently with conflicting bytes is preserved and blocks CAS', async () => {
  const fx = await fixture()
  try {
    const evidence = await verify(fx)
    fx.adapter.copy = async copy => { fx.calls.copies++; await fx.put(copy.destinationBucket, copy.destinationKey, Buffer.from('conflicting bytes')); throw new Error('409 collision') }
    await assert.rejects(apply(fx, evidence), /conflicts/)
    assert.equal(fx.calls.cas, 0)
    const copy = fx.bound.plan.copyRequests[0]
    assert.equal(fx.files.get(`${copy.destinationBucket}/${copy.destinationKey}`).toString(), 'conflicting bytes')
    assert.deepEqual(fx.files.get('shadow-pin/' + sourcePath), bytes)
  } finally { await fx.close() }
})

test('a stale row fails atomic CAS and keeps both original and completed copy', async () => {
  const fx = await fixture()
  try {
    const evidence = await verify(fx)
    const cas = fx.adapter.compareAndSwap
    fx.adapter.compareAndSwap = async (...args) => { await fx.db.query('update public.messages set file_url=$1 where id=$2', ['https://edited.example/new.jpg', rowId]); return cas(...args) }
    await assert.rejects(apply(fx, evidence), /exactly one unchanged row/)
    assert.equal(fx.files.size, 2)
    assert.equal((await fx.adapter.readRow(fx.bound.plan.updates[0])).values.file_url, 'https://edited.example/new.jpg')
  } finally { await fx.close() }
})

test('source permission revoked after byte verification blocks the immediate copy check', async () => {
  const fx = await fixture()
  try {
    const evidence = await verify(fx)
    const proof = fx.adapter.prove
    let count = 0
    fx.adapter.prove = async (...args) => { if (++count === 2) await fx.db.exec('delete from public.allowed_sources'); return proof(...args) }
    await assert.rejects(apply(fx, evidence), /revoked/)
    assert.equal(fx.calls.copies, 0); assert.equal(fx.calls.cas, 0)
  } finally { await fx.close() }
})

test('source permission revoked during copying prevents a second privileged source read', async () => {
  const fx = await fixture()
  try {
    const evidence = await verify(fx)
    const copy = fx.adapter.copy
    fx.adapter.copy = async value => { await copy(value); await fx.db.exec('delete from public.allowed_sources') }
    const hashes = fx.calls.hashes
    await assert.rejects(apply(fx, evidence), /revoked after copying/)
    assert.equal(fx.calls.hashes - hashes, 2) // Initial source and independent destination only.
    assert.equal(fx.calls.cas, 0)
    assert.deepEqual(fx.files.get('shadow-pin/' + sourcePath), bytes)
  } finally { await fx.close() }
})

test('CAS re-proves canonical authorization even with a broad Storage SELECT policy', async () => {
  const fx = await fixture()
  try {
    const evidence = await verify(fx)
    const cas = fx.adapter.compareAndSwap
    fx.adapter.compareAndSwap = async (...args) => { await fx.db.exec('delete from public.allowed_sources; create policy accidental_broad_read on storage.objects for select to authenticated using(true);'); return cas(...args) }
    await assert.rejects(apply(fx, evidence), /not visible/)
    assert.equal((await fx.adapter.readRow(fx.bound.plan.updates[0])).values.file_url, url)
  } finally { await fx.close() }
})

test('resume confirms committed rows after a lost CAS response and rejects changed MIME', async () => {
  const fx = await fixture()
  try {
    const evidence = await verify(fx)
    let journal
    const cas = fx.adapter.compareAndSwap
    fx.adapter.compareAndSwap = async (...args) => { await cas(...args); throw new Error('lost response') }
    await assert.rejects(apply(fx, evidence, { checkpoint: value => { journal = value } }), /lost response/)
    fx.adapter.compareAndSwap = cas
    assert.equal((await apply(fx, evidence, { journal })).complete, true)
    assert.equal(fx.calls.cas, 1)
    const copy = fx.bound.plan.copyRequests[0]
    await fx.db.query("update storage.objects set metadata=jsonb_set(metadata,'{mimetype}','\"text/html\"') where bucket_id=$1 and name=$2", [copy.destinationBucket, copy.destinationKey])
    await assert.rejects(apply(fx, evidence), /content type/)
  } finally { await fx.close() }
})

test('missing policies, stale evidence and mutated source bytes stop without copies', async () => {
  const fx = await fixture()
  try {
    const evidence = await verify(fx)
    await assert.rejects(apply(fx, { ...evidence, checkedAt: Date.now() - 86_400_001 }), /24 hours/)
    fx.files.set('shadow-pin/' + sourcePath, Buffer.from('x'.repeat(bytes.length)))
    await assert.rejects(apply(fx, evidence), /Source changed/)
    fx.adapter.gate = async () => ({ verified: false })
    await assert.rejects(verify(fx), /policy gate/)
    assert.equal(fx.calls.copies, 0); assert.equal(fx.calls.cas, 0)
  } finally { await fx.close() }
})

test('final re-inventory reports new unresolved references without extending the reviewed repair', async () => {
  const fx = await fixture()
  try {
    const evidence = await verify(fx)
    const inventory = fx.adapter.inventory
    fx.adapter.inventory = async () => {
      await fx.db.query('insert into public.messages(id,user_id,file_url) values($1,$2,$3)', [randomUUID(), author, url])
      return inventory()
    }
    let journal
    await assert.rejects(apply(fx, evidence, { checkpoint: value => { journal = value } }), /unresolved references/)
    assert.equal(journal.plannedRowsComplete, true); assert.equal(journal.complete, false)
    assert.equal(journal.finalInventory.messageReferences.length, 1)
    assert.equal(fx.calls.copies, 1); assert.equal(fx.calls.cas, 1)
    assert.deepEqual(fx.files.get('shadow-pin/' + sourcePath), bytes)
  } finally { await fx.close() }
})

test('SQL payload delimiters from a valid object path cannot break the guarded transaction', () => {
  const trickyUrl = `${origin}/storage/v1/object/public/shadow-pin/${owner}/raw$repair0$'quote.jpg`
  const { bound } = makeBound({ messageReferences: [{ source: 'messages', row_id: rowId, author_id: author, field: 'file_url', url: trickyUrl }] })
  const row = bound.plan.updates[0]
  const sql = compareAndSwapSql(origin, row, [])
  assert(sql.includes('do $repair1$'))
  assert(sql.includes("raw$repair0$''quote.jpg"))
})

test('adversarial quote, backslash and dollar tags remain inert in real PostgreSQL with nonstandard strings', async () => {
  const hostile = `${origin}/storage/v1/object/public/shadow-pin/${owner}/raw$repair0$';drop table public.messages;--.jpg?note=\\'quoted$repair1$`
  const fx = await fixture({ messageReferences: ['file_url', 'thumbnail_url'].map(field => ({ source: 'messages', row_id: rowId, author_id: author, field, url: hostile })) })
  try {
    await fx.db.exec('set standard_conforming_strings=off;')
    const evidence = await verify(fx)
    await fx.db.exec('set standard_conforming_strings=off;')
    const result = await apply(fx, evidence)
    assert.equal(result.complete, true)
    assert.equal((await fx.db.query('select count(*)::int as count from public.messages')).rows[0].count, 1)
    assert.equal(fx.calls.copies, 1); assert.equal(fx.calls.cas, 1)
  } finally { await fx.close() }
})

test('catalog gate accepts actual staged SQL definitions and rejects widened or stale policies', async () => {
  const db = new PGlite()
  try {
    const sources = {
      can_read_member_media: await readFile(new URL('../supabase/migrations/20261022231053_member_media_visibility_policies.sql', import.meta.url), 'utf8'),
      is_active_member: await readFile(new URL('../supabase/migrations/20261023001140_active_member_access_boundary.sql', import.meta.url), 'utf8'),
    }
    await db.exec(`create role authenticated; create schema private; create schema auth; create schema storage; create schema supabase_migrations;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create table public.users(id uuid); create table private.account_deletion_jobs(user_id uuid);
      create table supabase_migrations.schema_migrations(version text); insert into supabase_migrations.schema_migrations values('20261022231053'),('20261023001140');
      create table storage.objects(bucket_id text,name text);
      create table public.messages(id uuid); create table public.dm_messages(id uuid); create table public.shadow_pin_images(id uuid); create table public.shadow_pin_categories(id uuid);`)
    for (const [name, source] of Object.entries(sources)) {
      const match = source.match(new RegExp(`create (?:or replace )?function private\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'))
      assert(match)
      await db.exec(match[0])
    }
    for (const table of ['storage.objects', 'public.messages', 'public.dm_messages', 'public.shadow_pin_images', 'public.shadow_pin_categories']) {
      await db.exec(`alter table ${table} enable row level security; create policy active_member_required on ${table} as restrictive for all to authenticated using ((select private.is_active_member())) with check ((select private.is_active_member()));`)
    }
    await db.exec(`create policy "Members read visible messaging media" on storage.objects for select to authenticated using(bucket_id in ('chat-uploads','message-media','shadow-pin') and private.can_read_member_media(bucket_id,name));`)
    const catalog = async () => (await db.exec(policyGateSql)).flatMap(value => value.rows).find(row => Object.hasOwn(row, 'repair_result')).repair_result
    const good = await catalog()
    assert.equal(validatePolicyGate(good, sources).verified, true)
    await db.exec('alter policy "Members read visible messaging media" on storage.objects using(true);')
    assert.throws(() => validatePolicyGate(awaitedClone(good, { signingPolicy: 'true' }), sources), /Signing policy/)
    assert.throws(() => validatePolicyGate(awaitedClone(good, { legacyLaunch: true }), sources), /legacy/)
    assert.throws(() => validatePolicyGate(awaitedClone(good, { activePolicies: 4 }), sources), /restrictive/)
    const changed = await catalog()
    assert.throws(() => validatePolicyGate(changed, sources), /Signing policy/)
  } finally { await db.close() }
})

function awaitedClone(value, patch) { return { ...JSON.parse(JSON.stringify(value)), ...patch } }
