-- READ ONLY: review every historical row against the provider library before
-- service-only registration. URLs/payload GUIDs are candidates, not ownership proof.
begin transaction read only;
with candidates as (
  select 'shadow_pin_image'::text source_type,p.id source_id,p.creator_id owner_id,
    p.provider_asset_id asset_id,p.provider_payload->'bunny_stream'->>'libraryId' recorded_library_id,
    p.video_embed_url embed_url,p.deleted_at,p.processing_status status
  from public.shadow_pin_images p where p.provider='bunny_stream' and p.provider_asset_id is not null
  union all
  select 'shadow_pin_draft_asset',d.id,d.creator_id,d.provider_asset_id,
    d.provider_payload->'bunny_stream'->>'libraryId',d.video_embed_url,d.deleted_at,d.state
  from public.shadow_pin_draft_assets d where d.provider='bunny_stream' and d.provider_asset_id is not null
  union all
  select distinct 'shado_tv_asset',v.id,v.created_by,asset.asset_id,
    coalesce(asset.library_id,v.provider_payload->'bunny_stream'->>'libraryId'),asset.embed_url,v.deleted_at,v.upload_status
  from public.shado_tv_videos v cross join lateral (values
    (v.provider_asset_id,v.provider_payload->'bunny_stream'->'episode'->>'libraryId',v.embed_url),
    (v.provider_payload->'bunny_stream'->'episode'->>'videoId',v.provider_payload->'bunny_stream'->'episode'->>'libraryId',v.embed_url),
    (v.provider_payload->'bunny_stream'->'trailer'->>'videoId',v.provider_payload->'bunny_stream'->'trailer'->>'libraryId',v.trailer_asset_url)
  ) asset(asset_id,library_id,embed_url)
  where v.provider='bunny_stream' and asset.asset_id is not null
)
select source_type,source_id,owner_id,asset_id,recorded_library_id,embed_url,deleted_at,status,
  'Review provider metadata/content and source ownership; never auto-register from this inventory'::text review_required
from candidates order by source_type,source_id,asset_id;
rollback;
