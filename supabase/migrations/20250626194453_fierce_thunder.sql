/*
  # Enable Realtime for Chat Tables

  1. Changes
    - Add messages table to realtime publication
    - Add dm_messages table to realtime publication  
    - Add dm_conversations table to realtime publication
    - Add users table to realtime publication

  2. Notes
    - Uses DO blocks to safely add tables only if not already present
    - Enables real-time updates for chat functionality
*/

-- Enable realtime on messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;

-- Enable realtime on dm_messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'dm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dm_messages;
  END IF;
END $$;

-- Enable realtime on dm_conversations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'dm_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dm_conversations;
  END IF;
END $$;

-- Enable realtime on users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE users;
  END IF;
END $$;