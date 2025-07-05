/*
  # Fix Message Reactions System

  1. New Functions
    - `toggle_message_reaction_v2` - Properly handles reactions in message_reactions table
    - `count_user_reactions` - Counts reactions given by a user
    - `count_reactions_to_user_messages_v2` - Counts reactions received on user's messages
    - `count_reactions_to_user_dm_messages_v2` - Counts reactions received on user's DM messages

  2. Updates
    - Fix reaction toggle logic to use both jsonb reactions field and message_reactions table
    - Ensure proper counting for profile stats

  3. Security
    - Maintain existing RLS policies
    - Add proper error handling
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS toggle_message_reaction(uuid, text, boolean);

-- Create improved toggle_message_reaction function
CREATE OR REPLACE FUNCTION toggle_message_reaction_v2(
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
  existing_reaction_id uuid;
  current_reactions jsonb;
  emoji_data jsonb;
  new_reactions jsonb;
BEGIN
  -- Get current user
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if reaction already exists in message_reactions table
  SELECT id INTO existing_reaction_id
  FROM message_reactions
  WHERE message_reactions.message_id = toggle_message_reaction_v2.message_id
    AND message_reactions.user_id = current_user_id
    AND message_reactions.emoji = toggle_message_reaction_v2.emoji;

  IF existing_reaction_id IS NOT NULL THEN
    -- Remove reaction from message_reactions table
    DELETE FROM message_reactions WHERE id = existing_reaction_id;
    
    -- Update jsonb reactions field
    IF is_dm THEN
      SELECT reactions INTO current_reactions FROM dm_messages WHERE id = message_id;
      
      emoji_data := current_reactions -> emoji;
      IF emoji_data IS NOT NULL THEN
        emoji_data := jsonb_build_object(
          'count', GREATEST(0, (emoji_data->>'count')::int - 1),
          'users', (
            SELECT jsonb_agg(user_id)
            FROM jsonb_array_elements_text(emoji_data->'users') AS user_id
            WHERE user_id::uuid != current_user_id
          )
        );
        
        IF (emoji_data->>'count')::int <= 0 THEN
          new_reactions := current_reactions - emoji;
        ELSE
          new_reactions := current_reactions || jsonb_build_object(emoji, emoji_data);
        END IF;
        
        UPDATE dm_messages SET reactions = new_reactions WHERE id = message_id;
      END IF;
    ELSE
      SELECT reactions INTO current_reactions FROM messages WHERE id = message_id;
      
      emoji_data := current_reactions -> emoji;
      IF emoji_data IS NOT NULL THEN
        emoji_data := jsonb_build_object(
          'count', GREATEST(0, (emoji_data->>'count')::int - 1),
          'users', (
            SELECT jsonb_agg(user_id)
            FROM jsonb_array_elements_text(emoji_data->'users') AS user_id
            WHERE user_id::uuid != current_user_id
          )
        );
        
        IF (emoji_data->>'count')::int <= 0 THEN
          new_reactions := current_reactions - emoji;
        ELSE
          new_reactions := current_reactions || jsonb_build_object(emoji, emoji_data);
        END IF;
        
        UPDATE messages SET reactions = new_reactions WHERE id = message_id;
      END IF;
    END IF;
  ELSE
    -- Add reaction to message_reactions table
    INSERT INTO message_reactions (message_id, user_id, emoji)
    VALUES (message_id, current_user_id, emoji);
    
    -- Update jsonb reactions field
    IF is_dm THEN
      SELECT COALESCE(reactions, '{}'::jsonb) INTO current_reactions FROM dm_messages WHERE id = message_id;
    ELSE
      SELECT COALESCE(reactions, '{}'::jsonb) INTO current_reactions FROM messages WHERE id = message_id;
    END IF;
    
    emoji_data := current_reactions -> emoji;
    IF emoji_data IS NULL THEN
      emoji_data := jsonb_build_object(
        'count', 1,
        'users', jsonb_build_array(current_user_id)
      );
    ELSE
      emoji_data := jsonb_build_object(
        'count', (emoji_data->>'count')::int + 1,
        'users', (emoji_data->'users') || jsonb_build_array(current_user_id)
      );
    END IF;
    
    new_reactions := current_reactions || jsonb_build_object(emoji, emoji_data);
    
    IF is_dm THEN
      UPDATE dm_messages SET reactions = new_reactions WHERE id = message_id;
    ELSE
      UPDATE messages SET reactions = new_reactions WHERE id = message_id;
    END IF;
  END IF;
END;
$$;

-- Create function to count reactions given by a user
CREATE OR REPLACE FUNCTION count_user_reactions(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reaction_count integer;
BEGIN
  SELECT COUNT(*)
  INTO reaction_count
  FROM message_reactions
  WHERE user_id = target_user_id;
  
  RETURN COALESCE(reaction_count, 0);
END;
$$;

-- Create improved function to count reactions to user's messages
CREATE OR REPLACE FUNCTION count_reactions_to_user_messages_v2(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reaction_count integer;
BEGIN
  SELECT COUNT(mr.*)
  INTO reaction_count
  FROM message_reactions mr
  INNER JOIN messages m ON mr.message_id = m.id
  WHERE m.user_id = target_user_id;
  
  RETURN COALESCE(reaction_count, 0);
END;
$$;

-- Create improved function to count reactions to user's DM messages
CREATE OR REPLACE FUNCTION count_reactions_to_user_dm_messages_v2(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reaction_count integer;
BEGIN
  SELECT COUNT(mr.*)
  INTO reaction_count
  FROM message_reactions mr
  INNER JOIN dm_messages dm ON mr.message_id = dm.id
  WHERE dm.sender_id = target_user_id;
  
  RETURN COALESCE(reaction_count, 0);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION toggle_message_reaction_v2(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION count_user_reactions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION count_reactions_to_user_messages_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION count_reactions_to_user_dm_messages_v2(uuid) TO authenticated;

-- Create backward compatibility wrapper
CREATE OR REPLACE FUNCTION toggle_message_reaction(
  message_id uuid,
  emoji text,
  is_dm boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM toggle_message_reaction_v2(message_id, emoji, is_dm);
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_message_reaction(uuid, text, boolean) TO authenticated;