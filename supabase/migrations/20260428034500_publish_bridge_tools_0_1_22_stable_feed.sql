/*
  # Publish ESP bridge Windows tools 0.1.22

  Replaces fragile latest-poll screen replacement with a deterministic message
  store so delayed poll/reset frames cannot make the TUI jump back to random
  older messages after startup.
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
  '0.1.22-stable-feed',
  'supabase',
  'windows/0.1.22-stable-feed/shadowchat-bridge-tools.zip',
  'f4cb8d295a832ac1d343eb7c8c0e3094c2ae92149cfa80a8dd1b453982784641',
  'dev-unsigned-sha256-only',
  34909,
  'Use a deterministic timestamp-sorted message store for poll, realtime, sent, and history frames. Latest-poll reset frames no longer blank or replace the visible feed, stale delayed polls cannot take over the latest view, and a small admin-command runner supports repeatable bridge release checks.',
  'published',
  '2026-04-28T03:45:00Z'
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
