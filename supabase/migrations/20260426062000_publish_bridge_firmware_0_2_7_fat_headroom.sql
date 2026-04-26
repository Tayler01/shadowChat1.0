/*
  # Publish ESP bridge firmware 0.2.7

  Marks the corrected full-flash partition layout build as current. The app
  still fits older OTA slots, but the `usb_boot` FAT partition sizing fix only
  takes effect after a manual full flash that writes the partition table.
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
  '0.2.7-fat-headroom',
  'supabase',
  'firmware/esp32-s3/0.2.7-fat-headroom/shadowchat_bridge.bin',
  'c246e2cb573d3aa82129c0738b9065151ff14f27081fd81fb2131f718d586f24',
  'dev-unsigned-sha256-only',
  1040160,
  'Correct the full-flash layout to keep larger app slots while giving usb_boot enough FAT/wear-leveling space.',
  'published',
  '2026-04-26T06:20:00Z'
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
