import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import {
  accountDeletionReleaseConfig, assertAccountDeletionReleaseReady,
  buildAccountDeletionReadinessQuery, verifyAccountDeletionReleaseReadiness,
} from '../scripts/verify-account-deletion-release.mjs'

const { PGlite } = process.env.SHADOWCHAT_PGLITE_MODULE_PATH
  ? await import(pathToFileURL(path.resolve(process.env.SHADOWCHAT_PGLITE_MODULE_PATH)).href)
  : await import('@electric-sql/pglite')

const projectRef = 'abcdefghijklmnopqrst'
const environment = { SUPABASE_PROJECT_ID: projectRef, SUPABASE_URL: `https://${projectRef}.supabase.co`, BUNNY_STREAM_LIBRARY_ID: '123' }
const config = accountDeletionReleaseConfig(environment, projectRef)
const ready = () => ({ version: 1, project_ref: projectRef, library_id: '123', provider_associations: 25,
  invalid_provider_associations: 0, unregistered_provider_associations: 0, conflicting_provider_libraries: 0, conflicting_provider_owners: 0,
  live_provider_removal_conflicts: 0, message_fields_requiring_copy: 0, category_paths_requiring_copy: 0 })

test('release target and reviewed provider library are mandatory and cannot be swapped', () => {
  assert.throws(() => accountDeletionReleaseConfig({ ...environment, BUNNY_STREAM_LIBRARY_ID: '' }, projectRef), /reviewed provider/)
  assert.throws(() => accountDeletionReleaseConfig({ ...environment, SUPABASE_URL: 'https://other.supabase.co' }, projectRef), /matching/)
  assert.throws(() => accountDeletionReleaseConfig(environment, 'other'), /Linked Supabase/)
  assert.throws(() => buildAccountDeletionReadinessQuery({ ...config, libraryId: "123';select 1" }), /reviewed provider/)
})

test('each outstanding ownership, provider conflict, forward or cover repair blocks publication', () => {
  assert.equal(assertAccountDeletionReleaseReady(ready(), config).provider_associations, 25)
  for (const field of Object.keys(ready()).filter(field => !['version', 'project_ref', 'library_id', 'provider_associations'].includes(field))) {
    assert.throws(() => assertAccountDeletionReleaseReady({ ...ready(), [field]: 1 }, config), new RegExp(field))
  }
})

test('missing, malformed and wrong-project evidence never acts as a zero result', () => {
  for (const snapshot of [null, {}, { ...ready(), project_ref: 'other' }, { ...ready(), category_paths_requiring_copy: '0' },
    { ...ready(), unregistered_provider_associations: undefined }, { ...ready(), message_fields_requiring_copy: -1 }]) {
    assert.throws(() => assertAccountDeletionReleaseReady(snapshot, config))
  }
})

test('linked verification is a bounded read-only query and failures remain fail-closed', () => {
  let command
  const dependencies = { environment, read: () => projectRef, run: (program, args, options) => {
    command = { program, args, options }
    // Current CLI --output json preserves SELECT rows through a trailing ROLLBACK.
    return JSON.stringify({ boundary: 'database', rows: [{ readiness: ready() }], warning: null })
  } }
  assert.equal(verifyAccountDeletionReleaseReadiness(dependencies).provider_associations, 25)
  assert.deepEqual(command.args.slice(0, 5), ['db', 'query', '--linked', '--output', 'json'])
  assert(command.args[5].startsWith('begin transaction read only;'))
  assert(command.args[5].endsWith('rollback;'))
  assert.equal(command.options.timeout, 60_000)
  assert.throws(() => verifyAccountDeletionReleaseReadiness({ ...dependencies, run: () => { throw new Error('private diagnostic') } }), /No publication/)
  assert.throws(() => verifyAccountDeletionReleaseReadiness({ ...dependencies, run: () => '[]' }), /exactly one/)
})

test('main-only workflow gates before migrations and config while canonical function deployment cannot skip its gate', () => {
  const workflow = readFileSync(new URL('../.github/workflows/netlify-production.yml', import.meta.url), 'utf8')
  const deploy = readFileSync(new URL('../scripts/deploy-supabase-functions.mjs', import.meta.url), 'utf8')
  assert(workflow.includes("if: ${{ github.ref == 'refs/heads/main' && vars.STREAMLINED_BACKEND_ROLLOUT_HOLD != 'true' }}"))
  assert(workflow.includes('cancel-in-progress: false'))
  const pre = workflow.indexOf('Verify deletion preparation before backend changes')
  const migrations = workflow.indexOf('- name: Apply production migrations')
  const post = workflow.indexOf('Recheck deletion preparation before function publication')
  const configStep = workflow.indexOf('- name: Align Supabase Auth and function configuration')
  assert(pre > 0 && pre < migrations && migrations < post && post < configStep)
  const gate = deploy.indexOf('verifyAccountDeletionReleaseReadiness({ workspaceRoot: root })', deploy.indexOf('const deploy ='))
  assert(gate > 0 && gate < deploy.indexOf('const secretEntries', deploy.indexOf('const deploy =')))
  const producers = deploy.indexOf("deployGroup(manifest.active.filter(entry => entry.name !== 'delete-account'))")
  const lastGate = deploy.indexOf('verifyAccountDeletionReleaseReadiness({ workspaceRoot: root })', producers)
  const deletion = deploy.indexOf("deployGroup(manifest.active.filter(entry => entry.name === 'delete-account'))")
  assert(producers > 0 && producers < lastGate && lastGate < deletion)
  assert(deploy.indexOf('deployGroup(manifest.pausedDeny)') < lastGate)
  assert(deploy.indexOf('for (const entry of manifest.pausedRemove)') < lastGate)
})

const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const owner = uuid(900)
const other = uuid(901)

async function readinessDatabase() {
  const db = await PGlite.create()
  await db.exec(`
    create schema private; create schema storage;
    create table public.shadow_pin_images(id uuid primary key,creator_id uuid,provider text,provider_asset_id text,
      provider_payload jsonb,video_embed_url text,deleted_at timestamptz);
    create table public.shadow_pin_draft_assets(id uuid primary key,creator_id uuid,provider text,provider_asset_id text,
      provider_payload jsonb,video_embed_url text,deleted_at timestamptz,state text);
    create table public.shado_tv_videos(id uuid primary key,created_by uuid,provider text,provider_asset_id text,
      provider_payload jsonb,embed_url text,trailer_asset_url text,deleted_at timestamptz);
    create table private.bunny_media_assets(library_id text,asset_id uuid,owner_id uuid,source_type text,source_id uuid);
    create table private.bunny_media_removals(library_id text,asset_id uuid);
    create table public.messages(id uuid primary key,user_id uuid,file_url text,audio_url text,thumbnail_url text,content text,message_type text);
    create table public.dm_messages(id uuid primary key,sender_id uuid,file_url text,audio_url text,thumbnail_url text,content text,message_type text);
    create table public.shadow_pin_categories(id uuid primary key,creator_id uuid,image_path text,thumbnail_path text,medium_path text);
    create table storage.objects(bucket_id text,name text);
  `)
  const register = (sourceType, sourceId, assetId) => db.query('insert into private.bunny_media_assets values($1,$2,$3,$4,$5)',
    ['123', assetId, owner, sourceType, sourceId])
  for (let i = 1; i <= 12; i++) {
    await db.query('insert into public.shadow_pin_images values($1,$2,$3,$4,$5,$6,$7)',
      [uuid(100 + i), owner, 'bunny_stream', uuid(i), {}, `https://player.mediadelivery.net/embed/123/${uuid(i)}`, i === 12 ? '2026-01-01T00:00:00Z' : null])
    await register('shadow_pin_image', uuid(100 + i), uuid(i))
  }
  for (let i = 1; i <= 11; i++) {
    const asset = uuid(i <= 5 ? i : i + 7)
    await db.query('insert into public.shadow_pin_draft_assets values($1,$2,$3,$4,$5,$6,null,$7)',
      [uuid(200 + i), owner, 'bunny_stream', asset, { bunny_stream: { libraryId: '123' } }, `https://player.mediadelivery.net/embed/123/${asset}`, i <= 5 ? 'publish_ready' : 'superseded'])
    await register('shadow_pin_draft_asset', uuid(200 + i), asset)
  }
  await db.query('insert into public.shado_tv_videos values($1,$2,$3,$4,$5,$6,$7,null)',
    [uuid(300), owner, 'bunny_stream', uuid(19), { bunny_stream: { episode: { videoId: uuid(19) }, trailer: { videoId: uuid(20) } } },
      `https://iframe.mediadelivery.net/embed/123/${uuid(19)}`, `https://iframe.mediadelivery.net/embed/123/${uuid(20)}`])
  await register('shado_tv_asset', uuid(300), uuid(19))
  await register('shado_tv_asset', uuid(300), uuid(20))
  // Legacy deleted 404 rows have no canonical provider GUID and are excluded.
  for (const id of [400, 401]) await db.query('insert into public.shadow_pin_images values($1,$2,$3,null,$4,null,now())',
    [uuid(id), owner, 'bunny_stream', { bunny_stream: { videoId: uuid(id + 1) } }])
  return db
}

test('the actual PostgreSQL gate enforces the 25-association rollout contract', async t => {
  const db = await readinessDatabase()
  t.after(() => db.close())
  const snapshot = async () => {
    const results = await db.exec(buildAccountDeletionReadinessQuery(config))
    return results.flatMap(result => result.rows).find(row => row.readiness)?.readiness
  }

  await t.test('covers 20 objects across 25 exact associations including TV trailer and history, and closes the transaction', async () => {
    assert.deepEqual(await snapshot(), ready())
    assert.equal((await db.query('show transaction_read_only')).rows[0].transaction_read_only, 'off')
    await db.exec('create temporary table transaction_closed_proof(id integer); insert into transaction_closed_proof values(1)')
  })

  await t.test('a missing exact backfill and conflicting owner both block even when an exact owner registration exists', async () => {
    await db.query("delete from private.bunny_media_assets where source_type='shado_tv_asset' and asset_id=$1", [uuid(20)])
    assert.equal((await snapshot()).unregistered_provider_associations, 1)
    await db.query('insert into private.bunny_media_assets values($1,$2,$3,$4,$5)', ['123', uuid(20), owner, 'shado_tv_asset', uuid(300)])
    await db.query('insert into private.bunny_media_assets values($1,$2,$3,$4,$5)', ['123', uuid(20), other, 'shadow_pin_image', uuid(999)])
    const conflict = await snapshot()
    assert.equal(conflict.unregistered_provider_associations, 0)
    assert.equal(conflict.conflicting_provider_owners, 1)
    assert.throws(() => assertAccountDeletionReleaseReady(conflict, config), /conflicting_provider_owners=1/)
    await db.query('delete from private.bunny_media_assets where source_id=$1', [uuid(999)])
  })

  await t.test('foreign-prefix General/DM fields and all three cover path fields block until repaired', async () => {
    const media = `${environment.SUPABASE_URL}/storage/v1/object/public/chat-uploads/${other}/legacy.jpg`
    await db.query('insert into public.messages values($1,$2,$3,null,null,null,$4)', [uuid(600), owner, media, 'text'])
    await db.query('insert into public.dm_messages values($1,$2,null,null,null,$3,$4)', [uuid(601), owner, media, 'image'])
    const cover = `${other}/cover.jpg`
    const thumbnail = `${other}/thumbnail.webp`
    const medium = `${other}/medium.webp`
    await db.query('insert into public.shadow_pin_categories values($1,$2,$3,$4,$5)', [uuid(602), owner, cover, thumbnail, medium])
    for (const object of [cover, thumbnail, medium]) await db.query('insert into storage.objects values($1,$2)', ['shadow-pin', object])
    const blocked = await snapshot()
    assert.equal(blocked.message_fields_requiring_copy, 2)
    assert.equal(blocked.category_paths_requiring_copy, 3)
    assert.throws(() => assertAccountDeletionReleaseReady(blocked, config), /message_fields_requiring_copy=2.*category_paths_requiring_copy=3/)
    await db.exec('delete from public.messages; delete from public.dm_messages; delete from public.shadow_pin_categories; delete from storage.objects')
  })

  await t.test('declared libraries and iframe TV embed libraries cannot disagree with the reviewed library', async () => {
    await db.query('update public.shado_tv_videos set trailer_asset_url=$1', [`https://iframe.mediadelivery.net/embed/999/${uuid(20)}`])
    assert.equal((await snapshot()).conflicting_provider_libraries, 1)
    await db.query('update public.shado_tv_videos set trailer_asset_url=$1', [`https://iframe.mediadelivery.net/embed/123/${uuid(20)}`])
    await db.query('update public.shadow_pin_images set provider_payload=$1 where id=$2', [{ bunny_stream: { libraryId: '999' } }, uuid(101)])
    assert.equal((await snapshot()).conflicting_provider_libraries, 1)
    await db.query('update public.shadow_pin_images set provider_payload=$1 where id=$2', [{}, uuid(101)])
  })

  await t.test('historical removed media does not prevent future releases but a live removed source does', async () => {
    await db.query('insert into private.bunny_media_removals values($1,$2)', ['123', uuid(12)])
    assert.equal((await snapshot()).live_provider_removal_conflicts, 0)
    await db.query('insert into private.bunny_media_removals values($1,$2)', ['123', uuid(1)])
    assert.equal((await snapshot()).live_provider_removal_conflicts, 2)
    await db.exec('delete from private.bunny_media_removals')
  })

  await t.test('missing schema errors instead of reporting ready', async () => {
    await db.exec('alter table private.bunny_media_assets rename to deliberately_missing_registry')
    await assert.rejects(snapshot, /bunny_media_assets.*does not exist/)
    // A failed SQL batch exits before its trailing ROLLBACK. The CLI closes its
    // connection on failure; this reused fixture explicitly rolls back instead.
    await db.exec('rollback')
    assert.equal((await db.query('show transaction_read_only')).rows[0].transaction_read_only, 'off')
    await db.exec('alter table private.deliberately_missing_registry rename to bunny_media_assets')
    assert.deepEqual(await snapshot(), ready())
  })
})
