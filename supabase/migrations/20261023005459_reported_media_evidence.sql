-- Retain only media named by authoritative report snapshots, never a client URL.
-- No historical bytes are invented or external URLs fetched by this migration.
begin;
create table private.moderation_media_assets (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete restrict,
  report_id uuid not null references public.member_reports(id) on delete restrict,
  evidence_id uuid not null references public.moderation_evidence(id) on delete restrict,
  media_key text not null,
  source_owner_id uuid references public.users(id) on delete set null,
  kind text not null check (kind in ('image','audio','video','file')),
  provider text not null check (provider in ('storage','bunny','external')),
  status text not null check (status in ('pending','ready','unavailable')),
  source_bucket text,
  source_path text,
  source_url text,
  source_object_id uuid,
  source_size_bytes bigint,
  source_content_type text,
  library_id text,
  asset_id uuid,
  storage_bucket text not null default 'moderation-captured-media' check (storage_bucket='moderation-captured-media'),
  storage_path text not null,
  error_code text,
  created_at timestamptz not null default now(),
  captured_at timestamptz,
  unique(evidence_id,media_key),
  unique(storage_path),
  check ((provider='bunny') = (library_id is not null and asset_id is not null)),
  check (provider<>'storage' or (source_bucket is not null and source_path is not null and source_object_id is not null))
);
create index moderation_media_assets_source_idx on private.moderation_media_assets(source_bucket,source_path) where provider='storage' and status='pending';
create index moderation_media_assets_provider_idx on private.moderation_media_assets(library_id,asset_id) where provider='bunny';
create index moderation_media_assets_case_idx on private.moderation_media_assets(case_id,created_at);
alter table private.moderation_media_assets enable row level security;
revoke all on private.moderation_media_assets from public,anon,authenticated;
grant select,insert,update,delete on private.moderation_media_assets to service_role;

-- Decode only a bounded URL path. Origin is checked against SUPABASE_URL again
-- by the capture worker before copying; every candidate also needs real owner
-- provenance here, so even a forged hostname cannot identify another member's file.
create function private.moderation_storage_url(value text)
returns table(bucket text,path text) language plpgsql stable security invoker set search_path='' as $$
declare parts text[]; encoded text; decoded bytea := ''::bytea; position integer := 1; token text;
begin
  if value is null or length(value)>4096 then return; end if;
  parts := regexp_match(value,'^https?://[^/?#]+/storage/v1/(?:object|render/image)/(?:public|authenticated|sign)/([a-z-]+)/([^?#]+)');
  if parts is null or parts[1]<>all(array['avatars','banners','chat-uploads','message-media','shadow-pin','shadow-pin-comments']) then return; end if;
  encoded := parts[2];
  while position<=length(encoded) loop
    token := substr(encoded,position,1);
    if token='%' then
      if substr(encoded,position+1,2)!~'^[0-9A-Fa-f]{2}$' then return; end if;
      -- Encoded slashes/backslashes must never change object segment identity.
      if lower(substr(encoded,position+1,2)) in ('2f','5c','00') then return; end if;
      decoded := decoded || decode(substr(encoded,position+1,2),'hex'); position := position+3;
    else decoded := decoded || convert_to(token,'UTF8'); position := position+1; end if;
  end loop;
  path := convert_from(decoded,'UTF8'); bucket := parts[1];
  if length(path)>1024 or path~'[[:cntrl:]\\]' or exists(select 1 from unnest(string_to_array(path,'/')) part where part in ('','.','..')) then return; end if;
  return next;
exception when others then return;
end;
$$;
revoke all on function private.moderation_storage_url(text) from public,anon,authenticated;

create function private.queue_reported_media()
returns trigger language plpgsql security definer set search_path='' as $$
declare item record; source record; object_row storage.objects%rowtype; media_id uuid; media_kind text;
  byte_count bigint; mime text; stopped boolean; trusted record;
begin
  -- Serialize capture provenance with account-deletion startup. A report that
  -- arrives after removal starts keeps its text, without adding a late hold.
  if new.source_author_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||new.source_author_id::text,0));
  end if;
  stopped := new.source_author_id is null or exists(select 1 from private.account_deletion_jobs where user_id=new.source_author_id);
  if not stopped and new.target_type='shadow_pin_image' then
    select a.library_id,a.asset_id into trusted from public.shadow_pin_images p
      join private.bunny_media_assets a on a.source_type='shadow_pin_image' and a.source_id=p.id
        and a.owner_id=p.creator_id and a.asset_id::text=p.provider_asset_id
      where p.id=new.target_id and p.creator_id=new.source_author_id and p.provider='bunny_stream' limit 1;
    if trusted.asset_id is not null then
      media_id:=gen_random_uuid();
      insert into private.moderation_media_assets(id,case_id,report_id,evidence_id,media_key,source_owner_id,kind,provider,status,library_id,asset_id,storage_path,captured_at)
      values(media_id,new.case_id,new.report_id,new.id,'trustedVideo',new.source_author_id,'video','bunny','ready',trusted.library_id,trusted.asset_id,'captured/'||new.case_id||'/'||media_id,now());
    end if;
  end if;
  for item in select key,value #>> '{}' as url from jsonb_each(new.snapshot)
    where key in ('fileUrl','audioUrl','thumbnailUrl','imageUrl','avatarUrl','avatarThumbnailUrl') and jsonb_typeof(value)='string' and length(value #>> '{}')>0
  loop
    media_id:=gen_random_uuid();
    media_kind:=case when item.key='audioUrl' then 'audio' when item.key='fileUrl' then
      case when new.snapshot->>'messageType' in ('image','audio','video') then new.snapshot->>'messageType' else 'file' end else 'image' end;
    select * into source from private.moderation_storage_url(item.url);
    object_row:=null;
    if not stopped and source.path is not null then
      select * into object_row from storage.objects o where o.bucket_id=source.bucket and o.name=source.path
        and (split_part(o.name,'/',1)=new.source_author_id::text or o.owner=new.source_author_id or o.owner_id=new.source_author_id::text
          or (new.target_type='shadow_pin_image' and o.name like 'derivatives/images/'||new.target_id::text||'/%')) for share;
    end if;
    if object_row.id is null then
      insert into private.moderation_media_assets(id,case_id,report_id,evidence_id,media_key,source_owner_id,kind,provider,status,source_url,storage_path,error_code)
      values(media_id,new.case_id,new.report_id,new.id,item.key,new.source_author_id,media_kind,'external','unavailable',item.url,'captured/'||new.case_id||'/'||media_id,
        case when stopped then 'source_removal_in_progress' when source.path is null then 'external_not_retained' else 'source_not_authorized' end);
      continue;
    end if;
    byte_count:=case when object_row.metadata->>'size'~'^[0-9]{1,12}$' then (object_row.metadata->>'size')::bigint else 0 end;
    mime:=lower(split_part(coalesce(object_row.metadata->>'mimetype',object_row.metadata->>'contentType','application/octet-stream'),';',1));
    media_kind:=case when mime like 'image/%' and mime<>'image/svg+xml' then 'image' when mime like 'audio/%' then 'audio' when mime like 'video/%' then 'video' else 'file' end;
    insert into private.moderation_media_assets(id,case_id,report_id,evidence_id,media_key,source_owner_id,kind,provider,status,source_bucket,source_path,source_url,source_object_id,source_size_bytes,source_content_type,storage_path,error_code)
    values(media_id,new.case_id,new.report_id,new.id,item.key,new.source_author_id,media_kind,'storage',case when byte_count between 1 and 268435456 then 'pending' else 'unavailable' end,
      source.bucket,source.path,item.url,object_row.id,byte_count,mime,'captured/'||new.case_id||'/'||media_id,
      case when byte_count between 1 and 268435456 then null else 'unsupported_size' end);
  end loop;
  return new;
end;
$$;
revoke all on function private.queue_reported_media() from public,anon,authenticated;
-- Automatic capture starts in 20261023224455, after the capture worker and
-- retention-aware producer/removal handlers are deployed.

-- Member-supplied report attachments were already immutable after submission.
-- Rehome their bytes as well, so retaining a safety record never keeps a deleted
-- member as the Storage owner. Backfill only trusted submitted attachment rows.
create function private.queue_moderation_attachment(target_attachment_id uuid,existing_submission boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare attachment record; object_row storage.objects%rowtype; media_id uuid:=gen_random_uuid();
begin
  select a.*,e.id as evidence_id,e.case_id into attachment from public.moderation_report_attachments a
    join public.moderation_evidence e on e.report_id=a.report_id where a.id=target_attachment_id;
  if attachment.id is null then return; end if;
  if attachment.uploader_user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||attachment.uploader_user_id::text,0));
  end if;
  if not existing_submission and exists(select 1 from private.account_deletion_jobs where user_id=attachment.uploader_user_id) then
    raise exception using errcode='42501',message='Account removal already started';
  end if;
  select * into object_row from storage.objects where bucket_id=attachment.bucket and name=attachment.path for share;
  insert into private.moderation_media_assets(id,case_id,report_id,evidence_id,media_key,source_owner_id,kind,provider,status,
    source_bucket,source_path,source_object_id,source_size_bytes,source_content_type,storage_path,error_code)
  values(media_id,attachment.case_id,attachment.report_id,attachment.evidence_id,'attachment:'||attachment.id,attachment.uploader_user_id,'image',
    case when object_row.id is null then 'external' else 'storage' end,case when object_row.id is null then 'unavailable' else 'pending' end,
    attachment.bucket,attachment.path,object_row.id,attachment.size_bytes,attachment.content_type,'captured/'||attachment.case_id||'/'||media_id,
    case when object_row.id is null then 'source_missing' else null end) on conflict(evidence_id,media_key) do nothing;
end;
$$;
revoke all on function private.queue_moderation_attachment(uuid,boolean) from public,anon,authenticated;
create function private.queue_report_attachment_trigger()
returns trigger language plpgsql security invoker set search_path='' as $$
begin perform private.queue_moderation_attachment(new.id); return new; end;
$$;
revoke all on function private.queue_report_attachment_trigger() from public,anon,authenticated;
-- Attachment intake and the existing-submission seed are activated together in
-- 20261023224455. Foundation alone must not leave uncapturable Storage holds.

-- Source bytes cannot change between report capture and server-side copy.
create function private.guard_reported_media_storage()
returns trigger language plpgsql security definer set search_path='' as $$
declare asset record;
begin
  if exists(select 1 from private.moderation_media_assets m where m.provider='storage' and m.status='pending'
    and m.source_bucket=old.bucket_id and m.source_path=old.name and m.source_object_id=old.id)
    and not (tg_op='DELETE' and current_setting('role',true)='service_role' and not exists(
      select 1 from private.moderation_media_assets held where held.provider='storage' and held.status='pending'
        and held.source_bucket=old.bucket_id and held.source_path=old.name and held.source_object_id=old.id
        and not exists(select 1 from private.moderation_purge_jobs j join public.moderation_cases c on c.id=j.case_id
          where j.case_id=held.case_id and j.cancelled_at is null and c.status in ('resolved','dismissed','closed')
            and coalesce(c.resolved_at,c.updated_at)<=now()-interval '90 days'
            and not exists(select 1 from private.moderation_retention_holds h where h.case_id=c.id and (h.expires_at is null or h.expires_at>now()))
            and exists(select 1 from jsonb_array_elements(j.manifest->'storage') p where p->>'bucket'=old.bucket_id and p->>'path'=old.name))
    )) then
    raise exception 'Reported media must be captured before source removal or replacement';
  end if;
  if old.bucket_id='moderation-captured-media' then
    select * into asset from private.moderation_media_assets where storage_path=old.name;
    if asset.id is not null and asset.status='ready' and not (
      tg_op='DELETE' and current_setting('role',true)='service_role' and exists(
        select 1 from private.moderation_purge_jobs j join public.moderation_cases c on c.id=j.case_id
        where j.case_id=asset.case_id and j.cancelled_at is null and c.status in ('resolved','dismissed','closed')
          and coalesce(c.resolved_at,c.updated_at)<=now()-interval '90 days'
          and not exists(select 1 from private.moderation_retention_holds h where h.case_id=c.id and (h.expires_at is null or h.expires_at>now()))
          and exists(select 1 from jsonb_array_elements(j.manifest->'storage') p where p->>'bucket'=old.bucket_id and p->>'path'=old.name)
      )) then raise exception 'Captured report media is immutable until reviewed retention purge'; end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.guard_reported_media_storage() from public,anon,authenticated;
-- The source-byte guard is installed with the capture triggers in 20261023224455.

insert into storage.buckets(id,name,public,file_size_limit) values('moderation-captured-media','moderation-captured-media',false,268435456);
create function private.can_read_captured_moderation_media(object_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.is_active_member() and exists(select 1 from private.moderation_media_assets m
    where m.storage_path=object_path and m.provider='storage' and m.status='ready'
      and private.can_operator_read_moderation_evidence(auth.uid(),m.case_id));
$$;
revoke all on function private.can_read_captured_moderation_media(text) from public,anon,authenticated;
grant execute on function private.can_read_captured_moderation_media(text) to authenticated;
create policy "Case reviewers read captured media" on storage.objects for select to authenticated
using(bucket_id='moderation-captured-media' and private.can_read_captured_moderation_media(name));

create function public.get_moderation_media_for_case(actor_user_id uuid,target_case_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if not public.is_active_member_for_service(actor_user_id) or not exists(select 1 from public.moderation_cases where id=target_case_id)
    or not private.can_operator_read_moderation_evidence(actor_user_id,target_case_id) then
    raise exception using errcode='42501',message='This case is not available for media review';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(m) order by created_at,id) from private.moderation_media_assets m where case_id=target_case_id),'[]'::jsonb);
end;
$$;
grant execute on function private.can_operator_read_moderation_evidence(uuid,uuid) to service_role;
create function public.get_pending_moderation_media_for_owner(target_user_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from private.moderation_media_assets m
    where source_owner_id=target_user_id and provider='storage' and status='pending';
$$;
create function public.complete_moderation_media_capture(target_asset_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare asset private.moderation_media_assets%rowtype;
begin
  select * into strict asset from private.moderation_media_assets where id=target_asset_id for update;
  if asset.provider<>'storage' or asset.status='unavailable' then raise exception 'Media is not awaiting capture'; end if;
  if asset.status='ready' then return; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id=asset.storage_bucket and o.name=asset.storage_path
    and o.metadata->>'size'=asset.source_size_bytes::text
    and lower(split_part(coalesce(o.metadata->>'mimetype',o.metadata->>'contentType','application/octet-stream'),';',1))=asset.source_content_type) then
    raise exception 'Captured media bytes and type were not confirmed';
  end if;
  update private.moderation_media_assets set status='ready',captured_at=now() where id=target_asset_id;
end;
$$;
create function public.reject_moderation_media_origin(target_asset_id uuid)
returns void language sql security invoker set search_path='' as $$
  update private.moderation_media_assets set status='unavailable',error_code='source_origin_mismatch'
    where id=target_asset_id and provider='storage' and status='pending';
$$;
revoke all on function public.get_moderation_media_for_case(uuid,uuid),public.get_pending_moderation_media_for_owner(uuid),
  public.complete_moderation_media_capture(uuid),public.reject_moderation_media_origin(uuid) from public,anon,authenticated;
grant execute on function public.get_moderation_media_for_case(uuid,uuid),public.get_pending_moderation_media_for_owner(uuid),
  public.complete_moderation_media_capture(uuid),public.reject_moderation_media_origin(uuid) to service_role;
comment on table private.moderation_media_assets is 'Report-scoped retained media provenance. Storage copies and Bunny holds follow the case retention policy; no broad conversation access is granted.';
notify pgrst,'reload schema';
commit;
