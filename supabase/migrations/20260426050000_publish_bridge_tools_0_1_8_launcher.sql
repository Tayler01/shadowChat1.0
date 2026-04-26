/*
  # Publish ESP bridge Windows tools bundle 0.1.8

  Adds auto-detect to the repo-side bundle receiver, includes a double-click
  chat launcher, and expands the bundled help text for offline Windows PCs.
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
  '0.1.8-tools',
  'supabase',
  'windows/0.1.8-tools/shadowchat-bridge-tools.zip',
  '86288bae0fad9fa42575a5fa62f39c82d50a78787e4e4daad2884c0ccaf13a7d',
  'dev-unsigned-sha256-only',
  28972,
  'Add auto-detecting Windows bundle receiver, double-click chat launcher, and expanded offline help.',
  'published',
  '2026-04-26T05:00:00Z'
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
