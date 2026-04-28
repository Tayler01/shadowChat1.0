/*
  # Publish ESP bridge Windows tools 0.1.18

  Uses stable serial control-line settings and recognizes protocol health in smoke checks.
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
  '0.1.18-serial-stability',
  'supabase',
  'windows/0.1.18-serial-stability/shadowchat-bridge-tools.zip',
  'b0dd0addaa1ed7ec38d2e89abd0d31e6f4224a4c806d255ce97e78554ff1b5b4',
  'dev-unsigned-sha256-only',
  31764,
  'Open the bridge serial port with DTR/RTS enabled, expose the new version/date, and allow smoke checks to pass from structured health events when textual status is suppressed.',
  'published',
  '2026-04-28T00:40:00Z'
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
