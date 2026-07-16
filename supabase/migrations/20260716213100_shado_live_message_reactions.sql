/*
  # Shado Live message reactions

  Adds the same lightweight, server-authoritative reaction interaction used by
  the main chat while keeping Shado Live isolated from public.messages and
  public.message_reactions.

  Browser roles retain no direct table authority. Authenticated callers use
  narrow public invoker wrappers backed by reviewed private definer functions.
*/

BEGIN;

CREATE TABLE public.live_room_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.live_rooms(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.live_room_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (
    char_length(trim(emoji)) BETWEEN 1 AND 16
    AND emoji !~ '[[:space:]]'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_room_message_reactions_unique
    UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX live_room_message_reactions_room_message_idx
  ON public.live_room_message_reactions (room_id, message_id, created_at, id);
CREATE INDEX live_room_message_reactions_user_idx
  ON public.live_room_message_reactions (user_id, created_at DESC, id);

ALTER TABLE public.live_room_message_reactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.live_room_message_reactions
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION shado_live_private.list_my_shado_live_message_reactions_impl(
  target_room_id uuid,
  target_message_ids uuid[]
)
RETURNS TABLE (
  message_id uuid,
  emoji text,
  reaction_count integer,
  reacted_by_me boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  bounded_message_ids uuid[] := coalesce(target_message_ids, ARRAY[]::uuid[]);
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF cardinality(bounded_message_ids) > 100 THEN
    RAISE EXCEPTION 'Too many live message ids requested';
  END IF;
  IF NOT shado_live_private.can_access_shado_live_room(caller_id, target_room_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    reactions.message_id,
    reactions.emoji,
    count(*)::integer,
    bool_or(reactions.user_id = caller_id)
  FROM public.live_room_message_reactions reactions
  JOIN public.live_room_messages messages
    ON messages.id = reactions.message_id
   AND messages.room_id = reactions.room_id
  WHERE reactions.room_id = target_room_id
    AND messages.deleted_at IS NULL
    AND reactions.message_id = ANY(bounded_message_ids)
    AND NOT private.users_have_block(caller_id, messages.sender_user_id)
    AND NOT private.users_have_block(caller_id, reactions.user_id)
  GROUP BY reactions.message_id, reactions.emoji
  ORDER BY reactions.message_id, min(reactions.created_at), reactions.emoji;
END;
$$;

CREATE FUNCTION shado_live_private.toggle_my_shado_live_message_reaction_impl(
  target_message_id uuid,
  reaction_emoji text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  normalized_emoji text := trim(coalesce(reaction_emoji, ''));
  message_row public.live_room_messages%ROWTYPE;
  existing_reaction_id uuid;
  reaction_active boolean;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF char_length(normalized_emoji) NOT BETWEEN 1 AND 16
    OR normalized_emoji ~ '[[:space:]]'
  THEN
    RAISE EXCEPTION 'A valid reaction is required';
  END IF;

  SELECT messages.* INTO message_row
  FROM public.live_room_messages messages
  JOIN public.live_rooms rooms ON rooms.id = messages.room_id
  WHERE messages.id = target_message_id
    AND messages.deleted_at IS NULL
    AND rooms.status = 'live'
  FOR UPDATE OF messages;

  IF NOT FOUND
    OR NOT shado_live_private.can_access_shado_live_room(caller_id, message_row.room_id)
    OR private.user_has_shado_live_restriction(caller_id, 'chat')
    OR private.users_have_block(caller_id, message_row.sender_user_id)
  THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Live message is unavailable';
  END IF;

  SELECT reactions.id INTO existing_reaction_id
  FROM public.live_room_message_reactions reactions
  WHERE reactions.message_id = message_row.id
    AND reactions.user_id = caller_id
    AND reactions.emoji = normalized_emoji
  FOR UPDATE;

  IF existing_reaction_id IS NULL THEN
    INSERT INTO public.live_room_message_reactions (
      room_id,
      message_id,
      user_id,
      emoji
    )
    VALUES (
      message_row.room_id,
      message_row.id,
      caller_id,
      normalized_emoji
    );
    reaction_active := true;
  ELSE
    DELETE FROM public.live_room_message_reactions reactions
    WHERE reactions.id = existing_reaction_id;
    reaction_active := false;
  END IF;

  RETURN jsonb_build_object(
    'roomId', message_row.room_id,
    'messageId', message_row.id,
    'emoji', normalized_emoji,
    'active', reaction_active
  );
END;
$$;

CREATE FUNCTION public.list_my_shado_live_message_reactions(
  target_room_id uuid,
  target_message_ids uuid[]
)
RETURNS TABLE (
  message_id uuid,
  emoji text,
  reaction_count integer,
  reacted_by_me boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM shado_live_private.list_my_shado_live_message_reactions_impl(
    target_room_id,
    target_message_ids
  );
$$;

CREATE FUNCTION public.toggle_my_shado_live_message_reaction(
  target_message_id uuid,
  reaction_emoji text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT shado_live_private.toggle_my_shado_live_message_reaction_impl(
    target_message_id,
    reaction_emoji
  );
$$;

CREATE TRIGGER touch_shado_live_message_reaction_signal
  AFTER INSERT OR DELETE ON public.live_room_message_reactions
  FOR EACH ROW EXECUTE FUNCTION private.touch_shado_live_room_signal();

REVOKE ALL ON FUNCTION
  shado_live_private.list_my_shado_live_message_reactions_impl(uuid, uuid[]),
  shado_live_private.toggle_my_shado_live_message_reaction_impl(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  shado_live_private.list_my_shado_live_message_reactions_impl(uuid, uuid[]),
  shado_live_private.toggle_my_shado_live_message_reaction_impl(uuid, text)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.list_my_shado_live_message_reactions(uuid, uuid[]),
  public.toggle_my_shado_live_message_reaction(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.list_my_shado_live_message_reactions(uuid, uuid[]),
  public.toggle_my_shado_live_message_reaction(uuid, text)
TO authenticated, service_role;

COMMENT ON TABLE public.live_room_message_reactions IS
  'Shado Live-only message reactions; browser access is RPC-only.';
COMMENT ON FUNCTION public.list_my_shado_live_message_reactions(uuid, uuid[]) IS
  'Returns block-filtered reaction aggregates for caller-visible Shado Live messages.';
COMMENT ON FUNCTION public.toggle_my_shado_live_message_reaction(uuid, text) IS
  'Atomically toggles the authenticated caller reaction on an available live-room message.';

COMMIT;
