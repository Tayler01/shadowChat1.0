/*
  # Publish ESP bridge bootstrap admin-recovery hotfix

  The first-plug receiver now sends /admin before probing or requesting the
  bundle, so it can recover when the bridge was left in chat mode.
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
    '0.1.6-tools',
    'supabase',
    'windows/0.1.6-tools/shadowchat-bridge-tools.zip',
    '6ca4906698157d0d50b94de5327651b9737a03217638fdef37d8c20f6705085e',
    'dev-unsigned-sha256-only',
    25842,
    'Make the first-plug receiver force admin mode before probing and bundle transfer.',
    'published',
    '2026-04-26T03:05:00Z'
  ),
  (
    'firmware',
    'stable',
    'esp32-s3',
    '0.2.4-bootstrap-admin-recover',
    'supabase',
    'firmware/esp32-s3/0.2.4-bootstrap-admin-recover/shadowchat_bridge.bin',
    '05603470929b57b4210ea6e316026cdf72e4d4e6fba457aa66d7719d27890582',
    'dev-unsigned-sha256-only',
    1140176,
    'Embed the first-plug receiver admin-mode recovery hardening.',
    'published',
    '2026-04-26T03:05:00Z'
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
