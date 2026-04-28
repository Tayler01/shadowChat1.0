/*
  # Publish ESP bridge Windows tools 0.1.26

  Adds compact poll/history batch-frame handling so startup history can settle
  from one authoritative bridge sync frame instead of many serial writes.
*/

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
  '0.1.26-batch-sync',
  'supabase',
  'windows/0.1.26-batch-sync/shadowchat-bridge-tools.zip',
  '456326ad0b76ef010c764b1b9c53ff8914460f9ce858eb907f848efed69e3de1',
  'dev-unsigned-sha256-only',
  37270,
  'Handle bridge messagesBatch frames for startup latest-window and lazy-history loads, reducing serial frame churn while preserving deterministic latest-snapshot commits.',
  'published',
  '2026-04-28T12:05:00Z'
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
