/*
  # Publish ESP bridge firmware 0.2.17

  Emits the full structured message frame immediately after successful group/DM
  sends so the TUI can render the user's own sent line without waiting for a
  follow-up poll or realtime echo.
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
  '0.2.17-sent-echo',
  'supabase',
  'firmware/esp32-s3/0.2.17-sent-echo/shadowchat_bridge.bin',
  '8f4710a5326404f55bf348f6a1fb97334e26bb6e1f2044688e9a5aa0a89a3c97',
  'dev-unsigned-sha256-only',
  1044656,
  'Emit full structured sent-message frames from successful bridge group and DM sends so the TUI can render local sends immediately and let later poll/realtime frames dedupe cleanly.',
  'published',
  '2026-04-28T03:30:00Z'
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
