/*
  # Publish ESP bridge firmware 0.2.27

  Retries short USB CDC writes until every protocol byte is accepted so large
  latest-history JSON frames cannot lose chunks under backpressure.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T12:36:00Z'
WHERE target = 'firmware'
  AND channel = 'stable'
  AND hardware_model = 'esp32-s3'
  AND version = '0.2.26-yield-sync';

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
  '0.2.27-writeall-sync',
  'supabase',
  'firmware/esp32-s3/0.2.27-writeall-sync/shadowchat_bridge.bin',
  '9d691f6cb7463cdf5db791704d015cfaf4f27c98557a4e1b524831377871f354',
  'dev-unsigned-sha256-only',
  1045568,
  'Retry short USB CDC writes until every byte of each structured protocol frame is accepted, preserving large latest-history messagesBatch JSON under serial backpressure.',
  'published',
  '2026-04-28T12:36:00Z'
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
