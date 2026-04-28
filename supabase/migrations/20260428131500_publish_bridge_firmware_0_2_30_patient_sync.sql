/*
  # Publish ESP bridge firmware 0.2.30

  Keeps one-message startup history batches and increases structured protocol
  inter-frame pacing so the Windows receiver can parse each frame before the
  next burst arrives.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T13:15:00Z'
WHERE target = 'firmware'
  AND channel = 'stable'
  AND hardware_model = 'esp32-s3'
  AND version = '0.2.29-paced-sync';

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
  '0.2.30-patient-sync',
  'supabase',
  'firmware/esp32-s3/0.2.30-patient-sync/shadowchat_bridge.bin',
  '77d312391ef03c8b1295a6953fabf5493606f17b8698bf325efaf09e5b282aa2',
  'dev-unsigned-sha256-only',
  1045568,
  'Increase structured USB CDC inter-frame pacing to 40 ms while keeping one-message messagesBatch frames, so Windows can drain and parse the full 30-row startup history before the messagesSynced commit boundary.',
  'published',
  '2026-04-28T13:15:00Z'
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
