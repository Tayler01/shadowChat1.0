-- Reconcile interrupted individual-video removals during account deletion.
-- Only a confirmed provider checkpoint marks exact manifest assets removed.
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
    union select r.library_id,r.asset_id from private.bunny_media_removals r where r.owner_id=target_user_id and r.state='pending'
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
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job private.account_deletion_jobs%rowtype; positions text[]:=array['requested','providers_removed','storage_removed','data_removed','completed'];
begin
  perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||target_user_id::text,0));
  select * into strict job from private.account_deletion_jobs where user_id=target_user_id for update;
  if next_state not in ('providers_removed','storage_removed') then raise exception 'Invalid deletion checkpoint'; end if;
  if array_position(positions,job.state)>=array_position(positions,next_state) then
    return jsonb_build_object('user_id',job.user_id,'state',job.state,'manifest',job.manifest);
  end if;
  if array_position(positions,next_state)<>array_position(positions,job.state)+1 then raise exception 'Deletion checkpoint out of order'; end if;
  if next_state='providers_removed' then
    if exists(select 1 from private.bunny_upload_reservations r where r.owner_id=target_user_id
      and (r.state='pending' or not exists(select 1 from jsonb_array_elements(job.manifest->'bunny_assets') a
        where a->>'library_id'=r.library_id and a->>'asset_id'=r.asset_id::text)
        and not exists(select 1 from private.moderation_media_assets held where held.provider='bunny' and held.status='ready'
          and held.library_id=r.library_id and held.asset_id=r.asset_id)
        and not exists(select 1 from private.bunny_media_assets shared where shared.library_id=r.library_id
          and shared.asset_id=r.asset_id and shared.owner_id<>target_user_id))) then
      raise exception 'In-flight provider uploads are not reconciled';
    end if;
    if exists(select 1 from private.bunny_media_removals r where r.owner_id=target_user_id and r.state='pending'
      and not exists(select 1 from jsonb_array_elements(job.manifest->'bunny_assets') a
        where a->>'library_id'=r.library_id and a->>'asset_id'=r.asset_id::text)) then
      raise exception 'Pending provider removals are not reconciled';
    end if;
    update private.bunny_media_removals r set state='removed',updated_at=now()
      where r.owner_id=target_user_id and r.state='pending'
        and exists(select 1 from jsonb_array_elements(job.manifest->'bunny_assets') a
          where a->>'library_id'=r.library_id and a->>'asset_id'=r.asset_id::text);
  end if;
  if next_state='storage_removed' and exists(
    select 1 from jsonb_array_elements(job.manifest->'storage') bucket_plan
    cross join lateral jsonb_array_elements_text(bucket_plan->'paths') object_path
    join storage.objects o on o.bucket_id=bucket_plan->>'bucket' and o.name=object_path
  ) then raise exception 'Storage cleanup is not confirmed'; end if;
  update private.account_deletion_jobs set state=next_state,updated_at=now() where user_id=target_user_id returning * into job;
  return jsonb_build_object('user_id',job.user_id,'state',job.state,'manifest',job.manifest);
end;
$$;

create or replace function public.finish_account_deletion(target_user_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare job private.account_deletion_jobs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||target_user_id::text,0));
  select * into strict job from private.account_deletion_jobs where user_id=target_user_id for update;
  if job.state='completed' then
    perform public.anonymize_completed_bunny_removals(target_user_id);
    return;
  end if;
  -- Auth removal is independently confirmed by the Edge worker's Admin API read.
  if job.state<>'data_removed' or exists(select 1 from public.users where id=target_user_id) then
    raise exception 'Account removal is not confirmed';
  end if;
  perform public.anonymize_completed_bunny_removals(target_user_id);
  update private.account_deletion_jobs set state='completed',manifest='{}'::jsonb,
    completed_at=now(),receipt_expires_at=now()+interval '24 hours',updated_at=now() where user_id=target_user_id;
end;
$$;

notify pgrst,'reload schema';
commit;
