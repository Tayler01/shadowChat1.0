-- Allow DM authors to delete their own messages so DM actions match chat and boards.
DROP POLICY IF EXISTS "Users can delete own DM messages" ON public.dm_messages;

CREATE POLICY "Users can delete own DM messages"
  ON public.dm_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);
