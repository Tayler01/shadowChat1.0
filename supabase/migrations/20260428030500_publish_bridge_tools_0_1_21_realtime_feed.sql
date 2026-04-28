/*
  # Publish ESP bridge Windows tools 0.1.21

  Makes the TUI behave like a terminal feed: realtime is trusted only after
  channel join, repair polling is quiet and debounced, history can page upward,
  and recoverable structured serial frames are split instead of dropped.
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
  '0.1.21-realtime-feed',
  'supabase',
  'windows/0.1.21-realtime-feed/shadowchat-bridge-tools.zip',
  'cfbff6791e4eb32c110553bc5e55309493a32f46911256ebeae050e08ee92c36',
  'dev-unsigned-sha256-only',
  34032,
  'Render new chat rows through a terminal-feed append path, lazy-load older group and DM history with /history, treat realtime as live only after channel join, debounce fallback repair polling, and split recoverable structured serial frames when the bridge emits multiple @scb messages on one line.',
  'published',
  '2026-04-28T03:05:00Z'
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
