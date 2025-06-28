-- Ensure reactions users array is deduplicated when toggling
CREATE OR REPLACE FUNCTION toggle_message_reaction(
  message_id uuid,
  emoji text,
  is_dm boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  current_reactions jsonb;
  emoji_data jsonb;
  users_arr text[];
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  IF is_dm THEN
    SELECT reactions INTO current_reactions FROM dm_messages WHERE id = message_id;
  ELSE
    SELECT reactions INTO current_reactions FROM messages WHERE id = message_id;
  END IF;

  IF current_reactions IS NULL THEN
    current_reactions := '{}'::jsonb;
  END IF;

  emoji_data := current_reactions -> emoji;
  IF emoji_data IS NULL THEN
    emoji_data := jsonb_build_object('count', 0, 'users', '[]'::jsonb);
  END IF;

  users_arr := ARRAY(SELECT DISTINCT jsonb_array_elements_text(emoji_data -> 'users'));

  IF current_user_id::text = ANY(users_arr) THEN
    users_arr := array_remove(users_arr, current_user_id::text);
  ELSE
    users_arr := array_append(users_arr, current_user_id::text);
  END IF;

  IF array_length(users_arr, 1) IS NULL THEN
    current_reactions := current_reactions - emoji;
  ELSE
    emoji_data := jsonb_build_object(
      'count', array_length(users_arr, 1),
      'users', to_jsonb(users_arr)
    );
    current_reactions := jsonb_set(current_reactions, ARRAY[emoji], emoji_data);
  END IF;

  IF is_dm THEN
    UPDATE dm_messages SET reactions = current_reactions, updated_at = now() WHERE id = message_id;
  ELSE
    UPDATE messages SET reactions = current_reactions, updated_at = now() WHERE id = message_id;
  END IF;
END;
$$;
