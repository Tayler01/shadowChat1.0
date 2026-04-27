/*
  # Publish ESP bridge Windows tools 0.1.14

  Hardens TUI AI receive backfill and fixes short-history chat layout.
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
  '0.1.14-ai-backfill-layout',
  'supabase',
  'windows/0.1.14-ai-backfill-layout/shadowchat-bridge-tools.zip',
  '4acc39ccfd2d43ee5cb76a2d3cbb3d7f1d7bdaff55a1d32cf684cd54748fb757',
  'dev-unsigned-sha256-only',
  31275,
  'Add post-send fallback polling so delayed Shado AI replies backfill even when realtime is joined, bottom-align short chat history near the prompt, and suppress raw protocol parser noise.',
  'published',
  '2026-04-27T23:33:00Z'
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
