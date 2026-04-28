/*
  # Publish ESP bridge firmware 0.2.29

  Paces structured protocol frames and emits startup history one message per
  messagesBatch frame to avoid host serial receive-buffer overruns.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T13:01:00Z'
WHERE target = 'firmware'
  AND channel = 'stable'
  AND hardware_model = 'esp32-s3'
  AND version = '0.2.28-paged-batch';

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
  '0.2.29-paced-sync',
  'supabase',
  'firmware/esp32-s3/0.2.29-paced-sync/shadowchat_bridge.bin',
  'ab3641526a4c1cb00955bd04b6b465f61ad49db89a763605703d3b1bc059e163',
  'dev-unsigned-sha256-only',
  1045552,
  'Pace structured USB CDC protocol frames and emit latest-history startup sync as one-message messagesBatch frames followed by messagesSynced, preventing host receive-buffer overruns while still committing the full 30-row window.',
  'published',
  '2026-04-28T13:01:00Z'
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
