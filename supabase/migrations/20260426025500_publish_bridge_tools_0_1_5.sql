/*
  # Publish deterministic ESP bridge Windows tools bundle 0.1.5

  This bundle includes the clearer first-plug documentation and is produced by
  the deterministic packer so repeated packs of the same source keep the same
  SHA-256.
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
  '0.1.5-tools',
  'supabase',
  'windows/0.1.5-tools/shadowchat-bridge-tools.zip',
  '6e3989d0f05e822b675092ab3b0f14bccc1a0ed38ef247640ab6e06659f4b066',
  'dev-unsigned-sha256-only',
  25825,
  'Bundle the clearer first-plug save-location documentation and deterministic package output.',
  'published',
  '2026-04-26T02:55:00Z'
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
