-- Storage buckets for user avatars and banners
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('banners', 'banners', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Remove existing policies if they exist to avoid duplicates
DROP POLICY IF EXISTS "Avatars bucket read" ON storage.objects;
DROP POLICY IF EXISTS "Avatars bucket write" ON storage.objects;
DROP POLICY IF EXISTS "Banners bucket read" ON storage.objects;
DROP POLICY IF EXISTS "Banners bucket write" ON storage.objects;

-- Allow public read access to avatar and banner images
CREATE POLICY "Avatars bucket read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Banners bucket read" ON storage.objects
  FOR SELECT USING (bucket_id = 'banners');

-- Allow authenticated users to manage their own avatar files
CREATE POLICY "Avatars bucket write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid() = owner)
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() = owner);

-- Allow authenticated users to manage their own banner files
CREATE POLICY "Banners bucket write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'banners' AND auth.uid() = owner)
  WITH CHECK (bucket_id = 'banners' AND auth.uid() = owner);
