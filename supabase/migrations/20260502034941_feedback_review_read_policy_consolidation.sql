/*
  # Consolidate feedback read policies

  Keeps feedback review access read-only while combining user and operator
  SELECT checks into a single permissive policy for cleaner RLS evaluation.
*/

DROP POLICY IF EXISTS "Users can read their own feedback submissions" ON public.feedback_submissions;
DROP POLICY IF EXISTS "App operators can read feedback submissions" ON public.feedback_submissions;
DROP POLICY IF EXISTS "Users and operators can read feedback submissions" ON public.feedback_submissions;

CREATE POLICY "Users and operators can read feedback submissions"
ON public.feedback_submissions
FOR SELECT
TO authenticated
USING (
  (select auth.uid()) = user_id
  OR public.is_app_operator((select auth.uid()))
);

DROP POLICY IF EXISTS "Users can read their own feedback attachments" ON storage.objects;
DROP POLICY IF EXISTS "App operators can read feedback attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users and operators can read feedback attachments" ON storage.objects;

CREATE POLICY "Users and operators can read feedback attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'feedback-attachments'
  AND (
    (storage.foldername(name))[1] = ((select auth.uid())::text)
    OR public.is_app_operator((select auth.uid()))
  )
);
