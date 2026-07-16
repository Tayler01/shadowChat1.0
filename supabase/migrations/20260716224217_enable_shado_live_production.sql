/*
  # Release Shado Live to signed-in members

  The production frontend now exposes Shado Live to every signed-in member.
  Move the server authority from the isolated beta allowlist to the existing
  global enabled mode without weakening Connections-only discovery, personal
  blocking, per-user restrictions, RLS, or the emergency disable contract.
*/

BEGIN;

UPDATE public.shado_live_system_state
SET enabled = true,
    access_mode = 'enabled',
    reason = 'Shado Live is released to signed-in members.',
    revision = revision + 1,
    updated_at = now()
WHERE singleton
  AND access_mode = 'allowlist';

COMMIT;
