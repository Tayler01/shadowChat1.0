/*
  # Publish ESP bridge firmware space-headroom build

  This release enables size optimization so current devices can gain immediate
  app-slot breathing room through OTA. The resized partition table in the repo
  takes effect on the next full flash that includes the partition table.
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
  '0.2.5-space-headroom',
  'supabase',
  'firmware/esp32-s3/0.2.5-space-headroom/shadowchat_bridge.bin',
  '760e3a7ad8932beb00b014f49f95753388b92b7ff389b81cd796391d3aa01996',
  'dev-unsigned-sha256-only',
  1039168,
  'Enable size optimization and prepare the smaller usb_boot/larger app-slot partition layout.',
  'published',
  '2026-04-26T03:30:00Z'
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
