/*
  # Shado TV captions, premiere attendance, and privacy-bounded analytics

  Caption files stay in the existing private Shado TV bucket. Viewer events
  are write-only for members; operators receive aggregate results through an
  invoker function and cannot access them through an anonymous role.
*/

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/vtt',
  'text/plain',
  'application/x-subrip'
]
WHERE id = 'shado-tv';

CREATE TABLE IF NOT EXISTS public.shado_tv_captions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.shado_tv_videos(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 80),
  language_code text NOT NULL CHECK (language_code ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})?$'),
  kind text NOT NULL DEFAULT 'captions' CHECK (kind IN ('captions', 'subtitles')),
  storage_path text NOT NULL UNIQUE CHECK (storage_path <> ''),
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shado_tv_captions_one_default_idx
  ON public.shado_tv_captions (video_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS shado_tv_captions_video_idx
  ON public.shado_tv_captions (video_id, language_code, created_at);

ALTER TABLE public.shado_tv_captions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read available Shado TV captions" ON public.shado_tv_captions;
CREATE POLICY "Members can read available Shado TV captions"
ON public.shado_tv_captions
FOR SELECT
TO authenticated
USING (
  public.is_app_operator((select auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.shado_tv_videos videos
    JOIN public.shado_tv_channels channels ON channels.id = videos.channel_id
    WHERE videos.id = shado_tv_captions.video_id
      AND videos.deleted_at IS NULL
      AND videos.visibility_status = 'published'
      AND channels.deleted_at IS NULL
      AND channels.visibility_status = 'published'
  )
);

DROP POLICY IF EXISTS "Operators can create Shado TV captions" ON public.shado_tv_captions;
CREATE POLICY "Operators can create Shado TV captions"
ON public.shado_tv_captions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_app_operator((select auth.uid()))
  AND created_by = (select auth.uid())
);

DROP POLICY IF EXISTS "Operators can update Shado TV captions" ON public.shado_tv_captions;
CREATE POLICY "Operators can update Shado TV captions"
ON public.shado_tv_captions
FOR UPDATE
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "Operators can delete Shado TV captions" ON public.shado_tv_captions;
CREATE POLICY "Operators can delete Shado TV captions"
ON public.shado_tv_captions
FOR DELETE
TO authenticated
USING (public.is_app_operator((select auth.uid())));

REVOKE ALL ON TABLE public.shado_tv_captions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shado_tv_captions TO authenticated;

CREATE TABLE IF NOT EXISTS public.shado_tv_watch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_event_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  video_id uuid NOT NULL REFERENCES public.shado_tv_videos(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('play', 'pause', 'progress', 'complete', 'premiere_join')),
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shado_tv_watch_events_video_time_idx
  ON public.shado_tv_watch_events (video_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS shado_tv_watch_events_user_time_idx
  ON public.shado_tv_watch_events (user_id, occurred_at DESC);

ALTER TABLE public.shado_tv_watch_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can record own Shado TV watch events" ON public.shado_tv_watch_events;
CREATE POLICY "Members can record own Shado TV watch events"
ON public.shado_tv_watch_events
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (select auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.shado_tv_videos videos
    JOIN public.shado_tv_channels channels ON channels.id = videos.channel_id
    WHERE videos.id = shado_tv_watch_events.video_id
      AND videos.deleted_at IS NULL
      AND videos.visibility_status = 'published'
      AND channels.deleted_at IS NULL
      AND channels.visibility_status = 'published'
  )
);

DROP POLICY IF EXISTS "Operators can read Shado TV watch events" ON public.shado_tv_watch_events;
CREATE POLICY "Operators can read Shado TV watch events"
ON public.shado_tv_watch_events
FOR SELECT
TO authenticated
USING (public.is_app_operator((select auth.uid())));

REVOKE ALL ON TABLE public.shado_tv_watch_events FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.shado_tv_watch_events TO authenticated;

CREATE OR REPLACE FUNCTION public.get_shado_tv_watch_analytics()
RETURNS TABLE (
  video_id uuid,
  plays bigint,
  unique_viewers bigint,
  completions bigint,
  premiere_joins bigint,
  average_watch_seconds numeric,
  last_watched_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    events.video_id,
    count(*) FILTER (WHERE events.event_type = 'play') AS plays,
    count(DISTINCT events.user_id) AS unique_viewers,
    count(*) FILTER (WHERE events.event_type = 'complete') AS completions,
    count(*) FILTER (WHERE events.event_type = 'premiere_join') AS premiere_joins,
    round(avg(events.position_seconds) FILTER (WHERE events.event_type IN ('progress', 'pause', 'complete')), 1)
      AS average_watch_seconds,
    max(events.occurred_at) AS last_watched_at
  FROM public.shado_tv_watch_events events
  WHERE public.is_app_operator((select auth.uid()))
  GROUP BY events.video_id;
$$;

REVOKE ALL ON FUNCTION public.get_shado_tv_watch_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shado_tv_watch_analytics() TO authenticated;
