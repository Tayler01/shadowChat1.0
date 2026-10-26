import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const runtime = process.env.SHADOWCHAT_PGLITE_MODULE_PATH
const { PGlite } = await import(runtime ? pathToFileURL(runtime).href : '@electric-sql/pglite')
const readSql = name => readFile(path.join(root, 'supabase/migrations', name), 'utf8')

/** Actual PostgreSQL engine and actual migration functions; no network or keys. */
export async function createRetentionFixture() {
  const db = await PGlite.create()
  const owner = randomUUID()
  const reviewer = randomUUID()
  const query = (sql, values = []) => db.query(sql, values)
  const scalar = async (sql, values = []) => Object.values((await query(sql, values)).rows[0])[0]
  const role = async name => { await db.exec('reset role'); await db.exec('set role ' + name) }
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema private; create schema auth; create schema storage;
      revoke all on schema private from public,anon,authenticated;
      grant usage on schema private to service_role;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.users(id uuid primary key);
      create table public.user_channel_bans(id uuid primary key);
      create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb default '{}',unique(bucket_id,name));
      alter table storage.objects enable row level security;
      create table private.account_deletion_jobs(user_id uuid primary key,state text);
      create table private.bunny_media_assets(library_id text,asset_id uuid,owner_id uuid,source_type text,source_id uuid);
      create table private.bunny_upload_reservations(id uuid primary key,library_id text,asset_id uuid,owner_id uuid,state text);
      create table public.shadow_pin_images(id uuid primary key,creator_id uuid,provider text,provider_asset_id text);
      create function public.is_active_member_for_service(uuid) returns boolean language sql stable security invoker as $$select true$$;
      create function private.is_active_member() returns boolean language sql stable security definer as $$select true$$;
      create function public.can_delete_bunny_media_asset(text,uuid,uuid) returns boolean language sql stable security invoker as $$select false$$;
      create function private.can_operator_read_moderation_evidence(actor uuid,case_id uuid) returns boolean language sql stable security definer as $$select actor is not null$$;
    `)
    const moderation = await readSql('20260712003000_member_reporting_case_center.sql')
    await db.exec(moderation.slice(moderation.indexOf('create table public.member_reports'), moderation.indexOf('create or replace function private.can_operator_access_moderation_case(')))
    await db.exec(await readSql('20261023002455_moderation_retention_cleanup.sql'))
    await db.exec(await readSql('20261023005459_reported_media_evidence.sql'))
    const integration = await readSql('20261023005759_account_deletion_evidence_retention.sql')
    await db.exec(integration.slice(integration.indexOf('create function private.moderation_purge_bunny_assets'), integration.lastIndexOf('commit;')))
    await db.exec(await readSql('20261023011311_bunny_media_removal_claims.sql'))
    await db.exec(await readSql('20261023224207_moderation_retention_removal_claims.sql'))
    await db.exec(`
      create trigger guard_reported_media_storage before update or delete on storage.objects
        for each row execute function private.guard_reported_media_storage();
      grant select,insert,update,delete on all tables in schema public,storage to service_role;
      grant select,insert,update,delete on private.bunny_media_assets,private.bunny_upload_reservations to service_role;
      grant usage,select on all sequences in schema public to service_role;
      grant execute on function private.can_operator_read_moderation_evidence(uuid,uuid),private.is_active_member() to service_role;
    `)
    await query('insert into public.users(id) values($1),($2)', [owner, reviewer])
    await role('service_role')
  } catch (error) { await db.close(); throw error }
  const addCase = async ({ video, file = false, attachment = false, status = 'closed' } = {}) => {
    const id = randomUUID(), report = randomUUID(), evidence = randomUUID()
    await query("insert into public.moderation_cases(id,subject_user_id,target_type,target_id,primary_category,status,ack_due_at,resolve_due_at,resolved_at) values($1,$2,'user',$2,'harassment',$3,now(),now(),now()-interval '100 days')", [id, owner, status])
    await query("insert into public.member_reports(id,reporter_user_id,subject_user_id,target_type,target_id,category,client_report_id) values($1,$2,$2,'user',$2,'harassment',$1)", [report, owner])
    await query('insert into public.moderation_case_reports(case_id,report_id) values($1,$2)', [id, report])
    await query("insert into public.moderation_evidence(id,case_id,report_id,target_type,target_id,source_author_id,snapshot,content_hash) values($1,$2,$3,'user',$4,$4,'{}',repeat('a',64))", [evidence, id, report, owner])
    const result = { id, report, evidence }
    if (video) {
      result.video = video
      const media = randomUUID()
      await query("insert into private.moderation_media_assets(id,case_id,report_id,evidence_id,media_key,source_owner_id,kind,provider,status,library_id,asset_id,storage_path) values($1,$2,$3,$4,'video',$5,'video','bunny','ready','123',$6,$7)", [media,id,report,evidence,owner,video,'captured/' + id + '/' + media])
    }
    if (file) {
      result.media = randomUUID()
      result.file = 'captured/' + id + '/' + result.media
      await query("insert into storage.objects(bucket_id,name) values('moderation-captured-media',$1)", [result.file])
      await query("insert into private.moderation_media_assets(id,case_id,report_id,evidence_id,media_key,source_owner_id,kind,provider,status,source_bucket,source_path,source_object_id,storage_path) values($1,$2,$3,$4,'file',$5,'image','storage','ready','chat-uploads',$6,$7,$8)", [result.media,id,report,evidence,owner,owner+'/source.jpg',randomUUID(),result.file])
    }
    if (attachment) {
      result.attachment = owner + '/' + randomUUID() + '.jpg'
      await query("insert into storage.objects(bucket_id,name) values('moderation-evidence',$1)", [result.attachment])
      await query("insert into public.moderation_report_attachments(report_id,uploader_user_id,path,name,size_bytes,content_type) values($1,$2,$3,'fixture.jpg',1,'image/jpeg')", [report,owner,result.attachment])
    }
    return result
  }
  const prepare = id => scalar('select public.prepare_moderation_retention_purge($1,false)', [[id]])
  const claim = id => scalar('select public.claim_moderation_retention_purge($1)', [id])
  const hold = id => query("insert into private.moderation_retention_holds(case_id,hold_type,reason) values($1,'legal_hold','Synthetic test hold only')", [id])
  const rpc = async (name, args) => {
    const allowed = {
      moderation_retention_claim_protocol: [[], 'select public.moderation_retention_claim_protocol()'],
      prepare_moderation_retention_purge: [['target_case_ids','dry_run'], 'select public.prepare_moderation_retention_purge($1,$2)'],
      claim_moderation_retention_purge: [['target_case_id'], 'select public.claim_moderation_retention_purge($1)'],
      authorize_moderation_retention_batch: [['target_case_id'], 'select public.authorize_moderation_retention_batch($1)'],
      confirm_moderation_storage_removal: [['target_case_id','target_removal_id'], 'select public.confirm_moderation_storage_removal($1,$2)'],
      confirm_moderation_provider_removal: [['target_case_id','target_library_id','target_asset_id'], 'select public.confirm_moderation_provider_removal($1,$2,$3)'],
      finish_moderation_retention_purge: [['target_case_id'], 'select public.finish_moderation_retention_purge($1)'],
    }
    const [keys, sql] = allowed[name] ?? []
    if (!sql) throw new Error('Unexpected retention RPC')
    return scalar(sql, keys.map(key => args[key]))
  }
  return { db, owner, reviewer, query, scalar, role, addCase, prepare, claim, hold, rpc,
    removeStorage: item => query('delete from storage.objects where bucket_id=$1 and name=$2', [item.bucket,item.path]) }
}
