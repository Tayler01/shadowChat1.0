-- Storage upload now evaluates INSERT ... RETURNING against SELECT policies.
-- Keep public bucket listing closed while allowing an authenticated creator to
-- read only objects inside their own top-level folder. Known public object URLs
-- remain publicly retrievable through Storage's public object endpoint.

DROP POLICY IF EXISTS "Users can read their own shadow pin uploads"
  ON storage.objects;

CREATE POLICY "Users can read their own shadow pin uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'shadow-pin'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);
