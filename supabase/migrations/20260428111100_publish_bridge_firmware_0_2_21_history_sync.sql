/*
  # Publish ESP bridge firmware 0.2.21

  Moves large HTTP poll buffers off the shell task stack and emits a structured
  message-sync completion frame after each bridge poll batch.
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
  'firmware',
  'stable',
  'esp32-s3',
  '0.2.21-history-sync',
  'supabase',
  'firmware/esp32-s3/0.2.21-history-sync/shadowchat_bridge.bin',
  '75cf2836275f1cc1eb8319f4b264c434b0348b557c5c6a6c2356f8bafdee6b99',
  'dev-unsigned-sha256-only',
  1044864,
  'Allocate bridge HTTP responses on the heap, expand the poll response buffer for long latest-history windows, and emit messagesSynced after poll/history batches so TUIs can commit exactly the latest 30 rows.',
  'published',
  '2026-04-28T11:11:00Z'
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
