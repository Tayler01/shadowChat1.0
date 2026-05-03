-- Let app operators delete normal-user messages in public group and board chats.
-- DMs are intentionally excluded, and admin/sub-admin authored messages remain
-- protected from other operators.

DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete own or moderate non-admin messages" ON public.messages;

CREATE POLICY "Users can delete own or moderate non-admin messages"
  ON public.messages
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR (
      public.is_app_operator((select auth.uid()))
      AND EXISTS (
        SELECT 1
        FROM public.users message_author
        WHERE message_author.id = messages.user_id
          AND message_author.admin_role IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete own board chat messages" ON public.board_chat_messages;
DROP POLICY IF EXISTS "Users can delete own or moderate board chat messages" ON public.board_chat_messages;

CREATE POLICY "Users can delete own or moderate board chat messages"
  ON public.board_chat_messages
  FOR DELETE
  TO authenticated
  USING (
    NOT public.is_board_interaction_banned((select auth.uid()), board_slug)
    AND (
      (select auth.uid()) = user_id
      OR (
        public.is_app_operator((select auth.uid()))
        AND EXISTS (
          SELECT 1
          FROM public.users message_author
          WHERE message_author.id = board_chat_messages.user_id
            AND message_author.admin_role IS NULL
        )
      )
    )
  );
