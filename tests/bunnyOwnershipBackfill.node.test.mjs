import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { approvedMappings, buildBackfill, checkProviders, createAttestation, readAttestation, sourceReadQuery, validateCurrentSources, validateProviderCheck } from '../scripts/prepare-bunny-ownership-backfill.mjs'

const { PGlite } = process.env.SHADOWCHAT_PGLITE_MODULE_PATH
  ? await import(pathToFileURL(path.resolve(process.env.SHADOWCHAT_PGLITE_MODULE_PATH)).href)
  : await import('@electric-sql/pglite')

const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const now = () => new Date()
const hash = 'a'.repeat(64)
const owner = uuid(900)
const other = uuid(901)
const libraryId = '123'
const projectRef = 'abcdefghijklmnopqrst'

function fixture() {
  const objects = new Map()
  const rows = []
  const add = (sourceType, sourceId, assetNumbers, status) => {
    const tv = sourceType === 'shado_tv_asset'
    const embed = id => `https://${tv ? 'iframe' : 'player'}.mediadelivery.net/embed/${libraryId}/${id}`
    const snapshot = { id: sourceId, [tv ? 'created_by' : 'creator_id']: owner, provider: 'bunny_stream', provider_asset_id: uuid(assetNumbers[0]), deleted_at: null }
    if (tv) {
      snapshot.upload_status = status
      snapshot.embed_url = embed(uuid(assetNumbers[0]))
      snapshot.trailer_asset_url = embed(uuid(assetNumbers[1]))
      snapshot.provider_payload = { bunny_stream: { episode: { videoId: uuid(assetNumbers[0]), libraryId }, trailer: { videoId: uuid(assetNumbers[1]), libraryId } } }
    } else {
      snapshot[sourceType === 'shadow_pin_image' ? 'processing_status' : 'state'] = status
      snapshot.video_embed_url = embed(uuid(assetNumbers[0]))
      snapshot.provider_payload = { bunny_stream: { libraryId, untrustedLabel: "owner's \\' caption'; select pg_sleep(60); -- $backfill$ $bunny_backfill$" } }
    }
    rows.push({ sourceType, sourceId, snapshot })
    for (const number of assetNumbers) {
      const assetId = uuid(number)
      const object = objects.get(assetId) ?? { libraryId, assetId, claimedOwnerId: owner, references: [] }
      object.references.push({ sourceType, sourceId, status, deletedAt: null, recordedLibraryId: libraryId, embeddedIdentity: { libraryId, assetId } })
      objects.set(assetId, object)
    }
  }
  for (let i = 1; i <= 12; i++) add('shadow_pin_image', uuid(100 + i), [i], 'ready')
  for (let i = 1; i <= 11; i++) add('shadow_pin_draft_asset', uuid(200 + i), [i <= 5 ? i : i + 7], i <= 5 ? 'publish_ready' : 'superseded')
  add('shado_tv_asset', uuid(300), [19, 20], 'ready')
  const review = { version: 1, projectRef, libraryId, summary: { existingProviderObjects: 20, canonicalSourceAssociations: 25 }, groups: [{ claimedOwnerId: owner, objects: [...objects.values()] }], legacyDeleted404History: [{}, {}] }
  const receipt = { projectRef, libraryId, mappings: approvedMappings(review) }
  const proof = { checkedAt: now().toISOString(), projectRef, libraryId, checks: [...objects.keys()].map(assetId => ({ assetId, libraryId, httpStatus: 200, guidMatches: true, libraryMatches: true })) }
  return { review, receipt, rows, proof }
}

async function database() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema auth;
    grant usage on schema public,auth,private to service_role;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
    create table public.users(id uuid primary key,active boolean default true);
    insert into public.users(id) values('${owner}'),('${other}');
    create function public.is_active_member_for_service(target_user_id uuid) returns boolean language sql stable as
      $$ select exists(select 1 from public.users where id=target_user_id and active) $$;
    create table public.shadow_pin_images(id uuid primary key,creator_id uuid,provider text,provider_asset_id text,
      provider_playback_id text,provider_payload jsonb,media_type text,image_url text,image_path text,thumbnail_url text,
      thumbnail_path text,medium_url text,medium_path text,video_preview_url text,video_playback_url text,
      video_hls_url text,video_embed_url text,processing_status text,deleted_at timestamptz);
    create table public.shadow_pin_draft_assets(id uuid primary key,creator_id uuid,provider text,provider_asset_id text,
      provider_payload jsonb,video_embed_url text,video_hls_url text,video_playback_url text,video_preview_url text,state text,deleted_at timestamptz);
    create table public.shado_tv_videos(id uuid primary key,created_by uuid,provider text,provider_asset_id text,
      provider_payload jsonb,embed_url text,asset_url text,trailer_asset_url text,upload_status text,deleted_at timestamptz);
    create table private.moderation_media_assets(id uuid primary key default gen_random_uuid(),case_id uuid,source_owner_id uuid,
      provider text,status text,library_id text,asset_id uuid,error_code text,captured_at timestamptz);
    create table private.bunny_upload_reservations(library_id text,asset_id uuid);
    create table private.account_deletion_jobs(user_id uuid primary key,state text);
    grant all on all tables in schema public to service_role;
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/20261023004143_private_bunny_media_registry.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../supabase/migrations/20261023011311_bunny_media_removal_claims.sql', import.meta.url), 'utf8'))
  return db
}

test('approval receipt preserves exact reviewed bytes and rejects overwrite or tampering', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bunny-attestation-test-'))
  try {
    const { review, receipt } = fixture()
    const markdown = `Explicit review\n${receipt.mappings.map(m => `${m.ownerId} ${m.sourceId} ${m.assetId}`).join('\n')}\n`
    await writeFile(path.join(dir, 'review.md'), markdown)
    await writeFile(path.join(dir, 'review.json'), JSON.stringify(review))
    const args = [path.join(dir, 'review.md'), path.join(dir, 'review.json'), path.join(dir, 'receipts'), 'All listed ownership mappings are correct', new Date('2026-10-23T00:00:00Z')]
    const result = await createAttestation(...args)
    assert.deepEqual(result.counts, { providerObjects: 20, sourceAssociations: 25, excludedLegacy404Rows: 2 })
    assert.equal((await readAttestation(result.packet)).digest, result.digest)
    await assert.rejects(createAttestation(...args), /EEXIST/)
    assert.equal(await readFile(path.join(result.packet, 'review.md'), 'utf8'), markdown)
    await writeFile(path.join(result.packet, 'review.md'), `${markdown}changed`)
    await assert.rejects(readAttestation(result.packet), /snapshot changed/)
  } finally {
    assert.ok(path.resolve(dir).startsWith(`${path.resolve(os.tmpdir())}${path.sep}bunny-attestation-test-`))
    await rm(dir, { recursive: true, force: true })
  }
})

test('metadata checks use exact GETs and fail closed for missing or mismatched provider identity', async () => {
  const { receipt } = fixture()
  const seen = []
  const proof = await checkProviders(receipt, { apiKey: 'synthetic-only', libraryId, fetchImpl: async (url, options) => {
    seen.push({ url, method: options.method })
    const asset = url.split('/').at(-1)
    return new Response(JSON.stringify({ guid: asset === uuid(20) ? uuid(21) : asset, videoLibraryId: 123 }), { status: 200 })
  } })
  assert.equal(seen.length, 20)
  assert.ok(seen.every(r => r.method === 'GET' && r.url.startsWith('https://video.bunnycdn.com/library/123/videos/')))
  assert.throws(() => validateProviderCheck(receipt, proof), /missing or identity mismatch/)
  proof.checks.at(-1).guidMatches = true
  validateProviderCheck(receipt, proof)
  assert.throws(() => validateProviderCheck(receipt, { ...proof, checkedAt: '2000-01-01T00:00:00Z' }), /stale/)
  assert.throws(() => validateProviderCheck(receipt, { ...proof, checkedAt: '2999-01-01T00:00:00Z' }), /future/)
  assert.throws(() => validateProviderCheck(receipt, { ...proof, checks: proof.checks.slice(1) }), /coverage/)
})

test('actual PostgreSQL backfill gates, rollback, idempotency and verification', async t => {
  const db = await database()
  try {
    const { receipt, rows, proof } = fixture()
    const table = { shadow_pin_image: 'shadow_pin_images', shadow_pin_draft_asset: 'shadow_pin_draft_assets', shado_tv_asset: 'shado_tv_videos' }
    for (const row of rows) {
      const keys = Object.keys(row.snapshot)
      await db.query(`insert into public.${table[row.sourceType]}(${keys.join(',')}) values(${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row.snapshot))
    }
    await db.exec('set standard_conforming_strings=off')
    const sourceRead = (await db.exec(sourceReadQuery(receipt))).find(result => result.rows.length)?.rows[0]
    // The query-returned timestamp uses Date locally and an ISO string in MCP JSON.
    sourceRead.observedAt = new Date(sourceRead.observedAt).toISOString()
    assert.equal(validateCurrentSources(receipt, sourceRead).length, 24)
    const backfill = buildBackfill({ receipt, digest: hash }, sourceRead, proof)
    const count = async () => (await db.query('select count(*)::int as count from private.bunny_media_assets')).rows[0].count
    const denied = async (sql, pattern) => {
      await assert.rejects(db.exec(sql), pattern)
      await db.exec('rollback')
    }
    await t.test('requires the exact operator acknowledgement', async () => {
      await denied(backfill.sql, /Exact attestation acknowledgement/)
      assert.equal(await count(), 0)
      await db.exec(`set shadowchat.bunny_backfill_attestation='${hash}'`)
    })
    await t.test('missing staged migration aborts before any write', async () => {
      await db.exec('alter table private.bunny_media_removals rename to temporarily_absent')
      await denied(backfill.sql, /migrations are absent/)
      assert.equal(await count(), 0)
      await db.exec('alter table private.temporarily_absent rename to bunny_media_removals')
    })
    await t.test('provider proof expiry is enforced by PostgreSQL at execution', async () => {
      const old = new Date('2000-01-01T00:00:00Z')
      const stale = buildBackfill({ receipt, digest: hash }, sourceRead, { ...proof, checkedAt: old.toISOString() }, old)
      await denied(stale.sql, /Provider proof expired/)
      assert.equal(await count(), 0)
    })
    await t.test('changed source after preparation rejects the entire batch', async () => {
      await db.query('update public.shadow_pin_images set video_embed_url=$1 where id=$2', ['https://example.invalid/changed', uuid(101)])
      await denied(backfill.sql, /source identity changed/)
      assert.equal(await count(), 0)
      await db.query('update public.shadow_pin_images set video_embed_url=$1 where id=$2', [rows.find(r => r.sourceId === uuid(101)).snapshot.video_embed_url, uuid(101)])
      const changed = structuredClone(sourceRead)
      changed.rows[0].snapshot.provider_asset_id = uuid(999)
      assert.throws(() => buildBackfill({ receipt, digest: hash }, changed, proof), /identity drift/)
    })
    await t.test('a late registration failure rolls back earlier successful inserts', async () => {
      await db.exec(`create function private.reject_test_registration() returns trigger language plpgsql as $$ begin if new.asset_id='${uuid(12)}'::uuid then raise exception 'synthetic late failure'; end if; return new; end $$; create trigger zz_test_failure before insert on private.bunny_media_assets for each row execute function private.reject_test_registration()`)
      await denied(backfill.sql, /synthetic late failure/)
      assert.equal(await count(), 0)
      await db.exec('drop trigger zz_test_failure on private.bunny_media_assets; drop function private.reject_test_registration()')
    })
    await t.test('exact batch is idempotent with 20 objects and 25 associations', async () => {
      await db.exec(backfill.sql)
      await db.exec(backfill.sql)
      assert.equal(await count(), 25)
      assert.deepEqual((await db.query('select provider_payload from public.shadow_pin_images where id=$1', [uuid(101)])).rows[0].provider_payload, rows.find(r => r.sourceId === uuid(101)).snapshot.provider_payload)
      const verification = (await db.exec(backfill.verify)).find(r => r.rows.length)?.rows[0]
      assert.deepEqual(verification, { source_drift: 0, expected_associations: 25, exact_registered: 25, missing: 0, conflicting: 0, cross_source_owner_conflicts: 0, removal_started: 0, inactive: 0 })
    })
    await t.test('cross-source conflicting ownership cannot produce clean verification', async () => {
      await db.query('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', [libraryId, uuid(1), other, 'shadow_pin_image', uuid(999)])
      const verification = (await db.exec(backfill.verify)).find(r => r.rows.length)?.rows[0]
      assert.ok(verification.cross_source_owner_conflicts > 0)
      await denied(backfill.sql, /Conflicting trusted provider ownership/)
      assert.equal(await count(), 26)
      await db.query('delete from private.bunny_media_assets where source_id=$1', [uuid(999)])
    })
    await t.test('removal intent and inactive membership block renewed registration', async () => {
      await db.query("insert into private.bunny_media_removals(library_id,asset_id,owner_id,source_type,source_id) values($1,$2,$3,'shadow_pin_image',$4)", [libraryId, uuid(1), owner, uuid(101)])
      await denied(backfill.sql, /removal has started/)
      assert.equal(await count(), 25)
      await db.exec('delete from private.bunny_media_removals')
      await db.query('update public.users set active=false where id=$1', [owner])
      await denied(backfill.sql, /owner is not active/)
      assert.equal(await count(), 25)
    })
  } finally { await db.close() }
})
