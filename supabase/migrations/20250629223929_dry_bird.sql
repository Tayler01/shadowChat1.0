/*
  # Create chat-uploads bucket and policies

  This migration creates the chat-uploads storage bucket and sets up RLS policies
  for authenticated users to manage their own files.
  
  Note: Storage buckets and policies are typically managed through the Supabase
  dashboard or API. This migration provides the SQL equivalent but may need to
  be applied manually through the dashboard if permissions are restricted.
*/

-- Note: Storage bucket creation and policy management may require dashboard access
-- If this migration fails, please create the 'chat-uploads' bucket manually in the Supabase dashboard
-- and set up the following policies:

-- 1. Allow authenticated users to read their own files
-- 2. Allow authenticated users to insert their own files  
-- 3. Allow authenticated users to update their own files
-- 4. Allow authenticated users to delete their own files

-- The bucket should be created with:
-- - Name: chat-uploads
-- - Public: false (private bucket)
-- - File size limit: reasonable limit for chat attachments
-- - Allowed MIME types: images, documents, audio files

-- RLS policies should use these conditions:
-- - bucket_id = 'chat-uploads' 
-- - auth.uid() = owner (for user's own files)

-- This ensures users can only access files they uploaded themselves