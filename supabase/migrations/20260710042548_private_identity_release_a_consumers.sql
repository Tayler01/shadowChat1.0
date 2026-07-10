/*
  # Private identity Release A consumer cutover

  Stop every database writer/reader from depending on the legacy public email
  and full_name columns while leaving the columns in place for a deployment
  interval. Release B can then drop them without racing older deployed code.
*/

ALTER TABLE public.users
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN full_name DROP NOT NULL,
  ALTER COLUMN full_name DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  raw_username text;
  normalized_username text;
  resolved_display_name text;
  default_chat_color constant text := '#D7AA46';
BEGIN
  raw_username := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'username'), ''),
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'user'
  );

  normalized_username := lower(regexp_replace(raw_username, '[^a-zA-Z0-9_]+', '', 'g'));
  IF normalized_username = '' THEN
    normalized_username := 'user_' || left(replace(NEW.id::text, '-', ''), 8);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users profiles
    WHERE lower(profiles.username) = normalized_username
      AND profiles.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Username already taken';
  END IF;

  resolved_display_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    normalized_username
  );

  INSERT INTO public.users (
    id,
    username,
    display_name,
    color,
    chat_color,
    status,
    status_message,
    last_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    normalized_username,
    resolved_display_name,
    default_chat_color,
    default_chat_color,
    'online',
    '',
    now(),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = COALESCE(NULLIF(public.users.display_name, ''), EXCLUDED.display_name),
    color = COALESCE(NULLIF(public.users.color, ''), EXCLUDED.color),
    chat_color = COALESCE(NULLIF(public.users.chat_color, ''), EXCLUDED.chat_color),
    status_message = COALESCE(public.users.status_message, ''),
    updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

CREATE OR REPLACE FUNCTION public.list_admin_access_users()
RETURNS TABLE (
  id uuid,
  email text,
  username text,
  display_name text,
  avatar_url text,
  banner_url text,
  status text,
  status_message text,
  color text,
  last_active timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  admin_role text,
  role_created_at timestamptz,
  role_created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Full admin role required';
  END IF;

  RETURN QUERY
  SELECT
    profiles.id,
    auth_users.email::text,
    profiles.username,
    profiles.display_name,
    profiles.avatar_url,
    profiles.banner_url,
    profiles.status,
    profiles.status_message,
    profiles.color,
    profiles.last_active,
    profiles.created_at,
    profiles.updated_at,
    roles.role AS admin_role,
    roles.created_at AS role_created_at,
    roles.created_by AS role_created_by
  FROM public.users profiles
  JOIN auth.users auth_users ON auth_users.id = profiles.id
  LEFT JOIN public.user_roles roles
    ON roles.user_id = profiles.id
   AND roles.role IN ('admin', 'sub_admin')
  ORDER BY
    CASE roles.role WHEN 'admin' THEN 0 WHEN 'sub_admin' THEN 1 ELSE 2 END,
    lower(profiles.display_name),
    lower(profiles.username);
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_access_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_admin_access_users() TO authenticated, service_role;

COMMENT ON COLUMN public.users.email IS
  'Deprecated Release A compatibility column. Auth is authoritative; Release B drops this column.';
COMMENT ON COLUMN public.users.full_name IS
  'Deprecated Release A compatibility column. display_name is authoritative; Release B drops this column.';
