/*
  # Channel ban moderation

  Adds app-wide moderation controls for channel and board bans. Operators can
  manage active bans from profile popups, while RLS and reaction RPC checks
  enforce the bans at the database boundary.
*/

CREATE TABLE IF NOT EXISTS public.user_channel_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('general_chat', 'news_chat', 'news_feed')),
  banned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason text,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_channel_bans_target_scope_idx
  ON public.user_channel_bans (target_user_id, scope, created_at DESC);

CREATE INDEX IF NOT EXISTS user_channel_bans_active_lookup_idx
  ON public.user_channel_bans (target_user_id, scope, expires_at)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_channel_bans_one_open_scope_idx
  ON public.user_channel_bans (target_user_id, scope)
  WHERE revoked_at IS NULL;

ALTER TABLE public.user_channel_bans ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_user_channel_bans_updated_at ON public.user_channel_bans;
CREATE TRIGGER update_user_channel_bans_updated_at
  BEFORE UPDATE ON public.user_channel_bans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Users can read own channel bans" ON public.user_channel_bans;
DROP POLICY IF EXISTS "App operators can insert channel bans" ON public.user_channel_bans;
DROP POLICY IF EXISTS "App operators can update channel bans" ON public.user_channel_bans;

CREATE POLICY "Users can read own channel bans"
ON public.user_channel_bans
FOR SELECT
TO authenticated
USING (
  (select auth.uid()) = target_user_id
  OR public.is_app_operator((select auth.uid()))
);

CREATE POLICY "App operators can insert channel bans"
ON public.user_channel_bans
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_operator((select auth.uid())));

CREATE POLICY "App operators can update channel bans"
ON public.user_channel_bans
FOR UPDATE
TO authenticated
USING (public.is_app_operator((select auth.uid())))
WITH CHECK (public.is_app_operator((select auth.uid())));

CREATE OR REPLACE FUNCTION public.is_user_channel_banned(target_user_id uuid, scope text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_channel_bans active_bans
    WHERE active_bans.target_user_id = is_user_channel_banned.target_user_id
      AND active_bans.scope = is_user_channel_banned.scope
      AND active_bans.revoked_at IS NULL
      AND (
        active_bans.expires_at IS NULL
        OR active_bans.expires_at > now()
      )
  );
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
  expires_at_value timestamptz;
  invalid_scope text;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_operator(actor_user_id) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  IF actor_user_id = set_user_channel_bans.target_user_id THEN
    RAISE EXCEPTION 'Admins cannot ban themselves';
  END IF;

  IF public.is_app_admin(set_user_channel_bans.target_user_id) THEN
    RAISE EXCEPTION 'The full admin account cannot be channel banned';
  END IF;

  IF duration_minutes IS NOT NULL AND duration_minutes <= 0 THEN
    RAISE EXCEPTION 'Duration must be positive';
  END IF;

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

  expires_at_value := CASE
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
    NULLIF(trim(set_user_channel_bans.reason), ''),
    expires_at_value
  FROM unnest(clean_scopes) AS normalized_scope;

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

DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.messages;
CREATE POLICY "Authenticated users can insert messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'general_chat')
);

DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
CREATE POLICY "Users can update own messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'general_chat')
)
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'general_chat')
);

DROP POLICY IF EXISTS "Users can add own message reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can add own reactions" ON public.message_reactions;
CREATE POLICY "Users can add own message reactions"
ON public.message_reactions
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND (
    dm_message_id IS NOT NULL
    OR NOT public.is_user_channel_banned((select auth.uid()), 'general_chat')
  )
);

DROP POLICY IF EXISTS "Users can insert own news chat messages" ON public.news_chat_messages;
CREATE POLICY "Users can insert own news chat messages"
ON public.news_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'news_chat')
);

DROP POLICY IF EXISTS "Users can update own news chat messages" ON public.news_chat_messages;
CREATE POLICY "Users can update own news chat messages"
ON public.news_chat_messages
FOR UPDATE
TO authenticated
USING (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'news_chat')
)
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'news_chat')
);

DROP POLICY IF EXISTS "Users can add own feed reactions" ON public.news_feed_reactions;
CREATE POLICY "Users can add own feed reactions"
ON public.news_feed_reactions
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'news_feed')
);

DROP POLICY IF EXISTS "Users can add own news chat reactions" ON public.news_chat_reactions;
CREATE POLICY "Users can add own news chat reactions"
ON public.news_chat_reactions
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'news_chat')
);

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
    RAISE EXCEPTION 'User is banned from General Chat';
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

CREATE OR REPLACE FUNCTION public.toggle_message_reaction(
  message_id uuid,
  emoji text,
  is_dm boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.toggle_message_reaction_v2(message_id, emoji, is_dm);
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
    RAISE EXCEPTION 'User is banned from News Feed';
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
    RAISE EXCEPTION 'User is banned from News Chat';
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

GRANT EXECUTE ON FUNCTION public.is_user_channel_banned(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_channel_bans(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_channel_bans(uuid, text[], integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_message_reaction_v2(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_message_reaction(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_news_feed_reaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_news_chat_reaction(uuid, text) TO authenticated;
