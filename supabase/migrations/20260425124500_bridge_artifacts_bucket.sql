/*
  # Bridge artifact storage bucket

  Public read is intentional for OTA/download artifacts because integrity is
  enforced by signed manifests and SHA-256 verification. The ESP and offline PC
  still resolve artifacts only through bridge update manifests.
*/

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'bridge-artifacts',
  'bridge-artifacts',
  true,
  104857600,
  ARRAY[
    'application/octet-stream',
    'application/zip',
    'application/json',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

