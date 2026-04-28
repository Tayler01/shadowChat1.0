/*
  # Publish ESP bridge Windows tools 0.1.16

  Foreground test polish for header visibility and terminal contrast.
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
  '0.1.16-foreground-polish',
  'supabase',
  'windows/0.1.16-foreground-polish/shadowchat-bridge-tools.zip',
  '6a950edd5bf86b1c2379bede736ac6175ebd4474065a2c2098c53d6b46ab17ee',
  'dev-unsigned-sha256-only',
  31572,
  'Move the running tools version and date to the front of the header, keep the sidebar version visible, write terminal cells with a black background for stronger contrast, and continue suppressing low-level realtime noise.',
  'published',
  '2026-04-27T23:59:00Z'
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
