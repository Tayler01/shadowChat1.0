-- Normalize ShadowPin video embed URLs created during the first short-video
-- rollout so existing pins use providers' actual iframe player URLs.

update public.shadow_pin_images
set
  video_embed_url = regexp_replace(
    video_embed_url,
    '^https://iframe\.mediadelivery\.net/',
    'https://player.mediadelivery.net/'
  ),
  provider_payload = jsonb_set(
    coalesce(provider_payload, '{}'::jsonb),
    '{embed_playback_fix}',
    jsonb_build_object(
      'fixedAt', now(),
      'reason', 'normalize Bunny Stream player host'
    ),
    true
  ),
  updated_at = now()
where provider = 'bunny_stream'
  and video_embed_url like 'https://iframe.mediadelivery.net/%';

with pinterest_candidates as (
  select
    id,
    coalesce(
      substring(coalesce(video_embed_url, source_url, provider_asset_id, '') from 'id=([0-9]{6,})'),
      substring(coalesce(video_embed_url, source_url, provider_asset_id, '') from '--([0-9]{6,})'),
      substring(coalesce(video_embed_url, source_url, provider_asset_id, '') from '/pin/([0-9]{6,})')
    ) as pin_id
  from public.shadow_pin_images
  where provider = 'pinterest'
)
update public.shadow_pin_images images
set
  video_embed_url = 'https://assets.pinterest.com/ext/embed.html?id=' || candidates.pin_id || '&src=shado-pin',
  provider_asset_id = candidates.pin_id,
  provider_playback_id = candidates.pin_id,
  provider_payload = jsonb_set(
    coalesce(images.provider_payload, '{}'::jsonb),
    '{embed_playback_fix}',
    jsonb_build_object(
      'fixedAt', now(),
      'reason', 'replace Pinterest page URL with oEmbed iframe URL',
      'pinId', candidates.pin_id
    ),
    true
  ),
  updated_at = now()
from pinterest_candidates candidates
where images.id = candidates.id
  and candidates.pin_id is not null
  and candidates.pin_id <> ''
  and coalesce(images.video_embed_url, '') not like 'https://assets.pinterest.com/ext/embed.html%';
