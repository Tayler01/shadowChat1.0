-- Enable replication settings for realtime

ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE dm_messages REPLICA IDENTITY FULL;
ALTER TABLE dm_conversations REPLICA IDENTITY FULL;
ALTER TABLE message_reactions REPLICA IDENTITY FULL;
ALTER TABLE user_presence REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime
  ADD TABLE messages, dm_messages, dm_conversations, message_reactions, user_presence;
