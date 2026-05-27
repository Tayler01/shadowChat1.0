/*
  # Gold easter egg award

  Adds a permanent, public identity badge for users who discover the mobile-only
  gold egg. Unlike rotating game medals, every authenticated user can claim it
  once after discovery.
*/

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gold_easter_egg boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.gold_easter_egg IS
  'Permanent visible identity badge awarded when a user discovers the mobile-only gold easter egg.';

REVOKE UPDATE (gold_easter_egg) ON public.users FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_gold_easter_egg()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  was_awarded boolean := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.users
  SET gold_easter_egg = true
  WHERE id = current_user_id
    AND gold_easter_egg IS DISTINCT FROM true
  RETURNING true INTO was_awarded;

  RETURN COALESCE(was_awarded, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_gold_easter_egg() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_gold_easter_egg() TO authenticated;

DROP FUNCTION IF EXISTS public.search_users(text);

CREATE OR REPLACE FUNCTION public.search_users(term text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  avatar_thumbnail_url text,
  color text,
  status text,
  admin_role text,
  checkers_crown boolean,
  war_sword boolean,
  shadow_pin_gold_pin boolean,
  gold_easter_egg boolean,
  presence_visibility text,
  dm_discoverable boolean
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
    users.avatar_thumbnail_url,
    users.color,
    users.status,
    users.admin_role,
    users.checkers_crown,
    users.war_sword,
    users.shadow_pin_gold_pin,
    users.gold_easter_egg,
    users.presence_visibility,
    users.dm_discoverable
  FROM public.users users
  WHERE users.dm_discoverable IS TRUE
    AND (
      users.username ILIKE '%' || search_users.term || '%'
      OR users.display_name ILIKE '%' || search_users.term || '%'
    )
  ORDER BY lower(coalesce(users.display_name, users.username, '')), lower(users.username)
  LIMIT 30;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_users(text) TO authenticated;
