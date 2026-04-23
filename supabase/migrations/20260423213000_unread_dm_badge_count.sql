CREATE OR REPLACE FUNCTION public.count_unread_dm_messages(target_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.dm_messages message
  JOIN public.dm_conversations conversation
    ON conversation.id = message.conversation_id
  WHERE target_user_id IS NOT NULL
    AND target_user_id = ANY(conversation.participants)
    AND message.sender_id <> target_user_id
    AND (
      message.read_by IS NULL
      OR NOT (target_user_id = ANY(message.read_by))
    );
$$;

GRANT EXECUTE ON FUNCTION public.count_unread_dm_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_unread_dm_messages(uuid) TO service_role;
