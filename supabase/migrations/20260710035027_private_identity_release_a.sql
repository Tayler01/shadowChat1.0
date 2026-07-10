/*
  # Private identity Release A

  Establishes a single database-side public profile JSON contract and applies
  it to the General Chat and DM RPC payloads. The legacy public.users.email and
  public.users.full_name columns intentionally remain in place for Release B;
  this release only removes them from consumer/API payloads.
*/

CREATE OR REPLACE FUNCTION public.user_public_profile_json(profile public.users)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', profile.id,
    'username', profile.username,
    'display_name', profile.display_name,
    'avatar_url', profile.avatar_url,
    'avatar_thumbnail_url', profile.avatar_thumbnail_url,
    'avatar_thumbnail_path', profile.avatar_thumbnail_path,
    'banner_url', profile.banner_url,
    'banner_thumbnail_url', profile.banner_thumbnail_url,
    'banner_thumbnail_path', profile.banner_thumbnail_path,
    'status', profile.status,
    'status_message', profile.status_message,
    'presence_visibility', profile.presence_visibility,
    'color', profile.color,
    'chat_color', profile.chat_color,
    'admin_role', profile.admin_role,
    'checkers_crown', profile.checkers_crown,
    'war_sword', profile.war_sword,
    'shadow_pin_gold_pin', profile.shadow_pin_gold_pin,
    'shadow_runner_sprint_medal', profile.shadow_runner_sprint_medal,
    'shadow_runner_knight_medal', profile.shadow_runner_knight_medal,
    'shadow_runner_knight_level_id', profile.shadow_runner_knight_level_id,
    'gold_easter_egg', profile.gold_easter_egg,
    'dm_discoverable', profile.dm_discoverable,
    'last_active', profile.last_active,
    'created_at', profile.created_at,
    'updated_at', profile.updated_at
  );
$$;

REVOKE ALL ON FUNCTION public.user_public_profile_json(public.users) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_public_profile_json(public.users) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_public_profile_json(public.users) TO service_role;

COMMENT ON FUNCTION public.user_public_profile_json(public.users)
  IS 'Returns the API-safe public profile contract. Authentication email and legacy full_name are intentionally excluded.';

DROP FUNCTION IF EXISTS public.get_dm_conversations();

CREATE OR REPLACE FUNCTION public.get_dm_conversations()
RETURNS TABLE (
  id uuid,
  participants uuid[],
  last_message_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  other_user jsonb,
  last_message jsonb,
  unread_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    conversation_row.id,
    conversation_row.participants,
    conversation_row.last_message_at,
    conversation_row.created_at,
    conversation_row.updated_at,
    (
      SELECT public.user_public_profile_json(other_user_row)
      FROM public.users other_user_row
      WHERE other_user_row.id <> auth.uid()
        AND other_user_row.id = ANY (conversation_row.participants)
      LIMIT 1
    ) AS other_user,
    (
      SELECT to_jsonb(message_row)
      FROM public.dm_messages message_row
      WHERE message_row.conversation_id = conversation_row.id
      ORDER BY message_row.created_at DESC, message_row.id DESC
      LIMIT 1
    ) AS last_message,
    (
      SELECT count(*)::integer
      FROM public.dm_messages unread_message_row
      WHERE unread_message_row.conversation_id = conversation_row.id
        AND unread_message_row.sender_id <> auth.uid()
        AND (
          unread_message_row.read_by IS NULL
          OR NOT (auth.uid() = ANY(unread_message_row.read_by))
        )
    ) AS unread_count
  FROM public.dm_conversations conversation_row
  WHERE auth.uid() = ANY (conversation_row.participants)
  ORDER BY conversation_row.last_message_at DESC, conversation_row.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dm_conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dm_conversations() TO authenticated;

COMMENT ON FUNCTION public.get_dm_conversations()
  IS 'Returns the current user DM conversations with API-safe public profile payloads.';

/*
  Preserve the fully tested message-window implementation while replacing its
  two user-row serialization sites with the reusable public profile contract.
  The assertion makes migration drift fail closed instead of silently retaining
  a full-row payload.
*/
DO $migration$
DECLARE
  function_ddl text;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_general_chat_message_window(uuid,uuid,timestamp with time zone,integer)'::regprocedure
  )
  INTO function_ddl;

  IF function_ddl IS NULL THEN
    RAISE EXCEPTION 'General Chat message-window function was not found';
  END IF;

  IF position('to_jsonb(user_row)' IN function_ddl) > 0 THEN
    function_ddl := replace(
      function_ddl,
      'to_jsonb(user_row)',
      'public.user_public_profile_json(user_row)'
    );
  ELSIF position('public.user_public_profile_json(user_row)' IN function_ddl) = 0 THEN
    RAISE EXCEPTION 'General Chat public profile serializer was not found';
  END IF;

  EXECUTE function_ddl;
END;
$migration$;

REVOKE ALL ON FUNCTION public.get_general_chat_message_window(uuid, uuid, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_general_chat_message_window(uuid, uuid, timestamptz, integer) TO authenticated;
