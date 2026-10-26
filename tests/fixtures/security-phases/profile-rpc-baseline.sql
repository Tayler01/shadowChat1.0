-- Read-only parent and isolated catalog snapshot, 2026-10-23.
-- Exact reviewed bodies for profile column-ACL compatibility regression only.
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.user_public_profile_json(profile users)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', profile.id,
    'username', profile.username,
    'display_name', profile.display_name,
    'avatar_url', profile.avatar_url,
    'avatar_thumbnail_url', profile.avatar_thumbnail_url,
    'avatar_thumbnail_path', profile.avatar_thumbnail_path,
    'banner_url', profile.banner_url,
    'banner_thumbnail_url', profile.banner_thumbnail_url,
    'banner_thumbnail_path', profile.banner_thumbnail_path,
    'status', profile.status,
    'status_message', profile.status_message,
    'presence_visibility', profile.presence_visibility,
    'color', profile.color,
    'chat_color', profile.chat_color,
    'admin_role', profile.admin_role,
    'checkers_crown', profile.checkers_crown,
    'war_sword', profile.war_sword,
    'shadow_pin_gold_pin', profile.shadow_pin_gold_pin,
    'shadow_runner_sprint_medal', profile.shadow_runner_sprint_medal,
    'shadow_runner_knight_medal', profile.shadow_runner_knight_medal,
    'shadow_runner_knight_level_id', profile.shadow_runner_knight_level_id,
    'gold_easter_egg', profile.gold_easter_egg,
    'dm_discoverable', profile.dm_discoverable,
    'last_active', profile.last_active,
    'created_at', profile.created_at,
    'updated_at', profile.updated_at
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_dm_message_window(target_conversation_id uuid, target_message_id uuid, target_limit integer DEFAULT 50)
 RETURNS TABLE(messages jsonb, has_older boolean, has_newer boolean, target_status text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  bounded_limit integer := greatest(1, least(coalesce(target_limit, 50), 100));
  before_count integer;
  after_count integer;
begin
  if target_conversation_id is null or target_message_id is null then
    raise exception 'Conversation and target message are required';
  end if;

  if not exists (
    select 1
    from public.dm_conversations conversations
    where conversations.id = target_conversation_id
  ) then
    raise exception using errcode = '42501', message = 'Conversation is unavailable';
  end if;

  if not exists (
    select 1
    from public.dm_messages target
    where target.id = target_message_id
      and target.conversation_id = target_conversation_id
  ) then
    return query select '[]'::jsonb, false, false, 'missing'::text;
    return;
  end if;

  before_count := (bounded_limit - 1) / 2;
  after_count := bounded_limit - before_count - 1;

  return query
  with anchor as (
    select target.created_at, target.id
    from public.dm_messages target
    where target.id = target_message_id
      and target.conversation_id = target_conversation_id
  ),
  older as (
    select messages.*
    from public.dm_messages messages
    cross join anchor
    where messages.conversation_id = target_conversation_id
      and (messages.created_at, messages.id) < (anchor.created_at, anchor.id)
    order by messages.created_at desc, messages.id desc
    limit before_count
  ),
  newer as (
    select messages.*
    from public.dm_messages messages
    cross join anchor
    where messages.conversation_id = target_conversation_id
      and (messages.created_at, messages.id) > (anchor.created_at, anchor.id)
    order by messages.created_at asc, messages.id asc
    limit after_count
  ),
  selected as (
    select * from older
    union all
    select target.*
    from public.dm_messages target
    where target.id = target_message_id
      and target.conversation_id = target_conversation_id
    union all
    select * from newer
  ),
  projected as (
    select
      to_jsonb(selected)
        || jsonb_build_object('sender', public.user_public_profile_json(profiles)) as message_json,
      selected.created_at,
      selected.id
    from selected
    join public.users profiles on profiles.id = selected.sender_id
  ),
  bounds as (
    select
      (select projected.created_at from projected order by projected.created_at, projected.id limit 1) as first_created_at,
      (select projected.id from projected order by projected.created_at, projected.id limit 1) as first_id,
      (select projected.created_at from projected order by projected.created_at desc, projected.id desc limit 1) as last_created_at,
      (select projected.id from projected order by projected.created_at desc, projected.id desc limit 1) as last_id
  )
  select
    coalesce(
      (select jsonb_agg(projected.message_json order by projected.created_at, projected.id) from projected),
      '[]'::jsonb
    ),
    exists (
      select 1
      from public.dm_messages candidates
      cross join bounds
      where candidates.conversation_id = target_conversation_id
        and (candidates.created_at, candidates.id) < (bounds.first_created_at, bounds.first_id)
    ),
    exists (
      select 1
      from public.dm_messages candidates
      cross join bounds
      where candidates.conversation_id = target_conversation_id
        and (candidates.created_at, candidates.id) > (bounds.last_created_at, bounds.last_id)
    ),
    'resolved'::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dm_read_window(target_conversation_id uuid, target_message_id uuid DEFAULT NULL::uuid, target_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_before_id uuid DEFAULT NULL::uuid, target_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_after_id uuid DEFAULT NULL::uuid, target_read_anchor boolean DEFAULT true, target_limit integer DEFAULT 50)
 RETURNS TABLE(messages jsonb, has_older boolean, has_newer boolean, anchor_status text, first_unread_message_id uuid, target_status text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_general_chat_message_window(target_message_id uuid DEFAULT NULL::uuid, target_last_read_message_id uuid DEFAULT NULL::uuid, target_last_read_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_limit integer DEFAULT 50)
 RETURNS TABLE(messages jsonb, pinned_messages jsonb, has_older boolean, has_newer boolean, anchor_status text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      selected_rows.message_json || jsonb_build_object('user', public.user_public_profile_json(user_row)) AS message_json,
      selected_rows.created_at,
      selected_rows.id
    FROM selected_rows
    LEFT JOIN public.users user_row
      ON user_row.id = (selected_rows.message_json->>'user_id')::uuid
  ),
  pinned_rows AS (
    SELECT
      to_jsonb(pinned_raw) || jsonb_build_object('user', public.user_public_profile_json(user_row)) AS message_json,
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_general_chat_thread(target_thread_id uuid, target_message_id uuid DEFAULT NULL::uuid, target_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_before_id uuid DEFAULT NULL::uuid, target_limit integer DEFAULT 50)
 RETURNS TABLE(thread_id uuid, root_message jsonb, replies jsonb, has_older boolean, anchor_status text, target_status text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_general_chat_thread_read_window(target_thread_id uuid, target_message_id uuid DEFAULT NULL::uuid, target_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_before_id uuid DEFAULT NULL::uuid, target_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_after_id uuid DEFAULT NULL::uuid, target_read_anchor boolean DEFAULT true, target_limit integer DEFAULT 50)
 RETURNS TABLE(thread_id uuid, root_message jsonb, replies jsonb, has_older boolean, has_newer boolean, anchor_status text, first_unread_message_id uuid, target_status text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_general_chat_thread_summaries(target_root_ids uuid[])
 RETURNS TABLE(thread_id uuid, summary jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_general_chat_threaded_window(target_message_id uuid DEFAULT NULL::uuid, target_last_read_message_id uuid DEFAULT NULL::uuid, target_last_read_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_limit integer DEFAULT 50)
 RETURNS TABLE(messages jsonb, pinned_messages jsonb, has_older boolean, has_newer boolean, anchor_status text, target_thread_id uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_catch_up_v1(section_limit integer DEFAULT 6, lookback_hours integer DEFAULT 168)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  bounded_limit integer := greatest(1, least(coalesce(section_limit, 6), 12));
  bounded_hours integer := greatest(24, least(coalesce(lookback_hours, 168), 336));
  effective_since timestamptz;
  result jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  effective_since := now() - make_interval(hours => bounded_hours);

  WITH
  connection_summary AS (
    SELECT public.get_my_connection_summary() AS value
  ),
  incoming_connections AS (
    SELECT
      connection_row.updated_at AS occurred_at,
      connection_row.connection_id AS stable_id,
      jsonb_build_object(
        'id', 'connection:' || connection_row.connection_id::text,
        'kind', 'connection_request',
        'occurred_at', connection_row.updated_at,
        'actor', connection_row.other_user,
        'title', coalesce(
          nullif(connection_row.other_user ->> 'display_name', ''),
          nullif(connection_row.other_user ->> 'username', ''),
          'A ShadowChat member'
        ) || ' wants to connect',
        'preview', 'Review this private Connection request.',
        'unread_count', 1,
        'target', jsonb_build_object('kind', 'connections'),
        'activity_event_ids', '[]'::jsonb
      ) AS item
    FROM public.list_my_connections(
      'incoming',
      bounded_limit,
      NULL,
      NULL
    ) connection_row
  ),
  activity_sources AS (
    SELECT
      events.*,
      public.user_public_profile_json(actor) AS actor,
      chat_message.content AS chat_content,
      dm_message.content AS dm_content,
      dm_message.conversation_id AS dm_source_conversation_id,
      pin.title AS pin_title,
      pin.description AS pin_description,
      pin_comment.body AS pin_comment_content
    FROM public.activity_events events
    JOIN public.users actor ON actor.id = events.actor_id
    LEFT JOIN public.messages chat_message ON chat_message.id = events.message_id
    LEFT JOIN public.dm_messages dm_message ON dm_message.id = events.dm_message_id
    LEFT JOIN public.shadow_pin_images pin ON pin.id = events.shadow_pin_image_id
    LEFT JOIN public.shadow_pin_comments pin_comment ON pin_comment.id = events.shadow_pin_comment_id
    WHERE events.user_id = caller_id
      AND events.read_at IS NULL
      AND events.occurred_at >= effective_since
      AND events.type IN (
        'mention', 'reply', 'reaction', 'hype_event',
        'shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply'
      )
      AND (
        (events.message_id IS NOT NULL AND chat_message.id IS NOT NULL)
        OR (events.dm_message_id IS NOT NULL AND dm_message.id IS NOT NULL)
        OR (
          events.shadow_pin_image_id IS NOT NULL
          AND pin.id IS NOT NULL
          AND (
            events.shadow_pin_comment_id IS NULL
            OR pin_comment.id IS NOT NULL
          )
        )
      )
  ),
  needs_activity AS (
    SELECT
      sources.occurred_at,
      sources.id AS stable_id,
      jsonb_build_object(
        'id', 'activity:' || sources.id::text,
        'kind', sources.type,
        'occurred_at', sources.occurred_at,
        'actor', sources.actor,
        'title', CASE sources.type
          WHEN 'mention' THEN 'You were mentioned'
          WHEN 'reply' THEN 'New reply for you'
          WHEN 'reaction' THEN 'New reaction'
          WHEN 'hype_event' THEN 'Your message was hyped'
          WHEN 'shadow_pin_comment' THEN 'New Pin comment'
          WHEN 'shadow_pin_reply' THEN 'New Pin reply'
          ELSE 'Needs your attention'
        END,
        'preview', left(coalesce(
          nullif(sources.chat_content, ''),
          nullif(sources.dm_content, ''),
          nullif(sources.pin_comment_content, ''),
          'Source content is unavailable.'
        ), 180),
        'unread_count', 1,
        'detail', CASE
          WHEN sources.type = 'reaction' AND jsonb_typeof(sources.metadata) = 'object'
            THEN jsonb_build_object('emoji', sources.metadata ->> 'emoji')
          ELSE '{}'::jsonb
        END,
        'target', CASE
          WHEN sources.dm_message_id IS NOT NULL THEN jsonb_build_object(
            'kind', 'dm_message',
            'conversation_id', sources.dm_source_conversation_id,
            'message_id', sources.dm_message_id
          )
          WHEN sources.message_id IS NOT NULL THEN jsonb_build_object(
            'kind', 'chat_message',
            'message_id', sources.message_id
          )
          ELSE jsonb_build_object(
            'kind', 'pin_comment',
            'pin_id', sources.shadow_pin_image_id,
            'comment_id', sources.shadow_pin_comment_id
          )
        END,
        'activity_event_ids', jsonb_build_array(sources.id)
      ) AS item
    FROM activity_sources sources
    WHERE sources.type IN (
      'mention',
      'reply',
      'reaction',
      'hype_event',
      'shadow_pin_comment',
      'shadow_pin_reply'
    )
  ),
  needs_combined AS (
    SELECT * FROM incoming_connections
    UNION ALL
    SELECT * FROM needs_activity
  ),
  needs_ranked AS (
    SELECT
      needs_combined.*,
      row_number() OVER (ORDER BY occurred_at DESC, stable_id DESC) AS position,
      count(*) OVER ()::integer AS total_count
    FROM needs_combined
  ),
  needs_section AS (
    SELECT jsonb_build_object(
      'id', 'needs_you',
      'title', 'Needs you',
      'shown_count', count(*) FILTER (WHERE position <= bounded_limit),
      'total_count', coalesce(max(total_count), 0)
        + greatest(
          coalesce((SELECT (value ->> 'incoming')::integer FROM connection_summary), 0)
          - (SELECT count(*) FROM incoming_connections),
          0
        ),
      'has_more', (
        coalesce(max(total_count), 0)
        + greatest(
          coalesce((SELECT (value ->> 'incoming')::integer FROM connection_summary), 0)
          - (SELECT count(*) FROM incoming_connections),
          0
        )
      ) > bounded_limit,
      'older_unread_exists', EXISTS (
        SELECT 1
        FROM public.activity_events older
        WHERE older.user_id = caller_id
          AND older.read_at IS NULL
          AND older.occurred_at < effective_since
          AND older.type IN (
            'mention', 'reply', 'reaction', 'hype_event',
            'shadow_pin_comment', 'shadow_pin_reply'
          )
          AND (
            (
              older.message_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.messages visible_message
                WHERE visible_message.id = older.message_id
              )
            )
            OR (
              older.dm_message_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.dm_messages visible_dm_message
                WHERE visible_dm_message.id = older.dm_message_id
              )
            )
            OR (
              older.shadow_pin_image_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.shadow_pin_images visible_pin
                WHERE visible_pin.id = older.shadow_pin_image_id
              )
              AND EXISTS (
                SELECT 1
                FROM public.shadow_pin_comments visible_comment
                WHERE visible_comment.id = older.shadow_pin_comment_id
              )
            )
          )
      ),
      'items', coalesce(
        jsonb_agg(item ORDER BY occurred_at DESC, stable_id DESC)
          FILTER (WHERE position <= bounded_limit),
        '[]'::jsonb
      )
    ) AS value
    FROM needs_ranked
  ),
  dm_unread_rows AS MATERIALIZED (
    SELECT
      unread_message.conversation_id,
      unread_message.id,
      count(*) OVER (PARTITION BY unread_message.conversation_id)::integer AS unread_count,
      row_number() OVER (
        PARTITION BY unread_message.conversation_id
        ORDER BY unread_message.created_at, unread_message.id
      ) AS unread_position
    FROM public.dm_messages unread_message
    WHERE unread_message.sender_id <> caller_id
      AND (
        unread_message.read_by IS NULL
        OR NOT (caller_id = ANY(unread_message.read_by))
      )
  ),
  dm_unread AS (
    SELECT
      dm_unread_rows.conversation_id,
      dm_unread_rows.unread_count,
      dm_unread_rows.id AS first_unread_id
    FROM dm_unread_rows
    WHERE dm_unread_rows.unread_position = 1
  ),
  dm_candidates AS (
    SELECT
      conversations.id AS conversation_id,
      latest_message.created_at AS occurred_at,
      latest_message.id AS stable_id,
      coalesce(unread.unread_count, 0) AS unread_count,
      coalesce(unread.first_unread_id, latest_message.id) AS target_message_id,
      preferences.marked_unread_at IS NOT NULL AS manually_unread,
      public.user_public_profile_json(other_user) AS actor,
      left(coalesce(nullif(latest_message.content, ''), 'Sent an attachment'), 180) AS preview
    FROM public.dm_conversations conversations
    JOIN public.users other_user
      ON other_user.id = CASE
        WHEN conversations.participants[1] = caller_id THEN conversations.participants[2]
        ELSE conversations.participants[1]
      END
    LEFT JOIN public.dm_conversation_preferences preferences
      ON preferences.user_id = caller_id
      AND preferences.conversation_id = conversations.id
    JOIN LATERAL (
      SELECT messages.id, messages.content, messages.created_at
      FROM public.dm_messages messages
      WHERE messages.conversation_id = conversations.id
      ORDER BY messages.created_at DESC, messages.id DESC
      LIMIT 1
    ) latest_message ON true
    LEFT JOIN dm_unread unread ON unread.conversation_id = conversations.id
    WHERE caller_id = ANY(conversations.participants)
      AND NOT private.users_have_block(caller_id, other_user.id)
      AND (coalesce(unread.unread_count, 0) > 0 OR preferences.marked_unread_at IS NOT NULL)
  ),
  dm_ranked AS (
    SELECT
      dm_candidates.*,
      row_number() OVER (ORDER BY occurred_at DESC, stable_id DESC) AS position,
      count(*) OVER ()::integer AS total_count
    FROM dm_candidates
  ),
  dm_section AS (
    SELECT jsonb_build_object(
      'id', 'direct_messages',
      'title', 'Direct messages',
      'shown_count', count(*) FILTER (WHERE position <= bounded_limit),
      'total_count', coalesce(max(total_count), 0),
      'has_more', coalesce(max(total_count), 0) > bounded_limit,
      'older_unread_exists', false,
      'items', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', 'dm:' || conversation_id::text,
            'kind', 'dm_conversation',
            'occurred_at', occurred_at,
            'actor', actor,
            'title', coalesce(
              nullif(actor ->> 'display_name', ''),
              nullif(actor ->> 'username', ''),
              'Direct message'
            ),
            'preview', preview,
            'unread_count', unread_count,
            'manually_unread', manually_unread,
            'target', jsonb_build_object(
              'kind', 'dm_message',
              'conversation_id', conversation_id,
              'message_id', target_message_id
            ),
            'activity_event_ids', '[]'::jsonb
          )
          ORDER BY occurred_at DESC, stable_id DESC
        ) FILTER (WHERE position <= bounded_limit),
        '[]'::jsonb
      )
    ) AS value
    FROM dm_ranked
  ),
  general_boundary AS (
    SELECT
      (
        SELECT cursors.last_read_at
        FROM public.user_read_cursors cursors
        WHERE cursors.user_id = caller_id
          AND cursors.surface = 'general_chat'
          AND cursors.scope_id = 'main'
        LIMIT 1
      ) AS last_read_at,
      (
        SELECT cursors.last_read_message_id
        FROM public.user_read_cursors cursors
        WHERE cursors.user_id = caller_id
          AND cursors.surface = 'general_chat'
          AND cursors.scope_id = 'main'
        LIMIT 1
      ) AS last_read_message_id
  ),
  general_candidates AS (
    SELECT
      messages.id AS message_id,
      messages.created_at AS occurred_at,
      messages.id AS stable_id,
      public.user_public_profile_json(author) AS actor,
      left(coalesce(nullif(messages.content, ''), 'Sent an attachment'), 180) AS preview
    FROM public.messages messages
    JOIN public.users author ON author.id = messages.user_id
    CROSS JOIN general_boundary boundary
    WHERE messages.user_id <> caller_id
      AND messages.created_at >= effective_since
      AND NOT EXISTS (
        SELECT 1
        FROM public.general_chat_thread_replies mapping
        WHERE mapping.message_id = messages.id
      )
      AND (
        boundary.last_read_at IS NULL
        OR (messages.created_at, messages.id) > (
          boundary.last_read_at,
          coalesce(
            boundary.last_read_message_id,
            '00000000-0000-0000-0000-000000000000'::uuid
          )
        )
      )
  ),
  general_ranked AS (
    SELECT
      general_candidates.*,
      row_number() OVER (ORDER BY occurred_at DESC, stable_id DESC) AS position,
      count(*) OVER ()::integer AS total_count
    FROM general_candidates
  ),
  general_section AS (
    SELECT jsonb_build_object(
      'id', 'general_chat',
      'title', 'General Chat',
      'shown_count', count(*) FILTER (WHERE position <= bounded_limit),
      'total_count', coalesce(max(total_count), 0),
      'has_more', coalesce(max(total_count), 0) > bounded_limit,
      'older_unread_exists', EXISTS (
        SELECT 1
        FROM public.messages older_message
        CROSS JOIN general_boundary boundary
        WHERE older_message.user_id <> caller_id
          AND older_message.created_at < effective_since
          AND NOT EXISTS (
            SELECT 1
            FROM public.general_chat_thread_replies mapping
            WHERE mapping.message_id = older_message.id
          )
          AND (
            boundary.last_read_at IS NULL
            OR (older_message.created_at, older_message.id) > (
              boundary.last_read_at,
              coalesce(
                boundary.last_read_message_id,
                '00000000-0000-0000-0000-000000000000'::uuid
              )
            )
          )
      ),
      'items', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', 'chat:' || message_id::text,
            'kind', 'chat_message',
            'occurred_at', occurred_at,
            'actor', actor,
            'title', coalesce(
              nullif(actor ->> 'display_name', ''),
              nullif(actor ->> 'username', ''),
              'General Chat'
            ),
            'preview', preview,
            'unread_count', 1,
            'target', jsonb_build_object(
              'kind', 'chat_message',
              'message_id', message_id
            ),
            'activity_event_ids', '[]'::jsonb
          )
          ORDER BY occurred_at DESC, stable_id DESC
        ) FILTER (WHERE position <= bounded_limit),
        '[]'::jsonb
      )
    ) AS value
    FROM general_ranked
  ),
  pin_activity AS (
    SELECT
      sources.occurred_at,
      sources.id AS stable_id,
      sources.id AS activity_event_id,
      sources.shadow_pin_image_id AS pin_id,
      sources.actor,
      left(coalesce(
        nullif(sources.pin_title, ''),
        nullif(sources.pin_description, ''),
        'New ShadowPin post'
      ), 180) AS preview
    FROM activity_sources sources
    WHERE sources.type = 'shadow_pin_post'
  ),
  pin_ranked AS (
    SELECT
      pin_activity.*,
      row_number() OVER (ORDER BY occurred_at DESC, stable_id DESC) AS position,
      count(*) OVER ()::integer AS total_count
    FROM pin_activity
  ),
  pin_section AS (
    SELECT jsonb_build_object(
      'id', 'shadow_pin',
      'title', 'ShadowPin',
      'shown_count', count(*) FILTER (WHERE position <= bounded_limit),
      'total_count', coalesce(max(total_count), 0),
      'has_more', coalesce(max(total_count), 0) > bounded_limit,
      'older_unread_exists', EXISTS (
        SELECT 1
        FROM public.activity_events older
        WHERE older.user_id = caller_id
          AND older.read_at IS NULL
          AND older.occurred_at < effective_since
          AND older.type = 'shadow_pin_post'
          AND EXISTS (
            SELECT 1
            FROM public.shadow_pin_images visible_pin
            WHERE visible_pin.id = older.shadow_pin_image_id
          )
      ),
      'items', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', 'pin:' || activity_event_id::text,
            'kind', 'shadow_pin_post',
            'occurred_at', occurred_at,
            'actor', actor,
            'title', 'New from ' || coalesce(
              nullif(actor ->> 'display_name', ''),
              nullif(actor ->> 'username', ''),
              'a ShadowChat member'
            ),
            'preview', preview,
            'unread_count', 1,
            'target', jsonb_build_object('kind', 'pin', 'pin_id', pin_id),
            'activity_event_ids', jsonb_build_array(activity_event_id)
          )
          ORDER BY occurred_at DESC, stable_id DESC
        ) FILTER (WHERE position <= bounded_limit),
        '[]'::jsonb
      )
    ) AS value
    FROM pin_ranked
  )
  SELECT jsonb_build_object(
    'schema_version', 1,
    'generated_at', now(),
    'effective_since', effective_since,
    'lookback_hours', bounded_hours,
    'source_linked', true,
    'ai_generated', false,
    'section_order', jsonb_build_array(
      'needs_you', 'direct_messages', 'general_chat', 'shadow_pin'
    ),
    'sections', jsonb_build_object(
      'needs_you', (SELECT value FROM needs_section),
      'direct_messages', (SELECT value FROM dm_section),
      'general_chat', (SELECT value FROM general_section),
      'shadow_pin', (SELECT value FROM pin_section)
    )
  )
  INTO result;

  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.list_dm_shared_content(target_conversation_id uuid, content_filter text DEFAULT 'all'::text, result_limit integer DEFAULT 30, before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, before_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, content_kind text, file_url text, thumbnail_url text, audio_url text, audio_duration integer, media_width integer, media_height integer, created_at timestamp with time zone, sender jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  bounded_limit integer := greatest(1, least(coalesce(result_limit, 30), 50));
  normalized_filter text := lower(trim(coalesce(content_filter, 'all')));
begin
  if target_conversation_id is null then
    raise exception 'Conversation is required';
  end if;

  if normalized_filter not in ('all', 'media', 'files', 'links') then
    raise exception 'Shared content filter must be all, media, files, or links';
  end if;

  if (before_created_at is null) <> (before_id is null) then
    raise exception 'Shared content cursor must include both created_at and id';
  end if;

  if not exists (
    select 1
    from public.dm_conversations conversations
    where conversations.id = target_conversation_id
  ) then
    raise exception using errcode = '42501', message = 'Conversation is unavailable';
  end if;

  return query
  with classified as (
    select
      messages.*,
      case
        when messages.message_type = 'file' then 'files'
        when messages.message_type in ('image', 'video', 'audio')
          or messages.audio_url is not null then 'media'
        when messages.content ~* 'https?://[^[:space:]]+' then 'links'
        else null
      end as resolved_kind
    from public.dm_messages messages
    where messages.conversation_id = target_conversation_id
      and (
        messages.message_type in ('image', 'video', 'audio', 'file')
        or messages.audio_url is not null
        or messages.content ~* 'https?://[^[:space:]]+'
      )
      and (
        before_created_at is null
        or (messages.created_at, messages.id) < (before_created_at, before_id)
      )
  )
  select
    classified.id,
    classified.conversation_id,
    classified.sender_id,
    classified.content,
    classified.message_type,
    classified.resolved_kind,
    classified.file_url,
    classified.thumbnail_url,
    classified.audio_url,
    classified.audio_duration,
    classified.media_width,
    classified.media_height,
    classified.created_at,
    public.user_public_profile_json(profiles) as sender
  from classified
  join public.users profiles on profiles.id = classified.sender_id
  where normalized_filter = 'all' or classified.resolved_kind = normalized_filter
  order by classified.created_at desc, classified.id desc
  limit bounded_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_my_saved_discovery_items(collection_filter uuid DEFAULT NULL::uuid, result_limit integer DEFAULT 100)
 RETURNS TABLE(saved_id uuid, target_kind text, target_id uuid, parent_id uuid, target_slug text, parent_slug text, title text, subtitle text, description text, thumbnail_url text, thumbnail_path text, creator jsonb, collection_id uuid, note text, saved_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH visible_saves AS (
    SELECT
      saves.id AS saved_id,
      'shadow_pin'::pg_catalog.text AS target_kind,
      images.id AS target_id,
      images.category_id AS parent_id,
      NULL::pg_catalog.text AS target_slug,
      NULL::pg_catalog.text AS parent_slug,
      images.title,
      NULL::pg_catalog.text AS subtitle,
      images.description,
      coalesce(images.thumbnail_url, images.medium_url, images.image_url) AS thumbnail_url,
      coalesce(images.thumbnail_path, images.medium_path, images.image_path) AS thumbnail_path,
      CASE
        WHEN profiles.id IS NULL THEN NULL::pg_catalog.jsonb
        ELSE public.user_public_profile_json(profiles)
      END AS creator,
      saves.collection_id,
      saves.note,
      saves.created_at AS saved_at
    FROM public.saved_discovery_items saves
    JOIN public.shadow_pin_images images ON images.id = saves.shadow_pin_image_id
    JOIN public.shadow_pin_categories categories ON categories.id = images.category_id
    LEFT JOIN public.users profiles ON profiles.id = images.creator_id
    WHERE saves.user_id = (select auth.uid())
      AND saves.target_kind = 'shadow_pin'
      AND ($1 IS NULL OR saves.collection_id = $1)
      AND images.deleted_at IS NULL
      AND categories.deleted_at IS NULL
      AND NOT private.users_have_block((select auth.uid()), images.creator_id)

    UNION ALL

    SELECT
      saves.id AS saved_id,
      'shado_tv_video'::pg_catalog.text AS target_kind,
      videos.id AS target_id,
      channels.id AS parent_id,
      videos.slug AS target_slug,
      channels.slug AS parent_slug,
      videos.title,
      videos.subtitle,
      videos.description,
      coalesce(videos.thumbnail_asset_url, videos.poster_asset_url) AS thumbnail_url,
      coalesce(videos.thumbnail_asset_path, videos.poster_asset_path) AS thumbnail_path,
      NULL::pg_catalog.jsonb AS creator,
      saves.collection_id,
      saves.note,
      saves.created_at AS saved_at
    FROM public.saved_discovery_items saves
    JOIN public.shado_tv_videos videos ON videos.id = saves.shado_tv_video_id
    JOIN public.shado_tv_channels channels ON channels.id = videos.channel_id
    WHERE saves.user_id = (select auth.uid())
      AND saves.target_kind = 'shado_tv_video'
      AND ($1 IS NULL OR saves.collection_id = $1)
      AND videos.deleted_at IS NULL
      AND videos.visibility_status = 'published'
      AND channels.deleted_at IS NULL
      AND channels.visibility_status = 'published'

    UNION ALL

    SELECT
      saves.id AS saved_id,
      'shadow_mystery_story'::pg_catalog.text AS target_kind,
      stories.id AS target_id,
      NULL::pg_catalog.uuid AS parent_id,
      stories.slug AS target_slug,
      NULL::pg_catalog.text AS parent_slug,
      stories.title,
      stories.subtitle,
      stories.deck AS description,
      NULL::pg_catalog.text AS thumbnail_url,
      cover.storage_path AS thumbnail_path,
      NULL::pg_catalog.jsonb AS creator,
      saves.collection_id,
      saves.note,
      saves.created_at AS saved_at
    FROM public.saved_discovery_items saves
    JOIN public.shadow_mystery_stories stories ON stories.id = saves.shadow_mystery_story_id
    LEFT JOIN LATERAL (
      SELECT images.storage_path
      FROM public.shadow_mystery_images images
      WHERE images.story_id = stories.id
        AND images.role = 'cover'
      ORDER BY images.created_at, images.id
      LIMIT 1
    ) cover ON true
    WHERE saves.user_id = (select auth.uid())
      AND saves.target_kind = 'shadow_mystery_story'
      AND ($1 IS NULL OR saves.collection_id = $1)
      AND stories.status = 'published'
      AND stories.published_at IS NOT NULL
  )
  SELECT *
  FROM visible_saves
  ORDER BY saved_at DESC, saved_id DESC
  LIMIT greatest(1, least(coalesce($2, 100), 200));
$function$
;

CREATE OR REPLACE FUNCTION public.list_my_saved_messages(collection_filter uuid DEFAULT NULL::uuid, result_limit integer DEFAULT 100)
 RETURNS TABLE(saved_id uuid, message_source text, message_id uuid, conversation_id uuid, content text, message_type text, file_url text, thumbnail_url text, message_created_at timestamp with time zone, author jsonb, collection_id uuid, note text, saved_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH saved_rows AS (
    SELECT
      saves.id AS saved_id,
      'general'::text AS message_source,
      messages.id AS message_id,
      NULL::uuid AS conversation_id,
      messages.content,
      messages.message_type,
      messages.file_url,
      messages.thumbnail_url,
      messages.created_at AS message_created_at,
      public.user_public_profile_json(profiles) AS author,
      saves.collection_id,
      saves.note,
      saves.created_at AS saved_at
    FROM public.saved_messages saves
    JOIN public.messages messages ON messages.id = saves.general_message_id
    JOIN public.users profiles ON profiles.id = messages.user_id
    WHERE saves.user_id = (select auth.uid())
      AND saves.message_source = 'general'
      AND ($1 IS NULL OR saves.collection_id = $1)

    UNION ALL

    SELECT
      saves.id AS saved_id,
      'dm'::text AS message_source,
      direct_messages.id AS message_id,
      direct_messages.conversation_id,
      direct_messages.content,
      direct_messages.message_type,
      direct_messages.file_url,
      direct_messages.thumbnail_url,
      direct_messages.created_at AS message_created_at,
      public.user_public_profile_json(profiles) AS author,
      saves.collection_id,
      saves.note,
      saves.created_at AS saved_at
    FROM public.saved_messages saves
    JOIN public.dm_messages direct_messages ON direct_messages.id = saves.dm_message_id
    JOIN public.users profiles ON profiles.id = direct_messages.sender_id
    WHERE saves.user_id = (select auth.uid())
      AND saves.message_source = 'dm'
      AND ($1 IS NULL OR saves.collection_id = $1)
  )
  SELECT *
  FROM saved_rows
  ORDER BY saved_at DESC, saved_id DESC
  LIMIT greatest(1, least(coalesce($2, 100), 200));
$function$
;

CREATE OR REPLACE FUNCTION public.search_dm_conversation_messages(target_conversation_id uuid, search_query text, result_limit integer DEFAULT 30, before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, before_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, file_url text, thumbnail_url text, audio_url text, audio_duration integer, reply_to uuid, reactions jsonb, edited_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, sender jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  bounded_limit integer := greatest(1, least(coalesce(result_limit, 30), 50));
  normalized_query text := left(trim(coalesce(search_query, '')), 200);
begin
  if target_conversation_id is null then
    raise exception 'Conversation is required';
  end if;

  if normalized_query = '' then
    return;
  end if;

  if (before_created_at is null) <> (before_id is null) then
    raise exception 'DM search cursor must include both created_at and id';
  end if;

  if not exists (
    select 1
    from public.dm_conversations conversations
    where conversations.id = target_conversation_id
  ) then
    raise exception using errcode = '42501', message = 'Conversation is unavailable';
  end if;

  return query
  select
    messages.id,
    messages.conversation_id,
    messages.sender_id,
    messages.content,
    messages.message_type,
    messages.file_url,
    messages.thumbnail_url,
    messages.audio_url,
    messages.audio_duration,
    messages.reply_to,
    messages.reactions,
    messages.edited_at,
    messages.created_at,
    messages.updated_at,
    public.user_public_profile_json(profiles) as sender
  from public.dm_messages messages
  join public.users profiles on profiles.id = messages.sender_id
  where messages.conversation_id = target_conversation_id
    and to_tsvector('simple', coalesce(messages.content, ''))
      @@ websearch_to_tsquery('simple', normalized_query)
    and (
      before_created_at is null
      or (messages.created_at, messages.id) < (before_created_at, before_id)
    )
  order by messages.created_at desc, messages.id desc
  limit bounded_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_my_messages(search_query text, result_limit integer DEFAULT 40, before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(message_source text, message_id uuid, conversation_id uuid, content text, message_type text, file_url text, thumbnail_url text, created_at timestamp with time zone, author jsonb, is_saved boolean, collection_id uuid, search_rank real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH query AS (
    SELECT websearch_to_tsquery('simple', left(trim($1), 200)) AS value
  ),
  visible_messages AS (
    SELECT
      'general'::text AS message_source,
      messages.id AS message_id,
      NULL::uuid AS conversation_id,
      messages.content,
      messages.message_type,
      messages.file_url,
      messages.thumbnail_url,
      messages.created_at,
      public.user_public_profile_json(profiles) AS author,
      saves.id IS NOT NULL AS is_saved,
      saves.collection_id,
      ts_rank_cd(to_tsvector('simple', coalesce(messages.content, '')), query.value) AS search_rank
    FROM public.messages messages
    JOIN public.users profiles ON profiles.id = messages.user_id
    CROSS JOIN query
    LEFT JOIN public.saved_messages saves
      ON saves.user_id = (select auth.uid())
     AND saves.general_message_id = messages.id
    WHERE trim($1) <> ''
      AND to_tsvector('simple', coalesce(messages.content, '')) @@ query.value
      AND ($3 IS NULL OR messages.created_at < $3)

    UNION ALL

    SELECT
      'dm'::text AS message_source,
      direct_messages.id AS message_id,
      direct_messages.conversation_id,
      direct_messages.content,
      direct_messages.message_type,
      direct_messages.file_url,
      direct_messages.thumbnail_url,
      direct_messages.created_at,
      public.user_public_profile_json(profiles) AS author,
      saves.id IS NOT NULL AS is_saved,
      saves.collection_id,
      ts_rank_cd(to_tsvector('simple', coalesce(direct_messages.content, '')), query.value) AS search_rank
    FROM public.dm_messages direct_messages
    JOIN public.users profiles ON profiles.id = direct_messages.sender_id
    CROSS JOIN query
    LEFT JOIN public.saved_messages saves
      ON saves.user_id = (select auth.uid())
     AND saves.dm_message_id = direct_messages.id
    WHERE trim($1) <> ''
      AND to_tsvector('simple', coalesce(direct_messages.content, '')) @@ query.value
      AND ($3 IS NULL OR direct_messages.created_at < $3)
  )
  SELECT *
  FROM visible_messages
  ORDER BY search_rank DESC, created_at DESC, message_id DESC
  LIMIT greatest(1, least(coalesce($2, 40), 100));
$function$
;
set check_function_bodies = on;
