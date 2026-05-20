/*
  # Crimp & Shrimp Shado TV launch seed

  Replaces the old multi-channel Shado TV seed surface with the single
  Crimp & Shrimp series hub. Existing v1 placeholder channels/videos are
  hidden rather than hard-deleted so operators can still inspect them.
*/

WITH admin_owner AS (
  SELECT (
    SELECT roles.user_id
    FROM public.user_roles roles
    WHERE roles.role = 'admin'
    ORDER BY roles.created_at ASC
    LIMIT 1
  ) AS user_id
)
UPDATE public.shado_tv_channels
SET
  visibility_status = 'hidden',
  updated_by = admin_owner.user_id
FROM admin_owner
WHERE slug <> 'crimp-shrimp'
  AND deleted_at IS NULL;

WITH admin_owner AS (
  SELECT (
    SELECT roles.user_id
    FROM public.user_roles roles
    WHERE roles.role = 'admin'
    ORDER BY roles.created_at ASC
    LIMIT 1
  ) AS user_id
)
UPDATE public.shado_tv_videos
SET
  visibility_status = 'hidden',
  updated_by = admin_owner.user_id
FROM admin_owner
WHERE slug <> 'the-chicken-snatchers'
  AND deleted_at IS NULL;

WITH admin_owner AS (
  SELECT (
    SELECT roles.user_id
    FROM public.user_roles roles
    WHERE roles.role = 'admin'
    ORDER BY roles.created_at ASC
    LIMIT 1
  ) AS user_id
)
INSERT INTO public.shado_tv_channels (
  slug,
  title,
  tagline,
  description,
  ticket_asset_url,
  hero_asset_url,
  accent_color,
  visibility_status,
  sort_order,
  created_by,
  updated_by,
  deleted_at,
  deleted_by
)
SELECT
  'crimp-shrimp',
  'The Crimp & Shrimp Show',
  'Small thieves. Big trouble. Family comedy from the woods.',
  'A rustic family comedy series from Polder Films about two tiny thieves who keep turning simple plans into bigger trouble.',
  '/entertainment/shado-tv/crimp-shrimp/episode-1-cover.webp',
  '/entertainment/shado-tv/crimp-shrimp/series-hub-hero.webp',
  '#a64022',
  'published',
  1,
  admin_owner.user_id,
  admin_owner.user_id,
  NULL,
  NULL
FROM admin_owner
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  tagline = EXCLUDED.tagline,
  description = EXCLUDED.description,
  ticket_asset_url = EXCLUDED.ticket_asset_url,
  hero_asset_url = EXCLUDED.hero_asset_url,
  accent_color = EXCLUDED.accent_color,
  visibility_status = EXCLUDED.visibility_status,
  sort_order = EXCLUDED.sort_order,
  updated_by = EXCLUDED.updated_by,
  deleted_at = NULL,
  deleted_by = NULL;

WITH admin_owner AS (
  SELECT (
    SELECT roles.user_id
    FROM public.user_roles roles
    WHERE roles.role = 'admin'
    ORDER BY roles.created_at ASC
    LIMIT 1
  ) AS user_id
),
series AS (
  SELECT id
  FROM public.shado_tv_channels
  WHERE slug = 'crimp-shrimp'
  LIMIT 1
)
INSERT INTO public.shado_tv_videos (
  channel_id,
  slug,
  title,
  subtitle,
  description,
  source_type,
  visibility_status,
  release_status,
  orientation,
  duration_seconds,
  release_label,
  poster_asset_url,
  thumbnail_asset_url,
  provider,
  upload_status,
  trailer_release_at,
  premiere_at,
  released_at,
  created_by,
  updated_by,
  deleted_at,
  deleted_by
)
SELECT
  series.id,
  'the-chicken-snatchers',
  'The Chicken Snatchers',
  'Episode 1',
  'The first Crimp & Shrimp caper sends the two small-time troublemakers into the woods with a bad plan, a nervous chicken, and more trouble than they bargained for.',
  'native_upload',
  'published',
  'premiere',
  'horizontal',
  1800,
  'Premiere coming soon',
  '/entertainment/shado-tv/crimp-shrimp/episode-1-cover.webp',
  '/entertainment/shado-tv/crimp-shrimp/featured-episode-frame.webp',
  'placeholder',
  'none',
  now() + interval '3 days',
  now() + interval '7 days',
  now() + interval '8 days',
  admin_owner.user_id,
  admin_owner.user_id,
  NULL,
  NULL
FROM series
CROSS JOIN admin_owner
ON CONFLICT (channel_id, slug) DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description,
  source_type = EXCLUDED.source_type,
  visibility_status = EXCLUDED.visibility_status,
  release_status = EXCLUDED.release_status,
  orientation = EXCLUDED.orientation,
  duration_seconds = EXCLUDED.duration_seconds,
  release_label = EXCLUDED.release_label,
  poster_asset_url = EXCLUDED.poster_asset_url,
  thumbnail_asset_url = EXCLUDED.thumbnail_asset_url,
  provider = COALESCE(public.shado_tv_videos.provider, EXCLUDED.provider),
  upload_status = COALESCE(NULLIF(public.shado_tv_videos.upload_status, 'none'), EXCLUDED.upload_status),
  trailer_release_at = COALESCE(public.shado_tv_videos.trailer_release_at, EXCLUDED.trailer_release_at),
  premiere_at = COALESCE(public.shado_tv_videos.premiere_at, EXCLUDED.premiere_at),
  released_at = COALESCE(public.shado_tv_videos.released_at, EXCLUDED.released_at),
  updated_by = EXCLUDED.updated_by,
  deleted_at = NULL,
  deleted_by = NULL;

UPDATE public.shado_tv_home_features
SET deleted_at = now()
WHERE deleted_at IS NULL;

WITH admin_owner AS (
  SELECT (
    SELECT roles.user_id
    FROM public.user_roles roles
    WHERE roles.role = 'admin'
    ORDER BY roles.created_at ASC
    LIMIT 1
  ) AS user_id
),
episode AS (
  SELECT videos.id
  FROM public.shado_tv_videos videos
  JOIN public.shado_tv_channels channels
    ON channels.id = videos.channel_id
  WHERE channels.slug = 'crimp-shrimp'
    AND videos.slug = 'the-chicken-snatchers'
  LIMIT 1
),
features AS (
  SELECT *
  FROM (VALUES
    ('prime'::text, 0),
    ('featured'::text, 10)
  ) AS values(feature_type, sort_order)
)
INSERT INTO public.shado_tv_home_features (
  video_id,
  feature_type,
  sort_order,
  created_by,
  deleted_at
)
SELECT
  episode.id,
  features.feature_type,
  features.sort_order,
  admin_owner.user_id,
  NULL
FROM episode
CROSS JOIN features
CROSS JOIN admin_owner
ON CONFLICT (feature_type, video_id) WHERE deleted_at IS NULL DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  deleted_at = NULL;

UPDATE public.shado_tv_channels channels
SET latest_visible_video_at = (
  SELECT max(videos.updated_at)
  FROM public.shado_tv_videos videos
  WHERE videos.channel_id = channels.id
    AND videos.deleted_at IS NULL
    AND videos.visibility_status = 'published'
);
