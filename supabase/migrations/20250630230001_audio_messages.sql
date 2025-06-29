/*
  # Audio Message Support

  1. Schema Changes
    - Add `audio_url` and `audio_duration` columns to `messages` and `dm_messages` tables.
    - Constrain `audio_url` to the new storage bucket using `validate_storage_url`.

  2. Storage
    - Create bucket `message-media` for voice recordings (public read, authenticated write).
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

-- Constraint to validate audio_url
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'messages' AND constraint_name = 'messages_audio_url_check'
  ) THEN
    ALTER TABLE messages ADD CONSTRAINT messages_audio_url_check
      CHECK (validate_storage_url(audio_url, 'message-media'));
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'dm_messages' AND constraint_name = 'dm_messages_audio_url_check'
  ) THEN
    ALTER TABLE dm_messages ADD CONSTRAINT dm_messages_audio_url_check
      CHECK (validate_storage_url(audio_url, 'message-media'));
  END IF;
END $$;

-- Storage bucket for voice messages
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-media', 'message-media', true)
ON CONFLICT (id) DO NOTHING;

-- Basic RLS policies
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Message media read" ON storage.objects;
DROP POLICY IF EXISTS "Message media write" ON storage.objects;

CREATE POLICY "Message media read" ON storage.objects
  FOR SELECT USING (bucket_id = 'message-media');

CREATE POLICY "Message media write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'message-media' AND auth.uid() = owner)
  WITH CHECK (bucket_id = 'message-media' AND auth.uid() = owner);
