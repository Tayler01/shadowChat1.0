/*
  # Create chat-uploads bucket

  Adds a `chat-uploads` storage bucket for message attachments and configures
  RLS policies so authenticated users can read and manage their own files.
*/

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
  VALUES ('chat-uploads', 'chat-uploads', false)
  ON CONFLICT (id) DO NOTHING;

-- Ensure RLS is enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can read own chat uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can insert chat uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own chat uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own chat uploads" ON storage.objects;

-- Allow users to read objects they own
CREATE POLICY "Users can read own chat uploads"
  ON storage.objects FOR SELECT USING (
    bucket_id = 'chat-uploads' AND auth.uid() = owner
  );

-- Allow users to upload new objects
CREATE POLICY "Users can insert chat uploads"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'chat-uploads' AND auth.uid() = owner
  );

-- Allow users to update their objects
CREATE POLICY "Users can update own chat uploads"
  ON storage.objects FOR UPDATE USING (
    bucket_id = 'chat-uploads' AND auth.uid() = owner
  );

-- Allow users to delete their objects
CREATE POLICY "Users can delete own chat uploads"
  ON storage.objects FOR DELETE USING (
    bucket_id = 'chat-uploads' AND auth.uid() = owner
  );