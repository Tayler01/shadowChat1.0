/*
  # ShadowChat 2.0 Connections foundation

  Reciprocal member Connections are stored as one canonical pair. Normal
  lifecycle transitions are retained as pending, accepted, or inactive rows so
  request retries and notification invalidation remain deterministic. A personal
  block is the privacy exception: it hard-deletes the pair and suppresses its
  unread connection events, so unblocking never restores or leaks a relationship.

  Public browser RPCs remain SECURITY INVOKER. Owner-checked implementations
  live in an unexposed schema because the browser receives no direct table
  privileges. Connection notification_events are the live refresh signal; this
  table is intentionally not added to the Realtime publication.
*/

BEGIN;

CREATE SCHEMA IF NOT EXISTS connections_private;

REVOKE ALL ON SCHEMA connections_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA connections_private TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA connections_private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE public.user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_low_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  member_high_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'inactive')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  requested_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_connections_canonical_pair_check
    CHECK (member_low_id < member_high_id),
  CONSTRAINT user_connections_requester_is_member_check
    CHECK (requested_by IN (member_low_id, member_high_id)),
  CONSTRAINT user_connections_status_timestamps_check CHECK (
    (status = 'pending' AND accepted_at IS NULL AND ended_at IS NULL)
    OR (status = 'accepted' AND accepted_at IS NOT NULL AND ended_at IS NULL)
    OR (status = 'inactive' AND ended_at IS NOT NULL)
  ),
  CONSTRAINT user_connections_pair_key UNIQUE (member_low_id, member_high_id)
);

COMMENT ON TABLE public.user_connections IS
  'Private reciprocal connection pairs. Normal lifecycle transitions stay as pending, accepted, or inactive; personal blocking hard-deletes the pair.';
COMMENT ON COLUMN public.user_connections.revision IS
  'Monotonic pair revision used for optimistic state and notification deduplication.';

CREATE INDEX user_connections_low_active_idx
  ON public.user_connections (member_low_id, status, updated_at DESC, id)
  WHERE status IN ('pending', 'accepted');
CREATE INDEX user_connections_high_active_idx
  ON public.user_connections (member_high_id, status, updated_at DESC, id)
  WHERE status IN ('pending', 'accepted');
CREATE INDEX user_connections_outgoing_pending_idx
  ON public.user_connections (requested_by, requested_at DESC, id)
  WHERE status = 'pending';

ALTER TABLE public.user_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_connections
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.user_connections TO service_role;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS connection_notifications_enabled boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS notification_events_unread_connection_entity_idx
  ON public.notification_events (entity_id)
  WHERE read_at IS NULL
    AND type IN ('connection_request', 'connection_accepted', 'connection_changed');

CREATE OR REPLACE FUNCTION private.users_are_connected(
  first_user_id uuid,
  second_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN first_user_id IS NULL
      OR second_user_id IS NULL
      OR first_user_id = second_user_id
      THEN false
    WHEN private.users_have_block(first_user_id, second_user_id)
      THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.user_connections connections
      WHERE connections.member_low_id = least(first_user_id, second_user_id)
        AND connections.member_high_id = greatest(first_user_id, second_user_id)
        AND connections.status = 'accepted'
    )
  END;
$$;

REVOKE ALL ON FUNCTION private.users_are_connected(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.users_are_connected(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION private.users_are_connected(uuid, uuid) IS
  'Private reciprocal accepted-connection check for later Connection feeds and Inner Circles enforcement.';

CREATE FUNCTION connections_private.emit_connection_notification(
  connection_row public.user_connections,
  recipient_id uuid,
  actor_id uuid,
  event_type text,
  change_kind text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  actor_profile jsonb;
  notification_enabled boolean;
BEGIN
  IF event_type NOT IN ('connection_request', 'connection_accepted', 'connection_changed') THEN
    RAISE EXCEPTION 'Unsupported connection notification type';
  END IF;

  IF recipient_id IS NULL OR actor_id IS NULL OR recipient_id = actor_id THEN
    RETURN;
  END IF;

  IF private.users_have_block(recipient_id, actor_id) THEN
    RETURN;
  END IF;

  SELECT public.user_public_profile_json(profiles)
  INTO actor_profile
  FROM public.users profiles
  WHERE profiles.id = actor_id;

  IF actor_profile IS NULL THEN
    RETURN;
  END IF;

  SELECT preferences.connection_notifications_enabled
  INTO notification_enabled
  FROM public.notification_preferences preferences
  WHERE preferences.user_id = recipient_id;

  INSERT INTO public.notification_events (
    user_id,
    type,
    entity_id,
    payload,
    dedupe_key
  ) VALUES (
    recipient_id,
    event_type,
    connection_row.id,
    jsonb_strip_nulls(jsonb_build_object(
      'connection_id', connection_row.id,
      'revision', connection_row.revision,
      'status', connection_row.status,
      'change', change_kind,
      'actor', actor_profile,
      'notify', CASE
        WHEN event_type = 'connection_changed' THEN false
        ELSE coalesce(notification_enabled, true)
      END,
      'url', '/?view=dms&panel=connections'
    )),
    event_type || ':' || connection_row.id::text || ':'
      || connection_row.revision::text || ':' || recipient_id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION connections_private.emit_connection_notification(
  public.user_connections, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION connections_private.get_my_connection_state_impl(
  target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  connection_row public.user_connections%ROWTYPE;
  direction text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF target_user_id IS NULL OR target_user_id = caller_id THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  IF private.users_have_block(caller_id, target_user_id) THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  SELECT connections.*
  INTO connection_row
  FROM public.user_connections connections
  WHERE connections.member_low_id = least(caller_id, target_user_id)
    AND connections.member_high_id = greatest(caller_id, target_user_id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  direction := CASE
    WHEN connection_row.status = 'accepted' THEN 'connected'
    WHEN connection_row.status = 'pending' AND connection_row.requested_by = caller_id THEN 'outgoing'
    WHEN connection_row.status = 'pending' THEN 'incoming'
    ELSE 'none'
  END;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'connection_id', connection_row.id,
    'other_user_id', target_user_id,
    'status', connection_row.status,
    'direction', direction,
    'requested_by', connection_row.requested_by,
    'revision', connection_row.revision,
    'requested_at', connection_row.requested_at,
    'accepted_at', connection_row.accepted_at,
    'ended_at', connection_row.ended_at,
    'updated_at', connection_row.updated_at,
    'retry_after', CASE
      WHEN connection_row.status = 'inactive'
        THEN connection_row.ended_at + interval '24 hours'
      ELSE NULL
    END
  ));
END;
$$;

CREATE FUNCTION connections_private.get_my_connection_summary_impl()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  accepted_count integer;
  incoming_count integer;
  outgoing_count integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    count(*) FILTER (WHERE connections.status = 'accepted')::integer,
    count(*) FILTER (
      WHERE connections.status = 'pending'
        AND connections.requested_by <> caller_id
    )::integer,
    count(*) FILTER (
      WHERE connections.status = 'pending'
        AND connections.requested_by = caller_id
    )::integer
  INTO accepted_count, incoming_count, outgoing_count
  FROM public.user_connections connections
  WHERE caller_id IN (connections.member_low_id, connections.member_high_id)
    AND connections.status IN ('pending', 'accepted')
    AND NOT private.users_have_block(
      caller_id,
      CASE
        WHEN connections.member_low_id = caller_id THEN connections.member_high_id
        ELSE connections.member_low_id
      END
    );

  RETURN jsonb_build_object(
    'connections', coalesce(accepted_count, 0),
    'incoming', coalesce(incoming_count, 0),
    'outgoing', coalesce(outgoing_count, 0)
  );
END;
$$;

CREATE FUNCTION connections_private.list_my_connections_impl(
  target_scope text DEFAULT 'accepted',
  result_limit integer DEFAULT 30,
  before_updated_at timestamptz DEFAULT NULL,
  before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  connection_id uuid,
  other_user jsonb,
  status text,
  direction text,
  revision integer,
  requested_at timestamptz,
  accepted_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_scope text := lower(trim(coalesce(target_scope, 'accepted')));
  bounded_limit integer := greatest(1, least(coalesce(result_limit, 30), 50));
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF normalized_scope NOT IN ('accepted', 'incoming', 'outgoing', 'all') THEN
    RAISE EXCEPTION 'Connection scope must be accepted, incoming, outgoing, or all';
  END IF;

  IF (before_updated_at IS NULL) <> (before_id IS NULL) THEN
    RAISE EXCEPTION 'Connection cursor must include both updated_at and id';
  END IF;

  RETURN QUERY
  SELECT
    connections.id,
    public.user_public_profile_json(other_profile),
    connections.status,
    CASE
      WHEN connections.status = 'accepted' THEN 'connected'
      WHEN connections.requested_by = caller_id THEN 'outgoing'
      ELSE 'incoming'
    END,
    connections.revision,
    connections.requested_at,
    connections.accepted_at,
    connections.updated_at
  FROM public.user_connections connections
  JOIN public.users other_profile
    ON other_profile.id = CASE
      WHEN connections.member_low_id = caller_id THEN connections.member_high_id
      ELSE connections.member_low_id
    END
  WHERE caller_id IN (connections.member_low_id, connections.member_high_id)
    AND connections.status IN ('pending', 'accepted')
    AND NOT private.users_have_block(caller_id, other_profile.id)
    AND (
      normalized_scope = 'all'
      OR (normalized_scope = 'accepted' AND connections.status = 'accepted')
      OR (
        normalized_scope = 'incoming'
        AND connections.status = 'pending'
        AND connections.requested_by <> caller_id
      )
      OR (
        normalized_scope = 'outgoing'
        AND connections.status = 'pending'
        AND connections.requested_by = caller_id
      )
    )
    AND (
      before_updated_at IS NULL
      OR (connections.updated_at, connections.id) < (before_updated_at, before_id)
    )
  ORDER BY connections.updated_at DESC, connections.id DESC
  LIMIT bounded_limit;
END;
$$;

CREATE FUNCTION connections_private.mutate_connection_impl(
  target_user_id uuid,
  target_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_action text := lower(trim(coalesce(target_action, '')));
  low_id uuid;
  high_id uuid;
  connection_row public.user_connections%ROWTYPE;
  recipient_id uuid;
  change_kind text;
  outgoing_pending_count integer;
  connection_exists boolean := false;
  changed boolean := false;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF target_user_id IS NULL OR target_user_id = caller_id THEN
    RAISE EXCEPTION 'A different member is required';
  END IF;

  IF normalized_action NOT IN ('request', 'accept', 'decline', 'cancel', 'remove') THEN
    RAISE EXCEPTION 'Unsupported connection action';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users profiles WHERE profiles.id = target_user_id
  ) THEN
    RAISE EXCEPTION 'Member is unavailable';
  END IF;

  IF private.users_have_block(caller_id, target_user_id) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Connection is unavailable for this member';
  END IF;

  low_id := least(caller_id, target_user_id);
  high_id := greatest(caller_id, target_user_id);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(low_id::text || ':' || high_id::text, 0)
  );

  -- A block insert and a relationship mutation serialize on the same pair
  -- lock. Recheck after waiting so a request cannot land behind a committed
  -- block and become visible after a later unblock.
  IF private.users_have_block(caller_id, target_user_id) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Connection is unavailable for this member';
  END IF;

  SELECT connections.*
  INTO connection_row
  FROM public.user_connections connections
  WHERE connections.member_low_id = low_id
    AND connections.member_high_id = high_id
  FOR UPDATE;
  connection_exists := FOUND;

  IF normalized_action = 'request' THEN
    IF connection_exists AND connection_row.status = 'accepted' THEN
      NULL;
    ELSIF connection_exists
      AND connection_row.status = 'pending'
      AND connection_row.requested_by = caller_id THEN
      NULL;
    ELSIF connection_exists AND connection_row.status = 'pending' THEN
      UPDATE public.user_connections connections
      SET
        status = 'accepted',
        revision = connections.revision + 1,
        accepted_at = now(),
        ended_at = NULL,
        updated_at = now()
      WHERE connections.id = connection_row.id
      RETURNING connections.* INTO connection_row;
      changed := true;
      recipient_id := target_user_id;

      UPDATE public.notification_events events
      SET read_at = coalesce(events.read_at, now())
      WHERE events.read_at IS NULL
        AND events.type IN ('connection_request', 'connection_accepted', 'connection_changed')
        AND events.entity_id = connection_row.id;

      PERFORM connections_private.emit_connection_notification(
        connection_row, recipient_id, caller_id, 'connection_accepted', 'accepted'
      );
    ELSE
      IF connection_exists
        AND connection_row.status = 'inactive'
        AND connection_row.ended_at > now() - interval '24 hours' THEN
        RAISE EXCEPTION USING
          errcode = '55000',
          message = 'Connection request cooldown is active for this pair';
      END IF;

      -- Serialize the per-member outgoing capacity check across different
      -- target pairs so concurrent requests cannot all observe the same slot.
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('connection-outgoing:' || caller_id::text, 0)
      );

      SELECT count(*)::integer
      INTO outgoing_pending_count
      FROM public.user_connections connections
      WHERE connections.requested_by = caller_id
        AND connections.status = 'pending';

      IF outgoing_pending_count >= 50 THEN
        RAISE EXCEPTION USING
          errcode = '54000',
          message = 'Too many pending connection requests';
      END IF;

      IF connection_exists THEN
        UPDATE public.user_connections connections
        SET
          requested_by = caller_id,
          status = 'pending',
          revision = connections.revision + 1,
          requested_at = now(),
          accepted_at = NULL,
          ended_at = NULL,
          updated_at = now()
        WHERE connections.id = connection_row.id
        RETURNING connections.* INTO connection_row;
      ELSE
        INSERT INTO public.user_connections (
          member_low_id,
          member_high_id,
          requested_by
        ) VALUES (
          low_id,
          high_id,
          caller_id
        )
        RETURNING * INTO connection_row;
      END IF;

      changed := true;
      recipient_id := target_user_id;
      PERFORM connections_private.emit_connection_notification(
        connection_row, recipient_id, caller_id, 'connection_request', 'requested'
      );
    END IF;
  ELSIF normalized_action = 'accept' THEN
    IF NOT connection_exists THEN
      RAISE EXCEPTION 'Connection request was not found';
    ELSIF connection_row.status = 'accepted' THEN
      NULL;
    ELSIF connection_row.status <> 'pending' OR connection_row.requested_by <> target_user_id THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'Only the request recipient can accept';
    ELSE
      UPDATE public.user_connections connections
      SET
        status = 'accepted',
        revision = connections.revision + 1,
        accepted_at = now(),
        ended_at = NULL,
        updated_at = now()
      WHERE connections.id = connection_row.id
      RETURNING connections.* INTO connection_row;
      changed := true;
      recipient_id := target_user_id;

      UPDATE public.notification_events events
      SET read_at = coalesce(events.read_at, now())
      WHERE events.read_at IS NULL
        AND events.type IN ('connection_request', 'connection_accepted', 'connection_changed')
        AND events.entity_id = connection_row.id;

      PERFORM connections_private.emit_connection_notification(
        connection_row, recipient_id, caller_id, 'connection_accepted', 'accepted'
      );
    END IF;
  ELSIF normalized_action IN ('decline', 'cancel') THEN
    IF NOT connection_exists THEN
      RAISE EXCEPTION 'Connection request was not found';
    ELSIF connection_row.status = 'inactive' THEN
      NULL;
    ELSIF connection_row.status <> 'pending' THEN
      RAISE EXCEPTION 'Only a pending request can be declined or cancelled';
    ELSIF normalized_action = 'decline' AND connection_row.requested_by <> target_user_id THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'Only the request recipient can decline';
    ELSIF normalized_action = 'cancel' AND connection_row.requested_by <> caller_id THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'Only the requester can cancel';
    ELSE
      UPDATE public.user_connections connections
      SET
        status = 'inactive',
        revision = connections.revision + 1,
        ended_at = now(),
        updated_at = now()
      WHERE connections.id = connection_row.id
      RETURNING connections.* INTO connection_row;
      changed := true;
      recipient_id := target_user_id;
      change_kind := CASE
        WHEN normalized_action = 'decline' THEN 'declined'
        ELSE 'cancelled'
      END;

      UPDATE public.notification_events events
      SET read_at = coalesce(events.read_at, now())
      WHERE events.read_at IS NULL
        AND events.type IN ('connection_request', 'connection_accepted', 'connection_changed')
        AND events.entity_id = connection_row.id;

      PERFORM connections_private.emit_connection_notification(
        connection_row, recipient_id, caller_id, 'connection_changed', change_kind
      );
    END IF;
  ELSE
    IF NOT connection_exists THEN
      RAISE EXCEPTION 'Connection was not found';
    ELSIF connection_row.status = 'inactive' THEN
      NULL;
    ELSIF connection_row.status <> 'accepted' THEN
      RAISE EXCEPTION 'Only an accepted connection can be removed';
    ELSE
      UPDATE public.user_connections connections
      SET
        status = 'inactive',
        revision = connections.revision + 1,
        ended_at = now(),
        updated_at = now()
      WHERE connections.id = connection_row.id
      RETURNING connections.* INTO connection_row;
      changed := true;
      recipient_id := target_user_id;

      UPDATE public.notification_events events
      SET read_at = coalesce(events.read_at, now())
      WHERE events.read_at IS NULL
        AND events.type IN ('connection_request', 'connection_accepted', 'connection_changed')
        AND events.entity_id = connection_row.id;

      PERFORM connections_private.emit_connection_notification(
        connection_row, recipient_id, caller_id, 'connection_changed', 'removed'
      );
    END IF;
  END IF;


  IF changed THEN
    PERFORM connections_private.emit_connection_notification(
      connection_row,
      caller_id,
      target_user_id,
      'connection_changed',
      coalesce(
        change_kind,
        CASE
          WHEN connection_row.status = 'accepted' THEN 'accepted'
          WHEN connection_row.status = 'pending' THEN 'requested'
          ELSE 'changed'
        END
      )
    );
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'connection_id', connection_row.id,
    'other_user_id', target_user_id,
    'status', connection_row.status,
    'direction', CASE
      WHEN connection_row.status = 'accepted' THEN 'connected'
      WHEN connection_row.status = 'pending' AND connection_row.requested_by = caller_id THEN 'outgoing'
      WHEN connection_row.status = 'pending' THEN 'incoming'
      ELSE 'none'
    END,
    'requested_by', connection_row.requested_by,
    'revision', connection_row.revision,
    'requested_at', connection_row.requested_at,
    'accepted_at', connection_row.accepted_at,
    'ended_at', connection_row.ended_at,
    'updated_at', connection_row.updated_at,
    'changed', changed,
    'retry_after', CASE
      WHEN connection_row.status = 'inactive'
        THEN connection_row.ended_at + interval '24 hours'
      ELSE NULL
    END
  ));
END;
$$;

CREATE FUNCTION connections_private.remove_connection_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  removed_connection_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(new.blocker_id, new.blocked_id)::text || ':'
        || greatest(new.blocker_id, new.blocked_id)::text,
      0
    )
  );

  DELETE FROM public.user_connections connections
  WHERE connections.member_low_id = least(new.blocker_id, new.blocked_id)
    AND connections.member_high_id = greatest(new.blocker_id, new.blocked_id)
  RETURNING connections.id INTO removed_connection_id;

  IF removed_connection_id IS NOT NULL THEN
    UPDATE public.notification_events events
    SET read_at = coalesce(events.read_at, now())
    WHERE events.read_at IS NULL
      AND events.type IN ('connection_request', 'connection_accepted', 'connection_changed')
      AND events.entity_id = removed_connection_id;
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION connections_private.get_my_connection_state_impl(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION connections_private.get_my_connection_summary_impl()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION connections_private.list_my_connections_impl(
  text, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION connections_private.mutate_connection_impl(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION connections_private.remove_connection_on_block()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION connections_private.get_my_connection_state_impl(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION connections_private.get_my_connection_summary_impl()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION connections_private.list_my_connections_impl(
  text, integer, timestamptz, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION connections_private.mutate_connection_impl(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_connection_state(target_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT connections_private.get_my_connection_state_impl(target_user_id);
$$;

CREATE OR REPLACE FUNCTION public.get_my_connection_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT connections_private.get_my_connection_summary_impl();
$$;

CREATE OR REPLACE FUNCTION public.list_my_connections(
  target_scope text DEFAULT 'accepted',
  result_limit integer DEFAULT 30,
  before_updated_at timestamptz DEFAULT NULL,
  before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  connection_id uuid,
  other_user jsonb,
  status text,
  direction text,
  revision integer,
  requested_at timestamptz,
  accepted_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM connections_private.list_my_connections_impl(
    target_scope,
    result_limit,
    before_updated_at,
    before_id
  );
$$;

CREATE OR REPLACE FUNCTION public.mutate_connection(
  target_user_id uuid,
  target_action text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT connections_private.mutate_connection_impl(target_user_id, target_action);
$$;

REVOKE ALL ON FUNCTION public.get_my_connection_state(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_connection_summary()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_my_connections(text, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mutate_connection(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_connection_state(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_connection_summary()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_connections(text, integer, timestamptz, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mutate_connection(uuid, text)
  TO authenticated, service_role;

DROP TRIGGER IF EXISTS remove_connection_on_personal_block
  ON public.user_blocks;
CREATE TRIGGER remove_connection_on_personal_block
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW EXECUTE FUNCTION connections_private.remove_connection_on_block();

COMMENT ON FUNCTION public.mutate_connection(uuid, text) IS
  'Invoker wrapper for request, accept, decline, cancel, and remove actions. Inactive pairs have a 24-hour re-request cooldown; crossing requests auto-accept.';
COMMENT ON FUNCTION public.list_my_connections(text, integer, timestamptz, uuid) IS
  'Returns a bounded keyset page of caller-owned accepted, incoming, outgoing, or all active connection rows.';

COMMIT;
