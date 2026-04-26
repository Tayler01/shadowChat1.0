/*
  # Publish ESP bridge Windows tools bundle 0.1.9

  Keeps the 0.1.8 launcher and help improvements, and fixes receiver output
  path handling for directory names that contain dots.
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
  '0.1.9-tools',
  'supabase',
  'windows/0.1.9-tools/shadowchat-bridge-tools.zip',
  '5d123df78cc10faec0bed5db1f5a903be6d741fc2d77353804a0b114561bbccd',
  'dev-unsigned-sha256-only',
  29048,
  'Fix receiver output handling for folder names that contain dots while keeping auto-detect and launcher improvements.',
  'published',
  '2026-04-26T05:20:00Z'
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
