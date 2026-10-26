-- Reserve ownership BEFORE external provider creation. An uncertain provider
-- response stays pending for reconciliation and can never yield false account
-- deletion success. No provider calls or remote content changes occur here.
begin;
create table private.bunny_upload_reservations (
  id uuid primary key,
  owner_id uuid not null,
  library_id text not null check(library_id ~ '^[0-9]+$'),
  source_type text not null check(source_type in ('shadow_pin_image','shadow_pin_draft_asset','shado_tv_asset')),
  source_id uuid not null,
  state text not null default 'pending' check(state in ('pending','created')),
  asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((state='created')=(asset_id is not null))
);
create index bunny_upload_reservations_owner_idx on private.bunny_upload_reservations(owner_id);
alter table private.bunny_upload_reservations enable row level security;
revoke all on private.bunny_upload_reservations from public,anon,authenticated;
grant select,insert,update,delete on private.bunny_upload_reservations to service_role;

create function public.reserve_bunny_upload(target_reservation_id uuid,target_owner_id uuid,target_library_id text,target_source_type text,target_source_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||target_owner_id::text,0));
  if not public.is_active_member_for_service(target_owner_id) then raise exception using errcode='42501',message='Media owner no longer has active access'; end if;
  insert into private.bunny_upload_reservations(id,owner_id,library_id,source_type,source_id)
    values(target_reservation_id,target_owner_id,target_library_id,target_source_type,target_source_id)
    on conflict(id) do nothing;
  if not exists(select 1 from private.bunny_upload_reservations where id=target_reservation_id and owner_id=target_owner_id
    and library_id=target_library_id and source_type=target_source_type and source_id=target_source_id) then
    raise exception 'Provider reservation identity cannot be reassigned';
  end if;
end;
$$;

create function public.resolve_bunny_upload(target_reservation_id uuid,target_asset_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare reservation private.bunny_upload_reservations%rowtype;
begin
  select * into strict reservation from private.bunny_upload_reservations where id=target_reservation_id;
  perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||reservation.owner_id::text,0));
  if target_asset_id is null then raise exception 'A returned provider asset ID is required'; end if;
  update private.bunny_upload_reservations set asset_id=target_asset_id,state='created',updated_at=now()
    where id=target_reservation_id and (asset_id is null or asset_id=target_asset_id);
  if not found then raise exception 'Provider reservation asset cannot be reassigned'; end if;
end;
$$;

create function public.finish_bunny_upload(target_reservation_id uuid,cleanup_confirmed boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare reservation private.bunny_upload_reservations%rowtype;
begin
  select * into reservation from private.bunny_upload_reservations where id=target_reservation_id for update;
  if not found then return; end if;
  if not cleanup_confirmed and not exists(select 1 from private.bunny_media_assets a where a.owner_id=reservation.owner_id
    and a.library_id=reservation.library_id and a.asset_id=reservation.asset_id
    and a.source_type=reservation.source_type and a.source_id=reservation.source_id) then
    raise exception 'Provider ownership must be registered before completing an upload reservation';
  end if;
  delete from private.bunny_upload_reservations where id=target_reservation_id;
end;
$$;

create function public.refresh_account_deletion_providers(target_user_id uuid)
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
      and shared.asset_id=c.asset_id and shared.owner_id<>target_user_id);
  update private.account_deletion_jobs set manifest=jsonb_set(manifest,'{bunny_assets}',assets),updated_at=now()
    where user_id=target_user_id returning * into job;
  return jsonb_build_object('user_id',job.user_id,'state',job.state,'manifest',job.manifest);
end;
$$;
revoke all on function public.reserve_bunny_upload(uuid,uuid,text,text,uuid),public.resolve_bunny_upload(uuid,uuid),
  public.finish_bunny_upload(uuid,boolean),public.refresh_account_deletion_providers(uuid) from public,anon,authenticated;
grant execute on function public.reserve_bunny_upload(uuid,uuid,text,text,uuid),public.resolve_bunny_upload(uuid,uuid),
  public.finish_bunny_upload(uuid,boolean),public.refresh_account_deletion_providers(uuid) to service_role;
comment on table private.bunny_upload_reservations is
  'Durable external-create intents. Pending response-loss cases require provider reconciliation using the opaque reservation marker in the video title; never expire unknown assets automatically.';
notify pgrst,'reload schema';
commit;
