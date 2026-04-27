/*
  # Publish ESP bridge Windows tools 0.1.13

  Fixes a PowerShell strict-mode crash in the two-pane TUI layout.
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
  '0.1.13-two-pane-render-fix',
  'supabase',
  'windows/0.1.13-two-pane-render-fix/shadowchat-bridge-tools.zip',
  '197f0ba1adab2608875b3fd95e664052ec4d550859879487f09e73a037463abd',
  'dev-unsigned-sha256-only',
  30975,
  'Fix a strict-mode startup crash in two-pane terminal widths by keeping disabled sidebar output array-shaped.',
  'published',
  '2026-04-27T23:13:00Z'
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
