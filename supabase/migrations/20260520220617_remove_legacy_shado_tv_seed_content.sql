/*
  # Remove legacy Shado TV seed content

  Hard-deletes the original multi-channel v1 placeholder content so those old
  channels and shows no longer fill up Shado TV Studio. This targets only the
  known seeded slugs and leaves Crimp & Shrimp plus admin-created content alone.

  Also pins Episode 1 to the real premiere time: July 7, 2026 at 7:00 PM ET.
*/

WITH legacy_video_ids AS (
  SELECT videos.id
  FROM public.shado_tv_videos videos
  LEFT JOIN public.shado_tv_channels channels
    ON channels.id = videos.channel_id
  WHERE videos.slug IN (
    'silver-screen',
    'neon-run',
    'drive-in-rewind',
    'midnight-booth',
    'pixel-orbit'
  )
    OR channels.slug IN (
      'classic-cinema',
      'neon-nights',
      'retro-rewind',
      'late-shift',
      'pixel-planet'
    )
)
DELETE FROM public.shado_tv_videos videos
USING legacy_video_ids
WHERE videos.id = legacy_video_ids.id;

DELETE FROM public.shado_tv_channels channels
WHERE channels.slug IN (
  'classic-cinema',
  'neon-nights',
  'retro-rewind',
  'late-shift',
  'pixel-planet'
);

WITH series AS (
  SELECT id
  FROM public.shado_tv_channels
  WHERE slug = 'crimp-shrimp'
  LIMIT 1
)
UPDATE public.shado_tv_videos videos
SET
  release_label = 'Premieres Jul 7 at 7:00 PM',
  premiere_at = timestamptz '2026-07-07 19:00:00-04',
  released_at = timestamptz '2026-07-07 19:00:00-04'
FROM series
WHERE videos.channel_id = series.id
  AND videos.slug = 'the-chicken-snatchers';
