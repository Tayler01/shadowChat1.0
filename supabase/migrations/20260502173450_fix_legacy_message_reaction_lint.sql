/*
  # Fix legacy two-argument message reaction RPC

  The app now calls `toggle_message_reaction(uuid, text, boolean)`, which
  delegates to `toggle_message_reaction_v2`. A historical two-argument overload
  still existed with an invalid nested aggregate that caused linked schema lint
  to fail. Keep the old signature for stale clients, but route it through the
  current implementation and return the updated group-message reaction JSON.
*/

CREATE OR REPLACE FUNCTION public.toggle_message_reaction(
  message_id_param uuid,
  emoji_param text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_reactions jsonb;
BEGIN
  PERFORM public.toggle_message_reaction_v2(message_id_param, emoji_param, false);

  SELECT COALESCE(messages.reactions, '{}'::jsonb)
  INTO updated_reactions
  FROM public.messages
  WHERE messages.id = message_id_param;

  RETURN COALESCE(updated_reactions, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_message_reaction(uuid, text) TO authenticated;
