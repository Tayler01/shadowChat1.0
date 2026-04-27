/*
  # Publish ESP bridge firmware 0.2.11 protocol flush

  Flushes structured serial protocol events immediately after emission.
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
  '0.2.11-protocol-flush',
  'supabase',
  'firmware/esp32-s3/0.2.11-protocol-flush/shadowchat_bridge.bin',
  '6679b9291408b85972506c90eb3f3277ea43634c203bd44119d8ac3ba750f004',
  'dev-unsigned-sha256-only',
  1043200,
  'Flush structured serial protocol events immediately to reduce delayed or interleaved protocol frames observed by the Windows TUI.',
  'published',
  '2026-04-27T23:34:00Z'
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
