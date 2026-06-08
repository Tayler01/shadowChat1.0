-- Bonus Hype packs: users keep their normal two daily Hypes and can spend
-- expiring bonus credits after the daily allowance is used.

CREATE TABLE IF NOT EXISTS public.hype_bonus_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  reason text NOT NULL DEFAULT 'bonus_hype_pack',
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hype_bonus_grants_used_not_over_amount CHECK (used_count <= amount)
);

CREATE INDEX IF NOT EXISTS hype_bonus_grants_user_active_idx
  ON public.hype_bonus_grants (user_id, expires_at ASC, created_at ASC)
  WHERE used_count < amount;

ALTER TABLE public.hype_bonus_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own Hype bonus grants" ON public.hype_bonus_grants;
CREATE POLICY "Users can read own Hype bonus grants"
  ON public.hype_bonus_grants
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.hype_bonus_available(target_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(sum(grants.amount - grants.used_count), 0)::integer
  FROM public.hype_bonus_grants grants
  WHERE grants.user_id = target_user_id
    AND grants.expires_at > now()
    AND grants.used_count < grants.amount;
$$;

CREATE OR REPLACE FUNCTION public.consume_hype_bonus(current_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  grant_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT grants.id
  INTO grant_id
  FROM public.hype_bonus_grants grants
  WHERE grants.user_id = current_user_id
    AND grants.expires_at > now()
    AND grants.used_count < grants.amount
  ORDER BY grants.expires_at ASC, grants.created_at ASC, grants.id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF grant_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.hype_bonus_grants
  SET
    used_count = used_count + 1,
    updated_at = now()
  WHERE id = grant_id;

  RETURN true;
END;
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
    GREATEST(0, 2 - public.hype_uses_today(auth.uid())) + public.hype_bonus_available(auth.uid()) AS remaining,
    2 AS limit_per_day,
    public.hype_next_reset_at(now()) AS reset_at;
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

  IF public.hype_uses_today(current_user_id) >= 2
    AND public.hype_bonus_available(current_user_id) <= 0 THEN
    RAISE EXCEPTION 'You have used both Hype actions for today. Hype resets at midnight ET.';
  END IF;
END;
$$;

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
  should_consume_bonus boolean;
BEGIN
  PERFORM public.ensure_can_use_hype(current_user_id);

  should_consume_bonus := public.hype_uses_today(current_user_id) >= 2;
  IF should_consume_bonus AND NOT public.consume_hype_bonus(current_user_id) THEN
    RAISE EXCEPTION 'No bonus Hype credits are available.';
  END IF;

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
      'title', COALESCE(actor_meta->>'actor_display_name', 'Someone') || ' hyped',
      'summary', COALESCE(actor_meta->>'actor_display_name', 'Someone') || ' hyped',
      'credit_source', CASE WHEN should_consume_bonus THEN 'bonus' ELSE 'daily' END
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
    'hyped',
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
  should_consume_bonus boolean;
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

  should_consume_bonus := public.hype_uses_today(current_user_id) >= 2;
  IF should_consume_bonus AND NOT public.consume_hype_bonus(current_user_id) THEN
    RAISE EXCEPTION 'No bonus Hype credits are available.';
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
      'title', COALESCE(actor_meta->>'actor_display_name', 'Someone') || ' Hyped ' || COALESCE(target_author_name, 'someone') || '''s message',
      'credit_source', CASE WHEN should_consume_bonus THEN 'bonus' ELSE 'daily' END
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

GRANT SELECT ON public.hype_bonus_grants TO authenticated;
GRANT EXECUTE ON FUNCTION public.hype_bonus_available(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hype_bonus_available(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.consume_hype_bonus(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_hype_bonus(uuid) TO service_role;
