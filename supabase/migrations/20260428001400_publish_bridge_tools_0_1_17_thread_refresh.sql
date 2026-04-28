/*
  # Publish ESP bridge Windows tools 0.1.17

  Replaces visible thread windows on full latest refreshes.
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
  '0.1.17-thread-refresh',
  'supabase',
  'windows/0.1.17-thread-refresh/shadowchat-bridge-tools.zip',
  '4df5e9e37f9d6f9541c62ed3887a94abdc14f2acbe4c4b83dd5763c3f16eb03b',
  'dev-unsigned-sha256-only',
  31695,
  'Handle firmware latest-window reset events so full group and DM polls replace the visible thread instead of appending partial message slices.',
  'published',
  '2026-04-28T00:14:00Z'
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
