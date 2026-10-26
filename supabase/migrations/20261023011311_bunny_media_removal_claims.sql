-- A provider DELETE is outside the database transaction. Keep its claim durable
-- so late report capture and new references cannot race that external request.
begin;

create table private.bunny_media_removals (
  id uuid primary key default gen_random_uuid(),
  library_id text not null check (library_id ~ '^[0-9]+$'),
  asset_id uuid not null,
  -- Deliberately no owner FK: an unknown provider outcome must survive account
  -- cleanup. These minimal tombstones never contain member names or media URLs.
  owner_id uuid,
  source_type text not null check (source_type in ('shadow_pin_image','shadow_pin_draft_asset','shado_tv_asset')),
  source_id uuid not null,
  state text not null default 'pending' check (state in ('pending','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (library_id,asset_id)
);
create index bunny_media_removals_owner_idx on private.bunny_media_removals(owner_id);
alter table private.bunny_media_removals enable row level security;
revoke all on private.bunny_media_removals from public,anon,authenticated;
grant select,insert,update on private.bunny_media_removals to service_role;

create function public.claim_bunny_media_removal(
  target_library_id text,target_asset_id uuid,target_owner_id uuid,
  target_source_type text,target_source_id uuid
) returns uuid language plpgsql security invoker set search_path='' as $$
declare claim private.bunny_media_removals%rowtype;
begin
  -- All registration, report capture and deletion paths take locks in this order.
  perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||target_owner_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('bunny-media:'||target_library_id||':'||target_asset_id::text,0));
  if not public.is_active_member_for_service(target_owner_id) then
    raise exception using errcode='42501',message='Asset owner no longer has active access';
  end if;
  if not exists(select 1 from private.bunny_media_assets a where a.library_id=target_library_id
    and a.asset_id=target_asset_id and a.owner_id=target_owner_id
    and a.source_type=target_source_type and a.source_id=target_source_id) then
    raise exception using errcode='42501',message='Video removal requires exact trusted provider ownership';
  end if;
  select * into claim from private.bunny_media_removals
    where library_id=target_library_id and asset_id=target_asset_id for update;
  if claim.id is not null then
    if claim.owner_id is distinct from target_owner_id or claim.source_type<>target_source_type or claim.source_id<>target_source_id then
      raise exception using errcode='42501',message='Video removal is already claimed by another source';
    end if;
    -- Retrying a lost provider response or an interrupted database update is safe.
    return claim.id;
  end if;
  if not public.can_delete_bunny_media_asset(target_source_type,target_source_id,target_asset_id)
    or exists(select 1 from private.moderation_media_assets held where held.provider='bunny' and held.status='ready'
      and held.library_id=target_library_id and held.asset_id=target_asset_id)
    or exists(select 1 from private.bunny_media_assets shared where shared.library_id=target_library_id
      and shared.asset_id=target_asset_id and shared.owner_id<>target_owner_id) then
    raise exception using errcode='42501',message='Another retained item still uses this video';
  end if;
  insert into private.bunny_media_removals(library_id,asset_id,owner_id,source_type,source_id)
    values(target_library_id,target_asset_id,target_owner_id,target_source_type,target_source_id)
    returning * into claim;
  return claim.id;
end;
$$;
revoke all on function public.claim_bunny_media_removal(text,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_bunny_media_removal(text,uuid,uuid,text,uuid) to service_role;

create function public.finish_bunny_media_removal(target_removal_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  -- Service callers may confirm only after provider 2xx/404. A timeout/error
  -- deliberately leaves pending intent; it never reopens signing or capture.
  update private.bunny_media_removals set state='removed',updated_at=now() where id=target_removal_id;
  if not found then raise exception 'Video removal claim is unavailable'; end if;
end;
$$;
revoke all on function public.finish_bunny_media_removal(uuid) from public,anon,authenticated;
grant execute on function public.finish_bunny_media_removal(uuid) to service_role;

create function public.anonymize_completed_bunny_removals(target_owner_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||target_owner_id::text,0));
  if not exists(select 1 from private.account_deletion_jobs where user_id=target_owner_id and state in ('data_removed','completed')) then
    raise exception 'Completed account data removal is required before provider tombstone anonymization';
  end if;
  if exists(select 1 from private.bunny_media_removals where owner_id=target_owner_id and state='pending') then
    raise exception 'Pending provider removals must be reconciled before anonymization';
  end if;
  update private.bunny_media_removals set owner_id=null,updated_at=now() where owner_id=target_owner_id and state='removed';
end;
$$;
revoke all on function public.anonymize_completed_bunny_removals(uuid) from public,anon,authenticated;
grant execute on function public.anonymize_completed_bunny_removals(uuid) to service_role;

create function private.guard_bunny_media_registration()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||new.owner_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('bunny-media:'||new.library_id||':'||new.asset_id::text,0));
  if exists(select 1 from private.bunny_media_removals r where r.library_id=new.library_id and r.asset_id=new.asset_id) then
    raise exception using errcode='42501',message='Video removal has already started';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_bunny_media_registration() from public,anon,authenticated;
-- Also covers Creator Studio's atomic authenticated publish, which registers a
-- new canonical Pin inside its existing SECURITY DEFINER provenance trigger.
create trigger guard_bunny_media_registration before insert or update on private.bunny_media_assets
for each row execute function private.guard_bunny_media_registration();

create or replace function public.get_trusted_bunny_media_asset(
  target_source_type text,target_source_id uuid,target_asset_id uuid
) returns table(library_id text,asset_id uuid,owner_id uuid)
language sql stable security invoker set search_path='' as $$
  select a.library_id,a.asset_id,a.owner_id from private.bunny_media_assets a
  where a.source_type=target_source_type and a.source_id=target_source_id and a.asset_id=target_asset_id
    and not exists(select 1 from private.bunny_media_removals r where r.library_id=a.library_id and r.asset_id=a.asset_id);
$$;

create function private.guard_reported_bunny_removal()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.provider='bunny' then
    if new.source_owner_id is not null then
      perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||new.source_owner_id::text,0));
    end if;
    perform pg_advisory_xact_lock(hashtextextended('bunny-media:'||new.library_id||':'||new.asset_id::text,0));
    if exists(select 1 from private.bunny_media_removals r where r.library_id=new.library_id and r.asset_id=new.asset_id) then
      new.status:='unavailable';
      new.error_code:='source_removal_in_progress';
      new.captured_at:=null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_reported_bunny_removal() from public,anon,authenticated;
create trigger guard_reported_bunny_removal before insert or update on private.moderation_media_assets
for each row execute function private.guard_reported_bunny_removal();

create or replace function private.moderation_purge_bunny_assets(target_case_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('library_id',candidate.library_id,'asset_id',candidate.asset_id)
    order by candidate.library_id,candidate.asset_id),'[]'::jsonb) from (
    select distinct m.library_id,m.asset_id from private.moderation_media_assets m
    where m.case_id=target_case_id and m.provider='bunny' and m.status='ready'
      and not exists(select 1 from private.moderation_media_assets other_case where other_case.case_id<>target_case_id
        and other_case.provider='bunny' and other_case.status='ready' and other_case.library_id=m.library_id and other_case.asset_id=m.asset_id)
      and not exists(select 1 from private.bunny_media_assets ordinary where ordinary.library_id=m.library_id and ordinary.asset_id=m.asset_id)
      and not exists(select 1 from private.bunny_upload_reservations pending where pending.library_id=m.library_id and pending.asset_id=m.asset_id)
      and not exists(select 1 from private.bunny_media_removals removal where removal.library_id=m.library_id and removal.asset_id=m.asset_id)
  ) candidate;
$$;

comment on table private.bunny_media_removals is
  'Service-only durable provider-delete claims. Pending and removed assets cannot acquire new playback authority or reported-media holds. Unknown outcomes require exact provider reconciliation; never expire claims automatically.';
commit;
