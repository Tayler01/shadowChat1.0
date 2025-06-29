/*
  # Add Audio Message Support

  1. Extend `messages` and `dm_messages` tables with `audio_url` and optional `audio_duration` columns.
  2. Note: create a Storage bucket `message-media` manually in the Supabase dashboard for audio uploads.
*/

-- Add columns to messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'audio_url'
  ) THEN
    ALTER TABLE messages ADD COLUMN audio_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'audio_duration'
  ) THEN
    ALTER TABLE messages ADD COLUMN audio_duration integer;
  END IF;
END $$;

-- Add columns to dm_messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dm_messages' AND column_name = 'audio_url'
  ) THEN
    ALTER TABLE dm_messages ADD COLUMN audio_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dm_messages' AND column_name = 'audio_duration'
  ) THEN
    ALTER TABLE dm_messages ADD COLUMN audio_duration integer;
  END IF;
END $$;
