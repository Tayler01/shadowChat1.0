ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS dm_discoverable boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users.dm_discoverable IS
  'Controls whether a user appears in the start-new-DM contact picker. Existing DM threads remain accessible.';

UPDATE public.users
SET dm_discoverable = false
WHERE lower(coalesce(username, '')) = 'shado_ai'
   OR lower(coalesce(username, '')) LIKE 'shadowchat_smoke_%'
   OR lower(coalesce(username, '')) LIKE 'smoke%'
   OR lower(coalesce(username, '')) LIKE 'test%'
   OR lower(coalesce(email, '')) LIKE '%@example.com';

CREATE INDEX IF NOT EXISTS idx_users_dm_discoverable
  ON public.users (dm_discoverable, lower(coalesce(display_name, username, '')), lower(username));

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
