/** Synthetic PostgreSQL enforcement tests; never connects to the linked project. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { assertAccountDeletionReleaseReady, buildAccountDeletionReadinessQuery } from './verify-account-deletion-release.mjs'
import { securityActivationSection } from '../tests/helpers/securityMigrationPhases.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = process.env.SHADOWCHAT_PGLITE_MODULE_PATH || path.join(root, 'node_modules/@electric-sql/pglite/dist/index.js')
const { PGlite } = await import(pathToFileURL(runtime).href)
const db = await PGlite.create()
const member = '10000000-0000-0000-0000-000000000001'
const other = '20000000-0000-0000-0000-000000000002'
const admin = '30000000-0000-0000-0000-000000000003'
const unknown = '40000000-0000-0000-0000-000000000004'
const category = '50000000-0000-0000-0000-000000000005'
const ownPin = '60000000-0000-0000-0000-000000000006'
const otherPin = '70000000-0000-0000-0000-000000000007'
const video = '80000000-0000-0000-0000-000000000008'
const room = '90000000-0000-0000-0000-000000000009'
const report = 'a0000000-0000-0000-0000-000000000001'
const caseId = 'a0000000-0000-0000-0000-000000000002'
const action = 'a0000000-0000-0000-0000-000000000003'
const ban = 'a0000000-0000-0000-0000-000000000004'
const reservation = 'b0000000-0000-0000-0000-000000000001'
const lateAsset = 'b0000000-0000-0000-0000-000000000002'
const sharedAsset = 'b0000000-0000-0000-0000-000000000003'
const capturedFile = 'c0000000-0000-0000-0000-000000000001'
const capturedAttachment = 'c0000000-0000-0000-0000-000000000002'
const heldVideo = 'c0000000-0000-0000-0000-000000000003'
const pendingRemoval = 'd0000000-0000-0000-0000-000000000001'
const removedAsset = 'd0000000-0000-0000-0000-000000000002'
const receipt = 'a'.repeat(64)
let checks = 0
const equal = (actual, expected, note) => { assert.deepEqual(actual, expected, note); checks++ }
const query = async (sql, params = []) => (await db.query(sql, params)).rows
const scalar = async (sql, params = []) => Object.values((await query(sql, params))[0])[0]
const rejects = async (sql, params, pattern, note) => {
  await assert.rejects(() => db.query(sql, params), pattern, note); checks++
}
const actor = async (id, role = 'authenticated') => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, role })])
  await db.exec(`set role ${role}`)
}
const service = () => db.exec("reset role; select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); set role service_role")
const migration = async name => db.exec(await readFile(path.join(root, 'supabase/migrations', name), 'utf8'))
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
    create schema private; create schema auth; create schema storage; create schema realtime;
    grant usage on schema public,auth,storage,realtime to anon,authenticated,service_role;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
    create table auth.users(id uuid primary key);
    create table public.users(id uuid primary key references auth.users(id) on delete cascade,username text);
    create table public.user_roles(user_id uuid primary key references public.users(id) on delete cascade,role text);
    create table public.messages(id uuid primary key,user_id uuid references public.users(id) on delete cascade,content text,
      pinned_by uuid constraint messages_pinned_by_fkey references public.users(id),reply_to uuid references public.messages(id) on delete set null);
    create table public.dm_messages(id uuid primary key,sender_id uuid references public.users(id) on delete cascade,content text);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb default '{}');
    create table realtime.messages(id integer primary key,payload jsonb);
    create table public.shadow_pin_categories(id uuid primary key,creator_id uuid references public.users(id) on delete set null,
      title text,description text,image_url text,image_path text,thumbnail_url text,thumbnail_path text,medium_url text,medium_path text,deleted_at timestamptz);
    create table public.shadow_pin_images(id uuid primary key,category_id uuid references public.shadow_pin_categories(id) on delete set null,
      creator_id uuid references public.users(id) on delete set null,image_url text,image_path text,thumbnail_url text,thumbnail_path text,medium_url text,medium_path text,
      provider text,provider_asset_id text,created_at timestamptz default now());
    create table public.shadow_pin_draft_assets(id uuid primary key,creator_id uuid references public.users(id) on delete cascade,provider text,provider_asset_id text);
    create table private.bunny_media_assets(library_id text,asset_id uuid,owner_id uuid references public.users(id) on delete cascade,source_type text,source_id uuid);
    grant select,insert,update,delete on private.bunny_media_assets to service_role;
    create table public.shado_tv_channels(id uuid primary key,created_by uuid references public.users(id) on delete set null,
      title text,slug text,tagline text,description text,ticket_asset_url text,hero_asset_url text,ticket_asset_path text,hero_asset_path text);
    create table public.shado_tv_videos(id uuid primary key,created_by uuid references public.users(id) on delete set null,provider text,provider_asset_id text);
    create table public.shado_tv_captions(id uuid primary key,video_id uuid references public.shado_tv_videos(id) on delete cascade,
      created_by uuid not null constraint shado_tv_captions_created_by_fkey references auth.users(id) on delete restrict,storage_path text);
    create table public.shado_live_access_members(user_id uuid references public.users(id) on delete cascade,
      added_by uuid not null constraint shado_live_access_members_added_by_fkey references public.users(id) on delete restrict);
    create table public.shado_live_restrictions(target_user_id uuid references public.users(id) on delete cascade,
      created_by uuid not null constraint shado_live_restrictions_created_by_fkey references public.users(id) on delete restrict);
    create table public.live_rooms(id uuid primary key,host_user_id uuid not null constraint live_rooms_host_user_id_fkey references public.users(id) on delete restrict,
      provider_room_name text,title text,description text,status text,ended_at timestamptz,host_disconnected_at timestamptz,host_grace_expires_at timestamptz,
      ended_reason text,revision integer default 1,updated_at timestamptz default now());
    create table public.live_room_participants(room_id uuid references public.live_rooms(id),user_id uuid references public.users(id) on delete cascade);
    create table public.live_room_messages(id uuid primary key,room_id uuid references public.live_rooms(id),
      sender_user_id uuid not null constraint live_room_messages_sender_user_id_fkey references public.users(id) on delete restrict,content text);
    create table public.live_room_events(id uuid primary key,room_id uuid references public.live_rooms(id) on delete set null,
      actor_user_id uuid references public.users(id) on delete set null,target_user_id uuid references public.users(id) on delete set null,metadata jsonb default '{}');
    create table public.live_provider_operations(id uuid primary key,room_id uuid references public.live_rooms(id),
      actor_user_id uuid references public.users(id) on delete set null,target_user_id uuid references public.users(id) on delete set null,request_payload jsonb);
    create table public.live_provider_webhook_receipts(event_id text primary key,room_id uuid references public.live_rooms(id) on delete set null,
      participant_user_id uuid references public.users(id) on delete set null,participant_identity text,payload jsonb);
    create function private.reject_shado_live_append_only_mutation() returns trigger language plpgsql security definer set search_path='' as $$begin raise exception 'append-only'; end;$$;
    create trigger live_events_immutable before update or delete on public.live_room_events for each row execute function private.reject_shado_live_append_only_mutation();
    create trigger live_receipts_immutable before update or delete on public.live_provider_webhook_receipts for each row execute function private.reject_shado_live_append_only_mutation();
    create table public.user_channel_bans(id uuid primary key,target_user_id uuid not null constraint user_channel_bans_target_user_id_fkey references public.users(id) on delete cascade,reason text);
    create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end;$$;
  `)
  const moderation = await readFile(path.join(root, 'supabase/migrations/20260712003000_member_reporting_case_center.sql'), 'utf8')
  await db.exec(moderation.slice(moderation.indexOf('create table public.member_reports'), moderation.indexOf('create or replace function private.can_operator_access_moderation_case')))
  await db.exec(`
    grant all on all tables in schema public,storage,realtime to service_role;
    grant usage,select on all sequences in schema public to service_role;
    alter table public.users enable row level security;
    alter table public.messages enable row level security;
    alter table public.dm_messages enable row level security;
    alter table storage.objects enable row level security;
    alter table realtime.messages enable row level security;
    create policy members on public.users to authenticated using(true) with check(true);
    create policy members on public.messages to authenticated using(true) with check(true);
    create policy members on public.dm_messages to authenticated using(true) with check(true);
    create policy members on storage.objects to authenticated using(true) with check(true);
    create policy members on realtime.messages to authenticated using(true) with check(true);
    grant select,insert,update,delete on public.users,public.messages,public.dm_messages,storage.objects,realtime.messages to authenticated;
    insert into auth.users values('${member}'),('${other}'),('${admin}');
    insert into public.users values('${member}','departing'),('${other}','surviving'),('${admin}','operator');
    insert into public.user_roles values('${admin}','admin');
    insert into public.messages values('${ownPin}','${member}','own message',null,null),('${otherPin}','${other}','keep reply','${member}','${ownPin}');
    insert into public.dm_messages values('${ownPin}','${member}','own DM'),('${otherPin}','${other}','keep DM');
    insert into realtime.messages values(1,'{"safe":"fixture"}');
    insert into public.shadow_pin_categories(id,creator_id,title,description,image_url,image_path,thumbnail_path) values
      ('${category}','${member}','personal title','personal details','old-cover','${member}/cover.jpg','derivatives/categories/${category}/thumbnail.webp');
    insert into public.shadow_pin_images(id,category_id,creator_id,image_url,image_path,thumbnail_path,provider,provider_asset_id) values
      ('${ownPin}','${category}','${member}','own','${member}/pin.jpg','derivatives/images/${ownPin}/thumbnail.webp','bunny_stream','${video}'),
      ('${otherPin}','${category}','${other}','survivor','${other}/pin.jpg','derivatives/images/${otherPin}/thumbnail.webp',null,null);
    insert into public.shadow_pin_draft_assets values('${video}','${member}','bunny_stream','${video}');
    insert into private.bunny_media_assets values('123','${video}','${member}','shadow_pin_image','${ownPin}'),
      ('123','${video}','${member}','shadow_pin_draft_asset','${video}'),('123','${video}','${member}','shado_tv_asset','${video}');
    insert into public.shado_tv_videos values('${video}','${member}','bunny_stream','${video}'),('${otherPin}','${other}',null,null);
    insert into public.shado_tv_captions values('${ownPin}','${video}','${member}','${member}/own.vtt'),('${otherPin}','${otherPin}','${member}','shared/editor.vtt');
    insert into public.shado_live_access_members values('${other}','${member}');
    insert into public.shado_live_restrictions values('${other}','${member}');
    insert into public.live_rooms(id,host_user_id,provider_room_name,title,description,status) values('${room}','${member}','shado-live-${room}','personal room','personal description','live');
    insert into public.live_room_messages values('${ownPin}','${room}','${member}','own live'),('${otherPin}','${room}','${other}','keep live');
    insert into public.live_room_events values('${ownPin}','${room}','${member}','${other}','{}'),('${otherPin}','${room}','${other}',null,'{}');
    insert into public.live_provider_webhook_receipts values('own','${room}','${member}','${member}','{}'),('other','${room}','${other}','${other}','{}');
    insert into public.user_channel_bans values('${ban}','${member}','retained safety action'),('${ownPin}','${member}','unlinked ban');
    insert into public.member_reports(id,reporter_user_id,subject_user_id,target_type,target_id,category,client_report_id) values
      ('${report}','${other}','${member}','user','${member}','harassment','${report}');
    insert into public.moderation_cases(id,subject_user_id,target_type,target_id,primary_category,status,ack_due_at,resolve_due_at,resolved_at) values
      ('${caseId}','${member}','user','${member}','harassment','closed',now(),now(),now()-interval '100 days');
    insert into public.moderation_case_reports(case_id,report_id) values('${caseId}','${report}');
    insert into public.moderation_evidence(case_id,report_id,target_type,target_id,source_author_id,snapshot,content_hash) values
      ('${caseId}','${report}','user','${member}','${member}','{"evidence":"retained"}','${'b'.repeat(64)}');
    insert into public.moderation_case_actions(id,case_id,actor_user_id,action_type,status) values('${action}','${caseId}','${member}','channel_ban','applied');
    insert into public.moderation_action_channel_bans values('${action}','${ban}');
    insert into public.moderation_report_attachments(report_id,uploader_user_id,path,name,size_bytes,content_type) values
      ('${report}','${member}','${member}/submitted.jpg','submitted.jpg',5,'image/jpeg');
    insert into storage.objects(bucket_id,name,owner) select b,'${member}/own.jpg','${member}' from unnest(array['avatars','banners','message-media','chat-uploads','art-board','shadow-pin','shadow-pin-comments','shadow-pin-drafts','shado-tv','feedback-attachments']) b;
    insert into storage.objects(bucket_id,name,owner) values
      ('shadow-pin','derivatives/images/${ownPin}/thumbnail.webp',null),('shadow-pin','derivatives/categories/${category}/thumbnail.webp',null),
      ('shadow-pin','derivatives/images/${otherPin}/thumbnail.webp',null),('chat-uploads','${other}/keep.jpg','${other}'),
      ('moderation-evidence','${member}/submitted.jpg','${member}'),('moderation-evidence','${member}/draft.jpg','${member}');
  `)
  await migration('20261022231054_account_deletion_pin_reference.sql')
  await migration('20261023001140_active_member_access_boundary.sql')
  await migration('20261023001141_complete_account_deletion.sql')
  await db.exec(await securityActivationSection('deletion_foreign_keys'))
  await migration('20261023002455_moderation_retention_cleanup.sql')
  await migration('20261023004723_bunny_upload_deletion_reservations.sql')
  // Use the actual retained-media table definition; the capture worker and
  // source-provenance triggers have their own focused enforcement harness.
  const mediaSql = await readFile(path.join(root, 'supabase/migrations/20261023005459_reported_media_evidence.sql'), 'utf8')
  await db.exec(mediaSql.slice(mediaSql.indexOf('create table private.moderation_media_assets'), mediaSql.indexOf('-- Decode only')))
  // The cleanup fixture assumes capture availability. Real queue/storage guard
  // enforcement and the disabled handover are verified by the phase SQL suite.
  await db.exec(`
    create function private.fixture_capture_ready() returns trigger language plpgsql as $$begin return new; end;$$;
    create trigger queue_reported_media after insert on public.moderation_evidence for each row execute function private.fixture_capture_ready();
    create trigger queue_report_attachment after insert on public.moderation_report_attachments for each row execute function private.fixture_capture_ready();
    create trigger guard_reported_media_storage before update on storage.objects for each row execute function private.fixture_capture_ready();
  `)
  await db.exec(`
    alter table public.shadow_pin_images add column deleted_at timestamptz;
    alter table public.shadow_pin_images add column provider_payload jsonb default '{}';
    alter table public.shadow_pin_images add column video_embed_url text;
    alter table public.shadow_pin_draft_assets add column deleted_at timestamptz;
    alter table public.shadow_pin_draft_assets add column state text default 'ready';
    alter table public.shadow_pin_draft_assets add column provider_payload jsonb default '{}';
    alter table public.shadow_pin_draft_assets add column video_embed_url text;
    alter table public.shado_tv_videos add column deleted_at timestamptz;
    alter table public.shado_tv_videos add column provider_payload jsonb default '{}';
    alter table public.shado_tv_videos add column embed_url text;
    alter table public.shado_tv_videos add column trailer_asset_url text;
    alter table public.messages add column file_url text;
    alter table public.messages add column audio_url text;
    alter table public.messages add column thumbnail_url text;
    alter table public.messages add column message_type text default 'text';
    alter table public.dm_messages add column file_url text;
    alter table public.dm_messages add column audio_url text;
    alter table public.dm_messages add column thumbnail_url text;
    alter table public.dm_messages add column message_type text default 'text';
    create function public.can_delete_bunny_media_asset(text,uuid,uuid) returns boolean language sql security invoker as $$select false$$;
    revoke all on function public.can_delete_bunny_media_asset(text,uuid,uuid) from public,anon,authenticated;
    grant execute on function public.can_delete_bunny_media_asset(text,uuid,uuid) to service_role;
    insert into private.moderation_media_assets(id,case_id,report_id,evidence_id,media_key,source_owner_id,kind,provider,status,source_bucket,source_path,source_object_id,storage_path)
      select '${capturedFile}','${caseId}','${report}',e.id,'fileUrl','${member}','image','storage','pending','chat-uploads','${member}/own.jpg',o.id,'captured/${caseId}/${capturedFile}'
      from public.moderation_evidence e,storage.objects o where o.bucket_id='chat-uploads' and o.name='${member}/own.jpg';
    insert into private.moderation_media_assets(id,case_id,report_id,evidence_id,media_key,source_owner_id,kind,provider,status,source_bucket,source_path,source_object_id,storage_path)
      select '${capturedAttachment}','${caseId}','${report}',e.id,'attachment:fixture','${member}','image','storage','pending','moderation-evidence','${member}/submitted.jpg',o.id,'captured/${caseId}/${capturedAttachment}'
      from public.moderation_evidence e,storage.objects o where o.bucket_id='moderation-evidence' and o.name='${member}/submitted.jpg';
    insert into private.moderation_media_assets(id,case_id,report_id,evidence_id,media_key,source_owner_id,kind,provider,status,library_id,asset_id,storage_path)
      select '${heldVideo}','${caseId}','${report}',id,'trustedVideo','${member}','video','bunny','ready','123','${video}','captured/${caseId}/${heldVideo}' from public.moderation_evidence;
  `)
  await migration('20261023005759_account_deletion_evidence_retention.sql')
  await migration('20261023011311_bunny_media_removal_claims.sql')
  // Match the actual hosted Live grant boundary instead of hiding missing
  // invoker permissions behind broad fixture grants.
  await db.exec('revoke all on public.live_rooms,public.live_room_participants,public.live_room_events,public.live_provider_webhook_receipts,public.live_provider_operations from service_role')
  await migration('20261023011620_account_deletion_service_privileges.sql')
  await migration('20261023012556_account_deletion_provider_tombstones.sql')
  const releaseConfig = { projectRef:'abcdefghijklmnopqrst',projectUrl:'https://abcdefghijklmnopqrst.supabase.co',libraryId:'123' }
  const releaseSnapshot = async () => {
    const results = await db.exec(buildAccountDeletionReadinessQuery(releaseConfig))
    return results.flatMap(result => result.rows).find(row => row.readiness)?.readiness
  }
  const prepared = await releaseSnapshot()
  equal(assertAccountDeletionReleaseReady(prepared,releaseConfig).provider_associations,3,'release gate reads real source-bound Pin/draft/TV associations')
  await query("update public.shado_tv_videos set provider_payload=$1::jsonb where id=$2",[JSON.stringify({bunny_stream:{trailer:{videoId:lateAsset,libraryId:'123'}}}),video])
  const missingTrailer = await releaseSnapshot()
  equal(missingTrailer.unregistered_provider_associations,1,'release gate includes TV payload-only trailer GUIDs')
  assert.throws(()=>assertAccountDeletionReleaseReady(missingTrailer,releaseConfig),/unregistered_provider_associations/); checks++
  await query("update public.shado_tv_videos set provider_payload='{}' where id=$1",[video])
  await query('update public.dm_messages set file_url=$1 where id=$2',[`${releaseConfig.projectUrl}/storage/v1/object/public/chat-uploads/${member}/own.jpg`,otherPin])
  equal((await releaseSnapshot()).message_fields_requiring_copy,1,'release gate detects a foreign-prefix DM field before destructive cleanup')
  await query('update public.dm_messages set file_url=null where id=$1',[otherPin])
  await actor(member)
  equal(await scalar('select count(*)::int from public.messages'), 2, 'approved member reads before deletion')
  equal(await scalar('select public.require_active_member_request() is null'), true, 'request gate admits an active member')
  await rejects('select public.begin_account_deletion($1,$2)',[member,receipt],/permission denied/,'browser cannot invoke privileged deletion')
  await actor(unknown)
  equal(await scalar('select count(*)::int from public.messages'),0,'unapproved Auth subject sees no messages')
  equal(await scalar('select count(*)::int from storage.objects'),0,'unapproved subject sees no Storage metadata')
  await rejects('select public.require_active_member_request()',[],/no longer has access/,'pre-request gate denies missing member')
  await service()
  await rejects('select public.begin_account_deletion($1,$2)',[admin,'b'.repeat(64)],/Transfer full admin/,'only full admin cannot start deletion')
  equal(await scalar('select count(*)::int from private.account_deletion_jobs'),0,'admin failure does not revoke access')
  await query('insert into public.shadow_pin_categories(id,creator_id,image_path) values($1,$2,$3)',[unknown,other,`${member}/foreign-cover.jpg`])
  await rejects('select public.begin_account_deletion($1,$2)',[member,receipt],/re-homed/,'foreign-owned cover prevents destructive prefix sweep')
  await query('update public.shadow_pin_categories set image_path=$1 where id=$2',[`${other}/repaired-cover.jpg`,unknown])
  await query('update public.shadow_pin_images set provider_asset_id=$1 where id=$2',[lateAsset,ownPin])
  await rejects('select public.begin_account_deletion($1,$2)',[member,receipt],/ownership must be verified/,'forged or unregistered provider GUID cannot authorize deletion')
  await query('update public.shadow_pin_images set provider_asset_id=$1 where id=$2',[video,ownPin])
  await query('insert into private.bunny_media_assets values($1,$2,$3,$4,$5),($1,$2,$6,$4,$7)', ['123',sharedAsset,member,'shadow_pin_image',ownPin,other,otherPin])
  await query('select public.reserve_bunny_upload($1,$2,$3,$4,$5)',[reservation,member,'123','shadow_pin_image',ownPin])
  // Model a prior individual-video DELETE whose response was lost and whose
  // canonical source row is already gone. The durable claim still owns cleanup.
  await query("insert into private.bunny_media_removals(id,library_id,asset_id,owner_id,source_type,source_id) values($1,'123',$2,$3,'shadow_pin_image',$4)",[pendingRemoval,removedAsset,member,ownPin])
  await rejects('select public.anonymize_completed_bunny_removals($1)',[member],/Completed account/,'provider claim identity is retained until data cleanup')
  const job = await scalar('select public.begin_account_deletion($1,$2)',[member,receipt])
  equal(job.state,'requested','durable job starts')
  equal(job.manifest.storage.filter(plan=>plan.bucket!=='moderation-evidence').length,10,'all ten upload buckets captured')
  const paths = job.manifest.storage.flatMap(plan=>plan.paths)
  equal(paths.includes(`derivatives/images/${ownPin}/thumbnail.webp`),true,'legacy owned Pin derivative captured')
  equal(paths.includes(`derivatives/categories/${category}/thumbnail.webp`),true,'legacy owned category derivative captured')
  equal(paths.includes(`derivatives/images/${otherPin}/thumbnail.webp`),false,'other member derivative preserved')
  equal(paths.includes(`${member}/submitted.jpg`),false,'submitted safety attachment preserved')
  equal(paths.includes(`${member}/draft.jpg`),true,'unsubmitted evidence draft removed')
  equal(job.manifest.bunny_assets,[{ library_id: '123', asset_id: video }],'trusted provider duplicate references are deduplicated')
  equal(job.manifest.live_rooms,[`shado-live-${room}`],'hosted provider room captured')
  await actor(member)
  equal(await scalar('select count(*)::int from public.messages'),0,'issued JWT loses row access as soon as job starts')
  equal(await scalar('select count(*)::int from public.dm_messages'),0,'issued JWT loses DM access')
  equal(await scalar('select count(*)::int from storage.objects'),0,'issued JWT loses Storage access')
  equal(await scalar('select count(*)::int from realtime.messages'),0,'private realtime authorization loses access')
  await rejects('select public.require_active_member_request()',[],/no longer has access/,'legacy definer RPC gate denies pending account')
  await service()
  equal(await scalar('select public.is_active_member_for_service($1)',[member]),false,'service endpoint gate denies pending member')
  equal(await scalar('select public.is_active_member_for_service($1)',[other]),true,'service endpoint gate preserves unrelated member')
  await rejects('select public.reserve_bunny_upload($1,$2,$3,$4,$5)',[unknown,member,'123','shadow_pin_image',ownPin],/no longer has active/,'no external create can reserve after deletion starts')
  await rejects('select public.refresh_account_deletion_providers($1)',[member],/in-flight provider upload/,'unknown create response prevents false deletion success')
  await query('select public.resolve_bunny_upload($1,$2)',[reservation,lateAsset])
  await rejects('select public.resolve_bunny_upload($1,$2)',[reservation,video],/cannot be reassigned/,'reservation GUID cannot be swapped')
  await rejects('select public.finish_bunny_upload($1)',[reservation],/must be registered/,'unregistered created asset retains durable cleanup intent')
  const refreshedProviders=await scalar('select public.refresh_account_deletion_providers($1)',[member])
  equal(refreshedProviders.manifest.bunny_assets,[{ library_id:'123',asset_id:lateAsset },{ library_id:'123',asset_id:removedAsset }],'late provider GUID and interrupted manual removal join cleanup; shared and reported assets stay')
  equal(await scalar('select state from private.bunny_media_removals where id=$1',[pendingRemoval]),'pending','inventory alone does not claim provider removal success')
  await rejects("insert into storage.objects(bucket_id,name) values('chat-uploads',$1)",[`${member}/late.jpg`],/deletion has started/,'service upload cannot land after deletion starts')
  await rejects("insert into storage.objects(bucket_id,name) values('shadow-pin',$1)",[`derivatives/images/${ownPin}/medium.webp`],/deletion has started/,'legacy service derivative writes are also blocked')
  await rejects('insert into public.shadow_pin_draft_assets(id,creator_id) values($1,$2)',[unknown,member],/deletion has started/,'late provider draft row cannot attach to pending member')
  await query("insert into storage.objects(bucket_id,name,owner) values('chat-uploads',$1,$2)",[`${other}/new.jpg`,other])
  equal(await scalar("select count(*)::int from storage.objects where name=$1",[`${other}/new.jpg`]),1,'unrelated member uploads remain available')
  await rejects('select public.erase_account_data($1)',[member],/Storage cleanup must finish/,'rows cannot disappear before storage checkpoint')
  await rejects('select public.checkpoint_account_deletion($1,$2)',[member,'storage_removed'],/out of order/,'cannot skip provider checkpoint')
  await query("update private.account_deletion_jobs set manifest=jsonb_set(manifest,'{bunny_assets}',$2::jsonb) where user_id=$1",[member,JSON.stringify([{ library_id:'123',asset_id:lateAsset }])])
  await rejects('select public.checkpoint_account_deletion($1,$2)',[member,'providers_removed'],/Pending provider removals/,'an omitted manual claim cannot be marked removed by an unrelated provider confirmation')
  equal(await scalar('select state from private.bunny_media_removals where id=$1',[pendingRemoval]),'pending','failed checkpoint preserves unknown provider outcome')
  await query('select public.refresh_account_deletion_providers($1)',[member])
  await query('select public.checkpoint_account_deletion($1,$2)',[member,'providers_removed'])
  equal(await scalar('select state from private.bunny_media_removals where id=$1',[pendingRemoval]),'removed','confirmed provider checkpoint marks exact interrupted removal complete')
  equal(await scalar('select owner_id from private.bunny_media_removals where id=$1',[pendingRemoval]),member,'provider checkpoint does not anonymize unfinished account early')
  await rejects('select public.checkpoint_account_deletion($1,$2)',[member,'storage_removed'],/not confirmed/,'storage checkpoint checks actual remaining metadata')
  await rejects('select public.refresh_account_deletion_storage($1)',[member],/capture must finish/,'pending report capture blocks ordinary source cleanup')
  await query("update private.moderation_media_assets set status='ready' where id=$1",[capturedFile])
  await query("update private.moderation_media_assets set status='unavailable' where id=$1",[capturedAttachment])
  await rejects('select public.refresh_account_deletion_storage($1)',[member],/attachment preservation/,'unpreserved submitted attachment cannot be silently deleted')
  await query("update private.moderation_media_assets set status='ready' where id=$1",[capturedAttachment])
  await query("insert into storage.objects(bucket_id,name) select storage_bucket,storage_path from private.moderation_media_assets where provider='storage'")
  const storageJob = await scalar('select public.refresh_account_deletion_storage($1)',[member])
  // The synthetic worker models successful Storage API calls, never an SQL
  // deletion of Storage metadata in production.
  for (const plan of storageJob.manifest.storage) await query('delete from storage.objects where bucket_id=$1 and name=any($2)',[plan.bucket,plan.paths])
  equal(await scalar("select count(*)::int from storage.objects where bucket_id='moderation-captured-media'"),2,'service-owned evidence copies survive account cleanup')
  equal(await scalar("select count(*)::int from storage.objects where bucket_id='moderation-evidence' and name=$1",[`${member}/submitted.jpg`]),0,'original submitted attachment is removed only after independent capture')
  await query('select public.checkpoint_account_deletion($1,$2)',[member,'storage_removed'])
  await query('select public.erase_account_data($1)',[member])
  await query('select public.erase_account_data($1)',[member])
  equal(await scalar('select count(*)::int from private.bunny_upload_reservations'),0,'confirmed provider cleanup clears its durable intents')
  equal(await scalar('select count(*)::int from public.shadow_pin_images'),1,'own Pins erased, other Pin survives')
  equal(await scalar('select title from public.shadow_pin_categories where id=$1',[category]),'Shared Pins','shared category text anonymized')
  equal(await scalar('select image_path from public.shadow_pin_categories where id=$1',[category]),`${other}/pin.jpg`,'shared category cover replaced with surviving Pin')
  equal(await scalar('select count(*)::int from public.shado_tv_videos'),1,'other TV video survives')
  equal(await scalar('select status from public.live_rooms where id=$1',[room]),'ended','hosted room is ended')
  equal(await scalar('select count(*)::int from public.live_room_events'),1,'own ordinary Live audit removed only')
  equal(await scalar('select count(*)::int from public.live_provider_webhook_receipts'),1,'own provider identity payload removed only')
  await rejects('select public.finish_account_deletion($1)',[member],/not confirmed/,'cannot finish while profile exists')
  await db.exec('reset role')
  await query('delete from auth.users where id=$1',[member])
  await service()
  await query('select public.finish_account_deletion($1)',[member])
  await query('select public.finish_account_deletion($1)',[member])
  equal(await scalar('select owner_id from private.bunny_media_removals where id=$1',[pendingRemoval]),null,'completed account removes owner identity from provider tombstone')
  equal(await scalar('select state from private.bunny_media_removals where id=$1',[pendingRemoval]),'removed','minimal asset tombstone continues denying future forged playback authority')
  equal(await scalar('select count(*)::int from public.messages'),1,'auth cascade deletes only authored messages')
  equal(await scalar('select pinned_by from public.messages where id=$1',[otherPin]),null,'other member pinned message preserved with anonymous actor')
  equal(await scalar('select count(*)::int from public.dm_messages'),1,'other DM content survives')
  equal(await scalar('select count(*)::int from public.live_room_messages'),1,'restrictive Live message FK no longer blocks Auth removal')
  equal(await scalar('select created_by from public.shado_tv_captions limit 1'),null,'shared caption editor FK anonymizes')
  equal(await scalar('select added_by from public.shado_live_access_members'),null,'live access actor anonymizes')
  equal(await scalar('select created_by from public.shado_live_restrictions'),null,'live restriction actor anonymizes')
  equal(await scalar('select host_user_id from public.live_rooms'),null,'room host FK anonymizes')
  equal(await scalar('select count(*)::int from public.moderation_evidence'),1,'submitted safety evidence remains')
  equal(await scalar('select source_author_id from public.moderation_evidence'),null,'safety evidence author FK anonymizes')
  equal(await scalar('select count(*)::int from public.user_channel_bans'),1,'only safety-linked historical ban survives')
  equal(await scalar('select target_user_id from public.user_channel_bans'),null,'historical safety ban subject anonymizes')
  equal((await scalar('select public.get_account_deletion_job($1)',[receipt])).manifest,{},'completed receipt retains no provider/file manifest')
  equal(await scalar('select public.get_account_deletion_job($1) is null',['c'.repeat(64)]),true,'wrong receipt reveals no job')
  await actor(member)
  equal(await scalar('select count(*)::int from public.messages'),0,'deleted member issued JWT cannot read remaining content')
  await rejects('select public.require_active_member_request()',[],/no longer has access/,'deleted member cannot call legacy RPCs')
  await service()
  const dry = await scalar('select public.prepare_moderation_retention_purge()')
  equal(dry[0].bunny_assets,[{library_id:'123',asset_id:video}],'retained video becomes purge eligible after ordinary ownership is gone')
  equal(dry[0].storage.filter(item=>item.bucket==='moderation-captured-media').length,2,'retention includes captured source and submitted-attachment copies')
  equal(dry.length,1,'90-day closed case is eligible')
  equal(await scalar('select count(*)::int from private.moderation_purge_jobs'),0,'retention defaults to dry-run')
  await query('insert into private.moderation_retention_holds(case_id,hold_type,reason) values($1,$2,$3)',[caseId,'active_appeal','Synthetic active appeal'])
  equal((await scalar('select public.prepare_moderation_retention_purge()')).length,0,'active appeal blocks purge')
  await rejects('select public.prepare_moderation_retention_purge($1,false)',[[caseId]],/no active appeal/,'held case cannot be executed')
  await query('delete from private.moderation_retention_holds where case_id=$1',[caseId])
  await rejects('select public.prepare_moderation_retention_purge(null,false)',[],/explicit allowlist/,'purge requires reviewed case allowlist')
  await query('select public.prepare_moderation_retention_purge($1,false)',[[caseId]])
  await query('insert into private.moderation_retention_holds(case_id,hold_type,reason) values($1,$2,$3)',[caseId,'legal_hold','Synthetic later legal hold'])
  await rejects('select public.authorize_moderation_retention_batch($1)',[caseId],/cancelled/,'hold after preparation cancels external authorization')
  await rejects('select public.finish_moderation_retention_purge($1)',[caseId],/cancelled/,'new hold also prevents finalization')
  await query('delete from private.moderation_retention_holds where case_id=$1',[caseId])
  await query('select public.prepare_moderation_retention_purge($1,false)',[[caseId]])
  await query('select public.authorize_moderation_retention_batch($1)',[caseId])
  await rejects('select public.finish_moderation_retention_purge($1)',[caseId],/Storage API/,'evidence rows cannot vanish before file cleanup')
  await query("delete from storage.objects where bucket_id in ('moderation-evidence','moderation-captured-media')")
  await rejects('select public.finish_moderation_retention_purge($1)',[caseId],/provider removal/,'retention cannot finalize before provider removal is confirmed')
  await query('select public.confirm_moderation_provider_removal($1,$2,$3)',[caseId,'123',video])
  await query('select public.finish_moderation_retention_purge($1)',[caseId])
  await query('select public.finish_moderation_retention_purge($1)',[caseId])
  equal(await scalar('select count(*)::int from public.moderation_evidence'),0,'scoped finalized purge removes evidence')
  equal(await scalar('select count(*)::int from public.member_reports'),0,'scoped finalized purge removes report details')
  equal(await scalar('select count(*)::int from public.moderation_cases'),0,'scoped finalized purge removes closed case')
  equal(await scalar('select count(*)::int from public.messages'),1,'retention purge preserves unrelated messages')
  await query("update private.account_deletion_jobs set completed_at=now()-interval '2 days',receipt_expires_at=now()-interval '1 day' where user_id=$1",[member])
  equal(await scalar('select public.get_account_deletion_job($1) is null',[receipt]),true,'completed receipt expires')
  equal(await scalar('select public.prune_account_deletion_receipts()'),1,'expired minimal receipt physically removed')
  console.log(`Account deletion PostgreSQL checks passed: ${checks}`)
} catch (error) {
  console.error('Account deletion SQL verification failed:', error.message, error.where ?? '', error.query ?? '')
  process.exitCode = 1
} finally { await db.close() }
