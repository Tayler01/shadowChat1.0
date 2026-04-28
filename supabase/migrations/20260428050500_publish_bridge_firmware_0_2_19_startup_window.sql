/*
  # Publish ESP bridge firmware 0.2.19

  Same startup-window behavior as 0.2.18, rebuilt with the active sdkconfig
  version aligned so the running device reports the published firmware label.
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
  '0.2.19-startup-window',
  'supabase',
  'firmware/esp32-s3/0.2.19-startup-window/shadowchat_bridge.bin',
  '39948ba5096da128454bc974932f43acb22f744a2fc45c2df4732c129e7d82d3',
  'dev-unsigned-sha256-only',
  1044672,
  'Load up to 30 latest group or DM rows during chat startup and manual refresh while preserving ten-row incremental repair and history pages. Rebuilt with active sdkconfig aligned so status reports the published firmware version.',
  'published',
  '2026-04-28T05:05:00Z'
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
