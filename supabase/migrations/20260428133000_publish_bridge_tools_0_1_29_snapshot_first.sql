/*
  # Publish ESP bridge Windows tools 0.1.29

  Loads the authoritative latest snapshot before requesting realtime, reducing
  ESP heap pressure during startup history sync.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T13:30:00Z'
WHERE target = 'windows_bundle'
  AND channel = 'stable'
  AND hardware_model = 'any'
  AND version = '0.1.28-read-buffer';

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
  '0.1.29-snapshot-first',
  'supabase',
  'windows/0.1.29-snapshot-first/shadowchat-bridge-tools.zip',
  '94b93d4a4cea3dafbd60c0eebd1f47fb38a3adfeb1c7c46b185857cdfd156d98',
  'dev-unsigned-sha256-only',
  37641,
  'Load and commit the latest 30-row snapshot before starting realtime, then request the WebSocket live tail after messagesSynced; smoke tests now fail on HTTP response allocation errors.',
  'published',
  '2026-04-28T13:30:00Z'
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
