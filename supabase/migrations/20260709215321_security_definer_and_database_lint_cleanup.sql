-- Close legacy SECURITY DEFINER execution paths and make every current
-- function search path deterministic. This migration intentionally preserves
-- the existing authenticated/service-role API surface while removing the
-- implicit PUBLIC execute grant PostgreSQL gives new functions by default.

DROP FUNCTION IF EXISTS public.create_dm_conversation(uuid);

CREATE OR REPLACE FUNCTION public.get_or_create_dm_conversation(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  conversation_id uuid;
  participants_array uuid[];
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  IF other_user_id IS NULL THEN
    RAISE EXCEPTION 'Other user is required';
  END IF;

  IF current_user_id = other_user_id THEN
    RAISE EXCEPTION 'Cannot create conversation with yourself';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE users.id = get_or_create_dm_conversation.other_user_id
  ) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  participants_array := ARRAY[
    LEAST(current_user_id, other_user_id),
    GREATEST(current_user_id, other_user_id)
  ];

  SELECT conversations.id
  INTO conversation_id
  FROM public.dm_conversations conversations
  WHERE conversations.participants = participants_array;

  IF conversation_id IS NULL THEN
    INSERT INTO public.dm_conversations (participants)
    VALUES (participants_array)
    RETURNING id INTO conversation_id;
  END IF;

  RETURN conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_dm_conversation(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm_conversation(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.toggle_message_pin(message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  is_pinned boolean;
BEGIN
  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT messages.pinned
  INTO is_pinned
  FROM public.messages
  WHERE messages.id = toggle_message_pin.message_id;

  IF is_pinned IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF is_pinned THEN
    UPDATE public.messages
    SET pinned = false,
        pinned_by = NULL,
        pinned_at = NULL
    WHERE messages.id = toggle_message_pin.message_id;
  ELSE
    UPDATE public.messages
    SET pinned = false,
        pinned_by = NULL,
        pinned_at = NULL
    WHERE messages.pinned = true;

    UPDATE public.messages
    SET pinned = true,
        pinned_by = actor_user_id,
        pinned_at = now()
    WHERE messages.id = toggle_message_pin.message_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_message_pin(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_message_pin(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.count_unread_dm_messages(target_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_user_id uuid := auth.uid();
  caller_role text := auth.role();
  unread_count integer;
BEGIN
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  IF caller_role IS DISTINCT FROM 'service_role'
    AND (caller_user_id IS NULL OR target_user_id IS DISTINCT FROM caller_user_id) THEN
    RAISE EXCEPTION 'Users may only count their own unread messages';
  END IF;

  SELECT count(*)::integer
  INTO unread_count
  FROM public.dm_messages message
  JOIN public.dm_conversations conversation
    ON conversation.id = message.conversation_id
  WHERE target_user_id = ANY(conversation.participants)
    AND message.sender_id <> target_user_id
    AND (
      message.read_by IS NULL
      OR NOT (target_user_id = ANY(message.read_by))
    );

  RETURN unread_count;
END;
$$;

REVOKE ALL ON FUNCTION public.count_unread_dm_messages(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_unread_dm_messages(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_users(term text)
RETURNS TABLE(
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
  shadow_runner_sprint_medal boolean,
  shadow_runner_knight_medal boolean,
  shadow_runner_knight_level_id text,
  gold_easter_egg boolean,
  presence_visibility text,
  dm_discoverable boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  IF length(trim(COALESCE(search_users.term, ''))) < 2 THEN
    RETURN;
  END IF;

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
    users.shadow_runner_sprint_medal,
    users.shadow_runner_knight_medal,
    users.shadow_runner_knight_level_id,
    users.gold_easter_egg,
    users.presence_visibility,
    users.dm_discoverable
  FROM public.users users
  WHERE users.dm_discoverable IS TRUE
    AND (
      users.username ILIKE '%' || trim(search_users.term) || '%'
      OR users.display_name ILIKE '%' || trim(search_users.term) || '%'
    )
  ORDER BY lower(COALESCE(users.display_name, users.username, '')), lower(users.username)
  LIMIT 30;
END;
$$;

REVOKE ALL ON FUNCTION public.search_users(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_users(text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.bridge_mark_dm_messages_read(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bridge_mark_dm_messages_read(uuid, uuid)
  TO service_role;

-- Resolve current Supabase database-linter search-path findings. These are
-- ALTERs rather than body rewrites so the migration cannot drift behavior.
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_conversation_last_message() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_conversation_timestamp() SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_storage_url(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.count_reactions_to_user_dm_messages(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.count_reactions_to_user_messages(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_dm_conversations() SET search_path = public, pg_temp;
ALTER FUNCTION public.count_user_reactions(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.count_reactions_to_user_messages_v2(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.count_reactions_to_user_dm_messages_v2(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.shadow_checkers_count_pieces(jsonb, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.shadow_checkers_position_label(integer, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.shadow_checkers_apply_move_state(jsonb, text, text, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.shadow_checkers_without_piece_at(jsonb, integer, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.shadow_checkers_piece_at(jsonb, integer, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.shadow_checkers_replace_piece(jsonb, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.shadow_checkers_is_playable_square(integer, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.shadow_checkers_initial_board() SET search_path = public, pg_temp;
ALTER FUNCTION public.shadow_checkers_initial_board() STABLE;
ALTER FUNCTION public.shadow_checkers_piece_has_capture(jsonb, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.shadow_checkers_player_has_capture(jsonb, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.shadow_checkers_player_has_move(jsonb, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.shadow_checkers_character_for_winner(public.shadow_checkers_matches) SET search_path = public, pg_temp;

-- Remove PostgreSQL's implicit PUBLIC execute permission from every existing
-- public SECURITY DEFINER function. Existing role-specific grants remain.
DO $$
DECLARE
  function_signature regprocedure;
BEGIN
  FOR function_signature IN
    SELECT procedures.oid::regprocedure
    FROM pg_proc procedures
    JOIN pg_namespace namespaces ON namespaces.oid = procedures.pronamespace
    WHERE namespaces.nspname = 'public'
      AND procedures.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', function_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_signature);
  END LOOP;
END;
$$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
