/*
  # Publish ESP bridge Windows tools 0.1.24

  Startup sync hardening for deterministic first-load message rendering.
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
  '0.1.24-startup-sync',
  'supabase',
  'windows/0.1.24-startup-sync/shadowchat-bridge-tools.zip',
  'd100991d94ec31a3bc09485eea27053bb6ef57d69b1f19a2c83ce59951a357cc',
  'dev-unsigned-sha256-only',
  35699,
  'Wait for the first latest-window sync before marking the group or DM feed live, suppress fallback backfill during startup sync, keep visible rows stable while poll/realtime frames settle, and preserve longer admin waits for OTA and bundle transfer commands.',
  'published',
  '2026-04-28T04:25:00Z'
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
