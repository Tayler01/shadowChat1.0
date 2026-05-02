/*
  # Presence visibility and active user tracking

  Adds the durable "tracked / invisible" preference and promotes the existing
  user_presence heartbeat table into a realtime source for app-wide identity
  indicators and the General Chat active-user list.
*/

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS presence_visibility text NOT NULL DEFAULT 'tracked';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_presence_visibility_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_presence_visibility_check
  CHECK (presence_visibility IN ('tracked', 'invisible'));

UPDATE public.users
SET presence_visibility = 'tracked'
WHERE presence_visibility IS NULL;

CREATE INDEX IF NOT EXISTS users_presence_visibility_idx
  ON public.users (presence_visibility);

CREATE INDEX IF NOT EXISTS user_presence_last_seen_idx
  ON public.user_presence (last_seen DESC)
  WHERE last_seen IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_user_presence_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.presence_visibility = 'invisible' THEN
    INSERT INTO public.user_presence (
      user_id,
      status,
      last_seen,
      current_channel,
      typing_in,
      updated_at
    )
    VALUES (
      NEW.id,
      'invisible',
      NULL,
      NULL,
      NULL,
      now()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      status = 'invisible',
      last_seen = NULL,
      current_channel = NULL,
      typing_in = NULL,
      updated_at = now();
  ELSIF TG_OP = 'INSERT'
    OR OLD.presence_visibility IS DISTINCT FROM NEW.presence_visibility THEN
    INSERT INTO public.user_presence (
      user_id,
      status,
      last_seen,
      updated_at
    )
    VALUES (
      NEW.id,
      'online',
      now(),
      now()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      status = 'online',
      last_seen = now(),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_user_presence_visibility_on_users ON public.users;
CREATE TRIGGER sync_user_presence_visibility_on_users
AFTER INSERT OR UPDATE OF presence_visibility ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_presence_visibility();

CREATE OR REPLACE FUNCTION public.update_user_last_active()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  current_visibility text;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(users.presence_visibility, 'tracked')
  INTO current_visibility
  FROM public.users
  WHERE users.id = current_user_id;

  IF current_visibility = 'invisible' THEN
    INSERT INTO public.user_presence (
      user_id,
      status,
      last_seen,
      current_channel,
      typing_in,
      updated_at
    )
    VALUES (
      current_user_id,
      'invisible',
      NULL,
      NULL,
      NULL,
      now()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      status = 'invisible',
      last_seen = NULL,
      current_channel = NULL,
      typing_in = NULL,
      updated_at = now();

    RETURN;
  END IF;

  UPDATE public.users
  SET
    status = 'online',
    last_active = now(),
    updated_at = now()
  WHERE id = current_user_id;

  INSERT INTO public.user_presence (
    user_id,
    status,
    last_seen,
    updated_at
  )
  VALUES (
    current_user_id,
    'online',
    now(),
    now()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    status = 'online',
    last_seen = now(),
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_presence_visibility(next_visibility text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  normalized_visibility text := lower(trim(COALESCE(next_visibility, '')));
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF normalized_visibility NOT IN ('tracked', 'invisible') THEN
    RAISE EXCEPTION 'Invalid presence visibility';
  END IF;

  UPDATE public.users
  SET
    presence_visibility = normalized_visibility,
    updated_at = now()
  WHERE id = current_user_id;

  IF normalized_visibility = 'tracked' THEN
    PERFORM public.update_user_last_active();
  END IF;

  RETURN normalized_visibility;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_presence_states()
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  color text,
  presence_visibility text,
  presence_state text,
  is_active boolean,
  last_seen timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    users.id AS user_id,
    users.username,
    users.display_name,
    users.avatar_url,
    users.color,
    users.presence_visibility,
    CASE
      WHEN users.presence_visibility = 'invisible' THEN 'invisible'
      WHEN user_presence.status = 'online'
        AND user_presence.last_seen > now() - interval '2 minutes'
        THEN 'online'
      ELSE 'offline'
    END AS presence_state,
    (
      users.presence_visibility = 'tracked'
      AND user_presence.status = 'online'
      AND user_presence.last_seen > now() - interval '2 minutes'
    ) AS is_active,
    user_presence.last_seen
  FROM public.users users
  LEFT JOIN public.user_presence user_presence
    ON user_presence.user_id = users.id
  ORDER BY lower(COALESCE(users.display_name, users.username, ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_users()
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  color text,
  last_seen timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    users.id AS user_id,
    users.username,
    users.display_name,
    users.avatar_url,
    users.color,
    user_presence.last_seen
  FROM public.users users
  INNER JOIN public.user_presence user_presence
    ON user_presence.user_id = users.id
  WHERE users.presence_visibility = 'tracked'
    AND user_presence.status = 'online'
    AND user_presence.last_seen > now() - interval '2 minutes'
  ORDER BY lower(COALESCE(users.display_name, users.username, ''));
END;
$$;

DROP FUNCTION IF EXISTS public.search_users(text);

CREATE OR REPLACE FUNCTION public.search_users(term text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  color text,
  status text,
  admin_role text,
  presence_visibility text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    users.id,
    users.username,
    users.display_name,
    users.avatar_url,
    users.color,
    users.status,
    users.admin_role,
    users.presence_visibility
  FROM public.users users
  WHERE users.username ILIKE '%' || search_users.term || '%'
     OR users.display_name ILIKE '%' || search_users.term || '%'
  ORDER BY lower(users.username)
  LIMIT 30;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_last_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_presence_visibility(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_presence_states() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users(text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
  END IF;
END $$;
