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
  SELECT u.id, u.username, u.display_name, u.avatar_url, u.color, u.status
  FROM users u
  WHERE u.username ILIKE '%' || term || '%'
     OR u.display_name ILIKE '%' || term || '%';
END;
$$;

GRANT EXECUTE ON FUNCTION search_users(text) TO authenticated;
