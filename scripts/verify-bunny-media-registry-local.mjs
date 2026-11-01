// Isolated PostgreSQL verification. No network, accounts or provider writes.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { securityActivationSection } from '../tests/helpers/securityMigrationPhases.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = process.env.SHADOWCHAT_PGLITE_MODULE_PATH || path.join(root, 'node_modules/@electric-sql/pglite/dist/index.js')
const { PGlite } = await import(pathToFileURL(runtime).href)
const db = await PGlite.create()
const owner = '10000000-0000-0000-0000-000000000001'
const other = '20000000-0000-0000-0000-000000000002'
const asset = '30000000-0000-0000-0000-000000000003'
const draft = '40000000-0000-0000-0000-000000000004'
const pin = '50000000-0000-0000-0000-000000000005'
const foreignPin = '60000000-0000-0000-0000-000000000006'
let checks = 0
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }
const denied = async (sql, args, pattern, label) => { await assert.rejects(db.query(sql, args), pattern, label); checks++ }
const role = async (name, id = owner) => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: name, sub: id })])
  if (name !== 'postgres') await db.exec(`set role ${name}`)
}
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema auth;
    grant usage on schema public,auth to authenticated,service_role;
    grant usage on schema private to service_role;
    create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb->>'role' $$;
    create table public.users(id uuid primary key, active boolean default true);
    insert into public.users(id) values('${owner}'),('${other}');
    create function public.is_active_member_for_service(target_user_id uuid) returns boolean language sql stable as
      $$ select exists(select 1 from public.users where id=target_user_id and active) $$;
    create table public.shadow_pin_images(id uuid primary key, creator_id uuid, provider text, provider_asset_id text,
      provider_playback_id text, provider_payload jsonb, media_type text, image_url text, image_path text,
      thumbnail_url text,thumbnail_path text,medium_url text,medium_path text,video_preview_url text,video_playback_url text,
      video_hls_url text,video_embed_url text,title text,deleted_at timestamptz,deleted_by uuid,heart_count integer default 0);
    create table public.shadow_pin_image_hearts(image_id uuid);
    create function public.is_app_operator(target_user_id uuid) returns boolean language sql stable as $$ select false $$;
    create table public.shadow_pin_categories(id uuid primary key);
    create table public.shado_tv_videos(id uuid primary key,created_by uuid,provider_asset_id text,provider_payload jsonb,deleted_at timestamptz);
    create table private.moderation_media_assets(id uuid primary key default gen_random_uuid(),case_id uuid,source_owner_id uuid,
      provider text,status text,library_id text,asset_id uuid,error_code text,captured_at timestamptz);
    create table private.bunny_upload_reservations(library_id text,asset_id uuid);
    create table private.account_deletion_jobs(user_id uuid primary key,state text);
    grant all on all tables in schema public to service_role;
    grant all on private.moderation_media_assets,private.bunny_upload_reservations,private.account_deletion_jobs to service_role;
    grant insert,update,select on public.shadow_pin_images to authenticated;
  `)
  // Use the real Creator ledger DDL, including required fields, provider/state
  // checks, publish manifests, generations and circular ownership references.
  const creatorBackend = await readFile(path.join(root, 'supabase/migrations/20260713003323_shadow_pin_creator_studio_backend.sql'), 'utf8')
  const ledgerStart = creatorBackend.indexOf('CREATE TABLE public.shadow_pin_creator_drafts (')
  const ledgerEnd = creatorBackend.indexOf('CREATE INDEX shadow_pin_creator_drafts_owner_updated_idx', ledgerStart)
  assert.ok(ledgerStart >= 0 && ledgerEnd > ledgerStart)
  await db.exec(creatorBackend.slice(ledgerStart, ledgerEnd))
  await db.exec('alter table public.shadow_pin_creator_drafts add column target_image_content_revision bigint; grant all on public.shadow_pin_creator_drafts,public.shadow_pin_draft_assets to service_role;')
  const pinDomain = await readFile(path.join(root, 'supabase/migrations/20260512203054_shadow_pin_domain.sql'), 'utf8')
  const softDeleteStart = pinDomain.indexOf('CREATE OR REPLACE FUNCTION public.delete_shadow_pin_image(')
  const softDeleteEnd = pinDomain.indexOf('\n$$;', softDeleteStart) + 4
  assert.ok(softDeleteStart >= 0 && softDeleteEnd > softDeleteStart)
  await db.exec(pinDomain.slice(softDeleteStart, softDeleteEnd))
  await db.exec(await readFile(path.join(root, 'supabase/migrations/20261023004143_private_bunny_media_registry.sql'), 'utf8'))
  await db.exec(await securityActivationSection('bunny_pin_identity'))
  await role('authenticated')
  await denied('select * from private.bunny_media_assets', [], /permission denied/, 'registry cannot be read by browser roles')
  await denied('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', ['123', asset, owner, 'shadow_pin_image', pin], /permission denied/, 'browser cannot register authority')
  await denied("insert into public.shadow_pin_images(id,creator_id,provider,provider_asset_id) values($1,$2,'bunny_stream',$3)", [pin, owner, asset], /trusted media provenance/, 'unknown GUID cannot become a native Pin')
  await role('service_role')
  await db.query('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', ['123', asset, owner, 'shadow_pin_draft_asset', draft])
  await db.query('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', ['123', asset, owner, 'shadow_pin_draft_asset', draft])
  equal(await scalar('select count(*)::int from private.bunny_media_assets'), 1, 'same registration is idempotent')
  await denied('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', ['123', asset, other, 'shadow_pin_draft_asset', draft], /cannot be reassigned/, 'registered ownership cannot be reassigned')
  await role('authenticated', other)
  await denied("insert into public.shadow_pin_images(id,creator_id,provider,provider_asset_id) values($1,$2,'bunny_stream',$3)", [foreignPin, other, asset], /trusted media provenance/, 'foreign uploader GUID cannot be borrowed')
  await role('authenticated', owner)
  await db.query("insert into public.shadow_pin_images(id,creator_id,provider,provider_asset_id) values($1,$2,'bunny_stream',$3)", [pin, owner, asset])
  await db.query('update public.shadow_pin_images set title=$1 where id=$2', ['Title remains editable', pin])
  equal(await scalar('select title from public.shadow_pin_images where id=$1', [pin]), 'Title remains editable', 'ordinary native Pin editing is preserved')
  await denied('update public.shadow_pin_images set provider_asset_id=$1 where id=$2', [foreignPin, pin], /trusted media provenance/, 'existing native identity cannot change to an unknown asset')
  await role('service_role')
  equal(await scalar("select count(*)::int from private.bunny_media_assets where source_type='shadow_pin_image' and source_id=$1", [pin]), 1, 'creator publish inherits trusted draft provenance atomically')
  equal(await scalar('select public.can_delete_bunny_media_asset($1,$2,$3)', ['shadow_pin_draft_asset', draft, asset]), false, 'draft cleanup preserves published canonical reference')
  await db.query('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', ['123', asset, other, 'shadow_pin_image', foreignPin])
  equal(await scalar('select public.can_delete_bunny_media_asset($1,$2,$3)', ['shadow_pin_image', pin, asset]), false, 'other owner trusted copy prevents provider deletion')
  await db.query('update public.users set active=false where id=$1', [owner])
  await denied('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', ['123', foreignPin, owner, 'shadow_pin_image', pin], /no longer has active/, 'deleted or pending owner cannot register a new asset')
  await role('postgres')
  equal(await scalar("select prosecdef from pg_proc where oid='public.register_bunny_media_asset(text,uuid,uuid,text,uuid)'::regprocedure"), false, 'service registration does not elevate caller privileges')
  const retentionSql = await readFile(path.join(root, 'supabase/migrations/20261023005759_account_deletion_evidence_retention.sql'), 'utf8')
  const finalDeleteStart = retentionSql.indexOf('create or replace function public.can_delete_bunny_media_asset(')
  const finalDeleteEnd = retentionSql.indexOf('create function private.moderation_purge_bunny_assets(', finalDeleteStart)
  assert.ok(finalDeleteStart >= 0 && finalDeleteEnd > finalDeleteStart, 'load the final held-evidence deletion predicate')
  await db.exec(retentionSql.slice(finalDeleteStart, finalDeleteEnd))
  await db.exec(await readFile(path.join(root, 'supabase/migrations/20261023011311_bunny_media_removal_claims.sql'), 'utf8'))
  await db.query('update public.users set active=true where id=$1', [owner])
  // Reproduce the real Creator lifecycle: finalization retains a publish_ready
  // active asset on the consumed draft; canonical Pin deletion is only soft.
  const creatorAsset = 'a0000000-0000-0000-0000-000000000001'
  const creatorDraft = 'a0000000-0000-0000-0000-000000000002'
  const creatorPin = 'a0000000-0000-0000-0000-000000000003'
  const creatorDraftAsset = 'a0000000-0000-0000-0000-000000000004'
  const extraReference = 'a0000000-0000-0000-0000-000000000005'
  const publishKey = 'a0000000-0000-0000-0000-000000000006'
  const creatorClaimArgs = ['123', creatorAsset, owner, 'shadow_pin_image', creatorPin]
  const creatorClaimSql = 'select public.claim_bunny_media_removal($1,$2,$3,$4,$5)'
  await role('service_role')
  await db.query('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', ['123', creatorAsset, owner, 'shadow_pin_draft_asset', creatorDraftAsset])
  await role('authenticated')
  await db.query("insert into public.shadow_pin_images(id,creator_id,provider,provider_asset_id) values($1,$2,'bunny_stream',$3)", [creatorPin, owner, creatorAsset])
  await role('service_role')
  await db.query("insert into public.shadow_pin_creator_drafts(id,creator_id,source_kind,state,published_image_id,publish_idempotency_key) values($1,$2,'video_upload','published',$3,$4)", [creatorDraft, owner, creatorPin, publishKey])
  await db.query("insert into public.shadow_pin_draft_assets(id,draft_id,creator_id,asset_kind,provider,provider_asset_id,state,final_image_url,final_image_path) values($1,$2,$3,'video','bunny_stream',$4,'publish_ready','https://example.test/poster.webp','posters/test.webp')", [creatorDraftAsset, creatorDraft, owner, creatorAsset])
  await db.query('update public.shadow_pin_creator_drafts set active_asset_id=$1 where id=$2', [creatorDraftAsset, creatorDraft])
  await role('authenticated', other)
  await denied('select public.delete_shadow_pin_image($1)', [creatorPin], /Only the creator or an admin/, 'another member cannot soft-delete the published canonical Pin')
  await role('authenticated', owner)
  await denied("update public.shadow_pin_images set provider_asset_id=null,provider_payload=$1 where id=$2", [{ asset_cleanup: { deletedAt: '2026-11-01T00:00:00Z', bunnyVideoId: creatorAsset } }, creatorPin], /trusted media provenance/, 'browser cannot forge the null provider identity plus completed cleanup receipt')
  equal(await scalar('select deleted_by from public.delete_shadow_pin_image($1)', [creatorPin]), owner, 'ordinary canonical delete returns the original deleting account for cleanup retry fencing')
  await role('service_role')
  await denied(creatorClaimSql, creatorClaimArgs, /retained item/, 'regression: consumed published asset blocks ordinary deleted Pin cleanup before the repair')
  await role('postgres')
  await db.exec(await readFile(path.join(root, 'supabase/migrations/20261101232759_creator_published_video_deletion.sql'), 'utf8'))
  // Load the actual idempotent finalizer and its hardened public wrapper. Only
  // the published path is exercised; it must never reset or republish the Pin.
  const finalizerStart = creatorBackend.indexOf('CREATE OR REPLACE FUNCTION public.finalize_shadow_pin_creator_draft(')
  const finalizerEnd = creatorBackend.indexOf('\n$$;', finalizerStart) + 4
  assert.ok(finalizerStart >= 0 && finalizerEnd > finalizerStart)
  await db.exec(creatorBackend.slice(finalizerStart, finalizerEnd))
  const creatorHardening = await readFile(path.join(root, 'supabase/migrations/20260713042749_shadow_pin_creator_studio_hardening.sql'), 'utf8')
  const wrapperStart = creatorHardening.indexOf('ALTER FUNCTION public.finalize_shadow_pin_creator_draft(')
  const wrapperEnd = creatorHardening.indexOf('CREATE OR REPLACE FUNCTION public.finalize_shadow_pin_creator_bunny_draft(', wrapperStart)
  assert.ok(wrapperStart >= 0 && wrapperEnd > wrapperStart)
  await db.exec(creatorHardening.slice(wrapperStart, wrapperEnd))
  const canDeleteCreator = () => scalar('select public.can_delete_bunny_media_asset($1,$2,$3)', ['shadow_pin_image', creatorPin, creatorAsset])
  await role('authenticated')
  await denied('select public.can_delete_bunny_media_asset($1,$2,$3)', ['shadow_pin_image', creatorPin, creatorAsset], /permission denied/, 'repair does not expose service cleanup to authenticated browsers')
  await role('anon')
  await denied('select public.can_delete_bunny_media_asset($1,$2,$3)', ['shadow_pin_image', creatorPin, creatorAsset], /permission denied/, 'repair does not expose cleanup to anonymous callers')
  await role('service_role')
  equal(await canDeleteCreator(), true, 'consumed published receipt no longer blocks its exact deleted canonical Pin')
  // Each mismatched or still-live reference independently retains the video.
  for (const [sql, args, undoSql, undoArgs, label] of [
    ['update public.shadow_pin_images set deleted_at=null where id=$1', [creatorPin], 'update public.shadow_pin_images set deleted_at=now() where id=$1', [creatorPin], 'live published canonical Pin'],
    ["update public.shadow_pin_creator_drafts set state='ready' where id=$1", [creatorDraft], "update public.shadow_pin_creator_drafts set state='published' where id=$1", [creatorDraft], 'unfinished Creator draft'],
    ['update public.shadow_pin_creator_drafts set active_asset_id=null where id=$1', [creatorDraft], 'update public.shadow_pin_creator_drafts set active_asset_id=$1 where id=$2', [creatorDraftAsset, creatorDraft], 'asset not consumed by the published draft'],
    ['update public.shadow_pin_creator_drafts set published_image_id=$1 where id=$2', [pin, creatorDraft], 'update public.shadow_pin_creator_drafts set published_image_id=$1 where id=$2', [creatorPin, creatorDraft], 'another published Pin receipt'],
    ['update public.shadow_pin_creator_drafts set creator_id=$1 where id=$2', [other, creatorDraft], 'update public.shadow_pin_creator_drafts set creator_id=$1 where id=$2', [owner, creatorDraft], 'foreign draft owner'],
    ['update public.shadow_pin_draft_assets set creator_id=$1 where id=$2', [other, creatorDraftAsset], 'update public.shadow_pin_draft_assets set creator_id=$1 where id=$2', [owner, creatorDraftAsset], 'foreign draft asset owner'],
    ['update public.shadow_pin_images set creator_id=$1 where id=$2', [other, creatorPin], 'update public.shadow_pin_images set creator_id=$1 where id=$2', [owner, creatorPin], 'foreign canonical Pin owner'],
    ['update public.shadow_pin_images set provider_asset_id=$1 where id=$2', [asset, creatorPin], 'update public.shadow_pin_images set provider_asset_id=$1 where id=$2', [creatorAsset, creatorPin], 'different canonical provider identity'],
  ]) {
    await db.query(sql, args)
    equal(await canDeleteCreator(), false, `${label} still prevents provider deletion`)
    await denied(creatorClaimSql, creatorClaimArgs, /retained item/, `${label} cannot obtain a provider removal claim`)
    await db.query(undoSql, undoArgs)
  }
  await db.query("insert into public.shadow_pin_creator_drafts(id,creator_id,source_kind,state) values($1,$2,'video_upload','ready')", [extraReference, owner])
  await db.query("insert into public.shadow_pin_draft_assets(id,draft_id,creator_id,asset_kind,provider,provider_asset_id,state) values($1,$1,$2,'video','bunny_stream',$3,'ready')", [extraReference, owner, creatorAsset])
  await denied(creatorClaimSql, creatorClaimArgs, /retained item/, 'another active draft keeps its media even alongside a consumed published receipt')
  await db.query('delete from public.shadow_pin_draft_assets where id=$1', [extraReference])
  await db.query("insert into public.shadow_pin_images(id,creator_id,provider,provider_asset_id) values($1,$2,'bunny_stream',$3)", [extraReference, owner, creatorAsset])
  await denied(creatorClaimSql, creatorClaimArgs, /retained item/, 'another live Pin keeps a shared video')
  await db.query('delete from public.shadow_pin_images where id=$1', [extraReference])
  for (const payload of [{}, { bunny_stream: { episode: { videoId: creatorAsset } } }, { bunny_stream: { trailer: { videoId: creatorAsset } } }]) {
    await db.query('insert into public.shado_tv_videos(id,created_by,provider_asset_id,provider_payload) values($1,$2,$3,$4)', [extraReference, owner, Object.keys(payload).length ? null : creatorAsset, payload])
    await denied(creatorClaimSql, creatorClaimArgs, /retained item/, 'direct, episode and trailer TV references each prevent published Pin cleanup')
    await db.query('delete from public.shado_tv_videos where id=$1', [extraReference])
  }
  await db.query('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', ['123', creatorAsset, other, 'shadow_pin_image', extraReference])
  await denied(creatorClaimSql, creatorClaimArgs, /retained item/, 'cross-owner trusted media remains protected after canonical soft deletion')
  await db.query('delete from private.bunny_media_assets where source_id=$1', [extraReference])
  await db.query("insert into private.moderation_media_assets(id,provider,status,library_id,asset_id) values($1,'bunny','ready','123',$2)", [extraReference, creatorAsset])
  await denied(creatorClaimSql, creatorClaimArgs, /retained item/, 'reported-media hold still retains a consumed published video')
  await db.query('delete from private.moderation_media_assets where id=$1', [extraReference])
  const creatorClaimId = await scalar(creatorClaimSql, creatorClaimArgs)
  equal(await scalar(creatorClaimSql, creatorClaimArgs), creatorClaimId, 'published Pin removal retries the same durable claim')
  equal(await scalar("select count(*)::int from public.get_trusted_bunny_media_asset('shadow_pin_draft_asset',$1,$2)", [creatorDraftAsset, creatorAsset]), 0, 'pending canonical removal also revokes the consumed draft playback/publish authority')
  await denied('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', ['123', creatorAsset, owner, 'shadow_pin_image', extraReference], /removal has already started/, 'a later publish cannot revive the claimed video')
  await db.query('select public.finish_bunny_media_removal($1)', [creatorClaimId])
  await db.query('update public.shadow_pin_images set provider_asset_id=null,provider_playback_id=null where id=$1', [creatorPin])
  equal(await scalar(creatorClaimSql, creatorClaimArgs), creatorClaimId, 'confirmed removal resumes canonical row cleanup without requiring the consumed draft to be deleted')
  await role('authenticated')
  const publishedRetry = (await db.query('select * from public.finalize_shadow_pin_creator_draft($1,$2,$3)', [creatorDraft, 999, publishKey])).rows[0]
  equal(publishedRetry.was_already_published, true, 'published finalizer remains an idempotent receipt after video removal')
  equal(publishedRetry.draft.state, 'published', 'cleanup never reopens the consumed Creator draft')
  equal(publishedRetry.image.id, creatorPin, 'finalizer retry returns the original canonical Pin')
  equal(Boolean(publishedRetry.image.deleted_at), true, 'finalizer retry preserves canonical soft deletion')
  equal(publishedRetry.image.provider_asset_id, null, 'finalizer retry does not restore the removed provider identity')
  await denied('update public.shadow_pin_images set provider_payload=$1 where id=$2', [{ asset_cleanup: { deletedAt: 'forged', bunnyVideoId: creatorAsset } }, creatorPin], /trusted media provenance/, 'browser cannot rewrite a removed canonical provider receipt')
  await role('postgres')
  equal(await scalar("select prosecdef from pg_proc where oid='public.can_delete_bunny_media_asset(text,uuid,uuid)'::regprocedure"), false, 'repaired deletion predicate remains security invoker')
  const cleanupAsset = '70000000-0000-0000-0000-000000000007'
  const cleanupPin = '80000000-0000-0000-0000-000000000008'
  const latePin = '90000000-0000-0000-0000-000000000009'
  const claimArgs = ['123', cleanupAsset, owner, 'shadow_pin_image', cleanupPin]
  const claimSql = 'select public.claim_bunny_media_removal($1,$2,$3,$4,$5)'
  await role('authenticated')
  await denied(claimSql, claimArgs, /permission denied/, 'browser cannot acquire provider removal authority')
  await denied('select public.finish_bunny_media_removal($1)', [cleanupPin], /permission denied/, 'browser cannot forge deletion completion')
  await denied('select public.anonymize_completed_bunny_removals($1)', [owner], /permission denied/, 'browser cannot erase provider reconciliation ownership')
  await denied('select * from private.bunny_media_removals', [], /permission denied/, 'browser cannot enumerate deletion intents')
  await role('service_role')
  await denied(claimSql, claimArgs, /exact trusted provider ownership/, 'unregistered asset cannot be claimed')
  await db.query('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', claimArgs)
  await denied(claimSql, ['123', cleanupAsset, other, 'shadow_pin_image', cleanupPin], /exact trusted provider ownership/, 'forged owner cannot acquire a claim')
  await denied(claimSql, ['456', cleanupAsset, owner, 'shadow_pin_image', cleanupPin], /exact trusted provider ownership/, 'provider library must match trusted provenance')
  await db.query("insert into public.shadow_pin_images(id,creator_id,provider,provider_asset_id) values($1,$2,'bunny_stream',$3)", [latePin, owner, cleanupAsset])
  await denied(claimSql, claimArgs, /retained item/, 'another canonical Pin prevents a removal claim')
  await db.query('delete from public.shadow_pin_images where id=$1', [latePin])
  await denied(claimSql, ['123', asset, owner, 'shadow_pin_image', pin], /retained item/, 'another owner trusted reference prevents a removal claim')
  // One source can have historical library references. A different library must
  // never make an exact-library evidence hold look eligible for deletion.
  await db.query('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', ['456', cleanupAsset, owner, 'shadow_pin_image', cleanupPin])
  const held = await scalar("insert into private.moderation_media_assets(case_id,source_owner_id,provider,status,library_id,asset_id,captured_at) values($1,$2,'bunny','ready','123',$3,now()) returning id", [pin, owner, cleanupAsset])
  await denied(claimSql, claimArgs, /retained item/, 'existing ready evidence hold prevents exact-library removal')
  equal(await scalar('select count(*)::int from private.bunny_media_removals where asset_id=$1', [cleanupAsset]), 0, 'rejected claims do not leave partial removal intent')
  await db.query('delete from private.moderation_media_assets where id=$1', [held])
  const claimId = await scalar(claimSql, claimArgs)
  equal(await scalar('select state from private.bunny_media_removals where id=$1', [claimId]), 'pending', 'claim is durable before external provider removal')
  await denied('select public.anonymize_completed_bunny_removals($1)', [owner], /Completed account data removal/, 'active account removal record cannot be anonymized early')
  await db.query("insert into private.account_deletion_jobs(user_id,state) values($1,'data_removed')", [owner])
  await denied('select public.anonymize_completed_bunny_removals($1)', [owner], /Pending provider removals/, 'unknown provider outcome keeps reconciliation identity even after member data removal')
  await db.query('delete from private.account_deletion_jobs where user_id=$1', [owner])
  equal(await scalar(claimSql, claimArgs), claimId, 'unknown provider response retries the same exact claim')
  equal(await scalar("select count(*)::int from public.get_trusted_bunny_media_asset('shadow_pin_image',$1,$2) where library_id='123'", [cleanupPin, cleanupAsset]), 0, 'pending removal cannot acquire fresh playback authority')
  equal(await scalar("select count(*)::int from public.get_trusted_bunny_media_asset('shadow_pin_image',$1,$2) where library_id='456'", [cleanupPin, cleanupAsset]), 1, 'different provider library remains independent')
  await db.query("delete from private.bunny_media_assets where library_id='456' and asset_id=$1", [cleanupAsset])
  await denied('select public.register_bunny_media_asset($1,$2,$3,$4,$5)', ['123', cleanupAsset, owner, 'shadow_pin_image', latePin], /removal has already started/, 'new trusted canonical reference cannot race external deletion')
  await role('authenticated')
  await denied("insert into public.shadow_pin_images(id,creator_id,provider,provider_asset_id) values($1,$2,'bunny_stream',$3)", [latePin, owner, cleanupAsset], /removal has already started/, 'Creator Studio publish cannot revive a claimed asset')
  await role('service_role')
  const lateEvidence = await scalar("insert into private.moderation_media_assets(case_id,source_owner_id,provider,status,library_id,asset_id,captured_at) values($1,$2,'bunny','ready','123',$3,now()) returning id", [pin, owner, cleanupAsset])
  equal((await db.query('select status,error_code,captured_at from private.moderation_media_assets where id=$1', [lateEvidence])).rows[0], { status: 'unavailable', error_code: 'source_removal_in_progress', captured_at: null }, 'late report retains an honest unavailable result instead of a false preservation hold')
  await db.query("update private.moderation_media_assets set status='ready',captured_at=now() where id=$1", [lateEvidence])
  equal(await scalar('select status from private.moderation_media_assets where id=$1', [lateEvidence]), 'unavailable', 'late hold cannot be promoted after the insert guard')
  await db.query('select public.finish_bunny_media_removal($1)', [claimId])
  await db.query('select public.finish_bunny_media_removal($1)', [claimId])
  equal(await scalar('select state from private.bunny_media_removals where id=$1', [claimId]), 'removed', 'confirmed removal completion is idempotent')
  equal(await scalar(claimSql, claimArgs), claimId, 'confirmed provider removal can resume an interrupted source-row cleanup')
  equal(await scalar("select count(*)::int from public.get_trusted_bunny_media_asset('shadow_pin_image',$1,$2) where library_id='123'", [cleanupPin, cleanupAsset]), 0, 'removed tombstone continues to deny fresh signing')
  await db.query("update private.moderation_media_assets set status='ready' where id=$1", [lateEvidence])
  equal(await scalar('select status from private.moderation_media_assets where id=$1', [lateEvidence]), 'unavailable', 'removed tombstone continues to deny late evidence holds')
  await denied('select public.finish_bunny_media_removal($1)', [latePin], /claim is unavailable/, 'unknown removal id cannot report success')
  await db.query('update public.users set active=false where id=$1', [owner])
  await denied(claimSql, claimArgs, /no longer has active/, 'pending deletion cannot initiate a separate manual provider action')
  await db.query("insert into private.account_deletion_jobs(user_id,state) values($1,'data_removed')", [owner])
  await db.query('select public.anonymize_completed_bunny_removals($1)', [owner])
  await db.query('select public.anonymize_completed_bunny_removals($1)', [owner])
  equal(await scalar('select owner_id from private.bunny_media_removals where id=$1', [claimId]), null, 'completed account deletion idempotently removes owner linkage')
  equal((await db.query('select library_id,asset_id,state from private.bunny_media_removals where id=$1', [claimId])).rows[0], { library_id: '123', asset_id: cleanupAsset, state: 'removed' }, 'anonymization preserves only the provider tombstone needed to deny asset reuse')
  await role('postgres')
  equal(await scalar("select prosecdef from pg_proc where oid='public.claim_bunny_media_removal(text,uuid,uuid,text,uuid)'::regprocedure"), false, 'manual removal service RPC does not elevate browser privileges')
  console.log(`${checks} Bunny registry/removal PostgreSQL assertions passed; no external state changed.`)
} finally { await db.close() }
