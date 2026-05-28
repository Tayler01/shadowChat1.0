CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.shadow_pin_activity_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_event_at timestamptz NOT NULL DEFAULT now(),
  total_duration_seconds integer NOT NULL DEFAULT 0 CHECK (total_duration_seconds >= 0 AND total_duration_seconds <= 86400),
  visit_qualified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shadow_pin_activity_sessions_user_started_idx
  ON public.shadow_pin_activity_sessions (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS shadow_pin_activity_sessions_started_idx
  ON public.shadow_pin_activity_sessions (started_at DESC);

CREATE TABLE IF NOT EXISTS public.shadow_pin_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.shadow_pin_activity_sessions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'shadow_pin_visit',
      'category_visit',
      'pin_viewed',
      'pin_opened',
      'category_heart_added',
      'category_heart_removed',
      'pin_heart_added',
      'pin_heart_removed',
      'share_tapped',
      'category_created',
      'category_edited',
      'category_deleted',
      'pin_created',
      'pin_edited',
      'pin_deleted'
    )
  ),
  target_type text NOT NULL CHECK (target_type IN ('shadow_pin', 'category', 'pin')),
  category_id uuid REFERENCES public.shadow_pin_categories(id) ON DELETE SET NULL,
  image_id uuid REFERENCES public.shadow_pin_images(id) ON DELETE SET NULL,
  category_title_snapshot text,
  item_title_snapshot text,
  thumbnail_url_snapshot text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR (duration_seconds >= 0 AND duration_seconds <= 86400)),
  score_value integer NOT NULL DEFAULT 0 CHECK (score_value >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'live' CHECK (source IN ('live', 'backfill')),
  backfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shadow_pin_activity_events_created_idx
  ON public.shadow_pin_activity_events (created_at DESC);

CREATE INDEX IF NOT EXISTS shadow_pin_activity_events_user_created_idx
  ON public.shadow_pin_activity_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS shadow_pin_activity_events_category_created_idx
  ON public.shadow_pin_activity_events (category_id, created_at DESC)
  WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS shadow_pin_activity_events_image_created_idx
  ON public.shadow_pin_activity_events (image_id, created_at DESC)
  WHERE image_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shadow_pin_activity_session_visit_once_idx
  ON public.shadow_pin_activity_events (session_id, event_type)
  WHERE session_id IS NOT NULL
    AND event_type = 'shadow_pin_visit';

CREATE UNIQUE INDEX IF NOT EXISTS shadow_pin_activity_pin_view_once_idx
  ON public.shadow_pin_activity_events (session_id, image_id, event_type)
  WHERE session_id IS NOT NULL
    AND image_id IS NOT NULL
    AND event_type = 'pin_viewed';

CREATE UNIQUE INDEX IF NOT EXISTS shadow_pin_activity_backfill_category_once_idx
  ON public.shadow_pin_activity_events (event_type, category_id, user_id)
  WHERE source = 'backfill'
    AND image_id IS NULL
    AND category_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shadow_pin_activity_backfill_pin_once_idx
  ON public.shadow_pin_activity_events (event_type, image_id, user_id)
  WHERE source = 'backfill'
    AND image_id IS NOT NULL;

ALTER TABLE public.shadow_pin_activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_pin_activity_events ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_shadow_pin_activity_sessions_updated_at ON public.shadow_pin_activity_sessions;
CREATE TRIGGER update_shadow_pin_activity_sessions_updated_at
  BEFORE UPDATE ON public.shadow_pin_activity_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON TABLE public.shadow_pin_activity_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.shadow_pin_activity_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.shadow_pin_activity_event_score(event_type text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE event_type
    WHEN 'shadow_pin_visit' THEN 2
    WHEN 'category_visit' THEN 2
    WHEN 'pin_viewed' THEN 1
    WHEN 'pin_opened' THEN 3
    WHEN 'category_heart_added' THEN 3
    WHEN 'pin_heart_added' THEN 3
    WHEN 'category_heart_removed' THEN 1
    WHEN 'pin_heart_removed' THEN 1
    WHEN 'share_tapped' THEN 4
    WHEN 'category_created' THEN 12
    WHEN 'pin_created' THEN 10
    WHEN 'category_edited' THEN 4
    WHEN 'pin_edited' THEN 4
    WHEN 'category_deleted' THEN 3
    WHEN 'pin_deleted' THEN 3
    ELSE 0
  END;
$$;

REVOKE ALL ON FUNCTION private.shadow_pin_activity_event_score(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_shadow_pin_activity_session()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  next_session_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to track Shadow Pin activity';
  END IF;

  INSERT INTO public.shadow_pin_activity_sessions (user_id)
  VALUES (current_user_id)
  RETURNING id INTO next_session_id;

  RETURN next_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_shadow_pin_activity_session(
  session_id uuid,
  total_duration_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  clean_duration integer := LEAST(GREATEST(COALESCE(total_duration_seconds, 0), 0), 86400);
  updated_session public.shadow_pin_activity_sessions%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to track Shadow Pin activity';
  END IF;

  UPDATE public.shadow_pin_activity_sessions
  SET
    total_duration_seconds = clean_duration,
    ended_at = now(),
    last_event_at = now(),
    visit_qualified = visit_qualified OR clean_duration >= 5
  WHERE id = finish_shadow_pin_activity_session.session_id
    AND user_id = current_user_id
  RETURNING * INTO updated_session;

  IF updated_session.id IS NULL THEN
    RAISE EXCEPTION 'Shadow Pin activity session is not available';
  END IF;

  IF clean_duration >= 5 THEN
    INSERT INTO public.shadow_pin_activity_events (
      session_id,
      user_id,
      event_type,
      target_type,
      duration_seconds,
      score_value,
      metadata,
      source,
      created_at
    )
    VALUES (
      updated_session.id,
      current_user_id,
      'shadow_pin_visit',
      'shadow_pin',
      clean_duration,
      private.shadow_pin_activity_event_score('shadow_pin_visit'),
      jsonb_build_object('qualified_after_seconds', 5),
      'live',
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_shadow_pin_activity_event(
  session_id uuid,
  event_type text,
  category_id uuid DEFAULT NULL,
  image_id uuid DEFAULT NULL,
  duration_seconds integer DEFAULT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  clean_metadata jsonb := COALESCE(metadata, '{}'::jsonb);
  clean_duration integer := CASE
    WHEN duration_seconds IS NULL THEN NULL
    ELSE LEAST(GREATEST(duration_seconds, 0), 86400)
  END;
  resolved_target_type text;
  resolved_category_id uuid := category_id;
  resolved_category_title text := NULLIF(trim(clean_metadata->>'category_title'), '');
  resolved_item_title text := NULLIF(trim(clean_metadata->>'item_title'), '');
  resolved_thumbnail_url text := NULLIF(trim(clean_metadata->>'thumbnail_url'), '');
  event_id uuid;
  session_owner uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to track Shadow Pin activity';
  END IF;

  IF event_type NOT IN (
    'shadow_pin_visit',
    'category_visit',
    'pin_viewed',
    'pin_opened',
    'category_heart_added',
    'category_heart_removed',
    'pin_heart_added',
    'pin_heart_removed',
    'share_tapped',
    'category_created',
    'category_edited',
    'category_deleted',
    'pin_created',
    'pin_edited',
    'pin_deleted'
  ) THEN
    RAISE EXCEPTION 'Unsupported Shadow Pin activity event type';
  END IF;

  IF session_id IS NOT NULL THEN
    SELECT sessions.user_id
    INTO session_owner
    FROM public.shadow_pin_activity_sessions sessions
    WHERE sessions.id = record_shadow_pin_activity_event.session_id;

    IF session_owner IS DISTINCT FROM current_user_id THEN
      RAISE EXCEPTION 'Shadow Pin activity session is not available';
    END IF;
  END IF;

  IF event_type = 'category_visit' AND COALESCE(clean_duration, 0) < 3 THEN
    RETURN NULL;
  END IF;

  IF event_type = 'shadow_pin_visit' AND COALESCE(clean_duration, 0) < 5 THEN
    RETURN NULL;
  END IF;

  IF event_type LIKE 'pin_%' OR event_type IN ('share_tapped') THEN
    resolved_target_type := 'pin';
    IF image_id IS NULL THEN
      RAISE EXCEPTION 'Pin activity requires an image id';
    END IF;

    SELECT
      COALESCE(resolved_category_id, images.category_id),
      COALESCE(resolved_item_title, images.title),
      COALESCE(resolved_thumbnail_url, images.thumbnail_url, images.medium_url, images.image_url),
      COALESCE(resolved_category_title, categories.title)
    INTO
      resolved_category_id,
      resolved_item_title,
      resolved_thumbnail_url,
      resolved_category_title
    FROM public.shadow_pin_images images
    LEFT JOIN public.shadow_pin_categories categories
      ON categories.id = images.category_id
    WHERE images.id = image_id;
  ELSIF event_type LIKE 'category_%' THEN
    resolved_target_type := 'category';
    IF resolved_category_id IS NULL THEN
      RAISE EXCEPTION 'Category activity requires a category id';
    END IF;

    SELECT
      COALESCE(resolved_category_title, categories.title),
      COALESCE(resolved_item_title, categories.title),
      COALESCE(resolved_thumbnail_url, categories.thumbnail_url, categories.medium_url, categories.image_url)
    INTO
      resolved_category_title,
      resolved_item_title,
      resolved_thumbnail_url
    FROM public.shadow_pin_categories categories
    WHERE categories.id = resolved_category_id;
  ELSE
    resolved_target_type := 'shadow_pin';
  END IF;

  INSERT INTO public.shadow_pin_activity_events (
    session_id,
    user_id,
    event_type,
    target_type,
    category_id,
    image_id,
    category_title_snapshot,
    item_title_snapshot,
    thumbnail_url_snapshot,
    duration_seconds,
    score_value,
    metadata,
    source,
    created_at
  )
  VALUES (
    session_id,
    current_user_id,
    event_type,
    resolved_target_type,
    resolved_category_id,
    image_id,
    resolved_category_title,
    resolved_item_title,
    resolved_thumbnail_url,
    clean_duration,
    private.shadow_pin_activity_event_score(event_type),
    clean_metadata,
    'live',
    now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO event_id;

  IF event_id IS NOT NULL AND session_id IS NOT NULL THEN
    UPDATE public.shadow_pin_activity_sessions
    SET
      last_event_at = now(),
      visit_qualified = visit_qualified OR event_type = 'shadow_pin_visit'
    WHERE id = session_id
      AND user_id = current_user_id;
  END IF;

  RETURN event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shadow_pin_activity_user_summary(
  start_at timestamptz,
  end_at timestamptz,
  compare_start_at timestamptz DEFAULT NULL,
  compare_end_at timestamptz DEFAULT NULL,
  filter_user_id uuid DEFAULT NULL,
  filter_category_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  admin_role text,
  visits bigint,
  active_seconds bigint,
  categories_viewed bigint,
  pins_viewed bigint,
  pin_opens bigint,
  posts bigint,
  categories_created bigint,
  hearts bigint,
  shares bigint,
  edits bigint,
  deletes bigint,
  activity_score numeric,
  previous_activity_score numeric,
  latest_activity timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_operator(auth.uid()) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  RETURN QUERY
  WITH current_events AS (
    SELECT events.*
    FROM public.shadow_pin_activity_events events
    WHERE events.created_at >= get_shadow_pin_activity_user_summary.start_at
      AND events.created_at < get_shadow_pin_activity_user_summary.end_at
      AND (filter_user_id IS NULL OR events.user_id = filter_user_id)
      AND (filter_category_id IS NULL OR events.category_id = filter_category_id)
  ),
  current_sessions AS (
    SELECT sessions.*
    FROM public.shadow_pin_activity_sessions sessions
    WHERE sessions.started_at >= get_shadow_pin_activity_user_summary.start_at
      AND sessions.started_at < get_shadow_pin_activity_user_summary.end_at
      AND sessions.visit_qualified
      AND filter_category_id IS NULL
      AND (filter_user_id IS NULL OR sessions.user_id = filter_user_id)
  ),
  current_time_metrics AS (
    SELECT
      time_rows.user_id,
      SUM(time_rows.duration_seconds)::bigint AS active_seconds,
      SUM(time_rows.time_points)::numeric AS time_score
    FROM (
      SELECT
        sessions.user_id,
        date_trunc('day', sessions.started_at) AS activity_day,
        SUM(sessions.total_duration_seconds) AS duration_seconds,
        LEAST(FLOOR(SUM(sessions.total_duration_seconds)::numeric / 60), 30) AS time_points
      FROM current_sessions sessions
      GROUP BY sessions.user_id, date_trunc('day', sessions.started_at)
      UNION ALL
      SELECT
        events.user_id,
        date_trunc('day', events.created_at) AS activity_day,
        SUM(COALESCE(events.duration_seconds, 0)) AS duration_seconds,
        FLOOR(SUM(COALESCE(events.duration_seconds, 0))::numeric / 60) AS time_points
      FROM current_events events
      WHERE filter_category_id IS NOT NULL
        AND events.event_type = 'category_visit'
      GROUP BY events.user_id, date_trunc('day', events.created_at)
    ) time_rows
    GROUP BY time_rows.user_id
  ),
  current_metrics AS (
    SELECT
      events.user_id,
      COUNT(*) FILTER (WHERE events.event_type = 'shadow_pin_visit' OR (filter_category_id IS NOT NULL AND events.event_type = 'category_visit'))::bigint AS visits,
      COUNT(DISTINCT events.category_id) FILTER (WHERE events.event_type = 'category_visit')::bigint AS categories_viewed,
      COUNT(*) FILTER (WHERE events.event_type = 'pin_viewed')::bigint AS pins_viewed,
      COUNT(*) FILTER (WHERE events.event_type = 'pin_opened')::bigint AS pin_opens,
      COUNT(*) FILTER (WHERE events.event_type IN ('category_created', 'pin_created'))::bigint AS posts,
      COUNT(*) FILTER (WHERE events.event_type = 'category_created')::bigint AS categories_created,
      COUNT(*) FILTER (WHERE events.event_type IN ('category_heart_added', 'category_heart_removed', 'pin_heart_added', 'pin_heart_removed'))::bigint AS hearts,
      COUNT(*) FILTER (WHERE events.event_type = 'share_tapped')::bigint AS shares,
      COUNT(*) FILTER (WHERE events.event_type IN ('category_edited', 'pin_edited'))::bigint AS edits,
      COUNT(*) FILTER (WHERE events.event_type IN ('category_deleted', 'pin_deleted'))::bigint AS deletes,
      SUM(events.score_value)::numeric AS event_score,
      MAX(events.created_at) AS latest_activity
    FROM current_events events
    GROUP BY events.user_id
  ),
  previous_events AS (
    SELECT events.*
    FROM public.shadow_pin_activity_events events
    WHERE compare_start_at IS NOT NULL
      AND compare_end_at IS NOT NULL
      AND events.created_at >= compare_start_at
      AND events.created_at < compare_end_at
      AND (filter_user_id IS NULL OR events.user_id = filter_user_id)
      AND (filter_category_id IS NULL OR events.category_id = filter_category_id)
  ),
  previous_sessions AS (
    SELECT sessions.*
    FROM public.shadow_pin_activity_sessions sessions
    WHERE compare_start_at IS NOT NULL
      AND compare_end_at IS NOT NULL
      AND sessions.started_at >= compare_start_at
      AND sessions.started_at < compare_end_at
      AND sessions.visit_qualified
      AND filter_category_id IS NULL
      AND (filter_user_id IS NULL OR sessions.user_id = filter_user_id)
  ),
  previous_time_metrics AS (
    SELECT
      time_rows.user_id,
      SUM(time_rows.time_points)::numeric AS time_score
    FROM (
      SELECT
        sessions.user_id,
        date_trunc('day', sessions.started_at) AS activity_day,
        LEAST(FLOOR(SUM(sessions.total_duration_seconds)::numeric / 60), 30) AS time_points
      FROM previous_sessions sessions
      GROUP BY sessions.user_id, date_trunc('day', sessions.started_at)
      UNION ALL
      SELECT
        events.user_id,
        date_trunc('day', events.created_at) AS activity_day,
        FLOOR(SUM(COALESCE(events.duration_seconds, 0))::numeric / 60) AS time_points
      FROM previous_events events
      WHERE filter_category_id IS NOT NULL
        AND events.event_type = 'category_visit'
      GROUP BY events.user_id, date_trunc('day', events.created_at)
    ) time_rows
    GROUP BY time_rows.user_id
  ),
  previous_scores AS (
    SELECT
      previous_events.user_id,
      COALESCE(SUM(previous_events.score_value), 0)::numeric + COALESCE(MAX(previous_time_metrics.time_score), 0)::numeric AS previous_activity_score
    FROM previous_events
    LEFT JOIN previous_time_metrics
      ON previous_time_metrics.user_id = previous_events.user_id
    GROUP BY previous_events.user_id
    UNION
    SELECT
      previous_time_metrics.user_id,
      previous_time_metrics.time_score AS previous_activity_score
    FROM previous_time_metrics
    WHERE NOT EXISTS (
      SELECT 1 FROM previous_events WHERE previous_events.user_id = previous_time_metrics.user_id
    )
  ),
  user_ids AS (
    SELECT user_id FROM current_metrics
    UNION
    SELECT user_id FROM current_time_metrics
  )
  SELECT
    users.id,
    users.username,
    users.display_name,
    users.avatar_url,
    users.admin_role,
    COALESCE(current_metrics.visits, 0),
    COALESCE(current_time_metrics.active_seconds, 0),
    COALESCE(current_metrics.categories_viewed, 0),
    COALESCE(current_metrics.pins_viewed, 0),
    COALESCE(current_metrics.pin_opens, 0),
    COALESCE(current_metrics.posts, 0),
    COALESCE(current_metrics.categories_created, 0),
    COALESCE(current_metrics.hearts, 0),
    COALESCE(current_metrics.shares, 0),
    COALESCE(current_metrics.edits, 0),
    COALESCE(current_metrics.deletes, 0),
    COALESCE(current_metrics.event_score, 0)::numeric + COALESCE(current_time_metrics.time_score, 0)::numeric,
    COALESCE(previous_scores.previous_activity_score, 0)::numeric,
    current_metrics.latest_activity
  FROM user_ids
  JOIN public.users users
    ON users.id = user_ids.user_id
  LEFT JOIN current_metrics
    ON current_metrics.user_id = user_ids.user_id
  LEFT JOIN current_time_metrics
    ON current_time_metrics.user_id = user_ids.user_id
  LEFT JOIN previous_scores
    ON previous_scores.user_id = user_ids.user_id
  ORDER BY
    (COALESCE(current_metrics.event_score, 0)::numeric + COALESCE(current_time_metrics.time_score, 0)::numeric) DESC,
    COALESCE(current_metrics.latest_activity, '-infinity'::timestamptz) DESC,
    lower(users.display_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shadow_pin_activity_category_summary(
  start_at timestamptz,
  end_at timestamptz,
  compare_start_at timestamptz DEFAULT NULL,
  compare_end_at timestamptz DEFAULT NULL,
  filter_user_id uuid DEFAULT NULL,
  filter_category_id uuid DEFAULT NULL
)
RETURNS TABLE (
  category_id uuid,
  title text,
  thumbnail_url text,
  visits bigint,
  active_seconds bigint,
  unique_visitors bigint,
  pin_views bigint,
  pin_opens bigint,
  pins_created bigint,
  hearts bigint,
  shares bigint,
  latest_activity timestamptz,
  activity_score numeric,
  previous_activity_score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_operator(auth.uid()) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  RETURN QUERY
  WITH current_events AS (
    SELECT events.*
    FROM public.shadow_pin_activity_events events
    WHERE events.created_at >= get_shadow_pin_activity_category_summary.start_at
      AND events.created_at < get_shadow_pin_activity_category_summary.end_at
      AND events.category_id IS NOT NULL
      AND (filter_user_id IS NULL OR events.user_id = filter_user_id)
      AND (filter_category_id IS NULL OR events.category_id = filter_category_id)
  ),
  current_metrics AS (
    SELECT
      events.category_id,
      COALESCE(
        MAX(categories.title),
        (ARRAY_AGG(events.category_title_snapshot ORDER BY events.created_at DESC))[1],
        (ARRAY_AGG(events.item_title_snapshot ORDER BY events.created_at DESC))[1],
        'Deleted category'
      ) AS title,
      COALESCE(
        MAX(categories.thumbnail_url),
        MAX(categories.medium_url),
        MAX(categories.image_url),
        (ARRAY_AGG(events.thumbnail_url_snapshot ORDER BY events.created_at DESC))[1]
      ) AS thumbnail_url,
      COUNT(*) FILTER (WHERE events.event_type = 'category_visit')::bigint AS visits,
      COALESCE(SUM(events.duration_seconds) FILTER (WHERE events.event_type = 'category_visit'), 0)::bigint AS active_seconds,
      COUNT(DISTINCT events.user_id)::bigint AS unique_visitors,
      COUNT(*) FILTER (WHERE events.event_type = 'pin_viewed')::bigint AS pin_views,
      COUNT(*) FILTER (WHERE events.event_type = 'pin_opened')::bigint AS pin_opens,
      COUNT(*) FILTER (WHERE events.event_type = 'pin_created')::bigint AS pins_created,
      COUNT(*) FILTER (WHERE events.event_type IN ('category_heart_added', 'category_heart_removed', 'pin_heart_added', 'pin_heart_removed'))::bigint AS hearts,
      COUNT(*) FILTER (WHERE events.event_type = 'share_tapped')::bigint AS shares,
      MAX(events.created_at) AS latest_activity,
      COALESCE(SUM(events.score_value), 0)::numeric + FLOOR(COALESCE(SUM(events.duration_seconds) FILTER (WHERE events.event_type = 'category_visit'), 0)::numeric / 60) AS activity_score
    FROM current_events events
    LEFT JOIN public.shadow_pin_categories categories
      ON categories.id = events.category_id
    GROUP BY events.category_id
  ),
  previous_scores AS (
    SELECT
      events.category_id,
      COALESCE(SUM(events.score_value), 0)::numeric + FLOOR(COALESCE(SUM(events.duration_seconds) FILTER (WHERE events.event_type = 'category_visit'), 0)::numeric / 60) AS previous_activity_score
    FROM public.shadow_pin_activity_events events
    WHERE compare_start_at IS NOT NULL
      AND compare_end_at IS NOT NULL
      AND events.created_at >= compare_start_at
      AND events.created_at < compare_end_at
      AND events.category_id IS NOT NULL
      AND (filter_user_id IS NULL OR events.user_id = filter_user_id)
      AND (filter_category_id IS NULL OR events.category_id = filter_category_id)
    GROUP BY events.category_id
  )
  SELECT
    current_metrics.category_id,
    current_metrics.title,
    current_metrics.thumbnail_url,
    current_metrics.visits,
    current_metrics.active_seconds,
    current_metrics.unique_visitors,
    current_metrics.pin_views,
    current_metrics.pin_opens,
    current_metrics.pins_created,
    current_metrics.hearts,
    current_metrics.shares,
    current_metrics.latest_activity,
    current_metrics.activity_score,
    COALESCE(previous_scores.previous_activity_score, 0)::numeric
  FROM current_metrics
  LEFT JOIN previous_scores
    ON previous_scores.category_id = current_metrics.category_id
  ORDER BY current_metrics.activity_score DESC, current_metrics.latest_activity DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shadow_pin_activity_pin_summary(
  start_at timestamptz,
  end_at timestamptz,
  compare_start_at timestamptz DEFAULT NULL,
  compare_end_at timestamptz DEFAULT NULL,
  filter_user_id uuid DEFAULT NULL,
  filter_category_id uuid DEFAULT NULL
)
RETURNS TABLE (
  image_id uuid,
  title text,
  thumbnail_url text,
  category_id uuid,
  category_title text,
  creator_id uuid,
  creator_username text,
  creator_display_name text,
  created_at timestamptz,
  grid_views bigint,
  opens bigint,
  hearts bigint,
  shares bigint,
  latest_activity timestamptz,
  activity_score numeric,
  previous_activity_score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_operator(auth.uid()) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  RETURN QUERY
  WITH current_events AS (
    SELECT events.*
    FROM public.shadow_pin_activity_events events
    WHERE events.created_at >= get_shadow_pin_activity_pin_summary.start_at
      AND events.created_at < get_shadow_pin_activity_pin_summary.end_at
      AND events.image_id IS NOT NULL
      AND (filter_user_id IS NULL OR events.user_id = filter_user_id)
      AND (filter_category_id IS NULL OR events.category_id = filter_category_id)
  ),
  current_metrics AS (
    SELECT
      events.image_id,
      COALESCE(
        MAX(images.title),
        (ARRAY_AGG(events.item_title_snapshot ORDER BY events.created_at DESC))[1],
        'Deleted pin'
      ) AS title,
      COALESCE(
        MAX(images.thumbnail_url),
        MAX(images.medium_url),
        MAX(images.image_url),
        (ARRAY_AGG(events.thumbnail_url_snapshot ORDER BY events.created_at DESC))[1]
      ) AS thumbnail_url,
      COALESCE(MAX(images.category_id), MAX(events.category_id)) AS category_id,
      COALESCE(
        MAX(categories.title),
        (ARRAY_AGG(events.category_title_snapshot ORDER BY events.created_at DESC))[1],
        'Uncategorized'
      ) AS category_title,
      MAX(images.creator_id) AS creator_id,
      MAX(creators.username) AS creator_username,
      MAX(creators.display_name) AS creator_display_name,
      MAX(images.created_at) AS created_at,
      COUNT(*) FILTER (WHERE events.event_type = 'pin_viewed')::bigint AS grid_views,
      COUNT(*) FILTER (WHERE events.event_type = 'pin_opened')::bigint AS opens,
      COUNT(*) FILTER (WHERE events.event_type IN ('pin_heart_added', 'pin_heart_removed'))::bigint AS hearts,
      COUNT(*) FILTER (WHERE events.event_type = 'share_tapped')::bigint AS shares,
      MAX(events.created_at) AS latest_activity,
      COALESCE(SUM(events.score_value), 0)::numeric AS activity_score
    FROM current_events events
    LEFT JOIN public.shadow_pin_images images
      ON images.id = events.image_id
    LEFT JOIN public.shadow_pin_categories categories
      ON categories.id = COALESCE(images.category_id, events.category_id)
    LEFT JOIN public.users creators
      ON creators.id = images.creator_id
    GROUP BY events.image_id
  ),
  previous_scores AS (
    SELECT
      events.image_id,
      COALESCE(SUM(events.score_value), 0)::numeric AS previous_activity_score
    FROM public.shadow_pin_activity_events events
    WHERE compare_start_at IS NOT NULL
      AND compare_end_at IS NOT NULL
      AND events.created_at >= compare_start_at
      AND events.created_at < compare_end_at
      AND events.image_id IS NOT NULL
      AND (filter_user_id IS NULL OR events.user_id = filter_user_id)
      AND (filter_category_id IS NULL OR events.category_id = filter_category_id)
    GROUP BY events.image_id
  )
  SELECT
    current_metrics.image_id,
    current_metrics.title,
    current_metrics.thumbnail_url,
    current_metrics.category_id,
    current_metrics.category_title,
    current_metrics.creator_id,
    current_metrics.creator_username,
    current_metrics.creator_display_name,
    current_metrics.created_at,
    current_metrics.grid_views,
    current_metrics.opens,
    current_metrics.hearts,
    current_metrics.shares,
    current_metrics.latest_activity,
    current_metrics.activity_score,
    COALESCE(previous_scores.previous_activity_score, 0)::numeric
  FROM current_metrics
  LEFT JOIN previous_scores
    ON previous_scores.image_id = current_metrics.image_id
  ORDER BY current_metrics.activity_score DESC, current_metrics.latest_activity DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shadow_pin_activity_timeline(
  start_at timestamptz,
  end_at timestamptz,
  filter_user_id uuid DEFAULT NULL,
  filter_category_id uuid DEFAULT NULL,
  filter_image_id uuid DEFAULT NULL,
  action_filter text DEFAULT 'all',
  result_limit integer DEFAULT 80,
  result_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  admin_role text,
  event_type text,
  target_type text,
  category_id uuid,
  image_id uuid,
  category_title text,
  item_title text,
  thumbnail_url text,
  duration_seconds integer,
  score_value integer,
  source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  safe_limit integer := LEAST(GREATEST(COALESCE(result_limit, 80), 1), 200);
  safe_offset integer := GREATEST(COALESCE(result_offset, 0), 0);
  clean_filter text := COALESCE(action_filter, 'all');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_operator(auth.uid()) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  RETURN QUERY
  SELECT
    events.id,
    events.created_at,
    events.user_id,
    users.username,
    users.display_name,
    users.avatar_url,
    users.admin_role,
    events.event_type,
    events.target_type,
    events.category_id,
    events.image_id,
    events.category_title_snapshot,
    events.item_title_snapshot,
    events.thumbnail_url_snapshot,
    events.duration_seconds,
    events.score_value,
    events.source
  FROM public.shadow_pin_activity_events events
  JOIN public.users users
    ON users.id = events.user_id
  WHERE events.created_at >= get_shadow_pin_activity_timeline.start_at
    AND events.created_at < get_shadow_pin_activity_timeline.end_at
    AND (filter_user_id IS NULL OR events.user_id = filter_user_id)
    AND (filter_category_id IS NULL OR events.category_id = filter_category_id)
    AND (filter_image_id IS NULL OR events.image_id = filter_image_id)
    AND (
      clean_filter = 'all'
      OR (clean_filter = 'views' AND events.event_type IN ('category_visit', 'pin_viewed'))
      OR (clean_filter = 'opens' AND events.event_type = 'pin_opened')
      OR (clean_filter = 'posts' AND events.event_type IN ('category_created', 'pin_created'))
      OR (clean_filter = 'hearts' AND events.event_type IN ('category_heart_added', 'category_heart_removed', 'pin_heart_added', 'pin_heart_removed'))
      OR (clean_filter = 'shares' AND events.event_type = 'share_tapped')
      OR (clean_filter = 'edits' AND events.event_type IN ('category_edited', 'pin_edited'))
      OR (clean_filter = 'deletes' AND events.event_type IN ('category_deleted', 'pin_deleted'))
      OR (clean_filter = 'visits' AND events.event_type IN ('shadow_pin_visit', 'category_visit'))
    )
  ORDER BY events.created_at DESC
  LIMIT safe_limit
  OFFSET safe_offset;
END;
$$;

INSERT INTO public.shadow_pin_activity_events (
  user_id,
  event_type,
  target_type,
  category_id,
  category_title_snapshot,
  item_title_snapshot,
  thumbnail_url_snapshot,
  score_value,
  metadata,
  source,
  backfilled_at,
  created_at
)
SELECT
  categories.creator_id,
  'category_created',
  'category',
  categories.id,
  categories.title,
  categories.title,
  COALESCE(categories.thumbnail_url, categories.medium_url, categories.image_url),
  private.shadow_pin_activity_event_score('category_created'),
  jsonb_build_object('backfill_source', 'shadow_pin_categories'),
  'backfill',
  now(),
  categories.created_at
FROM public.shadow_pin_categories categories
WHERE categories.creator_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.shadow_pin_activity_events (
  user_id,
  event_type,
  target_type,
  category_id,
  image_id,
  category_title_snapshot,
  item_title_snapshot,
  thumbnail_url_snapshot,
  score_value,
  metadata,
  source,
  backfilled_at,
  created_at
)
SELECT
  images.creator_id,
  'pin_created',
  'pin',
  images.category_id,
  images.id,
  categories.title,
  images.title,
  COALESCE(images.thumbnail_url, images.medium_url, images.image_url),
  private.shadow_pin_activity_event_score('pin_created'),
  jsonb_build_object('backfill_source', 'shadow_pin_images'),
  'backfill',
  now(),
  images.created_at
FROM public.shadow_pin_images images
LEFT JOIN public.shadow_pin_categories categories
  ON categories.id = images.category_id
WHERE images.creator_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.shadow_pin_activity_events (
  user_id,
  event_type,
  target_type,
  category_id,
  category_title_snapshot,
  item_title_snapshot,
  thumbnail_url_snapshot,
  score_value,
  metadata,
  source,
  backfilled_at,
  created_at
)
SELECT
  hearts.user_id,
  'category_heart_added',
  'category',
  hearts.category_id,
  categories.title,
  categories.title,
  COALESCE(categories.thumbnail_url, categories.medium_url, categories.image_url),
  private.shadow_pin_activity_event_score('category_heart_added'),
  jsonb_build_object('backfill_source', 'shadow_pin_category_hearts'),
  'backfill',
  now(),
  hearts.created_at
FROM public.shadow_pin_category_hearts hearts
JOIN public.shadow_pin_categories categories
  ON categories.id = hearts.category_id
ON CONFLICT DO NOTHING;

INSERT INTO public.shadow_pin_activity_events (
  user_id,
  event_type,
  target_type,
  category_id,
  image_id,
  category_title_snapshot,
  item_title_snapshot,
  thumbnail_url_snapshot,
  score_value,
  metadata,
  source,
  backfilled_at,
  created_at
)
SELECT
  hearts.user_id,
  'pin_heart_added',
  'pin',
  images.category_id,
  hearts.image_id,
  categories.title,
  images.title,
  COALESCE(images.thumbnail_url, images.medium_url, images.image_url),
  private.shadow_pin_activity_event_score('pin_heart_added'),
  jsonb_build_object('backfill_source', 'shadow_pin_image_hearts'),
  'backfill',
  now(),
  hearts.created_at
FROM public.shadow_pin_image_hearts hearts
JOIN public.shadow_pin_images images
  ON images.id = hearts.image_id
LEFT JOIN public.shadow_pin_categories categories
  ON categories.id = images.category_id
ON CONFLICT DO NOTHING;

GRANT EXECUTE ON FUNCTION public.start_shadow_pin_activity_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_shadow_pin_activity_session(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_shadow_pin_activity_event(uuid, text, uuid, uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shadow_pin_activity_user_summary(timestamptz, timestamptz, timestamptz, timestamptz, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shadow_pin_activity_category_summary(timestamptz, timestamptz, timestamptz, timestamptz, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shadow_pin_activity_pin_summary(timestamptz, timestamptz, timestamptz, timestamptz, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shadow_pin_activity_timeline(timestamptz, timestamptz, uuid, uuid, uuid, text, integer, integer) TO authenticated;
