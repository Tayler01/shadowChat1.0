/*
  # ESP bridge update manifests

  This table is the allowlisted release catalog for ESP firmware, offline
  Windows bridge bundles, and first-plug bootstrap assets.

  Artifacts may live in Supabase Storage or GitHub Releases, but devices and
  offline PCs must resolve them through this manifest table rather than through
  arbitrary user-supplied URLs.
*/

CREATE TABLE IF NOT EXISTS public.bridge_update_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target text NOT NULL,
  channel text NOT NULL DEFAULT 'stable',
  hardware_model text NOT NULL DEFAULT 'any',
  version text NOT NULL,
  min_current_version text NULL,
  storage_provider text NOT NULL DEFAULT 'supabase',
  artifact_url text NULL,
  artifact_path text NULL,
  artifact_sha256 text NOT NULL,
  signature text NULL,
  size_bytes bigint NULL,
  release_notes text NULL,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bridge_update_manifests_target_check
    CHECK (target IN ('firmware', 'windows_bundle', 'bootstrap')),
  CONSTRAINT bridge_update_manifests_channel_check
    CHECK (channel IN ('stable', 'beta', 'dev')),
  CONSTRAINT bridge_update_manifests_storage_provider_check
    CHECK (storage_provider IN ('supabase', 'github')),
  CONSTRAINT bridge_update_manifests_status_check
    CHECK (status IN ('draft', 'published', 'revoked')),
  CONSTRAINT bridge_update_manifests_artifact_source_check
    CHECK (artifact_url IS NOT NULL OR artifact_path IS NOT NULL),
  CONSTRAINT bridge_update_manifests_size_bytes_check
    CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_bridge_update_manifests_lookup
  ON public.bridge_update_manifests(target, channel, hardware_model, status, published_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bridge_update_manifests_unique_version
  ON public.bridge_update_manifests(target, channel, hardware_model, version);

ALTER TABLE public.bridge_update_manifests ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_bridge_update_manifests_updated_at ON public.bridge_update_manifests;
CREATE TRIGGER update_bridge_update_manifests_updated_at
  BEFORE UPDATE ON public.bridge_update_manifests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

