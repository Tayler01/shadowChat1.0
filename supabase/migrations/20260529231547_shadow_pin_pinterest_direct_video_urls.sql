-- Existing Pinterest video pins from the first rollout used the provider
-- iframe. Store the direct Pinterest MP4/HLS URLs when known so the feed can
-- render them as native muted autoplay videos.

update public.shadow_pin_images
set
  video_preview_url = 'https://v1.pinimg.com/videos/iht/expMp4/bc/dd/ef/bcddef0ae32f8a32d2c1fb884c1873bb_240w.mp4',
  video_playback_url = 'https://v1.pinimg.com/videos/iht/expMp4/bc/dd/ef/bcddef0ae32f8a32d2c1fb884c1873bb_240w.mp4',
  video_hls_url = 'https://v1.pinimg.com/videos/iht/hls/bc/dd/ef/bcddef0ae32f8a32d2c1fb884c1873bb.m3u8',
  image_width = coalesce(image_width, 234),
  image_height = coalesce(image_height, 416),
  duration_seconds = coalesce(duration_seconds, 14),
  provider_payload = jsonb_set(
    coalesce(provider_payload, '{}'::jsonb),
    '{pinterest_direct_video}',
    jsonb_build_object(
      'fixedAt', now(),
      'source', 'Pinterest page videoList',
      'videoUrl', 'https://v1.pinimg.com/videos/iht/expMp4/bc/dd/ef/bcddef0ae32f8a32d2c1fb884c1873bb_240w.mp4',
      'hlsUrl', 'https://v1.pinimg.com/videos/iht/hls/bc/dd/ef/bcddef0ae32f8a32d2c1fb884c1873bb.m3u8'
    ),
    true
  ),
  updated_at = now()
where provider = 'pinterest'
  and provider_asset_id = '342906959154248010'
  and deleted_at is null;
