/*
  # News tab foundation

  Creates an isolated News domain for the public News Feed and News Chat.
  The existing group chat, DMs, bridge control plane, push delivery, and
  message tables are intentionally left untouched.
*/

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Operator roles. This table is readable so RLS can make normal invoker
-- checks, but there are no client write policies; bootstrap/admin changes
-- should be made with service-role SQL or trusted backend tooling.
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('news_admin')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read user roles" ON public.user_roles;
CREATE POLICY "Authenticated users can read user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.is_news_admin(target_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = target_user_id
      AND role = 'news_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_news_admin(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.news_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('x', 'truth')),
  handle text NOT NULL CHECK (char_length(trim(handle)) BETWEEN 1 AND 80),
  normalized_handle text GENERATED ALWAYS AS (lower(regexp_replace(trim(handle), '^@+', ''))) STORED,
  display_name text,
  profile_url text,
  external_account_id text,
  enabled boolean NOT NULL DEFAULT true,
  scrape_interval_seconds integer NOT NULL DEFAULT 90 CHECK (scrape_interval_seconds BETWEEN 30 AND 600),
  last_seen_external_id text,
  last_seen_at timestamptz,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  health_status text NOT NULL DEFAULT 'pending' CHECK (health_status IN ('pending', 'ok', 'degraded', 'blocked', 'error')),
  last_error text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, normalized_handle)
);

CREATE INDEX IF NOT EXISTS news_sources_enabled_platform_idx
  ON public.news_sources (enabled, platform, updated_at DESC);

ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read news sources" ON public.news_sources;
DROP POLICY IF EXISTS "News admins can insert sources" ON public.news_sources;
DROP POLICY IF EXISTS "News admins can update sources" ON public.news_sources;
DROP POLICY IF EXISTS "News admins can delete sources" ON public.news_sources;

CREATE POLICY "Authenticated users can read news sources"
ON public.news_sources
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "News admins can insert sources"
ON public.news_sources
FOR INSERT
TO authenticated
WITH CHECK (public.is_news_admin(auth.uid()));

CREATE POLICY "News admins can update sources"
ON public.news_sources
FOR UPDATE
TO authenticated
USING (public.is_news_admin(auth.uid()))
WITH CHECK (public.is_news_admin(auth.uid()));

CREATE POLICY "News admins can delete sources"
ON public.news_sources
FOR DELETE
TO authenticated
USING (public.is_news_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.news_feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.news_sources(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('x', 'truth')),
  external_id text NOT NULL,
  post_kind text NOT NULL DEFAULT 'unknown' CHECK (post_kind IN ('post', 'reply', 'repost', 'quote', 'retruth', 'unknown')),
  author_handle text NOT NULL,
  author_display_name text,
  author_avatar_url text,
  headline text NOT NULL CHECK (char_length(trim(headline)) BETWEEN 1 AND 280),
  body_text text NOT NULL DEFAULT '',
  source_url text NOT NULL,
  canonical_url text,
  media jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(media) = 'array'),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw) = 'object'),
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reactions) = 'object'),
  posted_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  visible_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/New_York')::date),
  hidden boolean NOT NULL DEFAULT false,
  hidden_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS news_feed_items_today_idx
  ON public.news_feed_items (visible_day DESC, detected_at DESC)
  WHERE hidden = false;

CREATE INDEX IF NOT EXISTS news_feed_items_source_detected_idx
  ON public.news_feed_items (source_id, detected_at DESC);

ALTER TABLE public.news_feed_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read today's visible feed" ON public.news_feed_items;
DROP POLICY IF EXISTS "News admins can update feed items" ON public.news_feed_items;
DROP POLICY IF EXISTS "News admins can delete feed items" ON public.news_feed_items;

CREATE POLICY "Authenticated users can read today's visible feed"
ON public.news_feed_items
FOR SELECT
TO authenticated
USING (
  public.is_news_admin(auth.uid())
  OR (
    hidden = false
    AND visible_day = ((now() AT TIME ZONE 'America/New_York')::date)
  )
);

CREATE POLICY "News admins can update feed items"
ON public.news_feed_items
FOR UPDATE
TO authenticated
USING (public.is_news_admin(auth.uid()))
WITH CHECK (public.is_news_admin(auth.uid()));

CREATE POLICY "News admins can delete feed items"
ON public.news_feed_items
FOR DELETE
TO authenticated
USING (public.is_news_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.news_feed_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id uuid NOT NULL REFERENCES public.news_feed_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feed_item_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS news_feed_reactions_item_idx
  ON public.news_feed_reactions (feed_item_id, created_at DESC);

ALTER TABLE public.news_feed_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read feed reactions" ON public.news_feed_reactions;
DROP POLICY IF EXISTS "Users can add own feed reactions" ON public.news_feed_reactions;
DROP POLICY IF EXISTS "Users can delete own feed reactions" ON public.news_feed_reactions;

CREATE POLICY "Authenticated users can read feed reactions"
ON public.news_feed_reactions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can add own feed reactions"
ON public.news_feed_reactions
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own feed reactions"
ON public.news_feed_reactions
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.news_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 4000),
  edited_at timestamptz,
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reactions) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_chat_messages_created_idx
  ON public.news_chat_messages (created_at DESC);

ALTER TABLE public.news_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read news chat" ON public.news_chat_messages;
DROP POLICY IF EXISTS "Users can insert own news chat messages" ON public.news_chat_messages;
DROP POLICY IF EXISTS "Users can update own news chat messages" ON public.news_chat_messages;
DROP POLICY IF EXISTS "Users can delete own news chat messages" ON public.news_chat_messages;

CREATE POLICY "Authenticated users can read news chat"
ON public.news_chat_messages
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert own news chat messages"
ON public.news_chat_messages
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own news chat messages"
ON public.news_chat_messages
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own news chat messages"
ON public.news_chat_messages
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.news_chat_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_message_id uuid NOT NULL REFERENCES public.news_chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS news_chat_reactions_message_idx
  ON public.news_chat_reactions (chat_message_id, created_at DESC);

ALTER TABLE public.news_chat_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read news chat reactions" ON public.news_chat_reactions;
DROP POLICY IF EXISTS "Users can add own news chat reactions" ON public.news_chat_reactions;
DROP POLICY IF EXISTS "Users can delete own news chat reactions" ON public.news_chat_reactions;

CREATE POLICY "Authenticated users can read news chat reactions"
ON public.news_chat_reactions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can add own news chat reactions"
ON public.news_chat_reactions
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own news chat reactions"
ON public.news_chat_reactions
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.news_user_state (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  feed_seen_at timestamptz NOT NULL DEFAULT '1970-01-01 00:00:00+00',
  chat_seen_at timestamptz NOT NULL DEFAULT '1970-01-01 00:00:00+00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.news_user_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own news state" ON public.news_user_state;
DROP POLICY IF EXISTS "Users can insert own news state" ON public.news_user_state;
DROP POLICY IF EXISTS "Users can update own news state" ON public.news_user_state;

CREATE POLICY "Users can read own news state"
ON public.news_user_state
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own news state"
ON public.news_user_state
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own news state"
ON public.news_user_state
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

DROP TRIGGER IF EXISTS update_news_sources_updated_at ON public.news_sources;
CREATE TRIGGER update_news_sources_updated_at
  BEFORE UPDATE ON public.news_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_news_feed_items_updated_at ON public.news_feed_items;
CREATE TRIGGER update_news_feed_items_updated_at
  BEFORE UPDATE ON public.news_feed_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_news_chat_messages_updated_at ON public.news_chat_messages;
CREATE TRIGGER update_news_chat_messages_updated_at
  BEFORE UPDATE ON public.news_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_news_user_state_updated_at ON public.news_user_state;
CREATE TRIGGER update_news_user_state_updated_at
  BEFORE UPDATE ON public.news_user_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.aggregate_news_feed_reactions(target_feed_item_id uuid)
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
    FROM public.news_feed_reactions
    WHERE feed_item_id = target_feed_item_id
    GROUP BY emoji
  ) grouped;
$$;

CREATE OR REPLACE FUNCTION public.aggregate_news_chat_reactions(target_chat_message_id uuid)
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
    FROM public.news_chat_reactions
    WHERE chat_message_id = target_chat_message_id
    GROUP BY emoji
  ) grouped;
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

CREATE OR REPLACE FUNCTION public.mark_news_seen(section text DEFAULT 'all')
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  normalized_section text := lower(coalesce(section, 'all'));
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF normalized_section NOT IN ('all', 'feed', 'chat') THEN
    RAISE EXCEPTION 'Invalid news section';
  END IF;

  INSERT INTO public.news_user_state (
    user_id,
    feed_seen_at,
    chat_seen_at
  )
  VALUES (
    current_user_id,
    CASE WHEN normalized_section IN ('all', 'feed') THEN now() ELSE '1970-01-01 00:00:00+00'::timestamptz END,
    CASE WHEN normalized_section IN ('all', 'chat') THEN now() ELSE '1970-01-01 00:00:00+00'::timestamptz END
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    feed_seen_at = CASE
      WHEN normalized_section IN ('all', 'feed') THEN now()
      ELSE public.news_user_state.feed_seen_at
    END,
    chat_seen_at = CASE
      WHEN normalized_section IN ('all', 'chat') THEN now()
      ELSE public.news_user_state.chat_seen_at
    END,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.count_news_badge_items(target_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  feed_seen timestamptz;
  chat_seen timestamptz;
  feed_count integer;
  chat_count integer;
BEGIN
  IF target_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT
    COALESCE(feed_seen_at, '1970-01-01 00:00:00+00'::timestamptz),
    COALESCE(chat_seen_at, '1970-01-01 00:00:00+00'::timestamptz)
  INTO feed_seen, chat_seen
  FROM public.news_user_state
  WHERE user_id = target_user_id;

  feed_seen := COALESCE(feed_seen, '1970-01-01 00:00:00+00'::timestamptz);
  chat_seen := COALESCE(chat_seen, '1970-01-01 00:00:00+00'::timestamptz);

  SELECT count(*)::integer INTO feed_count
  FROM public.news_feed_items
  WHERE hidden = false
    AND visible_day = ((now() AT TIME ZONE 'America/New_York')::date)
    AND detected_at > feed_seen;

  SELECT count(*)::integer INTO chat_count
  FROM public.news_chat_messages
  WHERE created_at > chat_seen
    AND user_id <> target_user_id;

  RETURN COALESCE(feed_count, 0) + COALESCE(chat_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_news_source(
  platform text,
  handle text,
  display_name text DEFAULT NULL,
  profile_url text DEFAULT NULL,
  external_account_id text DEFAULT NULL
)
RETURNS public.news_sources
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  next_source public.news_sources;
BEGIN
  IF current_user_id IS NULL OR NOT public.is_news_admin(current_user_id) THEN
    RAISE EXCEPTION 'News admin role required';
  END IF;

  INSERT INTO public.news_sources (
    platform,
    handle,
    display_name,
    profile_url,
    external_account_id,
    created_by
  )
  VALUES (
    lower(trim(platform)),
    trim(handle),
    NULLIF(trim(display_name), ''),
    NULLIF(trim(profile_url), ''),
    NULLIF(trim(external_account_id), ''),
    current_user_id
  )
  ON CONFLICT (platform, normalized_handle) DO UPDATE
  SET
    display_name = COALESCE(EXCLUDED.display_name, public.news_sources.display_name),
    profile_url = COALESCE(EXCLUDED.profile_url, public.news_sources.profile_url),
    external_account_id = COALESCE(EXCLUDED.external_account_id, public.news_sources.external_account_id),
    enabled = true,
    updated_at = now()
  RETURNING * INTO next_source;

  RETURN next_source;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_news_source_enabled(source_id uuid, enabled boolean)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_news_admin(auth.uid()) THEN
    RAISE EXCEPTION 'News admin role required';
  END IF;

  UPDATE public.news_sources
  SET enabled = set_news_source_enabled.enabled
  WHERE id = source_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.hide_news_feed_item(feed_item_id uuid, hidden boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_news_admin(auth.uid()) THEN
    RAISE EXCEPTION 'News admin role required';
  END IF;

  UPDATE public.news_feed_items
  SET
    hidden = hide_news_feed_item.hidden,
    hidden_by = CASE WHEN hide_news_feed_item.hidden THEN auth.uid() ELSE NULL END,
    hidden_at = CASE WHEN hide_news_feed_item.hidden THEN now() ELSE NULL END
  WHERE id = feed_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_expired_news_feed_items()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.news_feed_items
  WHERE visible_day < ((now() AT TIME ZONE 'America/New_York')::date);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_news_feed_reaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_news_chat_reaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_news_seen(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_news_badge_items(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_news_source(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_news_source_enabled(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_news_feed_item(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_expired_news_feed_items() TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'news_feed_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.news_feed_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'news_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.news_chat_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'news_sources'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.news_sources;
  END IF;
END $$;
