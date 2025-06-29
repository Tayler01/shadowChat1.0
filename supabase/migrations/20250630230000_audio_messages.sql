-- Add audio columns to messages tables and storage bucket

-- Create storage bucket for message media
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-media', 'message-media', true)
ON CONFLICT (id) DO NOTHING;

-- Ensure RLS enabled for storage objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Remove existing policies if present
DROP POLICY IF EXISTS "Message media read" ON storage.objects;
DROP POLICY IF EXISTS "Message media write" ON storage.objects;

-- Public read access to voice message files
CREATE POLICY "Message media read" ON storage.objects
  FOR SELECT USING (bucket_id = 'message-media');

-- Authenticated users can manage their own uploaded files
CREATE POLICY "Message media write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'message-media' AND auth.uid() = owner)
  WITH CHECK (bucket_id = 'message-media' AND auth.uid() = owner);

-- Messages table audio columns
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS audio_duration numeric;

-- DM messages table audio columns
ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS audio_duration numeric;
