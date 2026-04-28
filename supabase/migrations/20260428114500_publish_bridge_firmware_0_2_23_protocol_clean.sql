/*
  # Publish ESP bridge firmware 0.2.23

  Keeps the latest-history heap sync work and prevents ESP/TinyUSB diagnostic
  logs from interleaving with serial protocol frames during startup history.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T11:45:00Z'
WHERE target = 'firmware'
  AND channel = 'stable'
  AND hardware_model = 'esp32-s3'
  AND version = '0.2.22-heap-sync';

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
  '0.2.23-protocol-clean',
  'supabase',
  'firmware/esp32-s3/0.2.23-protocol-clean/shadowchat_bridge.bin',
  '4bfc61ede5f2dc8ff12aea4edcfaa0c0d4204f738685e7a559465276bb9fa805',
  'dev-unsigned-sha256-only',
  1044992,
  'Serialize ESP log output behind the bridge protocol mutex and suppress noisy TinyUSB MSC warnings so latest-history protocol frames cannot be split or corrupted while syncing the startup chat window.',
  'published',
  '2026-04-28T11:45:00Z'
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
