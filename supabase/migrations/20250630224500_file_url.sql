/*
  # Add File URL support

  Adds optional `file_url` column to `messages` and `dm_messages` tables for storing image attachments.
*/

-- Add column to messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'file_url'
  ) THEN
    ALTER TABLE messages ADD COLUMN file_url text;
  END IF;
END $$;

-- Add column to dm_messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dm_messages' AND column_name = 'file_url'
  ) THEN
    ALTER TABLE dm_messages ADD COLUMN file_url text;
  END IF;
END $$;
