/*
  # True General Chat threads

  Preserves public.messages as the canonical message stream while adding a
  read-only thread projection. Legacy clients continue to write reply_to and
  read the existing flat window RPC unchanged. New clients can read root-only
  windows, bounded thread pages, and RLS-aware summaries.
*/

CREATE INDEX IF NOT EXISTS messages_reply_to_idx
  ON public.messages (reply_to)
  WHERE reply_to IS NOT NULL;

-- The oldest schema path created this foreign key without an ON DELETE action,
-- while a later idempotent table definition expected SET NULL. Normalize the
-- live constraint so deleting a root preserves its replies and stable thread.
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_reply_to_fkey;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_reply_to_fkey
  FOREIGN KEY (reply_to)
  REFERENCES public.messages(id)
  ON DELETE SET NULL;

CREATE TABLE public.general_chat_thread_replies (
  message_id uuid PRIMARY KEY
    REFERENCES public.messages(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL,
  thread_started_at timestamptz NOT NULL,
  parent_message_id uuid NOT NULL,
  CONSTRAINT general_chat_thread_replies_not_root
    CHECK (message_id <> thread_id),
  CONSTRAINT general_chat_thread_replies_not_self_parent
    CHECK (message_id <> parent_message_id)
);

COMMENT ON TABLE public.general_chat_thread_replies IS
  'Server-maintained projection of General Chat replies onto a stable canonical root. Clients have read-only access; public.messages remains canonical.';

CREATE INDEX general_chat_thread_replies_thread_idx
  ON public.general_chat_thread_replies (thread_id, message_id);

CREATE INDEX general_chat_thread_replies_parent_idx
  ON public.general_chat_thread_replies (parent_message_id, message_id);

ALTER TABLE public.general_chat_thread_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read visible General Chat thread mappings"
  ON public.general_chat_thread_replies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.messages visible_message
      WHERE visible_message.id = general_chat_thread_replies.message_id
    )
  );

REVOKE ALL ON TABLE public.general_chat_thread_replies
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.general_chat_thread_replies
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.validate_general_chat_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  parent_author_id uuid;
  cycle_found boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.reply_to IS DISTINCT FROM OLD.reply_to THEN
    -- ON DELETE SET NULL must be allowed to preserve the surviving reply and
    -- its stable mapping when an ancestor is deleted. A caller cannot use this
    -- path while the old parent still exists.
    IF NEW.reply_to IS NULL
      AND OLD.reply_to IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.messages parent WHERE parent.id = OLD.reply_to
      ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'General Chat reply targets are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.reply_to IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reply_to = NEW.id THEN
    RAISE EXCEPTION 'A message cannot reply to itself'
      USING ERRCODE = '23514';
  END IF;

  SELECT parent.user_id
    INTO parent_author_id
  FROM public.messages parent
  WHERE parent.id = NEW.reply_to;

  IF parent_author_id IS NULL THEN
    RAISE EXCEPTION 'Reply target is unavailable'
      USING ERRCODE = '23503';
  END IF;

  IF private.users_have_block(NEW.user_id, parent_author_id) THEN
    RAISE EXCEPTION 'Reply target is unavailable'
      USING ERRCODE = '42501';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT
      parent.id,
      parent.reply_to,
      ARRAY[parent.id]::uuid[] AS path,
      1 AS depth
    FROM public.messages parent
    WHERE parent.id = NEW.reply_to

    UNION ALL

    SELECT
      next_parent.id,
      next_parent.reply_to,
      ancestors.path || next_parent.id,
      ancestors.depth + 1
    FROM ancestors
    JOIN public.messages next_parent ON next_parent.id = ancestors.reply_to
    WHERE NOT next_parent.id = ANY (ancestors.path)
  )
  SELECT EXISTS (
    SELECT 1
    FROM ancestors
    WHERE ancestors.id = NEW.id
       OR ancestors.reply_to = NEW.id
  )
  INTO cycle_found;

  IF cycle_found THEN
    RAISE EXCEPTION 'General Chat reply cycles are not allowed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_general_chat_reply()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_general_chat_reply ON public.messages;
CREATE TRIGGER validate_general_chat_reply
  BEFORE INSERT OR UPDATE OF reply_to ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_general_chat_reply();

CREATE OR REPLACE FUNCTION private.map_general_chat_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  canonical_thread_id uuid;
  canonical_started_at timestamptz;
BEGIN
  IF NEW.reply_to IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(parent_mapping.thread_id, parent.id),
    COALESCE(parent_mapping.thread_started_at, parent.created_at)
  INTO canonical_thread_id, canonical_started_at
  FROM public.messages parent
  LEFT JOIN public.general_chat_thread_replies parent_mapping
    ON parent_mapping.message_id = parent.id
  WHERE parent.id = NEW.reply_to;

  IF canonical_thread_id IS NULL OR canonical_started_at IS NULL THEN
    RAISE EXCEPTION 'Reply target is unavailable'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.general_chat_thread_replies (
    message_id,
    thread_id,
    thread_started_at,
    parent_message_id
  )
  VALUES (
    NEW.id,
    canonical_thread_id,
    canonical_started_at,
    NEW.reply_to
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.map_general_chat_reply()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS map_general_chat_reply ON public.messages;
CREATE TRIGGER map_general_chat_reply
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.reply_to IS NOT NULL)
  EXECUTE FUNCTION private.map_general_chat_reply();

CREATE OR REPLACE FUNCTION private.prevent_general_chat_thread_mapping_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'General Chat thread mappings are immutable'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_general_chat_thread_mapping_update()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER prevent_general_chat_thread_mapping_update
  BEFORE UPDATE ON public.general_chat_thread_replies
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_general_chat_thread_mapping_update();

DO $backfill$
DECLARE
  reply_count bigint;
  mapped_count bigint;
BEGIN
  WITH RECURSIVE chains AS (
    SELECT
      reply.id AS message_id,
      reply.reply_to AS parent_message_id,
      parent.id AS ancestor_id,
      parent.reply_to AS ancestor_parent_id,
      parent.created_at AS ancestor_created_at,
      ARRAY[reply.id, parent.id]::uuid[] AS path,
      1 AS depth
    FROM public.messages reply
    JOIN public.messages parent ON parent.id = reply.reply_to
    WHERE reply.reply_to IS NOT NULL

    UNION ALL

    SELECT
      chains.message_id,
      chains.parent_message_id,
      parent.id,
      parent.reply_to,
      parent.created_at,
      chains.path || parent.id,
      chains.depth + 1
    FROM chains
    JOIN public.messages parent ON parent.id = chains.ancestor_parent_id
    WHERE chains.ancestor_parent_id IS NOT NULL
      AND NOT parent.id = ANY (chains.path)
  ), roots AS (
    SELECT DISTINCT ON (chains.message_id)
      chains.message_id,
      chains.ancestor_id AS thread_id,
      chains.ancestor_created_at AS thread_started_at,
      chains.parent_message_id
    FROM chains
    WHERE chains.ancestor_parent_id IS NULL
    ORDER BY chains.message_id, chains.depth DESC
  )
  INSERT INTO public.general_chat_thread_replies (
    message_id,
    thread_id,
    thread_started_at,
    parent_message_id
  )
  SELECT
    roots.message_id,
    roots.thread_id,
    roots.thread_started_at,
    roots.parent_message_id
  FROM roots;

  SELECT count(*) INTO reply_count
  FROM public.messages message_row
  WHERE message_row.reply_to IS NOT NULL;

  SELECT count(*) INTO mapped_count
  FROM public.general_chat_thread_replies;

  IF mapped_count <> reply_count THEN
    RAISE EXCEPTION
      'Could not backfill every General Chat reply (% replies, % mapped); inspect cycles',
      reply_count,
      mapped_count;
  END IF;
END;
$backfill$;

DO $publication$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'general_chat_thread_replies'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.general_chat_thread_replies;
  END IF;
END;
$publication$;

CREATE OR REPLACE FUNCTION public.get_general_chat_thread_summaries(
  target_root_ids uuid[]
)
RETURNS TABLE (
  thread_id uuid,
  summary jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  normalized_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT requested_id), ARRAY[]::uuid[])
  INTO normalized_ids
  FROM unnest(COALESCE(target_root_ids, ARRAY[]::uuid[])) requested_id
  WHERE requested_id IS NOT NULL;

  IF cardinality(normalized_ids) > 50 THEN
    RAISE EXCEPTION 'At most 50 thread summaries may be requested';
  END IF;

  RETURN QUERY
  WITH requested AS (
    SELECT unnest(normalized_ids) AS root_id
  ), cursor_rows AS (
    SELECT
      cursor_row.scope_id::uuid AS root_id,
      cursor_row.last_read_at,
      cursor_row.last_read_message_id
    FROM public.user_read_cursors cursor_row
    WHERE cursor_row.user_id = auth.uid()
      AND cursor_row.surface = 'general_chat_thread'
      AND cursor_row.scope_id = ANY (
        SELECT requested.root_id::text FROM requested
      )
  )
  SELECT
    requested.root_id AS thread_id,
    jsonb_build_object(
      'thread_id', requested.root_id,
      'reply_count', COALESCE(reply_stats.reply_count, 0),
      'unread_count', COALESCE(reply_stats.unread_count, 0),
      'latest_reply_id', reply_stats.latest_reply_id,
      'latest_reply_at', reply_stats.latest_reply_at,
      'latest_reply_preview', reply_stats.latest_reply_preview,
      'latest_reply_author', reply_stats.latest_reply_author,
      'participants', COALESCE(reply_stats.participants, '[]'::jsonb)
    ) AS summary
  FROM requested
  JOIN public.messages visible_root
    ON visible_root.id = requested.root_id
  LEFT JOIN public.general_chat_thread_replies root_mapping
    ON root_mapping.message_id = visible_root.id
  LEFT JOIN cursor_rows
    ON cursor_rows.root_id = requested.root_id
  LEFT JOIN LATERAL (
    WITH visible_replies AS (
      SELECT
        reply.id,
        reply.user_id,
        reply.content,
        reply.created_at
      FROM public.general_chat_thread_replies mapping
      JOIN public.messages reply ON reply.id = mapping.message_id
      WHERE mapping.thread_id = requested.root_id
    ), latest_reply AS (
      SELECT visible_replies.*
      FROM visible_replies
      ORDER BY visible_replies.created_at DESC, visible_replies.id DESC
      LIMIT 1
    ), latest_participants AS (
      SELECT DISTINCT ON (visible_replies.user_id)
        visible_replies.user_id,
        visible_replies.created_at,
        visible_replies.id
      FROM visible_replies
      ORDER BY
        visible_replies.user_id,
        visible_replies.created_at DESC,
        visible_replies.id DESC
    ), bounded_participants AS (
      SELECT latest_participants.*
      FROM latest_participants
      ORDER BY latest_participants.created_at DESC, latest_participants.id DESC
      LIMIT 5
    )
    SELECT
      (SELECT count(*)::integer FROM visible_replies) AS reply_count,
      (
        SELECT count(*)::integer
        FROM visible_replies unread_reply
        WHERE unread_reply.user_id <> auth.uid()
          AND (
            cursor_rows.last_read_at IS NULL
            OR (unread_reply.created_at, unread_reply.id) > (
              cursor_rows.last_read_at,
              COALESCE(
                cursor_rows.last_read_message_id,
                '00000000-0000-0000-0000-000000000000'::uuid
              )
            )
          )
      ) AS unread_count,
      latest_reply.id AS latest_reply_id,
      latest_reply.created_at AS latest_reply_at,
      left(COALESCE(NULLIF(latest_reply.content, ''), 'Sent an attachment'), 160)
        AS latest_reply_preview,
      public.user_public_profile_json(latest_author) AS latest_reply_author,
      (
        SELECT jsonb_agg(
          public.user_public_profile_json(participant_profile)
          ORDER BY bounded_participants.created_at DESC, bounded_participants.id DESC
        )
        FROM bounded_participants
        JOIN public.users participant_profile
          ON participant_profile.id = bounded_participants.user_id
      ) AS participants
    FROM latest_reply
    LEFT JOIN public.users latest_author ON latest_author.id = latest_reply.user_id
  ) reply_stats ON true
  WHERE root_mapping.message_id IS NULL
  ORDER BY requested.root_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_general_chat_thread_summaries(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_general_chat_thread_summaries(uuid[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_general_chat_thread_summaries(uuid[]) IS
  'Returns stable RLS-aware thread summary JSON for at most 50 visible General Chat roots.';

CREATE OR REPLACE FUNCTION public.get_general_chat_thread(
  target_thread_id uuid,
  target_message_id uuid DEFAULT NULL,
  target_before_created_at timestamptz DEFAULT NULL,
  target_before_id uuid DEFAULT NULL,
  target_limit integer DEFAULT 50
)
RETURNS TABLE (
  thread_id uuid,
  root_message jsonb,
  replies jsonb,
  has_older boolean,
  anchor_status text,
  target_status text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  resolved_thread_id uuid;
  limit_count integer := GREATEST(1, LEAST(COALESCE(target_limit, 50), 100));
  before_count integer;
  after_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(mapping.thread_id, target_thread_id)
  INTO resolved_thread_id
  FROM (SELECT 1) singleton
  LEFT JOIN public.general_chat_thread_replies mapping
    ON mapping.message_id = target_thread_id;

  before_count := ((limit_count - 1) / 2)::integer;
  after_count := limit_count - before_count - 1;

  RETURN QUERY
  WITH target_reply AS (
    SELECT reply.created_at, reply.id
    FROM public.general_chat_thread_replies mapping
    JOIN public.messages reply ON reply.id = mapping.message_id
    WHERE mapping.thread_id = resolved_thread_id
      AND reply.id = target_message_id
    LIMIT 1
  ), target_older_desc AS (
    SELECT reply.*
    FROM public.general_chat_thread_replies mapping
    JOIN public.messages reply ON reply.id = mapping.message_id
    WHERE mapping.thread_id = resolved_thread_id
      AND EXISTS (SELECT 1 FROM target_reply)
      AND (reply.created_at, reply.id) <= (
        (SELECT target_reply.created_at FROM target_reply),
        (SELECT target_reply.id FROM target_reply)
      )
    ORDER BY reply.created_at DESC, reply.id DESC
    LIMIT before_count + 1
  ), target_newer_asc AS (
    SELECT reply.*
    FROM public.general_chat_thread_replies mapping
    JOIN public.messages reply ON reply.id = mapping.message_id
    WHERE mapping.thread_id = resolved_thread_id
      AND EXISTS (SELECT 1 FROM target_reply)
      AND (reply.created_at, reply.id) > (
        (SELECT target_reply.created_at FROM target_reply),
        (SELECT target_reply.id FROM target_reply)
      )
    ORDER BY reply.created_at ASC, reply.id ASC
    LIMIT after_count
  ), before_desc AS (
    SELECT reply.*
    FROM public.general_chat_thread_replies mapping
    JOIN public.messages reply ON reply.id = mapping.message_id
    WHERE mapping.thread_id = resolved_thread_id
      AND target_message_id IS NULL
      AND target_before_created_at IS NOT NULL
      AND (reply.created_at, reply.id) < (
        target_before_created_at,
        COALESCE(
          target_before_id,
          '00000000-0000-0000-0000-000000000000'::uuid
        )
      )
    ORDER BY reply.created_at DESC, reply.id DESC
    LIMIT limit_count
  ), latest_desc AS (
    SELECT reply.*
    FROM public.general_chat_thread_replies mapping
    JOIN public.messages reply ON reply.id = mapping.message_id
    WHERE mapping.thread_id = resolved_thread_id
      AND (
        (
          target_message_id IS NULL
          AND target_before_created_at IS NULL
        )
        OR (
          target_message_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM target_reply)
        )
      )
    ORDER BY reply.created_at DESC, reply.id DESC
    LIMIT limit_count
  ), selected_rows AS (
    SELECT * FROM target_older_desc
    UNION ALL
    SELECT * FROM target_newer_asc
    UNION ALL
    SELECT * FROM before_desc
    UNION ALL
    SELECT * FROM latest_desc
  ), selected AS (
    SELECT selected_rows.*
    FROM selected_rows
    ORDER BY selected_rows.created_at ASC, selected_rows.id ASC
  ), first_selected AS (
    SELECT selected.created_at, selected.id
    FROM selected
    ORDER BY selected.created_at ASC, selected.id ASC
    LIMIT 1
  ), root_row AS (
    SELECT root.*
    FROM public.messages root
    WHERE root.id = resolved_thread_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.general_chat_thread_replies root_mapping
        WHERE root_mapping.message_id = root.id
      )
  )
  SELECT
    resolved_thread_id,
    COALESCE(
      (
        SELECT to_jsonb(root_row)
          || jsonb_build_object(
            'user', public.user_public_profile_json(root_author)
          )
        FROM root_row
        LEFT JOIN public.users root_author ON root_author.id = root_row.user_id
      ),
      jsonb_build_object(
        'id', resolved_thread_id,
        'unavailable', true
      )
    ) AS root_message,
    COALESCE(
      (
        SELECT jsonb_agg(
          to_jsonb(selected)
            || jsonb_build_object(
              'user', public.user_public_profile_json(reply_author)
            )
          ORDER BY selected.created_at ASC, selected.id ASC
        )
        FROM selected
        LEFT JOIN public.users reply_author ON reply_author.id = selected.user_id
      ),
      '[]'::jsonb
    ) AS replies,
    COALESCE(
      EXISTS (
        SELECT 1
        FROM public.general_chat_thread_replies older_mapping
        JOIN public.messages older_reply ON older_reply.id = older_mapping.message_id
        JOIN first_selected ON true
        WHERE older_mapping.thread_id = resolved_thread_id
          AND (older_reply.created_at, older_reply.id)
            < (first_selected.created_at, first_selected.id)
      ),
      false
    ) AS has_older,
    CASE
      WHEN target_message_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM target_reply) THEN 'resolved'
      WHEN target_message_id IS NOT NULL THEN 'missing'
      WHEN target_before_created_at IS NOT NULL THEN 'older'
      ELSE 'latest'
    END::text AS anchor_status,
    CASE
      WHEN target_message_id IS NULL THEN 'not_requested'
      WHEN target_message_id = resolved_thread_id
        AND EXISTS (SELECT 1 FROM root_row) THEN 'found'
      WHEN EXISTS (SELECT 1 FROM target_reply) THEN 'found'
      ELSE 'missing'
    END::text AS target_status;
END;
$$;

REVOKE ALL ON FUNCTION public.get_general_chat_thread(uuid, uuid, timestamptz, uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_general_chat_thread(uuid, uuid, timestamptz, uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_general_chat_thread(uuid, uuid, timestamptz, uuid, integer) IS
  'Returns a bounded chronological page of visible replies for one stable General Chat thread. Deleted or hidden roots are represented by an unavailable placeholder.';

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
  WITH roots AS MATERIALIZED (
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
    LEFT JOIN LATERAL (
      SELECT summaries.summary
      FROM public.get_general_chat_thread_summaries(ARRAY[selected.id]) summaries
      LIMIT 1
    ) summary_row ON true
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
    LEFT JOIN LATERAL (
      SELECT summaries.summary
      FROM public.get_general_chat_thread_summaries(ARRAY[root.id]) summaries
      LIMIT 1
    ) summary_row ON true
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
