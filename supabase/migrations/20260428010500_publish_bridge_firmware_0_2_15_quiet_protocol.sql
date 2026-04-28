/*
  # Publish ESP bridge firmware 0.2.15

  Suppresses low-level transport/certificate logs that can split structured serial frames.
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
  '0.2.15-quiet-protocol',
  'supabase',
  'firmware/esp32-s3/0.2.15-quiet-protocol/shadowchat_bridge.bin',
  'b0fc6c48290e21391dcc14b48b1b7a81f81b80612d2b1b280b2418f73947472c',
  'dev-unsigned-sha256-only',
  1043312,
  'Suppress low-level TLS, certificate bundle, and websocket transport logs that could print in the middle of structured @scb serial frames during polling or realtime receive.',
  'published',
  '2026-04-28T01:05:00Z'
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
