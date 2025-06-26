-- Reset database schema
DROP TRIGGER IF EXISTS update_dm_conversation_timestamp ON dm_messages;
DROP TABLE IF EXISTS user_presence CASCADE;
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS dm_messages CASCADE;
DROP TABLE IF EXISTS dm_conversations CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP FUNCTION IF EXISTS update_conversation_timestamp() CASCADE;
DROP FUNCTION IF EXISTS update_user_last_active() CASCADE;
DROP FUNCTION IF EXISTS toggle_message_reaction(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS create_dm_conversation(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_or_create_dm_conversation(uuid) CASCADE;
DROP FUNCTION IF EXISTS mark_dm_messages_read(uuid) CASCADE;
/*
  # Realtime Chat Platform Database Schema

  1. New Tables
    - `users` - Extended user profiles with chat-specific fields
    - `messages` - Main chat messages with reactions and pinning
    - `dm_conversations` - Direct message conversation threads
    - `dm_messages` - Direct message content with read tracking
    - `message_reactions` - Emoji reactions on messages
    - `user_presence` - Real-time presence tracking

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
    - Secure direct messages to participants only
    - Message ownership and editing policies

  3. Functions
    - update_user_last_active() - Update presence
    - toggle_message_reaction() - Handle reactions
    - create_dm_conversation() - Initialize DM threads
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends auth.users)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  display_name text,
  username text UNIQUE,
  avatar_url text,
  banner_url text,
  status text DEFAULT 'online',
  status_message text,
  color text DEFAULT '#3B82F6',
  last_active timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  message_type text DEFAULT 'text',
  edited_at timestamptz,
  pinned boolean DEFAULT false,
  pinned_by uuid REFERENCES users(id),
  pinned_at timestamptz,
  reply_to uuid REFERENCES messages(id),
  reactions jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- DM Conversations
CREATE TABLE IF NOT EXISTS dm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participants uuid[] NOT NULL,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT participants_length CHECK (array_length(participants, 1) = 2)
);

-- DM Messages
CREATE TABLE IF NOT EXISTS dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES dm_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  message_type text DEFAULT 'text',
  read_at timestamptz,
  read_by uuid[],
  edited_at timestamptz,
  reactions jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Message Reactions (separate table for better querying)
CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- User Presence tracking
CREATE TABLE IF NOT EXISTS user_presence (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status text DEFAULT 'online',
  last_seen timestamptz DEFAULT now(),
  current_channel text,
  typing_in text,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can read all profiles"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Messages policies
CREATE POLICY "Messages are readable by authenticated users"
  ON messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages"
  ON messages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- DM Conversations policies
CREATE POLICY "Users can read own conversations"
  ON dm_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = ANY(participants));

CREATE POLICY "Users can create conversations"
  ON dm_conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = ANY(participants));

CREATE POLICY "Users can update own conversations"
  ON dm_conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = ANY(participants));

-- DM Messages policies
CREATE POLICY "Users can read messages in their conversations"
  ON dm_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dm_conversations
      WHERE id = conversation_id
      AND auth.uid() = ANY(participants)
    )
  );

CREATE POLICY "Users can send messages to their conversations"
  ON dm_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM dm_conversations
      WHERE id = conversation_id
      AND auth.uid() = ANY(participants)
    )
  );

CREATE POLICY "Users can update own messages"
  ON dm_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id);

-- Message Reactions policies
CREATE POLICY "Users can read all reactions"
  ON message_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can add own reactions"
  ON message_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own reactions"
  ON message_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- User Presence policies
CREATE POLICY "Users can read all presence"
  ON user_presence FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own presence"
  ON user_presence FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id);
CREATE INDEX IF NOT EXISTS dm_messages_conversation_id_idx ON dm_messages(conversation_id);
CREATE INDEX IF NOT EXISTS dm_messages_created_at_idx ON dm_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS dm_conversations_participants_idx ON dm_conversations USING GIN(participants);
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);
CREATE INDEX IF NOT EXISTS user_presence_status_idx ON user_presence(status);

-- Functions
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS void AS $$
BEGIN
  UPDATE users SET last_active = now() WHERE id = auth.uid();
  
  INSERT INTO user_presence (user_id, last_seen, updated_at)
  VALUES (auth.uid(), now(), now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    last_seen = now(),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION toggle_message_reaction(
  message_id_param uuid,
  emoji_param text
)
RETURNS jsonb AS $$
DECLARE
  existing_reaction uuid;
  current_reactions jsonb;
  user_reactions text[];
  updated_reactions jsonb;
BEGIN
  -- Check if reaction exists
  SELECT id INTO existing_reaction
  FROM message_reactions
  WHERE message_id = message_id_param
  AND user_id = auth.uid()
  AND emoji = emoji_param;

  IF existing_reaction IS NOT NULL THEN
    -- Remove reaction
    DELETE FROM message_reactions WHERE id = existing_reaction;
  ELSE
    -- Add reaction
    INSERT INTO message_reactions (message_id, user_id, emoji)
    VALUES (message_id_param, auth.uid(), emoji_param);
  END IF;

  -- Update reactions JSONB on message
  SELECT COALESCE(
    jsonb_object_agg(
      emoji,
      jsonb_build_object(
        'count', count(*),
        'users', array_agg(user_id)
      )
    ),
    '{}'::jsonb
  ) INTO updated_reactions
  FROM message_reactions
  WHERE message_id = message_id_param
  GROUP BY emoji;

  UPDATE messages
  SET reactions = updated_reactions
  WHERE id = message_id_param;

  RETURN updated_reactions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION create_dm_conversation(other_user_id uuid)
RETURNS uuid AS $$
DECLARE
  conversation_id uuid;
  participants_array uuid[];
BEGIN
  -- Create sorted participants array
  SELECT ARRAY[LEAST(auth.uid(), other_user_id), GREATEST(auth.uid(), other_user_id)]
  INTO participants_array;

  -- Check if conversation already exists
  SELECT id INTO conversation_id
  FROM dm_conversations
  WHERE participants = participants_array;

  IF conversation_id IS NULL THEN
    -- Create new conversation
    INSERT INTO dm_conversations (participants)
    VALUES (participants_array)
    RETURNING id INTO conversation_id;
  END IF;

  RETURN conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update dm_conversations.last_message_at
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE dm_conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_dm_conversation_timestamp
  AFTER INSERT ON dm_messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_timestamp();

-- Grant permissions
GRANT EXECUTE ON FUNCTION update_user_last_active() TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_message_reaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_dm_conversation(uuid) TO authenticated;-- Enable replication settings for realtime

ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE dm_messages REPLICA IDENTITY FULL;
ALTER TABLE dm_conversations REPLICA IDENTITY FULL;
ALTER TABLE message_reactions REPLICA IDENTITY FULL;
ALTER TABLE user_presence REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime
  ADD TABLE messages, dm_messages, dm_conversations, message_reactions, user_presence;
CREATE POLICY "Users can delete own DM messages"
  ON dm_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);
-- Add DM helper functions

-- Function to get or create a DM conversation
CREATE OR REPLACE FUNCTION get_or_create_dm_conversation(other_user_id uuid)
RETURNS uuid AS $$
DECLARE
  conversation_id uuid;
  participants_array uuid[];
BEGIN
  -- Create sorted participants array
  participants_array := ARRAY[LEAST(auth.uid(), other_user_id), GREATEST(auth.uid(), other_user_id)];

  -- Try to find existing conversation
  SELECT id INTO conversation_id
  FROM dm_conversations
  WHERE participants = participants_array;

  -- Create if it doesn't exist
  IF conversation_id IS NULL THEN
    INSERT INTO dm_conversations (participants)
    VALUES (participants_array)
    RETURNING id INTO conversation_id;
  END IF;

  RETURN conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark DM messages as read
CREATE OR REPLACE FUNCTION mark_dm_messages_read(conversation_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE dm_messages
  SET read_at = now()
  WHERE dm_messages.conversation_id = mark_dm_messages_read.conversation_id
    AND sender_id != auth.uid()
    AND read_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissions
GRANT EXECUTE ON FUNCTION get_or_create_dm_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_dm_messages_read(uuid) TO authenticated;
-- Add display_name column to users if not exists
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name text;
/*
  # Fix RLS policies for users table

  1. Security
    - Drop existing policies that might be causing issues
    - Create new, more explicit policies for user operations
    - Ensure proper authentication checks
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Users can read all profiles" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Create new policies with explicit checks
CREATE POLICY "Enable insert for authenticated users on own profile"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable read access for authenticated users"
  ON users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable update for users based on user_id"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Ensure RLS is enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
