BEGIN;

CREATE TABLE public.shadow_pin_feed_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  feed_mode text NOT NULL DEFAULT 'discover'
    CHECK (feed_mode IN ('discover', 'connections')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shadow_pin_feed_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.shadow_pin_feed_preferences
  FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.shadow_pin_feed_preferences TO service_role;

CREATE INDEX shadow_pin_images_creator_connections_feed_idx
  ON public.shadow_pin_images (creator_id, created_at DESC, id DESC)
  INCLUDE (category_id, media_type, processing_status)
  WHERE deleted_at IS NULL
    AND category_id IS NOT NULL
    AND creator_id IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS shadow_pin_private;
REVOKE ALL ON SCHEMA shadow_pin_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA shadow_pin_private TO authenticated, service_role;

CREATE FUNCTION shadow_pin_private.protect_image_feed_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ShadowPin image id and created_at are immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION shadow_pin_private.protect_image_feed_identity()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER shadow_pin_images_protect_feed_identity
  BEFORE UPDATE ON public.shadow_pin_images
  FOR EACH ROW
  EXECUTE FUNCTION shadow_pin_private.protect_image_feed_identity();

CREATE FUNCTION shadow_pin_private.get_my_feed_mode_impl()
RETURNS TABLE (
  feed_mode text,
  revision integer,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    coalesce(preferences.feed_mode, 'discover'),
    coalesce(preferences.revision, 0),
    preferences.updated_at
  FROM (SELECT 1) seed
  LEFT JOIN public.shadow_pin_feed_preferences preferences
    ON preferences.user_id = caller_id;
END;
$$;

CREATE FUNCTION shadow_pin_private.set_my_feed_mode_impl(target_mode text)
RETURNS TABLE (
  feed_mode text,
  revision integer,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_mode text := lower(trim(coalesce(target_mode, '')));
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF normalized_mode NOT IN ('discover', 'connections') THEN
    RAISE EXCEPTION 'ShadowPin feed mode must be discover or connections';
  END IF;

  RETURN QUERY
  INSERT INTO public.shadow_pin_feed_preferences AS preferences (
    user_id,
    feed_mode,
    revision,
    created_at,
    updated_at
  ) VALUES (
    caller_id,
    normalized_mode,
    1,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET feed_mode = excluded.feed_mode,
      revision = preferences.revision + 1,
      updated_at = now()
  RETURNING preferences.feed_mode, preferences.revision, preferences.updated_at;
END;
$$;

CREATE FUNCTION shadow_pin_private.list_my_connection_feed_impl(
  result_limit integer DEFAULT 30,
  before_created_at timestamptz DEFAULT NULL,
  before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  image_id uuid,
  created_at timestamptz,
  viewer_has_hearted boolean,
  has_more boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  bounded_limit integer := greatest(1, least(coalesce(result_limit, 30), 60));
  caller_is_operator boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF (before_created_at IS NULL) <> (before_id IS NULL) THEN
    RAISE EXCEPTION 'ShadowPin feed cursor must include both created_at and id';
  END IF;

  caller_is_operator := public.is_app_operator(caller_id);

  RETURN QUERY
  WITH blocked_user_ids AS MATERIALIZED (
    SELECT blocks.blocked_id AS user_id
    FROM public.user_blocks blocks
    WHERE blocks.blocker_id = caller_id

    UNION

    SELECT blocks.blocker_id
    FROM public.user_blocks blocks
    WHERE blocks.blocked_id = caller_id
  ), connected_creators AS MATERIALIZED (
    SELECT connections.member_high_id AS creator_id
    FROM public.user_connections connections
    WHERE connections.member_low_id = caller_id
      AND connections.status = 'accepted'

    UNION ALL

    SELECT connections.member_low_id
    FROM public.user_connections connections
    WHERE connections.member_high_id = caller_id
      AND connections.status = 'accepted'
  ), eligible_creators AS MATERIALIZED (
    SELECT connections.creator_id
    FROM connected_creators connections
    LEFT JOIN blocked_user_ids blocked
      ON blocked.user_id = connections.creator_id
    WHERE connections.creator_id <> caller_id
      AND blocked.user_id IS NULL
  ), per_creator_candidates AS (
    SELECT candidate.id, candidate.created_at
    FROM eligible_creators creators
    CROSS JOIN LATERAL (
      SELECT images.id, images.created_at
      FROM public.shadow_pin_images images
      WHERE images.creator_id = creators.creator_id
        AND images.deleted_at IS NULL
        AND images.category_id IS NOT NULL
        AND (
          images.media_type = 'image'
          OR images.processing_status = 'ready'
          OR caller_is_operator
        )
        AND (
          before_created_at IS NULL
          OR (images.created_at, images.id) < (before_created_at, before_id)
        )
        AND EXISTS (
          SELECT 1
          FROM public.shadow_pin_categories categories
          WHERE categories.id = images.category_id
            AND categories.deleted_at IS NULL
            AND (
              categories.creator_id IS NULL
              OR categories.creator_id = caller_id
              OR NOT EXISTS (
                SELECT 1
                FROM blocked_user_ids blocked_category_owner
                WHERE blocked_category_owner.user_id = categories.creator_id
              )
            )
        )
      ORDER BY images.created_at DESC, images.id DESC
      LIMIT bounded_limit + 1
    ) candidate
  ), page_candidates AS MATERIALIZED (
    SELECT candidates.id, candidates.created_at
    FROM per_creator_candidates candidates
    ORDER BY candidates.created_at DESC, candidates.id DESC
    LIMIT bounded_limit + 1
  ), numbered AS (
    SELECT
      candidates.*,
      row_number() OVER (ORDER BY candidates.created_at DESC, candidates.id DESC) AS row_number,
      count(*) OVER () AS candidate_count
    FROM page_candidates candidates
  )
  SELECT
    numbered.id,
    numbered.created_at,
    hearts.user_id IS NOT NULL,
    numbered.candidate_count > bounded_limit
  FROM numbered
  LEFT JOIN public.shadow_pin_image_hearts hearts
    ON hearts.image_id = numbered.id
   AND hearts.user_id = caller_id
  WHERE numbered.row_number <= bounded_limit
  ORDER BY numbered.created_at DESC, numbered.id DESC;
END;
$$;

CREATE FUNCTION shadow_pin_private.get_my_connection_feed_window_impl(target_image_id uuid)
RETURNS TABLE (
  image_id uuid,
  created_at timestamptz,
  viewer_has_hearted boolean,
  window_position text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_is_operator boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF target_image_id IS NULL THEN
    RAISE EXCEPTION 'ShadowPin target is required';
  END IF;

  caller_is_operator := public.is_app_operator(caller_id);

  RETURN QUERY
  WITH blocked_user_ids AS MATERIALIZED (
    SELECT blocks.blocked_id AS user_id
    FROM public.user_blocks blocks
    WHERE blocks.blocker_id = caller_id

    UNION

    SELECT blocks.blocker_id
    FROM public.user_blocks blocks
    WHERE blocks.blocked_id = caller_id
  ), connected_creators AS MATERIALIZED (
    SELECT connections.member_high_id AS creator_id
    FROM public.user_connections connections
    WHERE connections.member_low_id = caller_id
      AND connections.status = 'accepted'

    UNION ALL

    SELECT connections.member_low_id
    FROM public.user_connections connections
    WHERE connections.member_high_id = caller_id
      AND connections.status = 'accepted'
  ), eligible_creators AS MATERIALIZED (
    SELECT connections.creator_id
    FROM connected_creators connections
    LEFT JOIN blocked_user_ids blocked
      ON blocked.user_id = connections.creator_id
    WHERE connections.creator_id <> caller_id
      AND blocked.user_id IS NULL
  ), target AS MATERIALIZED (
    SELECT images.id, images.created_at
    FROM public.shadow_pin_images images
    JOIN eligible_creators creators
      ON creators.creator_id = images.creator_id
    WHERE images.id = target_image_id
      AND images.deleted_at IS NULL
      AND images.category_id IS NOT NULL
      AND (
        images.media_type = 'image'
        OR images.processing_status = 'ready'
        OR caller_is_operator
      )
      AND EXISTS (
        SELECT 1
        FROM public.shadow_pin_categories categories
        WHERE categories.id = images.category_id
          AND categories.deleted_at IS NULL
          AND (
            categories.creator_id IS NULL
            OR categories.creator_id = caller_id
            OR NOT EXISTS (
              SELECT 1
              FROM blocked_user_ids blocked_category_owner
              WHERE blocked_category_owner.user_id = categories.creator_id
            )
          )
      )
    LIMIT 1
  ), newer_per_creator AS (
    SELECT candidate.id, candidate.created_at
    FROM target target_row
    CROSS JOIN eligible_creators creators
    CROSS JOIN LATERAL (
      SELECT images.id, images.created_at
      FROM public.shadow_pin_images images
      WHERE images.creator_id = creators.creator_id
        AND images.deleted_at IS NULL
        AND images.category_id IS NOT NULL
        AND (
          images.media_type = 'image'
          OR images.processing_status = 'ready'
          OR caller_is_operator
        )
        AND (images.created_at, images.id) > (target_row.created_at, target_row.id)
        AND EXISTS (
          SELECT 1
          FROM public.shadow_pin_categories categories
          WHERE categories.id = images.category_id
            AND categories.deleted_at IS NULL
            AND (
              categories.creator_id IS NULL
              OR categories.creator_id = caller_id
              OR NOT EXISTS (
                SELECT 1
                FROM blocked_user_ids blocked_category_owner
                WHERE blocked_category_owner.user_id = categories.creator_id
              )
            )
        )
      ORDER BY images.created_at ASC, images.id ASC
      LIMIT 1
    ) candidate
  ), nearest_newer AS MATERIALIZED (
    SELECT candidates.id, candidates.created_at
    FROM newer_per_creator candidates
    ORDER BY candidates.created_at ASC, candidates.id ASC
    LIMIT 1
  ), older_per_creator AS (
    SELECT candidate.id, candidate.created_at
    FROM target target_row
    CROSS JOIN eligible_creators creators
    CROSS JOIN LATERAL (
      SELECT images.id, images.created_at
      FROM public.shadow_pin_images images
      WHERE images.creator_id = creators.creator_id
        AND images.deleted_at IS NULL
        AND images.category_id IS NOT NULL
        AND (
          images.media_type = 'image'
          OR images.processing_status = 'ready'
          OR caller_is_operator
        )
        AND (images.created_at, images.id) < (target_row.created_at, target_row.id)
        AND EXISTS (
          SELECT 1
          FROM public.shadow_pin_categories categories
          WHERE categories.id = images.category_id
            AND categories.deleted_at IS NULL
            AND (
              categories.creator_id IS NULL
              OR categories.creator_id = caller_id
              OR NOT EXISTS (
                SELECT 1
                FROM blocked_user_ids blocked_category_owner
                WHERE blocked_category_owner.user_id = categories.creator_id
              )
            )
        )
      ORDER BY images.created_at DESC, images.id DESC
      LIMIT 1
    ) candidate
  ), nearest_older AS MATERIALIZED (
    SELECT candidates.id, candidates.created_at
    FROM older_per_creator candidates
    ORDER BY candidates.created_at DESC, candidates.id DESC
    LIMIT 1
  ), window_rows AS (
    SELECT newer.id, newer.created_at, 'newer'::text AS window_position
    FROM nearest_newer newer

    UNION ALL

    SELECT target_row.id, target_row.created_at, 'target'::text
    FROM target target_row

    UNION ALL

    SELECT older.id, older.created_at, 'older'::text AS window_position
    FROM nearest_older older
  )
  SELECT
    window_rows.id,
    window_rows.created_at,
    hearts.user_id IS NOT NULL,
    window_rows.window_position
  FROM window_rows
  LEFT JOIN public.shadow_pin_image_hearts hearts
    ON hearts.image_id = window_rows.id
   AND hearts.user_id = caller_id
  ORDER BY window_rows.created_at DESC, window_rows.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION shadow_pin_private.get_my_feed_mode_impl()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION shadow_pin_private.set_my_feed_mode_impl(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION shadow_pin_private.list_my_connection_feed_impl(integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION shadow_pin_private.get_my_connection_feed_window_impl(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION shadow_pin_private.get_my_feed_mode_impl()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION shadow_pin_private.set_my_feed_mode_impl(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION shadow_pin_private.list_my_connection_feed_impl(integer, timestamptz, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION shadow_pin_private.get_my_connection_feed_window_impl(uuid)
  TO authenticated, service_role;

CREATE FUNCTION public.get_my_shadow_pin_feed_mode()
RETURNS TABLE (feed_mode text, revision integer, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM shadow_pin_private.get_my_feed_mode_impl();
$$;

CREATE FUNCTION public.set_my_shadow_pin_feed_mode(target_mode text)
RETURNS TABLE (feed_mode text, revision integer, updated_at timestamptz)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM shadow_pin_private.set_my_feed_mode_impl(target_mode);
$$;

CREATE FUNCTION public.list_my_shadow_pin_connection_feed(
  result_limit integer DEFAULT 30,
  before_created_at timestamptz DEFAULT NULL,
  before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  image_id uuid,
  created_at timestamptz,
  viewer_has_hearted boolean,
  has_more boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM shadow_pin_private.list_my_connection_feed_impl(
    result_limit,
    before_created_at,
    before_id
  );
$$;

CREATE FUNCTION public.get_my_shadow_pin_connection_feed_window(target_image_id uuid)
RETURNS TABLE (
  image_id uuid,
  created_at timestamptz,
  viewer_has_hearted boolean,
  window_position text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM shadow_pin_private.get_my_connection_feed_window_impl(target_image_id);
$$;

REVOKE ALL ON FUNCTION public.get_my_shadow_pin_feed_mode()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_my_shadow_pin_feed_mode(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_my_shadow_pin_connection_feed(integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_shadow_pin_connection_feed_window(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_shadow_pin_feed_mode()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_my_shadow_pin_feed_mode(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_shadow_pin_connection_feed(integer, timestamptz, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_shadow_pin_connection_feed_window(uuid)
  TO authenticated, service_role;

COMMENT ON TABLE public.shadow_pin_feed_preferences IS
  'Owner-private, account-synced ShadowPin home mode. Browser roles use guarded RPCs only.';
COMMENT ON FUNCTION public.list_my_shadow_pin_connection_feed(integer, timestamptz, uuid) IS
  'Returns a bounded keyset page of RLS-visible Pin IDs created by accepted, unblocked Connections.';
COMMENT ON FUNCTION public.get_my_shadow_pin_connection_feed_window(uuid) IS
  'Returns an eligible Connections-feed target and its nearest newer and older neighbors.';

COMMIT;
