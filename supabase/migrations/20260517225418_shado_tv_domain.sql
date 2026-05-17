/*
  # Shado TV domain

  Adds the authenticated, admin-managed Shado TV content model:
  - channels with draft/hidden/published visibility
  - videos with native/external/placeholder source metadata
  - home prime/featured controls
  - released-video watch progress
  - processing job tracking for the later native upload pipeline
  - approved seed rows using the static Cinema Marquee asset suite

  Provider-specific video setup is intentionally excluded from this migration.
*/

CREATE TABLE IF NOT EXISTS public.shado_tv_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 80),
  tagline text CHECK (tagline IS NULL OR char_length(tagline) <= 180),
  description text CHECK (description IS NULL OR char_length(description) <= 800),
  ticket_asset_url text CHECK (ticket_asset_url IS NULL OR char_length(trim(ticket_asset_url)) > 0),
  hero_asset_url text CHECK (hero_asset_url IS NULL OR char_length(trim(hero_asset_url)) > 0),
  accent_color text CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  visibility_status text NOT NULL DEFAULT 'draft' CHECK (visibility_status IN ('draft', 'published', 'hidden')),
  sort_order integer NOT NULL DEFAULT 0,
  latest_visible_video_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shado_tv_channels_visible_sort_idx
  ON public.shado_tv_channels (latest_visible_video_at DESC NULLS LAST, updated_at DESC, created_at DESC)
  WHERE deleted_at IS NULL AND visibility_status = 'published';

CREATE INDEX IF NOT EXISTS shado_tv_channels_operator_idx
  ON public.shado_tv_channels (visibility_status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shado_tv_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.shado_tv_channels(id) ON DELETE SET NULL,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  subtitle text CHECK (subtitle IS NULL OR char_length(subtitle) <= 120),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  source_type text NOT NULL DEFAULT 'placeholder' CHECK (source_type IN ('native_upload', 'external_embed', 'placeholder')),
  visibility_status text NOT NULL DEFAULT 'draft' CHECK (visibility_status IN ('draft', 'published', 'hidden')),
  release_status text NOT NULL DEFAULT 'locked' CHECK (release_status IN ('released', 'premiere', 'locked', 'processing')),
  orientation text NOT NULL DEFAULT 'horizontal' CHECK (orientation IN ('horizontal', 'vertical', 'unknown')),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  release_label text CHECK (release_label IS NULL OR char_length(release_label) <= 120),
  poster_asset_url text CHECK (poster_asset_url IS NULL OR char_length(trim(poster_asset_url)) > 0),
  thumbnail_asset_url text CHECK (thumbnail_asset_url IS NULL OR char_length(trim(thumbnail_asset_url)) > 0),
  trailer_asset_url text CHECK (trailer_asset_url IS NULL OR char_length(trim(trailer_asset_url)) > 0),
  external_url text CHECK (external_url IS NULL OR char_length(trim(external_url)) > 0),
  embed_url text CHECK (embed_url IS NULL OR char_length(trim(embed_url)) > 0),
  provider text CHECK (provider IS NULL OR provider IN ('mux', 'cloudflare_stream', 'bunny_stream', 'self_managed', 'external', 'placeholder')),
  provider_asset_id text,
  provider_playback_id text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  upload_status text NOT NULL DEFAULT 'none' CHECK (upload_status IN ('none', 'uploaded', 'queued', 'processing', 'ready', 'failed')),
  upload_error text,
  trailer_release_at timestamptz,
  premiere_at timestamptz,
  released_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shado_tv_videos_channel_slug_unique UNIQUE (channel_id, slug)
);

CREATE INDEX IF NOT EXISTS shado_tv_videos_channel_visible_idx
  ON public.shado_tv_videos (channel_id, updated_at DESC)
  WHERE deleted_at IS NULL AND visibility_status = 'published';

CREATE INDEX IF NOT EXISTS shado_tv_videos_release_idx
  ON public.shado_tv_videos (release_status, released_at DESC NULLS LAST, updated_at DESC)
  WHERE deleted_at IS NULL AND visibility_status = 'published';

CREATE INDEX IF NOT EXISTS shado_tv_videos_processing_idx
  ON public.shado_tv_videos (upload_status, updated_at DESC)
  WHERE deleted_at IS NULL AND upload_status IN ('uploaded', 'queued', 'processing', 'failed');

CREATE TABLE IF NOT EXISTS public.shado_tv_home_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.shado_tv_videos(id) ON DELETE CASCADE,
  feature_type text NOT NULL CHECK (feature_type IN ('prime', 'featured')),
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shado_tv_home_features_single_prime_idx
  ON public.shado_tv_home_features (feature_type)
  WHERE feature_type = 'prime' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shado_tv_home_features_unique_visible_video_idx
  ON public.shado_tv_home_features (feature_type, video_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS shado_tv_home_features_sort_idx
  ON public.shado_tv_home_features (feature_type, sort_order, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shado_tv_watch_progress (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.shado_tv_videos(id) ON DELETE CASCADE,
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS shado_tv_watch_progress_user_recent_idx
  ON public.shado_tv_watch_progress (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.shado_tv_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES public.shado_tv_videos(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('native_upload', 'thumbnail', 'poster', 'cleanup', 'provider_sync')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shado_tv_processing_jobs_status_idx
  ON public.shado_tv_processing_jobs (status, updated_at DESC);

ALTER TABLE public.shado_tv_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shado_tv_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shado_tv_home_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shado_tv_watch_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shado_tv_processing_jobs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_shado_tv_channels_updated_at ON public.shado_tv_channels;
CREATE TRIGGER update_shado_tv_channels_updated_at
  BEFORE UPDATE ON public.shado_tv_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_shado_tv_videos_updated_at ON public.shado_tv_videos;
CREATE TRIGGER update_shado_tv_videos_updated_at
  BEFORE UPDATE ON public.shado_tv_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_shado_tv_home_features_updated_at ON public.shado_tv_home_features;
CREATE TRIGGER update_shado_tv_home_features_updated_at
  BEFORE UPDATE ON public.shado_tv_home_features
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_shado_tv_watch_progress_updated_at ON public.shado_tv_watch_progress;
CREATE TRIGGER update_shado_tv_watch_progress_updated_at
  BEFORE UPDATE ON public.shado_tv_watch_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_shado_tv_processing_jobs_updated_at ON public.shado_tv_processing_jobs;
CREATE TRIGGER update_shado_tv_processing_jobs_updated_at
  BEFORE UPDATE ON public.shado_tv_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.refresh_shado_tv_channel_latest_video(target_channel_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shado_tv_channels channels
  SET latest_visible_video_at = (
    SELECT max(videos.updated_at)
    FROM public.shado_tv_videos videos
    WHERE videos.channel_id = target_channel_id
      AND videos.deleted_at IS NULL
      AND videos.visibility_status = 'published'
  )
  WHERE channels.id = target_channel_id;
$$;

REVOKE ALL ON FUNCTION public.refresh_shado_tv_channel_latest_video(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_shado_tv_channel_latest_video()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.channel_id IS NOT NULL THEN
    PERFORM public.refresh_shado_tv_channel_latest_video(OLD.channel_id);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.channel_id IS NOT NULL THEN
    PERFORM public.refresh_shado_tv_channel_latest_video(NEW.channel_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_shado_tv_channel_latest_video() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_shado_tv_channel_latest_video_trigger ON public.shado_tv_videos;
CREATE TRIGGER sync_shado_tv_channel_latest_video_trigger
  AFTER INSERT OR UPDATE OF channel_id, visibility_status, deleted_at, updated_at OR DELETE
  ON public.shado_tv_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_shado_tv_channel_latest_video();

DROP POLICY IF EXISTS "Authenticated users can read published Shado TV channels" ON public.shado_tv_channels;
CREATE POLICY "Authenticated users can read published Shado TV channels"
ON public.shado_tv_channels
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND visibility_status = 'published'
);

DROP POLICY IF EXISTS "Operators can read all Shado TV channels" ON public.shado_tv_channels;
CREATE POLICY "Operators can read all Shado TV channels"
ON public.shado_tv_channels
FOR SELECT
TO authenticated
USING (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Operators can create Shado TV channels" ON public.shado_tv_channels;
CREATE POLICY "Operators can create Shado TV channels"
ON public.shado_tv_channels
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_app_operator((select auth.uid()))
  AND (created_by IS NULL OR created_by = (select auth.uid()))
);

DROP POLICY IF EXISTS "Operators can update Shado TV channels" ON public.shado_tv_channels;
CREATE POLICY "Operators can update Shado TV channels"
ON public.shado_tv_channels
FOR UPDATE
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Authenticated users can read published Shado TV videos" ON public.shado_tv_videos;
CREATE POLICY "Authenticated users can read published Shado TV videos"
ON public.shado_tv_videos
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND visibility_status = 'published'
  AND channel_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.shado_tv_channels channels
    WHERE channels.id = shado_tv_videos.channel_id
      AND channels.deleted_at IS NULL
      AND channels.visibility_status = 'published'
  )
);

DROP POLICY IF EXISTS "Operators can read all Shado TV videos" ON public.shado_tv_videos;
CREATE POLICY "Operators can read all Shado TV videos"
ON public.shado_tv_videos
FOR SELECT
TO authenticated
USING (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Operators can create Shado TV videos" ON public.shado_tv_videos;
CREATE POLICY "Operators can create Shado TV videos"
ON public.shado_tv_videos
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_app_operator((select auth.uid()))
  AND (created_by IS NULL OR created_by = (select auth.uid()))
);

DROP POLICY IF EXISTS "Operators can update Shado TV videos" ON public.shado_tv_videos;
CREATE POLICY "Operators can update Shado TV videos"
ON public.shado_tv_videos
FOR UPDATE
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Authenticated users can read visible Shado TV home features" ON public.shado_tv_home_features;
CREATE POLICY "Authenticated users can read visible Shado TV home features"
ON public.shado_tv_home_features
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.shado_tv_videos videos
    JOIN public.shado_tv_channels channels
      ON channels.id = videos.channel_id
    WHERE videos.id = shado_tv_home_features.video_id
      AND videos.deleted_at IS NULL
      AND videos.visibility_status = 'published'
      AND channels.deleted_at IS NULL
      AND channels.visibility_status = 'published'
  )
);

DROP POLICY IF EXISTS "Operators can manage Shado TV home features" ON public.shado_tv_home_features;
CREATE POLICY "Operators can manage Shado TV home features"
ON public.shado_tv_home_features
FOR ALL
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Users can read own Shado TV watch progress" ON public.shado_tv_watch_progress;
CREATE POLICY "Users can read own Shado TV watch progress"
ON public.shado_tv_watch_progress
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own Shado TV watch progress" ON public.shado_tv_watch_progress;
CREATE POLICY "Users can create own Shado TV watch progress"
ON public.shado_tv_watch_progress
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (select auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.shado_tv_videos videos
    JOIN public.shado_tv_channels channels
      ON channels.id = videos.channel_id
    WHERE videos.id = shado_tv_watch_progress.video_id
      AND videos.deleted_at IS NULL
      AND videos.visibility_status = 'published'
      AND videos.release_status = 'released'
      AND channels.deleted_at IS NULL
      AND channels.visibility_status = 'published'
  )
);

DROP POLICY IF EXISTS "Users can update own Shado TV watch progress" ON public.shado_tv_watch_progress;
CREATE POLICY "Users can update own Shado TV watch progress"
ON public.shado_tv_watch_progress
FOR UPDATE
TO authenticated
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Operators can read Shado TV processing jobs" ON public.shado_tv_processing_jobs;
CREATE POLICY "Operators can read Shado TV processing jobs"
ON public.shado_tv_processing_jobs
FOR SELECT
TO authenticated
USING (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Operators can manage Shado TV processing jobs" ON public.shado_tv_processing_jobs;
CREATE POLICY "Operators can manage Shado TV processing jobs"
ON public.shado_tv_processing_jobs
FOR ALL
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (public.is_app_operator((select auth.uid())));

GRANT SELECT, INSERT, UPDATE ON public.shado_tv_channels TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shado_tv_videos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shado_tv_home_features TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shado_tv_watch_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shado_tv_processing_jobs TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'shado_tv_channels'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.shado_tv_channels;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'shado_tv_videos'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.shado_tv_videos;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'shado_tv_home_features'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.shado_tv_home_features;
    END IF;
  END IF;
END $$;

WITH admin_owner AS (
  SELECT roles.user_id
  FROM public.user_roles roles
  WHERE roles.role = 'admin'
  ORDER BY roles.created_at ASC
  LIMIT 1
),
seed_channels AS (
  SELECT *
  FROM (VALUES
    ('classic-cinema', 'Classic Cinema', 'Silver-screen legends and midnight restorations.', 'Restored noir, silent-era gems, and classic cinema nights in the Shado TV theater.', '/entertainment/shado-tv/tickets/classic.webp', '/entertainment/shado-tv/channel-hero-fallback.webp', '#f0d381', 10),
    ('neon-nights', 'Neon Nights', 'After-hours premieres with electric city glow.', 'Late-night neon stories, new premieres, and rain-slick city energy.', '/entertainment/shado-tv/tickets/neon.webp', '/entertainment/shado-tv/channel-hero-fallback.webp', '#ff6f8f', 20),
    ('retro-rewind', 'Retro Rewind', 'Drive-in energy, analog grain, and lost-tape charm.', 'VHS-era finds, drive-in features, and analog rewind specials.', '/entertainment/shado-tv/tickets/rewind.webp', '/entertainment/shado-tv/channel-hero-fallback.webp', '#6eb6ba', 30),
    ('late-shift', 'Late Shift', 'Projection-booth oddities after the lobby lights dim.', 'Short-form oddities, midnight previews, and strange after-hours reels.', '/entertainment/shado-tv/tickets/late.webp', '/entertainment/shado-tv/channel-hero-fallback.webp', '#a7ba84', 40),
    ('pixel-planet', 'Pixel Planet', 'Arcade sci-fi dispatches from the velvet void.', 'Retro arcade signals, sci-fi shorts, and pixel-night experiments.', '/entertainment/shado-tv/tickets/pixel.webp', '/entertainment/shado-tv/channel-hero-fallback.webp', '#b98ad8', 50)
  ) AS values(slug, title, tagline, description, ticket_asset_url, hero_asset_url, accent_color, sort_order)
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
  updated_by
)
SELECT
  seed_channels.slug,
  seed_channels.title,
  seed_channels.tagline,
  seed_channels.description,
  seed_channels.ticket_asset_url,
  seed_channels.hero_asset_url,
  seed_channels.accent_color,
  'published',
  seed_channels.sort_order,
  admin_owner.user_id,
  admin_owner.user_id
FROM seed_channels
CROSS JOIN admin_owner
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
  SELECT roles.user_id
  FROM public.user_roles roles
  WHERE roles.role = 'admin'
  ORDER BY roles.created_at ASC
  LIMIT 1
),
seed_videos AS (
  SELECT *
  FROM (VALUES
    ('classic-cinema', 'silver-screen', 'Silver Screen', 'Legends', 'A restored noir placeholder for the first Shado TV marquee slot.', 'released', 'horizontal', 1458, 'Available now', '/entertainment/shado-tv/posters/classic-cinema.webp', '/entertainment/shado-tv/placeholders/video-horizontal.webp', 10),
    ('neon-nights', 'neon-run', 'Neon Run', 'Premiere', 'A scheduled premiere placeholder with trailer-first release behavior.', 'premiere', 'horizontal', 1724, 'Premieres Friday 9:00 PM', '/entertainment/shado-tv/posters/neon-nights.webp', '/entertainment/shado-tv/placeholders/locked-premiere.webp', 20),
    ('retro-rewind', 'drive-in-rewind', 'Drive-In Rewind', 'Double Feature', 'A dusk-drive placeholder for rewind channels and featured rows.', 'released', 'horizontal', 1082, 'Available now', '/entertainment/shado-tv/posters/retro-rewind.webp', '/entertainment/shado-tv/placeholders/video-horizontal.webp', 30),
    ('late-shift', 'midnight-booth', 'Midnight Booth', 'Trailer', 'A late-night projection-room placeholder with trailer availability.', 'locked', 'vertical', 700, 'Trailer available', '/entertainment/shado-tv/posters/late-shift.webp', '/entertainment/shado-tv/placeholders/video-vertical.webp', 40),
    ('pixel-planet', 'pixel-orbit', 'Pixel Orbit', 'Signal Test', 'A retro sci-fi placeholder ready for the processing pipeline.', 'processing', 'vertical', NULL, 'Preparing stream', '/entertainment/shado-tv/posters/pixel-planet.webp', '/entertainment/shado-tv/placeholders/processing.webp', 50)
  ) AS values(channel_slug, slug, title, subtitle, description, release_status, orientation, duration_seconds, release_label, poster_asset_url, thumbnail_asset_url, sort_order)
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
  released_at,
  created_by,
  updated_by
)
SELECT
  channels.id,
  seed_videos.slug,
  seed_videos.title,
  seed_videos.subtitle,
  seed_videos.description,
  'placeholder',
  'published',
  seed_videos.release_status,
  seed_videos.orientation,
  seed_videos.duration_seconds,
  seed_videos.release_label,
  seed_videos.poster_asset_url,
  seed_videos.thumbnail_asset_url,
  'placeholder',
  CASE WHEN seed_videos.release_status = 'processing' THEN 'processing' ELSE 'ready' END,
  CASE WHEN seed_videos.release_status = 'released' THEN now() ELSE NULL END,
  admin_owner.user_id,
  admin_owner.user_id
FROM seed_videos
JOIN public.shado_tv_channels channels
  ON channels.slug = seed_videos.channel_slug
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
  provider = EXCLUDED.provider,
  upload_status = EXCLUDED.upload_status,
  updated_by = EXCLUDED.updated_by,
  deleted_at = NULL,
  deleted_by = NULL;

WITH admin_owner AS (
  SELECT roles.user_id
  FROM public.user_roles roles
  WHERE roles.role = 'admin'
  ORDER BY roles.created_at ASC
  LIMIT 1
),
seed_features AS (
  SELECT *
  FROM (VALUES
    ('prime', 'silver-screen', 0),
    ('featured', 'silver-screen', 10),
    ('featured', 'neon-run', 20),
    ('featured', 'drive-in-rewind', 30),
    ('featured', 'midnight-booth', 40)
  ) AS values(feature_type, video_slug, sort_order)
)
INSERT INTO public.shado_tv_home_features (
  video_id,
  feature_type,
  sort_order,
  created_by
)
SELECT
  videos.id,
  seed_features.feature_type,
  seed_features.sort_order,
  admin_owner.user_id
FROM seed_features
JOIN public.shado_tv_videos videos
  ON videos.slug = seed_features.video_slug
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
