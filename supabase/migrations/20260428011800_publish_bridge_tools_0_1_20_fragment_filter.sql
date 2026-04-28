/*
  # Publish ESP bridge Windows tools 0.1.20

  Filters orphaned structured JSON tail fragments after reconnect or attach-mid-frame.
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
  'windows_bundle',
  'stable',
  'any',
  '0.1.20-fragment-filter',
  'supabase',
  'windows/0.1.20-fragment-filter/shadowchat-bridge-tools.zip',
  '3dae115f9f3a94f668f1b4b8157a3287803287fe8a7d8796a3c97ef9fab69a3c',
  'dev-unsigned-sha256-only',
  31855,
  'Suppress orphaned structured JSON fragments that can appear when the TUI attaches mid-frame, so the live feed stays clean while fallback polling restores the visible thread.',
  'published',
  '2026-04-28T01:18:00Z'
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
