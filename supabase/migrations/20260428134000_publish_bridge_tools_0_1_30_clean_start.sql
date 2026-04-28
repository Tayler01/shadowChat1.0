/*
  # Publish ESP bridge Windows tools 0.1.30

  Ensures every TUI startup begins from a clean realtime state, loads the latest
  snapshot, then starts realtime after the messagesSynced commit boundary.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T13:40:00Z'
WHERE target = 'windows_bundle'
  AND channel = 'stable'
  AND hardware_model = 'any'
  AND version = '0.1.29-snapshot-first';

INSERT INTO public.bridge_update_manifests (
  target,
  channel,
  hardware_model,
  version,
  storage_provider,
  artifact_path,
  artifact_sha256,
  signature,
  size_bytes,
  release_notes,
  status,
  published_at
)
VALUES (
  'windows_bundle',
  'stable',
  'any',
  '0.1.30-clean-start',
  'supabase',
  'windows/0.1.30-clean-start/shadowchat-bridge-tools.zip',
  '494f6ac4f3cd2831ad76bce319968cf774ac8ed6e0b7e598a6f12fc2d3b0f478',
  'dev-unsigned-sha256-only',
  37658,
  'Stop any inherited realtime session before startup sync, commit the latest 30-row snapshot first, then request realtime after messagesSynced so restarts remain deterministic.',
  'published',
  '2026-04-28T13:40:00Z'
)
ON CONFLICT (target, channel, hardware_model, version)
DO UPDATE SET
  storage_provider = EXCLUDED.storage_provider,
  artifact_url = NULL,
  artifact_path = EXCLUDED.artifact_path,
  artifact_sha256 = EXCLUDED.artifact_sha256,
  signature = EXCLUDED.signature,
  size_bytes = EXCLUDED.size_bytes,
  release_notes = EXCLUDED.release_notes,
  status = EXCLUDED.status,
  published_at = EXCLUDED.published_at,
  revoked_at = NULL;
