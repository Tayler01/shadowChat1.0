/*
  # Fix get_dm_conversations function type mismatch

  1. Problem
    - The `get_dm_conversations` RPC function returns a `bigint` in column 8
    - Client expects an `integer` type
    - This causes "structure of query does not match function result type" error

  2. Solution
    - Update the function to cast COUNT(*) operations to integer
    - Ensure all numeric columns return the expected integer type
    - Maintain the same function signature and behavior
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS get_dm_conversations();

-- Recreate the function with proper type casting
CREATE OR REPLACE FUNCTION get_dm_conversations()
RETURNS TABLE (
  id uuid,
  participants uuid[],
  last_message_at timestamptz,
  created_at timestamptz,
  other_user_id uuid,
  other_user_username text,
  other_user_display_name text,
  unread_count integer,
  last_message_id uuid,
  last_message_content text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.participants,
    c.last_message_at,
    c.created_at,
    CASE 
      WHEN c.participants[1] = auth.uid() THEN c.participants[2]
      ELSE c.participants[1]
    END as other_user_id,
    u.username as other_user_username,
    u.display_name as other_user_display_name,
    COALESCE(
      (SELECT COUNT(*)::integer 
       FROM dm_messages dm 
       WHERE dm.conversation_id = c.id 
         AND dm.sender_id != auth.uid() 
         AND dm.read_at IS NULL), 
      0
    ) as unread_count,
    lm.id as last_message_id,
    lm.content as last_message_content,
    lm.sender_id as last_message_sender_id,
    lm.created_at as last_message_created_at
  FROM dm_conversations c
  LEFT JOIN users u ON u.id = CASE 
    WHEN c.participants[1] = auth.uid() THEN c.participants[2]
    ELSE c.participants[1]
  END
  LEFT JOIN LATERAL (
    SELECT dm.id, dm.content, dm.sender_id, dm.created_at
    FROM dm_messages dm
    WHERE dm.conversation_id = c.id
    ORDER BY dm.created_at DESC
    LIMIT 1
  ) lm ON true
  WHERE auth.uid() = ANY(c.participants)
  ORDER BY c.last_message_at DESC;
END;
$$;