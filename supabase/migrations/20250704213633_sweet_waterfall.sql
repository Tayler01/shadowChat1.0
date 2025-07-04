/*
  # Enable Realtime for Messages Table

  1. Publication Configuration
    - Add `messages` table to the `supabase_realtime` publication
    - Ensure real-time changes are properly broadcasted for INSERT, UPDATE, and DELETE operations

  2. Security
    - Maintains existing RLS policies on the messages table
    - No changes to authentication or authorization

  This migration resolves the "mismatch between server and client bindings for postgres changes" error
  by ensuring the messages table is properly configured for Supabase Realtime.
*/

-- Add the messages table to the supabase_realtime publication
-- This enables real-time broadcasting of changes to the messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Verify the table is added (this is informational and won't cause errors if already exists)
-- The publication should now include the messages table for real-time updates