/*
  # ShadowChat 2.0 Inner Circles foundation

  Inner Circles are owner-private groupings of currently accepted, unblocked
  Connections. Browser roles receive no direct table privileges. Guarded
  caller-scoped RPCs own every read and mutation, and lifecycle triggers
  hard-delete memberships when a Connection ends or either member blocks the
  other. Reconnecting never restores a prior membership.

  Circle-scoped ShadowPin RPCs only narrow the existing Connections feed. They
  return Pin identities and viewer heart state; existing ShadowPin RLS remains
  authoritative for the exact media rows loaded by the browser.
*/

BEGIN;

CREATE SCHEMA IF NOT EXISTS inner_circles_private;

REVOKE ALL ON SCHEMA inner_circles_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA inner_circles_private TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA inner_circles_private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE public.inner_circles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_key text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inner_circles_name_check CHECK (
    name = btrim(name)
    AND char_length(name) BETWEEN 1 AND 40
    AND octet_length(name) <= 160
    AND name !~ '[[:cntrl:]]'
  ),
  CONSTRAINT inner_circles_owner_name_key UNIQUE (owner_id, name_key)
);

CREATE TABLE public.inner_circle_members (
  circle_id uuid NOT NULL REFERENCES public.inner_circles(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inner_circle_members_pkey PRIMARY KEY (circle_id, member_id)
);

CREATE INDEX inner_circles_owner_updated_idx
  ON public.inner_circles (owner_id, updated_at DESC, id DESC);

CREATE INDEX inner_circle_members_circle_added_idx
  ON public.inner_circle_members (circle_id, added_at DESC, member_id DESC);

CREATE INDEX inner_circle_members_member_circle_idx
  ON public.inner_circle_members (member_id, circle_id);

ALTER TABLE public.inner_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inner_circle_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.inner_circles
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.inner_circle_members
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.inner_circles TO service_role;
GRANT SELECT ON TABLE public.inner_circle_members TO service_role;

COMMENT ON TABLE public.inner_circles IS
  'Owner-private Inner Circles. Browser roles use guarded caller-scoped RPCs only.';
COMMENT ON TABLE public.inner_circle_members IS
  'Owner-private Inner Circle membership keyed by circle and accepted Connection member.';

CREATE FUNCTION inner_circles_private.guard_membership_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  circle_owner_id uuid;
  current_member_count integer;
BEGIN
  SELECT circles.owner_id
  INTO circle_owner_id
  FROM public.inner_circles circles
  WHERE circles.id = NEW.circle_id;

  IF circle_owner_id IS NULL THEN
    RAISE EXCEPTION 'Inner Circle is unavailable';
  END IF;

  IF NEW.member_id IS NULL OR NEW.member_id = circle_owner_id THEN
    RAISE EXCEPTION 'A different Connection is required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(circle_owner_id, NEW.member_id)::text || ':'
        || greatest(circle_owner_id, NEW.member_id)::text,
      0
    )
  );

  SELECT circles.owner_id
  INTO circle_owner_id
  FROM public.inner_circles circles
  WHERE circles.id = NEW.circle_id
  FOR UPDATE;

  IF circle_owner_id IS NULL THEN
    RAISE EXCEPTION 'Inner Circle is unavailable';
  END IF;

  IF NOT private.users_are_connected(circle_owner_id, NEW.member_id) THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Connection is unavailable for this Inner Circle';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inner_circle_members memberships
    WHERE memberships.circle_id = NEW.circle_id
      AND memberships.member_id = NEW.member_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer
  INTO current_member_count
  FROM public.inner_circle_members memberships
  WHERE memberships.circle_id = NEW.circle_id;

  IF current_member_count >= 50 THEN
    RAISE EXCEPTION USING
      errcode = '54000',
      message = 'An Inner Circle can contain at most 50 Connections';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION inner_circles_private.guard_membership_insert()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER inner_circle_members_guard_insert
  BEFORE INSERT ON public.inner_circle_members
  FOR EACH ROW
  EXECUTE FUNCTION inner_circles_private.guard_membership_insert();

CREATE FUNCTION inner_circles_private.teardown_pair_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  first_user_id uuid;
  second_user_id uuid;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' THEN
    RAISE EXCEPTION 'Unsupported Inner Circle lifecycle source';
  END IF;

  IF TG_TABLE_NAME = 'user_blocks' AND TG_OP = 'INSERT' THEN
    first_user_id := NEW.blocker_id;
    second_user_id := NEW.blocked_id;
  ELSIF TG_TABLE_NAME = 'user_connections' AND TG_OP IN ('UPDATE', 'DELETE') THEN
    first_user_id := OLD.member_low_id;
    second_user_id := OLD.member_high_id;
  ELSE
    RAISE EXCEPTION 'Unsupported Inner Circle lifecycle source';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(first_user_id, second_user_id)::text || ':'
        || greatest(first_user_id, second_user_id)::text,
      0
    )
  );

  WITH removed_memberships AS (
    DELETE FROM public.inner_circle_members memberships
    USING public.inner_circles circles
    WHERE memberships.circle_id = circles.id
      AND (
        (circles.owner_id = first_user_id AND memberships.member_id = second_user_id)
        OR
        (circles.owner_id = second_user_id AND memberships.member_id = first_user_id)
      )
    RETURNING memberships.circle_id
  ), affected_circles AS (
    SELECT DISTINCT removed.circle_id
    FROM removed_memberships removed
  )
  UPDATE public.inner_circles circles
  SET revision = circles.revision + 1,
      updated_at = now()
  FROM affected_circles affected
  WHERE circles.id = affected.circle_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION inner_circles_private.teardown_pair_memberships()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION inner_circles_private.list_my_inner_circles_impl()
RETURNS TABLE (
  id uuid,
  name text,
  revision integer,
  member_count integer,
  created_at timestamptz,
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
    circles.id,
    circles.name,
    circles.revision,
    count(memberships.member_id) FILTER (
      WHERE private.users_are_connected(caller_id, memberships.member_id)
    )::integer,
    circles.created_at,
    circles.updated_at
  FROM public.inner_circles circles
  LEFT JOIN public.inner_circle_members memberships
    ON memberships.circle_id = circles.id
  WHERE circles.owner_id = caller_id
  GROUP BY circles.id
  ORDER BY circles.created_at ASC, circles.id ASC;
END;
$$;

CREATE FUNCTION inner_circles_private.list_my_inner_circle_members_impl(
  target_circle_id uuid
)
RETURNS TABLE (
  circle_id uuid,
  member_id uuid,
  added_at timestamptz,
  profile jsonb
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

  IF target_circle_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.inner_circles circles
    WHERE circles.id = target_circle_id
      AND circles.owner_id = caller_id
  ) THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Inner Circle is unavailable';
  END IF;

  RETURN QUERY
  SELECT
    memberships.circle_id,
    memberships.member_id,
    memberships.added_at,
    public.user_public_profile_json(profiles)
  FROM public.inner_circle_members memberships
  JOIN public.users profiles
    ON profiles.id = memberships.member_id
  WHERE memberships.circle_id = target_circle_id
    AND private.users_are_connected(caller_id, memberships.member_id)
  ORDER BY memberships.added_at DESC, memberships.member_id DESC;
END;
$$;

CREATE FUNCTION inner_circles_private.mutate_my_inner_circle_impl(
  target_circle_id uuid,
  target_action text,
  target_name text,
  expected_revision integer
)
RETURNS TABLE (
  id uuid,
  name text,
  revision integer,
  member_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  changed boolean,
  deleted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_action text := lower(btrim(coalesce(target_action, '')));
  normalized_name text := regexp_replace(btrim(coalesce(target_name, '')), '[[:space:]]+', ' ', 'g');
  circle_row public.inner_circles%ROWTYPE;
  owned_circle_count integer;
  circle_member_count integer;
  deletion_time timestamptz;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF target_circle_id IS NULL THEN
    RAISE EXCEPTION 'Inner Circle id is required';
  END IF;

  IF normalized_action NOT IN ('create', 'rename', 'delete') THEN
    RAISE EXCEPTION 'Inner Circle action must be create, rename, or delete';
  END IF;

  IF normalized_action IN ('create', 'rename') AND (
    char_length(normalized_name) NOT BETWEEN 1 AND 40
    OR octet_length(normalized_name) > 160
    OR normalized_name ~ '[[:cntrl:]]'
  ) THEN
    RAISE EXCEPTION 'Inner Circle name must be between 1 and 40 characters';
  END IF;

  IF normalized_action = 'create' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('inner-circles-owner:' || caller_id::text, 0)
    );

    SELECT circles.*
    INTO circle_row
    FROM public.inner_circles circles
    WHERE circles.id = target_circle_id
      AND circles.owner_id = caller_id;

    IF FOUND THEN
      SELECT count(*)::integer
      INTO circle_member_count
      FROM public.inner_circle_members memberships
      WHERE memberships.circle_id = circle_row.id;

      RETURN QUERY SELECT
        circle_row.id,
        circle_row.name,
        circle_row.revision,
        circle_member_count,
        circle_row.created_at,
        circle_row.updated_at,
        false,
        false;
      RETURN;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.inner_circles circles WHERE circles.id = target_circle_id
    ) THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'Inner Circle is unavailable';
    END IF;

    SELECT count(*)::integer
    INTO owned_circle_count
    FROM public.inner_circles circles
    WHERE circles.owner_id = caller_id;

    IF owned_circle_count >= 10 THEN
      RAISE EXCEPTION USING
        errcode = '54000',
        message = 'You can create at most 10 Inner Circles';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.inner_circles circles
      WHERE circles.owner_id = caller_id
        AND circles.name_key = lower(normalized_name)
    ) THEN
      RAISE EXCEPTION 'An Inner Circle with this name already exists';
    END IF;

    INSERT INTO public.inner_circles (id, owner_id, name)
    VALUES (target_circle_id, caller_id, normalized_name)
    RETURNING * INTO circle_row;

    RETURN QUERY SELECT
      circle_row.id,
      circle_row.name,
      circle_row.revision,
      0,
      circle_row.created_at,
      circle_row.updated_at,
      true,
      false;
    RETURN;
  END IF;

  SELECT circles.*
  INTO circle_row
  FROM public.inner_circles circles
  WHERE circles.id = target_circle_id
    AND circles.owner_id = caller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF normalized_action = 'delete' THEN
      RETURN QUERY SELECT
        target_circle_id,
        NULL::text,
        0,
        0,
        NULL::timestamptz,
        NULL::timestamptz,
        false,
        true;
      RETURN;
    END IF;
    RAISE EXCEPTION USING errcode = '42501', message = 'Inner Circle is unavailable';
  END IF;

  SELECT count(*)::integer
  INTO circle_member_count
  FROM public.inner_circle_members memberships
  WHERE memberships.circle_id = circle_row.id;

  IF normalized_action = 'rename' AND circle_row.name = normalized_name THEN
    RETURN QUERY SELECT
      circle_row.id,
      circle_row.name,
      circle_row.revision,
      circle_member_count,
      circle_row.created_at,
      circle_row.updated_at,
      false,
      false;
    RETURN;
  END IF;

  IF expected_revision IS NULL OR expected_revision <> circle_row.revision THEN
    RAISE EXCEPTION USING
      errcode = '40001',
      message = 'Inner Circle changed on another device';
  END IF;

  IF normalized_action = 'rename' THEN
    IF EXISTS (
      SELECT 1
      FROM public.inner_circles other_circle
      WHERE other_circle.owner_id = caller_id
        AND other_circle.name_key = lower(normalized_name)
        AND other_circle.id <> circle_row.id
    ) THEN
      RAISE EXCEPTION 'An Inner Circle with this name already exists';
    END IF;

    UPDATE public.inner_circles circles
    SET name = normalized_name,
        revision = circles.revision + 1,
        updated_at = now()
    WHERE circles.id = circle_row.id
    RETURNING circles.* INTO circle_row;

    RETURN QUERY SELECT
      circle_row.id,
      circle_row.name,
      circle_row.revision,
      circle_member_count,
      circle_row.created_at,
      circle_row.updated_at,
      true,
      false;
    RETURN;
  END IF;

  deletion_time := now();
  DELETE FROM public.inner_circles circles WHERE circles.id = circle_row.id;
  RETURN QUERY SELECT
    circle_row.id,
    circle_row.name,
    circle_row.revision + 1,
    0,
    circle_row.created_at,
    deletion_time,
    true,
    true;
END;
$$;

CREATE FUNCTION inner_circles_private.mutate_my_inner_circle_member_impl(
  target_circle_id uuid,
  target_member_id uuid,
  target_action text
)
RETURNS TABLE (
  circle_id uuid,
  member_id uuid,
  is_member boolean,
  revision integer,
  member_count integer,
  updated_at timestamptz,
  changed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_action text := lower(btrim(coalesce(target_action, '')));
  circle_row public.inner_circles%ROWTYPE;
  changed_count integer := 0;
  current_member_count integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF target_circle_id IS NULL OR target_member_id IS NULL THEN
    RAISE EXCEPTION 'Inner Circle and Connection are required';
  END IF;

  IF target_member_id = caller_id THEN
    RAISE EXCEPTION 'A different Connection is required';
  END IF;

  IF normalized_action NOT IN ('add', 'remove') THEN
    RAISE EXCEPTION 'Inner Circle member action must be add or remove';
  END IF;

  SELECT circles.*
  INTO circle_row
  FROM public.inner_circles circles
  WHERE circles.id = target_circle_id
    AND circles.owner_id = caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Inner Circle is unavailable';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(caller_id, target_member_id)::text || ':'
        || greatest(caller_id, target_member_id)::text,
      0
    )
  );

  SELECT circles.*
  INTO circle_row
  FROM public.inner_circles circles
  WHERE circles.id = target_circle_id
    AND circles.owner_id = caller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Inner Circle is unavailable';
  END IF;

  IF normalized_action = 'add' THEN
    INSERT INTO public.inner_circle_members (circle_id, member_id)
    VALUES (target_circle_id, target_member_id)
    ON CONFLICT ON CONSTRAINT inner_circle_members_pkey DO NOTHING;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
  ELSE
    DELETE FROM public.inner_circle_members memberships
    WHERE memberships.circle_id = target_circle_id
      AND memberships.member_id = target_member_id;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
  END IF;

  IF changed_count > 0 THEN
    UPDATE public.inner_circles circles
    SET revision = circles.revision + 1,
        updated_at = now()
    WHERE circles.id = target_circle_id
    RETURNING circles.* INTO circle_row;
  ELSE
    SELECT circles.*
    INTO circle_row
    FROM public.inner_circles circles
    WHERE circles.id = target_circle_id
      AND circles.owner_id = caller_id;
  END IF;

  SELECT count(*)::integer
  INTO current_member_count
  FROM public.inner_circle_members memberships
  WHERE memberships.circle_id = target_circle_id
    AND private.users_are_connected(caller_id, memberships.member_id);

  RETURN QUERY SELECT
    target_circle_id,
    target_member_id,
    EXISTS (
      SELECT 1
      FROM public.inner_circle_members memberships
      WHERE memberships.circle_id = target_circle_id
        AND memberships.member_id = target_member_id
        AND private.users_are_connected(caller_id, memberships.member_id)
    ),
    circle_row.revision,
    current_member_count,
    circle_row.updated_at,
    changed_count > 0;
END;
$$;

CREATE FUNCTION inner_circles_private.set_my_inner_circle_members_impl(
  target_circle_id uuid,
  target_member_ids uuid[]
)
RETURNS TABLE (
  circle_id uuid,
  revision integer,
  member_count integer,
  member_ids uuid[],
  updated_at timestamptz,
  changed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  circle_row public.inner_circles%ROWTYPE;
  normalized_member_ids uuid[];
  current_member_ids uuid[];
  lock_member_id uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF target_circle_id IS NULL OR target_member_ids IS NULL THEN
    RAISE EXCEPTION 'Inner Circle and Connections are required';
  END IF;

  IF array_position(target_member_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'Every Inner Circle member must be a Connection';
  END IF;

  SELECT coalesce(array_agg(requested.member_id ORDER BY requested.member_id), '{}'::uuid[])
  INTO normalized_member_ids
  FROM (
    SELECT DISTINCT target.member_id
    FROM unnest(target_member_ids) AS target(member_id)
  ) requested;

  IF cardinality(normalized_member_ids) > 50 THEN
    RAISE EXCEPTION USING
      errcode = '54000',
      message = 'An Inner Circle can contain at most 50 Connections';
  END IF;

  IF caller_id = ANY(normalized_member_ids) THEN
    RAISE EXCEPTION 'A different Connection is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inner_circles circles
    WHERE circles.id = target_circle_id
      AND circles.owner_id = caller_id
  ) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Inner Circle is unavailable';
  END IF;

  -- Match the Connections pair-lock key and acquire in UUID order. Lock both
  -- the requested and currently stored pairs so lifecycle teardown, single-row
  -- mutations, and an all-or-nothing picker Save cannot interleave.
  FOR lock_member_id IN
    SELECT candidates.member_id
    FROM (
      SELECT unnest(normalized_member_ids) AS member_id
      UNION
      SELECT memberships.member_id
      FROM public.inner_circle_members memberships
      WHERE memberships.circle_id = target_circle_id
    ) candidates
    ORDER BY candidates.member_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        least(caller_id, lock_member_id)::text || ':'
          || greatest(caller_id, lock_member_id)::text,
        0
      )
    );
  END LOOP;

  SELECT circles.*
  INTO circle_row
  FROM public.inner_circles circles
  WHERE circles.id = target_circle_id
    AND circles.owner_id = caller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Inner Circle is unavailable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(normalized_member_ids) AS requested(member_id)
    WHERE NOT private.users_are_connected(caller_id, requested.member_id)
  ) THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'One or more Connections are unavailable for this Inner Circle';
  END IF;

  SELECT coalesce(array_agg(memberships.member_id ORDER BY memberships.member_id), '{}'::uuid[])
  INTO current_member_ids
  FROM public.inner_circle_members memberships
  WHERE memberships.circle_id = target_circle_id;

  IF current_member_ids = normalized_member_ids THEN
    RETURN QUERY SELECT
      circle_row.id,
      circle_row.revision,
      cardinality(normalized_member_ids),
      normalized_member_ids,
      circle_row.updated_at,
      false;
    RETURN;
  END IF;

  DELETE FROM public.inner_circle_members memberships
  WHERE memberships.circle_id = target_circle_id
    AND NOT (memberships.member_id = ANY(normalized_member_ids));

  INSERT INTO public.inner_circle_members (circle_id, member_id)
  SELECT target_circle_id, requested.member_id
  FROM unnest(normalized_member_ids) AS requested(member_id)
  ON CONFLICT ON CONSTRAINT inner_circle_members_pkey DO NOTHING;

  UPDATE public.inner_circles circles
  SET revision = circles.revision + 1,
      updated_at = now()
  WHERE circles.id = target_circle_id
  RETURNING circles.* INTO circle_row;

  RETURN QUERY SELECT
    circle_row.id,
    circle_row.revision,
    cardinality(normalized_member_ids),
    normalized_member_ids,
    circle_row.updated_at,
    true;
END;
$$;

CREATE FUNCTION inner_circles_private.list_my_shadow_pin_circle_feed_impl(
  target_circle_id uuid,
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

  IF target_circle_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.inner_circles circles
    WHERE circles.id = target_circle_id
      AND circles.owner_id = caller_id
  ) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Inner Circle is unavailable';
  END IF;

  IF (before_created_at IS NULL) <> (before_id IS NULL) THEN
    RAISE EXCEPTION 'ShadowPin circle feed cursor must include both created_at and id';
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
  ), circle_creators AS MATERIALIZED (
    SELECT memberships.member_id AS creator_id
    FROM public.inner_circle_members memberships
    WHERE memberships.circle_id = target_circle_id
      AND private.users_are_connected(caller_id, memberships.member_id)
  ), per_creator_candidates AS (
    SELECT candidate.id, candidate.created_at
    FROM circle_creators creators
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

CREATE FUNCTION inner_circles_private.get_my_shadow_pin_circle_feed_window_impl(
  target_circle_id uuid,
  target_image_id uuid
)
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

  IF target_circle_id IS NULL OR target_image_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.inner_circles circles
    WHERE circles.id = target_circle_id
      AND circles.owner_id = caller_id
  ) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Inner Circle is unavailable';
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
  ), circle_creators AS MATERIALIZED (
    SELECT memberships.member_id AS creator_id
    FROM public.inner_circle_members memberships
    WHERE memberships.circle_id = target_circle_id
      AND private.users_are_connected(caller_id, memberships.member_id)
  ), target AS MATERIALIZED (
    SELECT images.id, images.created_at
    FROM public.shadow_pin_images images
    JOIN circle_creators creators
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
    CROSS JOIN circle_creators creators
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
    CROSS JOIN circle_creators creators
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

REVOKE ALL ON FUNCTION inner_circles_private.list_my_inner_circles_impl()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION inner_circles_private.list_my_inner_circle_members_impl(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION inner_circles_private.mutate_my_inner_circle_impl(uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION inner_circles_private.mutate_my_inner_circle_member_impl(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION inner_circles_private.set_my_inner_circle_members_impl(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION inner_circles_private.list_my_shadow_pin_circle_feed_impl(uuid, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION inner_circles_private.get_my_shadow_pin_circle_feed_window_impl(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION inner_circles_private.list_my_inner_circles_impl()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION inner_circles_private.list_my_inner_circle_members_impl(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION inner_circles_private.mutate_my_inner_circle_impl(uuid, text, text, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION inner_circles_private.mutate_my_inner_circle_member_impl(uuid, uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION inner_circles_private.set_my_inner_circle_members_impl(uuid, uuid[])
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION inner_circles_private.list_my_shadow_pin_circle_feed_impl(uuid, integer, timestamptz, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION inner_circles_private.get_my_shadow_pin_circle_feed_window_impl(uuid, uuid)
  TO authenticated, service_role;

CREATE FUNCTION public.list_my_inner_circles()
RETURNS TABLE (
  id uuid,
  name text,
  revision integer,
  member_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM inner_circles_private.list_my_inner_circles_impl();
$$;

CREATE FUNCTION public.list_my_inner_circle_members(target_circle_id uuid)
RETURNS TABLE (
  circle_id uuid,
  member_id uuid,
  added_at timestamptz,
  profile jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM inner_circles_private.list_my_inner_circle_members_impl(target_circle_id);
$$;

CREATE FUNCTION public.mutate_my_inner_circle(
  target_circle_id uuid,
  target_action text,
  target_name text,
  expected_revision integer
)
RETURNS TABLE (
  id uuid,
  name text,
  revision integer,
  member_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  changed boolean,
  deleted boolean
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM inner_circles_private.mutate_my_inner_circle_impl(
    target_circle_id,
    target_action,
    target_name,
    expected_revision
  );
$$;

CREATE FUNCTION public.mutate_my_inner_circle_member(
  target_circle_id uuid,
  target_member_id uuid,
  target_action text
)
RETURNS TABLE (
  circle_id uuid,
  member_id uuid,
  is_member boolean,
  revision integer,
  member_count integer,
  updated_at timestamptz,
  changed boolean
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM inner_circles_private.mutate_my_inner_circle_member_impl(
    target_circle_id,
    target_member_id,
    target_action
  );
$$;

CREATE FUNCTION public.set_my_inner_circle_members(
  target_circle_id uuid,
  target_member_ids uuid[]
)
RETURNS TABLE (
  circle_id uuid,
  revision integer,
  member_count integer,
  member_ids uuid[],
  updated_at timestamptz,
  changed boolean
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM inner_circles_private.set_my_inner_circle_members_impl(
    target_circle_id,
    target_member_ids
  );
$$;

CREATE FUNCTION public.list_my_shadow_pin_circle_feed(
  target_circle_id uuid,
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
  FROM inner_circles_private.list_my_shadow_pin_circle_feed_impl(
    target_circle_id,
    result_limit,
    before_created_at,
    before_id
  );
$$;

CREATE FUNCTION public.get_my_shadow_pin_circle_feed_window(
  target_circle_id uuid,
  target_image_id uuid
)
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
  FROM inner_circles_private.get_my_shadow_pin_circle_feed_window_impl(
    target_circle_id,
    target_image_id
  );
$$;

REVOKE ALL ON FUNCTION public.list_my_inner_circles()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_my_inner_circle_members(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mutate_my_inner_circle(uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mutate_my_inner_circle_member(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_my_inner_circle_members(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_my_shadow_pin_circle_feed(uuid, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_shadow_pin_circle_feed_window(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_my_inner_circles()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_inner_circle_members(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mutate_my_inner_circle(uuid, text, text, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mutate_my_inner_circle_member(uuid, uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_my_inner_circle_members(uuid, uuid[])
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_shadow_pin_circle_feed(uuid, integer, timestamptz, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_shadow_pin_circle_feed_window(uuid, uuid)
  TO authenticated, service_role;

CREATE TRIGGER inner_circles_teardown_on_connection_status
  AFTER UPDATE OF status ON public.user_connections
  FOR EACH ROW
  WHEN (OLD.status = 'accepted' AND NEW.status <> 'accepted')
  EXECUTE FUNCTION inner_circles_private.teardown_pair_memberships();

CREATE TRIGGER inner_circles_teardown_on_connection_delete
  AFTER DELETE ON public.user_connections
  FOR EACH ROW
  WHEN (OLD.status = 'accepted')
  EXECUTE FUNCTION inner_circles_private.teardown_pair_memberships();

CREATE TRIGGER inner_circles_teardown_on_personal_block
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW
  EXECUTE FUNCTION inner_circles_private.teardown_pair_memberships();

COMMENT ON FUNCTION public.list_my_inner_circles() IS
  'Returns the caller-owned Inner Circles with current accepted-Connection counts.';
COMMENT ON FUNCTION public.list_my_inner_circle_members(uuid) IS
  'Returns API-safe profiles for current accepted Connections in one caller-owned Inner Circle.';
COMMENT ON FUNCTION public.set_my_inner_circle_members(uuid, uuid[]) IS
  'Atomically replaces one caller-owned Inner Circle member set after validating every requested Connection.';
COMMENT ON FUNCTION public.list_my_shadow_pin_circle_feed(uuid, integer, timestamptz, uuid) IS
  'Returns a bounded keyset page that narrows the existing Connections feed to one caller-owned Inner Circle.';
COMMENT ON FUNCTION public.get_my_shadow_pin_circle_feed_window(uuid, uuid) IS
  'Returns an eligible Inner Circle feed target and its nearest newer and older neighbors.';

COMMIT;
