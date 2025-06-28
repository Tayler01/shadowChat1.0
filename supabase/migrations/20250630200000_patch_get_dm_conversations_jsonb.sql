-- Patch to ensure get_dm_conversations returns jsonb types
CREATE OR REPLACE FUNCTION get_dm_conversations()
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.participants,
    c.last_message_at,
    c.created_at,
    c.updated_at,
    (
      SELECT to_jsonb(u)
      FROM users u
      WHERE u.id <> auth.uid()
        AND u.id = ANY (c.participants)
      LIMIT 1
    ) AS other_user,
    (
      SELECT to_jsonb(m)
      FROM dm_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) AS last_message,
    (
      SELECT count(*)
      FROM dm_messages m2
      WHERE m2.conversation_id = c.id
        AND m2.sender_id <> auth.uid()
        AND (m2.read_by IS NULL OR NOT (auth.uid() = ANY(m2.read_by)))
    ) AS unread_count
  FROM dm_conversations c
  WHERE auth.uid() = ANY (c.participants)
  ORDER BY c.last_message_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dm_conversations() TO authenticated;
