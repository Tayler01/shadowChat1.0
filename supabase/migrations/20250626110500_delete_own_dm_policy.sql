CREATE POLICY "Users can delete own DM messages"
  ON dm_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);
