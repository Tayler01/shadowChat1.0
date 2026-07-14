-- Deterministic, source-linked Catch-Up v1.
--
-- Activity HQ remains paused. This contract reuses its recipient-owned ledger
-- only through a bounded, on-demand invoker RPC. It adds no navigation,
-- subscription, badge query, summary table, AI request, or background work.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_catch_up_v1(
  section_limit integer DEFAULT 6,
  lookback_hours integer DEFAULT 168
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_my_catch_up_events(
  target_event_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_ids uuid[];
  changed_count integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF cardinality(coalesce(target_event_ids, ARRAY[]::uuid[])) > 50 THEN
    RAISE EXCEPTION 'At most 50 Catch-Up events may be acknowledged';
  END IF;

  SELECT coalesce(array_agg(DISTINCT requested_id), ARRAY[]::uuid[])
  INTO normalized_ids
  FROM unnest(coalesce(target_event_ids, ARRAY[]::uuid[])) requested_id
  WHERE requested_id IS NOT NULL;

  UPDATE public.activity_events events
  SET read_at = coalesce(events.read_at, now())
  WHERE events.user_id = caller_id
    AND events.id = ANY(normalized_ids)
    AND events.read_at IS NULL;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_catch_up_v1(integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.acknowledge_my_catch_up_events(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_catch_up_v1(integer, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acknowledge_my_catch_up_events(uuid[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_catch_up_v1(integer, integer) IS
  'Returns a bounded deterministic source-linked Catch-Up snapshot for the authenticated caller without enabling Activity HQ runtime work.';
COMMENT ON FUNCTION public.acknowledge_my_catch_up_events(uuid[]) IS
  'Acknowledges only the caller-owned Activity events represented by opened Catch-Up source cards.';

COMMIT;
