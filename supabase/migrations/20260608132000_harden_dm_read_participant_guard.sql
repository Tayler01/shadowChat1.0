/*
  # Harden normal DM read receipts

  The bridge-specific read helper already verifies that the acting reader is a
  participant in the target DM conversation. Apply the same guard to the normal
  authenticated RPC so a caller cannot mark unrelated conversations as read by
  guessing a conversation id.
*/

CREATE OR REPLACE FUNCTION public.mark_dm_messages_read(conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.dm_conversations
    WHERE id = mark_dm_messages_read.conversation_id
      AND current_user_id = ANY(participants)
  ) THEN
    RAISE EXCEPTION 'reader is not a participant in this DM conversation';
  END IF;

  UPDATE public.dm_messages
  SET read_at = COALESCE(read_at, now()),
      read_by = CASE
        WHEN read_by IS NULL THEN ARRAY[current_user_id]::uuid[]
        WHEN NOT (current_user_id = ANY(read_by)) THEN array_append(read_by, current_user_id)
        ELSE read_by
      END,
      updated_at = now()
  WHERE dm_messages.conversation_id = mark_dm_messages_read.conversation_id
    AND sender_id != current_user_id
    AND (read_by IS NULL OR NOT (current_user_id = ANY(read_by)));
END;
$$;

REVOKE ALL ON FUNCTION public.mark_dm_messages_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_dm_messages_read(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_dm_messages_read(uuid) TO authenticated;
