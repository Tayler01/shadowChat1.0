/*
  # Publish ESP bridge Windows tools 0.1.15

  Adds visible TUI versioning and quiets low-level realtime noise.
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
  '0.1.15-latest-feed-version',
  'supabase',
  'windows/0.1.15-latest-feed-version/shadowchat-bridge-tools.zip',
  '36343f4474d8d56aca184230e18545a4762cb6ecb37a01e4433c46c1b86f3cba',
  'dev-unsigned-sha256-only',
  31541,
  'Show the running TUI tools version and date in the header/sidebar, suppress low-level realtime transport fragments from the live feed, and keep fallback polling active after skipped protocol fragments.',
  'published',
  '2026-04-27T23:54:00Z'
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
