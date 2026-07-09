-- The client now synthesizes notification tones with the Web Audio API.
-- Preserve the legacy rows for historical reference, but keep the table out of
-- the browser-facing Data API authorization surface.

ALTER TABLE public.notification_sounds ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_sounds'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.notification_sounds',
      existing_policy.policyname
    );
  END LOOP;
END
$$;

REVOKE ALL PRIVILEGES ON TABLE public.notification_sounds
FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.notification_sounds IS
  'Archived legacy notification sound URLs. Runtime tones are bundled in client code; no browser role access.';
