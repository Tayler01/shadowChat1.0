-- A published Creator draft retains its consumed asset for idempotent receipts.
-- That receipt must not prevent cleanup of the exact, now-deleted canonical Pin.
-- Unfinished or unrelated drafts still retain their provider objects.
begin;

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
        and not (target_source_type='shadow_pin_draft_asset' and d.id=target_source_id)
        and not (target_source_type='shadow_pin_image' and exists (
          select 1 from public.shadow_pin_creator_drafts published
          join public.shadow_pin_images removed on removed.id=published.published_image_id
          where published.id=d.draft_id and published.state='published'
            and published.active_asset_id=d.id and published.published_image_id=target_source_id
            and published.creator_id=current_asset.owner_id and d.creator_id=current_asset.owner_id
            and removed.creator_id=current_asset.owner_id and removed.deleted_at is not null
            and removed.provider='bunny_stream' and removed.provider_asset_id=target_asset_id::text
        )))
      and not exists(select 1 from public.shado_tv_videos v where v.deleted_at is null and (
        v.provider_asset_id=target_asset_id::text or v.provider_payload->'bunny_stream'->'episode'->>'videoId'=target_asset_id::text
        or v.provider_payload->'bunny_stream'->'trailer'->>'videoId'=target_asset_id::text)
        and not (target_source_type='shado_tv_asset' and v.id=target_source_id)));
$$;

revoke all on function public.can_delete_bunny_media_asset(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.can_delete_bunny_media_asset(text,uuid,uuid) to service_role;

-- No draft state is reset, no provider ownership is removed, and no claim is
-- cancelled here. Existing claim/finish guards still fence provider deletion.
commit;
