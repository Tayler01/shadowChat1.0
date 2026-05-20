/*
  # Unlock Crimp & Shrimp Episode 1 trailer

  Keeps the Episode 1 trailer available during launch testing. The admin can
  replace the URL later, but the trailer page should not show a countdown while
  the current preview stream is being tested.
*/

WITH series AS (
  SELECT id
  FROM public.shado_tv_channels
  WHERE slug = 'crimp-shrimp'
  LIMIT 1
)
UPDATE public.shado_tv_videos videos
SET
  trailer_asset_url = COALESCE(NULLIF(videos.trailer_asset_url, ''), '/entertainment/shado-tv/crimp-shrimp/test-trailer.mp4'),
  trailer_release_at = timestamptz '2026-05-20 00:00:00-04'
FROM series
WHERE videos.channel_id = series.id
  AND videos.slug = 'the-chicken-snatchers';
