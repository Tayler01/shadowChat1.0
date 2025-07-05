CREATE OR REPLACE FUNCTION count_reactions_to_user_dm_messages(user_id uuid)
RETURNS integer AS $$
  SELECT COALESCE(SUM((data->>'count')::int), 0)
  FROM dm_messages m
  CROSS JOIN LATERAL jsonb_each(coalesce(m.reactions, '{}'::jsonb)) AS e(emoji, data)
  WHERE m.sender_id = user_id;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION count_reactions_to_user_dm_messages(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION count_reactions_to_user_messages(user_id uuid)
RETURNS integer AS $$
  SELECT COUNT(*)
  FROM message_reactions r
  JOIN messages m ON r.message_id = m.id
  WHERE m.user_id = user_id;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION count_reactions_to_user_messages(uuid) TO authenticated;
