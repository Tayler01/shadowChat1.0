/*
  # Publish ESP bridge Windows tools 0.1.11

  Ships the production-readiness pass for the PowerShell TUI:
  smoother input rendering, safer pane clipping, long-message wrapping
  regression coverage, and bridge-side @ai support documentation.
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
  '0.1.11-tui-smooth-ai',
  'supabase',
  'windows/0.1.11-tui-smooth-ai/shadowchat-bridge-tools.zip',
  '7485def9b4fbed2d86e2dc2ef53566250dd517f72eef135a0803d4e8eda69fff',
  'dev-unsigned-sha256-only',
  30124,
  'Improve TUI long-message wrapping, prevent side-pane spillover, reduce input repaint lag, and document group-chat @ai support through Shado.',
  'published',
  '2026-04-27T10:45:00Z'
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
