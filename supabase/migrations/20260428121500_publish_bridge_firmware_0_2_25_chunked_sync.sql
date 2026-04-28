/*
  # Publish ESP bridge firmware 0.2.25

  Keeps batch latest-history sync and writes long protocol frames to USB CDC in
  small flushed chunks so large JSON frames cannot stall before the newline.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T12:15:00Z'
WHERE target = 'firmware'
  AND channel = 'stable'
  AND hardware_model = 'esp32-s3'
  AND version = '0.2.24-batch-sync';

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
  '0.2.25-chunked-sync',
  'supabase',
  'firmware/esp32-s3/0.2.25-chunked-sync/shadowchat_bridge.bin',
  '4569898df5bc378d055dbdef90d59b78bcf51e174f06a29c8a552b68df0c9842',
  'dev-unsigned-sha256-only',
  1045632,
  'Write long structured protocol lines in small flushed USB CDC chunks while preserving one JSON frame, allowing 30-row messagesBatch startup syncs to reach the TUI reliably.',
  'published',
  '2026-04-28T12:15:00Z'
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
