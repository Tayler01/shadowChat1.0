/*
  # Publish ESP bridge Windows tools 0.1.28

  Enlarges the serial read buffer so startup-history bursts can drain before
  PowerShell parses the structured protocol frames.
*/

UPDATE public.bridge_update_manifests
SET status = 'revoked',
    revoked_at = '2026-04-28T13:00:00Z'
WHERE target = 'windows_bundle'
  AND channel = 'stable'
  AND hardware_model = 'any'
  AND version = '0.1.27-decoder-sync';

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
  '0.1.28-read-buffer',
  'supabase',
  'windows/0.1.28-read-buffer/shadowchat-bridge-tools.zip',
  'dc49fa407a7fee3125a2c2bc144f396939465a19f80e2d2b0075757744896d3b',
  'dev-unsigned-sha256-only',
  37496,
  'Open the bridge serial port with a 64 KiB receive buffer while keeping the persistent UTF-8 decoder, so paced startup-history protocol bursts drain cleanly before JSON parsing.',
  'published',
  '2026-04-28T13:00:00Z'
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
