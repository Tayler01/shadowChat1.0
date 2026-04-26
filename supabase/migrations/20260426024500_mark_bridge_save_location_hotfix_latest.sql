/*
  # Mark the save-location hotfix as the newest bridge release

  Some older firmware manifests were backfilled after the hotfix insert and
  therefore received a later published_at value. Pin both hotfix manifests to
  a later publish time so stable update checks select them.
*/

UPDATE public.bridge_update_manifests
SET published_at = '2026-04-26T02:45:00Z'
WHERE (target = 'windows_bundle' AND channel = 'stable' AND hardware_model = 'any' AND version = '0.1.4-tools')
   OR (target = 'firmware' AND channel = 'stable' AND hardware_model = 'esp32-s3' AND version = '0.2.3-bootstrap-save-location');
