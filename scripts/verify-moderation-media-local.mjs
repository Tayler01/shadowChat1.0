/** Isolated PostgreSQL runtime. Executes the actual media migration and operator-case predicates. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { securityActivationSection } from '../tests/helpers/securityMigrationPhases.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = process.env.SHADOWCHAT_PGLITE_MODULE_PATH || path.join(root, 'node_modules/@electric-sql/pglite/dist/index.js')
const { PGlite } = await import(pathToFileURL(runtime).href)
const db = new PGlite()
const ids = Array.from({ length: 16 }, (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)
const [owner, reporter, admin, assigned, other, caseId, otherCase, reportId, evidenceId, pin, video, attachmentId] = ids
let checks = 0
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0]
const rejects = async (sql, values, label) => { await assert.rejects(() => db.query(sql, values), undefined, label); checks++ }
const actor = async (role, user = '') => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec(`set role ${role}`) }
const addEvidence = async (id, snapshot, author = owner, targetType = 'dm_message', targetId = pin) => {
  await actor('postgres')
  await db.query('insert into public.member_reports(id,reporter_user_id) values($1,$2)', [id,reporter])
  await db.query('insert into public.moderation_evidence(id,case_id,report_id,target_type,target_id,source_author_id,snapshot) values($1,$2,$1,$3,$4,$5,$6)', [id,caseId,targetType,targetId,author,JSON.stringify(snapshot)])
  return (await db.query('select * from private.moderation_media_assets where evidence_id=$1 order by media_key',[id])).rows
}
const mediaUrl = (user, name = 'photo.jpg', host = 'project.supabase.co') => `https://${host}/storage/v1/object/public/chat-uploads/${user}/${name}`
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private; create schema storage;
    revoke all on schema private from public,anon,authenticated;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant usage on schema private to service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.users(id uuid primary key, active boolean default true);
    create table public.user_roles(user_id uuid,role text);
    insert into public.users(id) values('${owner}'),('${reporter}'),('${admin}'),('${assigned}'),('${other}');
    insert into public.user_roles values('${admin}','admin'),('${assigned}','sub_admin'),('${other}','sub_admin');
    create table private.account_deletion_jobs(user_id uuid primary key);
    create function public.is_app_admin(actor_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_roles where user_id=actor_user_id and role='admin') $$;
    create function public.is_app_operator(actor_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_roles where user_id=actor_user_id) $$;
    create function public.is_active_member_for_service(target_user_id uuid) returns boolean language sql stable security invoker set search_path='' as $$ select exists(select 1 from public.users where id=target_user_id and active) and not exists(select 1 from private.account_deletion_jobs where user_id=target_user_id) $$;
    revoke all on function public.is_active_member_for_service(uuid) from public,anon,authenticated;
    grant execute on function public.is_active_member_for_service(uuid) to service_role;
    create function private.is_active_member() returns boolean language sql stable security definer set search_path='' as $$ select public.is_active_member_for_service(auth.uid()) $$;
    create table public.moderation_cases(id uuid primary key,full_admin_only boolean default false,assigned_to uuid,status text default 'new',resolved_at timestamptz,updated_at timestamptz default now());
    insert into public.moderation_cases(id,assigned_to) values('${caseId}','${assigned}'),('${otherCase}','${other}');
    create table public.member_reports(id uuid primary key,reporter_user_id uuid);
    create table public.moderation_evidence(id uuid primary key,case_id uuid,report_id uuid,target_type text,target_id uuid,source_author_id uuid,snapshot jsonb);
    create table public.moderation_report_attachments(id uuid primary key,report_id uuid,uploader_user_id uuid,bucket text,path text,size_bytes bigint,content_type text);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create policy original_owner on storage.objects for select to authenticated using(owner=auth.uid());
    grant select on storage.objects to authenticated;
    create table private.bunny_media_assets(library_id text,asset_id uuid,owner_id uuid,source_type text,source_id uuid);
    create table public.shadow_pin_images(id uuid primary key,creator_id uuid,provider text,provider_asset_id text);
    create table private.moderation_purge_jobs(case_id uuid primary key,manifest jsonb,cancelled_at timestamptz);
    create table private.moderation_retention_holds(case_id uuid primary key,expires_at timestamptz);
    grant select,insert,update,delete on all tables in schema public,private,storage to service_role;
    insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values
      ('chat-uploads','${owner}/photo.jpg','${owner}','${owner}','{"size":100,"mimetype":"image/jpeg"}'),
      ('chat-uploads','${owner}/voice.webm','${owner}','${owner}','{"size":120,"mimetype":"audio/webm"}'),
      ('chat-uploads','${other}/private.jpg','${other}','${other}','{"size":150,"mimetype":"image/jpeg"}'),
      ('moderation-evidence','${reporter}/submitted.jpg','${reporter}','${reporter}','{"size":90,"mimetype":"image/jpeg"}');
    insert into public.member_reports values('${reportId}','${reporter}');
    insert into public.moderation_evidence values('${evidenceId}','${caseId}','${reportId}','dm_message','${pin}','${owner}','{}');
    insert into public.moderation_report_attachments values('${attachmentId}','${reportId}','${reporter}','moderation-evidence','${reporter}/submitted.jpg',90,'image/jpeg');
  `)
  const moderation = await readFile(path.join(root,'supabase/migrations/20260712003000_member_reporting_case_center.sql'),'utf8')
  await db.exec(moderation.slice(moderation.indexOf('create or replace function private.can_operator_access_moderation_case('),moderation.indexOf('create or replace function private.can_read_moderation_attachment(')))
  await db.exec(await readFile(path.join(root,'supabase/migrations/20261023005459_reported_media_evidence.sql'),'utf8'))
  await db.exec(await securityActivationSection('reported_media_evidence'))
  equal(await scalar('select count(*)::int from private.moderation_media_assets'),1,'Existing immutable submitted attachment is queued without copying or deleting bytes')
  const [photo,audio] = (await addEvidence(ids[12],{ fileUrl:mediaUrl(owner),audioUrl:mediaUrl(owner,'voice.webm') })).sort((a,b) => a.kind.localeCompare(b.kind)).reverse()
  equal(photo.kind,'image','Photo kind uses trusted Storage metadata')
  equal(audio.kind,'audio','Voice kind uses trusted Storage metadata')
  equal(photo.status,'pending','Reported file is held pending service capture')
  equal(await scalar('select count(*)::int from storage.objects'),4,'Capture registration performs no remote storage mutation')
  await actor('service_role')
  await rejects('delete from storage.objects where id=$1',[photo.source_object_id],'Source deletion cannot race pending capture')
  await rejects('update storage.objects set metadata=$2 where id=$1',[photo.source_object_id,JSON.stringify({size:500,mimetype:'image/jpeg'})],'Source overwrites cannot alter reported bytes')
  await rejects('select public.complete_moderation_media_capture($1)',[photo.id],'Missing destination cannot mark capture complete')
  equal((await scalar('select public.get_pending_moderation_media_for_owner($1)',[owner])).length,2,'Deletion worker receives only owner pending copies')
  await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[photo.storage_bucket,photo.storage_path,JSON.stringify({size:99,mimetype:'image/jpeg'})])
  await rejects('select public.complete_moderation_media_capture($1)',[photo.id],'Wrong destination size cannot mark capture complete')
  await db.query('update storage.objects set metadata=$3 where bucket_id=$1 and name=$2',[photo.storage_bucket,photo.storage_path,JSON.stringify({size:100,mimetype:'image/jpeg'})])
  await db.query('select public.complete_moderation_media_capture($1)',[photo.id])
  await db.query('select public.complete_moderation_media_capture($1)',[photo.id])
  equal(await scalar('select status from private.moderation_media_assets where id=$1',[photo.id]),'ready','Completion is idempotent after a lost response')
  await db.query('delete from storage.objects where id=$1',[photo.source_object_id])
  equal(await scalar('select count(*)::int from storage.objects where bucket_id=$1 and name=$2',[photo.storage_bucket,photo.storage_path]),1,'Retained bytes survive original removal')
  await rejects('delete from storage.objects where bucket_id=$1 and name=$2',[photo.storage_bucket,photo.storage_path],'Captured file cannot be deleted without reviewed retention job')
  await rejects('update storage.objects set metadata=$3 where bucket_id=$1 and name=$2',[photo.storage_bucket,photo.storage_path,'{}'],'Captured file cannot be overwritten')
  equal((await scalar('select public.get_moderation_media_for_case($1,$2)',[assigned,caseId])).length,3,'Assigned operator can review only the exact case')
  await rejects('select public.get_moderation_media_for_case($1,$2)',[other,caseId],'Unassigned sub-admin cannot review case media')
  await rejects('select public.get_moderation_media_for_case($1,$2)',[reporter,caseId],'Reporter cannot obtain moderator media URLs')
  await rejects('select public.get_moderation_media_for_case($1,$2)',[admin,ids[15]],'Full admin cannot invent a missing case')
  await actor('authenticated',assigned)
  equal(await scalar("select count(*)::int from storage.objects where bucket_id='moderation-captured-media'"),1,'Assigned reviewer has case-specific captured Storage access')
  equal(await scalar("select count(*)::int from storage.objects where bucket_id='chat-uploads'"),0,'Review does not grant source chat or DM media access')
  await rejects('select public.get_moderation_media_for_case($1,$2)',[admin,caseId],'Browser cannot forge actor identity on service RPC')
  await rejects('select * from private.moderation_media_assets',[],'Browser cannot enumerate source provenance')
  await rejects('select public.complete_moderation_media_capture($1)',[photo.id],'Browser cannot forge capture completion')
  await actor('authenticated',other)
  equal(await scalar("select count(*)::int from storage.objects where bucket_id='moderation-captured-media'"),0,'Unassigned reviewer cannot sign retained objects by guessed path')
  await actor('authenticated',reporter)
  equal(await scalar("select count(*)::int from storage.objects where bucket_id='moderation-captured-media'"),0,'Reporter cannot browse automatic retained evidence')
  await actor('postgres')
  await db.query('update public.moderation_cases set full_admin_only=true where id=$1',[caseId])
  await actor('service_role')
  await rejects('select public.get_moderation_media_for_case($1,$2)',[assigned,caseId],'Full-admin-only case excludes assigned sub-admin')
  equal((await scalar('select public.get_moderation_media_for_case($1,$2)',[admin,caseId])).length,3,'Full admin can review protected case')
  await actor('authenticated',assigned)
  equal(await scalar("select count(*)::int from storage.objects where bucket_id='moderation-captured-media'"),0,'Protected case restriction also applies to direct Storage signing')
  await actor('postgres')
  await db.query('insert into private.account_deletion_jobs values($1)',[admin])
  await actor('service_role')
  await rejects('select public.get_moderation_media_for_case($1,$2)',[admin,caseId],'Revoked admin JWT cannot review retained media')
  await actor('authenticated',admin)
  equal(await scalar("select count(*)::int from storage.objects where bucket_id='moderation-captured-media'"),0,'Revoked JWT is denied by Storage policy too')
  const forged = await addEvidence(ids[13],{fileUrl:mediaUrl(other,'private.jpg')})
  equal(forged[0].status,'unavailable','Known private foreign file URL is never captured')
  equal(forged[0].source_object_id,null,'Forged foreign path receives no object authority')
  await db.query('insert into public.shadow_pin_images values($1,$2,$3,$4)',[pin,owner,'bunny_stream',video])
  await db.query('insert into private.bunny_media_assets values($1,$2,$3,$4,$5)',['123',video,owner,'shadow_pin_image',pin])
  const bunny = await addEvidence(ids[14],{},owner,'shadow_pin_image',pin)
  equal(bunny[0].provider,'bunny','Native video evidence is bound to trusted source registry')
  equal(bunny[0].library_id,'123','Provider library is captured from service provenance')
  await db.query('delete from private.bunny_media_assets where source_id=$1',[pin])
  equal(await scalar('select asset_id::text from private.moderation_media_assets where id=$1',[bunny[0].id]),video,'Evidence retains independent provider identity after original registry removal')
  await db.query('insert into private.account_deletion_jobs values($1)',[owner])
  const late = await addEvidence(ids[15],{audioUrl:mediaUrl(owner,'voice.webm')})
  equal(late[0].status,'unavailable','A late report cannot add a new hold after deletion inventory began')
  equal(late[0].error_code,'source_removal_in_progress','Late-source absence is explicit rather than a false capture')
  await actor('anon')
  await rejects('select public.get_moderation_media_for_case($1,$2)',[admin,caseId],'Anonymous case access is denied')
  await actor('postgres')
  equal(await scalar("select has_table_privilege('authenticated','private.moderation_media_assets','INSERT')"),false,'Members cannot forge retained evidence rows')
  equal(await scalar('select count(*)::int from private.moderation_storage_url($1)',[mediaUrl(owner,'..%2fprivate.jpg')]),0,'Encoded path separators are rejected before provenance lookup')
  equal(await scalar('select count(*)::int from private.moderation_storage_url($1)',[mediaUrl(owner,'%00evil')]),0,'Invalid object path bytes are rejected')
  await db.query("update public.moderation_cases set status='closed',resolved_at=now()-interval '91 days' where id=$1",[caseId])
  await db.query('insert into private.moderation_purge_jobs(case_id,manifest) values($1,$2)',[caseId,JSON.stringify({storage:[{bucket:photo.storage_bucket,path:photo.storage_path},{bucket:'moderation-evidence',path:`${reporter}/submitted.jpg`}]})])
  await db.query('insert into private.moderation_retention_holds(case_id) values($1)',[caseId])
  await actor('service_role')
  await rejects('delete from storage.objects where bucket_id=$1 and name=$2',['moderation-evidence',`${reporter}/submitted.jpg`],'New hold protects uncopied submitted original even with prepared plan')
  await actor('postgres')
  await db.query('delete from private.moderation_retention_holds where case_id=$1',[caseId])
  await db.query(`insert into private.moderation_media_assets(id,case_id,report_id,evidence_id,media_key,source_owner_id,kind,provider,status,source_bucket,source_path,source_object_id,source_size_bytes,source_content_type,storage_path)
    select $1::uuid,$2::uuid,report_id,evidence_id,'other-active-case',source_owner_id,kind,provider,status,source_bucket,source_path,source_object_id,source_size_bytes,source_content_type,'captured/'||($2::uuid)::text||'/'||($1::uuid)::text
    from private.moderation_media_assets where media_key=$3`,[ids[13],otherCase,`attachment:${attachmentId}`])
  await actor('service_role')
  await rejects('delete from storage.objects where bucket_id=$1 and name=$2',['moderation-evidence',`${reporter}/submitted.jpg`],'Another active case keeps shared uncopied original protected')
  await actor('postgres')
  await db.query('delete from private.moderation_media_assets where id=$1',[ids[13]])
  await actor('service_role')
  await db.query('delete from storage.objects where bucket_id=$1 and name=$2',['moderation-evidence',`${reporter}/submitted.jpg`])
  equal(await scalar('select count(*)::int from storage.objects where bucket_id=$1 and name=$2',['moderation-evidence',`${reporter}/submitted.jpg`]),0,'Eligible explicit purge can remove an uncopied submitted original without creating a needless copy')
  await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[photo.storage_bucket,photo.storage_path])
  equal(await scalar('select count(*)::int from storage.objects where bucket_id=$1 and name=$2',[photo.storage_bucket,photo.storage_path]),0,'Reviewed eligible retention purge can remove exact captured object')
  console.log(`Reported-media PostgreSQL checks passed: ${checks}; exact-source provenance, retained copies, case roles, stale JWT, forged paths, deletion ordering and retention verified locally.`)
} catch (error) {
  console.error({message:error.message,code:error.code,detail:error.detail,query:error.query,checks})
  process.exitCode=1
} finally { await db.close() }
