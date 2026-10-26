-- External removals cannot be rolled back with a later SQL transaction.
-- Commit a reviewed case and exact resources atomically before any Storage or
-- provider request. A hold/reopen wins before commitment; after commitment the
-- caller receives an explicit error instead of a false promise of preservation.
-- Unknown outcomes remain claimed for exact retry. Nothing is purged/scheduled.
begin;

alter table private.moderation_purge_jobs add column committed_at timestamptz;
alter table private.bunny_media_removals drop constraint bunny_media_removals_source_type_check;
alter table private.bunny_media_removals add constraint bunny_media_removals_source_type_check
  check(source_type in ('shadow_pin_image','shadow_pin_draft_asset','shado_tv_asset','moderation_retention'));

create table private.moderation_storage_removals (
  id uuid primary key default gen_random_uuid(),
  resource_key text not null unique check(resource_key ~ '^[0-9a-f]{64}$'),
  case_id uuid,
  bucket_id text not null check(bucket_id in ('moderation-evidence','moderation-captured-media')),
  object_path text,
  object_id uuid,
  state text not null default 'pending' check(state in ('pending','removed')),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  check(state<>'pending' or (case_id is not null and object_path is not null))
);
create index moderation_storage_removals_case_idx on private.moderation_storage_removals(case_id);
alter table private.moderation_storage_removals enable row level security;
revoke all on private.moderation_storage_removals from public,anon,authenticated;
grant select,insert,update on private.moderation_storage_removals to service_role;

create function private.moderation_storage_resource_key(bucket text,object_path text)
returns text language sql immutable strict security invoker set search_path='' as $$
  select encode(sha256(convert_to(bucket||chr(10)||object_path,'UTF8')),'hex');
$$;
revoke all on function private.moderation_storage_resource_key(text,text) from public,anon,authenticated;
grant execute on function private.moderation_storage_resource_key(text,text) to service_role;

create function public.moderation_retention_claim_protocol()
returns integer language sql immutable security invoker set search_path='' as $$select 2$$;
revoke all on function public.moderation_retention_claim_protocol() from public,anon,authenticated;
grant execute on function public.moderation_retention_claim_protocol() to service_role;

-- Committed cases relinquish their retention interest. With two concurrent
-- reviewed purges the last committing holder claims a shared provider object;
-- both cases cannot skip it and leave an orphan after their rows disappear.
create or replace function private.moderation_purge_bunny_assets(target_case_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('library_id',candidate.library_id,'asset_id',candidate.asset_id)
    order by candidate.library_id,candidate.asset_id),'[]'::jsonb) from (
    select distinct m.library_id,m.asset_id from private.moderation_media_assets m
    where m.case_id=target_case_id and m.provider='bunny' and m.status='ready'
      and not exists(select 1 from private.moderation_media_assets other_case
        where other_case.case_id<>target_case_id and other_case.provider='bunny' and other_case.status='ready'
          and other_case.library_id=m.library_id and other_case.asset_id=m.asset_id
          and not exists(select 1 from private.moderation_purge_jobs j where j.case_id=other_case.case_id and j.committed_at is not null))
      and not exists(select 1 from private.bunny_media_assets ordinary where ordinary.library_id=m.library_id and ordinary.asset_id=m.asset_id)
      and not exists(select 1 from private.bunny_upload_reservations pending where pending.library_id=m.library_id and pending.asset_id=m.asset_id)
      and not exists(select 1 from private.bunny_media_removals removal where removal.library_id=m.library_id and removal.asset_id=m.asset_id)
  ) candidate;
$$;

create or replace function public.prepare_moderation_retention_purge(target_case_ids uuid[] default null,dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare case_row record; plan jsonb; result jsonb:='[]'::jsonb; requested_id uuid; committed timestamptz;
begin
  if not dry_run and (target_case_ids is null or cardinality(target_case_ids) not between 1 and 50) then
    raise exception 'Execution requires an explicit allowlist of 1 to 50 reviewed cases';
  end if;
  if not dry_run then
    foreach requested_id in array target_case_ids loop
      perform 1 from public.moderation_cases where id=requested_id for update;
      if not found then raise exception 'Requested case does not exist'; end if;
      if not exists(select 1 from private.moderation_purge_jobs where case_id=requested_id and committed_at is not null)
        and not exists(select 1 from public.moderation_cases c where c.id=requested_id
          and c.status in ('resolved','dismissed','closed') and coalesce(c.resolved_at,c.updated_at)<=now()-interval '90 days'
          and not exists(select 1 from private.moderation_retention_holds h where h.case_id=c.id and (h.expires_at is null or h.expires_at>now()))) then
        raise exception 'Every requested case must be closed for 90 days with no active appeal or legal hold';
      end if;
    end loop;
  end if;
  for case_row in select c.id,coalesce(c.resolved_at,c.updated_at)+interval '90 days' as eligible_at
    from public.moderation_cases c where (target_case_ids is null or c.id=any(target_case_ids))
      and (exists(select 1 from private.moderation_purge_jobs j where j.case_id=c.id and j.committed_at is not null)
        or (c.status in ('resolved','dismissed','closed') and coalesce(c.resolved_at,c.updated_at)<=now()-interval '90 days'
          and not exists(select 1 from private.moderation_retention_holds h where h.case_id=c.id and (h.expires_at is null or h.expires_at>now()))))
    order by c.id limit 100
  loop
    select j.manifest,j.committed_at into plan,committed from private.moderation_purge_jobs j where j.case_id=case_row.id;
    if committed is null then
      select jsonb_build_object('protocol',2,'case_id',case_row.id,'eligible_at',case_row.eligible_at,
        'report_ids',coalesce((select jsonb_agg(report_id order by report_id) from public.moderation_case_reports where case_id=case_row.id),'[]'::jsonb),
        'action_ids',coalesce((select jsonb_agg(id order by id) from public.moderation_case_actions where case_id=case_row.id),'[]'::jsonb),
        'storage',coalesce((select jsonb_agg(jsonb_build_object('bucket',f.bucket,'path',f.path) order by f.bucket,f.path) from (
          select a.bucket,a.path from public.moderation_report_attachments a join public.moderation_case_reports l on l.report_id=a.report_id where l.case_id=case_row.id
          union select m.storage_bucket,m.storage_path from private.moderation_media_assets m where m.case_id=case_row.id and m.provider='storage'
        ) f),'[]'::jsonb),
        'bunny_candidates',coalesce((select jsonb_agg(jsonb_build_object('library_id',a.library_id,'asset_id',a.asset_id) order by a.library_id,a.asset_id)
          from (select distinct library_id,asset_id from private.moderation_media_assets where case_id=case_row.id and provider='bunny' and status='ready') a),'[]'::jsonb),
        'bunny_assets',private.moderation_purge_bunny_assets(case_row.id),'removed_bunny_assets','[]'::jsonb) into plan;
      if not dry_run then
        insert into private.moderation_purge_jobs(case_id,manifest) values(case_row.id,plan)
          on conflict(case_id) do update set manifest=excluded.manifest,cancelled_at=null,prepared_at=now()
          where private.moderation_purge_jobs.committed_at is null;
      end if;
    end if;
    result:=result||jsonb_build_array(plan||jsonb_build_object('dry_run',dry_run,'committed_at',committed));
  end loop;
  return result;
end;
$$;

create or replace function public.authorize_moderation_retention_batch(target_case_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job private.moderation_purge_jobs%rowtype;
begin
  perform 1 from public.moderation_cases where id=target_case_id for update;
  select * into job from private.moderation_purge_jobs where case_id=target_case_id;
  if job.committed_at is not null then return job.manifest||jsonb_build_object('committed_at',job.committed_at); end if;
  if job.case_id is null or job.cancelled_at is not null or not exists(
    select 1 from public.moderation_cases c where c.id=target_case_id and c.status in ('resolved','dismissed','closed')
      and coalesce(c.resolved_at,c.updated_at)<=now()-interval '90 days'
      and not exists(select 1 from private.moderation_retention_holds h where h.case_id=c.id and (h.expires_at is null or h.expires_at>now()))
  ) then raise exception 'Purge was cancelled or current retention eligibility changed'; end if;
  return jsonb_set(job.manifest,'{bunny_assets}',private.moderation_purge_bunny_assets(target_case_id));
end;
$$;

create function public.claim_moderation_retention_purge(target_case_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job private.moderation_purge_jobs%rowtype; plan jsonb; item jsonb; source_owner uuid; claim_id uuid;
  object_key text; object_identity uuid; storage_plan jsonb:='[]'::jsonb; bunny_plan jsonb:='[]'::jsonb;
begin
  -- Intake can already hold an owner/media lock before reaching its case row.
  -- Try those subordinate locks rather than waiting while holding the case:
  -- a busy source aborts this whole claim before any external work is allowed.
  perform 1 from public.moderation_cases where id=target_case_id for update;
  if not found then raise exception 'Requested case does not exist'; end if;
  select * into strict job from private.moderation_purge_jobs where case_id=target_case_id for update;
  if job.committed_at is not null then return job.manifest||jsonb_build_object('committed_at',job.committed_at); end if;
  plan:=public.authorize_moderation_retention_batch(target_case_id);
  if coalesce((plan->>'protocol')::integer,0)<>2 then raise exception 'Prepare a fresh protocol 2 reviewed purge'; end if;
  for source_owner in select distinct source_owner_id from private.moderation_media_assets
    where case_id=target_case_id and source_owner_id is not null order by source_owner_id
  loop
    if not pg_try_advisory_xact_lock(hashtextextended('account-deletion:'||source_owner::text,0)) then
      raise exception using errcode='40001',message='A source operation is in progress; retry the unchanged reviewed purge';
    end if;
  end loop;
  for item in select jsonb_build_object('library_id',library_id,'asset_id',asset_id) from private.moderation_media_assets
    where case_id=target_case_id and provider='bunny' group by library_id,asset_id order by library_id,asset_id
  loop
    if not pg_try_advisory_xact_lock(hashtextextended('bunny-media:'||(item->>'library_id')||':'||(item->>'asset_id'),0)) then
      raise exception using errcode='40001',message='A video operation is in progress; retry the unchanged reviewed purge';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(plan->'storage') order by value->>'bucket',value->>'path'
  loop
    if item->>'bucket' not in ('moderation-evidence','moderation-captured-media') or coalesce(length(item->>'path'),0) not between 3 and 1024
      or item->>'path'~'[[:cntrl:]\\]' or exists(select 1 from unnest(string_to_array(item->>'path','/')) p where p in ('','.','..')) then
      raise exception 'Unexpected evidence resource in reviewed manifest';
    end if;
    object_key:=private.moderation_storage_resource_key(item->>'bucket',item->>'path');
    if not pg_try_advisory_xact_lock(hashtextextended('moderation-storage:'||object_key,0)) then
      raise exception using errcode='40001',message='An evidence file operation is in progress; retry the unchanged reviewed purge';
    end if;
    object_identity:=null;
    select id into object_identity from storage.objects where bucket_id=item->>'bucket' and name=item->>'path' for update nowait;
    if exists(select 1 from private.moderation_media_assets other_case where other_case.case_id<>target_case_id
      and other_case.provider='storage' and other_case.status='pending' and other_case.source_bucket=item->>'bucket'
      and other_case.source_path=item->>'path'
      and not exists(select 1 from private.moderation_purge_jobs j where j.case_id=other_case.case_id and j.committed_at is not null)) then
      raise exception 'Another case must capture this evidence source before retention removal';
    end if;
    insert into private.moderation_storage_removals(resource_key,case_id,bucket_id,object_path,object_id)
      values(object_key,target_case_id,item->>'bucket',item->>'path',object_identity) returning id into claim_id;
    storage_plan:=storage_plan||jsonb_build_array(item||jsonb_build_object('removal_id',claim_id,'object_id',object_identity));
  end loop;
  -- The source locks above make this post-lock eligibility read authoritative.
  for item in select value from jsonb_array_elements(private.moderation_purge_bunny_assets(target_case_id))
  loop
    insert into private.bunny_media_removals(library_id,asset_id,owner_id,source_type,source_id)
      values(item->>'library_id',(item->>'asset_id')::uuid,null,'moderation_retention',target_case_id) returning id into claim_id;
    bunny_plan:=bunny_plan||jsonb_build_array(item||jsonb_build_object('removal_id',claim_id));
  end loop;
  plan:=jsonb_set(jsonb_set(plan,'{storage}',storage_plan),'{bunny_assets}',bunny_plan);
  update private.moderation_purge_jobs set manifest=plan,committed_at=clock_timestamp() where case_id=target_case_id returning * into job;
  return job.manifest||jsonb_build_object('committed_at',job.committed_at);
end;
$$;
revoke all on function public.claim_moderation_retention_purge(uuid) from public,anon,authenticated;
grant execute on function public.claim_moderation_retention_purge(uuid) to service_role;

create function public.confirm_moderation_storage_removal(target_case_id uuid,target_removal_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare claim private.moderation_storage_removals%rowtype;
begin
  select * into strict claim from private.moderation_storage_removals where id=target_removal_id and case_id=target_case_id for update;
  if not exists(select 1 from private.moderation_purge_jobs where case_id=target_case_id and committed_at is not null
    and exists(select 1 from jsonb_array_elements(manifest->'storage') p where p->>'removal_id'=target_removal_id::text)) then
    raise exception 'Exact committed evidence removal is required';
  end if;
  if exists(select 1 from storage.objects where bucket_id=claim.bucket_id and name=claim.object_path) then
    raise exception 'Storage removal is not confirmed';
  end if;
  update private.moderation_storage_removals set state='removed',removed_at=coalesce(removed_at,now()) where id=target_removal_id;
end;
$$;
revoke all on function public.confirm_moderation_storage_removal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_moderation_storage_removal(uuid,uuid) to service_role;

create or replace function public.confirm_moderation_provider_removal(target_case_id uuid,target_library_id text,target_asset_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare claim_id uuid;
begin
  select r.id into claim_id from private.bunny_media_removals r join private.moderation_purge_jobs j on j.case_id=r.source_id
    where j.case_id=target_case_id and j.committed_at is not null and r.source_type='moderation_retention'
      and r.library_id=target_library_id and r.asset_id=target_asset_id
      and exists(select 1 from jsonb_array_elements(j.manifest->'bunny_assets') p where p->>'removal_id'=r.id::text);
  if claim_id is null then raise exception 'Exact committed provider removal is required'; end if;
  perform public.finish_bunny_media_removal(claim_id);
end;
$$;

-- Preserve only the existing FK-driven actor anonymization exceptions.
create or replace function private.guard_moderation_purge()
returns trigger language plpgsql security invoker set search_path='' as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_data jsonb; new_data jsonb; case_key uuid; field text;
begin
  case_key:=case when tg_table_name='moderation_cases' then (row_data->>'id')::uuid else (row_data->>'case_id')::uuid end;
  if case_key is null and row_data ? 'report_id' then
    select case_id into case_key from public.moderation_case_reports where report_id=(row_data->>'report_id')::uuid;
  end if;
  if case_key is null and row_data ? 'action_id' then
    select case_id into case_key from public.moderation_case_actions where id=(row_data->>'action_id')::uuid;
  end if;
  if case_key is null then return case when tg_op='DELETE' then old else new end; end if;
  perform 1 from public.moderation_cases where id=case_key for update;
  if coalesce(current_setting('role',true)='service_role'
    and current_setting('shadowchat.moderation_purge_case',true)=case_key::text,false) then
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_op='UPDATE' then
    old_data:=to_jsonb(old); new_data:=to_jsonb(new);
    field:=case tg_table_name when 'moderation_media_assets' then 'source_owner_id'
      when 'moderation_evidence' then 'source_author_id' when 'moderation_case_events' then 'actor_user_id'
      when 'moderation_case_actions' then 'actor_user_id' when 'moderation_report_attachments' then 'uploader_user_id' else null end;
    if field is not null and new_data-field=old_data-field and new_data->field='null'::jsonb then return new; end if;
    if tg_table_name='moderation_cases' and new_data-'subject_user_id'-'assigned_to'=old_data-'subject_user_id'-'assigned_to'
      and (new_data->'subject_user_id'=old_data->'subject_user_id' or new_data->'subject_user_id'='null'::jsonb)
      and (new_data->'assigned_to'=old_data->'assigned_to' or new_data->'assigned_to'='null'::jsonb) then return new; end if;
  end if;
  if exists(select 1 from private.moderation_purge_jobs where case_id=case_key and committed_at is not null) then
    raise exception using errcode='55000',message='This reviewed case purge is committed; evidence removal may already be in progress and cannot be cancelled';
  end if;
  if exists(select 1 from private.moderation_purge_jobs where case_id=case_key) then
    if tg_op='DELETE' then raise exception 'Case deletion requires the scoped purge worker'; end if;
    update private.moderation_purge_jobs set cancelled_at=now() where case_id=case_key;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger moderation_evidence_purge_guard before insert on public.moderation_evidence for each row execute function private.guard_moderation_purge();
create trigger moderation_attachments_purge_guard before insert on public.moderation_report_attachments for each row execute function private.guard_moderation_purge();
create trigger moderation_events_purge_guard before insert on public.moderation_case_events for each row execute function private.guard_moderation_purge();
create trigger moderation_actions_purge_guard before insert on public.moderation_case_actions for each row execute function private.guard_moderation_purge();
create trigger moderation_action_bans_purge_guard before insert on public.moderation_action_channel_bans for each row execute function private.guard_moderation_purge();
create trigger moderation_report_updates_purge_guard before insert on public.moderation_report_updates for each row execute function private.guard_moderation_purge();

create or replace function private.guard_reported_bunny_removal()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and to_jsonb(new)-'source_owner_id'=to_jsonb(old)-'source_owner_id' and new.source_owner_id is null then return new; end if;
  if new.provider='bunny' then
    if new.source_owner_id is not null then perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||new.source_owner_id::text,0)); end if;
    perform pg_advisory_xact_lock(hashtextextended('bunny-media:'||new.library_id||':'||new.asset_id::text,0));
    if exists(select 1 from private.bunny_media_removals r where r.library_id=new.library_id and r.asset_id=new.asset_id) then
      new.status:='unavailable'; new.error_code:='source_removal_in_progress'; new.captured_at:=null;
    end if;
  end if;
  return new;
end;
$$;

create function private.guard_moderation_storage_removal()
returns trigger language plpgsql security definer set search_path='' as $$
declare bucket text; object_path text; key text; claim private.moderation_storage_removals%rowtype;
begin
  bucket:=case when tg_op='DELETE' then old.bucket_id else new.bucket_id end;
  object_path:=case when tg_op='DELETE' then old.name else new.name end;
  if bucket in ('moderation-evidence','moderation-captured-media') then
    key:=private.moderation_storage_resource_key(bucket,object_path);
    perform pg_advisory_xact_lock(hashtextextended('moderation-storage:'||key,0));
    select * into claim from private.moderation_storage_removals where resource_key=key;
    if claim.id is not null and not (tg_op='DELETE' and current_setting('role',true)='service_role'
      and claim.state='pending' and claim.object_id is not null and claim.object_id=old.id) then
      raise exception 'Evidence removal has already been committed; this path cannot be replaced or revived';
    end if;
  end if;
  if tg_op='UPDATE' and (old.bucket_id is distinct from new.bucket_id or old.name is distinct from new.name)
    and exists(select 1 from private.moderation_storage_removals where resource_key=private.moderation_storage_resource_key(old.bucket_id,old.name)) then
    raise exception 'A committed evidence object cannot be moved';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.guard_moderation_storage_removal() from public,anon,authenticated;
create trigger guard_moderation_storage_removal before insert or update or delete on storage.objects
  for each row execute function private.guard_moderation_storage_removal();

-- Prepared jobs alone no longer permit deletion of pending/captured evidence.
create or replace function private.guard_reported_media_storage()
returns trigger language plpgsql security definer set search_path='' as $$
declare asset record;
begin
  if exists(select 1 from private.moderation_media_assets m where m.provider='storage' and m.status='pending'
    and m.source_bucket=old.bucket_id and m.source_path=old.name and m.source_object_id=old.id)
    and not (tg_op='DELETE' and current_setting('role',true)='service_role' and not exists(
      select 1 from private.moderation_media_assets held where held.provider='storage' and held.status='pending'
        and held.source_bucket=old.bucket_id and held.source_path=old.name and held.source_object_id=old.id
        and not exists(select 1 from private.moderation_purge_jobs j join private.moderation_storage_removals r on r.case_id=j.case_id
          where j.case_id=held.case_id and j.committed_at is not null and r.state='pending'
            and r.bucket_id=old.bucket_id and r.object_path=old.name and r.object_id=old.id)
    )) then raise exception 'Reported media must be captured before source removal or replacement'; end if;
  if old.bucket_id='moderation-captured-media' then
    select * into asset from private.moderation_media_assets where storage_path=old.name;
    if asset.id is not null and asset.status='ready' and not (
      tg_op='DELETE' and current_setting('role',true)='service_role' and exists(
        select 1 from private.moderation_purge_jobs j join private.moderation_storage_removals r on r.case_id=j.case_id
          where j.case_id=asset.case_id and j.committed_at is not null and r.state='pending'
            and r.bucket_id=old.bucket_id and r.object_path=old.name and r.object_id=old.id)
    ) then raise exception 'Captured report media is immutable until committed retention purge'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function private.can_read_captured_moderation_media(object_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.is_active_member() and exists(select 1 from private.moderation_media_assets m
    where m.storage_path=object_path and m.provider='storage' and m.status='ready'
      and not exists(select 1 from private.moderation_purge_jobs j where j.case_id=m.case_id and j.committed_at is not null)
      and private.can_operator_read_moderation_evidence(auth.uid(),m.case_id));
$$;
create or replace function public.get_moderation_media_for_case(actor_user_id uuid,target_case_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if not public.is_active_member_for_service(actor_user_id) or not exists(select 1 from public.moderation_cases where id=target_case_id)
    or not private.can_operator_read_moderation_evidence(actor_user_id,target_case_id)
    or exists(select 1 from private.moderation_purge_jobs where case_id=target_case_id and committed_at is not null) then
    raise exception using errcode='42501',message='This case is not available for media review';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(m) order by created_at,id) from private.moderation_media_assets m where case_id=target_case_id),'[]'::jsonb);
end;
$$;

create function private.guard_moderation_purge_commit()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and old.committed_at is not null and to_jsonb(new)<>to_jsonb(old) then
    raise exception 'Committed evidence removal cannot be cancelled or prepared again';
  end if;
  if tg_op='DELETE' and (old.committed_at is null
    or not coalesce(current_setting('role',true)='service_role' and current_setting('shadowchat.moderation_purge_case',true)=old.case_id::text,false)
    or exists(select 1 from private.moderation_storage_removals where case_id=old.case_id and state<>'removed')
    or exists(select 1 from private.bunny_media_removals where source_type='moderation_retention' and source_id=old.case_id and state<>'removed')) then
    raise exception 'Every committed evidence removal must be confirmed before finalization';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.guard_moderation_purge_commit() from public,anon,authenticated;
create trigger guard_moderation_purge_commit before update or delete on private.moderation_purge_jobs
  for each row execute function private.guard_moderation_purge_commit();

alter function public.finish_moderation_retention_purge(uuid) set schema private;
alter function private.finish_moderation_retention_purge(uuid) rename to finish_moderation_retention_rows;
revoke all on function private.finish_moderation_retention_rows(uuid) from public,anon,authenticated;
grant execute on function private.finish_moderation_retention_rows(uuid) to service_role;
create or replace function private.finish_moderation_retention_rows(target_case_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare plan jsonb; report_ids uuid[]; action_ids uuid[];
begin
  perform 1 from public.moderation_cases where id=target_case_id for update;
  select manifest into plan from private.moderation_purge_jobs where case_id=target_case_id and committed_at is not null for update;
  if plan is null then raise exception 'A durable reviewed purge commitment is required'; end if;
  -- Eligibility was checked under the case lock at the irreversible commitment.
  -- FK anonymization may subsequently touch updated_at on a closed legacy case
  -- with no resolved_at. It cannot strand already-confirmed external removals.
  if exists(select 1 from private.moderation_storage_removals where case_id=target_case_id and state<>'removed')
    or exists(select 1 from private.bunny_media_removals where source_type='moderation_retention' and source_id=target_case_id and state<>'removed') then
    raise exception 'Every committed evidence removal must be confirmed before finalization';
  end if;
  if exists(select 1 from jsonb_array_elements(plan->'storage') item join storage.objects o
    on o.bucket_id=item->>'bucket' and o.name=item->>'path') then
    raise exception 'Remove the planned evidence files through the Storage API before finishing';
  end if;
  perform set_config('shadowchat.moderation_purge_case',target_case_id::text,true);
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into report_ids from jsonb_array_elements_text(plan->'report_ids');
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into action_ids from jsonb_array_elements_text(plan->'action_ids');
  delete from private.moderation_media_assets where case_id=target_case_id;
  delete from public.moderation_report_attachments where report_id=any(report_ids);
  delete from public.moderation_report_updates where report_id=any(report_ids);
  delete from public.moderation_evidence where case_id=target_case_id;
  delete from public.moderation_case_events where case_id=target_case_id;
  delete from public.moderation_action_channel_bans where action_id=any(action_ids);
  delete from public.moderation_case_actions where case_id=target_case_id;
  delete from public.moderation_case_reports where case_id=target_case_id;
  delete from public.member_reports where id=any(report_ids);
  delete from public.moderation_cases where id=target_case_id;
  delete from private.moderation_purge_jobs where case_id=target_case_id;
end;
$$;
create function public.finish_moderation_retention_purge(target_case_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.moderation_cases where id=target_case_id for update;
  if not found then return; end if;
  if not exists(select 1 from private.moderation_purge_jobs where case_id=target_case_id and committed_at is not null) then
    raise exception 'A durable reviewed purge commitment is required';
  end if;
  if exists(select 1 from private.moderation_storage_removals where case_id=target_case_id and state<>'removed')
    or exists(select 1 from private.bunny_media_removals where source_type='moderation_retention' and source_id=target_case_id and state<>'removed') then
    raise exception 'Every committed evidence removal must be confirmed before finalization';
  end if;
  perform private.finish_moderation_retention_rows(target_case_id);
  -- Keep only hash tombstones to reject late retries/reuploads; discard paths,
  -- object IDs and case associations after their confirmed purge is complete.
  update private.moderation_storage_removals set object_path=null,object_id=null,case_id=null where case_id=target_case_id and state='removed';
end;
$$;
revoke all on function public.finish_moderation_retention_purge(uuid) from public,anon,authenticated;
grant execute on function public.finish_moderation_retention_purge(uuid) to service_role;

comment on column private.moderation_purge_jobs.committed_at is
  'Irreversible purge boundary. Before commit new holds/case changes cancel preparation; after commit callers must not claim evidence can still be preserved.';
comment on table private.moderation_storage_removals is
  'Exact service-only Storage delete claims. Unknown outcomes remain pending; completed case purges keep only non-revivable path hashes with no raw path, object ID or case ID.';
notify pgrst,'reload schema';
commit;
