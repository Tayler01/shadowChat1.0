-- Simple search function for user profiles
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
  SELECT id, username, display_name, avatar_url, color, status
  FROM users
  WHERE username ILIKE '%' || term || '%'
     OR display_name ILIKE '%' || term || '%';
END;
$$;

GRANT EXECUTE ON FUNCTION search_users(text) TO authenticated;
