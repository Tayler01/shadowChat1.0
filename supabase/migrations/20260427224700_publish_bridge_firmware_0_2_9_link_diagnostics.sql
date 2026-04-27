/*
  # Publish ESP bridge firmware 0.2.9 link diagnostics

  Ships firmware-side diagnostics and compatibility hardening for data-link
  setup failures.
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
  '0.2.9-link-diagnostics',
  'supabase',
  'firmware/esp32-s3/0.2.9-link-diagnostics/shadowchat_bridge.bin',
  'e6c30fcf9bde10b0cb8565055d810c8f96d774e1cb6a595bb5dd53de692a87a6',
  'dev-unsigned-sha256-only',
  1042960,
  'Add named Wi-Fi disconnect diagnostics, a reconnect-pausing wifi disconnect command, safe scanning while setup is failing, and WPA2/WPA3 transition compatibility hardening.',
  'published',
  '2026-04-27T22:47:00Z'
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
