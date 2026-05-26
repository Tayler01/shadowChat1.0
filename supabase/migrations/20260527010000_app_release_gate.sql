CREATE TABLE IF NOT EXISTS public.app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id text NOT NULL UNIQUE CHECK (char_length(build_id) <= 160),
  commit_sha text CHECK (commit_sha IS NULL OR char_length(commit_sha) <= 80),
  deploy_id text CHECK (deploy_id IS NULL OR char_length(deploy_id) <= 160),
  deploy_url text CHECK (deploy_url IS NULL OR char_length(deploy_url) <= 600),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 2000),
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  restart_policy text NOT NULL DEFAULT 'optional_restart'
    CHECK (restart_policy IN ('notice_only', 'optional_restart', 'required_restart', 'critical_force_restart')),
  severity text NOT NULL DEFAULT 'feature'
    CHECK (severity IN ('info', 'feature', 'maintenance', 'critical')),
  active boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_releases_active_published
  ON public.app_releases(active, published_at DESC);

CREATE TABLE IF NOT EXISTS public.app_release_receipts (
  release_id uuid NOT NULL REFERENCES public.app_releases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  seen_at timestamptz,
  dismissed_at timestamptz,
  acknowledged_at timestamptz,
  restarted_at timestamptz,
  current_build_id text CHECK (current_build_id IS NULL OR char_length(current_build_id) <= 160),
  client_user_agent text CHECK (client_user_agent IS NULL OR char_length(client_user_agent) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_app_release_receipts_user_updated
  ON public.app_release_receipts(user_id, updated_at DESC);

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_release_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read active app releases" ON public.app_releases;
CREATE POLICY "Authenticated users can read active app releases"
ON public.app_releases
FOR SELECT
TO authenticated
USING (active = true AND published_at <= now());

DROP POLICY IF EXISTS "App admins can manage app releases" ON public.app_releases;
CREATE POLICY "App admins can manage app releases"
ON public.app_releases
FOR ALL
TO authenticated
USING (public.is_app_admin(auth.uid()))
WITH CHECK (public.is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can read own app release receipts" ON public.app_release_receipts;
CREATE POLICY "Users can read own app release receipts"
ON public.app_release_receipts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own app release receipts" ON public.app_release_receipts;
CREATE POLICY "Users can insert own app release receipts"
ON public.app_release_receipts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own app release receipts" ON public.app_release_receipts;
CREATE POLICY "Users can update own app release receipts"
ON public.app_release_receipts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_app_releases_updated_at ON public.app_releases;
CREATE TRIGGER update_app_releases_updated_at
  BEFORE UPDATE ON public.app_releases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_release_receipts_updated_at ON public.app_release_receipts;
CREATE TRIGGER update_app_release_receipts_updated_at
  BEFORE UPDATE ON public.app_release_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_visible_app_releases()
RETURNS TABLE (
  id uuid,
  build_id text,
  commit_sha text,
  deploy_id text,
  deploy_url text,
  title text,
  summary text,
  sections jsonb,
  restart_policy text,
  severity text,
  published_at timestamptz,
  delivered_at timestamptz,
  seen_at timestamptz,
  dismissed_at timestamptz,
  acknowledged_at timestamptz,
  restarted_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    releases.id,
    releases.build_id,
    releases.commit_sha,
    releases.deploy_id,
    releases.deploy_url,
    releases.title,
    releases.summary,
    releases.sections,
    releases.restart_policy,
    releases.severity,
    releases.published_at,
    receipts.delivered_at,
    receipts.seen_at,
    receipts.dismissed_at,
    receipts.acknowledged_at,
    receipts.restarted_at
  FROM public.app_releases releases
  LEFT JOIN public.app_release_receipts receipts
    ON receipts.release_id = releases.id
   AND receipts.user_id = auth.uid()
  WHERE releases.active = true
    AND releases.published_at <= now()
  ORDER BY releases.published_at DESC
  LIMIT 5;
$$;

CREATE OR REPLACE FUNCTION public.record_app_release_receipt(
  target_release_id uuid,
  receipt_event text,
  current_build_id text DEFAULT NULL,
  client_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  event_at timestamptz := now();
  normalized_event text := lower(coalesce(receipt_event, ''));
  normalized_build_id text := NULLIF(left(coalesce(current_build_id, ''), 160), '');
  normalized_user_agent text := NULLIF(left(coalesce(client_user_agent, ''), 1000), '');
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF normalized_event NOT IN ('delivered', 'seen', 'dismissed', 'acknowledged', 'restarted') THEN
    RAISE EXCEPTION 'Invalid release receipt event';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.app_releases releases
    WHERE releases.id = target_release_id
      AND releases.active = true
      AND releases.published_at <= event_at
  ) THEN
    RAISE EXCEPTION 'Release is not visible';
  END IF;

  INSERT INTO public.app_release_receipts (
    release_id,
    user_id,
    delivered_at,
    seen_at,
    dismissed_at,
    acknowledged_at,
    restarted_at,
    current_build_id,
    client_user_agent
  )
  VALUES (
    target_release_id,
    current_user_id,
    event_at,
    CASE WHEN normalized_event IN ('seen', 'dismissed', 'acknowledged', 'restarted') THEN event_at END,
    CASE WHEN normalized_event = 'dismissed' THEN event_at END,
    CASE WHEN normalized_event IN ('acknowledged', 'restarted') THEN event_at END,
    CASE WHEN normalized_event = 'restarted' THEN event_at END,
    normalized_build_id,
    normalized_user_agent
  )
  ON CONFLICT (release_id, user_id) DO UPDATE
  SET
    delivered_at = COALESCE(public.app_release_receipts.delivered_at, event_at),
    seen_at = CASE
      WHEN normalized_event IN ('seen', 'dismissed', 'acknowledged', 'restarted')
        THEN COALESCE(public.app_release_receipts.seen_at, event_at)
      ELSE public.app_release_receipts.seen_at
    END,
    dismissed_at = CASE
      WHEN normalized_event = 'dismissed' THEN event_at
      ELSE public.app_release_receipts.dismissed_at
    END,
    acknowledged_at = CASE
      WHEN normalized_event IN ('acknowledged', 'restarted') THEN event_at
      ELSE public.app_release_receipts.acknowledged_at
    END,
    restarted_at = CASE
      WHEN normalized_event = 'restarted' THEN event_at
      ELSE public.app_release_receipts.restarted_at
    END,
    current_build_id = COALESCE(normalized_build_id, public.app_release_receipts.current_build_id),
    client_user_agent = COALESCE(normalized_user_agent, public.app_release_receipts.client_user_agent),
    updated_at = event_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_app_releases() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_app_release_receipt(uuid, text, text, text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'app_releases'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.app_releases;
    END IF;
  END IF;
END $$;
