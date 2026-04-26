/*
  # Bridge DM read receipts

  The bridge DM poll function runs with service-role access, so it cannot use
  the normal mark_dm_messages_read() helper that depends on auth.uid().
  This helper preserves the same read_by semantics for the bridge user while
  remaining callable only by service-role backend code.
*/

CREATE OR REPLACE FUNCTION public.bridge_mark_dm_messages_read(
  p_conversation_id uuid,
  p_reader_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  marked_count integer := 0;
BEGIN
  IF p_conversation_id IS NULL OR p_reader_user_id IS NULL THEN
    RAISE EXCEPTION 'conversation and reader are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.dm_conversations
    WHERE id = p_conversation_id
      AND p_reader_user_id = ANY(participants)
  ) THEN
    RAISE EXCEPTION 'reader is not a participant in this DM conversation';
  END IF;

  UPDATE public.dm_messages
  SET read_at = COALESCE(read_at, now()),
      read_by = CASE
        WHEN read_by IS NULL THEN ARRAY[p_reader_user_id]::uuid[]
        WHEN NOT (p_reader_user_id = ANY(read_by)) THEN array_append(read_by, p_reader_user_id)
        ELSE read_by
      END,
      updated_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id != p_reader_user_id
    AND (read_by IS NULL OR NOT (p_reader_user_id = ANY(read_by)));

  GET DIAGNOSTICS marked_count = ROW_COUNT;
  RETURN marked_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bridge_mark_dm_messages_read(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bridge_mark_dm_messages_read(uuid, uuid) TO service_role;
