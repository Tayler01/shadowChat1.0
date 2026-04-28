/*
  # Publish ESP bridge firmware 0.2.28

  Emits the latest 30-row history window as several small messagesBatch frames
  before the messagesSynced commit boundary. This keeps startup sync complete
  while avoiding oversized single-line USB CDC JSON frames.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T12:50:00Z'
WHERE target = 'firmware'
  AND channel = 'stable'
  AND hardware_model = 'esp32-s3'
  AND version = '0.2.27-writeall-sync';

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
  '0.2.28-paged-batch',
  'supabase',
  'firmware/esp32-s3/0.2.28-paged-batch/shadowchat_bridge.bin',
  'af4406b5d4548e71987dade5d4c128d703ff6946ab5675619c62abdcc9e3652a',
  'dev-unsigned-sha256-only',
  1045616,
  'Emit latest-history startup sync as paged messagesBatch frames capped at five messages each, followed by a messagesSynced commit boundary, so the TUI receives the full 30-row window without oversized serial JSON frames.',
  'published',
  '2026-04-28T12:50:00Z'
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
