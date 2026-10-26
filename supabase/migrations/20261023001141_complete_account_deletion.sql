-- Local, additive deletion completion. No account or evidence is deleted when
-- this migration is applied. All orchestration RPCs are service-role only.
begin;

-- FK anonymization is deferred until the durable deletion handler is deployed
-- and old handler requests have drained; see the explicit activation migration.

create function public.begin_account_deletion(target_user_id uuid, request_receipt_digest text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare job private.account_deletion_jobs%rowtype; cleanup_manifest jsonb;
begin
  if target_user_id is null or request_receipt_digest !~ '^[0-9a-f]{64}$' then raise exception 'Invalid deletion request'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account-deletion:' || target_user_id::text, 0));
  select * into job from private.account_deletion_jobs where user_id = target_user_id for update;
  if found then
    -- The Edge handler verifies the caller before beginning with a new receipt.
    update private.account_deletion_jobs set receipt_digest = request_receipt_digest, updated_at = now()
      where user_id = target_user_id returning * into job;
    return jsonb_build_object('user_id', job.user_id, 'state', job.state, 'manifest', job.manifest);
  end if;
  perform 1 from public.users where id = target_user_id for update;
  if not found then raise exception 'Member profile is missing'; end if;
  -- Lock role rows so a concurrent role transfer cannot bypass the last-admin
  -- contract between the check and creation of the access-revocation record.
  perform 1 from public.user_roles where role = 'admin' for update;
  if exists (select 1 from public.user_roles where user_id = target_user_id and role = 'admin') then
    raise exception using errcode = 'PT403', message = 'Transfer full admin access before deleting this account.';
  end if;
  if exists(select 1 from public.shadow_pin_categories c
    cross join lateral unnest(array[c.image_path,c.thumbnail_path,c.medium_path]) p(path)
    where c.creator_id is distinct from target_user_id and split_part(p.path,'/',1) = target_user_id::text) then
    raise exception using errcode = '55000', message = 'Shared category media must be re-homed to its creator before deleting this account';
  end if;
  if exists(
    select 1 from (
      select 'shadow_pin_image' as source_type,id as source_id,provider_asset_id from public.shadow_pin_images where creator_id=target_user_id and provider='bunny_stream'
      union all select 'shadow_pin_draft_asset',id,provider_asset_id from public.shadow_pin_draft_assets where creator_id=target_user_id and provider='bunny_stream'
      union all select 'shado_tv_asset',id,provider_asset_id from public.shado_tv_videos where created_by=target_user_id and provider='bunny_stream'
    ) asset where asset.provider_asset_id is not null and not exists(
      select 1 from private.bunny_media_assets trusted where trusted.owner_id=target_user_id
        and trusted.source_type=asset.source_type and trusted.source_id=asset.source_id and trusted.asset_id::text=asset.provider_asset_id)
  ) then raise exception using errcode='55000',message='Existing video ownership must be verified before account deletion'; end if;

  -- The durable handler is installed before FK/capture activation. During that
  -- brief handover, retain the live account and every byte instead of starting
  -- irreversible cleanup without report-capture enforcement.
  if (select count(*) from pg_catalog.pg_trigger
      where not tgisinternal and tgenabled in ('O','A')
        and ((tgname='queue_reported_media' and tgrelid='public.moderation_evidence'::regclass)
          or (tgname='queue_report_attachment' and tgrelid='public.moderation_report_attachments'::regclass)
          or (tgname='guard_reported_media_storage' and tgrelid='storage.objects'::regclass))) <> 3 then
    raise exception using errcode='PT503',message='Account deletion is being upgraded; retry shortly. No deletion has started.';
  end if;

  with member_storage as (
    select o.bucket_id as bucket, o.name as path from storage.objects o
    where o.bucket_id = any(array['avatars','banners','message-media','chat-uploads','art-board','shadow-pin','shadow-pin-comments','shadow-pin-drafts','shado-tv','feedback-attachments'])
      and (split_part(o.name, '/', 1) = target_user_id::text or o.owner = target_user_id or o.owner_id = target_user_id::text)
    union
    -- Old image processors wrote derivatives outside the member prefix. Only
    -- exact paths under the owned row's generated directory are trusted here.
    select 'shadow-pin', p.path from public.shadow_pin_images i
      cross join lateral unnest(array[i.thumbnail_path, i.medium_path]) p(path)
      where i.creator_id = target_user_id and p.path like 'derivatives/images/' || i.id::text || '/%'
    union
    select 'shadow-pin', p.path from public.shadow_pin_categories c
      cross join lateral unnest(array[c.thumbnail_path, c.medium_path]) p(path)
      where c.creator_id = target_user_id and p.path like 'derivatives/categories/' || c.id::text || '/%'
    union
    -- Unsubmitted evidence uploads have no safety retention justification.
    select o.bucket_id, o.name from storage.objects o where o.bucket_id = 'moderation-evidence'
      and (split_part(o.name, '/', 1) = target_user_id::text or o.owner = target_user_id or o.owner_id = target_user_id::text)
      and not exists (select 1 from public.moderation_report_attachments a where a.bucket = o.bucket_id and a.path = o.name)
  ), bucket_plans as (
    select bucket, jsonb_agg(path order by path) as paths from member_storage group by bucket
  ), bunny_assets as (
    select distinct a.library_id,a.asset_id from private.bunny_media_assets a where a.owner_id=target_user_id
      and not exists(select 1 from private.bunny_media_assets shared where shared.library_id=a.library_id and shared.asset_id=a.asset_id and shared.owner_id<>target_user_id)
  ), unsupported_assets as (
    select provider, provider_asset_id as id from public.shado_tv_videos where created_by = target_user_id
      and provider in ('mux','cloudflare_stream') and provider_asset_id is not null
  )
  select jsonb_build_object(
    'version', 1,
    'storage', coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket, 'paths', paths) order by bucket) from bucket_plans), '[]'::jsonb),
    'bunny_assets', coalesce((select jsonb_agg(jsonb_build_object('library_id',library_id,'asset_id',asset_id) order by library_id,asset_id) from bunny_assets), '[]'::jsonb),
    'unsupported_provider_assets', coalesce((select jsonb_agg(jsonb_build_object('provider', provider, 'id', id)) from unsupported_assets), '[]'::jsonb),
    'live_rooms', coalesce((select jsonb_agg(provider_room_name order by provider_room_name) from public.live_rooms where host_user_id = target_user_id), '[]'::jsonb),
    'live_memberships', coalesce((select jsonb_agg(distinct r.provider_room_name) from public.live_room_participants p join public.live_rooms r on r.id = p.room_id
      where p.user_id = target_user_id and r.host_user_id is distinct from target_user_id), '[]'::jsonb)
  ) into cleanup_manifest;
  insert into private.account_deletion_jobs(user_id, receipt_digest, manifest)
    values(target_user_id, request_receipt_digest, cleanup_manifest) returning * into job;
  return jsonb_build_object('user_id', job.user_id, 'state', job.state, 'manifest', job.manifest);
end;
$$;

create function public.get_account_deletion_job(request_receipt_digest text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('user_id', user_id, 'state', state, 'manifest', manifest)
    from private.account_deletion_jobs where receipt_digest = request_receipt_digest
      and (state <> 'completed' or receipt_expires_at > now());
$$;

create function public.checkpoint_account_deletion(target_user_id uuid, next_state text)
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
      where a->>'library_id'=r.library_id and a->>'asset_id'=r.asset_id::text))) then
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

create function public.refresh_account_deletion_storage(target_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare job private.account_deletion_jobs%rowtype; new_storage jsonb;
begin
  select * into strict job from private.account_deletion_jobs where user_id = target_user_id for update;
  if job.state <> 'providers_removed' then raise exception 'Storage refresh requires the provider checkpoint'; end if;
  with paths as (
    select bucket_plan->>'bucket' as bucket, object_path as path
      from jsonb_array_elements(job.manifest->'storage') bucket_plan
      cross join lateral jsonb_array_elements_text(bucket_plan->'paths') object_path
    union
    select o.bucket_id,o.name from storage.objects o where
      o.bucket_id = any(array['avatars','banners','message-media','chat-uploads','art-board','shadow-pin','shadow-pin-comments','shadow-pin-drafts','shado-tv','feedback-attachments','moderation-evidence'])
      and (split_part(o.name,'/',1) = target_user_id::text or o.owner = target_user_id or o.owner_id = target_user_id::text)
      and not exists(select 1 from public.moderation_report_attachments a where a.bucket = o.bucket_id and a.path = o.name)
  ), plans as (select bucket,jsonb_agg(path order by path) as paths from paths group by bucket)
  select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'paths',paths) order by bucket),'[]'::jsonb) into new_storage from plans;
  update private.account_deletion_jobs set manifest = jsonb_set(manifest,'{storage}',new_storage),updated_at=now()
    where user_id = target_user_id returning * into job;
  return jsonb_build_object('user_id',job.user_id,'state',job.state,'manifest',job.manifest);
end;
$$;

create function public.erase_account_data(target_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare job private.account_deletion_jobs%rowtype;
begin
  select * into strict job from private.account_deletion_jobs where user_id = target_user_id for update;
  if job.state in ('data_removed','completed') then return; end if;
  if job.state <> 'storage_removed' then raise exception 'Storage cleanup must finish before removing content'; end if;
  perform set_config('shadowchat.account_deletion_user', target_user_id::text, true);
  delete from private.bunny_upload_reservations where owner_id=target_user_id;

  delete from public.user_channel_bans b where b.target_user_id = erase_account_data.target_user_id
    and not exists(select 1 from public.moderation_action_channel_bans a where a.channel_ban_id = b.id);

  -- Remove authored content explicitly: their old owner FKs were SET NULL.
  delete from public.shadow_pin_images where creator_id = target_user_id;
  -- Preserve other authors' Pins in a shared category, replacing the departing
  -- owner's cover and text with one surviving Pin. Keep its hidden state.
  update public.shadow_pin_categories c set title = 'Shared Pins', description = null,
    image_url = replacement.image_url, image_path = replacement.image_path,
    thumbnail_url = replacement.thumbnail_url, thumbnail_path = replacement.thumbnail_path,
    medium_url = replacement.medium_url, medium_path = replacement.medium_path
  from (select distinct on (category_id) category_id, image_url, image_path, thumbnail_url, thumbnail_path, medium_url, medium_path
    from public.shadow_pin_images where category_id is not null and creator_id is distinct from target_user_id order by category_id, created_at desc, id) replacement
  where c.creator_id = target_user_id and c.id = replacement.category_id;
  delete from public.shadow_pin_categories c where c.creator_id = target_user_id
    and not exists(select 1 from public.shadow_pin_images i where i.category_id = c.id);
  delete from public.shado_tv_videos where created_by = target_user_id;
  -- A caption contributed to a different member's video stays unless its file
  -- was itself in this member's removed upload prefix; never leave a broken row.
  delete from public.shado_tv_captions where created_by = target_user_id
    and split_part(storage_path, '/', 1) = target_user_id::text;
  update public.shado_tv_channels set title = 'Community channel', slug = 'community-' || id::text,
    tagline = null, description = null, ticket_asset_url = null, hero_asset_url = null,
    ticket_asset_path = null, hero_asset_path = null where created_by = target_user_id;

  delete from public.live_room_events e where e.actor_user_id = erase_account_data.target_user_id or e.target_user_id = erase_account_data.target_user_id;
  delete from public.live_provider_webhook_receipts where participant_user_id = target_user_id or participant_identity = target_user_id::text;
  delete from public.live_provider_operations o where o.actor_user_id = erase_account_data.target_user_id or o.target_user_id = erase_account_data.target_user_id
    or exists(select 1 from public.live_rooms r where r.id = o.room_id and r.host_user_id = erase_account_data.target_user_id);
  update public.live_rooms set title = 'Ended room', description = '', status = 'ended', ended_at = coalesce(ended_at, now()),
    host_disconnected_at = null, host_grace_expires_at = null, ended_reason = 'Account deleted', revision = revision + 1, updated_at = now()
    where host_user_id = target_user_id;
  -- Existing CASCADE FKs remove messages, DMs, drafts, comments, connections,
  -- preferences, device tokens and per-member state when Auth deletes the user.
  -- Submitted reports/evidence remain in the restricted safety-case domain.
  update private.account_deletion_jobs set state = 'data_removed', updated_at = now() where user_id = target_user_id;
end;
$$;

create function public.finish_account_deletion(target_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare job private.account_deletion_jobs%rowtype;
begin
  select * into strict job from private.account_deletion_jobs where user_id = target_user_id for update;
  if job.state = 'completed' then return; end if;
  -- The Edge worker confirms Auth removal with the Auth Admin API. The service
  -- DB role intentionally has no SELECT grant on the platform-owned auth.users.
  if job.state <> 'data_removed' or exists(select 1 from public.users where id = target_user_id)
    then raise exception 'Account removal is not confirmed'; end if;
  update private.account_deletion_jobs set state = 'completed', manifest = '{}'::jsonb,
    completed_at = now(), receipt_expires_at = now() + interval '24 hours', updated_at = now() where user_id = target_user_id;
end;
$$;

create function public.prune_account_deletion_receipts()
returns bigint language plpgsql security invoker set search_path = '' as $$
declare removed bigint;
begin
  delete from private.account_deletion_jobs where state = 'completed' and receipt_expires_at <= now();
  get diagnostics removed = row_count; return removed;
end;
$$;

revoke all on function public.begin_account_deletion(uuid,text), public.get_account_deletion_job(text),
  public.checkpoint_account_deletion(uuid,text), public.erase_account_data(uuid), public.finish_account_deletion(uuid),
  public.prune_account_deletion_receipts() from public, anon, authenticated;
revoke all on function public.refresh_account_deletion_storage(uuid) from public, anon, authenticated;
grant execute on function public.begin_account_deletion(uuid,text), public.get_account_deletion_job(text),
  public.checkpoint_account_deletion(uuid,text), public.erase_account_data(uuid), public.finish_account_deletion(uuid),
  public.prune_account_deletion_receipts() to service_role;
grant execute on function public.refresh_account_deletion_storage(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
