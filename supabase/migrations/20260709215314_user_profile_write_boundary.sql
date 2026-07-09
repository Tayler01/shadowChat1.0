/*
  # Restrict public profile writes to the supported client fields

  Profile rows are created by the trusted auth.users trigger. Authenticated
  clients only need to read profiles and update a small set of presentation
  and presence fields on their own row. Keep identifiers, email, roles,
  awards, activity timestamps, and game medals server-owned.
*/

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Remove legacy/default table-wide privileges first. A column revoke cannot
-- override a table-level grant, so the authenticated update allowlist below
-- must be the only client UPDATE privilege.
REVOKE ALL PRIVILEGES ON TABLE public.users
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.users TO authenticated;

GRANT UPDATE (
  display_name,
  status_message,
  color,
  status,
  presence_visibility,
  avatar_url,
  avatar_thumbnail_url,
  avatar_thumbnail_path,
  banner_url,
  banner_thumbnail_url,
  banner_thumbnail_path
) ON TABLE public.users TO authenticated;

-- Trusted backend clients bootstrap AI/bridge profiles and perform account
-- lifecycle cleanup. They remain the only Data API role with table-wide DML.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO service_role;

-- New profile rows are inserted by public.handle_new_user(), not by browsers.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);
