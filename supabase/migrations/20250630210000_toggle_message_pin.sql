/*
  # Allow any authenticated user to pin or unpin messages

  Adds `toggle_message_pin(message_id uuid)` which toggles the pinned
  state of a message. When pinning a new message the function unpins any
  currently pinned message so that only one message remains pinned. The
  pinning user is recorded in `pinned_by` and the timestamp stored in
  `pinned_at`.
*/

CREATE OR REPLACE FUNCTION toggle_message_pin(message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_pinned boolean;
BEGIN
  SELECT pinned INTO is_pinned FROM messages WHERE id = message_id;

  IF is_pinned IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF is_pinned THEN
    UPDATE messages
    SET pinned = false,
        pinned_by = NULL,
        pinned_at = NULL
    WHERE id = message_id;
  ELSE
    UPDATE messages
    SET pinned = false,
        pinned_by = NULL,
        pinned_at = NULL
    WHERE pinned = true;

    UPDATE messages
    SET pinned = true,
        pinned_by = auth.uid(),
        pinned_at = NOW()
    WHERE id = message_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_message_pin(uuid) TO authenticated;
