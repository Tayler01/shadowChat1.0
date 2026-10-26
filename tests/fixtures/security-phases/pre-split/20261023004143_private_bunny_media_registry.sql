-- Trusted provenance for provider objects. A writable Pin URL/GUID is not authority
-- to sign or delete a Bunny video. No historical assets are silently trusted here.
begin;
create table private.bunny_media_assets (
  library_id text not null check (library_id ~ '^[0-9]+$'),
  asset_id uuid not null,
  owner_id uuid not null references public.users(id) on delete cascade,
  source_type text not null check (source_type in ('shadow_pin_image','shadow_pin_draft_asset','shado_tv_asset')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (source_type,source_id,library_id,asset_id)
);
create index bunny_media_assets_owner_idx on private.bunny_media_assets(owner_id);
create index bunny_media_assets_provider_idx on private.bunny_media_assets(library_id,asset_id);
alter table private.bunny_media_assets enable row level security;
revoke all on private.bunny_media_assets from public,anon,authenticated;
grant select,insert,delete on private.bunny_media_assets to service_role;

create function public.register_bunny_media_asset(
  target_library_id text,target_asset_id uuid,target_owner_id uuid,
  target_source_type text,target_source_id uuid
) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('account-deletion:' || target_owner_id::text,0));
  if not public.is_active_member_for_service(target_owner_id) then
    raise exception using errcode='42501',message='Asset owner no longer has active access';
  end if;
  insert into private.bunny_media_assets(library_id,asset_id,owner_id,source_type,source_id)
    values(target_library_id,target_asset_id,target_owner_id,target_source_type,target_source_id)
    on conflict(source_type,source_id,library_id,asset_id) do nothing;
  if not exists (select 1 from private.bunny_media_assets a
    where a.library_id=target_library_id and a.asset_id=target_asset_id
      and a.source_type=target_source_type and a.source_id=target_source_id and a.owner_id=target_owner_id) then
    raise exception using errcode='42501',message='Asset ownership cannot be reassigned';
  end if;
end;
$$;
revoke all on function public.register_bunny_media_asset(text,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.register_bunny_media_asset(text,uuid,uuid,text,uuid) to service_role;

create function public.get_trusted_bunny_media_asset(
  target_source_type text,target_source_id uuid,target_asset_id uuid
) returns table(library_id text,asset_id uuid,owner_id uuid)
language sql stable security invoker set search_path='' as $$
  select a.library_id,a.asset_id,a.owner_id from private.bunny_media_assets a
  where a.source_type=target_source_type and a.source_id=target_source_id and a.asset_id=target_asset_id;
$$;
revoke all on function public.get_trusted_bunny_media_asset(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_trusted_bunny_media_asset(text,uuid,uuid) to service_role;

create function public.can_delete_bunny_media_asset(target_source_type text,target_source_id uuid,target_asset_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from private.bunny_media_assets current_asset
    where current_asset.source_type=target_source_type and current_asset.source_id=target_source_id and current_asset.asset_id=target_asset_id
      and not exists(select 1 from private.bunny_media_assets shared where shared.library_id=current_asset.library_id
        and shared.asset_id=current_asset.asset_id and shared.owner_id<>current_asset.owner_id)
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
revoke all on function public.can_delete_bunny_media_asset(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.can_delete_bunny_media_asset(text,uuid,uuid) to service_role;

create function private.guard_bunny_pin_identity() returns trigger
language plpgsql security definer set search_path='' as $$
declare trusted record;
begin
  if auth.role()='authenticated' then
    if (tg_op='INSERT' and new.provider='bunny_stream') or
      (tg_op='UPDATE' and (new.provider='bunny_stream' or old.provider='bunny_stream') and
      (new.provider,new.provider_asset_id,new.provider_playback_id,new.provider_payload,new.creator_id,
       new.media_type,new.image_url,new.image_path,new.thumbnail_url,new.thumbnail_path,new.medium_url,new.medium_path,
       new.video_preview_url,new.video_playback_url,new.video_hls_url,new.video_embed_url)
      is distinct from
      (old.provider,old.provider_asset_id,old.provider_playback_id,old.provider_payload,old.creator_id,
       old.media_type,old.image_url,old.image_path,old.thumbnail_url,old.thumbnail_path,old.medium_url,old.medium_path,
       old.video_preview_url,old.video_playback_url,old.video_hls_url,old.video_embed_url)) then
      -- Creator Studio publishes through an authenticated SECURITY DEFINER RPC.
      -- Only an already service-registered video belonging to this caller may
      -- acquire a new canonical Pin reference; arbitrary GUIDs never qualify.
      if new.provider <> 'bunny_stream' or new.creator_id is distinct from auth.uid()
        or coalesce(new.provider_asset_id,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception using errcode='42501',message='Native video identities require trusted media provenance';
      end if;
      select a.* into trusted from private.bunny_media_assets a
        where a.asset_id=new.provider_asset_id::uuid and a.owner_id=new.creator_id limit 1;
      if trusted.asset_id is null then
        raise exception using errcode='42501',message='Native video identities require trusted media provenance';
      end if;
      insert into private.bunny_media_assets(library_id,asset_id,owner_id,source_type,source_id)
        values(trusted.library_id,trusted.asset_id,new.creator_id,'shadow_pin_image',new.id)
        on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_bunny_pin_identity() from public,anon,authenticated;
create trigger guard_bunny_pin_identity before insert or update on public.shadow_pin_images
for each row execute function private.guard_bunny_pin_identity();
comment on table private.bunny_media_assets is
  'Service-created provider provenance. Reviewed historical registration is required; caller-controlled URLs/GUIDs never authorize signing or deletion.';
commit;
