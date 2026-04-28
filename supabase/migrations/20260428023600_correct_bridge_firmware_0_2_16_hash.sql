/*
  # Correct ESP bridge firmware 0.2.16 artifact hash

  The first 0.2.16 image was built with the old generated sdkconfig version
  stamp. This row points the manifest at the corrected 0.2.16 image.
*/

UPDATE public.bridge_update_manifests
SET artifact_sha256 = '9fc5bc691ae848d7cd7f15d661eea23cb34a8aaf5e487712a07b163d04b7408a',
    size_bytes = 1044528,
    release_notes = 'Add beforeMessageId history paging for group and DM polls, plus /history support in chat mode so the Windows TUI can lazy-load older messages as the user pages upward. Corrected image reports firmware version 0.2.16-history-paging.',
    published_at = '2026-04-28T02:36:00Z',
    revoked_at = NULL,
    status = 'published'
WHERE target = 'firmware'
  AND channel = 'stable'
  AND hardware_model = 'esp32-s3'
  AND version = '0.2.16-history-paging';
