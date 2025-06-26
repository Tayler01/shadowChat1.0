/*
  # Realtime Chat Platform Database Schema

  1. New Tables
    - `users` - User profiles with authentication integration
      - `id` (uuid, primary key, references auth.users)
      - `username` (text, unique)
      - `display_name` (text)
      - `avatar_url` (text)
      - `banner_url` (text)
      - `status` (text, enum: online, away, busy, offline)
      - `status_message` (text)
      - `color` (text, custom chat color)
      - `last_active` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `messages` - Group chat messages
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `content` (text)
      - `reactions` (jsonb, stores emoji reactions)
      - `pinned` (boolean)
      - `edited_at` (timestamptz)
      - `reply_to` (uuid, references messages for threading)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `dm_conversations` - Direct message conversations
      - `id` (uuid, primary key)
      - `participants` (uuid[], array of user ids)
      - `last_message_at` (timestamptz)
      - `created_at` (timestamptz)

    - `dm_messages` - Direct messages
      - `id` (uuid, primary key)
      - `conversation_id` (uuid, references dm_conversations)
      - `sender_id` (uuid, references users)
      - `content` (text)
      - `read_at` (timestamptz)
      - `reactions` (jsonb)
      - `edited_at` (timestamptz)
      - `created_at` (timestamptz)

    - `user_sessions` - Track active user sessions for presence
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `session_token` (text)
      - `last_ping` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can read/update their own profile
    - Users can read all public messages and send new ones
    - Users can only access DM conversations they participate in
    - Message authors can edit/delete their own messages

  3. Functions
    - `update_user_last_active()` - Updates user presence
    - `toggle_message_reaction()` - Handles emoji reactions
    - `get_or_create_dm_conversation()` - Manages DM conversations
    - `mark_dm_messages_read()` - Marks messages as read

  4. Triggers
    - Update `updated_at` timestamps automatically
    - Update conversation `last_message_at` on new DM messages
*/

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table with extended profile information
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public') THEN
    CREATE TABLE users (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      username text UNIQUE NOT NULL,
      display_name text NOT NULL,
      avatar_url text,
      banner_url text,
      status text DEFAULT 'online' CHECK (status IN ('online', 'away', 'busy', 'offline')),
      status_message text DEFAULT '',
      color text DEFAULT '#3B82F6',
      last_active timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

-- Group chat messages
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'messages' AND table_schema = 'public') THEN
    CREATE TABLE messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
      content text NOT NULL,
      reactions jsonb DEFAULT '{}',
      pinned boolean DEFAULT false,
      edited_at timestamptz,
      reply_to uuid REFERENCES messages(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

-- DM conversations
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'dm_conversations' AND table_schema = 'public') THEN
    CREATE TABLE dm_conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      participants uuid[] NOT NULL,
      last_message_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

-- DM messages
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'dm_messages' AND table_schema = 'public') THEN
    CREATE TABLE dm_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid REFERENCES dm_conversations(id) ON DELETE CASCADE NOT NULL,
      sender_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
      content text NOT NULL,
      read_at timestamptz,
      reactions jsonb DEFAULT '{}',
      edited_at timestamptz,
      created_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

-- User sessions for presence tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_sessions' AND table_schema = 'public') THEN
    CREATE TABLE user_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
      session_token text UNIQUE NOT NULL,
      last_ping timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can read all profiles" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users on own profile" ON users;

DROP POLICY IF EXISTS "Anyone can read messages" ON messages;
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON messages;
DROP POLICY IF EXISTS "Users can update own messages" ON messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON messages;
DROP POLICY IF EXISTS "Messages are readable by authenticated users" ON messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON messages;

DROP POLICY IF EXISTS "Users can read own conversations" ON dm_conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON dm_conversations;

DROP POLICY IF EXISTS "Users can read messages from own conversations" ON dm_messages;
DROP POLICY IF EXISTS "Users can insert DM messages" ON dm_messages;
DROP POLICY IF EXISTS "Users can update own DM messages" ON dm_messages;
DROP POLICY IF EXISTS "Users can read messages in their conversations" ON dm_messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON dm_messages;

DROP POLICY IF EXISTS "Users can manage own sessions" ON user_sessions;

-- RLS Policies for users
CREATE POLICY "Users can read all profiles" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- RLS Policies for messages
CREATE POLICY "Anyone can read messages" ON messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert messages" ON messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own messages" ON messages FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own messages" ON messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for DM conversations
CREATE POLICY "Users can read own conversations" ON dm_conversations FOR SELECT TO authenticated 
  USING (auth.uid() = ANY(participants));
CREATE POLICY "Users can create conversations" ON dm_conversations FOR INSERT TO authenticated 
  WITH CHECK (auth.uid() = ANY(participants));

-- RLS Policies for DM messages
CREATE POLICY "Users can read messages from own conversations" ON dm_messages FOR SELECT TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM dm_conversations 
      WHERE id = conversation_id AND auth.uid() = ANY(participants)
    )
  );
CREATE POLICY "Users can insert DM messages" ON dm_messages FOR INSERT TO authenticated 
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM dm_conversations 
      WHERE id = conversation_id AND auth.uid() = ANY(participants)
    )
  );
CREATE POLICY "Users can update own DM messages" ON dm_messages FOR UPDATE TO authenticated 
  USING (auth.uid() = sender_id);

-- RLS Policies for user sessions
CREATE POLICY "Users can manage own sessions" ON user_sessions FOR ALL TO authenticated 
  USING (auth.uid() = user_id);

-- Function to update user last active timestamp
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS void AS $$
BEGIN
  UPDATE users SET 
    last_active = now(),
    updated_at = now()
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to toggle message reactions
CREATE OR REPLACE FUNCTION toggle_message_reaction(
  message_id uuid,
  emoji text,
  is_dm boolean DEFAULT false
)
RETURNS void AS $$
DECLARE
  current_reactions jsonb;
  user_reactions text[];
  new_reactions jsonb;
BEGIN
  -- Get current reactions based on message type
  IF is_dm THEN
    SELECT reactions INTO current_reactions FROM dm_messages WHERE id = message_id;
  ELSE
    SELECT reactions INTO current_reactions FROM messages WHERE id = message_id;
  END IF;
  
  -- Initialize if null
  IF current_reactions IS NULL THEN
    current_reactions := '{}';
  END IF;
  
  -- Get current user's reactions for this emoji
  user_reactions := COALESCE(
    (current_reactions -> emoji ->> 'users')::text[], 
    '{}'
  );
  
  -- Toggle user in reactions
  IF auth.uid()::text = ANY(user_reactions) THEN
    -- Remove user
    user_reactions := array_remove(user_reactions, auth.uid()::text);
  ELSE
    -- Add user
    user_reactions := array_append(user_reactions, auth.uid()::text);
  END IF;
  
  -- Update reactions object
  IF array_length(user_reactions, 1) > 0 THEN
    new_reactions := current_reactions || jsonb_build_object(
      emoji, jsonb_build_object(
        'count', array_length(user_reactions, 1),
        'users', user_reactions
      )
    );
  ELSE
    new_reactions := current_reactions - emoji;
  END IF;
  
  -- Update the message
  IF is_dm THEN
    UPDATE dm_messages SET reactions = new_reactions WHERE id = message_id;
  ELSE
    UPDATE messages SET reactions = new_reactions WHERE id = message_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get or create DM conversation
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
  
  -- Create if doesn't exist
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

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers to avoid conflicts
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
DROP TRIGGER IF EXISTS update_dm_conversation_timestamp ON dm_messages;

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update conversation last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
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
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_id ON dm_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_messages_sender_id ON dm_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_participants ON dm_conversations USING GIN(participants);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active DESC);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION update_user_last_active() TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_message_reaction(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_dm_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_dm_messages_read(uuid) TO authenticated;