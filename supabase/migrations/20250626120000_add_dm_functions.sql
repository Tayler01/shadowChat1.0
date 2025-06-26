-- Add DM helper functions

-- Function to get or create a DM conversation
CREATE OR REPLACE FUNCTION get_or_create_dm_conversation(other_user_id uuid)
RETURNS uuid AS $$
DECLARE
  conversation_id uuid;
  participants_array uuid[];
BEGIN
  -- Create sorted participants array
  participants_array := ARRAY[LEAST(auth.uid(), other_user_id), GREATEST(auth.uid(), other_user_id)];

  -- Try to find existing conversation
  SELECT id INTO conversation_id
  FROM dm_conversations
  WHERE participants = participants_array;

  -- Create if it doesn't exist
  IF conversation_id IS NULL THEN
    INSERT INTO dm_conversations (participants)
    VALUES (participants_array)
    RETURNING id INTO conversation_id;
  END IF;

  RETURN conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark DM messages as read
CREATE OR REPLACE FUNCTION mark_dm_messages_read(conversation_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE dm_messages
  SET read_at = now()
  WHERE dm_messages.conversation_id = mark_dm_messages_read.conversation_id
    AND sender_id != auth.uid()
    AND read_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissions
GRANT EXECUTE ON FUNCTION get_or_create_dm_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_dm_messages_read(uuid) TO authenticated;
