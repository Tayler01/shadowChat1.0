/*
  # Boards domain

  Introduces a reusable Boards catalog plus a generic chat-board message stream.
  News Feed stays on the existing production `news_feed_items` tables and is
  represented in the catalog as a feed board. Chat boards share one table and
  per-board read cursors through `user_read_cursors`.
*/

CREATE TABLE IF NOT EXISTS public.board_catalog (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 80),
  board_type text NOT NULL CHECK (board_type IN ('feed', 'chat', 'static')),
  description text NOT NULL DEFAULT '',
  moderation_scope text,
  unread_contributes_to_nav boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_catalog_moderation_scope_check
    CHECK (
      moderation_scope IS NULL
      OR moderation_scope IN (
        'board_news_chat',
        'board_investing_chat',
        'board_learning_chat',
        'board_crypto_chat'
      )
    )
);

ALTER TABLE public.board_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read boards" ON public.board_catalog;
CREATE POLICY "Authenticated users can read boards"
ON public.board_catalog
FOR SELECT
TO authenticated
USING (is_visible = true OR public.is_app_operator((select auth.uid())));

DROP TRIGGER IF EXISTS update_board_catalog_updated_at ON public.board_catalog;
CREATE TRIGGER update_board_catalog_updated_at
  BEFORE UPDATE ON public.board_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.board_catalog (
  slug,
  title,
  board_type,
  description,
  moderation_scope,
  unread_contributes_to_nav,
  sort_order
)
VALUES
  ('news-feed', 'News Feed', 'feed', 'Tracked source feed.', NULL, false, 10),
  ('news-chat', 'News Chat', 'chat', 'News links and discussion.', 'board_news_chat', true, 20),
  ('investing-chat', 'Investing Chat', 'chat', 'Markets, tickers, and strategy.', 'board_investing_chat', true, 30),
  ('learning-chat', 'Learning Chat', 'chat', 'Questions, resources, and study notes.', 'board_learning_chat', true, 40),
  ('crypto-chat', 'Crypto Chat', 'chat', 'Crypto news and market talk.', 'board_crypto_chat', true, 50),
  ('art-board', 'Art Board', 'static', 'Coming soon.', NULL, false, 60)
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  board_type = EXCLUDED.board_type,
  description = EXCLUDED.description,
  moderation_scope = EXCLUDED.moderation_scope,
  unread_contributes_to_nav = EXCLUDED.unread_contributes_to_nav,
  sort_order = EXCLUDED.sort_order,
  is_visible = true,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.board_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_slug text NOT NULL REFERENCES public.board_catalog(slug) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 4000),
  edited_at timestamptz,
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reactions) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_chat_messages_board_created_idx
  ON public.board_chat_messages (board_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS board_chat_messages_user_created_idx
  ON public.board_chat_messages (user_id, created_at DESC);

ALTER TABLE public.board_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.board_chat_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.board_chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS board_chat_reactions_message_idx
  ON public.board_chat_reactions (message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS board_chat_reactions_user_idx
  ON public.board_chat_reactions (user_id, created_at DESC);

ALTER TABLE public.board_chat_reactions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_board_chat_messages_updated_at ON public.board_chat_messages;
CREATE TRIGGER update_board_chat_messages_updated_at
  BEFORE UPDATE ON public.board_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_channel_bans
  DROP CONSTRAINT IF EXISTS user_channel_bans_scope_check;

UPDATE public.user_channel_bans
SET scope = 'board_news_chat'
WHERE scope = 'news_chat';

UPDATE public.user_channel_bans
SET scope = 'all_interaction'
WHERE scope = 'news_feed';

ALTER TABLE public.user_channel_bans
  ADD CONSTRAINT user_channel_bans_scope_check
  CHECK (
    scope IN (
      'general_chat',
      'board_news_chat',
      'board_investing_chat',
      'board_learning_chat',
      'board_crypto_chat',
      'all_interaction'
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
    WHEN 'board_news_chat' THEN 'News Chat'
    WHEN 'board_investing_chat' THEN 'Investing Chat'
    WHEN 'board_learning_chat' THEN 'Learning Chat'
    WHEN 'board_crypto_chat' THEN 'Crypto Chat'
    WHEN 'all_interaction' THEN 'All Interaction'
    ELSE scope
  END;
$$;

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
      AND (
        active_bans.scope = is_user_channel_banned.scope
        OR (
          is_user_channel_banned.scope <> 'all_interaction'
          AND active_bans.scope = 'all_interaction'
        )
      )
      AND active_bans.revoked_at IS NULL
      AND (
        active_bans.expires_at IS NULL
        OR active_bans.expires_at > now()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.board_chat_moderation_scope(target_board_slug text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT catalog.moderation_scope
  FROM public.board_catalog catalog
  WHERE catalog.slug = target_board_slug
    AND catalog.board_type = 'chat'
    AND catalog.is_visible = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_board_interaction_banned(target_user_id uuid, target_board_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH scope_value AS (
    SELECT public.board_chat_moderation_scope(target_board_slug) AS scope
  )
  SELECT CASE
    WHEN (SELECT scope FROM scope_value) IS NULL THEN true
    ELSE public.is_user_channel_banned(target_user_id, (SELECT scope FROM scope_value))
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
    AND (
      bans.scope = get_channel_ban_block_message.scope
      OR (
        get_channel_ban_block_message.scope <> 'all_interaction'
        AND bans.scope = 'all_interaction'
      )
    )
    AND bans.revoked_at IS NULL
    AND (
      bans.expires_at IS NULL
      OR bans.expires_at > now()
    )
  ORDER BY
    CASE WHEN bans.scope = get_channel_ban_block_message.scope THEN 0 ELSE 1 END,
    bans.created_at DESC
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
  valid_scopes text[] := ARRAY[
    'general_chat',
    'board_news_chat',
    'board_investing_chat',
    'board_learning_chat',
    'board_crypto_chat',
    'all_interaction'
  ];
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
    SELECT CASE lower(trim(scope_value))
      WHEN 'news_chat' THEN 'board_news_chat'
      WHEN 'news_feed' THEN 'all_interaction'
      ELSE lower(trim(scope_value))
    END AS normalized_scope
    FROM unnest(COALESCE(scopes, ARRAY[]::text[])) AS scope_value
    WHERE trim(scope_value) <> ''
  ) normalized;

  SELECT normalized_scope
  INTO invalid_scope
  FROM unnest(clean_scopes) AS normalized_scope
  WHERE NOT normalized_scope = ANY(valid_scopes)
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
    AND active_bans.scope = ANY(valid_scopes);

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

CREATE OR REPLACE FUNCTION public.aggregate_board_chat_reactions(target_message_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      emoji,
      jsonb_build_object('count', reaction_count, 'users', users)
      ORDER BY emoji
    ),
    '{}'::jsonb
  )
  FROM (
    SELECT
      emoji,
      count(*)::integer AS reaction_count,
      jsonb_agg(user_id::text ORDER BY created_at ASC) AS users
    FROM public.board_chat_reactions
    WHERE message_id = target_message_id
    GROUP BY emoji
  ) grouped;
$$;

CREATE OR REPLACE FUNCTION public.toggle_board_chat_reaction(chat_message_id uuid, emoji text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  target_board_slug text;
  existing_reaction_id uuid;
  next_reactions jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT board_chat_messages.board_slug
  INTO target_board_slug
  FROM public.board_chat_messages
  WHERE id = chat_message_id;

  IF target_board_slug IS NULL THEN
    RAISE EXCEPTION 'Board chat message is not available';
  END IF;

  IF public.is_board_interaction_banned(current_user_id, target_board_slug) THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(
      current_user_id,
      COALESCE(public.board_chat_moderation_scope(target_board_slug), 'all_interaction')
    );
  END IF;

  SELECT id INTO existing_reaction_id
  FROM public.board_chat_reactions
  WHERE board_chat_reactions.message_id = toggle_board_chat_reaction.chat_message_id
    AND user_id = current_user_id
    AND board_chat_reactions.emoji = toggle_board_chat_reaction.emoji;

  IF existing_reaction_id IS NOT NULL THEN
    DELETE FROM public.board_chat_reactions WHERE id = existing_reaction_id;
  ELSE
    INSERT INTO public.board_chat_reactions (message_id, user_id, emoji)
    VALUES (chat_message_id, current_user_id, emoji);
  END IF;

  next_reactions := public.aggregate_board_chat_reactions(chat_message_id);

  UPDATE public.board_chat_messages
  SET reactions = next_reactions
  WHERE id = chat_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_board_badge_counts(target_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  board_slug text,
  unread_count integer,
  contributes_to_nav boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  normalized_target_user_id uuid := COALESCE(target_user_id, auth.uid());
BEGIN
  IF normalized_target_user_id IS NULL OR normalized_target_user_id <> actor_user_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH feed_state AS (
    SELECT COALESCE(news_user_state.feed_seen_at, '1970-01-01 00:00:00+00'::timestamptz) AS seen_at
    FROM public.news_user_state
    WHERE news_user_state.user_id = normalized_target_user_id
  ),
  feed_count AS (
    SELECT count(*)::integer AS unread_total
    FROM public.news_feed_items
    WHERE hidden = false
      AND visible_day = ((now() AT TIME ZONE 'America/New_York')::date)
      AND detected_at > COALESCE((SELECT seen_at FROM feed_state), '1970-01-01 00:00:00+00'::timestamptz)
  ),
  chat_counts AS (
    SELECT
      catalog.slug,
      count(messages.id)::integer AS unread_total
    FROM public.board_catalog catalog
    LEFT JOIN public.user_read_cursors cursors
      ON cursors.user_id = normalized_target_user_id
      AND cursors.surface = 'board_chat'
      AND cursors.scope_id = catalog.slug
    LEFT JOIN public.board_chat_messages messages
      ON messages.board_slug = catalog.slug
      AND messages.user_id <> normalized_target_user_id
      AND messages.created_at > COALESCE(cursors.last_read_at, '1970-01-01 00:00:00+00'::timestamptz)
    WHERE catalog.board_type = 'chat'
      AND catalog.is_visible = true
    GROUP BY catalog.slug
  )
  SELECT
    catalog.slug AS board_slug,
    CASE
      WHEN catalog.slug = 'news-feed' THEN COALESCE((SELECT unread_total FROM feed_count), 0)
      WHEN catalog.board_type = 'chat' THEN COALESCE(chat_counts.unread_total, 0)
      ELSE 0
    END AS unread_count,
    catalog.unread_contributes_to_nav AS contributes_to_nav
  FROM public.board_catalog catalog
  LEFT JOIN chat_counts ON chat_counts.slug = catalog.slug
  WHERE catalog.is_visible = true
  ORDER BY catalog.sort_order ASC, catalog.title ASC;
END;
$$;

DROP POLICY IF EXISTS "Authenticated users can read board chat messages" ON public.board_chat_messages;
CREATE POLICY "Authenticated users can read board chat messages"
ON public.board_chat_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.board_catalog catalog
    WHERE catalog.slug = board_chat_messages.board_slug
      AND catalog.board_type = 'chat'
      AND catalog.is_visible = true
  )
);

DROP POLICY IF EXISTS "Users can insert own board chat messages" ON public.board_chat_messages;
CREATE POLICY "Users can insert own board chat messages"
ON public.board_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_board_interaction_banned((select auth.uid()), board_slug)
);

DROP POLICY IF EXISTS "Users can update own board chat messages" ON public.board_chat_messages;
CREATE POLICY "Users can update own board chat messages"
ON public.board_chat_messages
FOR UPDATE
TO authenticated
USING (
  (select auth.uid()) = user_id
  AND NOT public.is_board_interaction_banned((select auth.uid()), board_slug)
)
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_board_interaction_banned((select auth.uid()), board_slug)
);

DROP POLICY IF EXISTS "Users can delete own board chat messages" ON public.board_chat_messages;
CREATE POLICY "Users can delete own board chat messages"
ON public.board_chat_messages
FOR DELETE
TO authenticated
USING (
  (select auth.uid()) = user_id
  AND NOT public.is_board_interaction_banned((select auth.uid()), board_slug)
);

DROP POLICY IF EXISTS "Authenticated users can read board chat reactions" ON public.board_chat_reactions;
CREATE POLICY "Authenticated users can read board chat reactions"
ON public.board_chat_reactions
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can add own board chat reactions" ON public.board_chat_reactions;
CREATE POLICY "Users can add own board chat reactions"
ON public.board_chat_reactions
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND EXISTS (
    SELECT 1
    FROM public.board_chat_messages messages
    WHERE messages.id = board_chat_reactions.message_id
      AND NOT public.is_board_interaction_banned((select auth.uid()), messages.board_slug)
  )
);

DROP POLICY IF EXISTS "Users can delete own board chat reactions" ON public.board_chat_reactions;
CREATE POLICY "Users can delete own board chat reactions"
ON public.board_chat_reactions
FOR DELETE
TO authenticated
USING (
  (select auth.uid()) = user_id
  AND EXISTS (
    SELECT 1
    FROM public.board_chat_messages messages
    WHERE messages.id = board_chat_reactions.message_id
      AND NOT public.is_board_interaction_banned((select auth.uid()), messages.board_slug)
  )
);

DROP POLICY IF EXISTS "Users can insert own news chat messages" ON public.news_chat_messages;
CREATE POLICY "Users can insert own news chat messages"
ON public.news_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'board_news_chat')
);

DROP POLICY IF EXISTS "Users can update own news chat messages" ON public.news_chat_messages;
CREATE POLICY "Users can update own news chat messages"
ON public.news_chat_messages
FOR UPDATE
TO authenticated
USING (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'board_news_chat')
)
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'board_news_chat')
);

DROP POLICY IF EXISTS "Users can add own feed reactions" ON public.news_feed_reactions;
CREATE POLICY "Users can add own feed reactions"
ON public.news_feed_reactions
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'all_interaction')
);

DROP POLICY IF EXISTS "Users can add own news chat reactions" ON public.news_chat_reactions;
CREATE POLICY "Users can add own news chat reactions"
ON public.news_chat_reactions
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND NOT public.is_user_channel_banned((select auth.uid()), 'board_news_chat')
);

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

  IF public.is_user_channel_banned(current_user_id, 'all_interaction') THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(current_user_id, 'all_interaction');
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

  IF public.is_user_channel_banned(current_user_id, 'board_news_chat') THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(current_user_id, 'board_news_chat');
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
      AND tablename = 'board_catalog'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.board_catalog;
  END IF;

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
      AND tablename = 'board_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.board_chat_messages;
  END IF;
END $$;

GRANT SELECT ON public.board_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_chat_messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.board_chat_reactions TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_ban_scope_label(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_channel_banned(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.board_chat_moderation_scope(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_board_interaction_banned(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_channel_ban_block_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_channel_bans(uuid, text[], integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_board_chat_reactions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_board_chat_reaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_board_badge_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_news_feed_reaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_news_chat_reaction(uuid, text) TO authenticated;
