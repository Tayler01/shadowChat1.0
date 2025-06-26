/*
  # Create toggle_message_reaction function

  1. New Functions
    - `toggle_message_reaction` - Handles adding/removing reactions from messages
    - Supports both regular messages and DM messages
    - Properly handles JSONB operations for reactions

  2. Security
    - Function uses security definer to ensure proper access
    - Validates user authentication before operations
*/

-- Function to toggle message reactions
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
  users_array jsonb;
  new_reactions jsonb;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get current reactions based on message type
  IF is_dm THEN
    SELECT reactions INTO current_reactions
    FROM dm_messages
    WHERE id = message_id;
  ELSE
    SELECT reactions INTO current_reactions
    FROM messages
    WHERE id = message_id;
  END IF;

  -- Initialize reactions if null
  IF current_reactions IS NULL THEN
    current_reactions := '{}'::jsonb;
  END IF;

  -- Get current emoji data
  emoji_data := current_reactions -> emoji;
  
  -- Initialize emoji data if it doesn't exist
  IF emoji_data IS NULL THEN
    emoji_data := jsonb_build_object(
      'count', 0,
      'users', '[]'::jsonb
    );
  END IF;

  -- Get users array
  users_array := emoji_data -> 'users';
  IF users_array IS NULL THEN
    users_array := '[]'::jsonb;
  END IF;

  -- Check if user already reacted
  IF users_array ? current_user_id::text THEN
    -- Remove user reaction
    users_array := users_array - current_user_id::text;
    emoji_data := jsonb_set(
      emoji_data,
      '{count}',
      ((emoji_data ->> 'count')::int - 1)::text::jsonb
    );
  ELSE
    -- Add user reaction
    users_array := users_array || jsonb_build_array(current_user_id::text);
    emoji_data := jsonb_set(
      emoji_data,
      '{count}',
      ((COALESCE(emoji_data ->> 'count', '0'))::int + 1)::text::jsonb
    );
  END IF;

  -- Update emoji data with new users array
  emoji_data := jsonb_set(emoji_data, '{users}', users_array);

  -- Remove emoji if no users left
  IF (emoji_data ->> 'count')::int = 0 THEN
    new_reactions := current_reactions - emoji;
  ELSE
    new_reactions := jsonb_set(current_reactions, ARRAY[emoji], emoji_data);
  END IF;

  -- Update the message based on type
  IF is_dm THEN
    UPDATE dm_messages
    SET reactions = new_reactions,
        updated_at = now()
    WHERE id = message_id;
  ELSE
    UPDATE messages
    SET reactions = new_reactions,
        updated_at = now()
    WHERE id = message_id;
  END IF;
END;
$$;

-- Function to update user last active timestamp
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE users
  SET last_active = now(),
      updated_at = now()
  WHERE id = current_user_id;

  -- Also update user presence
  INSERT INTO user_presence (user_id, status, last_seen, updated_at)
  VALUES (current_user_id, 'online', now(), now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    status = 'online',
    last_seen = now(),
    updated_at = now();
END;
$$;

-- Function to get or create DM conversation
CREATE OR REPLACE FUNCTION get_or_create_dm_conversation(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  conversation_id uuid;
  participants_array uuid[];
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  IF current_user_id = other_user_id THEN
    RAISE EXCEPTION 'Cannot create conversation with yourself';
  END IF;

  -- Create sorted participants array for consistent lookup
  participants_array := ARRAY[
    LEAST(current_user_id, other_user_id),
    GREATEST(current_user_id, other_user_id)
  ];

  -- Try to find existing conversation
  SELECT id INTO conversation_id
  FROM dm_conversations
  WHERE participants = participants_array;

  -- Create new conversation if not found
  IF conversation_id IS NULL THEN
    INSERT INTO dm_conversations (participants)
    VALUES (participants_array)
    RETURNING id INTO conversation_id;
  END IF;

  RETURN conversation_id;
END;
$$;

-- Function to mark DM messages as read
CREATE OR REPLACE FUNCTION mark_dm_messages_read(conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Update messages that haven't been read by current user
  UPDATE dm_messages
  SET read_at = now(),
      read_by = CASE
        WHEN read_by IS NULL THEN ARRAY[current_user_id]
        WHEN NOT (current_user_id = ANY(read_by)) THEN array_append(read_by, current_user_id)
        ELSE read_by
      END,
      updated_at = now()
  WHERE dm_messages.conversation_id = mark_dm_messages_read.conversation_id
    AND sender_id != current_user_id
    AND (read_by IS NULL OR NOT (current_user_id = ANY(read_by)));
END;
$$;