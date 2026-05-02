/*
  # Public channel-ban status and Shado announcements

  Active channel bans are now visible app-wide so profiles and avatars can
  show the same moderation state that the database enforces. Operators must
  provide a public reason for ban changes, Shado posts normal General Chat
  announcements for ban changes, and expired bans are swept into revoked state
  with an expiry announcement.
*/

UPDATE public.user_channel_bans
SET reason = 'No reason provided.'
WHERE revoked_at IS NULL
  AND NULLIF(trim(COALESCE(reason, '')), '') IS NULL;

ALTER TABLE public.user_channel_bans
  DROP CONSTRAINT IF EXISTS user_channel_bans_active_reason_required;

ALTER TABLE public.user_channel_bans
  ADD CONSTRAINT user_channel_bans_active_reason_required
  CHECK (
    revoked_at IS NOT NULL
    OR NULLIF(trim(COALESCE(reason, '')), '') IS NOT NULL
  );

DROP POLICY IF EXISTS "Users can read own channel bans" ON public.user_channel_bans;
DROP POLICY IF EXISTS "Authenticated users can read channel bans" ON public.user_channel_bans;

CREATE POLICY "Authenticated users can read channel bans"
ON public.user_channel_bans
FOR SELECT
TO authenticated
USING (
  (select auth.uid()) = target_user_id
  OR public.is_app_operator((select auth.uid()))
  OR (
    revoked_at IS NULL
    AND (
      expires_at IS NULL
      OR expires_at > now()
    )
  )
);

CREATE OR REPLACE FUNCTION public.channel_ban_scope_label(scope text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE scope
    WHEN 'general_chat' THEN 'General Chat'
    WHEN 'news_chat' THEN 'News Chat'
    WHEN 'news_feed' THEN 'News Feed'
    ELSE scope
  END;
$$;

CREATE OR REPLACE FUNCTION public.format_channel_ban_scopes(scopes text[])
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    string_agg(public.channel_ban_scope_label(scope_value), ', ' ORDER BY public.channel_ban_scope_label(scope_value)),
    'selected channels'
  )
  FROM unnest(COALESCE(scopes, ARRAY[]::text[])) AS scope_value;
$$;

CREATE OR REPLACE FUNCTION public.format_channel_ban_duration(expires_at_value timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN expires_at_value IS NULL THEN 'permanently'
    ELSE 'until ' || to_char(expires_at_value AT TIME ZONE 'America/New_York', 'Mon FMDD at FMHH12:MI AM') || ' ET'
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_channel_ban_block_message(
  target_user_id uuid,
  scope text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_ban public.user_channel_bans%ROWTYPE;
BEGIN
  SELECT *
  INTO active_ban
  FROM public.user_channel_bans bans
  WHERE bans.target_user_id = get_channel_ban_block_message.target_user_id
    AND bans.scope = get_channel_ban_block_message.scope
    AND bans.revoked_at IS NULL
    AND (
      bans.expires_at IS NULL
      OR bans.expires_at > now()
    )
  ORDER BY bans.created_at DESC
  LIMIT 1;

  IF active_ban.id IS NULL THEN
    RETURN 'You are banned from ' || public.channel_ban_scope_label(get_channel_ban_block_message.scope) || '.';
  END IF;

  RETURN 'You are banned from '
    || public.channel_ban_scope_label(active_ban.scope)
    || ' '
    || public.format_channel_ban_duration(active_ban.expires_at)
    || '. Reason: '
    || COALESCE(NULLIF(trim(active_ban.reason), ''), 'No reason provided.');
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_channel_ban_announcement(
  target_user_id uuid,
  action text,
  scopes text[],
  reason text DEFAULT NULL,
  expires_at_value timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  shado_user_id uuid;
  target_display_name text;
  target_username text;
  target_label text;
  scope_label text;
  cleaned_reason text;
  message_body text;
BEGIN
  SELECT users.id
  INTO shado_user_id
  FROM public.users
  WHERE users.username = 'shado_ai'
  ORDER BY users.created_at ASC
  LIMIT 1;

  IF shado_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(NULLIF(trim(users.display_name), ''), NULLIF(trim(users.username), ''), 'Unknown user'),
    NULLIF(trim(users.username), '')
  INTO target_display_name, target_username
  FROM public.users
  WHERE users.id = insert_channel_ban_announcement.target_user_id;

  target_label := target_display_name;
  IF target_username IS NOT NULL THEN
    target_label := target_label || ' (@' || target_username || ')';
  END IF;

  scope_label := public.format_channel_ban_scopes(scopes);
  cleaned_reason := COALESCE(NULLIF(trim(reason), ''), 'No reason provided.');

  message_body := CASE lower(action)
    WHEN 'banned' THEN
      'Moderation notice: ' || target_label || ' was banned from ' || scope_label || ' ' ||
      public.format_channel_ban_duration(expires_at_value) || '. Reason: ' || cleaned_reason
    WHEN 'updated' THEN
      'Moderation notice: ' || target_label || '''s channel ban was updated for ' || scope_label || ' ' ||
      public.format_channel_ban_duration(expires_at_value) || '. Reason: ' || cleaned_reason
    WHEN 'removed' THEN
      'Moderation notice: ' || target_label || '''s channel ban was removed for ' || scope_label ||
      '. Reason: ' || cleaned_reason
    WHEN 'expired' THEN
      'Moderation notice: ' || target_label || '''s channel ban expired for ' || scope_label ||
      '. Original reason: ' || cleaned_reason
    ELSE
      'Moderation notice: ' || target_label || '''s channel ban changed for ' || scope_label ||
      '. Reason: ' || cleaned_reason
  END;

  INSERT INTO public.messages (user_id, content, message_type, reactions)
  VALUES (shado_user_id, message_body, 'text', '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_user_channel_bans()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_group record;
  expired_count integer := 0;
BEGIN
  FOR expired_group IN
    WITH expired_rows AS (
      UPDATE public.user_channel_bans bans
      SET
        revoked_at = now(),
        revoked_by = NULL
      WHERE bans.revoked_at IS NULL
        AND bans.expires_at IS NOT NULL
        AND bans.expires_at <= now()
      RETURNING bans.target_user_id, bans.scope, bans.reason, bans.expires_at
    )
    SELECT
      target_user_id,
      array_agg(scope ORDER BY scope) AS scopes,
      string_agg(DISTINCT COALESCE(NULLIF(trim(reason), ''), 'No reason provided.'), '; ') AS reasons,
      max(expires_at) AS expires_at,
      count(*)::integer AS row_count
    FROM expired_rows
    GROUP BY target_user_id
  LOOP
    expired_count := expired_count + expired_group.row_count;

    PERFORM public.insert_channel_ban_announcement(
      expired_group.target_user_id,
      'expired',
      expired_group.scopes,
      expired_group.reasons,
      expired_group.expires_at
    );
  END LOOP;

  RETURN expired_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_channel_ban_announcement(uuid, text, text[], text, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_public_user_channel_bans(target_user_ids uuid[])
RETURNS TABLE (
  target_user_id uuid,
  scope text,
  reason text,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  clean_user_ids uuid[];
BEGIN
  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.expire_user_channel_bans();

  SELECT COALESCE(array_agg(DISTINCT user_id_value), ARRAY[]::uuid[])
  INTO clean_user_ids
  FROM unnest(COALESCE(target_user_ids, ARRAY[]::uuid[])) AS user_id_value
  WHERE user_id_value IS NOT NULL;

  IF array_length(clean_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    bans.target_user_id,
    bans.scope,
    bans.reason,
    bans.expires_at,
    bans.created_at
  FROM public.user_channel_bans bans
  WHERE bans.target_user_id = ANY(clean_user_ids)
    AND bans.revoked_at IS NULL
    AND (
      bans.expires_at IS NULL
      OR bans.expires_at > now()
    )
  ORDER BY bans.target_user_id, bans.scope ASC, bans.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_user_channel_bans(target_user_id uuid)
RETURNS SETOF public.user_channel_bans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
BEGIN
  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.expire_user_channel_bans();

  IF actor_user_id <> list_user_channel_bans.target_user_id
    AND NOT public.is_app_operator(actor_user_id) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  RETURN QUERY
  SELECT active_bans.*
  FROM public.user_channel_bans active_bans
  WHERE active_bans.target_user_id = list_user_channel_bans.target_user_id
    AND active_bans.revoked_at IS NULL
    AND (
      active_bans.expires_at IS NULL
      OR active_bans.expires_at > now()
    )
  ORDER BY active_bans.scope ASC, active_bans.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_channel_bans(
  target_user_id uuid,
  scopes text[],
  duration_minutes integer DEFAULT NULL,
  reason text DEFAULT NULL
)
RETURNS SETOF public.user_channel_bans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  clean_scopes text[];
  current_scopes text[];
  announcement_scopes text[];
  expires_at_value timestamptz;
  invalid_scope text;
  normalized_reason text;
  target_admin_role text;
  action_label text;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_operator(actor_user_id) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  PERFORM public.expire_user_channel_bans();

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  SELECT users.admin_role
  INTO target_admin_role
  FROM public.users
  WHERE users.id = set_user_channel_bans.target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF actor_user_id = set_user_channel_bans.target_user_id THEN
    RAISE EXCEPTION 'Admins cannot ban themselves';
  END IF;

  IF target_admin_role = 'admin' THEN
    RAISE EXCEPTION 'The full admin account cannot be channel banned';
  END IF;

  IF target_admin_role = 'sub_admin' AND NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION 'Only the full admin can channel ban a sub-admin';
  END IF;

  IF duration_minutes IS NOT NULL AND duration_minutes <= 0 THEN
    RAISE EXCEPTION 'Duration must be positive';
  END IF;

  normalized_reason := NULLIF(trim(COALESCE(set_user_channel_bans.reason, '')), '');

  SELECT COALESCE(array_agg(DISTINCT normalized_scope ORDER BY normalized_scope), ARRAY[]::text[])
  INTO clean_scopes
  FROM (
    SELECT lower(trim(scope_value)) AS normalized_scope
    FROM unnest(COALESCE(scopes, ARRAY[]::text[])) AS scope_value
    WHERE trim(scope_value) <> ''
  ) normalized;

  SELECT normalized_scope
  INTO invalid_scope
  FROM unnest(clean_scopes) AS normalized_scope
  WHERE normalized_scope NOT IN ('general_chat', 'news_chat', 'news_feed')
  LIMIT 1;

  IF invalid_scope IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid channel ban scope: %', invalid_scope;
  END IF;

  PERFORM 1
  FROM public.user_channel_bans active_bans
  WHERE active_bans.target_user_id = set_user_channel_bans.target_user_id
    AND active_bans.revoked_at IS NULL
    AND (
      active_bans.expires_at IS NULL
      OR active_bans.expires_at > now()
    )
  FOR UPDATE;

  SELECT COALESCE(array_agg(active_bans.scope ORDER BY active_bans.scope), ARRAY[]::text[])
  INTO current_scopes
  FROM public.user_channel_bans active_bans
  WHERE active_bans.target_user_id = set_user_channel_bans.target_user_id
    AND active_bans.revoked_at IS NULL
    AND (
      active_bans.expires_at IS NULL
      OR active_bans.expires_at > now()
    );

  IF (cardinality(clean_scopes) > 0 OR cardinality(current_scopes) > 0)
    AND normalized_reason IS NULL THEN
    RAISE EXCEPTION 'A public ban reason is required';
  END IF;

  IF cardinality(clean_scopes) = 0 AND cardinality(current_scopes) = 0 THEN
    RETURN;
  END IF;

  expires_at_value := CASE
    WHEN cardinality(clean_scopes) = 0 THEN NULL
    WHEN duration_minutes IS NULL THEN NULL
    ELSE now() + make_interval(mins => duration_minutes)
  END;

  UPDATE public.user_channel_bans active_bans
  SET
    revoked_at = now(),
    revoked_by = actor_user_id
  WHERE active_bans.target_user_id = set_user_channel_bans.target_user_id
    AND active_bans.revoked_at IS NULL
    AND active_bans.scope IN ('general_chat', 'news_chat', 'news_feed');

  INSERT INTO public.user_channel_bans (
    target_user_id,
    scope,
    banned_by,
    reason,
    expires_at
  )
  SELECT
    set_user_channel_bans.target_user_id,
    normalized_scope,
    actor_user_id,
    normalized_reason,
    expires_at_value
  FROM unnest(clean_scopes) AS normalized_scope;

  announcement_scopes := CASE
    WHEN cardinality(clean_scopes) > 0 THEN clean_scopes
    ELSE current_scopes
  END;

  action_label := CASE
    WHEN cardinality(clean_scopes) = 0 THEN 'removed'
    WHEN cardinality(current_scopes) = 0 THEN 'banned'
    ELSE 'updated'
  END;

  PERFORM public.insert_channel_ban_announcement(
    set_user_channel_bans.target_user_id,
    action_label,
    announcement_scopes,
    normalized_reason,
    expires_at_value
  );

  RETURN QUERY
  SELECT active_bans.*
  FROM public.user_channel_bans active_bans
  WHERE active_bans.target_user_id = set_user_channel_bans.target_user_id
    AND active_bans.revoked_at IS NULL
    AND (
      active_bans.expires_at IS NULL
      OR active_bans.expires_at > now()
    )
  ORDER BY active_bans.scope ASC, active_bans.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_message_reaction_v2(
  message_id uuid,
  emoji text,
  is_dm boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  existing_reaction_id uuid;
  current_reactions jsonb;
  emoji_data jsonb;
  new_reactions jsonb;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF is_dm = false AND public.is_user_channel_banned(current_user_id, 'general_chat') THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(current_user_id, 'general_chat');
  END IF;

  SELECT id INTO existing_reaction_id
  FROM public.message_reactions
  WHERE (
      (is_dm = false AND public.message_reactions.message_id = toggle_message_reaction_v2.message_id)
      OR
      (is_dm = true AND public.message_reactions.dm_message_id = toggle_message_reaction_v2.message_id)
    )
    AND public.message_reactions.user_id = current_user_id
    AND public.message_reactions.emoji = toggle_message_reaction_v2.emoji;

  IF existing_reaction_id IS NOT NULL THEN
    DELETE FROM public.message_reactions WHERE id = existing_reaction_id;

    IF is_dm THEN
      SELECT reactions INTO current_reactions FROM public.dm_messages WHERE id = message_id;

      emoji_data := current_reactions -> emoji;
      IF emoji_data IS NOT NULL THEN
        emoji_data := jsonb_build_object(
          'count', GREATEST(0, (emoji_data->>'count')::int - 1),
          'users', COALESCE(
            (
              SELECT jsonb_agg(user_id)
              FROM jsonb_array_elements_text(emoji_data->'users') AS user_id
              WHERE user_id::uuid != current_user_id
            ),
            '[]'::jsonb
          )
        );

        IF (emoji_data->>'count')::int <= 0 THEN
          new_reactions := current_reactions - emoji;
        ELSE
          new_reactions := current_reactions || jsonb_build_object(emoji, emoji_data);
        END IF;

        UPDATE public.dm_messages SET reactions = new_reactions WHERE id = message_id;
      END IF;
    ELSE
      SELECT reactions INTO current_reactions FROM public.messages WHERE id = message_id;

      emoji_data := current_reactions -> emoji;
      IF emoji_data IS NOT NULL THEN
        emoji_data := jsonb_build_object(
          'count', GREATEST(0, (emoji_data->>'count')::int - 1),
          'users', COALESCE(
            (
              SELECT jsonb_agg(user_id)
              FROM jsonb_array_elements_text(emoji_data->'users') AS user_id
              WHERE user_id::uuid != current_user_id
            ),
            '[]'::jsonb
          )
        );

        IF (emoji_data->>'count')::int <= 0 THEN
          new_reactions := current_reactions - emoji;
        ELSE
          new_reactions := current_reactions || jsonb_build_object(emoji, emoji_data);
        END IF;

        UPDATE public.messages SET reactions = new_reactions WHERE id = message_id;
      END IF;
    END IF;
  ELSE
    INSERT INTO public.message_reactions (message_id, dm_message_id, user_id, emoji)
    VALUES (
      CASE WHEN is_dm THEN NULL ELSE message_id END,
      CASE WHEN is_dm THEN message_id ELSE NULL END,
      current_user_id,
      emoji
    );

    IF is_dm THEN
      SELECT COALESCE(reactions, '{}'::jsonb) INTO current_reactions FROM public.dm_messages WHERE id = message_id;
    ELSE
      SELECT COALESCE(reactions, '{}'::jsonb) INTO current_reactions FROM public.messages WHERE id = message_id;
    END IF;

    emoji_data := current_reactions -> emoji;
    IF emoji_data IS NULL THEN
      emoji_data := jsonb_build_object(
        'count', 1,
        'users', jsonb_build_array(current_user_id)
      );
    ELSE
      emoji_data := jsonb_build_object(
        'count', (emoji_data->>'count')::int + 1,
        'users', (emoji_data->'users') || jsonb_build_array(current_user_id)
      );
    END IF;

    new_reactions := current_reactions || jsonb_build_object(emoji, emoji_data);

    IF is_dm THEN
      UPDATE public.dm_messages SET reactions = new_reactions WHERE id = message_id;
    ELSE
      UPDATE public.messages SET reactions = new_reactions WHERE id = message_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_news_feed_reaction(feed_item_id uuid, emoji text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  existing_reaction_id uuid;
  next_reactions jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_user_channel_banned(current_user_id, 'news_feed') THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(current_user_id, 'news_feed');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.news_feed_items
    WHERE id = feed_item_id
      AND hidden = false
      AND visible_day = ((now() AT TIME ZONE 'America/New_York')::date)
  ) THEN
    RAISE EXCEPTION 'News feed item is not available';
  END IF;

  SELECT id INTO existing_reaction_id
  FROM public.news_feed_reactions
  WHERE news_feed_reactions.feed_item_id = toggle_news_feed_reaction.feed_item_id
    AND user_id = current_user_id
    AND news_feed_reactions.emoji = toggle_news_feed_reaction.emoji;

  IF existing_reaction_id IS NOT NULL THEN
    DELETE FROM public.news_feed_reactions WHERE id = existing_reaction_id;
  ELSE
    INSERT INTO public.news_feed_reactions (feed_item_id, user_id, emoji)
    VALUES (feed_item_id, current_user_id, emoji);
  END IF;

  next_reactions := public.aggregate_news_feed_reactions(feed_item_id);

  UPDATE public.news_feed_items
  SET reactions = next_reactions
  WHERE id = feed_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_news_chat_reaction(chat_message_id uuid, emoji text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  existing_reaction_id uuid;
  next_reactions jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_user_channel_banned(current_user_id, 'news_chat') THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(current_user_id, 'news_chat');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.news_chat_messages
    WHERE id = chat_message_id
  ) THEN
    RAISE EXCEPTION 'News chat message is not available';
  END IF;

  SELECT id INTO existing_reaction_id
  FROM public.news_chat_reactions
  WHERE news_chat_reactions.chat_message_id = toggle_news_chat_reaction.chat_message_id
    AND user_id = current_user_id
    AND news_chat_reactions.emoji = toggle_news_chat_reaction.emoji;

  IF existing_reaction_id IS NOT NULL THEN
    DELETE FROM public.news_chat_reactions WHERE id = existing_reaction_id;
  ELSE
    INSERT INTO public.news_chat_reactions (chat_message_id, user_id, emoji)
    VALUES (chat_message_id, current_user_id, emoji);
  END IF;

  next_reactions := public.aggregate_news_chat_reactions(chat_message_id);

  UPDATE public.news_chat_messages
  SET reactions = next_reactions
  WHERE id = chat_message_id;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_channel_bans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_channel_bans;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.channel_ban_scope_label(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.format_channel_ban_scopes(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.format_channel_ban_duration(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_channel_ban_block_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_user_channel_bans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_user_channel_bans(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_channel_bans(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_channel_bans(uuid, text[], integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_message_reaction_v2(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_message_reaction(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_news_feed_reaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_news_chat_reaction(uuid, text) TO authenticated;
