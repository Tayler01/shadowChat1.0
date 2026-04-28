/*
  # Publish ESP bridge Windows tools 0.1.27

  Reads serial bytes through a persistent UTF-8 decoder so chunked bridge
  protocol frames containing emoji or other multibyte text parse reliably.
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
  '0.1.27-decoder-sync',
  'supabase',
  'windows/0.1.27-decoder-sync/shadowchat-bridge-tools.zip',
  'c9a5fd2dd77545844a308663f4d24514338826e8e023e6b0648ead5671b2ff09',
  'dev-unsigned-sha256-only',
  37418,
  'Decode bridge serial input from bytes with a persistent UTF-8 decoder so chunked messagesBatch frames with emoji and long text are reconstructed before JSON parsing.',
  'published',
  '2026-04-28T12:35:00Z'
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
