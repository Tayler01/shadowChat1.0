/*
  # Publish ESP bridge firmware 0.2.26

  Uses smaller protocol write chunks with a brief scheduler yield between
  chunks so TinyUSB CDC can drain long latest-history frames.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T12:25:00Z'
WHERE target = 'firmware'
  AND channel = 'stable'
  AND hardware_model = 'esp32-s3'
  AND version = '0.2.25-chunked-sync';

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
  '0.2.26-yield-sync',
  'supabase',
  'firmware/esp32-s3/0.2.26-yield-sync/shadowchat_bridge.bin',
  'be8f9fc72e603cee0a5b63b46c869bcf18bc67fdaf80856f205082155e3f5cff',
  'dev-unsigned-sha256-only',
  1045632,
  'Stream long structured latest-history frames as 64-byte flushed chunks with a short scheduler yield between chunks so USB CDC output drains reliably while preserving the single JSON frame for the TUI.',
  'published',
  '2026-04-28T12:25:00Z'
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
