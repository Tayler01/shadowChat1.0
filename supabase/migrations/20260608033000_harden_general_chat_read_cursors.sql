-- Keep General Chat read cursors anchored to real, readable chat messages.
-- A cursor that points at a local/system-only row can leave clients waiting for
-- an anchor that will never arrive on initial load.

WITH cursor_replacements AS (
  SELECT
    cursor_row.user_id,
    cursor_row.surface,
    cursor_row.scope_id,
    replacement_message.id AS replacement_message_id,
    replacement_message.created_at AS replacement_created_at
  FROM public.user_read_cursors cursor_row
  LEFT JOIN public.messages current_message
    ON current_message.id = cursor_row.last_read_message_id
  CROSS JOIN LATERAL (
    SELECT
      message_row.id,
      message_row.created_at
    FROM public.messages message_row
    WHERE message_row.pinned = false
      AND message_row.message_type <> 'hype'
      AND message_row.created_at <= cursor_row.last_read_at
    ORDER BY message_row.created_at DESC, message_row.id DESC
    LIMIT 1
  ) replacement_message
  WHERE cursor_row.surface = 'general_chat'
    AND cursor_row.last_read_message_id IS NOT NULL
    AND (
      current_message.id IS NULL
      OR current_message.message_type = 'hype'
    )
)
UPDATE public.user_read_cursors cursor_row
SET
  last_read_message_id = cursor_replacements.replacement_message_id,
  last_read_at = cursor_replacements.replacement_created_at,
  updated_at = now()
FROM cursor_replacements
WHERE cursor_row.user_id = cursor_replacements.user_id
  AND cursor_row.surface = cursor_replacements.surface
  AND cursor_row.scope_id = cursor_replacements.scope_id;

UPDATE public.messages
SET content = 'hyped'
WHERE message_type = 'hype'
  AND content = 'rang Hype';

CREATE OR REPLACE FUNCTION public.set_user_read_cursor(
  target_surface text,
  target_scope_id text,
  target_last_read_message_id uuid,
  target_last_read_at timestamptz DEFAULT now()
)
RETURNS TABLE (
  user_id uuid,
  surface text,
  scope_id text,
  last_read_message_id uuid,
  last_read_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  normalized_scope_id text := coalesce(nullif(target_scope_id, ''), 'main');
  normalized_last_read_message_id uuid := target_last_read_message_id;
  normalized_last_read_at timestamptz := coalesce(target_last_read_at, now());
  min_uuid uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF target_surface IS NULL OR target_surface !~ '^[a-z0-9_:-]{1,80}$' THEN
    RAISE EXCEPTION 'Invalid read cursor surface';
  END IF;

  IF char_length(normalized_scope_id) < 1 OR char_length(normalized_scope_id) > 160 THEN
    RAISE EXCEPTION 'Invalid read cursor scope';
  END IF;

  IF target_surface = 'general_chat' THEN
    IF target_last_read_message_id IS NULL THEN
      RETURN QUERY
      SELECT
        cursor_row.user_id,
        cursor_row.surface,
        cursor_row.scope_id,
        cursor_row.last_read_message_id,
        cursor_row.last_read_at,
        cursor_row.updated_at
      FROM public.user_read_cursors cursor_row
      WHERE cursor_row.user_id = current_user_id
        AND cursor_row.surface = target_surface
        AND cursor_row.scope_id = normalized_scope_id
      LIMIT 1;
      RETURN;
    END IF;

    normalized_last_read_message_id := NULL;

    SELECT
      message_row.id,
      message_row.created_at
    INTO
      normalized_last_read_message_id,
      normalized_last_read_at
    FROM public.messages message_row
    WHERE message_row.id = target_last_read_message_id
      AND message_row.pinned = false
      AND message_row.message_type <> 'hype'
    LIMIT 1;

    IF normalized_last_read_message_id IS NULL THEN
      RETURN QUERY
      SELECT
        cursor_row.user_id,
        cursor_row.surface,
        cursor_row.scope_id,
        cursor_row.last_read_message_id,
        cursor_row.last_read_at,
        cursor_row.updated_at
      FROM public.user_read_cursors cursor_row
      WHERE cursor_row.user_id = current_user_id
        AND cursor_row.surface = target_surface
        AND cursor_row.scope_id = normalized_scope_id
      LIMIT 1;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH upserted_cursor AS (
    INSERT INTO public.user_read_cursors (
      user_id,
      surface,
      scope_id,
      last_read_message_id,
      last_read_at
    )
    VALUES (
      current_user_id,
      target_surface,
      normalized_scope_id,
      normalized_last_read_message_id,
      normalized_last_read_at
    )
    ON CONFLICT ON CONSTRAINT user_read_cursors_pkey DO UPDATE
    SET
      last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = EXCLUDED.last_read_at,
      updated_at = now()
    WHERE (EXCLUDED.last_read_at, COALESCE(EXCLUDED.last_read_message_id, min_uuid))
      > (
        public.user_read_cursors.last_read_at,
        COALESCE(public.user_read_cursors.last_read_message_id, min_uuid)
      )
    RETURNING
      public.user_read_cursors.user_id,
      public.user_read_cursors.surface,
      public.user_read_cursors.scope_id,
      public.user_read_cursors.last_read_message_id,
      public.user_read_cursors.last_read_at,
      public.user_read_cursors.updated_at
  ),
  existing_cursor AS (
    SELECT
      cursor_row.user_id,
      cursor_row.surface,
      cursor_row.scope_id,
      cursor_row.last_read_message_id,
      cursor_row.last_read_at,
      cursor_row.updated_at
    FROM public.user_read_cursors cursor_row
    WHERE cursor_row.user_id = current_user_id
      AND cursor_row.surface = target_surface
      AND cursor_row.scope_id = normalized_scope_id
      AND NOT EXISTS (SELECT 1 FROM upserted_cursor)
    LIMIT 1
  )
  SELECT
    upserted_cursor.user_id,
    upserted_cursor.surface,
    upserted_cursor.scope_id,
    upserted_cursor.last_read_message_id,
    upserted_cursor.last_read_at,
    upserted_cursor.updated_at
  FROM upserted_cursor

  UNION ALL

  SELECT
    existing_cursor.user_id,
    existing_cursor.surface,
    existing_cursor.scope_id,
    existing_cursor.last_read_message_id,
    existing_cursor.last_read_at,
    existing_cursor.updated_at
  FROM existing_cursor;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.ring_hype_bell()
RETURNS SETOF public.hype_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  actor_meta jsonb;
  inserted_event public.hype_events%ROWTYPE;
BEGIN
  PERFORM public.ensure_can_use_hype(current_user_id);

  actor_meta := public.hype_actor_metadata(current_user_id);

  INSERT INTO public.hype_events (
    actor_id,
    event_type,
    metadata
  )
  VALUES (
    current_user_id,
    'bell',
    COALESCE(actor_meta, '{}'::jsonb) || jsonb_build_object(
      'kind', 'bell',
      'title', COALESCE(actor_meta->>'actor_display_name', 'Someone') || ' hyped',
      'summary', COALESCE(actor_meta->>'actor_display_name', 'Someone') || ' hyped'
    )
  )
  RETURNING * INTO inserted_event;

  INSERT INTO public.messages (
    user_id,
    content,
    message_type,
    reactions
  )
  VALUES (
    current_user_id,
    'hyped',
    'hype',
    '{}'::jsonb
  );

  RETURN NEXT inserted_event;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ring_hype_bell() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ring_hype_bell() TO authenticated;
