-- Root pages use ordered indexes before profile/summary enrichment. Legacy flat
-- window and reply projection remain unchanged. New readers enforce caller RLS.
-- The invoker reply validator calls an already service-executable private block
-- helper. Schema USAGE is required for that existing grant to work; this adds no
-- table/function privileges and does not expose private through the Data API.
GRANT USAGE ON SCHEMA private TO service_role;
-- Live catalog drifted from the recorded migration's initplan form. The same
-- caller/room authorization helper remains authoritative; evaluate uid once.
ALTER POLICY live_room_signals_select_visible ON public.live_room_signals
USING (shado_live_private.can_receive_shado_live_signal((SELECT auth.uid()), room_id));
CREATE OR REPLACE FUNCTION public.get_general_chat_threaded_window(
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
  anchor_status text,
  target_thread_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  limit_count integer := GREATEST(1, LEAST(COALESCE(target_limit, 50), 100));
  before_count integer := ((limit_count - 1) / 2)::integer;
  after_count integer := limit_count - before_count - 1;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  WITH roots AS NOT MATERIALIZED (
    SELECT root.*
    FROM public.messages root
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.general_chat_thread_replies mapping
      WHERE mapping.message_id = root.id
    )
  ), target_resolution AS (
    SELECT COALESCE(mapping.thread_id, target.id) AS root_id
    FROM public.messages target
    LEFT JOIN public.general_chat_thread_replies mapping
      ON mapping.message_id = target.id
    WHERE target.id = target_message_id
    LIMIT 1
  ), read_resolution AS (
    SELECT COALESCE(mapping.thread_id, target.id) AS root_id
    FROM public.messages target
    LEFT JOIN public.general_chat_thread_replies mapping
      ON mapping.message_id = target.id
    WHERE target.id = target_last_read_message_id
    LIMIT 1
  ), direct_anchor AS (
    SELECT root.created_at, root.id, 'resolved'::text AS status, 1 AS priority
    FROM roots root
    WHERE root.id = (SELECT target_resolution.root_id FROM target_resolution)

    UNION ALL

    SELECT root.created_at, root.id, 'resolved'::text, 2
    FROM roots root
    WHERE target_message_id IS NULL
      AND root.id = (SELECT read_resolution.root_id FROM read_resolution)
  ), timestamp_anchor AS (
    SELECT candidate.created_at, candidate.id, 'timestamp_fallback'::text AS status, 3 AS priority
    FROM LATERAL (
      SELECT root.created_at, root.id
      FROM roots root
      WHERE target_message_id IS NULL
        AND target_last_read_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM direct_anchor)
        AND (root.created_at, root.id) > (
          target_last_read_at,
          COALESCE(
            (SELECT read_resolution.root_id FROM read_resolution),
            '00000000-0000-0000-0000-000000000000'::uuid
          )
        )
      ORDER BY root.created_at ASC, root.id ASC
      LIMIT 1
    ) candidate
  ), latest_anchor AS (
    SELECT
      candidate.created_at,
      candidate.id,
      CASE
        WHEN target_message_id IS NOT NULL THEN 'missing'
        WHEN target_last_read_message_id IS NOT NULL
          AND target_last_read_at IS NULL THEN 'missing'
        ELSE 'latest'
      END::text AS status,
      4 AS priority
    FROM LATERAL (
      SELECT root.created_at, root.id
      FROM roots root
      WHERE root.pinned IS NOT TRUE
      ORDER BY root.created_at DESC, root.id DESC
      LIMIT 1
    ) candidate
    WHERE NOT EXISTS (SELECT 1 FROM direct_anchor)
      AND NOT EXISTS (SELECT 1 FROM timestamp_anchor)
  ), anchor AS (
    SELECT anchors.created_at, anchors.id, anchors.status
    FROM (
      SELECT * FROM direct_anchor
      UNION ALL
      SELECT * FROM timestamp_anchor
      UNION ALL
      SELECT * FROM latest_anchor
    ) anchors
    ORDER BY anchors.priority
    LIMIT 1
  ), resolved_status AS (
    SELECT COALESCE(
      (SELECT anchor.status FROM anchor),
      CASE
        WHEN target_message_id IS NOT NULL THEN 'missing'
        WHEN target_last_read_message_id IS NOT NULL
          AND target_last_read_at IS NULL THEN 'missing'
        ELSE 'latest'
      END
    )::text AS status
  ), latest_rows AS (
    SELECT root.*
    FROM roots root
    WHERE (SELECT resolved_status.status FROM resolved_status) IN ('latest', 'missing')
      AND root.pinned IS NOT TRUE
    ORDER BY root.created_at DESC, root.id DESC
    LIMIT limit_count
  ), older_centered AS (
    SELECT
      root.*,
      row_number() OVER (ORDER BY root.created_at DESC, root.id DESC) - 1 AS side_rank,
      'older'::text AS side
    FROM roots root
    JOIN anchor ON true
    WHERE (SELECT resolved_status.status FROM resolved_status) IN ('resolved', 'timestamp_fallback')
      AND root.pinned IS NOT TRUE
      AND (root.created_at, root.id) <= (anchor.created_at, anchor.id)
    ORDER BY root.created_at DESC, root.id DESC
    LIMIT limit_count
  ), newer_centered AS (
    SELECT
      root.*,
      row_number() OVER (ORDER BY root.created_at ASC, root.id ASC) - 1 AS side_rank,
      'newer'::text AS side
    FROM roots root
    JOIN anchor ON true
    WHERE (SELECT resolved_status.status FROM resolved_status) IN ('resolved', 'timestamp_fallback')
      AND root.pinned IS NOT TRUE
      AND (root.created_at, root.id) > (anchor.created_at, anchor.id)
    ORDER BY root.created_at ASC, root.id ASC
    LIMIT limit_count
  ), centered_ranked AS (
    SELECT
      centered.*,
      CASE
        WHEN centered.side = 'older' AND centered.side_rank <= before_count
          THEN centered.side_rank * 2
        WHEN centered.side = 'newer' AND centered.side_rank < after_count
          THEN centered.side_rank * 2 + 1
        ELSE 100000 + centered.side_rank * 2
          + CASE WHEN centered.side = 'newer' THEN 1 ELSE 0 END
      END AS pick_priority
    FROM (
      SELECT * FROM older_centered
      UNION ALL
      SELECT * FROM newer_centered
    ) centered
  ), centered_rows AS (
    SELECT centered_ranked.*
    FROM centered_ranked
    ORDER BY centered_ranked.pick_priority
    LIMIT limit_count
  ), selected AS (
    SELECT
      to_jsonb(latest_rows) AS message_json,
      latest_rows.created_at,
      latest_rows.id
    FROM latest_rows

    UNION ALL

    SELECT
      to_jsonb(centered_rows)
        - 'side_rank' - 'side' - 'pick_priority' AS message_json,
      centered_rows.created_at,
      centered_rows.id
    FROM centered_rows
  ), summary_ids AS (
    SELECT selected.id FROM selected
    UNION
    SELECT root.id FROM roots root WHERE root.pinned IS TRUE
  ), summary_batches AS (
    SELECT array_agg(numbered.id ORDER BY numbered.ordinal) AS ids
    FROM (SELECT summary_ids.id, row_number() OVER (ORDER BY summary_ids.id) - 1 AS ordinal FROM summary_ids) numbered
    GROUP BY numbered.ordinal / 50
  ), summary_rows AS MATERIALIZED (
    SELECT summaries.* FROM summary_batches
    CROSS JOIN LATERAL public.get_general_chat_thread_summaries(summary_batches.ids) summaries
  ), enriched AS (
    SELECT
      selected.message_json
        || jsonb_build_object(
          'user', public.user_public_profile_json(author),
          'thread_summary', COALESCE(
            summary_row.summary,
            jsonb_build_object(
              'thread_id', selected.id,
              'reply_count', 0,
              'unread_count', 0,
              'latest_reply_id', NULL,
              'latest_reply_at', NULL,
              'latest_reply_preview', NULL,
              'latest_reply_author', NULL,
              'participants', '[]'::jsonb
            )
          )
        ) AS message_json,
      selected.created_at,
      selected.id
    FROM selected
    LEFT JOIN public.users author
      ON author.id = (selected.message_json->>'user_id')::uuid
    LEFT JOIN summary_rows summary_row ON summary_row.thread_id = selected.id
  ), pinned AS (
    SELECT
      to_jsonb(root)
        || jsonb_build_object(
          'user', public.user_public_profile_json(author),
          'thread_summary', COALESCE(
            summary_row.summary,
            jsonb_build_object(
              'thread_id', root.id,
              'reply_count', 0,
              'unread_count', 0,
              'latest_reply_id', NULL,
              'latest_reply_at', NULL,
              'latest_reply_preview', NULL,
              'latest_reply_author', NULL,
              'participants', '[]'::jsonb
            )
          )
        ) AS message_json,
      root.pinned_at,
      root.created_at,
      root.id
    FROM roots root
    LEFT JOIN public.users author ON author.id = root.user_id
    LEFT JOIN summary_rows summary_row ON summary_row.thread_id = root.id
    WHERE root.pinned IS TRUE
  ), first_row AS (
    SELECT selected.created_at, selected.id
    FROM selected
    ORDER BY selected.created_at ASC, selected.id ASC
    LIMIT 1
  ), last_row AS (
    SELECT selected.created_at, selected.id
    FROM selected
    ORDER BY selected.created_at DESC, selected.id DESC
    LIMIT 1
  )
  SELECT
    COALESCE(
      (
        SELECT jsonb_agg(enriched.message_json ORDER BY enriched.created_at, enriched.id)
        FROM enriched
      ),
      '[]'::jsonb
    ),
    COALESCE(
      (
        SELECT jsonb_agg(
          pinned.message_json
          ORDER BY pinned.pinned_at ASC NULLS LAST, pinned.created_at, pinned.id
        )
        FROM pinned
      ),
      '[]'::jsonb
    ),
    COALESCE(
      EXISTS (
        SELECT 1
        FROM roots root
        JOIN first_row ON true
        WHERE root.pinned IS NOT TRUE
          AND (root.created_at, root.id) < (first_row.created_at, first_row.id)
      ),
      false
    ),
    COALESCE(
      EXISTS (
        SELECT 1
        FROM roots root
        JOIN last_row ON true
        WHERE root.pinned IS NOT TRUE
          AND (root.created_at, root.id) > (last_row.created_at, last_row.id)
      ),
      false
    ),
    (SELECT resolved_status.status FROM resolved_status),
    (SELECT target_resolution.root_id FROM target_resolution);
END;
$$;

REVOKE ALL ON FUNCTION public.get_general_chat_threaded_window(uuid, uuid, timestamptz, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_general_chat_threaded_window(uuid, uuid, timestamptz, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_general_chat_threaded_window(uuid, uuid, timestamptz, integer) IS
  'Returns a root-only RLS-preserving General Chat window. Reply targets resolve to their canonical thread root, and every root JSON includes a stable thread_summary.';

-- Apply canonical message validation and monotonic ordering to every permitted
-- write path, including direct owner-RLS writes and concurrent RPC upserts.
CREATE OR REPLACE FUNCTION private.validate_message_read_cursor()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE canonical_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.user_id, NEW.surface, NEW.scope_id)
    IS DISTINCT FROM (OLD.user_id, OLD.surface, OLD.scope_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Read cursor identity cannot change';
  END IF;
  IF NEW.surface IN ('general_chat', 'general_chat_thread', 'dm') THEN
    IF NEW.last_read_message_id IS NULL THEN RETURN NULL; END IF;
    IF NEW.surface = 'general_chat' THEN
      SELECT m.created_at INTO canonical_at FROM public.messages m
      WHERE m.id = NEW.last_read_message_id AND m.pinned IS NOT TRUE AND m.message_type <> 'hype';
    ELSIF NEW.surface = 'general_chat_thread' THEN
      SELECT m.created_at INTO canonical_at FROM public.messages m
      JOIN public.general_chat_thread_replies mapping ON mapping.message_id = m.id
      WHERE m.id = NEW.last_read_message_id AND mapping.thread_id::text = NEW.scope_id;
    ELSE
      SELECT m.created_at INTO canonical_at FROM public.dm_messages m
      WHERE m.id = NEW.last_read_message_id AND m.conversation_id::text = NEW.scope_id;
    END IF;
    IF canonical_at IS NULL THEN RETURN NULL; END IF;
    NEW.last_read_at := canonical_at;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.last_read_at, COALESCE(NEW.last_read_message_id, '00000000-0000-0000-0000-000000000000'::uuid))
    <= (OLD.last_read_at, COALESCE(OLD.last_read_message_id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_message_read_cursor() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER validate_message_read_cursor BEFORE INSERT OR UPDATE ON public.user_read_cursors
FOR EACH ROW EXECUTE FUNCTION private.validate_message_read_cursor();

CREATE OR REPLACE FUNCTION public.get_dm_read_window(
  target_conversation_id uuid,
  target_message_id uuid DEFAULT NULL,
  target_before_created_at timestamptz DEFAULT NULL, target_before_id uuid DEFAULT NULL,
  target_after_created_at timestamptz DEFAULT NULL, target_after_id uuid DEFAULT NULL,
  target_read_anchor boolean DEFAULT true, target_limit integer DEFAULT 50
)
RETURNS TABLE ( messages jsonb, has_older boolean, has_newer boolean,
  anchor_status text, first_unread_message_id uuid, target_status text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  bounded_limit integer := GREATEST(1, LEAST(COALESCE(target_limit, 50), 100));

BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required'; END IF;
  IF target_conversation_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Message scope is required'; END IF;
  IF (target_before_created_at IS NULL) <> (target_before_id IS NULL)
    OR (target_after_created_at IS NULL) <> (target_after_id IS NULL)
    OR (target_before_id IS NOT NULL AND target_after_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Use one complete pagination cursor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dm_conversations c WHERE c.id = target_conversation_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Conversation is unavailable'; END IF;
  RETURN QUERY
  WITH available AS NOT MATERIALIZED (SELECT m.* FROM public.dm_messages m WHERE m.conversation_id = target_conversation_id
  ), unread_anchor AS (
    SELECT m.id, m.created_at FROM available m
    WHERE m.sender_id <> auth.uid() AND NOT (auth.uid() = ANY(COALESCE(m.read_by, ARRAY[]::uuid[])))
    ORDER BY m.created_at, m.id LIMIT 1
  ), anchor AS (
    SELECT m.id, m.created_at FROM available m WHERE m.id = target_message_id
    UNION ALL
    SELECT u.id, u.created_at FROM unread_anchor u
    WHERE target_message_id IS NULL AND target_read_anchor AND target_before_id IS NULL AND target_after_id IS NULL
  ), selected AS MATERIALIZED (
    SELECT * FROM (
      (SELECT m.* FROM available m WHERE target_before_id IS NOT NULL
        AND (m.created_at, m.id) < (target_before_created_at, target_before_id)
        ORDER BY m.created_at DESC, m.id DESC LIMIT bounded_limit)
      UNION ALL
      (SELECT m.* FROM available m WHERE target_after_id IS NOT NULL
        AND (m.created_at, m.id) > (target_after_created_at, target_after_id)
        ORDER BY m.created_at, m.id LIMIT bounded_limit)
      UNION ALL
      (SELECT m.* FROM available m JOIN anchor a ON true
        WHERE target_before_id IS NULL AND target_after_id IS NULL AND (m.created_at, m.id) <= (a.created_at, a.id)
        ORDER BY m.created_at DESC, m.id DESC LIMIT (bounded_limit - 1) / 2 + 1)
      UNION ALL
      (SELECT m.* FROM available m JOIN anchor a ON true
        WHERE target_before_id IS NULL AND target_after_id IS NULL AND (m.created_at, m.id) > (a.created_at, a.id)
        ORDER BY m.created_at, m.id LIMIT bounded_limit - ((bounded_limit - 1) / 2) - 1)
      UNION ALL
      (SELECT m.* FROM available m WHERE target_before_id IS NULL AND target_after_id IS NULL AND NOT EXISTS (SELECT 1 FROM anchor)
        ORDER BY m.created_at DESC, m.id DESC LIMIT bounded_limit)
    ) bounded
  ), bounds AS (
    SELECT (SELECT m.created_at FROM selected m ORDER BY m.created_at, m.id LIMIT 1) AS first_at,
      (SELECT m.id FROM selected m ORDER BY m.created_at, m.id LIMIT 1) AS first_id,
      (SELECT m.created_at FROM selected m ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_at,
      (SELECT m.id FROM selected m ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_id
  )
  SELECT
    COALESCE((SELECT jsonb_agg(to_jsonb(m) || jsonb_build_object('sender', public.user_public_profile_json(author)) ORDER BY m.created_at, m.id)
      FROM selected m LEFT JOIN public.users author ON author.id = m.sender_id), '[]'::jsonb),
    EXISTS (SELECT 1 FROM available m CROSS JOIN bounds b WHERE (m.created_at, m.id) < (b.first_at, b.first_id)),
    EXISTS (SELECT 1 FROM available m CROSS JOIN bounds b WHERE (m.created_at, m.id) > (b.last_at, b.last_id)),
    CASE WHEN target_before_id IS NOT NULL THEN 'older' WHEN target_after_id IS NOT NULL THEN 'newer'
      WHEN target_message_id IS NOT NULL AND EXISTS (SELECT 1 FROM anchor) THEN 'resolved'
      WHEN target_read_anchor AND EXISTS (SELECT 1 FROM anchor) THEN 'unread' ELSE 'latest' END::text,
    (SELECT u.id FROM unread_anchor u),
    CASE WHEN target_message_id IS NULL THEN 'not_requested' WHEN EXISTS (SELECT 1 FROM anchor) THEN 'found' ELSE 'missing' END::text;
END;
$$;
REVOKE ALL ON FUNCTION public.get_dm_read_window(uuid, uuid, timestamptz, uuid, timestamptz, uuid, boolean, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dm_read_window(uuid, uuid, timestamptz, uuid, timestamptz, uuid, boolean, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_general_chat_thread_read_window(
  target_thread_id uuid,
  target_message_id uuid DEFAULT NULL,
  target_before_created_at timestamptz DEFAULT NULL, target_before_id uuid DEFAULT NULL,
  target_after_created_at timestamptz DEFAULT NULL, target_after_id uuid DEFAULT NULL,
  target_read_anchor boolean DEFAULT true, target_limit integer DEFAULT 50
)
RETURNS TABLE (thread_id uuid, root_message jsonb,  replies jsonb, has_older boolean, has_newer boolean,
  anchor_status text, first_unread_message_id uuid, target_status text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  bounded_limit integer := GREATEST(1, LEAST(COALESCE(target_limit, 50), 100));
  resolved_thread_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required'; END IF;
  IF target_thread_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Message scope is required'; END IF;
  IF (target_before_created_at IS NULL) <> (target_before_id IS NULL)
    OR (target_after_created_at IS NULL) <> (target_after_id IS NULL)
    OR (target_before_id IS NOT NULL AND target_after_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Use one complete pagination cursor';
  END IF;
  SELECT COALESCE((SELECT mapping.thread_id FROM public.general_chat_thread_replies mapping WHERE mapping.message_id = target_thread_id), target_thread_id) INTO resolved_thread_id;
  RETURN QUERY
  WITH available AS NOT MATERIALIZED (SELECT m.* FROM public.general_chat_thread_replies mapping JOIN public.messages m ON m.id = mapping.message_id WHERE mapping.thread_id = resolved_thread_id  ), cursor_row AS (
    SELECT c.last_read_at, c.last_read_message_id FROM public.user_read_cursors c
    WHERE c.user_id = auth.uid() AND c.surface = 'general_chat_thread' AND c.scope_id = resolved_thread_id::text
  ), unread_anchor AS (
    SELECT m.id, m.created_at FROM available m
    WHERE m.user_id <> auth.uid() AND (NOT EXISTS (SELECT 1 FROM cursor_row)
      OR (m.created_at, m.id) > (SELECT c.last_read_at, COALESCE(c.last_read_message_id, '00000000-0000-0000-0000-000000000000'::uuid) FROM cursor_row c))
    ORDER BY m.created_at, m.id LIMIT 1
  ), anchor AS (
    SELECT m.id, m.created_at FROM available m WHERE m.id = target_message_id
    UNION ALL
    SELECT u.id, u.created_at FROM unread_anchor u
    WHERE target_message_id IS NULL AND target_read_anchor AND target_before_id IS NULL AND target_after_id IS NULL
  ), selected AS MATERIALIZED (
    SELECT * FROM (
      (SELECT m.* FROM available m WHERE target_before_id IS NOT NULL
        AND (m.created_at, m.id) < (target_before_created_at, target_before_id)
        ORDER BY m.created_at DESC, m.id DESC LIMIT bounded_limit)
      UNION ALL
      (SELECT m.* FROM available m WHERE target_after_id IS NOT NULL
        AND (m.created_at, m.id) > (target_after_created_at, target_after_id)
        ORDER BY m.created_at, m.id LIMIT bounded_limit)
      UNION ALL
      (SELECT m.* FROM available m JOIN anchor a ON true
        WHERE target_before_id IS NULL AND target_after_id IS NULL AND (m.created_at, m.id) <= (a.created_at, a.id)
        ORDER BY m.created_at DESC, m.id DESC LIMIT (bounded_limit - 1) / 2 + 1)
      UNION ALL
      (SELECT m.* FROM available m JOIN anchor a ON true
        WHERE target_before_id IS NULL AND target_after_id IS NULL AND (m.created_at, m.id) > (a.created_at, a.id)
        ORDER BY m.created_at, m.id LIMIT bounded_limit - ((bounded_limit - 1) / 2) - 1)
      UNION ALL
      (SELECT m.* FROM available m WHERE target_before_id IS NULL AND target_after_id IS NULL AND NOT EXISTS (SELECT 1 FROM anchor)
        ORDER BY m.created_at DESC, m.id DESC LIMIT bounded_limit)
    ) bounded
  ), bounds AS (
    SELECT (SELECT m.created_at FROM selected m ORDER BY m.created_at, m.id LIMIT 1) AS first_at,
      (SELECT m.id FROM selected m ORDER BY m.created_at, m.id LIMIT 1) AS first_id,
      (SELECT m.created_at FROM selected m ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_at,
      (SELECT m.id FROM selected m ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_id
  )
  SELECT resolved_thread_id,
    COALESCE((SELECT to_jsonb(root) || jsonb_build_object('user', public.user_public_profile_json(author))
      FROM public.messages root LEFT JOIN public.users author ON author.id = root.user_id
      WHERE root.id = resolved_thread_id AND NOT EXISTS (SELECT 1 FROM public.general_chat_thread_replies mapping WHERE mapping.message_id = root.id)),
      jsonb_build_object('id', resolved_thread_id, 'unavailable', true)),
    COALESCE((SELECT jsonb_agg(to_jsonb(m) || jsonb_build_object('user', public.user_public_profile_json(author)) ORDER BY m.created_at, m.id)
      FROM selected m LEFT JOIN public.users author ON author.id = m.user_id), '[]'::jsonb),
    EXISTS (SELECT 1 FROM available m CROSS JOIN bounds b WHERE (m.created_at, m.id) < (b.first_at, b.first_id)),
    EXISTS (SELECT 1 FROM available m CROSS JOIN bounds b WHERE (m.created_at, m.id) > (b.last_at, b.last_id)),
    CASE WHEN target_before_id IS NOT NULL THEN 'older' WHEN target_after_id IS NOT NULL THEN 'newer'
      WHEN target_message_id IS NOT NULL AND EXISTS (SELECT 1 FROM anchor) THEN 'resolved'
      WHEN target_read_anchor AND EXISTS (SELECT 1 FROM anchor) THEN 'unread' ELSE 'latest' END::text,
    (SELECT u.id FROM unread_anchor u),
    CASE WHEN target_message_id IS NULL THEN 'not_requested' WHEN EXISTS (SELECT 1 FROM anchor) THEN 'found' ELSE 'missing' END::text;
END;
$$;
REVOKE ALL ON FUNCTION public.get_general_chat_thread_read_window(uuid, uuid, timestamptz, uuid, timestamptz, uuid, boolean, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_general_chat_thread_read_window(uuid, uuid, timestamptz, uuid, timestamptz, uuid, boolean, integer) TO authenticated, service_role;

-- Missing anchors are a no-op, never an implicit conversation-wide read.
create or replace function public.mark_dm_messages_read_through(
  conversation_id uuid,
  through_message_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_created_at timestamptz;
  remaining_count integer;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.dm_conversations conversations
    where conversations.id = mark_dm_messages_read_through.conversation_id
      and current_user_id = any(conversations.participants)
  ) then
    raise exception using errcode = '42501', message = 'Reader is not a participant in this DM conversation';
  end if;

  select messages.created_at
  into target_created_at
  from public.dm_messages messages
  where messages.id = through_message_id
    and messages.conversation_id = mark_dm_messages_read_through.conversation_id
    and (messages.sender_id = current_user_id or not private.users_have_block(current_user_id, messages.sender_id));

  if target_created_at is null then
    -- A deleted/hidden/out-of-scope anchor cannot acknowledge any row. Return
    -- authoritative unread state, preserving the receipt frontier on races.
    select count(*)::integer into remaining_count
    from public.dm_messages messages
    where messages.conversation_id = mark_dm_messages_read_through.conversation_id
      and messages.sender_id <> current_user_id
      and not private.users_have_block(current_user_id, messages.sender_id)
      and not (current_user_id = any(coalesce(messages.read_by, array[]::uuid[])));
    return remaining_count;
  end if;

  update public.dm_messages messages
  set
    read_at = coalesce(messages.read_at, now()),
    read_by = case
      when messages.read_by is null then array[current_user_id]::uuid[]
      when not (current_user_id = any(messages.read_by))
        then array_append(messages.read_by, current_user_id)
      else messages.read_by
    end,
    updated_at = now()
  where messages.conversation_id = mark_dm_messages_read_through.conversation_id
    and messages.sender_id <> current_user_id
    and not private.users_have_block(current_user_id, messages.sender_id)
    and (
      messages.created_at < target_created_at
      or (messages.created_at = target_created_at and messages.id <= through_message_id)
    )
    and (
      messages.read_by is null
      or not (current_user_id = any(messages.read_by))
    );

  select count(*)::integer
  into remaining_count
  from public.dm_messages messages
  where messages.conversation_id = mark_dm_messages_read_through.conversation_id
    and messages.sender_id <> current_user_id
    and not private.users_have_block(current_user_id, messages.sender_id)
    and (
      messages.read_by is null
      or not (current_user_id = any(messages.read_by))
    );

  return remaining_count;
end;
$$;

revoke all on function public.mark_dm_messages_read_through(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_dm_messages_read_through(uuid, uuid)
  to authenticated;
