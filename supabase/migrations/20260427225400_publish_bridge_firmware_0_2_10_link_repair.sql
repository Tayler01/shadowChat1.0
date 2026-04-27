/*
  # Publish ESP bridge firmware 0.2.10 link repair

  Ships the link diagnostics work plus stale recovery-token fallback handling.
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
  '0.2.10-link-repair',
  'supabase',
  'firmware/esp32-s3/0.2.10-link-repair/shadowchat_bridge.bin',
  'c289c73ad3c88697bbd2f6b89ea36f348ae8fedfa2fb0ce8e1a726200f5a6895',
  'dev-unsigned-sha256-only',
  1043232,
  'Add named Wi-Fi disconnect diagnostics, reconnect-pausing scan support, WPA2/WPA3 transition compatibility hardening, and fresh-pairing fallback when stored bridge recovery is unavailable.',
  'published',
  '2026-04-27T22:54:00Z'
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
