/*
  # Publish ESP bridge firmware 0.2.12 latest poll

  Makes chat-mode polls refresh the latest message window.
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
  '0.2.12-latest-poll',
  'supabase',
  'firmware/esp32-s3/0.2.12-latest-poll/shadowchat_bridge.bin',
  '73e0a42ac8906c5a7396e12ac869c2c32b380ce248bb7f0ab0df736220d677ae',
  'dev-unsigned-sha256-only',
  1042992,
  'Make chat-mode /poll refresh the latest group or DM window instead of cursor-only new-message polling, improving recovery after skipped realtime or protocol frames.',
  'published',
  '2026-04-27T23:55:00Z'
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
