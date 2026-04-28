/*
  # Publish ESP bridge Windows tools 0.1.25

  Commits latest-window poll batches only after the firmware emits an explicit
  sync completion frame, preventing stale cached rows from surviving startup
  refreshes.
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
  '0.1.25-history-sync',
  'supabase',
  'windows/0.1.25-history-sync/shadowchat-bridge-tools.zip',
  '27706d7dec2a55cf8585506ecaffa3c6ef0e5a9b50cc81fa547db051c4409d29',
  'dev-unsigned-sha256-only',
  37051,
  'Use explicit latest-window completion frames to commit startup syncs as one authoritative recent-history snapshot, replacing stale rows while preserving truly newer realtime messages.',
  'published',
  '2026-04-28T11:10:00Z'
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
