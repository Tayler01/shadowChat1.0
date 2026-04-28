/*
  # Publish ESP bridge firmware 0.2.13 thread refresh

  Emits reset markers before full latest-window polls and fetches a larger window.
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
  '0.2.13-thread-refresh',
  'supabase',
  'firmware/esp32-s3/0.2.13-thread-refresh/shadowchat_bridge.bin',
  '7173260cb8cbc24a925546780fc7c3f0cc92ecbf21b3b5ab96fee4b0d05836e3',
  'dev-unsigned-sha256-only',
  1043168,
  'Emit structured reset markers before full latest-window group and DM polls, increase latest poll windows to 30 messages, and keep cursor polls append-only.',
  'published',
  '2026-04-28T00:15:00Z'
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
