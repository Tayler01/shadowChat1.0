/*
  # Publish ESP bridge Windows tools 0.1.19

  Filters low-level link driver startup logs from the chat-first TUI.
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
  '0.1.19-link-log-filter',
  'supabase',
  'windows/0.1.19-link-log-filter/shadowchat-bridge-tools.zip',
  '2c3f2c3a87a1c41b06e15b43b4ce727b5763b06b95131d72b6cc43f484ba318b',
  'dev-unsigned-sha256-only',
  31814,
  'Suppress low-level startup link-driver logs in the TUI live feed so the chat interface keeps product data-link wording even when the device reconnects while the TUI is open.',
  'published',
  '2026-04-28T01:12:00Z'
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
