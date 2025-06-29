/*
  # Fix ambiguous column reference in search_users function

  1. Changes
    - Update search_users function to explicitly qualify column references
    - Fix ambiguous "id" column reference by using table alias
    - Ensure all column references are properly qualified

  2. Security
    - Maintains existing RLS policies
    - No changes to permissions or access control
*/

-- Drop the existing function first
DROP FUNCTION IF EXISTS search_users(text);

-- Recreate the function with properly qualified column references
CREATE OR REPLACE FUNCTION search_users(term text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  color text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.username,
    u.display_name,
    u.avatar_url,
    u.color,
    u.status
  FROM users u
  WHERE 
    u.username ILIKE '%' || term || '%' 
    OR u.display_name ILIKE '%' || term || '%'
  ORDER BY 
    CASE 
      WHEN u.username ILIKE term || '%' THEN 1
      WHEN u.display_name ILIKE term || '%' THEN 2
      ELSE 3
    END,
    u.username;
END;
$$;