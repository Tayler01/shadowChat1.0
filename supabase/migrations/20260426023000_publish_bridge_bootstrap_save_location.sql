/*
  # Publish ESP bridge save-location hotfix artifacts

  These manifests point ESP bridge update checks at artifacts that make the
  first-plug Windows bootstrap save to the real Desktop\ShadowChatBridge folder
  and open File Explorer when the ZIP download is complete.
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
VALUES
  (
    'windows_bundle',
    'stable',
    'any',
    '0.1.4-tools',
    'supabase',
    'windows/0.1.4-tools/shadowchat-bridge-tools.zip',
    '470d1b15b4fd8373ea4e1eb9e6b81a388fedaa64da81135970bbad8dca31cde8',
    'dev-unsigned-sha256-only',
    25729,
    'Make bootstrap receiver print the exact save folder, use the real Windows Desktop, and open File Explorer on completion.',
    'published',
    '2026-04-26T02:30:00Z'
  ),
  (
    'firmware',
    'stable',
    'esp32-s3',
    '0.2.3-bootstrap-save-location',
    'supabase',
    'firmware/esp32-s3/0.2.3-bootstrap-save-location/shadowchat_bridge.bin',
    'f087e4293775f747b57dd0cfb927c785e66d001ee06550f6c96945aca358d2eb',
    'dev-unsigned-sha256-only',
    1140064,
    'Embed the clearer first-plug receiver that saves to Desktop\ShadowChatBridge and opens File Explorer after download.',
    'published',
    '2026-04-26T02:31:00Z'
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
