/*
  # Publish ESP bridge P0 DM routing fixes

  Ships the firmware protocol source metadata used by the TUI to route
  realtime DMs safely, plus the matching Windows tools bundle.
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
  'firmware',
  'stable',
  'esp32-s3',
  '0.2.8-p0-dm-routing',
  'supabase',
  'firmware/esp32-s3/0.2.8-p0-dm-routing/shadowchat_bridge.bin',
  '26338923502b1bcbfb78220d368208409bf26cf53d7c8e6b4706f97e16d568b6',
  'dev-unsigned-sha256-only',
  1040176,
  'Add protocol message source metadata so the Windows TUI can keep unrelated realtime DMs out of the active thread.',
  'published',
  '2026-04-26T14:45:00Z'
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
  '0.1.10-tui-dm-routing',
  'supabase',
  'windows/0.1.10-tui-dm-routing/shadowchat-bridge-tools.zip',
  '27d0e43fd7b85c2a68f2653db494ccd1f81f1222db8733b898c737908bd32545',
  'dev-unsigned-sha256-only',
  29470,
  'Route realtime DMs by active conversation, document COM-port auto-detection, and include the ESP bridge release runbook.',
  'published',
  '2026-04-26T14:45:00Z'
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
