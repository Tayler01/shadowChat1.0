-- Enable realtime on important chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS messages;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS dm_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS users;
