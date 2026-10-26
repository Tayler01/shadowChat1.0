-- Submitted safety media is preserved before ordinary account bytes are removed.
-- This migration only defines enforcement; it does not delete files or providers.
begin;

create or replace function public.refresh_account_deletion_providers(target_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job private.account_deletion_jobs%rowtype; assets jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||target_user_id::text,0));
  select * into strict job from private.account_deletion_jobs where user_id=target_user_id for update;
  if job.state<>'requested' then raise exception 'Provider refresh requires the requested checkpoint'; end if;
  if exists(select 1 from private.bunny_upload_reservations where owner_id=target_user_id and state='pending') then
    raise exception 'An in-flight provider upload must be reconciled before account deletion can complete';
  end if;
  with candidates as (
    select a.library_id,a.asset_id from private.bunny_media_assets a where a.owner_id=target_user_id
    union select r.library_id,r.asset_id from private.bunny_upload_reservations r where r.owner_id=target_user_id and r.state='created'
    union select a->>'library_id',(a->>'asset_id')::uuid from jsonb_array_elements(job.manifest->'bunny_assets') a
  )
  select coalesce(jsonb_agg(jsonb_build_object('library_id',c.library_id,'asset_id',c.asset_id) order by c.library_id,c.asset_id),'[]'::jsonb) into assets
    from candidates c where not exists(select 1 from private.bunny_media_assets shared where shared.library_id=c.library_id
      and shared.asset_id=c.asset_id and shared.owner_id<>target_user_id)
      and not exists(select 1 from private.moderation_media_assets held where held.provider='bunny'
        and held.status='ready' and held.library_id=c.library_id and held.asset_id=c.asset_id);
  update private.account_deletion_jobs set manifest=jsonb_set(manifest,'{bunny_assets}',assets),updated_at=now()
    where user_id=target_user_id returning * into job;
  return jsonb_build_object('user_id',job.user_id,'state',job.state,'manifest',job.manifest);
end;
$$;

create or replace function public.checkpoint_account_deletion(target_user_id uuid, next_state text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare job private.account_deletion_jobs%rowtype; positions text[] := array['requested','providers_removed','storage_removed','data_removed','completed'];
begin
  select * into strict job from private.account_deletion_jobs where user_id = target_user_id for update;
  if next_state not in ('providers_removed','storage_removed') then raise exception 'Invalid deletion checkpoint'; end if;
  if array_position(positions, job.state) >= array_position(positions, next_state) then
    return jsonb_build_object('user_id',job.user_id,'state',job.state,'manifest',job.manifest);
  end if;
  if array_position(positions, next_state) <> array_position(positions, job.state) + 1 then raise exception 'Deletion checkpoint out of order'; end if;
  if next_state='providers_removed' and exists(select 1 from private.bunny_upload_reservations r where r.owner_id=target_user_id
    and (r.state='pending' or not exists(select 1 from jsonb_array_elements(job.manifest->'bunny_assets') a
      where a->>'library_id'=r.library_id and a->>'asset_id'=r.asset_id::text)
      and not exists(select 1 from private.moderation_media_assets held where held.provider='bunny' and held.status='ready'
        and held.library_id=r.library_id and held.asset_id=r.asset_id)
      and not exists(select 1 from private.bunny_media_assets shared where shared.library_id=r.library_id
        and shared.asset_id=r.asset_id and shared.owner_id<>target_user_id))) then
    raise exception 'In-flight provider uploads are not reconciled';
  end if;
  if next_state = 'storage_removed' and exists(
    select 1 from jsonb_array_elements(job.manifest->'storage') bucket_plan
    cross join lateral jsonb_array_elements_text(bucket_plan->'paths') object_path
    join storage.objects o on o.bucket_id = bucket_plan->>'bucket' and o.name = object_path
  ) then raise exception 'Storage cleanup is not confirmed'; end if;
  update private.account_deletion_jobs set state = next_state, updated_at = now() where user_id = target_user_id returning * into job;
  return jsonb_build_object('user_id',job.user_id,'state',job.state,'manifest',job.manifest);
end;
$$;

create or replace function public.refresh_account_deletion_storage(target_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare job private.account_deletion_jobs%rowtype; new_storage jsonb;
begin
  select * into strict job from private.account_deletion_jobs where user_id = target_user_id for update;
  if job.state <> 'providers_removed' then raise exception 'Storage refresh requires the provider checkpoint'; end if;
  if exists(select 1 from private.moderation_media_assets held where held.source_owner_id=target_user_id
    and held.provider='storage' and held.status='pending') then
    raise exception 'Submitted media capture must finish before account file cleanup';
  end if;
  if exists(select 1 from public.moderation_report_attachments a join storage.objects o on o.bucket_id=a.bucket and o.name=a.path
    where (split_part(o.name,'/',1)=target_user_id::text or o.owner=target_user_id or o.owner_id=target_user_id::text)
      and not exists(select 1 from private.moderation_media_assets captured where captured.provider='storage' and captured.status='ready'
        and captured.source_bucket=a.bucket and captured.source_path=a.path)) then
    raise exception 'Submitted attachment preservation must be confirmed before account deletion';
  end if;
  with paths as (
    select bucket_plan->>'bucket' as bucket, object_path as path
      from jsonb_array_elements(job.manifest->'storage') bucket_plan
      cross join lateral jsonb_array_elements_text(bucket_plan->'paths') object_path
    union
    select o.bucket_id,o.name from storage.objects o where
      o.bucket_id = any(array['avatars','banners','message-media','chat-uploads','art-board','shadow-pin','shadow-pin-comments','shadow-pin-drafts','shado-tv','feedback-attachments','moderation-evidence'])
      and (split_part(o.name,'/',1) = target_user_id::text or o.owner = target_user_id or o.owner_id = target_user_id::text)
      and (not exists(select 1 from public.moderation_report_attachments a where a.bucket = o.bucket_id and a.path = o.name)
        or exists(select 1 from private.moderation_media_assets captured where captured.provider='storage' and captured.status='ready'
          and captured.source_bucket=o.bucket_id and captured.source_path=o.name))
  ), plans as (select bucket,jsonb_agg(path order by path) as paths from paths group by bucket)
  select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'paths',paths) order by bucket),'[]'::jsonb) into new_storage from plans;
  update private.account_deletion_jobs set manifest = jsonb_set(manifest,'{storage}',new_storage),updated_at=now()
    where user_id = target_user_id returning * into job;
  return jsonb_build_object('user_id',job.user_id,'state',job.state,'manifest',job.manifest);
end;
$$;

create or replace function public.can_delete_bunny_media_asset(target_source_type text,target_source_id uuid,target_asset_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from private.bunny_media_assets current_asset
    where current_asset.source_type=target_source_type and current_asset.source_id=target_source_id and current_asset.asset_id=target_asset_id
      and not exists(select 1 from private.bunny_media_assets shared where shared.library_id=current_asset.library_id
        and shared.asset_id=current_asset.asset_id and shared.owner_id<>current_asset.owner_id)
      and not exists(select 1 from private.moderation_media_assets held where held.provider='bunny' and held.status='ready'
        and held.library_id=current_asset.library_id and held.asset_id=current_asset.asset_id)
      and not exists(select 1 from public.shadow_pin_images p where p.provider='bunny_stream'
        and p.provider_asset_id=target_asset_id::text and p.deleted_at is null
        and not (target_source_type='shadow_pin_image' and p.id=target_source_id))
      and not exists(select 1 from public.shadow_pin_draft_assets d where d.provider='bunny_stream'
        and d.provider_asset_id=target_asset_id::text and d.deleted_at is null and d.state not in ('failed','superseded','deleted')
        and not (target_source_type='shadow_pin_draft_asset' and d.id=target_source_id))
      and not exists(select 1 from public.shado_tv_videos v where v.deleted_at is null and (
        v.provider_asset_id=target_asset_id::text or v.provider_payload->'bunny_stream'->'episode'->>'videoId'=target_asset_id::text
        or v.provider_payload->'bunny_stream'->'trailer'->>'videoId'=target_asset_id::text)
        and not (target_source_type='shado_tv_asset' and v.id=target_source_id)));
$$;

create function private.moderation_purge_bunny_assets(target_case_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('library_id',candidate.library_id,'asset_id',candidate.asset_id)
    order by candidate.library_id,candidate.asset_id),'[]'::jsonb) from (
    select distinct m.library_id,m.asset_id from private.moderation_media_assets m
    where m.case_id=target_case_id and m.provider='bunny' and m.status='ready'
      and not exists(select 1 from private.moderation_media_assets other_case where other_case.case_id<>target_case_id
        and other_case.provider='bunny' and other_case.status='ready' and other_case.library_id=m.library_id and other_case.asset_id=m.asset_id)
      and not exists(select 1 from private.bunny_media_assets ordinary where ordinary.library_id=m.library_id and ordinary.asset_id=m.asset_id)
      and not exists(select 1 from private.bunny_upload_reservations pending where pending.library_id=m.library_id and pending.asset_id=m.asset_id)
  ) candidate;
$$;
revoke all on function private.moderation_purge_bunny_assets(uuid) from public,anon,authenticated;
grant execute on function private.moderation_purge_bunny_assets(uuid) to service_role;

create or replace function public.prepare_moderation_retention_purge(target_case_ids uuid[] default null, dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare case_row record; plan jsonb; result jsonb := '[]'::jsonb; requested_id uuid;
begin
  if not dry_run and (target_case_ids is null or cardinality(target_case_ids) not between 1 and 50) then
    raise exception 'Execution requires an explicit allowlist of 1 to 50 reviewed cases';
  end if;
  if not dry_run then
    foreach requested_id in array target_case_ids loop
      perform 1 from public.moderation_cases where id = requested_id for update;
      if not found then raise exception 'Requested case does not exist'; end if;
      if not exists(select 1 from public.moderation_cases c where c.id = requested_id
        and c.status in ('resolved','dismissed','closed') and coalesce(c.resolved_at,c.updated_at) <= now() - interval '90 days'
        and not exists(select 1 from private.moderation_retention_holds h where h.case_id = c.id and (h.expires_at is null or h.expires_at > now()))) then
        raise exception 'Every requested case must be closed for 90 days with no active appeal or legal hold';
      end if;
    end loop;
  end if;
  for case_row in select c.id, c.status, coalesce(c.resolved_at,c.updated_at) + interval '90 days' as eligible_at
    from public.moderation_cases c where (target_case_ids is null or c.id = any(target_case_ids))
      and c.status in ('resolved','dismissed','closed') and coalesce(c.resolved_at,c.updated_at) <= now() - interval '90 days'
      and not exists(select 1 from private.moderation_retention_holds h where h.case_id = c.id and (h.expires_at is null or h.expires_at > now()))
    order by coalesce(c.resolved_at,c.updated_at),c.id limit 100
  loop
    select jsonb_build_object('case_id',case_row.id,'eligible_at',case_row.eligible_at,
      'report_ids',coalesce((select jsonb_agg(report_id) from public.moderation_case_reports where case_id = case_row.id),'[]'::jsonb),
      'action_ids',coalesce((select jsonb_agg(id) from public.moderation_case_actions where case_id = case_row.id),'[]'::jsonb),
      'storage',coalesce((select jsonb_agg(jsonb_build_object('bucket',files.bucket,'path',files.path) order by files.bucket,files.path) from (
        select a.bucket,a.path from public.moderation_report_attachments a
          join public.moderation_case_reports l on l.report_id=a.report_id where l.case_id=case_row.id
        union select m.storage_bucket,m.storage_path from private.moderation_media_assets m
          where m.case_id=case_row.id and m.provider='storage'
      ) files),'[]'::jsonb),
      'bunny_assets',private.moderation_purge_bunny_assets(case_row.id),
      'removed_bunny_assets','[]'::jsonb) into plan;
    if not dry_run then
      insert into private.moderation_purge_jobs(case_id,manifest) values(case_row.id,plan)
        on conflict(case_id) do update set manifest=excluded.manifest,cancelled_at=null,prepared_at=now();
      select manifest into plan from private.moderation_purge_jobs where case_id = case_row.id;
    end if;
    result := result || jsonb_build_array(plan || jsonb_build_object('dry_run',dry_run));
  end loop;
  return result;
end;
$$;

create or replace function public.authorize_moderation_retention_batch(target_case_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare plan jsonb;
begin
  perform 1 from public.moderation_cases where id=target_case_id for update;
  select j.manifest into plan from private.moderation_purge_jobs j join public.moderation_cases c on c.id=j.case_id
    where j.case_id=target_case_id and j.cancelled_at is null and c.status in ('resolved','dismissed','closed')
      and coalesce(c.resolved_at,c.updated_at)<=now()-interval '90 days'
      and not exists(select 1 from private.moderation_retention_holds h where h.case_id=c.id and (h.expires_at is null or h.expires_at>now()));
  if plan is null then raise exception 'Purge was cancelled or current retention eligibility changed'; end if;
  -- Shared ordinary content or another case may have acquired a reference
  -- since preparation. Never remove that provider asset for this case.
  plan := jsonb_set(plan,'{bunny_assets}',private.moderation_purge_bunny_assets(target_case_id));
  return plan;
end;
$$;

create function public.confirm_moderation_provider_removal(target_case_id uuid,target_library_id text,target_asset_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare current_plan jsonb; asset jsonb:=jsonb_build_object('library_id',target_library_id,'asset_id',target_asset_id);
begin
  current_plan:=public.authorize_moderation_retention_batch(target_case_id);
  if not (current_plan->'bunny_assets') @> jsonb_build_array(asset) then
    raise exception 'Provider asset is not exclusively eligible for this case purge';
  end if;
  update private.moderation_purge_jobs set manifest=jsonb_set(manifest,'{removed_bunny_assets}',
    coalesce(manifest->'removed_bunny_assets','[]'::jsonb)||jsonb_build_array(asset)) where case_id=target_case_id;
end;
$$;
revoke all on function public.confirm_moderation_provider_removal(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.confirm_moderation_provider_removal(uuid,text,uuid) to service_role;

create or replace function public.finish_moderation_retention_purge(target_case_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare plan jsonb; report_ids uuid[]; action_ids uuid[];
begin
  perform 1 from public.moderation_cases where id = target_case_id for update;
  select manifest into plan from private.moderation_purge_jobs where case_id = target_case_id for update;
  if plan is null then
    if not exists(select 1 from public.moderation_cases where id = target_case_id) then return; end if;
    raise exception 'A reviewed purge must be prepared first';
  end if;
  if exists(select 1 from private.moderation_purge_jobs where case_id=target_case_id and cancelled_at is not null)
    or not exists(select 1 from public.moderation_cases c where c.id=target_case_id
      and c.status in ('resolved','dismissed','closed') and coalesce(c.resolved_at,c.updated_at) <= now()-interval '90 days'
      and not exists(select 1 from private.moderation_retention_holds h where h.case_id=c.id and (h.expires_at is null or h.expires_at>now()))) then
    raise exception 'Purge was cancelled or current retention eligibility changed';
  end if;
  if exists(select 1 from jsonb_array_elements(plan->'storage') item join storage.objects o
    on o.bucket_id = item->>'bucket' and o.name = item->>'path') then
    raise exception 'Remove the planned evidence files through the Storage API before finishing';
  end if;
  if exists(select 1 from jsonb_array_elements(private.moderation_purge_bunny_assets(target_case_id)) asset
    where not coalesce(plan->'removed_bunny_assets','[]'::jsonb) @> jsonb_build_array(asset)) then
    raise exception 'Retained provider removal is not confirmed';
  end if;
  perform set_config('shadowchat.moderation_purge_case',target_case_id::text,true);
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into report_ids from jsonb_array_elements_text(plan->'report_ids');
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into action_ids from jsonb_array_elements_text(plan->'action_ids');
  delete from private.moderation_media_assets where case_id=target_case_id;
  delete from public.moderation_report_attachments where report_id = any(report_ids);
  delete from public.moderation_report_updates where report_id = any(report_ids);
  delete from public.moderation_evidence where case_id = target_case_id;
  delete from public.moderation_case_events where case_id = target_case_id;
  delete from public.moderation_action_channel_bans where action_id = any(action_ids);
  delete from public.moderation_case_actions where case_id = target_case_id;
  delete from public.moderation_case_reports where case_id = target_case_id;
  delete from public.member_reports where id = any(report_ids);
  delete from public.moderation_cases where id = target_case_id;
  delete from private.moderation_purge_jobs where case_id = target_case_id;
end;
$$;

create or replace function private.guard_moderation_purge()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare case_key uuid;
begin
  case_key := case when tg_table_name = 'moderation_cases' then (to_jsonb(old)->>'id')::uuid when tg_op='DELETE' then (to_jsonb(old)->>'case_id')::uuid else (to_jsonb(new)->>'case_id')::uuid end;
  -- The same parent row lock serializes hold/report changes and preparation.
  perform 1 from public.moderation_cases where id = case_key for update;
  if exists(select 1 from private.moderation_purge_jobs where case_id = case_key)
    and not coalesce(current_setting('role', true) = 'service_role'
      and current_setting('shadowchat.moderation_purge_case', true) = case_key::text,false) then
    if tg_op = 'DELETE' then raise exception 'Case deletion requires the scoped purge worker'; end if;
    -- New evidence, reopening, or a new hold always cancels preparation. An
    -- operator must review and explicitly prepare again before more removal.
    update private.moderation_purge_jobs set cancelled_at = now() where case_id = case_key;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger moderation_media_assets_purge_guard before insert or update or delete on private.moderation_media_assets
for each row execute function private.guard_moderation_purge();

notify pgrst,'reload schema';
commit;
