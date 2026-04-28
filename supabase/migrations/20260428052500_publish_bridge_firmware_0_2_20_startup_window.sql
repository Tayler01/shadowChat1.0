/*
  # Publish ESP bridge firmware 0.2.20

  Enlarges the ESP HTTP response buffer so 30-row latest-window poll responses
  are not truncated before the TUI receives structured message frames.
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
  '0.2.20-startup-window',
  'supabase',
  'firmware/esp32-s3/0.2.20-startup-window/shadowchat_bridge.bin',
  '9b6253b53f0084f39acbbf07fd3cff32255de76b69aef46fa7e0a2ec9cac13d8',
  'dev-unsigned-sha256-only',
  1044976,
  'Increase the ESP HTTP response buffer for 30-row latest group/DM startup windows and keep deterministic backend ordering by created_at plus id, preventing truncated poll responses from degrading into sparse realtime-only startup feeds.',
  'published',
  '2026-04-28T05:25:00Z'
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
