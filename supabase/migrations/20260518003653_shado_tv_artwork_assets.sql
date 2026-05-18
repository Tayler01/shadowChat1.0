/*
  # Shado TV artwork assets

  Adds authenticated, operator-managed artwork storage for Shado TV channels
  and videos. Objects stay in a private bucket, while the app delivers signed
  transformed URLs for mobile-friendly ticket, hero, poster, and thumbnail
  renders.
*/

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'shado-tv',
  'shado-tv',
  false,
  15728640,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.shado_tv_channels
  ADD COLUMN IF NOT EXISTS ticket_asset_path text,
  ADD COLUMN IF NOT EXISTS hero_asset_path text;

ALTER TABLE public.shado_tv_videos
  ADD COLUMN IF NOT EXISTS poster_asset_path text,
  ADD COLUMN IF NOT EXISTS thumbnail_asset_path text;

CREATE INDEX IF NOT EXISTS shado_tv_channels_artwork_path_idx
  ON public.shado_tv_channels (ticket_asset_path, hero_asset_path)
  WHERE ticket_asset_path IS NOT NULL OR hero_asset_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS shado_tv_videos_artwork_path_idx
  ON public.shado_tv_videos (poster_asset_path, thumbnail_asset_path)
  WHERE poster_asset_path IS NOT NULL OR thumbnail_asset_path IS NOT NULL;

DROP POLICY IF EXISTS "Authenticated users can read Shado TV artwork" ON storage.objects;
DROP POLICY IF EXISTS "Operators can upload Shado TV artwork" ON storage.objects;
DROP POLICY IF EXISTS "Operators can update Shado TV artwork" ON storage.objects;
DROP POLICY IF EXISTS "Operators can delete Shado TV artwork" ON storage.objects;

CREATE POLICY "Authenticated users can read Shado TV artwork"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'shado-tv');

CREATE POLICY "Operators can upload Shado TV artwork"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shado-tv'
  AND public.is_app_operator((select auth.uid()))
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "Operators can update Shado TV artwork"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'shado-tv'
  AND public.is_app_operator((select auth.uid()))
)
WITH CHECK (
  bucket_id = 'shado-tv'
  AND public.is_app_operator((select auth.uid()))
);

CREATE POLICY "Operators can delete Shado TV artwork"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'shado-tv'
  AND public.is_app_operator((select auth.uid()))
);
