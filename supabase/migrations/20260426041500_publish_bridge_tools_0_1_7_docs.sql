/*
  # Publish ESP bridge Windows tools bundle 0.1.7

  This documentation-only bundle clarifies that the default receiver output
  folder works with both local Windows Desktop folders and OneDrive-redirected
  Desktop folders.
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
  '0.1.7-tools',
  'supabase',
  'windows/0.1.7-tools/shadowchat-bridge-tools.zip',
  '30e80fd118bd9482d426bb754a0ca9373960d4343d4bf67c858648ae6ce72a84',
  'dev-unsigned-sha256-only',
  26133,
  'Clarify that the default Desktop download folder works with or without OneDrive Desktop redirection.',
  'published',
  '2026-04-26T04:15:00Z'
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
