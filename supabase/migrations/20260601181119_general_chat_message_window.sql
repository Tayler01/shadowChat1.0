/*
  # General Chat message windows

  Adds an RLS-preserving RPC for loading bounded chronological windows around a
  deep-link target, stored read cursor, timestamp fallback, or latest messages.
  Also tightens read-cursor monotonicity for same-timestamp message keys.
*/

DROP FUNCTION IF EXISTS public.get_general_chat_message_window(uuid, uuid, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.get_general_chat_message_window(
  target_message_id uuid DEFAULT NULL,
  target_last_read_message_id uuid DEFAULT NULL,
  target_last_read_at timestamptz DEFAULT NULL,
  target_limit integer DEFAULT 50
)
RETURNS TABLE (
  messages jsonb,
  pinned_messages jsonb,
  has_older boolean,
  has_newer boolean,
  anchor_status text
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      $1 AS target_message_id,
      $2 AS target_last_read_message_id,
      $3 AS target_last_read_at,
      GREATEST(1, LEAST(COALESCE($4, 50), 100))::integer AS limit_count,
      '00000000-0000-0000-0000-000000000000'::uuid AS min_uuid
  ),
  window_params AS (
    SELECT
      params.*,
      ((params.limit_count - 1) / 2)::integer AS before_count,
      (params.limit_count - (((params.limit_count - 1) / 2)::integer) - 1)::integer AS after_count
    FROM params
  ),
  direct_anchor AS (
    SELECT
      message_row.created_at,
      message_row.id,
      'resolved'::text AS anchor_status,
      1 AS priority
    FROM window_params
    JOIN public.messages message_row
      ON window_params.target_message_id IS NOT NULL
     AND message_row.id = window_params.target_message_id

    UNION ALL

    SELECT
      message_row.created_at,
      message_row.id,
      'resolved'::text AS anchor_status,
      2 AS priority
    FROM window_params
    JOIN public.messages message_row
      ON window_params.target_message_id IS NULL
     AND window_params.target_last_read_message_id IS NOT NULL
     AND message_row.id = window_params.target_last_read_message_id
     AND (
       message_row.pinned IS NOT TRUE
       OR window_params.target_last_read_at IS NULL
     )
  ),
  timestamp_anchor_regular AS (
    SELECT
      candidate.created_at,
      candidate.id,
      'timestamp_fallback'::text AS anchor_status,
      3 AS priority
    FROM window_params
    JOIN LATERAL (
      SELECT
        message_row.created_at,
        message_row.id
      FROM public.messages message_row
      WHERE window_params.target_message_id IS NULL
        AND window_params.target_last_read_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM direct_anchor)
        AND message_row.pinned IS NOT TRUE
        AND (message_row.created_at, message_row.id) > (
          window_params.target_last_read_at,
          COALESCE(window_params.target_last_read_message_id, window_params.min_uuid)
        )
      ORDER BY message_row.created_at ASC, message_row.id ASC
      LIMIT 1
    ) candidate ON true
  ),
  timestamp_anchor_any AS (
    SELECT
      candidate.created_at,
      candidate.id,
      'timestamp_fallback'::text AS anchor_status,
      4 AS priority
    FROM window_params
    JOIN LATERAL (
      SELECT
        message_row.created_at,
        message_row.id
      FROM public.messages message_row
      WHERE window_params.target_message_id IS NULL
        AND window_params.target_last_read_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM direct_anchor)
        AND NOT EXISTS (SELECT 1 FROM timestamp_anchor_regular)
        AND (message_row.created_at, message_row.id) > (
          window_params.target_last_read_at,
          COALESCE(window_params.target_last_read_message_id, window_params.min_uuid)
        )
      ORDER BY message_row.created_at ASC, message_row.id ASC
      LIMIT 1
    ) candidate ON true
  ),
  timestamp_anchor AS (
    SELECT * FROM timestamp_anchor_regular
    UNION ALL
    SELECT * FROM timestamp_anchor_any
  ),
  latest_anchor_regular AS (
    SELECT
      candidate.created_at,
      candidate.id,
      CASE
        WHEN window_params.target_message_id IS NOT NULL THEN 'missing'
        WHEN window_params.target_last_read_message_id IS NOT NULL
          AND window_params.target_last_read_at IS NULL THEN 'missing'
        ELSE 'latest'
      END::text AS anchor_status,
      5 AS priority
    FROM window_params
    JOIN LATERAL (
      SELECT
        message_row.created_at,
        message_row.id
      FROM public.messages message_row
      WHERE message_row.pinned IS NOT TRUE
      ORDER BY message_row.created_at DESC, message_row.id DESC
      LIMIT 1
    ) candidate ON true
    WHERE NOT EXISTS (SELECT 1 FROM direct_anchor)
      AND NOT EXISTS (SELECT 1 FROM timestamp_anchor)
  ),
  latest_anchor_any AS (
    SELECT
      candidate.created_at,
      candidate.id,
      CASE
        WHEN window_params.target_message_id IS NOT NULL THEN 'missing'
        WHEN window_params.target_last_read_message_id IS NOT NULL
          AND window_params.target_last_read_at IS NULL THEN 'missing'
        ELSE 'latest'
      END::text AS anchor_status,
      6 AS priority
    FROM window_params
    JOIN LATERAL (
      SELECT
        message_row.created_at,
        message_row.id
      FROM public.messages message_row
      ORDER BY message_row.created_at DESC, message_row.id DESC
      LIMIT 1
    ) candidate ON true
    WHERE NOT EXISTS (SELECT 1 FROM direct_anchor)
      AND NOT EXISTS (SELECT 1 FROM timestamp_anchor)
      AND NOT EXISTS (SELECT 1 FROM latest_anchor_regular)
  ),
  latest_anchor AS (
    SELECT * FROM latest_anchor_regular
    UNION ALL
    SELECT * FROM latest_anchor_any
  ),
  anchor AS (
    SELECT
      all_anchors.created_at,
      all_anchors.id,
      all_anchors.anchor_status
    FROM (
      SELECT * FROM direct_anchor
      UNION ALL
      SELECT * FROM timestamp_anchor
      UNION ALL
      SELECT * FROM latest_anchor
    ) all_anchors
    ORDER BY all_anchors.priority ASC
    LIMIT 1
  ),
  resolved_status AS (
    SELECT COALESCE(
      (SELECT anchor.anchor_status FROM anchor),
      CASE
        WHEN window_params.target_message_id IS NOT NULL THEN 'missing'
        WHEN window_params.target_last_read_message_id IS NOT NULL
          AND window_params.target_last_read_at IS NULL THEN 'missing'
        ELSE 'latest'
      END
    )::text AS anchor_status
    FROM window_params
  ),
  latest_rows AS (
    SELECT
      to_jsonb(latest_raw) AS message_json,
      latest_raw.created_at,
      latest_raw.id
    FROM (
      SELECT message_row.*
      FROM public.messages message_row
      WHERE (SELECT resolved_status.anchor_status FROM resolved_status) IN ('latest', 'missing')
        AND message_row.pinned IS NOT TRUE
      ORDER BY message_row.created_at DESC, message_row.id DESC
      LIMIT (SELECT window_params.limit_count FROM window_params)
    ) latest_raw
  ),
  older_centered_rows AS (
    SELECT
      to_jsonb(older_raw) AS message_json,
      older_raw.created_at,
      older_raw.id,
      (row_number() OVER (ORDER BY older_raw.created_at DESC, older_raw.id DESC) - 1) AS side_rank,
      'older'::text AS side
    FROM (
      SELECT message_row.*
      FROM public.messages message_row
      JOIN anchor ON true
      WHERE (SELECT resolved_status.anchor_status FROM resolved_status) IN ('resolved', 'timestamp_fallback')
        AND message_row.pinned IS NOT TRUE
        AND (message_row.created_at, message_row.id) <= (anchor.created_at, anchor.id)
      ORDER BY message_row.created_at DESC, message_row.id DESC
      LIMIT (SELECT window_params.limit_count FROM window_params)
    ) older_raw
  ),
  newer_centered_rows AS (
    SELECT
      to_jsonb(newer_raw) AS message_json,
      newer_raw.created_at,
      newer_raw.id,
      (row_number() OVER (ORDER BY newer_raw.created_at ASC, newer_raw.id ASC) - 1) AS side_rank,
      'newer'::text AS side
    FROM (
      SELECT message_row.*
      FROM public.messages message_row
      JOIN anchor ON true
      WHERE (SELECT resolved_status.anchor_status FROM resolved_status) IN ('resolved', 'timestamp_fallback')
        AND message_row.pinned IS NOT TRUE
        AND (message_row.created_at, message_row.id) > (anchor.created_at, anchor.id)
      ORDER BY message_row.created_at ASC, message_row.id ASC
      LIMIT (SELECT window_params.limit_count FROM window_params)
    ) newer_raw
  ),
  centered_ranked_rows AS (
    SELECT
      centered_rows.message_json,
      centered_rows.created_at,
      centered_rows.id,
      CASE
        WHEN centered_rows.side = 'older'
          AND centered_rows.side_rank <= (SELECT window_params.before_count FROM window_params)
          THEN centered_rows.side_rank * 2
        WHEN centered_rows.side = 'newer'
          AND centered_rows.side_rank < (SELECT window_params.after_count FROM window_params)
          THEN centered_rows.side_rank * 2 + 1
        ELSE 100000 + centered_rows.side_rank * 2 + CASE WHEN centered_rows.side = 'newer' THEN 1 ELSE 0 END
      END AS pick_priority
    FROM (
      SELECT * FROM older_centered_rows
      UNION ALL
      SELECT * FROM newer_centered_rows
    ) centered_rows
  ),
  centered_rows AS (
    SELECT
      centered_ranked_rows.message_json,
      centered_ranked_rows.created_at,
      centered_ranked_rows.id
    FROM centered_ranked_rows
    ORDER BY centered_ranked_rows.pick_priority ASC
    LIMIT (SELECT window_params.limit_count FROM window_params)
  ),
  selected_rows AS (
    SELECT * FROM latest_rows
    UNION ALL
    SELECT * FROM centered_rows
  ),
  selected_rows_with_users AS (
    SELECT
      selected_rows.message_json || jsonb_build_object('user', to_jsonb(user_row)) AS message_json,
      selected_rows.created_at,
      selected_rows.id
    FROM selected_rows
    LEFT JOIN public.users user_row
      ON user_row.id = (selected_rows.message_json->>'user_id')::uuid
  ),
  pinned_rows AS (
    SELECT
      to_jsonb(pinned_raw) || jsonb_build_object('user', to_jsonb(user_row)) AS message_json,
      pinned_raw.pinned_at,
      pinned_raw.created_at,
      pinned_raw.id
    FROM (
      SELECT message_row.*
      FROM public.messages message_row
      WHERE message_row.pinned IS TRUE
      ORDER BY message_row.pinned_at ASC NULLS LAST, message_row.created_at ASC, message_row.id ASC
    ) pinned_raw
    LEFT JOIN public.users user_row
      ON user_row.id = pinned_raw.user_id
  ),
  first_window_row AS (
    SELECT
      selected_rows.created_at,
      selected_rows.id
    FROM selected_rows
    ORDER BY selected_rows.created_at ASC, selected_rows.id ASC
    LIMIT 1
  ),
  last_window_row AS (
    SELECT
      selected_rows.created_at,
      selected_rows.id
    FROM selected_rows
    ORDER BY selected_rows.created_at DESC, selected_rows.id DESC
    LIMIT 1
  ),
  window_flags AS (
    SELECT
      EXISTS (
        SELECT 1
        FROM public.messages message_row
        JOIN first_window_row ON true
        WHERE message_row.pinned IS NOT TRUE
          AND (message_row.created_at, message_row.id) < (first_window_row.created_at, first_window_row.id)
        LIMIT 1
      ) AS has_older,
      EXISTS (
        SELECT 1
        FROM public.messages message_row
        JOIN last_window_row ON true
        WHERE message_row.pinned IS NOT TRUE
          AND (message_row.created_at, message_row.id) > (last_window_row.created_at, last_window_row.id)
        LIMIT 1
      ) AS has_newer
  )
  SELECT
    COALESCE(
      (
        SELECT jsonb_agg(
          selected_rows_with_users.message_json
          ORDER BY selected_rows_with_users.created_at ASC, selected_rows_with_users.id ASC
        )
        FROM selected_rows_with_users
      ),
      '[]'::jsonb
    ) AS messages,
    COALESCE(
      (
        SELECT jsonb_agg(
          pinned_rows.message_json
          ORDER BY pinned_rows.pinned_at ASC NULLS LAST, pinned_rows.created_at ASC, pinned_rows.id ASC
        )
        FROM pinned_rows
      ),
      '[]'::jsonb
    ) AS pinned_messages,
    COALESCE((SELECT window_flags.has_older FROM window_flags), false) AS has_older,
    COALESCE((SELECT window_flags.has_newer FROM window_flags), false) AS has_newer,
    (SELECT resolved_status.anchor_status FROM resolved_status) AS anchor_status;
$$;

REVOKE ALL ON FUNCTION public.get_general_chat_message_window(uuid, uuid, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_general_chat_message_window(uuid, uuid, timestamptz, integer) TO authenticated;

COMMENT ON FUNCTION public.get_general_chat_message_window(uuid, uuid, timestamptz, integer)
  IS 'Returns an RLS-preserving chronological General Chat message window around a deep-link, read cursor, timestamp fallback, or latest anchor.';

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
      target_last_read_message_id,
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

GRANT EXECUTE ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) TO authenticated;
