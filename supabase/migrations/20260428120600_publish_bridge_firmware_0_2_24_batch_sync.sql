/*
  # Publish ESP bridge firmware 0.2.24

  Keeps protocol-clean logging and changes poll/history sync to emit one
  compact messagesBatch frame followed by messagesSynced.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T12:06:00Z'
WHERE target = 'firmware'
  AND channel = 'stable'
  AND hardware_model = 'esp32-s3'
  AND version = '0.2.23-protocol-clean';

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
  '0.2.24-batch-sync',
  'supabase',
  'firmware/esp32-s3/0.2.24-batch-sync/shadowchat_bridge.bin',
  'ce319676263d3bbb945d80b983dc4fbccb860e8a746ed3b5e8028f24737b1c04',
  'dev-unsigned-sha256-only',
  1045280,
  'Emit compact messagesBatch frames for latest-window and history polls, then messagesSynced, so the TUI receives a complete recent-history snapshot without dozens of separate serial writes.',
  'published',
  '2026-04-28T12:06:00Z'
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
