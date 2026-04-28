/*
  # Publish ESP bridge firmware 0.2.18

  Requests a 30-row latest-window poll for startup and manual refresh while
  keeping incremental repair and history pages at ten rows.
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
  '0.2.18-startup-window',
  'supabase',
  'firmware/esp32-s3/0.2.18-startup-window/shadowchat_bridge.bin',
  'c6c89b846af41409a7db847a3266d9914c26b7b46ca9091205381ad7d08ab75e',
  'dev-unsigned-sha256-only',
  1044672,
  'Load up to 30 latest group or DM rows during chat startup and manual refresh so the TUI opens with a useful recent transcript, while preserving ten-row incremental repair and history pages for responsive serial behavior.',
  'published',
  '2026-04-28T04:45:00Z'
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
