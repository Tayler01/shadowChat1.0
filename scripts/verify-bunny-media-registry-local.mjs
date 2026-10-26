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
      video_hls_url text,video_embed_url text,title text,deleted_at timestamptz);
    create table public.shadow_pin_draft_assets(id uuid primary key,creator_id uuid,provider text,provider_asset_id text,deleted_at timestamptz,state text);
    create table public.shado_tv_videos(id uuid primary key,created_by uuid,provider_asset_id text,provider_payload jsonb,deleted_at timestamptz);
    create table private.moderation_media_assets(id uuid primary key default gen_random_uuid(),case_id uuid,source_owner_id uuid,
      provider text,status text,library_id text,asset_id uuid,error_code text,captured_at timestamptz);
    create table private.bunny_upload_reservations(library_id text,asset_id uuid);
    create table private.account_deletion_jobs(user_id uuid primary key,state text);
    grant all on all tables in schema public to service_role;
    grant all on private.moderation_media_assets,private.bunny_upload_reservations,private.account_deletion_jobs to service_role;
    grant insert,update,select on public.shadow_pin_images to authenticated;
  `)
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
  equal(await scalar('select count(*)::int from private.bunny_media_removals'), 0, 'rejected claims do not leave partial removal intent')
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
