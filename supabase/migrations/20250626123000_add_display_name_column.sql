-- Add display_name column to users if not exists
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name text;
