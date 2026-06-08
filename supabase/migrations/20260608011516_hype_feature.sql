-- Hype: General Chat celebration events and permanent message celebrations.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS hype_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hype_users jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_hype_count_nonnegative,
  ADD CONSTRAINT messages_hype_count_nonnegative CHECK (hype_count >= 0);

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS hype_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.hype_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('bell', 'message')),
  message_id uuid,
  message_author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE TABLE IF NOT EXISTS public.message_hypes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  message_author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.hype_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hype_event_receipts (
  event_id uuid NOT NULL REFERENCES public.hype_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  played_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS hype_events_created_idx
  ON public.hype_events (created_at DESC);

CREATE INDEX IF NOT EXISTS hype_events_actor_created_idx
  ON public.hype_events (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hype_events_message_idx
  ON public.hype_events (message_id, created_at DESC)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS message_hypes_message_created_idx
  ON public.message_hypes (message_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS message_hypes_one_per_user_message_idx
  ON public.message_hypes (message_id, actor_id)
  WHERE actor_id IS NOT NULL;

ALTER TABLE public.hype_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_hypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hype_event_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read hype events" ON public.hype_events;
CREATE POLICY "Authenticated users can read hype events"
ON public.hype_events
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can read message hypes" ON public.message_hypes;
CREATE POLICY "Authenticated users can read message hypes"
ON public.message_hypes
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can read own hype receipts" ON public.hype_event_receipts;
CREATE POLICY "Users can read own hype receipts"
ON public.hype_event_receipts
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own hype receipts" ON public.hype_event_receipts;
CREATE POLICY "Users can insert own hype receipts"
ON public.hype_event_receipts
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.hype_day_key(value timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT timezone('America/New_York', value)::date;
$$;

CREATE OR REPLACE FUNCTION public.hype_next_reset_at(value timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ((timezone('America/New_York', value)::date + 1)::timestamp AT TIME ZONE 'America/New_York');
$$;

CREATE OR REPLACE FUNCTION public.hype_uses_today(target_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.hype_events events
  WHERE events.actor_id = target_user_id
    AND public.hype_day_key(events.created_at) = public.hype_day_key(now());
$$;

CREATE OR REPLACE FUNCTION public.get_hype_status()
RETURNS TABLE (
  used integer,
  remaining integer,
  limit_per_day integer,
  reset_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    LEAST(public.hype_uses_today(auth.uid()), 2) AS used,
    GREATEST(0, 2 - public.hype_uses_today(auth.uid())) AS remaining,
    2 AS limit_per_day,
    public.hype_next_reset_at(now()) AS reset_at;
$$;

CREATE OR REPLACE FUNCTION public.hype_actor_metadata(target_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'actor_id', users.id,
    'actor_display_name', COALESCE(users.display_name, users.username, 'Shadow'),
    'actor_username', users.username
  )
  FROM public.users
  WHERE users.id = target_user_id;
$$;

CREATE OR REPLACE FUNCTION public.refresh_message_hype_summary(target_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messages target_message
  SET
    hype_count = summary.hype_count,
    hype_users = summary.hype_users,
    updated_at = now()
  FROM (
    SELECT
      count(*)::integer AS hype_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'user_id', hypes.actor_id,
            'display_name', COALESCE(users.display_name, users.username, 'Shadow'),
            'username', users.username,
            'created_at', hypes.created_at
          )
          ORDER BY hypes.created_at ASC
        ) FILTER (WHERE hypes.actor_id IS NOT NULL),
        '[]'::jsonb
      ) AS hype_users
    FROM public.message_hypes hypes
    LEFT JOIN public.users users
      ON users.id = hypes.actor_id
    WHERE hypes.message_id = target_message_id
  ) summary
  WHERE target_message.id = target_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_can_use_hype(current_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF public.is_user_channel_banned(current_user_id, 'general_chat') THEN
    RAISE EXCEPTION USING MESSAGE = public.get_channel_ban_block_message(current_user_id, 'general_chat');
  END IF;

  IF public.hype_uses_today(current_user_id) >= 2 THEN
    RAISE EXCEPTION 'You have used both Hype actions for today. Hype resets at midnight ET.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_hype_event(event_id uuid)
RETURNS SETOF public.hype_events
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM public.hype_events
  WHERE id = event_id
    AND expires_at > now()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_hype_events()
RETURNS SETOF public.hype_events
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT events.*
  FROM public.hype_events events
  WHERE events.expires_at > now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.hype_event_receipts receipts
      WHERE receipts.event_id = events.id
        AND receipts.user_id = auth.uid()
    )
  ORDER BY events.created_at ASC
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.mark_hype_events_played(event_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.hype_event_receipts (event_id, user_id)
  SELECT event_id, auth.uid()
  FROM unnest(COALESCE(event_ids, ARRAY[]::uuid[])) AS event_id
  ON CONFLICT (event_id, user_id) DO UPDATE
  SET played_at = EXCLUDED.played_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_hype_message_reactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.message_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.messages
    WHERE id = NEW.message_id
      AND message_type = 'hype'
  ) THEN
    RAISE EXCEPTION 'Hype events cannot be reacted to.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_hype_message_reactions_on_insert ON public.message_reactions;
CREATE TRIGGER block_hype_message_reactions_on_insert
  BEFORE INSERT ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.block_hype_message_reactions();

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
      'title', COALESCE(actor_meta->>'actor_display_name', 'Someone') || ' rang Hype',
      'summary', COALESCE(actor_meta->>'actor_display_name', 'Someone') || ' rang the Hype bell'
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
    'rang Hype',
    'hype',
    '{}'::jsonb
  );

  RETURN NEXT inserted_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.hype_message(target_message_id uuid)
RETURNS SETOF public.hype_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  target_message public.messages%ROWTYPE;
  actor_meta jsonb;
  target_author_name text;
  target_author_username text;
  preview text;
  inserted_event public.hype_events%ROWTYPE;
BEGIN
  PERFORM public.ensure_can_use_hype(current_user_id);

  SELECT *
  INTO target_message
  FROM public.messages
  WHERE id = target_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF target_message.user_id = current_user_id THEN
    RAISE EXCEPTION 'You can only Hype someone else''s message.';
  END IF;

  IF target_message.message_type = 'hype' THEN
    RAISE EXCEPTION 'Hype events cannot be Hyped.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.message_hypes existing
    WHERE existing.message_id = target_message_id
      AND existing.actor_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'You already Hyped this message.';
  END IF;

  actor_meta := public.hype_actor_metadata(current_user_id);

  SELECT
    COALESCE(users.display_name, users.username, 'Shadow'),
    users.username
  INTO target_author_name, target_author_username
  FROM public.users
  WHERE users.id = target_message.user_id;

  preview := CASE target_message.message_type
    WHEN 'image' THEN 'image'
    WHEN 'video' THEN 'video'
    WHEN 'audio' THEN 'voice message'
    WHEN 'file' THEN 'file'
    ELSE LEFT(NULLIF(trim(target_message.content), ''), 120)
  END;

  INSERT INTO public.hype_events (
    actor_id,
    event_type,
    message_id,
    message_author_id,
    metadata
  )
  VALUES (
    current_user_id,
    'message',
    target_message_id,
    target_message.user_id,
    COALESCE(actor_meta, '{}'::jsonb) || jsonb_build_object(
      'kind', 'message',
      'message_author_id', target_message.user_id,
      'message_author_display_name', COALESCE(target_author_name, 'Shadow'),
      'message_author_username', target_author_username,
      'message_preview', COALESCE(preview, 'message'),
      'title', COALESCE(actor_meta->>'actor_display_name', 'Someone') || ' Hyped ' || COALESCE(target_author_name, 'someone') || '''s message'
    )
  )
  RETURNING * INTO inserted_event;

  INSERT INTO public.message_hypes (
    message_id,
    actor_id,
    message_author_id,
    event_id
  )
  VALUES (
    target_message_id,
    current_user_id,
    target_message.user_id,
    inserted_event.id
  );

  PERFORM public.refresh_message_hype_summary(target_message_id);

  RETURN NEXT inserted_event;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'hype_events'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.hype_events;
    END IF;
  END IF;
END $$;

GRANT SELECT ON public.hype_events TO authenticated;
GRANT SELECT ON public.message_hypes TO authenticated;
GRANT SELECT, INSERT ON public.hype_event_receipts TO authenticated;
GRANT EXECUTE ON FUNCTION public.hype_day_key(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hype_next_reset_at(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hype_uses_today(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hype_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hype_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_hype_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_hype_events_played(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ring_hype_bell() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hype_message(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.refresh_message_hype_summary(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_can_use_hype(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hype_actor_metadata(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_hype_message_reactions() FROM PUBLIC, anon, authenticated;
