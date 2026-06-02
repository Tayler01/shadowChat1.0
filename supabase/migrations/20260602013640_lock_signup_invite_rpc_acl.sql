/*
  # Lock signup invite RPC grants

  Supabase public-schema functions can inherit broad EXECUTE privileges. The
  invite admin RPCs are authenticated operator paths, and the auth hook entry
  point is for Supabase Auth only.
*/

REVOKE ALL ON FUNCTION public.create_signup_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_signup_invite(text) FROM anon;
REVOKE ALL ON FUNCTION public.create_signup_invite(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_signup_invite(text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.create_signup_invite(text) TO authenticated;

REVOKE ALL ON FUNCTION public.revoke_signup_invite(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_signup_invite(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_signup_invite(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.revoke_signup_invite(uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.revoke_signup_invite(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_signup_invites() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_signup_invites() FROM anon;
REVOKE ALL ON FUNCTION public.list_signup_invites() FROM authenticated;
REVOKE ALL ON FUNCTION public.list_signup_invites() FROM service_role;
GRANT EXECUTE ON FUNCTION public.list_signup_invites() TO authenticated;

REVOKE ALL ON FUNCTION public.hook_validate_signup_invite(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hook_validate_signup_invite(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.hook_validate_signup_invite(jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.hook_validate_signup_invite(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.hook_validate_signup_invite(jsonb) TO supabase_auth_admin;
