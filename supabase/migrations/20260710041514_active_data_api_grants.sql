/*
  # Explicit active-domain Data API grants

  Supabase no longer auto-grants CRUD privileges for newly restored tables.
  RLS policies still decide which rows a member may touch, but PostgreSQL table
  privileges must exist before RLS can run. This migration derives only the
  operations already represented by authenticated/public RLS policies, keeps
  the column-scoped users write boundary intact, and excludes paused domains.
*/

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- These privileges are not needed by the Data API and TRUNCATE bypasses RLS.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    WITH policy_operations AS (
      SELECT
        policies.tablename,
        unnest(
          CASE policies.cmd
            WHEN 'ALL' THEN ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]
            ELSE ARRAY[policies.cmd]::text[]
          END
        ) AS privilege
      FROM pg_policies policies
      WHERE policies.schemaname = 'public'
        AND (
          'authenticated'::name = ANY(policies.roles)
          OR 'public'::name = ANY(policies.roles)
        )
        -- Profile writes stay column-scoped in 20260709215314.
        AND policies.tablename <> 'users'
        -- Paused domains remain preserved but unavailable to browser roles.
        AND policies.tablename !~ '^(board_|news_|art_board_|bridge_)'
    )
    SELECT DISTINCT tablename, privilege
    FROM policy_operations
    WHERE privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ORDER BY tablename, privilege
  LOOP
    EXECUTE format(
      'GRANT %s ON TABLE public.%I TO authenticated',
      target.privilege,
      target.tablename
    );
  END LOOP;
END
$$;

-- The backend/QA role is trusted and still needs SQL privileges in addition
-- to its RLS-bypass claim. Paused Edge endpoints retain their deny-first gate.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;

-- Preserve the intentionally narrow profile write contract after the global
-- privilege cleanup above. Release B will remove private identity columns.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.users FROM authenticated;
GRANT SELECT ON TABLE public.users TO authenticated;
GRANT UPDATE (
  display_name,
  status_message,
  color,
  status,
  presence_visibility,
  avatar_url,
  avatar_thumbnail_url,
  avatar_thumbnail_path,
  banner_url,
  banner_thumbnail_url,
  banner_thumbnail_path
) ON TABLE public.users TO authenticated;
