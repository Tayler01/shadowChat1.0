/*
  # Publish ESP bridge Windows tools 0.1.12

  Renames TUI-facing transport wording to data-link language while preserving
  the underlying bridge protocol and firmware admin commands.
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
  '0.1.12-data-link-labels',
  'supabase',
  'windows/0.1.12-data-link-labels/shadowchat-bridge-tools.zip',
  'fb1d17e63719f3be0ae98c31160919be324b79184dd1c016f601eba5208d51e5',
  'dev-unsigned-sha256-only',
  30590,
  'Rename TUI-facing connectivity labels to data-link wording and translate raw bridge link status lines before display.',
  'published',
  '2026-04-27T10:57:00Z'
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
