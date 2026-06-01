/*
  # Lock General Chat read RPC grants

  Supabase function defaults can leave explicit anon EXECUTE grants on new
  public RPCs. General Chat read window and cursor writes are authenticated app
  paths only, so keep execution scoped to authenticated users and service role.
*/

REVOKE ALL ON FUNCTION public.get_general_chat_message_window(uuid, uuid, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_general_chat_message_window(uuid, uuid, timestamptz, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_general_chat_message_window(uuid, uuid, timestamptz, integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_general_chat_message_window(uuid, uuid, timestamptz, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_general_chat_message_window(uuid, uuid, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_general_chat_message_window(uuid, uuid, timestamptz, integer) TO service_role;

REVOKE ALL ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) FROM authenticated;
REVOKE ALL ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) FROM service_role;
GRANT EXECUTE ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_read_cursor(text, text, uuid, timestamptz) TO service_role;
