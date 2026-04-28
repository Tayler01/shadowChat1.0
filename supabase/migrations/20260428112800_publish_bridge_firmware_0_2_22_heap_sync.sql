/*
  # Publish ESP bridge firmware 0.2.22

  Keeps the heap-backed response fix but uses a reliable 32 KiB allocation on
  the ESP32-S3 without PSRAM. Revokes 0.2.21 because live smoke testing showed
  the 64 KiB heap allocation can fail while realtime is running.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T11:28:00Z'
WHERE target = 'firmware'
  AND channel = 'stable'
  AND hardware_model = 'esp32-s3'
  AND version = '0.2.21-history-sync';

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
  '0.2.22-heap-sync',
  'supabase',
  'firmware/esp32-s3/0.2.22-heap-sync/shadowchat_bridge.bin',
  '193815704b582b8a745eecda3a1539f6e3259194ed117e5944c998b7a503e6df',
  'dev-unsigned-sha256-only',
  1044864,
  'Keep bridge HTTP responses heap-backed to avoid shell stack exhaustion, use a reliable 32 KiB ESP allocation, and pair with compact poll payloads plus messagesSynced completion frames for deterministic latest-30 startup history.',
  'published',
  '2026-04-28T11:28:00Z'
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
