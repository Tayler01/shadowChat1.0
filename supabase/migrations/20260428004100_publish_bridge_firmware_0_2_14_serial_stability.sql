/*
  # Publish ESP bridge firmware 0.2.14

  Serializes structured protocol output and limits poll bursts for dependable TUI backfill.
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
  '0.2.14-serial-stability',
  'supabase',
  'firmware/esp32-s3/0.2.14-serial-stability/shadowchat_bridge.bin',
  'b998b481de9a4ba319edd4f75c186a096ce11937ecba0fcd6b65bc5840b97c19',
  'dev-unsigned-sha256-only',
  1043216,
  'Serialize structured @scb protocol frames across firmware tasks and keep group latest polls to compact ten-message refresh windows to avoid torn or oversized serial bursts.',
  'published',
  '2026-04-28T00:41:00Z'
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
