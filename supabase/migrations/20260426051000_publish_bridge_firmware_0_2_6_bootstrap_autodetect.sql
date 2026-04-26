/*
  # Publish ESP bridge firmware 0.2.6

  Updates the serial-only fallback bootstrap script so it auto-detects the
  bridge COM port instead of defaulting to a fixed Windows port number.
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
  '0.2.6-bootstrap-autodetect',
  'supabase',
  'firmware/esp32-s3/0.2.6-bootstrap-autodetect/shadowchat_bridge.bin',
  '17778abeb42eb3f6e8f2c2406036399fb26fa513368d0fd4d1c1a03cb029f0ec',
  'dev-unsigned-sha256-only',
  1040160,
  'Make the serial-only fallback bootstrap receiver auto-detect the bridge COM port.',
  'published',
  '2026-04-26T05:10:00Z'
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
