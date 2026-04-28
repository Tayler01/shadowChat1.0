/*
  # Publish ESP bridge Windows tools 0.1.23

  Same stable feed model as 0.1.22, plus a fallback id formatting fix for
  structured message frames that ever arrive without ids.
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
  '0.1.23-stable-feed',
  'supabase',
  'windows/0.1.23-stable-feed/shadowchat-bridge-tools.zip',
  '2f43ba85a575a4fc33810108b6e11f3c362f3d590684b4e3351fad926b20663d',
  'dev-unsigned-sha256-only',
  34913,
  'Use a deterministic timestamp-sorted message store for poll, realtime, sent, and history frames. Latest-poll reset frames no longer blank or replace the visible feed, stale delayed polls cannot take over the latest view, and idless fallback message keys are formatted correctly.',
  'published',
  '2026-04-28T03:55:00Z'
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
