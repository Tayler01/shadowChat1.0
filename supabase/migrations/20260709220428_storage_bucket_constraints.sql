/*
  Bound upload size and content type for the four original app buckets.

  The limits are above the verified largest production objects as of 2026-07-09:
  avatars 4.61 MiB, banners 18.89 MiB, message-media 0.78 MiB, and
  chat-uploads 50.66 MiB. Existing objects are not rewritten or removed.
*/

DO $$
DECLARE
  missing_buckets text[];
BEGIN
  SELECT array_agg(required.id ORDER BY required.id)
  INTO missing_buckets
  FROM (
    VALUES ('avatars'), ('banners'), ('chat-uploads'), ('message-media')
  ) AS required(id)
  LEFT JOIN storage.buckets bucket ON bucket.id = required.id
  WHERE bucket.id IS NULL;

  IF missing_buckets IS NOT NULL THEN
    RAISE EXCEPTION 'Required storage buckets are missing: %', array_to_string(missing_buckets, ', ');
  END IF;
END;
$$;

UPDATE storage.buckets
SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
WHERE id = 'avatars';

UPDATE storage.buckets
SET
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY[
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
WHERE id = 'banners';

UPDATE storage.buckets
SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
WHERE id = 'message-media';

UPDATE storage.buckets
SET
  file_size_limit = 67108864,
  allowed_mime_types = ARRAY[
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/svg+xml',
    'image/webp',
    'video/mp4',
    'video/mpeg',
    'video/ogg',
    'video/quicktime',
    'video/webm',
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'text/csv',
    'text/markdown',
    'text/plain',
    'application/json',
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
WHERE id = 'chat-uploads';
