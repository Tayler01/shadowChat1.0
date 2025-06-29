/*
  # Storage Setup for Avatars and Banners

  Note: Storage buckets and policies in Supabase are typically managed through
  the dashboard or API. This migration creates the necessary database functions
  and triggers to support avatar and banner functionality, but the actual
  storage buckets should be created manually in the Supabase dashboard:

  1. Go to Storage in your Supabase dashboard
  2. Create bucket 'avatars' with public access
  3. Create bucket 'banners' with public access
  4. Set up RLS policies for authenticated users to manage their own files

  For now, this migration ensures the database schema supports the storage functionality.
*/

-- Add storage-related columns to users table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE users ADD COLUMN avatar_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'banner_url'
  ) THEN
    ALTER TABLE users ADD COLUMN banner_url text;
  END IF;
END $$;

-- Create a function to validate storage URLs (optional security measure)
CREATE OR REPLACE FUNCTION validate_storage_url(url text, bucket_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Basic validation that the URL contains the expected bucket name
  -- In a real implementation, you might want more sophisticated validation
  IF url IS NULL THEN
    RETURN true; -- Allow NULL URLs
  END IF;
  
  -- Check if URL contains the bucket name (basic validation)
  RETURN url LIKE '%' || bucket_name || '%';
END;
$$;

-- Grant execute permission on the validation function
GRANT EXECUTE ON FUNCTION validate_storage_url(text, text) TO authenticated;

-- Add check constraints for avatar and banner URLs (optional)
DO $$
BEGIN
  -- Add constraint for avatar URLs if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users' AND constraint_name = 'users_avatar_url_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_avatar_url_check
    CHECK (validate_storage_url(avatar_url, 'avatars'));
  END IF;
END $$;

DO $$
BEGIN
  -- Add constraint for banner URLs if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users' AND constraint_name = 'users_banner_url_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_banner_url_check
    CHECK (validate_storage_url(banner_url, 'banners'));
  END IF;
END $$;

-- Create indexes for better performance on avatar and banner URL lookups
CREATE INDEX IF NOT EXISTS idx_users_avatar_url ON users(avatar_url) WHERE avatar_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_banner_url ON users(banner_url) WHERE banner_url IS NOT NULL;