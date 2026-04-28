/*
  # Publish ESP bridge firmware 0.2.16

  Adds chat history paging support for the bridge TUI /history path.
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
  '0.2.16-history-paging',
  'supabase',
  'firmware/esp32-s3/0.2.16-history-paging/shadowchat_bridge.bin',
  '7cba2c5f93634abbab6b1739542aa8b2c601da8789e391d96636417a0daaa656',
  'dev-unsigned-sha256-only',
  1044528,
  'Add beforeMessageId history paging for group and DM polls, plus /history support in chat mode so the Windows TUI can lazy-load older messages as the user pages upward.',
  'published',
  '2026-04-28T02:30:00Z'
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
